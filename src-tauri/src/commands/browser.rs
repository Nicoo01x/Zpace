//! Embedded browser panes: a native child webview (WebView2 / WKWebView)
//! positioned over the pane area. Navigation state is reported back to the
//! frontend through `browser://navigated` and `browser://title` events.
//!
//! Requires the `unstable` feature of tauri (multi-webview windows).
//! Commands are async on purpose: synchronous commands run on the main thread
//! and window operations such as `add_child` would deadlock waiting for it.

use serde::{Deserialize, Serialize};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

#[derive(Serialize, Clone)]
struct NavPayload {
    label: String,
    url: String,
}

#[derive(Serialize, Clone)]
struct TitlePayload {
    label: String,
    title: String,
}

#[derive(Serialize, Clone)]
struct LoadingPayload {
    label: String,
    loading: bool,
}

#[derive(Serialize, Clone)]
struct KeyPayload {
    label: String,
    key: String,
    code: String,
    shift: bool,
    alt: bool,
}

/// Title-change marker the page script uses to hand a key press to the host.
const KEY_MARK: &str = "\u{200b}conduit-key:";
/// Same channel for data a page script extracts (the engine's AI answer).
const DATA_MARK: &str = "\u{200b}conduit-data:";

#[derive(Serialize, Clone)]
struct DataPayload {
    label: String,
    json: String,
}

/// Runs in every page of a child webview: the app's own shortcuts (Ctrl+Space,
/// Ctrl+K, Ctrl+B…) never reach the host's DOM while the page has keyboard
/// focus, so they are caught here and passed along through a title change
/// (the one channel a remote page has without IPC). The title is restored at
/// once. Escape is forwarded only from the Spotlight answer webview.
fn key_forward_script(label: &str) -> String {
    format!(
        r#"(() => {{
  if (window.__conduitKeys) return;
  window.__conduitKeys = true;
  const spot = {spot};
  const isApp = (e, key) => {{
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return spot && key === 'escape' && !e.shiftKey && !e.altKey;
    if (e.shiftKey) return ['p', 'f', 'e', 'g', 't', 'n', 's'].includes(key);
    return ['space', 'k', 'b', 'p', 'o', 'n', 'w', ',', '`', 'tab'].includes(key);
  }};
  let last = 0;
  window.addEventListener('keydown', (e) => {{
    const key = e.key === ' ' ? 'space' : String(e.key).toLowerCase();
    if (!isApp(e, key)) return;
    e.preventDefault();
    e.stopPropagation();
    // The same press can reach this listener twice (repeat, nested frames): one hand-off per 150 ms.
    if (e.__conduit || Date.now() - last < 150) return;
    e.__conduit = true;
    last = Date.now();
    const prev = document.title.startsWith('{mark}') ? (window.__conduitTitle ?? '') : document.title;
    window.__conduitTitle = prev;
    document.title = '{mark}' + JSON.stringify({{ key, code: e.code, shift: !!e.shiftKey, alt: !!e.altKey, t: Date.now() }});
    setTimeout(() => {{ if (document.title.startsWith('{mark}')) document.title = prev; }}, 160);
  }}, true);
}})();"#,
        spot = if label.starts_with("spotlight") { "true" } else { "false" },
        mark = "\\u200bconduit-key:",
    )
}

#[tauri::command]
pub async fn browser_open(app: AppHandle, label: String, url: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    if app.get_webview(&label).is_some() {
        return Ok(());
    }
    let window = app.get_window("main").ok_or("main window not found")?;
    let parsed: tauri::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let l1 = label.clone();
    let l2 = label.clone();
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed))
        .on_page_load(move |webview, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            let _ = webview.app_handle().emit("browser://loading", LoadingPayload { label: l1.clone(), loading });
            let _ = webview
                .app_handle()
                .emit("browser://navigated", NavPayload { label: l1.clone(), url: payload.url().to_string() });
        })
        .on_document_title_changed(move |webview, title| {
            if let Some(json) = title.strip_prefix(DATA_MARK) {
                let _ = webview.app_handle().emit("browser://data", DataPayload { label: l2.clone(), json: json.to_string() });
                return;
            }
            if let Some(json) = title.strip_prefix(KEY_MARK) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
                    let payload = KeyPayload {
                        label: l2.clone(),
                        key: v.get("key").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
                        code: v.get("code").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
                        shift: v.get("shift").and_then(|x| x.as_bool()).unwrap_or(false),
                        alt: v.get("alt").and_then(|x| x.as_bool()).unwrap_or(false),
                    };
                    // The host takes the keyboard back so the palette / Spotlight can be typed into.
                    if let Some(main) = webview.app_handle().get_webview("main") {
                        let _ = main.set_focus();
                    }
                    let _ = webview.app_handle().emit("browser://key", payload);
                }
                return;
            }
            let _ = webview.app_handle().emit("browser://title", TitlePayload { label: l2.clone(), title });
        })
        .initialization_script(&key_forward_script(&label))
        .auto_resize();

    let webview = window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    // Logins survive: WebView2 ships with password autosave off; turn it (and address / form autofill) on,
    // so the browser pane offers to remember credentials like Edge does. Cookies already persist in the
    // app's profile.
    #[cfg(windows)]
    {
        let _ = webview.with_webview(|platform| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4;
            use windows_core::Interface;
            let Ok(core) = platform.controller().CoreWebView2() else { return };
            let Ok(settings) = core.Settings() else { return };
            if let Ok(s4) = settings.cast::<ICoreWebView2Settings4>() {
                let _ = s4.SetIsPasswordAutosaveEnabled(true);
                let _ = s4.SetIsGeneralAutofillEnabled(true);
            }
        });
    }
    #[cfg(not(windows))]
    let _ = &webview;
    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    let parsed: tauri::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    wv.navigate(parsed).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_eval(app: AppHandle, label: String, js: String) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    wv.eval(&js).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_set_bounds(app: AppHandle, label: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    wv.set_size(LogicalSize::new(width.max(1.0), height.max(1.0))).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_set_visible(app: AppHandle, label: String, visible: bool) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    if visible {
        wv.show().map_err(|e| e.to_string())
    } else {
        wv.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn browser_close(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_url(app: AppHandle, label: String) -> Result<String, String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    wv.url().map(|u| u.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_zoom(app: AppHandle, label: String, factor: f64) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    wv.set_zoom(factor).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_devtools(app: AppHandle) {
    if let Some(wv) = app.get_webview_window("main") {
        wv.open_devtools();
    }
}

/// DevTools for a child webview (a plugin's device preview).
#[tauri::command]
pub async fn browser_devtools(app: AppHandle, label: String) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    wv.open_devtools();
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Device preview: a shaped, emulated child webview for plugins         */
/* ------------------------------------------------------------------ */

/// A cut-out of the webview's shape, logical px from its top-left corner.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Hole {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub radius: f64,
}

/// Clip the webview to a rounded rectangle minus holes (a phone screen: its
/// corners, the island or the notch, the home indicator). Windows only: the
/// region goes on wry's container window (`WRY_WEBVIEW`), which clips the
/// WebView2 inside it; the page underneath shows through the holes. Resolves
/// false where shapes are not supported so the caller can draw a flat screen.
#[tauri::command]
pub async fn browser_set_shape(app: AppHandle, label: String, width: f64, height: f64, radius: f64, holes: Vec<Hole>) -> Result<bool, String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    #[cfg(windows)]
    {
        let scale = wv.window().scale_factor().map_err(|e| e.to_string())?;
        let clear = radius <= 0.0 && holes.is_empty();
        wv.with_webview(move |platform| unsafe {
            use windows::Win32::Foundation::HWND;
            use windows::Win32::Graphics::Gdi::{CombineRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn, RGN_DIFF};
            let mut hwnd = HWND::default();
            if platform.controller().ParentWindow(&mut hwnd).is_err() || hwnd.is_invalid() {
                return;
            }
            if clear {
                let _ = SetWindowRgn(hwnd, None, true);
                return;
            }
            let px = |v: f64| (v * scale).round() as i32;
            let rgn = CreateRoundRectRgn(0, 0, px(width), px(height), px(radius * 2.0), px(radius * 2.0));
            for h in &holes {
                let hole = CreateRoundRectRgn(px(h.x), px(h.y), px(h.x + h.width), px(h.y + h.height), px(h.radius * 2.0), px(h.radius * 2.0));
                let _ = CombineRgn(Some(rgn), Some(rgn), Some(hole), RGN_DIFF);
                let _ = DeleteObject(hole.into());
            }
            // The window owns the region from here on.
            let _ = SetWindowRgn(hwnd, Some(rgn), true);
        })
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        let _ = (wv, width, height, radius, holes);
        Ok(false)
    }
}

/// What a device preview asks the page engine to pretend — the same calls
/// Chrome's device mode makes over the DevTools protocol.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Emulation {
    /// CSS px of the viewport; 0 derives it from the bounds and the scale, as device mode does.
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    /// What `screen.width` / `screen.height` report; 0 leaves them to the viewport.
    #[serde(default)]
    pub screen_width: u32,
    #[serde(default)]
    pub screen_height: u32,
    /// Keep the view at its own size while `width`/`height` set the layout viewport — device mode's way of
    /// drawing a fixed viewport scaled into whatever room it has.
    #[serde(default)]
    pub keep_view_size: bool,
    pub device_scale_factor: f64,
    pub mobile: bool,
    pub touch: bool,
    #[serde(default)]
    pub user_agent: String,
    /// `navigator.platform` to report ("iPhone", "Linux armv8l"); empty leaves it.
    #[serde(default)]
    pub platform: String,
    /// Client hints (`Sec-CH-UA-*`) for the override, as the protocol takes them.
    #[serde(default)]
    pub user_agent_metadata: Option<serde_json::Value>,
    /// "light" | "dark" | "" (no override).
    #[serde(default)]
    pub color_scheme: String,
    /// Draw the emulated viewport at this factor — device mode's own zoom, since a mobile page ignores the
    /// browser's; 0 or 1 leaves it.
    #[serde(default)]
    pub scale: f64,
}

/// The user agent each child webview shipped with, kept so the override can be undone.
#[cfg(windows)]
static DEFAULT_UA: std::sync::Mutex<Option<std::collections::HashMap<String, String>>> = std::sync::Mutex::new(None);

/// Emulate a device in a child webview (viewport, pixel ratio, mobile
/// viewport meta, touch, user agent, colour scheme) — or undo it all with
/// `None`. Windows only (WebView2 exposes the DevTools protocol); resolves
/// false elsewhere, where the page simply renders at the given size.
#[tauri::command]
pub async fn browser_emulate(app: AppHandle, label: String, emulation: Option<Emulation>) -> Result<bool, String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    #[cfg(windows)]
    {
        let key = label.clone();
        wv.with_webview(move |platform| unsafe {
            use serde_json::json;
            use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings2;
            use windows_core::{Interface, HSTRING};
            let Ok(core) = platform.controller().CoreWebView2() else { return };
            let call = |method: &str, params: serde_json::Value| {
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(())));
                let _ = core.CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params.to_string()), &handler);
            };
            let settings = core.Settings().ok().and_then(|s| s.cast::<ICoreWebView2Settings2>().ok());
            let mut defaults = DEFAULT_UA.lock().unwrap_or_else(|p| p.into_inner());
            let defaults = defaults.get_or_insert_with(Default::default);
            match emulation {
                Some(e) => {
                    let mut metrics = json!({ "width": e.width, "height": e.height, "deviceScaleFactor": e.device_scale_factor, "mobile": e.mobile, "dontSetVisibleSize": e.keep_view_size });
                    if e.scale > 0.0 && (e.scale - 1.0).abs() > f64::EPSILON {
                        metrics["scale"] = json!(e.scale);
                    }
                    if e.screen_width > 0 && e.screen_height > 0 {
                        metrics["screenWidth"] = json!(e.screen_width);
                        metrics["screenHeight"] = json!(e.screen_height);
                    }
                    call("Emulation.setDeviceMetricsOverride", metrics);
                    call("Emulation.setTouchEmulationEnabled", json!({ "enabled": e.touch, "maxTouchPoints": 5 }));
                    call("Emulation.setEmitTouchEventsForMouse", json!({ "enabled": e.touch, "configuration": if e.mobile { "mobile" } else { "desktop" } }));
                    if !e.user_agent.is_empty() {
                        // The settings' user agent is what new documents and requests get; it goes first because
                        // WebView2 applies it as a protocol override of its own, which would undo the platform below.
                        if let Some(s2) = &settings {
                            if !defaults.contains_key(&key) {
                                let mut cur = windows_core::PWSTR::null();
                                if s2.UserAgent(&mut cur).is_ok() && !cur.is_null() {
                                    defaults.insert(key.clone(), cur.to_string().unwrap_or_default());
                                    windows::Win32::System::Com::CoTaskMemFree(Some(cur.0 as _));
                                }
                            }
                            let _ = s2.SetUserAgent(&HSTRING::from(e.user_agent.as_str()));
                        }
                        let mut ua = json!({ "userAgent": e.user_agent });
                        if !e.platform.is_empty() {
                            ua["platform"] = json!(e.platform);
                        }
                        if let Some(meta) = e.user_agent_metadata.clone() {
                            ua["userAgentMetadata"] = meta;
                        }
                        call("Emulation.setUserAgentOverride", ua);
                    }
                    let features = if e.color_scheme.is_empty() { json!([]) } else { json!([{ "name": "prefers-color-scheme", "value": e.color_scheme }]) };
                    call("Emulation.setEmulatedMedia", json!({ "features": features }));
                }
                None => {
                    call("Emulation.clearDeviceMetricsOverride", json!({}));
                    call("Emulation.setTouchEmulationEnabled", json!({ "enabled": false }));
                    call("Emulation.setEmitTouchEventsForMouse", json!({ "enabled": false }));
                    call("Emulation.setUserAgentOverride", json!({ "userAgent": "" }));
                    call("Emulation.setEmulatedMedia", json!({ "features": [] }));
                    if let (Some(s2), Some(ua)) = (&settings, defaults.get(&key)) {
                        let _ = s2.SetUserAgent(&HSTRING::from(ua.as_str()));
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        let _ = (wv, emulation);
        Ok(false)
    }
}

/// One DevTools protocol call on a child webview (`Emulation.*`, `Network.*`…):
/// what a device preview uses for everything beyond the basics — reduced
/// motion, vision deficiencies, network conditions, locale, geolocation.
/// Resolves with the method's result. Windows only.
#[tauri::command]
pub async fn browser_cdp(app: AppHandle, label: String, method: String, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    #[cfg(windows)]
    {
        let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
        wv.with_webview(move |platform| unsafe {
            use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
            use windows_core::HSTRING;
            let Ok(core) = platform.controller().CoreWebView2() else {
                let _ = tx.send(Err("webview not ready".into()));
                return;
            };
            let sent = tx.clone();
            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |hr, json| {
                let _ = sent.send(hr.map(|_| json).map_err(|e| e.message()));
                Ok(())
            }));
            if let Err(e) = core.CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params.to_string()), &handler) {
                let _ = tx.send(Err(e.message()));
            }
        })
        .map_err(|e| e.to_string())?;
        let json = rx.recv_timeout(std::time::Duration::from_secs(5)).map_err(|_| "protocol call timed out".to_string())??;
        Ok(serde_json::from_str(&json).unwrap_or(serde_json::Value::Null))
    }
    #[cfg(not(windows))]
    {
        let _ = (wv, method, params);
        Err("protocol access unsupported".into())
    }
}

/// A PNG of what the child webview shows right now, base64 — the still a
/// device preview shows while it is being dragged. Windows only (WebView2's
/// `CapturePreview`); elsewhere the caller falls back to a screen grab.
#[tauri::command]
pub async fn browser_snapshot(app: AppHandle, label: String) -> Result<String, String> {
    let wv = app.get_webview(&label).ok_or("browser not found")?;
    #[cfg(windows)]
    {
        let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
        wv.with_webview(move |platform| unsafe {
            use webview2_com::CapturePreviewCompletedHandler;
            use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
            use windows::Win32::UI::Shell::SHCreateMemStream;
            let Ok(core) = platform.controller().CoreWebView2() else {
                let _ = tx.send(Err("webview not ready".into()));
                return;
            };
            let Some(stream) = SHCreateMemStream(None) else {
                let _ = tx.send(Err("no memory stream".into()));
                return;
            };
            let done = stream.clone();
            let sent = tx.clone();
            let handler = CapturePreviewCompletedHandler::create(Box::new(move |hr| {
                let _ = sent.send(hr.map_err(|e| e.message()).and_then(|_| read_stream(&done)));
                Ok(())
            }));
            if let Err(e) = core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, &stream, &handler) {
                let _ = tx.send(Err(e.message()));
            }
        })
        .map_err(|e| e.to_string())?;
        // a hidden webview never answers: the caller is told quickly instead of waiting
        rx.recv_timeout(std::time::Duration::from_millis(1500)).map_err(|_| "snapshot timed out".to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = wv;
        Err("snapshot unsupported".into())
    }
}

/// Everything in a COM stream, from the start, as base64.
#[cfg(windows)]
fn read_stream(stream: &windows::Win32::System::Com::IStream) -> Result<String, String> {
    use base64::Engine;
    use windows::Win32::System::Com::STREAM_SEEK_SET;
    let mut out: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 64 * 1024];
    unsafe {
        stream.Seek(0, STREAM_SEEK_SET, None).map_err(|e| e.message())?;
        loop {
            let mut read: u32 = 0;
            let hr = stream.Read(chunk.as_mut_ptr() as _, chunk.len() as u32, Some(&mut read));
            if hr.is_err() && read == 0 {
                return Err(hr.message());
            }
            if read == 0 {
                break;
            }
            out.extend_from_slice(&chunk[..read as usize]);
        }
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

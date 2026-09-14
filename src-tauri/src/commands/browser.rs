//! Embedded browser panes: a native child webview (WebView2 / WKWebView)
//! positioned over the pane area. Navigation state is reported back to the
//! frontend through `browser://navigated` and `browser://title` events.
//!
//! Requires the `unstable` feature of tauri (multi-webview windows).
//! Commands are async on purpose: synchronous commands run on the main thread
//! and window operations such as `add_child` would deadlock waiting for it.

use serde::Serialize;
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

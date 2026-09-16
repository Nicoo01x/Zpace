//! Windows, seen from the desktop island: what is playing, the toasts in the
//! Action Center, the app that just came to the front, the volume, the
//! battery and the clipboard. Each source is a thread the island switches on
//! and off (`desktop_watch`) and that emits to the island window only when
//! something changed — nothing polls from the webview, and nothing runs while
//! the island is off. Every source is event-driven where Windows offers an
//! event (media session, volume, foreground, clipboard); the notification
//! listener has no reliable event for desktop apps and is read every 1.5 s.
//! On other platforms every command is a no-op.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

struct Watcher {
    stop: Arc<AtomicBool>,
    /// Wakes the thread so it notices `stop`.
    wake: Sender<()>,
    /// Threads that pump a message loop are ended with WM_QUIT.
    pump: Option<u32>,
}

#[derive(Default)]
pub struct DesktopState(Mutex<HashMap<String, Watcher>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WinNotification {
    pub id: u32,
    pub app: String,
    pub app_id: String,
    pub title: String,
    pub body: String,
    /// Unix ms.
    pub at: i64,
    /// The app's logo as a data URL, when Windows has one.
    pub logo: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WinNotificationsDelta {
    pub added: Vec<WinNotification>,
    pub removed: Vec<u32>,
    /// The first read after the watcher started: what was already in the Action Center (listed, not shown).
    pub initial: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Foreground {
    pub pid: u32,
    /// `chrome.exe`
    pub exe: String,
    pub path: String,
    /// The product name from the executable's version info ("Google Chrome"), else the file stem.
    pub name: String,
    pub title: String,
    pub icon: Option<String>,
    /// The process started a moment ago: an app that opened, not a switch to one that was already there.
    pub fresh: bool,
}

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub level: f32,
    pub muted: bool,
}

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Power {
    pub has_battery: bool,
    pub percent: Option<u8>,
    pub charging: bool,
    pub minutes: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardChange {
    /// `text` | `image`
    pub kind: String,
    pub preview: String,
    pub chars: usize,
}

/// Start or stop one source: `media`, `notifications`, `foreground`, `volume`, `power`, `clipboard`.
#[tauri::command]
pub async fn desktop_watch(app: AppHandle, state: State<'_, DesktopState>, source: String, on: bool) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|_| "desktop state poisoned".to_string())?;
    if let Some(w) = map.remove(&source) {
        w.stop.store(true, Ordering::Relaxed);
        let _ = w.wake.send(());
        if let Some(tid) = w.pump {
            win::quit_pump(tid);
        }
    }
    if !on {
        return Ok(());
    }
    let stop = Arc::new(AtomicBool::new(false));
    let (wake, rx) = std::sync::mpsc::channel::<()>();
    let pump = win::start(&source, app, stop.clone(), rx, wake.clone())?;
    map.insert(source, Watcher { stop, wake, pump });
    Ok(())
}

/// Take one toast out of the Action Center.
#[tauri::command]
pub async fn notification_dismiss(id: u32) -> Result<(), String> {
    win::on_thread(move || win::notification_dismiss(id))
}

/// Empty the Action Center.
#[tauri::command]
pub async fn notifications_clear() -> Result<(), String> {
    win::on_thread(win::notifications_clear)
}

#[tauri::command]
pub async fn volume_get() -> Result<Option<Volume>, String> {
    win::on_thread(win::volume_get)
}

#[tauri::command]
pub async fn volume_set(level: f32, muted: Option<bool>) -> Result<(), String> {
    win::on_thread(move || win::volume_set(level.clamp(0.0, 1.0), muted))
}

#[tauri::command]
pub async fn power_status() -> Result<Power, String> {
    Ok(win::power_read())
}

/// Bring the first visible window of that executable (`Spotify.exe`) to the front.
#[tauri::command]
pub async fn activate_app(exe: String) -> Result<bool, String> {
    win::on_thread(move || win::activate_app(&exe))
}

/* ------------------------------------------------------------------ */
/*  Windows                                                            */
/* ------------------------------------------------------------------ */

#[cfg(windows)]
mod win {
    use super::*;
    use crate::commands::island::LABEL;
    use crate::commands::media::{snapshot, ArtCache, MediaNow};
    use std::collections::{HashMap, HashSet};
    use std::sync::atomic::AtomicU64;
    use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use windows::core::{implement, w, PCWSTR, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, FILETIME, HANDLE, HWND, LPARAM, LRESULT, WPARAM};

    fn emit<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
        let _ = app.emit_to(LABEL, event, payload);
    }

    /// Run a short COM/WinRT job on its own thread (the async runtime's threads carry no apartment).
    pub fn on_thread<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
        let (tx, rx) = channel::<Result<T, String>>();
        std::thread::spawn(move || {
            let _ = tx.send(f());
        });
        rx.recv().map_err(|_| "desktop thread died".to_string())?
    }

    pub fn start(source: &str, app: AppHandle, stop: Arc<AtomicBool>, rx: Receiver<()>, wake: Sender<()>) -> Result<Option<u32>, String> {
        match source {
            "media" => {
                std::thread::spawn(move || media_loop(app, stop, rx, wake));
                Ok(None)
            }
            "notifications" => {
                std::thread::spawn(move || notifications_loop(app, stop, rx, wake));
                Ok(None)
            }
            "foreground" => Ok(Some(foreground_start(app, stop))),
            "volume" => {
                std::thread::spawn(move || volume_loop(app, stop, rx, wake));
                Ok(None)
            }
            "power" => {
                std::thread::spawn(move || power_loop(app, stop, rx));
                Ok(None)
            }
            "clipboard" => Ok(Some(clipboard_start(app, stop))),
            other => Err(format!("unknown desktop source: {other}")),
        }
    }

    pub fn quit_pump(tid: u32) {
        use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }

    fn com_init() {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    /// Wait for a ping, then let the burst settle; false when the watcher is done.
    fn wait(rx: &Receiver<()>, stop: &AtomicBool, every: Duration, settle: Duration) -> bool {
        match rx.recv_timeout(every) {
            Ok(()) => {
                std::thread::sleep(settle);
                while rx.try_recv().is_ok() {}
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return false,
        }
        !stop.load(Ordering::Relaxed)
    }

    /* ---------------------------- media ---------------------------- */

    fn media_loop(app: AppHandle, stop: Arc<AtomicBool>, rx: Receiver<()>, wake: Sender<()>) {
        use windows::Foundation::TypedEventHandler;
        use windows::Media::Control::{GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager};
        crate::commands::media::init();
        let Ok(manager) = Manager::RequestAsync().and_then(|op| op.get()) else { return };
        let ping = wake.clone();
        let session_token = manager.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
            let _ = ping.send(());
            Ok(())
        }));
        let mut hooked: Option<(Session, String, [i64; 3])> = None;
        let mut art: ArtCache = None;
        let mut last: Option<Option<MediaNow>> = None;
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            let session = manager.GetCurrentSession().ok();
            let id = session.as_ref().and_then(|s| s.SourceAppUserModelId().ok()).map(|h| h.to_string()).unwrap_or_default();
            // Follow the current session's events; re-hooked when the player changes.
            if hooked.as_ref().map(|h| h.1 != id).unwrap_or(session.is_some()) {
                if let Some((old, _, t)) = hooked.take() {
                    let _ = old.RemoveMediaPropertiesChanged(t[0]);
                    let _ = old.RemovePlaybackInfoChanged(t[1]);
                    let _ = old.RemoveTimelinePropertiesChanged(t[2]);
                }
                if let Some(s) = &session {
                    let (p1, p2, p3) = (wake.clone(), wake.clone(), wake.clone());
                    let tokens = [
                        s.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                            let _ = p1.send(());
                            Ok(())
                        }))
                        .unwrap_or(0),
                        s.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                            let _ = p2.send(());
                            Ok(())
                        }))
                        .unwrap_or(0),
                        s.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
                            let _ = p3.send(());
                            Ok(())
                        }))
                        .unwrap_or(0),
                    ];
                    hooked = Some((s.clone(), id, tokens));
                }
            }
            let now = session.as_ref().and_then(|s| snapshot(s, &mut art).ok().flatten());
            if last.as_ref() != Some(&now) {
                // The cover travels once per track; position ticks go without it.
                let same_art = matches!((&last, &now), (Some(Some(a)), Some(b)) if a.title == b.title && a.artist == b.artist && a.album == b.album && a.app == b.app);
                let mut out = now.clone();
                if same_art {
                    if let Some(o) = out.as_mut() {
                        o.thumbnail = None;
                        o.same_art = true;
                    }
                }
                emit(&app, "desktop://media", out);
                last = Some(now);
            }
            if !wait(&rx, &stop, Duration::from_secs(8), Duration::from_millis(160)) {
                break;
            }
        }
        if let Some((s, _, t)) = hooked.take() {
            let _ = s.RemoveMediaPropertiesChanged(t[0]);
            let _ = s.RemovePlaybackInfoChanged(t[1]);
            let _ = s.RemoveTimelinePropertiesChanged(t[2]);
        }
        if let Ok(t) = session_token {
            let _ = manager.RemoveCurrentSessionChanged(t);
        }
    }

    /* ------------------------- notifications ----------------------- */

    fn read_stream(reference: &windows::Storage::Streams::RandomAccessStreamReference) -> Option<String> {
        use base64::Engine;
        use windows::Storage::Streams::DataReader;
        let stream = reference.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 2_000_000 {
            return None;
        }
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;
        let content_type = stream.ContentType().ok().map(|c| c.to_string()).filter(|c| !c.is_empty()).unwrap_or_else(|| "image/png".into());
        Some(format!("data:{};base64,{}", content_type, base64::engine::general_purpose::STANDARD.encode(buf)))
    }

    fn describe_notification(n: &windows::UI::Notifications::UserNotification, logos: &mut HashMap<String, Option<String>>) -> Option<WinNotification> {
        use windows::Foundation::Size;
        use windows::UI::Notifications::KnownNotificationBindings;
        let id = n.Id().ok()?;
        let binding = n.Notification().ok()?.Visual().ok()?.GetBinding(&KnownNotificationBindings::ToastGeneric().ok()?).ok()?;
        let texts = binding.GetTextElements().ok()?;
        let mut lines: Vec<String> = Vec::new();
        for i in 0..texts.Size().unwrap_or(0) {
            if let Ok(t) = texts.GetAt(i).and_then(|e| e.Text()) {
                let s = t.to_string();
                if !s.trim().is_empty() {
                    lines.push(s.trim().to_string());
                }
            }
        }
        let title = lines.first().cloned().unwrap_or_default();
        let body = lines.iter().skip(1).cloned().collect::<Vec<_>>().join("\n");
        let info = n.AppInfo().ok();
        let app_id = info.as_ref().and_then(|i| i.AppUserModelId().ok()).map(|h| h.to_string()).unwrap_or_default();
        let display = info.as_ref().and_then(|i| i.DisplayInfo().ok());
        let app = display.as_ref().and_then(|d| d.DisplayName().ok()).map(|h| h.to_string()).unwrap_or_default();
        let logo = match logos.get(&app_id) {
            Some(l) => l.clone(),
            None => {
                let l = display.as_ref().and_then(|d| d.GetLogo(Size { Width: 64.0, Height: 64.0 }).ok()).and_then(|r| read_stream(&r));
                logos.insert(app_id.clone(), l.clone());
                l
            }
        };
        // FILETIME epoch → Unix ms.
        let at = n.CreationTime().map(|d| (d.UniversalTime - 116_444_736_000_000_000) / 10_000).unwrap_or(0);
        Some(WinNotification { id, app, app_id, title, body, at, logo })
    }

    fn notifications_loop(app: AppHandle, stop: Arc<AtomicBool>, rx: Receiver<()>, wake: Sender<()>) {
        use windows::Foundation::TypedEventHandler;
        use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus as Access};
        use windows::UI::Notifications::NotificationKinds;
        crate::commands::media::init();
        let listener = match UserNotificationListener::Current() {
            Ok(l) => l,
            Err(_) => {
                emit(&app, "desktop://notifications-access", "unsupported");
                return;
            }
        };
        let status = listener.RequestAccessAsync().and_then(|op| op.get()).unwrap_or(Access::Unspecified);
        emit(
            &app,
            "desktop://notifications-access",
            match status {
                Access::Allowed => "allowed",
                Access::Denied => "denied",
                _ => "unspecified",
            },
        );
        if status != Access::Allowed {
            return;
        }
        // The change event fires for packaged apps only on some builds; the poll below is the guarantee.
        let ping = wake.clone();
        let token = listener
            .NotificationChanged(&TypedEventHandler::new(move |_, _| {
                let _ = ping.send(());
                Ok(())
            }))
            .ok();
        let mut known: HashSet<u32> = HashSet::new();
        let mut logos: HashMap<String, Option<String>> = HashMap::new();
        let mut first = true;
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(list) = listener.GetNotificationsAsync(NotificationKinds::Toast).and_then(|op| op.get()) {
                let mut current: HashSet<u32> = HashSet::new();
                let mut added: Vec<WinNotification> = Vec::new();
                for i in 0..list.Size().unwrap_or(0) {
                    let Ok(n) = list.GetAt(i) else { continue };
                    let Ok(id) = n.Id() else { continue };
                    current.insert(id);
                    if !known.contains(&id) {
                        if let Some(d) = describe_notification(&n, &mut logos) {
                            added.push(d);
                        }
                    }
                }
                let removed: Vec<u32> = known.difference(&current).copied().collect();
                if first || !added.is_empty() || !removed.is_empty() {
                    added.sort_by_key(|n| n.at);
                    emit(&app, "desktop://notifications", WinNotificationsDelta { added, removed, initial: first });
                }
                known = current;
                first = false;
            }
            if !wait(&rx, &stop, Duration::from_millis(1500), Duration::from_millis(250)) {
                break;
            }
        }
        if let Some(t) = token {
            let _ = listener.RemoveNotificationChanged(t);
        }
    }

    pub fn notification_dismiss(id: u32) -> Result<(), String> {
        use windows::UI::Notifications::Management::UserNotificationListener;
        crate::commands::media::init();
        UserNotificationListener::Current().and_then(|l| l.RemoveNotification(id)).map_err(|e| e.message())
    }

    pub fn notifications_clear() -> Result<(), String> {
        use windows::UI::Notifications::Management::UserNotificationListener;
        crate::commands::media::init();
        UserNotificationListener::Current().and_then(|l| l.ClearNotifications()).map_err(|e| e.message())
    }

    /* --------------------------- foreground ------------------------ */

    static FG_TX: Mutex<Option<Sender<isize>>> = Mutex::new(None);
    /// Which start owns `FG_TX`: a pump thread ending late (the previous watcher) must not clear the sender the new one set.
    static FG_GEN: AtomicU64 = AtomicU64::new(0);

    unsafe extern "system" fn fg_proc(_hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK, event: u32, hwnd: HWND, idobject: i32, _idchild: i32, _thread: u32, _time: u32) {
        use windows::Win32::UI::WindowsAndMessaging::EVENT_SYSTEM_FOREGROUND;
        if event != EVENT_SYSTEM_FOREGROUND || idobject != 0 {
            return;
        }
        if let Ok(guard) = FG_TX.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(hwnd.0 as isize);
            }
        }
    }

    /// Two threads: one pumps messages for the WinEvent hook, one resolves the window (process, icon) and emits.
    fn foreground_start(app: AppHandle, stop: Arc<AtomicBool>) -> u32 {
        use windows::Win32::System::Threading::GetCurrentThreadId;
        use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent};
        use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, GetMessageW, TranslateMessage, EVENT_SYSTEM_FOREGROUND, MSG, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS};
        let (tx, rx) = channel::<isize>();
        let gen = FG_GEN.fetch_add(1, Ordering::SeqCst) + 1;
        if let Ok(mut g) = FG_TX.lock() {
            *g = Some(tx);
        }
        let (tid_tx, tid_rx) = channel::<u32>();
        std::thread::spawn(move || unsafe {
            let _ = tid_tx.send(GetCurrentThreadId());
            let hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, None, Some(fg_proc), 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = UnhookWinEvent(hook);
            if FG_GEN.load(Ordering::SeqCst) == gen {
                if let Ok(mut g) = FG_TX.lock() {
                    *g = None;
                }
            }
        });
        std::thread::spawn(move || {
            com_init();
            let mut icons: HashMap<String, Option<String>> = HashMap::new();
            let mut last_hwnd: isize = 0;
            loop {
                let mut h = match rx.recv_timeout(Duration::from_secs(2)) {
                    Ok(h) => h,
                    Err(RecvTimeoutError::Timeout) => {
                        if stop.load(Ordering::Relaxed) {
                            break;
                        }
                        continue;
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                };
                // Alt-tab and app launches fire in bursts: the last window standing is the one.
                while let Ok(n) = rx.recv_timeout(Duration::from_millis(160)) {
                    h = n;
                }
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                if h == last_hwnd {
                    continue;
                }
                if let Some(info) = unsafe { describe_window(HWND(h as *mut _), &mut icons) } {
                    last_hwnd = h;
                    emit(&app, "desktop://foreground", info);
                }
            }
        });
        tid_rx.recv().unwrap_or(0)
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn window_text(hwnd: HWND) -> String {
        use windows::Win32::UI::WindowsAndMessaging::GetWindowTextW;
        let mut buf = [0u16; 512];
        let n = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    unsafe fn class_name(hwnd: HWND) -> String {
        use windows::Win32::UI::WindowsAndMessaging::GetClassNameW;
        let mut buf = [0u16; 256];
        let n = GetClassNameW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    /// The executable behind a process, and whether it started in the last few seconds.
    unsafe fn process_image(pid: u32) -> Option<(String, bool)> {
        use windows::Win32::System::SystemInformation::GetSystemTimeAsFileTime;
        use windows::Win32::System::Threading::{GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
        let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let path = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).ok().map(|_| String::from_utf16_lossy(&buf[..len as usize]));
        let mut created = FILETIME::default();
        let (mut exit, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
        let fresh = GetProcessTimes(handle, &mut created, &mut exit, &mut kernel, &mut user).is_ok() && {
            let now = GetSystemTimeAsFileTime();
            let to_u64 = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
            to_u64(now).saturating_sub(to_u64(created)) < 12 * 10_000_000
        };
        let _ = CloseHandle(handle);
        path.map(|p| (p, fresh))
    }

    /// `FileDescription` from the executable's version resource ("Google Chrome").
    unsafe fn file_description(path: &str) -> Option<String> {
        use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
        let wpath = wide(path);
        let size = GetFileVersionInfoSizeW(PCWSTR(wpath.as_ptr()), None);
        if size == 0 {
            return None;
        }
        let mut buf = vec![0u8; size as usize];
        GetFileVersionInfoW(PCWSTR(wpath.as_ptr()), None, size, buf.as_mut_ptr() as *mut _).ok()?;
        let mut ptr: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut len = 0u32;
        if !VerQueryValueW(buf.as_ptr() as *const _, w!("\\VarFileInfo\\Translation"), &mut ptr, &mut len).as_bool() || len < 4 || ptr.is_null() {
            return None;
        }
        let lang = *(ptr as *const u16);
        let cp = *(ptr as *const u16).add(1);
        let sub = wide(&format!("\\StringFileInfo\\{lang:04x}{cp:04x}\\FileDescription"));
        if !VerQueryValueW(buf.as_ptr() as *const _, PCWSTR(sub.as_ptr()), &mut ptr, &mut len).as_bool() || len == 0 || ptr.is_null() {
            return None;
        }
        let s = std::slice::from_raw_parts(ptr as *const u16, len as usize);
        let s = String::from_utf16_lossy(s).trim_end_matches('\0').trim().to_string();
        (!s.is_empty()).then_some(s)
    }

    /// The app's name from a "Document - App" title, when the title has that shape.
    fn title_app(title: &str) -> Option<String> {
        let cut = [" - ", " – ", " — "].iter().filter_map(|sep| title.rfind(sep).map(|i| i + sep.len())).max()?;
        let tail = title[cut..].trim();
        (!tail.is_empty() && tail.chars().count() <= 40).then(|| tail.to_string())
    }

    /// The executable's icon at 64 px, as a PNG data URL.
    unsafe fn exe_icon(path: &str) -> Option<String> {
        use base64::Engine;
        use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
        use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, PrivateExtractIconsW, HICON};
        let wpath = wide(path);
        let mut fixed = [0u16; 260];
        let n = wpath.len().min(259);
        fixed[..n].copy_from_slice(&wpath[..n]);
        let mut icons = [HICON::default(); 1];
        let got = PrivateExtractIconsW(&fixed, 0, 64, 64, Some(&mut icons), None, 0);
        let mut hicon = if got >= 1 { icons[0] } else { HICON::default() };
        if hicon.is_invalid() {
            let mut info = SHFILEINFOW::default();
            SHGetFileInfoW(PCWSTR(wpath.as_ptr()), Default::default(), Some(&mut info), std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON);
            hicon = info.hIcon;
        }
        if hicon.is_invalid() {
            return None;
        }
        let png = icon_png(hicon);
        let _ = DestroyIcon(hicon);
        png.map(|bytes| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
    }

    unsafe fn icon_png(hicon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<Vec<u8>> {
        use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ};
        use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};
        let mut info = ICONINFO::default();
        GetIconInfo(hicon, &mut info).ok()?;
        let mut bm = BITMAP::default();
        let has_color = !info.hbmColor.is_invalid();
        let src = if has_color { info.hbmColor } else { info.hbmMask };
        GetObjectW(HGDIOBJ(src.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _));
        let (w, h) = (bm.bmWidth, if has_color { bm.bmHeight } else { bm.bmHeight / 2 });
        let mut out: Option<Vec<u8>> = None;
        if w > 0 && h > 0 && w <= 512 && h <= 512 {
            let dc = GetDC(None);
            let header = |height: i32| BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: w, biHeight: -height, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() };
            let mut bgra = vec![0u8; (w * h * 4) as usize];
            let mut bi = BITMAPINFO { bmiHeader: header(h), ..Default::default() };
            let lines = GetDIBits(dc, src, 0, h as u32, Some(bgra.as_mut_ptr() as *mut _), &mut bi, DIB_RGB_COLORS);
            if lines > 0 {
                // Icons without an alpha channel carry it in the mask: 0 = opaque.
                if !has_color || bgra.chunks_exact(4).all(|p| p[3] == 0) {
                    let mut mask = vec![0u8; (w * h * 4) as usize];
                    let mut mi = BITMAPINFO { bmiHeader: header(h), ..Default::default() };
                    if GetDIBits(dc, info.hbmMask, 0, h as u32, Some(mask.as_mut_ptr() as *mut _), &mut mi, DIB_RGB_COLORS) > 0 {
                        for (px, m) in bgra.chunks_exact_mut(4).zip(mask.chunks_exact(4)) {
                            px[3] = if m[0] == 0 { 255 } else { 0 };
                        }
                    } else {
                        for px in bgra.chunks_exact_mut(4) {
                            px[3] = 255;
                        }
                    }
                }
                for px in bgra.chunks_exact_mut(4) {
                    px.swap(0, 2);
                }
                out = crate::commands::capture::encode_png(w as u32, h as u32, &bgra).ok();
            }
            ReleaseDC(None, dc);
        }
        if has_color {
            let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
        }
        let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
        out
    }

    const SHELL_CLASSES: &[&str] = &["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "ForegroundStaging", "XamlExplorerHostIslandWindow", "Windows.UI.Core.CoreWindow", "TaskListThumbnailWnd", "MultitaskingViewFrame"];
    const SHELL_EXES: &[&str] = &["startmenuexperiencehost.exe", "searchhost.exe", "searchapp.exe", "shellexperiencehost.exe", "textinputhost.exe", "lockapp.exe", "screenclippinghost.exe", "applicationframehost.exe", "dwm.exe", "zpace.exe", "zorynq.exe", "conduit.exe"];

    unsafe fn describe_window(hwnd: HWND, icons: &mut HashMap<String, Option<String>>) -> Option<Foreground> {
        use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, GetWindowThreadProcessId};
        if hwnd.is_invalid() {
            return None;
        }
        let class = class_name(hwnd);
        if SHELL_CLASSES.contains(&class.as_str()) {
            return None;
        }
        let title = window_text(hwnd);
        if title.trim().is_empty() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let (mut path, mut fresh) = process_image(pid)?;
        // A Store app sits inside ApplicationFrameHost; the real process owns the CoreWindow child.
        if path.to_lowercase().ends_with("applicationframehost.exe") {
            if let Ok(core) = FindWindowExW(Some(hwnd), None, w!("Windows.UI.Core.CoreWindow"), PCWSTR::null()) {
                let mut inner = 0u32;
                GetWindowThreadProcessId(core, Some(&mut inner));
                if inner != 0 {
                    if let Some((p, f)) = process_image(inner) {
                        pid = inner;
                        path = p;
                        fresh = f;
                    }
                }
            }
        }
        let exe = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
        if SHELL_EXES.contains(&exe.to_lowercase().as_str()) {
            return None;
        }
        // The version resource's product name; a packaged app without one is named by its title's last part
        // ("Untitled - Paint" → "Paint"); the file stem is the last resort.
        let name = file_description(&path).or_else(|| title_app(&title)).unwrap_or_else(|| {
            let stem = exe.trim_end_matches(".exe").trim_end_matches(".EXE");
            let mut c = stem.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => exe.clone(),
            }
        });
        let icon = match icons.get(&path) {
            Some(i) => i.clone(),
            None => {
                let i = exe_icon(&path);
                if icons.len() > 200 {
                    icons.clear();
                }
                icons.insert(path.clone(), i.clone());
                i
            }
        };
        Some(Foreground { pid, exe, path, name, title, icon, fresh })
    }

    struct Find {
        want: String,
        found: HWND,
    }

    unsafe extern "system" fn find_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowThreadProcessId, IsWindowVisible};
        let find = &mut *(lparam.0 as *mut Find);
        if !IsWindowVisible(hwnd).as_bool() || window_text(hwnd).trim().is_empty() {
            return true.into();
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let Some((path, _)) = process_image(pid) else { return true.into() };
        let exe = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_lowercase();
        if exe == find.want || exe.trim_end_matches(".exe") == find.want.trim_end_matches(".exe") {
            find.found = hwnd;
            return false.into();
        }
        true.into()
    }

    pub fn activate_app(exe: &str) -> Result<bool, String> {
        use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, IsIconic, ShowWindow, SwitchToThisWindow, SW_RESTORE};
        // A Store app id ("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify") → its short name; a plain exe stays.
        let want = exe.rsplit(['\\', '/']).next().unwrap_or(exe).to_lowercase();
        let want = match want.split_once('!') {
            Some((_, app)) => format!("{app}.exe"),
            None => want,
        };
        let mut find = Find { want, found: HWND::default() };
        unsafe {
            let _ = EnumWindows(Some(find_proc), LPARAM(&mut find as *mut Find as isize));
            if find.found.is_invalid() {
                return Ok(false);
            }
            if IsIconic(find.found).as_bool() {
                let _ = ShowWindow(find.found, SW_RESTORE);
            }
            SwitchToThisWindow(find.found, true);
        }
        Ok(true)
    }

    /* ----------------------------- volume -------------------------- */

    use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl};
    use windows::Win32::Media::Audio::AUDIO_VOLUME_NOTIFICATION_DATA;

    #[implement(IAudioEndpointVolumeCallback)]
    struct VolumeSink(Sender<()>);

    impl IAudioEndpointVolumeCallback_Impl for VolumeSink_Impl {
        fn OnNotify(&self, _data: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows::core::Result<()> {
            let _ = self.0.send(());
            Ok(())
        }
    }

    /// The default output's volume interface and its id (to notice when the default device changes).
    unsafe fn endpoint() -> Result<(IAudioEndpointVolume, String), String> {
        use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
        use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL};
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.message())?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).map_err(|e| e.message())?;
        let id = device.GetId().map_err(|e| e.message())?;
        let id_str = id.to_string().unwrap_or_default();
        CoTaskMemFree(Some(id.0 as *const _));
        let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).map_err(|e| e.message())?;
        Ok((volume, id_str))
    }

    unsafe fn read_volume(v: &IAudioEndpointVolume) -> Option<Volume> {
        let level = v.GetMasterVolumeLevelScalar().ok()?;
        let muted = v.GetMute().map(|b| b.as_bool()).unwrap_or(false);
        Some(Volume { level, muted })
    }

    fn volume_loop(app: AppHandle, stop: Arc<AtomicBool>, rx: Receiver<()>, wake: Sender<()>) {
        com_init();
        let mut bound: Option<(IAudioEndpointVolume, IAudioEndpointVolumeCallback, String)> = None;
        let mut last: Option<Volume> = None;
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            unsafe {
                // (Re)bind when the default device changed — headphones plugged in, a monitor with speakers.
                if let Ok((volume, id)) = endpoint() {
                    if bound.as_ref().map(|b| b.2 != id).unwrap_or(true) {
                        if let Some((old, cb, _)) = bound.take() {
                            let _ = old.UnregisterControlChangeNotify(&cb);
                        }
                        let cb: IAudioEndpointVolumeCallback = VolumeSink(wake.clone()).into();
                        let _ = volume.RegisterControlChangeNotify(&cb);
                        bound = Some((volume, cb, id));
                    }
                }
                if let Some((v, _, _)) = &bound {
                    let now = read_volume(v);
                    if now.is_some() && now != last {
                        emit(&app, "desktop://volume", now.clone());
                        last = now;
                    }
                }
            }
            if !wait(&rx, &stop, Duration::from_secs(10), Duration::from_millis(30)) {
                break;
            }
        }
        if let Some((old, cb, _)) = bound.take() {
            unsafe {
                let _ = old.UnregisterControlChangeNotify(&cb);
            }
        }
    }

    pub fn volume_get() -> Result<Option<Volume>, String> {
        com_init();
        unsafe {
            let (v, _) = endpoint()?;
            Ok(read_volume(&v))
        }
    }

    pub fn volume_set(level: f32, muted: Option<bool>) -> Result<(), String> {
        com_init();
        unsafe {
            let (v, _) = endpoint()?;
            v.SetMasterVolumeLevelScalar(level, std::ptr::null()).map_err(|e| e.message())?;
            if let Some(m) = muted {
                v.SetMute(m, std::ptr::null()).map_err(|e| e.message())?;
            }
        }
        Ok(())
    }

    /* ------------------------------ power -------------------------- */

    pub fn power_read() -> Power {
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut s = SYSTEM_POWER_STATUS::default();
        if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
            return Power { has_battery: false, percent: None, charging: false, minutes: None };
        }
        // BatteryFlag 128 = no battery, 255 = unknown.
        let has_battery = s.BatteryFlag != 128 && s.BatteryFlag != 255;
        Power {
            has_battery,
            percent: (has_battery && s.BatteryLifePercent != 255).then_some(s.BatteryLifePercent),
            charging: s.ACLineStatus == 1,
            minutes: (has_battery && s.BatteryLifeTime != u32::MAX).then_some(s.BatteryLifeTime / 60),
        }
    }

    fn power_loop(app: AppHandle, stop: Arc<AtomicBool>, rx: Receiver<()>) {
        let mut last: Option<Power> = None;
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            let now = power_read();
            if last.as_ref() != Some(&now) {
                emit(&app, "desktop://power", now.clone());
                last = Some(now);
            }
            if !wait(&rx, &stop, Duration::from_secs(20), Duration::ZERO) {
                break;
            }
        }
    }

    /* ---------------------------- clipboard ------------------------ */

    static CLIP_TX: Mutex<Option<Sender<()>>> = Mutex::new(None);
    static CLIP_GEN: AtomicU64 = AtomicU64::new(0);

    unsafe extern "system" fn clip_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        use windows::Win32::UI::WindowsAndMessaging::{DefWindowProcW, WM_CLIPBOARDUPDATE};
        if msg == WM_CLIPBOARDUPDATE {
            if let Ok(guard) = CLIP_TX.lock() {
                if let Some(tx) = guard.as_ref() {
                    let _ = tx.send(());
                }
            }
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    /// A message-only window listens for clipboard changes; a worker reads what was copied and emits a preview.
    fn clipboard_start(app: AppHandle, stop: Arc<AtomicBool>) -> u32 {
        use windows::Win32::Foundation::HINSTANCE;
        use windows::Win32::System::DataExchange::{AddClipboardFormatListener, RemoveClipboardFormatListener};
        use windows::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows::Win32::System::Threading::GetCurrentThreadId;
        use windows::Win32::UI::WindowsAndMessaging::{CreateWindowExW, DestroyWindow, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSW};
        let (tx, rx) = channel::<()>();
        let gen = CLIP_GEN.fetch_add(1, Ordering::SeqCst) + 1;
        if let Ok(mut g) = CLIP_TX.lock() {
            *g = Some(tx);
        }
        let (tid_tx, tid_rx) = channel::<u32>();
        std::thread::spawn(move || unsafe {
            let _ = tid_tx.send(GetCurrentThreadId());
            let hinstance = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).unwrap_or_default();
            let class = w!("ZpaceClipboardWatch");
            let wc = WNDCLASSW { lpfnWndProc: Some(clip_proc), hInstance: hinstance, lpszClassName: class, ..Default::default() };
            // Already registered after a previous start: fine.
            let _ = RegisterClassW(&wc);
            let Ok(hwnd) = CreateWindowExW(WINDOW_EX_STYLE(0), class, w!(""), WINDOW_STYLE(0), 0, 0, 0, 0, Some(HWND_MESSAGE), None, Some(hinstance), None) else { return };
            let _ = AddClipboardFormatListener(hwnd);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = RemoveClipboardFormatListener(hwnd);
            let _ = DestroyWindow(hwnd);
            if CLIP_GEN.load(Ordering::SeqCst) == gen {
                if let Ok(mut g) = CLIP_TX.lock() {
                    *g = None;
                }
            }
        });
        std::thread::spawn(move || {
            let mut last: Option<(String, Instant)> = None;
            loop {
                match rx.recv_timeout(Duration::from_secs(2)) {
                    Ok(()) => {}
                    Err(RecvTimeoutError::Timeout) => {
                        if stop.load(Ordering::Relaxed) {
                            break;
                        }
                        continue;
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
                // Apps write several formats in a row; read once the burst is over.
                std::thread::sleep(Duration::from_millis(120));
                while rx.try_recv().is_ok() {}
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                let Ok(mut clipboard) = arboard::Clipboard::new() else { continue };
                let change = match clipboard.get_text() {
                    Ok(text) if !text.trim().is_empty() => {
                        let chars = text.chars().count();
                        let preview: String = text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(140).collect();
                        ClipboardChange { kind: "text".into(), preview, chars }
                    }
                    _ => match clipboard.get_image() {
                        Ok(img) => ClipboardChange { kind: "image".into(), preview: format!("{}×{}", img.width, img.height), chars: 0 },
                        Err(_) => continue,
                    },
                };
                // The same content set twice within a second (a copy that also sets HTML) is one copy.
                let key = format!("{}:{}", change.kind, change.preview);
                if let Some((k, at)) = &last {
                    if *k == key && at.elapsed() < Duration::from_secs(1) {
                        continue;
                    }
                }
                last = Some((key, Instant::now()));
                emit(&app, "desktop://clipboard", change);
            }
        });
        tid_rx.recv().unwrap_or(0)
    }
}

/* ------------------------------------------------------------------ */
/*  Elsewhere: nothing to watch                                        */
/* ------------------------------------------------------------------ */

#[cfg(not(windows))]
mod win {
    use super::*;
    use std::sync::mpsc::{Receiver, Sender};

    pub fn on_thread<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
        f()
    }
    pub fn start(_source: &str, _app: AppHandle, _stop: Arc<AtomicBool>, _rx: Receiver<()>, _wake: Sender<()>) -> Result<Option<u32>, String> {
        Ok(None)
    }
    pub fn quit_pump(_tid: u32) {}
    pub fn notification_dismiss(_id: u32) -> Result<(), String> {
        Ok(())
    }
    pub fn notifications_clear() -> Result<(), String> {
        Ok(())
    }
    pub fn volume_get() -> Result<Option<Volume>, String> {
        Ok(None)
    }
    pub fn volume_set(_level: f32, _muted: Option<bool>) -> Result<(), String> {
        Ok(())
    }
    pub fn power_read() -> Power {
        Power { has_battery: false, percent: None, charging: false, minutes: None }
    }
    pub fn activate_app(_exe: &str) -> Result<bool, String> {
        Ok(false)
    }
}

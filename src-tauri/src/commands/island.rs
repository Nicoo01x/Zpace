//! The desktop island: a second, chromeless window — transparent, always on
//! top, off the taskbar and never activated — that floats at the top (or
//! bottom) centre of the primary monitor and shows what the title-bar island
//! shows, over every other app. The window keeps one generous size and never
//! resizes (a transparent WebView2 that shrinks leaves stale tiles behind);
//! instead the webview hands it a window region that follows the pill, so
//! everything outside the pill is invisible and lets clicks through. Placing
//! it never activates it, so the app the user is typing in keeps the keyboard.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "island";

/// Create the island window (hidden until the webview places it) — or nothing, when it already exists.
#[tauri::command]
pub async fn island_open(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let handle = app.clone();
    // Window creation belongs to the main thread on every platform.
    app.run_on_main_thread(move || {
        let built = WebviewWindowBuilder::new(&handle, LABEL, WebviewUrl::App("island.html".into()))
            .title("Zpace island")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(false)
            .focused(false)
            .visible(false)
            .inner_size(360.0, 60.0)
            .build();
        let _ = tx.send(match built {
            Ok(w) => {
                no_activate(&w);
                Ok(())
            }
            Err(e) => Err(e.to_string()),
        });
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|_| "island window: main thread went away".to_string())?
}

/// Destroy the island window.
#[tauri::command]
pub async fn island_close(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        w.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Place the island: physical pixels, position and size in one go, never activating it. `show` also reveals a hidden window.
#[tauri::command]
pub async fn island_set_bounds(app: AppHandle, x: i32, y: i32, width: i32, height: i32, show: bool) -> Result<(), String> {
    let Some(w) = app.get_webview_window(LABEL) else { return Err("no island window".into()) };
    place(&w, x, y, width.max(1), height.max(1), show)
}

/// Clip the window to a rounded rectangle (physical pixels, window-relative): the pill and its shadow. Outside it the
/// window neither paints nor takes clicks.
#[tauri::command]
pub async fn island_set_region(app: AppHandle, x: i32, y: i32, width: i32, height: i32, radius: i32) -> Result<(), String> {
    let Some(w) = app.get_webview_window(LABEL) else { return Err("no island window".into()) };
    region(&w, x, y, width.max(1), height.max(1), radius.max(0))
}

/// Hide the island (it comes back with the next `island_set_bounds(show: true)`).
#[tauri::command]
pub async fn island_hide(app: AppHandle) -> Result<(), String> {
    let Some(w) = app.get_webview_window(LABEL) else { return Ok(()) };
    w.hide().map_err(|e| e.to_string())
}

/// Bring the main window back — a click on the island wants to see the session it talks about.
#[tauri::command]
pub async fn island_reveal_main(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    Ok(())
}

#[cfg(windows)]
fn hwnd_of(w: &tauri::WebviewWindow) -> Result<windows::Win32::Foundation::HWND, String> {
    let h = w.hwnd().map_err(|e| e.to_string())?;
    Ok(windows::Win32::Foundation::HWND(h.0 as *mut core::ffi::c_void))
}

/// A tool window that never activates: clicks land in it, but the keyboard stays where it was.
#[cfg(windows)]
fn no_activate(w: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW};
    let Ok(hwnd) = hwnd_of(w) else { return };
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
    }
}

#[cfg(not(windows))]
fn no_activate(_w: &tauri::WebviewWindow) {}

#[cfg(windows)]
fn place(w: &tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32, show: bool) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW};
    let hwnd = hwnd_of(w)?;
    let mut flags = SWP_NOACTIVATE;
    if show {
        flags |= SWP_SHOWWINDOW;
    }
    unsafe { SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, width, height, flags).map_err(|e| e.message()) }
}

#[cfg(windows)]
fn region(w: &tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32, radius: i32) -> Result<(), String> {
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
    let hwnd = hwnd_of(w)?;
    unsafe {
        let rgn = CreateRoundRectRgn(x, y, x + width, y + height, radius * 2, radius * 2);
        // The window owns the region from here on.
        if SetWindowRgn(hwnd, Some(rgn), true) == 0 {
            return Err("SetWindowRgn failed".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn region(_w: &tauri::WebviewWindow, _x: i32, _y: i32, _width: i32, _height: i32, _radius: i32) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
fn place(w: &tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32, show: bool) -> Result<(), String> {
    w.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    w.set_size(tauri::PhysicalSize::new(width as u32, height as u32)).map_err(|e| e.to_string())?;
    if show {
        w.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

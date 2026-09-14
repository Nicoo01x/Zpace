//! The taskbar icon on Windows. Tauri sets the window's small icon (title bar, Alt+Tab list)
//! but never the big one, and Explorer draws the taskbar button from the big icon — so a fresh
//! window sat there with the generic frame glyph. We load the icon tauri-build embedded in the
//! executable and hand both sizes to the window.

#[cfg(windows)]
pub fn set_taskbar_icon(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, LoadImageW, SendMessageW, ICON_BIG, ICON_SMALL, IMAGE_ICON, LR_SHARED, SM_CXICON, SM_CXSMICON, SM_CYICON, SM_CYSMICON, WM_SETICON};
    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
    // tauri-build embeds the .ico as resource 32512 (IDI_APPLICATION), the id Windows itself looks for
    let id = 32512usize as *const u16;
    unsafe {
        let module = GetModuleHandleW(std::ptr::null());
        let big = LoadImageW(module, id, IMAGE_ICON, GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), LR_SHARED);
        let small = LoadImageW(module, id, IMAGE_ICON, GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_SHARED);
        if !big.is_null() {
            SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, big as isize);
        }
        if !small.is_null() {
            SendMessageW(hwnd, WM_SETICON, ICON_SMALL as usize, small as isize);
        }
    }
}

#[cfg(not(windows))]
pub fn set_taskbar_icon(_window: &tauri::WebviewWindow) {}

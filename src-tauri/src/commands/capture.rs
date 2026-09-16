//! Screen capture of a region of the main window (the browser pane): PNG to the
//! clipboard, to a file, or back to the page as base64 for the chat composer.
//!
//! Windows: GDI BitBlt of the screen area (the child WebView2 draws there, so
//! this is the only way to see it). macOS: `screencapture -R`. Linux: unsupported.

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capture {
    /// PNG, base64.
    pub png: String,
    pub width: u32,
    pub height: u32,
}

/// Encode RGBA pixels as PNG.
pub(crate) fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, width, height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().map_err(|e| e.to_string())?;
        w.write_image_data(rgba).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

#[cfg(windows)]
fn grab_screen(x: i32, y: i32, width: i32, height: i32) -> Result<(u32, u32, Vec<u8>), String> {
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, SRCCOPY,
    };
    if width <= 0 || height <= 0 {
        return Err("empty region".into());
    }
    unsafe {
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() {
            return Err("GetDC failed".into());
        }
        let mem = CreateCompatibleDC(screen);
        let bmp = CreateCompatibleBitmap(screen, width, height);
        let old = SelectObject(mem, bmp as _);
        let ok = BitBlt(mem, 0, 0, width, height, screen, x, y, SRCCOPY | CAPTUREBLT);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height, // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };
        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(mem, bmp, 0, height as u32, bgra.as_mut_ptr() as _, &mut info, DIB_RGB_COLORS);
        SelectObject(mem, old);
        DeleteObject(bmp as _);
        DeleteDC(mem);
        ReleaseDC(std::ptr::null_mut(), screen);
        if ok == 0 || lines == 0 {
            return Err("capture failed".into());
        }
        for px in bgra.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        Ok((width as u32, height as u32, bgra))
    }
}

#[cfg(target_os = "macos")]
fn grab_screen(x: i32, y: i32, width: i32, height: i32) -> Result<(u32, u32, Vec<u8>), String> {
    // screencapture writes PNG; decode it to RGBA so the rest of the pipeline is shared.
    let tmp = std::env::temp_dir().join(format!("conduit-capture-{}.png", uuid::Uuid::new_v4()));
    let status = std::process::Command::new("screencapture")
        .args(["-x", "-R", &format!("{x},{y},{width},{height}"), tmp.to_str().unwrap_or("")])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("screencapture failed".into());
    }
    let bytes = std::fs::read(&tmp).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    let dec = png::Decoder::new(std::io::Cursor::new(bytes));
    let mut reader = dec.read_info().map_err(|e| e.to_string())?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => buf[..info.buffer_size()].chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        _ => return Err("unsupported colour type".into()),
    };
    Ok((info.width, info.height, rgba))
}

#[cfg(not(any(windows, target_os = "macos")))]
fn grab_screen(_x: i32, _y: i32, _width: i32, _height: i32) -> Result<(u32, u32, Vec<u8>), String> {
    Err("screen capture is not supported on this platform".into())
}

/// Capture a region given in CSS pixels relative to the main window's content area.
fn capture_window_region(app: &AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<(u32, u32, Vec<u8>), String> {
    // `get_window`, not `get_webview_window`: once the browser pane adds a child webview the
    // window hosts several, and the WebviewWindow accessor returns None.
    let window = app.get_window("main").ok_or("no main window")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let origin = window.inner_position().map_err(|e| e.to_string())?;
    let px = |v: f64| (v * scale).round() as i32;
    grab_screen(origin.x + px(x), origin.y + px(y), px(width), px(height))
}

/// PNG of the region, as base64 (for the composer) — and optionally straight to the clipboard.
#[tauri::command]
pub async fn capture_region(app: AppHandle, x: f64, y: f64, width: f64, height: f64, clipboard: bool) -> Result<Capture, String> {
    let (w, h, rgba) = capture_window_region(&app, x, y, width, height)?;
    if clipboard {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        cb.set_image(arboard::ImageData { width: w as usize, height: h as usize, bytes: std::borrow::Cow::Borrowed(&rgba) })
            .map_err(|e| e.to_string())?;
    }
    let png = encode_png(w, h, &rgba)?;
    Ok(Capture { png: base64::engine::general_purpose::STANDARD.encode(png), width: w, height: h })
}

/// Capture the region and write it as PNG to `path`.
#[tauri::command]
pub async fn capture_region_to_file(app: AppHandle, x: f64, y: f64, width: f64, height: f64, path: String) -> Result<(), String> {
    let (w, h, rgba) = capture_window_region(&app, x, y, width, height)?;
    let png = encode_png(w, h, &rgba)?;
    std::fs::write(&path, png).map_err(|e| e.to_string())
}

/// Decode a PNG (base64) to RGBA.
fn decode_png(b64: &str) -> Result<(u32, u32, Vec<u8>), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let dec = png::Decoder::new(std::io::Cursor::new(bytes));
    let mut reader = dec.read_info().map_err(|e| e.to_string())?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => buf[..info.buffer_size()].chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        _ => return Err("unsupported colour type".into()),
    };
    Ok((info.width, info.height, rgba))
}

/// Put an already-rendered PNG (base64, e.g. a crop made on a canvas) on the clipboard as an image.
#[tauri::command]
pub async fn clipboard_write_png(png: String) -> Result<(), String> {
    let (w, h, rgba) = decode_png(&png)?;
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_image(arboard::ImageData { width: w as usize, height: h as usize, bytes: std::borrow::Cow::Owned(rgba) })
        .map_err(|e| e.to_string())
}

/// Write a base64 PNG to `path`.
#[tauri::command]
pub async fn write_png(path: String, png: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(png).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

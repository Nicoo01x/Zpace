//! What is playing on this machine, through Windows' media session
//! (`Windows.Media.Control` — the same thing the volume flyout shows):
//! title, artist, album, the cover, the position — for Spotify, a browser,
//! any player that registers. Plus play/pause/next/previous. Read on a
//! thread with a multithreaded apartment; a machine with no session says
//! `None`, never an error. The desktop island keeps a session open and
//! reads it on every event (see `desktop.rs`); `snapshot` is shared.

use serde::Serialize;

#[derive(Serialize, Clone, PartialEq)]
pub struct MediaNow {
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// The player's app id (`Spotify.exe`, `chrome.exe`…).
    pub app: String,
    /// The cover as a data URL, when the player provides one.
    pub thumbnail: Option<String>,
    pub position_ms: Option<i64>,
    pub duration_ms: Option<i64>,
    /// Set by the island's watcher when the cover is the one already sent (then `thumbnail` is `None`).
    pub same_art: bool,
}

/// The last cover encoded, by track: the same art is not re-read on every position tick.
#[cfg(windows)]
pub type ArtCache = Option<(String, Option<String>)>;

#[cfg(windows)]
#[tauri::command]
pub async fn media_now() -> Result<Option<MediaNow>, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<Option<MediaNow>, String>>();
    std::thread::spawn(move || {
        let _ = tx.send(now());
    });
    rx.recv().map_err(|_| "media thread died".to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn media_control(action: String) -> Result<bool, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<bool, String>>();
    std::thread::spawn(move || {
        let _ = tx.send(control(&action));
    });
    rx.recv().map_err(|_| "media thread died".to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn media_now() -> Result<Option<MediaNow>, String> {
    Ok(None)
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn media_control(_action: String) -> Result<bool, String> {
    Ok(false)
}

#[cfg(windows)]
pub fn init() {
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
}

#[cfg(windows)]
fn now() -> Result<Option<MediaNow>, String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    init();
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(|e| e.message())?.get().map_err(|e| e.message())?;
    let session = match manager.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => return Ok(None),
    };
    snapshot(&session, &mut None)
}

/// Everything the session says right now. The cover is read once per track and kept in `cache`.
#[cfg(windows)]
pub fn snapshot(session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession, cache: &mut ArtCache) -> Result<Option<MediaNow>, String> {
    use base64::Engine;
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
    use windows::Storage::Streams::DataReader;
    let props = session.TryGetMediaPropertiesAsync().map_err(|e| e.message())?.get().map_err(|e| e.message())?;
    let title = props.Title().map(|h| h.to_string()).unwrap_or_default();
    if title.is_empty() {
        return Ok(None);
    }
    let artist = props.Artist().map(|h| h.to_string()).unwrap_or_default();
    let album = props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default();
    let app = session.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
    let playing = session
        .GetPlaybackInfo()
        .and_then(|i| i.PlaybackStatus())
        .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false);
    let key = format!("{app}\u{1}{title}\u{1}{artist}\u{1}{album}");
    let thumbnail = match cache {
        Some((k, art)) if *k == key => art.clone(),
        _ => {
            let art = props.Thumbnail().ok().and_then(|reference| {
                let stream = reference.OpenReadAsync().ok()?.get().ok()?;
                let size = stream.Size().ok()? as u32;
                if size == 0 || size > 4_000_000 {
                    return None;
                }
                let reader = DataReader::CreateDataReader(&stream).ok()?;
                reader.LoadAsync(size).ok()?.get().ok()?;
                let mut buf = vec![0u8; size as usize];
                reader.ReadBytes(&mut buf).ok()?;
                let content_type = stream.ContentType().map(|c| c.to_string()).unwrap_or_else(|_| "image/jpeg".into());
                Some(format!("data:{};base64,{}", content_type, base64::engine::general_purpose::STANDARD.encode(buf)))
            });
            *cache = Some((key, art.clone()));
            art
        }
    };
    let timeline = session.GetTimelineProperties().ok();
    let position_ms = timeline.as_ref().and_then(|t| t.Position().ok()).map(|d| d.Duration / 10_000);
    let duration_ms = timeline.as_ref().and_then(|t| t.EndTime().ok()).map(|d| d.Duration / 10_000).filter(|d| *d > 0);
    Ok(Some(MediaNow { playing, title, artist, album, app, thumbnail, position_ms, duration_ms, same_art: false }))
}

#[cfg(windows)]
fn control(action: &str) -> Result<bool, String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    init();
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(|e| e.message())?.get().map_err(|e| e.message())?;
    let session = match manager.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => return Ok(false),
    };
    let op = match action {
        "play" => session.TryPlayAsync(),
        "pause" => session.TryPauseAsync(),
        "toggle" => session.TryTogglePlayPauseAsync(),
        "next" => session.TrySkipNextAsync(),
        "previous" => session.TrySkipPreviousAsync(),
        other => return Err(format!("unknown media action: {other}")),
    };
    op.map_err(|e| e.message())?.get().map_err(|e| e.message())
}

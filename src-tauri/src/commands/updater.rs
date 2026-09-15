//! The update check and install, driven from Rust instead of the plugin's JS API for one reason:
//! before the plugin launches the installer it runs `AppHandle::cleanup_before_exit`, which
//! clears every resource table — and dropping the state-file store from inside that lock
//! deadlocks, so the app sat at "100 %" forever and the installer never started. Our builder
//! swaps that hook for the two steps that matter: the tray icon goes, the window hides.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMeta {
    pub version: String,
    pub current_version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    Started { content_length: Option<u64> },
    Progress { chunk_length: usize },
    Finished,
}

fn builder(app: &AppHandle) -> tauri_plugin_updater::Result<tauri_plugin_updater::Updater> {
    let handle = app.clone();
    app.updater_builder()
        .on_before_exit(move || {
            let _ = handle.remove_tray_by_id("main");
            for (_, window) in handle.windows() {
                let _ = window.hide();
            }
        })
        .build()
}

/// Asks the update channel; `null` when this is the latest version.
#[tauri::command]
pub async fn update_check(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<UpdateMeta>, String> {
    let updater = builder(&app).map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let meta = update.as_ref().map(|u| UpdateMeta {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        body: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    });
    *pending.0.lock().map_err(|e| e.to_string())? = update;
    Ok(meta)
}

/// Downloads the pending update (progress on the channel) and hands over to the installer; on Windows the
/// process exits as soon as the installer is running.
#[tauri::command]
pub async fn update_install(pending: State<'_, PendingUpdate>, on_event: Channel<DownloadEvent>) -> Result<(), String> {
    let update = pending.0.lock().map_err(|e| e.to_string())?.clone().ok_or("no update pending")?;
    let mut started = false;
    update
        .download_and_install(
            |chunk, total| {
                if !started {
                    started = true;
                    let _ = on_event.send(DownloadEvent::Started { content_length: total });
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length: chunk });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| e.to_string())
}

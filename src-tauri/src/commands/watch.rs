//! File watchers for the automations: a path (file or folder, recursive)
//! watched with `notify`; changes arrive on the `fs://changed` event, batched
//! per half second so a save that touches ten files fires once. Watchers are
//! keyed by the frontend's id and dropped on `unwatch`.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{recommended_watcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatchState {
    watchers: Arc<Mutex<HashMap<String, notify::RecommendedWatcher>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChangedPayload {
    id: String,
    paths: Vec<String>,
}

#[tauri::command]
pub fn watch_path(app: AppHandle, state: State<'_, WatchState>, id: String, path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("{path} does not exist"));
    }
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = recommended_watcher(move |res| {
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    watcher.watch(target, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    state.watchers.lock().map_err(|_| "watch state poisoned")?.insert(id.clone(), watcher);

    // Batch: collect paths for 400 ms after the first event, then emit once.
    std::thread::spawn(move || {
        let mut pending: Vec<String> = Vec::new();
        let mut deadline: Option<Instant> = None;
        loop {
            let timeout = deadline.map(|d| d.saturating_duration_since(Instant::now())).unwrap_or(Duration::from_secs(3600));
            match rx.recv_timeout(timeout) {
                Ok(Ok(event)) => {
                    for p in event.paths {
                        let s = p.to_string_lossy().into_owned();
                        if is_noise(&s) {
                            continue;
                        }
                        if !pending.contains(&s) {
                            pending.push(s);
                        }
                    }
                    if !pending.is_empty() && deadline.is_none() {
                        deadline = Some(Instant::now() + Duration::from_millis(400));
                    }
                }
                Ok(Err(_)) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if !pending.is_empty() {
                        let _ = app.emit("fs://changed", ChangedPayload { id: id.clone(), paths: std::mem::take(&mut pending) });
                    }
                    deadline = None;
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn unwatch_path(state: State<'_, WatchState>, id: String) -> Result<(), String> {
    state.watchers.lock().map_err(|_| "watch state poisoned")?.remove(&id);
    Ok(())
}

/// Editors and tools write scratch files all the time; those never count as a change.
fn is_noise(path: &str) -> bool {
    let p = path.replace('\\', "/");
    p.contains("/.git/") || p.contains("/node_modules/") || p.contains("/target/") || p.contains("/dist/") || p.ends_with('~') || p.ends_with(".swp") || p.ends_with(".tmp") || p.contains("/.zorynq-")
}

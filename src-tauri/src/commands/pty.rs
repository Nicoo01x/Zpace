//! Pseudo terminals through `portable-pty`: ConPTY on Windows, forkpty on
//! macOS / Linux. Output is streamed to the webview as base64 chunks on the
//! `pty://data` event; process exit arrives on `pty://exit`.

use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

pub struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<String, PtyHandle>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySpawnOptions {
    pub shell: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Serialize, Clone)]
struct DataPayload<'a> {
    id: &'a str,
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitPayload<'a> {
    id: &'a str,
    code: Option<u32>,
}

/// Environment inherited from whatever launched the app that has no business inside a fresh shell.
const LAUNCHER_ENV: &[&str] = &[
    "NO_COLOR",
    "FORCE_COLOR",
    "CLICOLOR",
    "CLICOLOR_FORCE",
    "CLAUDECODE",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
    "AI_AGENT",
    "CI",
    "TERM_PROGRAM",
    "TERM_PROGRAM_VERSION",
    "WT_SESSION",
    "WT_PROFILE_ID",
    "VSCODE_INJECTION",
    "VSCODE_GIT_IPC_HANDLE",
    "VSCODE_PID",
    "VSCODE_CWD",
];

#[tauri::command]
pub fn pty_spawn(app: AppHandle, state: State<'_, PtyState>, opts: PtySpawnOptions) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: opts.rows.max(2), cols: opts.cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    // npm-style shims (`claude.cmd`, `opencode.cmd`, `.ps1`) are scripts: ConPTY can only start real
    // executables, so they go through their interpreter — otherwise the tab dies before the prompt.
    let lower = opts.shell.to_ascii_lowercase();
    let mut cmd = if cfg!(windows) && (lower.ends_with(".cmd") || lower.ends_with(".bat")) {
        let mut c = CommandBuilder::new("cmd.exe");
        c.args(["/d", "/c", &opts.shell]);
        c.args(&opts.args);
        c
    } else if cfg!(windows) && lower.ends_with(".ps1") {
        let mut c = CommandBuilder::new(if which::which("pwsh.exe").is_ok() { "pwsh.exe" } else { "powershell.exe" });
        c.args(["-NoLogo", "-ExecutionPolicy", "Bypass", "-File", &opts.shell]);
        c.args(&opts.args);
        c
    } else {
        let mut c = CommandBuilder::new(&opts.shell);
        c.args(&opts.args);
        c
    };
    // A project folder can disappear (moved, unmounted drive); fall back to the home dir instead of failing.
    match opts.cwd.as_deref().filter(|c| !c.is_empty() && std::path::Path::new(c).is_dir()) {
        Some(cwd) => cmd.cwd(cwd),
        None => {
            if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
                cmd.cwd(home);
            }
        }
    }
    // Shells must not inherit the launcher's terminal state: if Zpace itself was started
    // from another terminal or an agent session, variables like NO_COLOR or CLAUDECODE would
    // strip prompt colours (oh-my-posh, starship) and confuse nested CLIs.
    for key in LAUNCHER_ENV {
        cmd.env_remove(key);
    }
    for (k, _) in std::env::vars() {
        if k.starts_with("CLAUDE_CODE_") || k.starts_with("CLAUDE_") {
            cmd.env_remove(&k);
        }
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    for (k, v) in &opts.env {
        cmd.env(k, v);
    }
    // Let shells and CLIs (including Claude Code) know they run inside Zpace.
    cmd.env("TERM_PROGRAM", "Zpace");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        let msg = e.to_string();
        // ConPTY wraps the OS error in a CreateProcessW dump; say what matters.
        if msg.contains("os error 2") || msg.contains("os error 3") || msg.contains("cannot find the file") || msg.contains("no se puede encontrar") {
            format!("`{}` was not found. Is it installed and on PATH?", opts.shell)
        } else if msg.contains("os error 193") {
            format!("`{}` is not a Windows executable.", opts.shell)
        } else if let Some(i) = msg.find("(os error") {
            format!("`{}` could not start: {}", opts.shell, msg[i..].trim_matches(|c| c == '(' || c == ')'))
        } else {
            msg
        }
    })?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();

    // Reader thread → pty://data
    {
        let app = app.clone();
        let id = id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                        let _ = app.emit("pty://data", DataPayload { id: &id, data });
                    }
                }
            }
        });
    }

    state.sessions.lock().unwrap().insert(id.clone(), PtyHandle { master: pair.master, writer, child });

    // Wait thread → pty://exit (polls so we never hold the lock while blocking)
    {
        let app = app.clone();
        let id = id.clone();
        let sessions = state.sessions.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let mut guard = sessions.lock().unwrap();
            let Some(h) = guard.get_mut(&id) else { break };
            match h.child.try_wait() {
                Ok(Some(status)) => {
                    let code = Some(status.exit_code());
                    guard.remove(&id);
                    drop(guard);
                    let _ = app.emit("pty://exit", ExitPayload { id: &id, code });
                    break;
                }
                Ok(None) => {}
                Err(_) => {
                    guard.remove(&id);
                    drop(guard);
                    let _ = app.emit("pty://exit", ExitPayload { id: &id, code: None });
                    break;
                }
            }
        });
    }

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut guard = state.sessions.lock().unwrap();
    let h = guard.get_mut(&id).ok_or("pty not found")?;
    h.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    h.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<'_, PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.sessions.lock().unwrap();
    let h = guard.get(&id).ok_or("pty not found")?;
    h.master
        .resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut guard = state.sessions.lock().unwrap();
    if let Some(mut h) = guard.remove(&id) {
        let _ = h.child.kill();
    }
    Ok(())
}

//! Line-oriented child processes (no PTY). Used for Claude Code's
//! `--output-format stream-json` mode: each stdout line is one JSON event.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use super::quiet_command;

pub struct ProcessHandle {
    child: Child,
    stdin: Option<ChildStdin>,
}

#[derive(Default)]
pub struct ProcessState {
    procs: Arc<Mutex<HashMap<String, ProcessHandle>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSpawnOptions {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Serialize, Clone)]
struct LinePayload<'a> {
    id: &'a str,
    stream: &'a str,
    line: String,
}

#[derive(Serialize, Clone)]
struct ExitPayload<'a> {
    id: &'a str,
    code: Option<i32>,
}

/// Resolve `program` through PATH. npm-installed CLIs on Windows are `.cmd`
/// shims that must be launched through `cmd.exe /C`.
fn resolve(program: &str, args: &[String]) -> (String, Vec<String>) {
    let resolved: PathBuf = which::which(program).unwrap_or_else(|_| PathBuf::from(program));
    let is_cmd_shim = resolved.extension().map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat")).unwrap_or(false);
    if cfg!(windows) && is_cmd_shim {
        let mut a = vec!["/C".to_string(), resolved.to_string_lossy().into_owned()];
        a.extend(args.iter().cloned());
        ("cmd".to_string(), a)
    } else {
        (resolved.to_string_lossy().into_owned(), args.to_vec())
    }
}

#[tauri::command]
pub fn process_spawn(app: AppHandle, state: State<'_, ProcessState>, opts: ProcessSpawnOptions) -> Result<String, String> {
    let (program, args) = resolve(&opts.program, &opts.args);
    let mut cmd = quiet_command(&program);
    cmd.args(&args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(cwd) = opts.cwd.as_deref().filter(|c| !c.is_empty()) {
        cmd.current_dir(cwd);
    }
    cmd.envs(&opts.env);
    cmd.env("TERM_PROGRAM", "Zpace");

    let mut child = cmd.spawn().map_err(|e| format!("failed to start {} (resolved {}, cwd {:?}): {e}", opts.program, program, opts.cwd))?;
    let id = uuid::Uuid::new_v4().to_string();
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    for (stream, pipe) in [("stdout", stdout.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>)), ("stderr", stderr.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>))] {
        let Some(pipe) = pipe else { continue };
        let app = app.clone();
        let id = id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(pipe);
            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        let _ = app.emit("process://line", LinePayload { id: &id, stream, line });
                    }
                    Err(_) => break,
                }
            }
        });
    }

    state.procs.lock().unwrap().insert(id.clone(), ProcessHandle { child, stdin });

    {
        let app = app.clone();
        let id = id.clone();
        let procs = state.procs.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let mut guard = procs.lock().unwrap();
            let Some(h) = guard.get_mut(&id) else { break };
            match h.child.try_wait() {
                Ok(Some(status)) => {
                    let code = status.code();
                    guard.remove(&id);
                    drop(guard);
                    let _ = app.emit("process://exit", ExitPayload { id: &id, code });
                    break;
                }
                Ok(None) => {}
                Err(_) => {
                    guard.remove(&id);
                    drop(guard);
                    let _ = app.emit("process://exit", ExitPayload { id: &id, code: None });
                    break;
                }
            }
        });
    }

    Ok(id)
}

#[tauri::command]
pub fn process_write(state: State<'_, ProcessState>, id: String, data: String) -> Result<(), String> {
    let mut guard = state.procs.lock().unwrap();
    let h = guard.get_mut(&id).ok_or("process not found")?;
    let stdin = h.stdin.as_mut().ok_or("stdin closed")?;
    stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn process_kill(state: State<'_, ProcessState>, id: String) -> Result<(), String> {
    let mut guard = state.procs.lock().unwrap();
    if let Some(mut h) = guard.remove(&id) {
        drop(h.stdin.take());
        let _ = h.child.kill();
    }
    Ok(())
}

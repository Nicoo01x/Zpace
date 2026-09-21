//! A small MCP server over HTTP for the voice assistant: Claude Code (headless)
//! connects to `http://127.0.0.1:<port>/mcp` and calls tools that the webview
//! carries out. The server only relays: the tool list comes from the page
//! (`mcp_set_tools`), each `tools/call` is emitted to the main window as
//! `mcp://call` and answered with `mcp_reply`. Loopback only, one port per
//! launch, started on first use.

use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tiny_http::{Header, Method, Response, Server};

#[derive(Default)]
struct Inner {
    port: u16,
    tools: Value,
    pending: HashMap<String, mpsc::Sender<Value>>,
    next: u64,
}

#[derive(Default, Clone)]
pub struct McpState(Arc<Mutex<Inner>>);

/// How long a tool call may take before the client gets an error (the page may be asking the user something).
const CALL_TIMEOUT: Duration = Duration::from_secs(120);

/// Start the server if it is not running yet; returns its port.
#[tauri::command(async)]
pub fn mcp_start(app: AppHandle, state: State<'_, McpState>) -> Result<u16, String> {
    {
        let inner = state.0.lock().map_err(|e| e.to_string())?;
        if inner.port != 0 {
            return Ok(inner.port);
        }
    }
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("no port")?;
    state.0.lock().map_err(|e| e.to_string())?.port = port;
    let shared = state.0.clone();
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let app = app.clone();
            let shared = shared.clone();
            // Each request on its own thread: a tool call waits for the page while pings keep flowing.
            std::thread::spawn(move || handle(request, &app, &shared));
        }
    });
    Ok(port)
}

/// The tools the page serves, as MCP tool definitions (`[{ name, description, inputSchema }]`).
#[tauri::command]
pub fn mcp_set_tools(state: State<'_, McpState>, tools: Value) -> Result<(), String> {
    state.0.lock().map_err(|e| e.to_string())?.tools = tools;
    Ok(())
}

/// The page's answer to a `mcp://call`: `{ text, isError? }`.
#[tauri::command]
pub fn mcp_reply(state: State<'_, McpState>, id: String, result: Value) -> Result<(), String> {
    let tx = state.0.lock().map_err(|e| e.to_string())?.pending.remove(&id);
    if let Some(tx) = tx {
        let _ = tx.send(result);
    }
    Ok(())
}

fn handle(mut request: tiny_http::Request, app: &AppHandle, shared: &Arc<Mutex<Inner>>) {
    let json_header = Header::from_bytes("Content-Type", "application/json").expect("header");
    if request.url().split('?').next() != Some("/mcp") {
        let _ = request.respond(Response::from_string("not found").with_status_code(404));
        return;
    }
    match request.method() {
        Method::Post => {}
        // No server-initiated stream: the client falls back to plain request/response.
        Method::Get => {
            let _ = request.respond(Response::from_string("").with_status_code(405));
            return;
        }
        _ => {
            let _ = request.respond(Response::from_string("").with_status_code(200));
            return;
        }
    }
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(Response::from_string("bad request").with_status_code(400));
        return;
    }
    let message: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => {
            let _ = request.respond(Response::from_string("bad json").with_status_code(400));
            return;
        }
    };
    // A batch is answered message by message; notifications get no reply at all.
    let messages: Vec<Value> = match message {
        Value::Array(list) => list,
        other => vec![other],
    };
    let mut replies = Vec::new();
    for m in messages {
        if let Some(reply) = rpc(&m, app, shared) {
            replies.push(reply);
        }
    }
    let response = match replies.len() {
        0 => Response::from_string("").with_status_code(202),
        1 => Response::from_string(replies.remove(0).to_string()).with_header(json_header),
        _ => Response::from_string(Value::Array(replies).to_string()).with_header(json_header),
    };
    let _ = request.respond(response);
}

fn rpc(m: &Value, app: &AppHandle, shared: &Arc<Mutex<Inner>>) -> Option<Value> {
    let id = m.get("id").cloned();
    let method = m.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let params = m.get("params").cloned().unwrap_or(Value::Null);
    let id = id?;
    let result = match method {
        "initialize" => {
            let version = params.get("protocolVersion").and_then(|v| v.as_str()).unwrap_or("2025-03-26");
            Ok(json!({
                "protocolVersion": version,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "zpace", "version": env!("CARGO_PKG_VERSION") }
            }))
        }
        "ping" => Ok(json!({})),
        "tools/list" => {
            let tools = shared.lock().map(|i| i.tools.clone()).unwrap_or(Value::Null);
            Ok(json!({ "tools": if tools.is_array() { tools } else { json!([]) } }))
        }
        "tools/call" => call(&params, app, shared),
        _ => Err((-32601, format!("unknown method {method}"))),
    };
    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
    })
}

fn call(params: &Value, app: &AppHandle, shared: &Arc<Mutex<Inner>>) -> Result<Value, (i64, String)> {
    let name = params.get("name").and_then(|v| v.as_str()).ok_or((-32602, "missing tool name".to_string()))?;
    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
    let (tx, rx) = mpsc::channel::<Value>();
    let call_id = {
        let mut inner = shared.lock().map_err(|e| (-32603, e.to_string()))?;
        inner.next += 1;
        let id = format!("call-{}", inner.next);
        inner.pending.insert(id.clone(), tx);
        id
    };
    app.emit_to("main", "mcp://call", json!({ "id": call_id, "name": name, "arguments": arguments }))
        .map_err(|e| (-32603, e.to_string()))?;
    let reply = rx.recv_timeout(CALL_TIMEOUT);
    if let Ok(mut inner) = shared.lock() {
        inner.pending.remove(&call_id);
    }
    let reply = reply.map_err(|_| (-32603, "the app did not answer in time".to_string()))?;
    let text = reply.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let is_error = reply.get("isError").and_then(|v| v.as_bool()).unwrap_or(false);
    Ok(json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }))
}

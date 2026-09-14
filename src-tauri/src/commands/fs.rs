//! Project file listing for quick-open. Walks the tree once, skipping the
//! usual noise (VCS, dependencies, build output) and stops at a hard cap.

use std::path::Path;

pub const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".cache",
    ".venv",
    "venv",
    "__pycache__",
    ".idea",
    ".vs",
    "coverage",
    ".gradle",
    "Pods",
    "DerivedData",
];

fn walk(root: &Path, dir: &Path, out: &mut Vec<String>, limit: usize) {
    if out.len() >= limit {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut items: Vec<_> = entries.flatten().collect();
    items.sort_by_key(|e| e.file_name());
    for entry in items {
        if out.len() >= limit {
            return;
        }
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            if SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            walk(root, &path, out, limit);
        } else if ft.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

#[tauri::command]
pub fn list_files(root: String, limit: Option<usize>) -> Vec<String> {
    let mut out = Vec::new();
    walk(Path::new(&root), Path::new(&root), &mut out, limit.unwrap_or(20_000));
    out
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out: Vec<DirEntry> = entries
        .flatten()
        .filter_map(|e| {
            let ft = e.file_type().ok()?;
            Some(DirEntry { name: e.file_name().to_string_lossy().into_owned(), is_dir: ft.is_dir() })
        })
        .collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub fn read_text_file(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let cap = max_bytes.unwrap_or(2_000_000);
    if meta.len() > cap {
        return Err(format!("File is too large to preview ({} bytes)", meta.len()));
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.iter().take(8000).any(|b| *b == 0) {
        return Err("Binary file".into());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// The first `max_bytes` of any file, base64-encoded, plus its size — the hex view of
/// binaries the editor cannot show.
#[tauri::command]
pub fn read_file_head(path: String, max_bytes: Option<usize>) -> Result<FileHead, String> {
    use base64::Engine;
    use std::io::Read;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let cap = max_bytes.unwrap_or(4096);
    let mut buf = vec![0u8; cap.min(meta.len() as usize)];
    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let n = f.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(FileHead { size: meta.len(), base64: base64::engine::general_purpose::STANDARD.encode(&buf) })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHead {
    pub size: u64,
    pub base64: String,
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Copy a file (parents of the target created; an existing target is replaced) — a custom agent's library takes copies.
#[tauri::command]
pub fn copy_file(from: String, to: String) -> Result<u64, String> {
    let target = Path::new(&to);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&from, target).map_err(|e| e.to_string())
}

/// New empty file (parents created); refuses to overwrite.
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("Already exists".into());
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, b"").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("Already exists".into());
    }
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// Rename / move within the file system; refuses to clobber an existing target.
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() && from.to_lowercase() != to.to_lowercase() {
        return Err("A file with that name already exists".into());
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// Send to the Recycle Bin / Trash — never a hard delete.
#[tauri::command]
pub fn trash_path(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

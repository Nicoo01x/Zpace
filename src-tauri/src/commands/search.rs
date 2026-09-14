//! Text search across a project tree: a plain walker (same skip list as the
//! file index) reading files that look like text, matching a literal or a
//! regular expression, case-insensitive by default. Capped so a huge tree
//! answers quickly; the frontend shows the cap.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use regex::RegexBuilder;
use serde::Serialize;

use super::fs::SKIP_DIRS;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub rel: String,
    pub line: usize,
    pub column: usize,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    pub files_scanned: usize,
    pub truncated: bool,
}

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
/// Total text kept in memory across projects, so a repeat search does not touch the disk (OneDrive, antivirus).
const CACHE_BYTES: usize = 160 * 1024 * 1024;

/// One file's text as last read, with what identifies that read.
#[derive(Clone)]
struct Cached {
    modified: Option<SystemTime>,
    len: u64,
    text: Arc<str>,
    used: u64,
}

static CACHE: OnceLock<Mutex<HashMap<PathBuf, Cached>>> = OnceLock::new();
static TICK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn cache() -> &'static Mutex<HashMap<PathBuf, Cached>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Keep the cache under budget: the least recently used entries go first.
fn trim_cache() {
    let Ok(mut map) = cache().lock() else { return };
    let mut total: usize = map.values().map(|c| c.text.len()).sum();
    if total <= CACHE_BYTES {
        return;
    }
    let mut entries: Vec<(PathBuf, u64, usize)> = map.iter().map(|(p, c)| (p.clone(), c.used, c.text.len())).collect();
    entries.sort_by_key(|e| e.1);
    for (path, _, len) in entries {
        if total <= CACHE_BYTES * 3 / 4 {
            break;
        }
        map.remove(&path);
        total -= len;
    }
}

/// The file's text: from the cache when nothing changed, else read and remembered.
fn text_of(path: &Path, meta: &fs::Metadata) -> Option<Arc<str>> {
    let modified = meta.modified().ok();
    let len = meta.len();
    let now = TICK.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if let Ok(mut map) = cache().lock() {
        if let Some(c) = map.get_mut(path) {
            if c.modified == modified && c.len == len {
                c.used = now;
                return Some(Arc::clone(&c.text));
            }
        }
    }
    let bytes = fs::read(path).ok()?;
    if looks_binary(&bytes) {
        return None;
    }
    let text: Arc<str> = Arc::from(String::from_utf8_lossy(&bytes).as_ref());
    if let Ok(mut map) = cache().lock() {
        map.insert(path.to_path_buf(), Cached { modified, len, text: Arc::clone(&text), used: now });
    }
    Some(text)
}
/// Never worth opening: media, archives, binaries, fonts, lockfiles.
const SKIP_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "icns", "svgz", "psd", "ai", "mp3", "wav", "ogg", "flac", "m4a", "mp4", "mov", "mkv", "avi", "webm", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "jar", "exe", "dll", "so", "dylib", "bin", "dat", "pdb", "lib", "obj", "o", "a", "wasm", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "ttf", "otf", "woff", "woff2", "eot", "db", "sqlite", "sqlite3", "lock", "map", "min.js",
];

/// OneDrive / cloud placeholders: reading them downloads them — skip.
#[cfg(windows)]
fn is_cloud_placeholder(meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const OFFLINE: u32 = 0x1000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
    const RECALL_ON_OPEN: u32 = 0x0004_0000;
    meta.file_attributes() & (OFFLINE | RECALL_ON_DATA_ACCESS | RECALL_ON_OPEN) != 0
}
#[cfg(not(windows))]
fn is_cloud_placeholder(_meta: &fs::Metadata) -> bool {
    false
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(1024).any(|b| *b == 0)
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<PathBuf>, limit: usize) {
    if out.len() >= limit {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
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
            collect(root, &path, out, limit);
        } else if ft.is_file() {
            out.push(path);
        }
    }
}

/// Search `query` under `root`. `regex` switches from literal to pattern; `case_sensitive` off by default.
/// `include` is an optional comma-separated list of extensions or glob-ish suffixes ("ts,tsx" / ".md").
#[tauri::command]
pub fn search_text(root: String, query: String, regex: Option<bool>, case_sensitive: Option<bool>, include: Option<String>, max_hits: Option<usize>, budget_ms: Option<u64>) -> Result<SearchResult, String> {
    if query.trim().is_empty() {
        return Ok(SearchResult { hits: vec![], files_scanned: 0, truncated: false });
    }
    let pattern = if regex.unwrap_or(false) { query.clone() } else { regex::escape(&query) };
    let re = RegexBuilder::new(&pattern).case_insensitive(!case_sensitive.unwrap_or(false)).build().map_err(|e| e.to_string())?;
    let exts: Vec<String> = include
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().trim_start_matches('*').trim_start_matches('.').to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    let cap = max_hits.unwrap_or(2000);
    let deadline = Instant::now() + Duration::from_millis(budget_ms.unwrap_or(4000));
    let root_path = Path::new(&root);
    let mut files = Vec::new();
    collect(root_path, root_path, &mut files, 40_000);
    // Reads are what cost (antivirus scanning, network drives): a handful of threads take a slice each and
    // stop at the deadline; hits come back in path order.
    let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 8);
    let chunk = files.len().div_ceil(workers).max(1);
    let re = std::sync::Arc::new(re);
    let exts = std::sync::Arc::new(exts);
    let results: Vec<(Vec<SearchHit>, usize, bool)> = std::thread::scope(|scope| {
        let handles: Vec<_> = files
            .chunks(chunk)
            .map(|slice| {
                let re = std::sync::Arc::clone(&re);
                let exts = std::sync::Arc::clone(&exts);
                let root_path = root_path.to_path_buf();
                let per_thread_cap = cap;
                scope.spawn(move || {
                    let mut hits = Vec::new();
                    let mut scanned = 0usize;
                    let mut truncated = false;
                    'files: for path in slice {
                        if Instant::now() > deadline {
                            truncated = true;
                            break;
                        }
                        let ext_lower = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
                        if SKIP_EXT.contains(&ext_lower.as_str()) {
                            continue;
                        }
                        if !exts.is_empty() && !exts.iter().any(|x| *x == ext_lower) {
                            continue;
                        }
                        let Ok(meta) = fs::metadata(path) else { continue };
                        if meta.len() > MAX_FILE_BYTES || is_cloud_placeholder(&meta) {
                            continue;
                        }
                        let Some(text) = text_of(path, &meta) else { continue };
                        scanned += 1;
                        let rel = path.strip_prefix(&root_path).map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_else(|_| path.to_string_lossy().into_owned());
                        for (i, line) in text.lines().enumerate() {
                            if let Some(m) = re.find(line) {
                                let column = line[..m.start()].chars().count() + 1;
                                let shown = if line.len() > 400 {
                                    let start = m.start().saturating_sub(120);
                                    let start = line.char_indices().map(|(i, _)| i).filter(|i| *i <= start).last().unwrap_or(0);
                                    let end = line.char_indices().map(|(i, _)| i).find(|i| *i >= (start + 320).min(line.len())).unwrap_or(line.len());
                                    format!("…{}…", &line[start..end])
                                } else {
                                    line.to_string()
                                };
                                hits.push(SearchHit { path: path.to_string_lossy().into_owned(), rel: rel.clone(), line: i + 1, column, text: shown });
                                if hits.len() >= per_thread_cap {
                                    truncated = true;
                                    break 'files;
                                }
                            }
                        }
                    }
                    (hits, scanned, truncated)
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap_or((Vec::new(), 0, true))).collect()
    });
    let mut hits = Vec::new();
    let mut scanned = 0usize;
    let mut truncated = false;
    for (h, n, t) in results {
        hits.extend(h);
        scanned += n;
        truncated |= t;
    }
    if hits.len() > cap {
        hits.truncate(cap);
        truncated = true;
    }
    trim_cache();
    Ok(SearchResult { hits, files_scanned: scanned, truncated })
}

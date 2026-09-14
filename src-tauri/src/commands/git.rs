//! Git integration through the `git` CLI. Deliberately small and honest:
//! status, log, branches, stage/unstage/discard, commit, push, pull, fetch,
//! checkout, clone and per-file diff material.

use serde::Serialize;

use super::{decode_output, quiet_command};

fn git(path: &str, args: &[&str]) -> Result<String, String> {
    let output = quiet_command("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .map_err(|e| format!("git not available: {e}"))?;
    if output.status.success() {
        Ok(decode_output(&output.stdout))
    } else {
        let err = decode_output(&output.stderr);
        Err(if err.trim().is_empty() { format!("git {} failed", args.join(" ")) } else { err.trim().to_string() })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSummary {
    pub branch: String,
    pub dirty: u32,
    pub ahead: u32,
    pub behind: u32,
    pub is_repo: bool,
}

#[tauri::command]
pub fn git_summary(path: String) -> GitSummary {
    let Ok(branch) = git(&path, &["rev-parse", "--abbrev-ref", "HEAD"]) else {
        return GitSummary { branch: String::new(), dirty: 0, ahead: 0, behind: 0, is_repo: false };
    };
    let dirty = git(&path, &["status", "--porcelain"]).map(|s| s.lines().filter(|l| !l.trim().is_empty()).count() as u32).unwrap_or(0);
    let (ahead, behind) = git(&path, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
        .ok()
        .and_then(|s| {
            let mut it = s.split_whitespace();
            Some((it.next()?.parse().ok()?, it.next()?.parse().ok()?))
        })
        .unwrap_or((0, 0));
    GitSummary { branch: branch.trim().to_string(), dirty, ahead, behind, is_repo: true }
}

#[derive(Serialize)]
pub struct FileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[tauri::command]
pub fn git_status_files(path: String) -> Result<Vec<FileStatus>, String> {
    let out = git(&path, &["status", "--porcelain", "--untracked-files=all"])?;
    let mut files = Vec::new();
    for line in out.lines() {
        if line.len() < 4 {
            continue;
        }
        let x = line.as_bytes()[0] as char;
        let y = line.as_bytes()[1] as char;
        let file = line[3..].trim().trim_matches('"').to_string();
        let file = file.split(" -> ").last().unwrap_or(&file).to_string();
        if x == '?' && y == '?' {
            files.push(FileStatus { path: file, status: "U".into(), staged: false });
            continue;
        }
        if matches!(x, 'M' | 'A' | 'D' | 'R' | 'C') {
            files.push(FileStatus { path: file.clone(), status: x.to_string(), staged: true });
        }
        if matches!(y, 'M' | 'D') {
            files.push(FileStatus { path: file, status: y.to_string(), staged: false });
        }
    }
    Ok(files)
}

#[derive(Serialize)]
pub struct Commit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub email: String,
    pub date: String,
}

#[tauri::command]
pub fn git_log(path: String, limit: Option<u32>) -> Result<Vec<Commit>, String> {
    let n = limit.unwrap_or(30).to_string();
    let out = git(&path, &["log", "-n", &n, "--pretty=format:%h%x1f%s%x1f%an%x1f%ae%x1f%cr"])?;
    Ok(out
        .lines()
        .filter_map(|l| {
            let mut p = l.split('\u{1f}');
            Some(Commit {
                hash: p.next()?.to_string(),
                subject: p.next()?.to_string(),
                author: p.next()?.to_string(),
                email: p.next()?.to_string(),
                date: p.next()?.to_string(),
            })
        })
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub subject: String,
    pub date: String,
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<Branch>, String> {
    let out = git(
        &path,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(HEAD)%1f%(refname:short)%1f%(upstream:short)%1f%(upstream:track)%1f%(contents:subject)%1f%(committerdate:relative)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    let remotes = git_remote_names(&path);
    let mut list = Vec::new();
    for line in out.lines() {
        let mut p = line.split('\u{1f}');
        let head = p.next().unwrap_or("");
        let name = p.next().unwrap_or("").to_string();
        if name.is_empty() || name.ends_with("/HEAD") {
            continue;
        }
        let upstream = p.next().unwrap_or("").to_string();
        let track = p.next().unwrap_or("");
        let subject = p.next().unwrap_or("").to_string();
        let date = p.next().unwrap_or("").to_string();
        let ahead = track.split("ahead ").nth(1).and_then(|s| s.trim_end_matches(']').split([',', ' ']).next()).and_then(|n| n.parse().ok()).unwrap_or(0);
        let behind = track.split("behind ").nth(1).and_then(|s| s.trim_end_matches(']').split([',', ' ']).next()).and_then(|n| n.parse().ok()).unwrap_or(0);
        let remote = remotes.iter().any(|r| name.starts_with(&format!("{r}/")));
        list.push(Branch {
            name,
            current: head.trim() == "*",
            remote,
            upstream: if upstream.is_empty() { None } else { Some(upstream) },
            ahead,
            behind,
            subject,
            date,
        });
    }
    Ok(list)
}

fn git_remote_names(path: &str) -> Vec<String> {
    git(path, &["remote"]).map(|s| s.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect()).unwrap_or_default()
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String, create: Option<bool>) -> Result<String, String> {
    if create.unwrap_or(false) {
        git(&path, &["checkout", "-b", &branch])
    } else if branch.starts_with("origin/") {
        // Track the remote branch locally.
        let local = branch.trim_start_matches("origin/");
        git(&path, &["checkout", "--track", &branch]).or_else(|_| git(&path, &["checkout", local]))
    } else {
        git(&path, &["checkout", &branch])
    }
}

#[tauri::command]
pub fn git_delete_branch(path: String, branch: String) -> Result<String, String> {
    git(&path, &["branch", "-d", &branch])
}

#[tauri::command]
pub fn git_fetch(path: String) -> Result<String, String> {
    git(&path, &["fetch", "--prune"])
}

#[tauri::command]
pub fn git_stage(path: String, file: String) -> Result<(), String> {
    git(&path, &["add", "--", &file]).map(|_| ())
}

#[tauri::command]
pub fn git_stage_all(path: String) -> Result<(), String> {
    git(&path, &["add", "-A"]).map(|_| ())
}

#[tauri::command]
pub fn git_unstage(path: String, file: String) -> Result<(), String> {
    git(&path, &["restore", "--staged", "--", &file]).map(|_| ())
}

#[tauri::command]
pub fn git_discard(path: String, file: String) -> Result<(), String> {
    // Tracked → restore working tree; untracked → remove.
    if git(&path, &["ls-files", "--error-unmatch", "--", &file]).is_ok() {
        git(&path, &["checkout", "--", &file]).map(|_| ())
    } else {
        git(&path, &["clean", "-f", "--", &file]).map(|_| ())
    }
}

#[tauri::command]
pub fn git_commit(path: String, message: String) -> Result<String, String> {
    git(&path, &["commit", "-m", &message])
}

#[tauri::command]
pub fn git_push(path: String) -> Result<String, String> {
    // First push of a new branch needs an upstream.
    match git(&path, &["push"]) {
        Ok(s) => Ok(s),
        Err(e) if e.contains("no upstream") || e.contains("--set-upstream") => {
            let branch = git(&path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
            git(&path, &["push", "-u", "origin", branch.trim()])
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    git(&path, &["pull", "--ff-only"])
}

#[tauri::command]
pub fn git_clone(url: String, dest: String) -> Result<String, String> {
    let output = quiet_command("git")
        .args(["clone", "--progress", &url, &dest])
        .output()
        .map_err(|e| format!("git not available: {e}"))?;
    if output.status.success() {
        Ok(dest)
    } else {
        Err(decode_output(&output.stderr).trim().to_string())
    }
}

#[derive(Serialize)]
pub struct FileDiff {
    pub original: String,
    pub modified: String,
}

/// The file at `base` (HEAD by default) vs. the working tree, relative to the repo root.
#[tauri::command]
pub fn git_diff_file(path: String, file: String, base: Option<String>) -> Result<FileDiff, String> {
    let at = base.as_deref().map(str::trim).filter(|b| !b.is_empty()).unwrap_or("HEAD");
    let original = git(&path, &["show", &format!("{at}:{}", file.replace('\\', "/"))]).unwrap_or_default();
    let full = std::path::Path::new(&path).join(&file);
    let modified = std::fs::read_to_string(&full).unwrap_or_default();
    Ok(FileDiff { original, modified })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCount {
    pub date: String,
    pub count: u32,
}

/// Commits per day over the last `days` (default 365), oldest first — the contribution map.
#[tauri::command]
pub fn git_activity(path: String, days: Option<u32>) -> Result<Vec<DayCount>, String> {
    let since = format!("{} days ago", days.unwrap_or(365));
    let out = git(&path, &["log", "--since", &since, "--date=short", "--pretty=format:%ad"])?;
    let mut counts: std::collections::BTreeMap<String, u32> = std::collections::BTreeMap::new();
    for line in out.lines() {
        let d = line.trim();
        if d.len() == 10 {
            *counts.entry(d.to_string()).or_insert(0) += 1;
        }
    }
    Ok(counts.into_iter().map(|(date, count)| DayCount { date, count }).collect())
}

/// `git config user.name` (global or repo), for greetings.
#[tauri::command]
pub fn git_user_name(path: Option<String>) -> Option<String> {
    let dir = path.unwrap_or_else(|| ".".to_string());
    git(&dir, &["config", "user.name"]).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHead {
    pub sha: String,
    pub branch: String,
}

/// Where the checkout is right now: the commit and the branch name ("HEAD" when detached).
#[tauri::command]
pub fn git_head(path: String) -> Result<GitHead, String> {
    let sha = git(&path, &["rev-parse", "HEAD"])?.trim().to_string();
    let branch = git(&path, &["rev-parse", "--abbrev-ref", "HEAD"])?.trim().to_string();
    Ok(GitHead { sha, branch })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub file: String,
    /// M, A or D.
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
}

fn count_lines(path: &std::path::Path) -> u32 {
    match std::fs::metadata(path) {
        Ok(m) if m.len() <= 2_000_000 => match std::fs::read(path) {
            Ok(bytes) if !bytes.iter().take(8000).any(|b| *b == 0) => bytes.iter().filter(|b| **b == b'\n').count() as u32 + u32::from(!bytes.is_empty() && !bytes.ends_with(b"\n")),
            _ => 0,
        },
        _ => 0,
    }
}

/// Everything that differs between `base` (HEAD by default) and the working tree — committed or not — plus untracked
/// files, with their line counts. What an agent did in its worktree, in one list.
#[tauri::command]
pub fn git_changes(path: String, base: Option<String>) -> Result<Vec<ChangedFile>, String> {
    let at = base.as_deref().map(str::trim).filter(|b| !b.is_empty()).unwrap_or("HEAD").to_string();
    let mut out: Vec<ChangedFile> = Vec::new();
    let status = git(&path, &["diff", "--name-status", "--no-renames", &at, "--"])?;
    let mut kinds: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for line in status.lines() {
        let mut parts = line.splitn(2, '\t');
        let (Some(k), Some(f)) = (parts.next(), parts.next()) else { continue };
        kinds.insert(f.trim().to_string(), k.chars().next().unwrap_or('M').to_string());
    }
    let numstat = git(&path, &["diff", "--numstat", "--no-renames", &at, "--"])?;
    for line in numstat.lines() {
        let mut parts = line.splitn(3, '\t');
        let (Some(a), Some(d), Some(f)) = (parts.next(), parts.next(), parts.next()) else { continue };
        let file = f.trim().to_string();
        let status = kinds.get(&file).cloned().unwrap_or_else(|| "M".to_string());
        out.push(ChangedFile { file, status, additions: a.parse().unwrap_or(0), deletions: d.parse().unwrap_or(0) });
    }
    let untracked = git(&path, &["ls-files", "--others", "--exclude-standard"])?;
    for line in untracked.lines() {
        let f = line.trim();
        if f.is_empty() {
            continue;
        }
        let additions = count_lines(&std::path::Path::new(&path).join(f));
        out.push(ChangedFile { file: f.to_string(), status: "A".to_string(), additions, deletions: 0 });
    }
    out.sort_by(|a, b| a.file.to_lowercase().cmp(&b.file.to_lowercase()));
    Ok(out)
}

/// Stage everything and commit; `false` when there was nothing to commit.
#[tauri::command]
pub fn git_commit_all(path: String, message: String) -> Result<bool, String> {
    git(&path, &["add", "-A"])?;
    let staged = git(&path, &["diff", "--cached", "--quiet"]).is_err();
    if !staged {
        return Ok(false);
    }
    git(&path, &["commit", "-m", &message])?;
    Ok(true)
}

/// Merge `branch` into the current branch with a merge commit. A conflict is backed out (`merge --abort`) and reported
/// with the files involved — the checkout is left as it was.
#[tauri::command]
pub fn git_merge(path: String, branch: String, message: String) -> Result<String, String> {
    match git(&path, &["merge", "--no-ff", "-m", &message, &branch]) {
        Ok(out) => Ok(out),
        Err(e) => {
            let conflicts = git(&path, &["diff", "--name-only", "--diff-filter=U"]).unwrap_or_default();
            let files: Vec<&str> = conflicts.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
            if !files.is_empty() || e.contains("CONFLICT") || e.contains("Automatic merge failed") {
                let _ = git(&path, &["merge", "--abort"]);
                return Err(format!("CONFLICT:{}", files.join("\n")));
            }
            Err(e)
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Worktrees: one checkout per branch, so agents can work in parallel */
/* ------------------------------------------------------------------ */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: String,
    pub head: String,
    pub main: bool,
}

#[tauri::command]
pub fn git_worktrees(path: String) -> Result<Vec<Worktree>, String> {
    let out = git(&path, &["worktree", "list", "--porcelain"])?;
    let mut list = Vec::new();
    let mut cur: Option<Worktree> = None;
    for line in out.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            if let Some(w) = cur.take() {
                list.push(w);
            }
            cur = Some(Worktree { path: p.to_string(), branch: String::new(), head: String::new(), main: list.is_empty() });
        } else if let Some(h) = line.strip_prefix("HEAD ") {
            if let Some(w) = cur.as_mut() {
                w.head = h.to_string();
            }
        } else if let Some(b) = line.strip_prefix("branch ") {
            if let Some(w) = cur.as_mut() {
                w.branch = b.strip_prefix("refs/heads/").unwrap_or(b).to_string();
            }
        } else if line == "detached" {
            if let Some(w) = cur.as_mut() {
                w.branch = "(detached)".to_string();
            }
        }
    }
    if let Some(w) = cur.take() {
        list.push(w);
    }
    Ok(list)
}

/// Create `branch` checked out at `dest`: an existing branch as is, a new one from `base` (HEAD by default —
/// `main`, `origin/main`, a tag, anything `git worktree add -b` accepts).
#[tauri::command]
pub fn git_worktree_add(path: String, dest: String, branch: String, base: Option<String>) -> Result<(), String> {
    let exists = git(&path, &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{branch}")]).is_ok();
    if exists {
        git(&path, &["worktree", "add", &dest, &branch])?;
    } else {
        match base.as_deref().map(str::trim).filter(|b| !b.is_empty()) {
            Some(b) => git(&path, &["worktree", "add", "-b", &branch, &dest, b])?,
            None => git(&path, &["worktree", "add", "-b", &branch, &dest])?,
        };
    }
    Ok(())
}

/// Remove the checkout; with `delete_branch` the branch goes too (forced — the work is the user's call). On Windows
/// the folder often survives as an empty shell while a process that just left it still holds it as its working
/// directory: the entry is gone by then, so the branch is deleted anyway and the folder is retried for a moment.
#[tauri::command]
pub fn git_worktree_remove(path: String, dest: String, force: Option<bool>, delete_branch: Option<String>) -> Result<(), String> {
    let args: &[&str] = if force.unwrap_or(false) { &["worktree", "remove", "--force", &dest] } else { &["worktree", "remove", &dest] };
    let removed = match git(&path, args) {
        Ok(_) => true,
        Err(e) => {
            let _ = git(&path, &["worktree", "prune"]);
            let listed = git(&path, &["worktree", "list", "--porcelain"]).unwrap_or_default();
            let still = listed.lines().any(|l| l.strip_prefix("worktree ").map(|p| same_path(p, &dest)).unwrap_or(false));
            if still {
                return Err(e);
            }
            false
        }
    };
    if !removed || std::path::Path::new(&dest).exists() {
        for attempt in 0..8u64 {
            if std::fs::remove_dir_all(&dest).is_ok() || !std::path::Path::new(&dest).exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(150 * (attempt + 1)));
        }
    }
    if let Some(branch) = delete_branch.as_deref().map(str::trim).filter(|b| !b.is_empty()) {
        git(&path, &["branch", "-D", branch])?;
    }
    // The `<project>.worktrees` folder goes with its last checkout.
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        if parent.to_string_lossy().ends_with(".worktrees") && std::fs::read_dir(parent).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = std::fs::remove_dir(parent);
        }
    }
    Ok(())
}

fn same_path(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.replace('\\', "/").trim_end_matches('/').to_lowercase();
    norm(a) == norm(b)
}

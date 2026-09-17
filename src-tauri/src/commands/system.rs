//! Environment detection: Claude Code, git, node, WSL distros and shells.

use serde::Serialize;
use std::path::{Path, PathBuf};

use super::{decode_output, quiet_command};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolCheck {
    pub found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub path: String,
    pub args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distro: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WslInfo {
    pub available: bool,
    pub distros: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentReport {
    pub platform: String,
    pub claude: ToolCheck,
    pub codex: ToolCheck,
    pub gemini: ToolCheck,
    pub opencode: ToolCheck,
    pub git: ToolCheck,
    pub node: ToolCheck,
    pub wsl: WslInfo,
    pub shells: Vec<ShellInfo>,
    /// Font face configured in Windows Terminal (profiles.defaults.font.face), if any.
    pub terminal_font: Option<String>,
    /// Colour scheme name configured in Windows Terminal, if any.
    pub terminal_scheme: Option<String>,
    /// Installed font families that ship Nerd Font glyphs.
    pub nerd_fonts: Vec<String>,
    /// The account name, for greetings.
    pub user: Option<String>,
}

/// Read Windows Terminal's settings.json for the default font face and colour scheme.
fn detect_windows_terminal() -> (Option<String>, Option<String>) {
    if !cfg!(windows) {
        return (None, None);
    }
    let Some(local) = std::env::var_os("LOCALAPPDATA") else { return (None, None) };
    let packages = PathBuf::from(local).join("Packages");
    let Ok(entries) = std::fs::read_dir(&packages) else { return (None, None) };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if !name.starts_with("Microsoft.WindowsTerminal") {
            continue;
        }
        let file = e.path().join("LocalState").join("settings.json");
        let Ok(text) = std::fs::read_to_string(&file) else { continue };
        // settings.json allows comments; strip // lines before parsing.
        let cleaned: String = text.lines().filter(|l| !l.trim_start().starts_with("//")).collect::<Vec<_>>().join("\n");
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&cleaned) else { continue };
        // Precedence: the default profile's own settings, then profiles.defaults, then any profile.
        let default_guid = json["defaultProfile"].as_str().unwrap_or("");
        let list = json["profiles"]["list"].as_array().cloned().unwrap_or_default();
        let default_profile = list.iter().find(|p| p["guid"].as_str() == Some(default_guid));
        let defaults = &json["profiles"]["defaults"];
        let face_of = |v: &serde_json::Value| v["font"]["face"].as_str().or_else(|| v["fontFace"].as_str()).map(|s| s.to_string());
        let scheme_of = |v: &serde_json::Value| v["colorScheme"].as_str().map(|s| s.to_string());
        let face = default_profile.and_then(face_of).or_else(|| face_of(defaults)).or_else(|| list.iter().find_map(face_of));
        let scheme = default_profile.and_then(scheme_of).or_else(|| scheme_of(defaults)).or_else(|| list.iter().find_map(scheme_of));
        return (face, scheme);
    }
    (None, None)
}

/// Font families registered on the machine whose name says they carry Nerd Font glyphs.
fn detect_nerd_fonts() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    #[cfg(windows)]
    {
        for hive in ["HKLM", "HKCU"] {
            let key = format!(r"{hive}\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts");
            let Ok(output) = quiet_command("reg").args(["query", &key]).output() else { continue };
            let text = decode_output(&output.stdout);
            for line in text.lines() {
                let l = line.trim();
                if !(l.contains("Nerd Font") || l.contains(" NF ") || l.contains(" NF")) {
                    continue;
                }
                // "    SpaceMono Nerd Font Mono (TrueType)    REG_SZ    C:/..."
                let name = l.split("    REG_SZ").next().unwrap_or(l).trim();
                let name = name.trim_end_matches("(TrueType)").trim_end_matches("(OpenType)").trim();
                // Strip style suffixes so we end up with the family name.
                let family = name
                    .replace(" Bold Italic", "")
                    .replace(" Bold", "")
                    .replace(" Italic", "")
                    .replace(" Regular", "")
                    .replace(" Light", "")
                    .replace(" Medium", "")
                    .replace(" SemiBold", "")
                    .replace(" Semibold", "")
                    .replace(" ExtraBold", "")
                    .replace(" Thin", "")
                    .trim()
                    .to_string();
                if !family.is_empty() && !out.contains(&family) {
                    out.push(family);
                }
            }
        }
    }
    out.sort();
    out
}

fn version_of(path: &Path, args: &[&str]) -> Option<String> {
    // `.cmd` shims (npm installs) must go through cmd.exe.
    let output = if path.extension().map(|e| e.eq_ignore_ascii_case("cmd")).unwrap_or(false) {
        let mut c = quiet_command("cmd");
        c.arg("/C").arg(path).args(args);
        c.output().ok()?
    } else {
        let mut c = quiet_command(path.to_str()?);
        c.args(args);
        c.output().ok()?
    };
    let text = decode_output(&output.stdout);
    let line = text.lines().find(|l| !l.trim().is_empty())?.trim().to_string();
    if line.is_empty() {
        None
    } else {
        Some(line)
    }
}

fn check_tool(name: &str, version_args: &[&str]) -> ToolCheck {
    match which::which(name) {
        Ok(mut path) => {
            // npm puts an extension-less bash shim next to the .cmd; only the .cmd starts from ConPTY.
            if cfg!(windows) && path.extension().is_none() {
                let cmd = path.with_extension("cmd");
                if cmd.is_file() {
                    path = cmd;
                }
            }
            ToolCheck {
            found: true,
                version: version_of(&path, version_args),
                path: Some(path.to_string_lossy().into_owned()),
            }
        }
        Err(_) => ToolCheck::default(),
    }
}

fn detect_wsl() -> WslInfo {
    if !cfg!(windows) {
        return WslInfo { available: false, distros: vec![], default: None };
    }
    let Ok(output) = quiet_command("wsl.exe").args(["-l", "-q"]).output() else {
        return WslInfo { available: false, distros: vec![], default: None };
    };
    if !output.status.success() {
        return WslInfo { available: false, distros: vec![], default: None };
    }
    let distros: Vec<String> = decode_output(&output.stdout)
        .lines()
        .map(|l| l.trim().trim_matches('\u{0}').to_string())
        .filter(|l| !l.is_empty() && !l.starts_with("docker-desktop"))
        .collect();
    let default = distros.first().cloned();
    WslInfo { available: !distros.is_empty(), distros, default }
}

fn shell(id: &str, kind: &str, label: &str, path: PathBuf, args: &[&str]) -> ShellInfo {
    ShellInfo {
        id: id.to_string(),
        kind: kind.to_string(),
        label: label.to_string(),
        path: path.to_string_lossy().into_owned(),
        args: args.iter().map(|s| s.to_string()).collect(),
        distro: None,
    }
}

fn detect_shells(git: &ToolCheck, wsl: &WslInfo) -> Vec<ShellInfo> {
    let mut out = Vec::new();
    if cfg!(windows) {
        if let Ok(p) = which::which("pwsh") {
            out.push(shell("pwsh", "pwsh", "PowerShell 7", p, &["-NoLogo"]));
        }
        if let Ok(p) = which::which("powershell") {
            out.push(shell("powershell", "powershell", "Windows PowerShell", p, &["-NoLogo"]));
        }
        if let Ok(p) = which::which("cmd") {
            out.push(shell("cmd", "cmd", "Command Prompt", p, &[]));
        }
        // Git Bash lives next to git: <Git>/cmd/git.exe → <Git>/bin/bash.exe
        let bash = git
            .path
            .as_ref()
            .map(PathBuf::from)
            .and_then(|p| p.parent().and_then(|d| d.parent()).map(|root| root.join("bin").join("bash.exe")))
            .filter(|p| p.exists())
            .or_else(|| {
                let p = PathBuf::from(r"C:\Program Files\Git\bin\bash.exe");
                p.exists().then_some(p)
            });
        if let Some(p) = bash {
            out.push(shell("gitbash", "gitbash", "Git Bash", p, &["--login", "-i"]));
        }
        for d in &wsl.distros {
            let mut s = shell(&format!("wsl:{d}"), "wsl", &format!("WSL · {d}"), PathBuf::from("wsl.exe"), &["-d", d]);
            s.distro = Some(d.clone());
            out.push(s);
        }
    } else {
        let default = std::env::var("SHELL").ok();
        for (name, kind) in [("zsh", "zsh"), ("bash", "bash"), ("fish", "fish"), ("nu", "nushell")] {
            if let Ok(p) = which::which(name) {
                let is_default = default.as_deref().map(|d| d.ends_with(name)).unwrap_or(false);
                let label = if is_default { format!("{name} (default)") } else { name.to_string() };
                out.push(shell(name, kind, &label, p, &["-l"]));
            }
        }
        // default shell first
        if let Some(d) = default {
            out.sort_by_key(|s| !d.ends_with(&s.id));
        }
    }
    out
}

#[tauri::command(async)]
pub fn detect_environment() -> EnvironmentReport {
    let platform = if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    let claude = check_tool("claude", &["--version"]);
    let codex = check_tool("codex", &["--version"]);
    let gemini = check_tool("gemini", &["--version"]);
    let opencode = check_tool("opencode", &["--version"]);
    let git = check_tool("git", &["--version"]);
    let node = check_tool("node", &["--version"]);
    let wsl = detect_wsl();
    let shells = detect_shells(&git, &wsl);
    let (terminal_font, terminal_scheme) = detect_windows_terminal();
    let nerd_fonts = detect_nerd_fonts();
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).ok().filter(|s| !s.is_empty());
    EnvironmentReport { platform: platform.to_string(), claude, codex, gemini, opencode, git, node, wsl, shells, terminal_font, terminal_scheme, nerd_fonts, user }
}

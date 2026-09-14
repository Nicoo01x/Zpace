//! What Claude Code can be asked to do beyond plain prompts: skills, custom
//! slash commands and subagents, from the user's `~/.claude`, the project's
//! `.claude` and installed plugins. Frontmatter gives names and descriptions.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    /// Display name (frontmatter `name`, else the file / folder name).
    pub name: String,
    /// How to type it: `/name`, `/dir:name`, `/plugin:skill`.
    pub invoke: String,
    pub description: String,
    /// `user` | `project` | `plugin:<name>`
    pub source: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub argument_hint: Option<String>,
    /// Skills with `user-invocable: false` are for the model only.
    pub user_invocable: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentAssets {
    pub skills: Vec<AssetInfo>,
    pub commands: Vec<AssetInfo>,
    pub agents: Vec<AssetInfo>,
}

struct Front {
    fields: Vec<(String, String)>,
    body_first_line: String,
}

/// Minimal YAML-ish frontmatter: `key: value` lines between `---` fences.
fn frontmatter(text: &str) -> Front {
    let mut fields = Vec::new();
    let mut body = text;
    let t = text.trim_start_matches('\u{feff}');
    if let Some(rest) = t.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let block = &rest[..end];
            let lines: Vec<&str> = block.lines().collect();
            let mut i = 0;
            while i < lines.len() {
                let line = lines[i];
                i += 1;
                // Only top-level keys: indented lines belong to a block scalar or a nested map.
                if line.starts_with(' ') || line.starts_with('\t') {
                    continue;
                }
                let Some((k, v)) = line.split_once(':') else { continue };
                let key = k.trim().to_string();
                if key.is_empty() {
                    continue;
                }
                let mut val = v.trim().to_string();
                // YAML block scalars (`>`, `|`, `>-`, `|-`): the value is the indented lines that follow.
                if matches!(val.as_str(), ">" | "|" | ">-" | "|-" | ">+" | "|+") {
                    let mut parts: Vec<String> = Vec::new();
                    while i < lines.len() && (lines[i].starts_with(' ') || lines[i].starts_with('\t') || lines[i].trim().is_empty()) {
                        let t = lines[i].trim();
                        if !t.is_empty() {
                            parts.push(t.to_string());
                        }
                        i += 1;
                    }
                    val = parts.join(" ");
                } else if val.len() >= 2 && ((val.starts_with('"') && val.ends_with('"')) || (val.starts_with('\'') && val.ends_with('\''))) {
                    val = val[1..val.len() - 1].to_string();
                }
                fields.push((key, val));
            }
            body = &rest[end + 4..];
        }
    }
    let body_first_line = body
        .lines()
        .map(|l| l.trim().trim_start_matches('#').trim())
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .chars()
        .take(140)
        .collect();
    Front { fields, body_first_line }
}

fn field<'a>(f: &'a Front, key: &str) -> Option<&'a str> {
    f.fields.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v.as_str())
}

fn read(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

fn stem(path: &Path) -> String {
    path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

/// `dir/skills/<name>/SKILL.md`
fn scan_skills(dir: &Path, source: &str, prefix: &str, out: &mut Vec<AssetInfo>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let file = p.join("SKILL.md");
        let Some(text) = read(&file) else { continue };
        let f = frontmatter(&text);
        let folder = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let name = field(&f, "name").map(|s| s.to_string()).unwrap_or_else(|| folder.clone());
        let invocable = field(&f, "user-invocable").map(|v| !v.eq_ignore_ascii_case("false")).unwrap_or(true);
        out.push(AssetInfo {
            invoke: format!("/{prefix}{}", name),
            name,
            description: field(&f, "description").map(|s| s.to_string()).unwrap_or_else(|| f.body_first_line.clone()),
            source: source.to_string(),
            path: file.to_string_lossy().into_owned(),
            argument_hint: field(&f, "argument-hint").map(|s| s.to_string()),
            user_invocable: invocable,
        });
    }
}

/// `dir/commands/**/*.md` — subfolders become `/dir:name` namespaces.
fn scan_commands(dir: &Path, source: &str, prefix: &str, ns: &str, depth: u32, out: &mut Vec<AssetInfo>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            let sub = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let next = if ns.is_empty() { format!("{sub}:") } else { format!("{ns}{sub}:") };
            scan_commands(&p, source, prefix, &next, depth + 1, out);
            continue;
        }
        if p.extension().map(|x| x == "md").unwrap_or(false) {
            let Some(text) = read(&p) else { continue };
            let f = frontmatter(&text);
            let name = stem(&p);
            out.push(AssetInfo {
                invoke: format!("/{prefix}{ns}{name}"),
                name: field(&f, "name").map(|s| s.to_string()).unwrap_or(name),
                description: field(&f, "description").map(|s| s.to_string()).unwrap_or_else(|| f.body_first_line.clone()),
                source: source.to_string(),
                path: p.to_string_lossy().into_owned(),
                argument_hint: field(&f, "argument-hint").map(|s| s.to_string()),
                user_invocable: true,
            });
        }
    }
}

/// `dir/agents/*.md`
fn scan_agents(dir: &Path, source: &str, out: &mut Vec<AssetInfo>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if !p.extension().map(|x| x == "md").unwrap_or(false) {
            continue;
        }
        let Some(text) = read(&p) else { continue };
        let f = frontmatter(&text);
        let name = field(&f, "name").map(|s| s.to_string()).unwrap_or_else(|| stem(&p));
        out.push(AssetInfo {
            invoke: name.clone(),
            name,
            description: field(&f, "description").map(|s| s.to_string()).unwrap_or_else(|| f.body_first_line.clone()),
            source: source.to_string(),
            path: p.to_string_lossy().into_owned(),
            argument_hint: None,
            user_invocable: true,
        });
    }
}

fn scan_root(root: &Path, source: &str, prefix: &str, out: &mut AgentAssets) {
    scan_skills(&root.join("skills"), source, prefix, &mut out.skills);
    scan_commands(&root.join("commands"), source, prefix, "", 0, &mut out.commands);
    scan_agents(&root.join("agents"), source, &mut out.agents);
}

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from)
}

/// Installed plugins: `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`.
fn scan_plugins(claude_dir: &Path, out: &mut AgentAssets) {
    let cache = claude_dir.join("plugins").join("cache");
    let Ok(markets) = std::fs::read_dir(&cache) else { return };
    for m in markets.flatten() {
        let Ok(plugins) = std::fs::read_dir(m.path()) else { continue };
        for p in plugins.flatten() {
            let plugin = p.file_name().to_string_lossy().into_owned();
            // newest version folder wins
            let Ok(versions) = std::fs::read_dir(p.path()) else { continue };
            let mut dirs: Vec<PathBuf> = versions.flatten().map(|v| v.path()).filter(|v| v.is_dir()).collect();
            dirs.sort();
            if let Some(latest) = dirs.last() {
                let source = format!("plugin:{plugin}");
                scan_root(latest, &source, &format!("{plugin}:"), out);
            }
        }
    }
}

#[tauri::command]
pub fn scan_agent_assets(project: Option<String>) -> AgentAssets {
    let mut out = AgentAssets::default();
    if let Some(p) = project.as_deref().filter(|p| !p.is_empty()) {
        scan_root(&Path::new(p).join(".claude"), "project", "", &mut out);
    }
    if let Some(h) = home() {
        let claude = h.join(".claude");
        scan_root(&claude, "user", "", &mut out);
        scan_plugins(&claude, &mut out);
    }
    for list in [&mut out.skills, &mut out.commands, &mut out.agents] {
        list.sort_by(|a, b| a.invoke.to_lowercase().cmp(&b.invoke.to_lowercase()));
    }
    out
}

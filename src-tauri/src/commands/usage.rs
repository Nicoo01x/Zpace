//! Claude plan usage, straight from Anthropic: the same `/api/oauth/usage`
//! endpoint the CLI's `/usage` screen reads, authenticated with the OAuth
//! token Claude Code keeps in `~/.claude/.credentials.json`. Nothing is
//! stored or sent anywhere else; the token never reaches the webview.

use std::path::PathBuf;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    /// five_hour, seven_day, seven_day_opus, …
    pub kind: String,
    /// 0..1
    pub utilization: f64,
    /// ms epoch
    pub resets_at: Option<i64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUsage {
    pub subscription: Option<String>,
    pub tier: Option<String>,
    pub windows: Vec<UsageWindow>,
    /// ms epoch of this reading
    pub fetched_at: i64,
}

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from)
}

fn parse_time(v: &serde_json::Value) -> Option<i64> {
    match v {
        serde_json::Value::Number(n) => n.as_f64().map(|f| if f < 1e12 { (f * 1000.0) as i64 } else { f as i64 }),
        serde_json::Value::String(s) => {
            // RFC 3339 with an offset; sub-second digits and +00:00 are both fine for chrono-less parsing.
            httpdate_like(s)
        }
        _ => None,
    }
}

/// Minimal RFC 3339 → ms epoch (YYYY-MM-DDTHH:MM:SS[.frac](Z|±HH:MM)).
fn httpdate_like(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let num = |a: usize, n: usize| -> Option<i64> { s.get(a..a + n)?.parse::<i64>().ok() };
    let (y, mo, d, h, mi, sec) = (num(0, 4)?, num(5, 2)?, num(8, 2)?, num(11, 2)?, num(14, 2)?, num(17, 2)?);
    let mut rest = &s[19..];
    let mut frac_ms: i64 = 0;
    if rest.starts_with('.') {
        let digits: String = rest[1..].chars().take_while(|c| c.is_ascii_digit()).collect();
        let padded = format!("{:0<3}", digits.chars().take(3).collect::<String>());
        frac_ms = padded.parse().unwrap_or(0);
        rest = &rest[1 + digits.len()..];
    }
    let offset_min: i64 = if rest.starts_with('Z') || rest.is_empty() {
        0
    } else {
        let sign = if rest.starts_with('-') { -1 } else { 1 };
        let hh: i64 = rest.get(1..3)?.parse().ok()?;
        let mm: i64 = rest.get(4..6).and_then(|x| x.parse().ok()).unwrap_or(0);
        sign * (hh * 60 + mm)
    };
    // Days from civil (Howard Hinnant).
    let (y2, m2) = if mo <= 2 { (y - 1, mo + 9) } else { (y, mo - 3) };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = y2 - era * 400;
    let doy = (153 * m2 + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let secs = days * 86400 + h * 3600 + mi * 60 + sec - offset_min * 60;
    Some(secs * 1000 + frac_ms)
}

#[tauri::command(async)]
pub fn claude_usage() -> Result<ClaudeUsage, String> {
    let path = home().ok_or("No home directory")?.join(".claude").join(".credentials.json");
    let raw = std::fs::read_to_string(&path).map_err(|_| "Claude Code is not signed in (no ~/.claude/.credentials.json)".to_string())?;
    let creds: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let oauth = creds.get("claudeAiOauth").ok_or("No Claude.ai login in the credentials file")?;
    let token = oauth.get("accessToken").and_then(|v| v.as_str()).ok_or("No access token")?;
    if let Some(exp) = oauth.get("expiresAt").and_then(|v| v.as_i64()) {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
        if exp < now {
            return Err("The Claude Code login has expired — run `claude` once to refresh it".into());
        }
    }
    let resp = ureq::get("https://api.anthropic.com/api/oauth/usage")
        .set("Authorization", &format!("Bearer {token}"))
        .set("anthropic-beta", "oauth-2025-04-20")
        .set("Accept", "application/json")
        .set("User-Agent", "Zpace")
        .timeout(std::time::Duration::from_secs(12))
        .call();
    let body: serde_json::Value = match resp {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => return Err("Anthropic rejected the login — run `claude` once to refresh it".into()),
        Err(ureq::Error::Status(code, r)) => return Err(format!("Usage endpoint answered {code}: {}", r.into_string().unwrap_or_default().chars().take(200).collect::<String>())),
        Err(e) => return Err(format!("Could not reach Anthropic: {e}")),
    };
    let mut windows = Vec::new();
    if let Some(obj) = body.as_object() {
        for (k, v) in obj {
            let Some(w) = v.as_object() else { continue };
            let Some(u) = w.get("utilization").and_then(|x| x.as_f64()) else { continue };
            windows.push(UsageWindow { kind: k.clone(), utilization: if u > 1.0 { u / 100.0 } else { u }, resets_at: w.get("resets_at").and_then(parse_time) });
        }
    }
    let fetched_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    Ok(ClaudeUsage {
        subscription: oauth.get("subscriptionType").and_then(|v| v.as_str()).map(String::from),
        tier: oauth.get("rateLimitTier").and_then(|v| v.as_str()).map(String::from),
        windows,
        fetched_at,
    })
}

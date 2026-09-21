//! Voice capture and transcription without Windows' speech engine (which
//! fails silently on some machines): the microphone through `cpal` (the
//! system's default input), one utterance cut by silence, and whisper.cpp —
//! its official CPU build and a quantised model fetched once into
//! `<appData>/whisper` — turning it into text. Offline after that setup.
//! Levels stream to the window as `voice://level` while it listens.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// The whisper.cpp release that ships CPU builds for Windows and Linux (the tags named `v*` carry no binaries).
const WHISPER_BUILD: &str = "b5130";
#[cfg(windows)]
const WHISPER_ARCHIVE: &str = "whisper-bin-x64.zip";
#[cfg(target_os = "linux")]
const WHISPER_ARCHIVE: &str = "whisper-bin-ubuntu-x64.tar.gz";
#[cfg(not(any(windows, target_os = "linux")))]
const WHISPER_ARCHIVE: &str = "";
const MODEL_BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

/// Listening limits: silence allowed before anyone speaks, the pause that ends a sentence, the longest utterance.
const START_TIMEOUT: Duration = Duration::from_secs(8);
const END_SILENCE: Duration = Duration::from_millis(900);
const MAX_UTTERANCE: Duration = Duration::from_secs(20);
/// Audio kept from before the first word, so an utterance never starts clipped.
const PRE_ROLL: Duration = Duration::from_millis(300);
const FRAME: Duration = Duration::from_millis(20);

#[derive(Default)]
pub struct ListenState {
    cancel: Arc<AtomicBool>,
    busy: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceReady {
    binary: bool,
    model: bool,
    dir: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SetupProgress {
    stage: &'static str,
    received: u64,
    total: u64,
}

#[derive(Serialize, Clone)]
struct Level {
    level: f32,
    speaking: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceDevice {
    name: String,
    is_default: bool,
}

/// The microphones cpal sees, the system default first.
#[tauri::command(async)]
pub fn voice_devices() -> Result<Vec<VoiceDevice>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let default = host.default_input_device().and_then(|d| d.name().ok());
    let mut out = Vec::new();
    for d in host.input_devices().map_err(|e| e.to_string())? {
        if let Ok(name) = d.name() {
            let is_default = default.as_deref() == Some(name.as_str());
            if !out.iter().any(|x: &VoiceDevice| x.name == name) {
                out.push(VoiceDevice { name, is_default });
            }
        }
    }
    out.sort_by_key(|d| !d.is_default);
    Ok(out)
}

/// The microphone to record from: the one named when it is present, else the system default.
fn input_device(name: Option<&str>) -> Result<cpal::Device, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    if let Some(wanted) = name.filter(|n| !n.is_empty()) {
        if let Ok(devices) = host.input_devices() {
            for d in devices {
                if d.name().map(|n| n == wanted).unwrap_or(false) {
                    return Ok(d);
                }
            }
        }
    }
    host.default_input_device().ok_or_else(|| "No microphone available.".to_string())
}

/// Stream the microphone's level for `seconds` (the settings' test) and return the loudest moment.
#[tauri::command(async)]
pub fn voice_meter(app: AppHandle, state: State<'_, ListenState>, device: Option<String>, seconds: u32) -> Result<f32, String> {
    if state.busy.swap(true, Ordering::AcqRel) {
        return Err("Already listening.".into());
    }
    state.cancel.store(false, Ordering::Relaxed);
    let cancel = state.cancel.clone();
    let result = capture(&app, cancel, device.as_deref(), Some(Duration::from_secs(seconds.max(1) as u64)));
    state.busy.store(false, Ordering::Release);
    result.map(|r| r.map(|(_, peak)| peak).unwrap_or(0.0))
}

/// `base` (fast, ~60 MB) or `small` (better, ~190 MB, several times slower on a CPU).
fn model_file(model: &str) -> &'static str {
    match model {
        "small" => "ggml-small-q5_1.bin",
        _ => "ggml-base-q5_1.bin",
    }
}

fn whisper_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("whisper"))
}

fn cli_path(dir: &std::path::Path) -> PathBuf {
    dir.join("bin").join(if cfg!(windows) { "whisper-cli.exe" } else { "whisper-cli" })
}

#[tauri::command(async)]
pub fn voice_ready(app: AppHandle, model: String) -> Result<VoiceReady, String> {
    let dir = whisper_dir(&app)?;
    Ok(VoiceReady { binary: cli_path(&dir).is_file(), model: dir.join(model_file(&model)).is_file(), dir: dir.to_string_lossy().into_owned() })
}

/// Fetch what is missing: the whisper.cpp build (unpacked with the system's `tar`, which reads zip files too) and the model.
#[tauri::command(async)]
pub fn voice_setup(app: AppHandle, model: String) -> Result<(), String> {
    if WHISPER_ARCHIVE.is_empty() {
        return Err("Voice transcription is available on Windows and Linux for now.".into());
    }
    let dir = whisper_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    if !cli_path(&dir).is_file() {
        let archive = dir.join(WHISPER_ARCHIVE);
        let url = format!("https://github.com/ggml-org/whisper.cpp/releases/download/{WHISPER_BUILD}/{WHISPER_ARCHIVE}");
        download(&app, "binary", &url, &archive)?;
        let extract = dir.join("extract");
        let _ = std::fs::remove_dir_all(&extract);
        std::fs::create_dir_all(&extract).map_err(|e| format!("create {}: {e}", extract.display()))?;
        let out = super::quiet_command("tar").arg("-xf").arg(&archive).arg("-C").arg(&extract).output().map_err(|e| format!("tar: {e}"))?;
        if !out.status.success() {
            return Err(format!("Could not unpack whisper: {}", String::from_utf8_lossy(&out.stderr)));
        }
        // The build lands in a folder (`Release/` on Windows, `build/bin/` on Linux): the one holding the CLI becomes `bin/`.
        let found = find_file(&extract, if cfg!(windows) { "whisper-cli.exe" } else { "whisper-cli" }).ok_or("The whisper build has no whisper-cli")?;
        let bin = dir.join("bin");
        let _ = std::fs::remove_dir_all(&bin);
        let from = found.parent().ok_or("bad path")?;
        std::fs::rename(from, &bin).map_err(|e| format!("move {} to {}: {e}", from.display(), bin.display()))?;
        let _ = std::fs::remove_dir_all(&extract);
        let _ = std::fs::remove_file(&archive);
    }
    let file = model_file(&model);
    let target = dir.join(file);
    if !target.is_file() {
        download(&app, "model", &format!("{MODEL_BASE_URL}{file}"), &target)?;
    }
    Ok(())
}

fn find_file(root: &std::path::Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(root).ok()?.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(f) = find_file(&p, name) {
                return Some(f);
            }
        } else if p.file_name().map(|n| n == name).unwrap_or(false) {
            return Some(p);
        }
    }
    None
}

/// Stream a URL to `target` (through `.part`), reporting progress to the window.
fn download(app: &AppHandle, stage: &'static str, url: &str, target: &std::path::Path) -> Result<(), String> {
    let resp = ureq::get(url).timeout(Duration::from_secs(600)).call().map_err(|e| format!("Download failed: {e}"))?;
    let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let part = target.with_extension("part");
    let mut file = std::fs::File::create(&part).map_err(|e| format!("create {}: {e}", part.display()))?;
    let mut reader = resp.into_reader();
    let mut buf = vec![0u8; 64 * 1024];
    let mut received: u64 = 0;
    let mut last = Instant::now();
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        received += n as u64;
        if last.elapsed() > Duration::from_millis(150) {
            last = Instant::now();
            let _ = app.emit_to("main", "voice://setup", SetupProgress { stage, received, total });
        }
    }
    drop(file);
    if let Err(e) = std::fs::rename(&part, target) {
        // Seen once on a machine where something else moved the finished `.part` into place first: what matters is the file.
        if !(target.is_file() && !part.exists()) {
            return Err(format!("finish {}: {e} (part exists: {}, target exists: {})", target.display(), part.exists(), target.exists()));
        }
    }
    let _ = app.emit_to("main", "voice://setup", SetupProgress { stage, received, total: received });
    Ok(())
}

/// Stop a listen in progress: it returns what it has (nothing, if no one spoke yet).
#[tauri::command]
pub fn voice_cancel(state: State<'_, ListenState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Listen for one utterance on the default microphone and return its text ('' when nothing was said).
#[tauri::command(async)]
pub fn voice_listen(app: AppHandle, state: State<'_, ListenState>, model: String, language: Option<String>, device: Option<String>) -> Result<String, String> {
    if state.busy.swap(true, Ordering::AcqRel) {
        return Err("Already listening.".into());
    }
    state.cancel.store(false, Ordering::Relaxed);
    let cancel = state.cancel.clone();
    let result = capture(&app, cancel, device.as_deref(), None).and_then(|samples| match samples {
        None => Ok(String::new()),
        Some((s, _)) => transcribe(&app, &model, language.as_deref(), &s),
    });
    state.busy.store(false, Ordering::Release);
    result
}

/// The utterance as 16 kHz mono samples plus the loudest level, or None when no one spoke before the timeout.
/// With `meter_for`, no utterance is cut: it only streams levels for that long (the microphone test).
fn capture(app: &AppHandle, cancel: Arc<AtomicBool>, device_name: Option<&str>, meter_for: Option<Duration>) -> Result<Option<(Vec<f32>, f32)>, String> {
    use cpal::traits::{DeviceTrait, StreamTrait};
    let device = input_device(device_name)?;
    let config = device.default_input_config().map_err(|e| format!("The microphone could not be opened: {e}"))?;
    let rate = config.sample_rate().0 as usize;
    let channels = config.channels().max(1) as usize;
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = buffer.clone();
    let err_fn = |e| log::warn!("microphone stream: {e}");
    // Whatever the device's format, it lands as mono f32 in `buffer`.
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(&config.into(), move |data: &[f32], _| push(&sink, data.iter().copied(), channels), err_fn, None),
        cpal::SampleFormat::I16 => device.build_input_stream(&config.into(), move |data: &[i16], _| push(&sink, data.iter().map(|s| *s as f32 / 32768.0), channels), err_fn, None),
        cpal::SampleFormat::U16 => device.build_input_stream(&config.into(), move |data: &[u16], _| push(&sink, data.iter().map(|s| (*s as f32 - 32768.0) / 32768.0), channels), err_fn, None),
        other => return Err(format!("Unsupported microphone format {other:?}")),
    }
    .map_err(|e| format!("The microphone could not be opened: {e}"))?;
    stream.play().map_err(|e| format!("The microphone could not start: {e}"))?;

    let frame_len = rate * FRAME.as_millis() as usize / 1000;
    let pre_roll = rate * PRE_ROLL.as_millis() as usize / 1000;
    let started = Instant::now();
    let mut consumed = 0usize;
    let mut floor = 0.004f32;
    let mut speaking = false;
    let mut speech_started: Option<Instant> = None;
    let mut last_voice = Instant::now();
    let mut utterance_from = 0usize;
    let mut last_emit = Instant::now();
    let mut peak = 0f32;
    let mut loudest = 0f32;
    loop {
        std::thread::sleep(FRAME);
        let (available, frames): (usize, Vec<f32>) = {
            let b = buffer.lock().map_err(|e| e.to_string())?;
            (b.len(), b[consumed..].to_vec())
        };
        // Every full frame since the last look: its loudness against a noise floor that follows the quiet.
        let mut i = 0;
        while i + frame_len <= frames.len() {
            let rms = (frames[i..i + frame_len].iter().map(|s| s * s).sum::<f32>() / frame_len as f32).sqrt();
            if rms < floor * 2.0 {
                floor = floor * 0.95 + rms * 0.05;
            }
            let voice = rms > (floor * 3.5).max(0.012);
            peak = peak.max(rms);
            loudest = loudest.max(rms);
            if voice {
                last_voice = Instant::now();
                if !speaking {
                    speaking = true;
                    speech_started.get_or_insert_with(Instant::now);
                    utterance_from = (consumed + i).saturating_sub(pre_roll);
                }
            } else if speaking && last_voice.elapsed() > FRAME * 3 {
                speaking = false;
            }
            i += frame_len;
        }
        consumed = available - (frames.len() - i);
        if last_emit.elapsed() > Duration::from_millis(45) {
            last_emit = Instant::now();
            let _ = app.emit_to("main", "voice://level", Level { level: (peak * 6.0).min(1.0), speaking: speech_started.is_some() && last_voice.elapsed() < END_SILENCE });
            peak = 0.0;
        }
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        if let Some(limit) = meter_for {
            if started.elapsed() > limit {
                break;
            }
            continue;
        }
        match speech_started {
            None if started.elapsed() > START_TIMEOUT => break,
            Some(at) if last_voice.elapsed() > END_SILENCE || at.elapsed() > MAX_UTTERANCE => break,
            _ => {}
        }
    }
    drop(stream);
    if meter_for.is_some() {
        return Ok(Some((Vec::new(), (loudest * 6.0).min(1.0))));
    }
    let Some(_) = speech_started else { return Ok(None) };
    let all = buffer.lock().map_err(|e| e.to_string())?;
    let end = all.len();
    if end <= utterance_from {
        return Ok(None);
    }
    Ok(Some((resample(&all[utterance_from..end], rate, 16_000), loudest)))
}

fn push<I: Iterator<Item = f32>>(sink: &Arc<Mutex<Vec<f32>>>, samples: I, channels: usize) {
    if let Ok(mut b) = sink.lock() {
        let mut acc = 0f32;
        let mut n = 0usize;
        for s in samples {
            acc += s;
            n += 1;
            if n == channels {
                b.push(acc / channels as f32);
                acc = 0.0;
                n = 0;
            }
        }
    }
}

/// Linear resampling — speech at 16 kHz does not need better.
fn resample(input: &[f32], from: usize, to: usize) -> Vec<f32> {
    if from == to {
        return input.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let len = (input.len() as f64 / ratio) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let j = pos as usize;
            let frac = (pos - j as f64) as f32;
            let a = input[j.min(input.len() - 1)];
            let b = input[(j + 1).min(input.len() - 1)];
            a + (b - a) * frac
        })
        .collect()
}

fn wav16(samples: &[f32]) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&16_000u32.to_le_bytes());
    out.extend_from_slice(&32_000u32.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
    }
    out
}

/// whisper-cli on the utterance: the transcript is what it prints to stdout (logs go to stderr).
fn transcribe(app: &AppHandle, model: &str, language: Option<&str>, samples: &[f32]) -> Result<String, String> {
    let dir = whisper_dir(app)?;
    let cli = cli_path(&dir);
    let model_path = dir.join(model_file(model));
    if !cli.is_file() || !model_path.is_file() {
        return Err("Voice is not set up yet.".into());
    }
    let wav = dir.join("utterance.wav");
    std::fs::write(&wav, wav16(samples)).map_err(|e| e.to_string())?;
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 8);
    let out = super::quiet_command(cli.to_string_lossy().as_ref())
        .args(["-m", &model_path.to_string_lossy(), "-l", language.filter(|l| !l.is_empty()).unwrap_or("auto"), "-nt", "-np", "-bs", "3", "-bo", "3", "-t", &threads.to_string(), "-f", &wav.to_string_lossy()])
        .output()
        .map_err(|e| format!("whisper: {e}"))?;
    let _ = std::fs::remove_file(&wav);
    if !out.status.success() {
        return Err(format!("whisper failed: {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("")));
    }
    let text = String::from_utf8_lossy(&out.stdout).lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ");
    // Whisper's inventions for silence and noise: credits lines, and sound descriptions like "(upbeat music)" or "[Música]".
    let lowered = text.to_lowercase();
    let described = text.starts_with(['(', '[']) && text.ends_with([')', ']']);
    if described || lowered.contains("amara.org") || lowered.contains("subtítulos por") || lowered.contains("subtitles by") {
        return Ok(String::new());
    }
    Ok(text)
}

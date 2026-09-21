//! Dictation through Windows' own speech recognizer (WinRT
//! `Windows.Media.SpeechRecognition`): one utterance per call, heard through a
//! continuous session so the words show up while they are being said
//! (`speech://hypothesis` events to the window), the language asked for when
//! its speech pack is installed, else the system's. Runs on its own thread
//! with a multithreaded apartment; errors come back readable (the privacy
//! switch, a missing language pack, no microphone).

#[cfg(windows)]
#[tauri::command]
pub async fn speech_recognize(app: tauri::AppHandle, lang: Option<String>) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        let _ = tx.send(recognize(&app, lang.as_deref()));
    });
    rx.recv().map_err(|_| "speech thread died".to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn speech_recognize(_app: tauri::AppHandle, _lang: Option<String>) -> Result<String, String> {
    Err("Dictation is only available on Windows for now.".into())
}

/// Silence allowed before anyone speaks (the orb shows "listening" a moment before Windows is warm) and inside a sentence.
#[cfg(windows)]
const INITIAL_SILENCE_S: f64 = 8.0;
#[cfg(windows)]
const END_SILENCE_S: f64 = 1.2;
/// The whole utterance, from start to the final result, never runs longer than this.
#[cfg(windows)]
const UTTERANCE_S: u64 = 30;

#[cfg(windows)]
fn recognize(app: &tauri::AppHandle, lang: Option<&str>) -> Result<String, String> {
    use std::sync::mpsc;
    use std::time::Duration;
    use tauri::Emitter;
    use windows::core::HSTRING;
    use windows::Foundation::{TimeSpan, TypedEventHandler};
    use windows::Globalization::Language;
    use windows::Media::SpeechRecognition::{
        SpeechContinuousRecognitionCompletedEventArgs, SpeechContinuousRecognitionResultGeneratedEventArgs, SpeechContinuousRecognitionSession, SpeechRecognitionConfidence, SpeechRecognitionHypothesisGeneratedEventArgs,
        SpeechRecognitionResultStatus, SpeechRecognizer,
    };
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    // The apartment is per thread; a second init on the same thread just reports "changed mode".
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let recognizer = match lang {
        Some(tag) if !tag.is_empty() => {
            let language = Language::CreateLanguage(&HSTRING::from(tag)).map_err(|e| e.message())?;
            match SpeechRecognizer::Create(&language) {
                Ok(r) => r,
                // No speech pack for that language: the system's default one.
                Err(_) => SpeechRecognizer::new().map_err(readable)?,
            }
        }
        _ => SpeechRecognizer::new().map_err(readable)?,
    };
    let secs = |s: f64| TimeSpan { Duration: (s * 10_000_000.0) as i64 };
    if let Ok(timeouts) = recognizer.Timeouts() {
        let _ = timeouts.SetInitialSilenceTimeout(secs(INITIAL_SILENCE_S));
        let _ = timeouts.SetEndSilenceTimeout(secs(END_SILENCE_S));
        let _ = timeouts.SetBabbleTimeout(secs(12.0));
    }
    // Dictation grammar (free text) is the default when no constraints are added.
    let compiled = recognizer.CompileConstraintsAsync().map_err(readable)?.get().map_err(readable)?;
    if compiled.Status().map_err(readable)? != SpeechRecognitionResultStatus::Success {
        return Err("The speech recognizer could not be prepared.".into());
    }
    let session: SpeechContinuousRecognitionSession = recognizer.ContinuousRecognitionSession().map_err(readable)?;
    let _ = session.SetAutoStopSilenceTimeout(secs(INITIAL_SILENCE_S));

    let (done_tx, done_rx) = mpsc::channel::<Result<String, String>>();
    // What it thinks it heard so far, live.
    let page = app.clone();
    let hypothesis = recognizer
        .HypothesisGenerated(&TypedEventHandler::new(move |_, args: windows::core::Ref<SpeechRecognitionHypothesisGeneratedEventArgs>| {
            if let Some(a) = args.as_ref() {
                if let Ok(text) = a.Hypothesis().and_then(|h| h.Text()) {
                    let _ = page.emit("speech://hypothesis", text.to_string());
                }
            }
            Ok(())
        }))
        .map_err(readable)?;
    // The utterance: first final result ends the call. A rejected guess (noise, another language) reads as nothing said.
    let on_result = done_tx.clone();
    let result_token = session
        .ResultGenerated(&TypedEventHandler::new(move |_, args: windows::core::Ref<SpeechContinuousRecognitionResultGeneratedEventArgs>| {
            if let Some(a) = args.as_ref() {
                if let Ok(res) = a.Result() {
                    let rejected = res.Confidence().map(|c| c == SpeechRecognitionConfidence::Rejected).unwrap_or(false);
                    let text = if rejected { String::new() } else { res.Text().map(|t| t.to_string()).unwrap_or_default() };
                    let _ = on_result.send(Ok(text));
                }
            }
            Ok(())
        }))
        .map_err(readable)?;
    // The session ending on its own: silence, or a reason worth telling.
    let on_done = done_tx;
    let completed_token = session
        .Completed(&TypedEventHandler::new(move |_, args: windows::core::Ref<SpeechContinuousRecognitionCompletedEventArgs>| {
            let status = args.as_ref().and_then(|a| a.Status().ok());
            let _ = on_done.send(match status {
                Some(SpeechRecognitionResultStatus::Success) | Some(SpeechRecognitionResultStatus::TimeoutExceeded) | Some(SpeechRecognitionResultStatus::UserCanceled) | None => Ok(String::new()),
                Some(SpeechRecognitionResultStatus::MicrophoneUnavailable) => Err("No microphone available.".into()),
                Some(SpeechRecognitionResultStatus::NetworkFailure) => Err("The speech service needs a network it could not reach.".into()),
                Some(SpeechRecognitionResultStatus::AudioQualityFailure) => Err("Audio quality too low to recognise anything.".into()),
                Some(other) => Err(format!("Recognition failed (status {})", other.0)),
            });
            Ok(())
        }))
        .map_err(readable)?;

    session.StartAsync().map_err(readable)?.get().map_err(readable)?;
    let outcome = done_rx.recv_timeout(Duration::from_secs(UTTERANCE_S)).unwrap_or(Ok(String::new()));
    // Release the microphone; the session may already be over, which is fine.
    if let Ok(op) = session.CancelAsync() {
        let _ = op.get();
    }
    let _ = recognizer.RemoveHypothesisGenerated(hypothesis);
    let _ = session.RemoveResultGenerated(result_token);
    let _ = session.RemoveCompleted(completed_token);
    outcome
}

#[cfg(windows)]
fn readable(e: windows::core::Error) -> String {
    let code = e.code().0 as u32;
    match code {
        // E_ACCESSDENIED / the "Online speech recognition" & microphone privacy switches
        0x8004_5509 | 0x8007_0005 => "Windows is not letting apps use speech recognition. Turn on Settings › Privacy › Speech (online speech recognition) and Microphone access for desktop apps.".to_string(),
        0x8004_503A => "Speech recognition for this language is not installed — add the language's speech pack in Settings › Time & language.".to_string(),
        _ => {
            let msg = e.message();
            if msg.is_empty() {
                format!("Speech error 0x{code:08X}")
            } else {
                format!("{msg} (0x{code:08X})")
            }
        }
    }
}

/// What the recognizer can hear on this machine: the system speech language and every installed speech pack (BCP-47 tag + display name).
#[cfg(windows)]
#[tauri::command(async)]
pub fn speech_languages() -> Result<serde_json::Value, String> {
    use windows::Media::SpeechRecognition::SpeechRecognizer;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let system = SpeechRecognizer::SystemSpeechLanguage().map_err(|e| readable(e))?;
    let mut supported = Vec::new();
    if let Ok(list) = SpeechRecognizer::SupportedTopicLanguages() {
        if let Ok(n) = list.Size() {
            for i in 0..n {
                if let Ok(l) = list.GetAt(i) {
                    supported.push(serde_json::json!({
                        "tag": l.LanguageTag().map(|t| t.to_string()).unwrap_or_default(),
                        "name": l.NativeName().map(|t| t.to_string()).unwrap_or_default(),
                    }));
                }
            }
        }
    }
    Ok(serde_json::json!({
        "system": system.LanguageTag().map(|t| t.to_string()).unwrap_or_default(),
        "systemName": system.NativeName().map(|t| t.to_string()).unwrap_or_default(),
        "supported": supported,
    }))
}

#[cfg(not(windows))]
#[tauri::command(async)]
pub fn speech_languages() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "system": "", "systemName": "", "supported": [] }))
}

/// One utterance with everything the recognizer said about it (status, confidence, text, timing) — for diagnosing a silent microphone.
#[cfg(windows)]
#[tauri::command(async)]
pub fn speech_probe() -> Result<serde_json::Value, String> {
    use windows::Foundation::TimeSpan;
    use windows::Media::SpeechRecognition::SpeechRecognizer;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let started = std::time::Instant::now();
    let recognizer = SpeechRecognizer::new().map_err(|e| readable(e))?;
    if let Ok(timeouts) = recognizer.Timeouts() {
        let secs = |s: f64| TimeSpan { Duration: (s * 10_000_000.0) as i64 };
        let _ = timeouts.SetInitialSilenceTimeout(secs(8.0));
        let _ = timeouts.SetEndSilenceTimeout(secs(1.2));
    }
    let compiled = recognizer.CompileConstraintsAsync().map_err(|e| readable(e))?.get().map_err(|e| readable(e))?;
    let compile_status = compiled.Status().map(|s| s.0).unwrap_or(-1);
    let ready_ms = started.elapsed().as_millis() as u64;
    let result = recognizer.RecognizeAsync().map_err(|e| readable(e))?.get().map_err(|e| readable(e))?;
    let language = recognizer.CurrentLanguage().and_then(|l| l.LanguageTag()).map(|t| t.to_string()).unwrap_or_default();
    Ok(serde_json::json!({
        "compileStatus": compile_status,
        "readyMs": ready_ms,
        "totalMs": started.elapsed().as_millis() as u64,
        "status": result.Status().map(|s| s.0).unwrap_or(-1),
        "confidence": result.Confidence().map(|c| c.0).unwrap_or(-1),
        "text": result.Text().map(|t| t.to_string()).unwrap_or_default(),
        "language": language,
    }))
}

#[cfg(not(windows))]
#[tauri::command(async)]
pub fn speech_probe() -> Result<serde_json::Value, String> {
    Err("Windows only".into())
}

/// The default microphone as Windows sees it: its endpoint id, volume, mute, and the loudest peak heard over `seconds` — to tell a silent device from a deaf recognizer.
#[cfg(windows)]
#[tauri::command(async)]
pub fn speech_mic_probe(seconds: u32) -> Result<serde_json::Value, String> {
    use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
    use windows::Win32::Media::Audio::{eCapture, eCommunications, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.message())?;
        let device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole).map_err(|e| e.message())?;
        let id = device.GetId().map_err(|e| e.message())?;
        let id_str = id.to_string().unwrap_or_default();
        CoTaskMemFree(Some(id.0 as *const _));
        let comm = enumerator.GetDefaultAudioEndpoint(eCapture, eCommunications).ok().and_then(|d| d.GetId().ok()).map(|i| {
            let s = i.to_string().unwrap_or_default();
            CoTaskMemFree(Some(i.0 as *const _));
            s
        });
        // The name Windows shows in Sound settings, so the user can tell which device is silent (WinRT wants its own id form).
        let name = windows::Media::Devices::MediaDevice::GetDefaultAudioCaptureId(windows::Media::Devices::AudioDeviceRole::Default)
            .and_then(|wid| windows::Devices::Enumeration::DeviceInformation::CreateFromIdAsync(&wid))
            .and_then(|op| op.get())
            .and_then(|d| d.Name())
            .map(|n| n.to_string())
            .unwrap_or_default();
        let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).map_err(|e| e.message())?;
        let level = volume.GetMasterVolumeLevelScalar().unwrap_or(-1.0);
        let muted = volume.GetMute().map(|b| b.as_bool()).unwrap_or(false);
        let meter: IAudioMeterInformation = device.Activate(CLSCTX_ALL, None).map_err(|e| e.message())?;
        let mut peak: f32 = 0.0;
        let mut samples = Vec::new();
        let ticks = (seconds * 20) as usize;
        for _ in 0..ticks {
            let v = meter.GetPeakValue().unwrap_or(0.0);
            if v > peak {
                peak = v;
            }
            samples.push((v * 100.0).round() / 100.0);
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        Ok(serde_json::json!({ "device": id_str, "name": name, "communicationsDevice": comm, "volume": level, "muted": muted, "peak": peak, "samples": samples }))
    }
}

#[cfg(not(windows))]
#[tauri::command(async)]
pub fn speech_mic_probe(_seconds: u32) -> Result<serde_json::Value, String> {
    Err("Windows only".into())
}

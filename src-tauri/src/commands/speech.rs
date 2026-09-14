//! Dictation through Windows' own speech recognizer (WinRT
//! `Windows.Media.SpeechRecognition`): one utterance per call, the language
//! asked for when its speech pack is installed, else the system's. Runs on
//! its own thread with a multithreaded apartment; errors come back readable
//! (the privacy switch, a missing language pack, no microphone).

#[cfg(windows)]
#[tauri::command]
pub async fn speech_recognize(lang: Option<String>) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        let _ = tx.send(recognize(lang.as_deref()));
    });
    rx.recv().map_err(|_| "speech thread died".to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn speech_recognize(_lang: Option<String>) -> Result<String, String> {
    Err("Dictation is only available on Windows for now.".into())
}

#[cfg(windows)]
fn recognize(lang: Option<&str>) -> Result<String, String> {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Media::SpeechRecognition::{SpeechRecognitionResultStatus, SpeechRecognizer};
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
                Err(_) => SpeechRecognizer::new().map_err(|e| readable(e))?,
            }
        }
        _ => SpeechRecognizer::new().map_err(|e| readable(e))?,
    };
    // Dictation grammar (free text) is the default when no constraints are added.
    let compile = recognizer.CompileConstraintsAsync().map_err(|e| readable(e))?;
    let compiled = compile.get().map_err(|e| readable(e))?;
    if compiled.Status().map_err(|e| readable(e))? != SpeechRecognitionResultStatus::Success {
        return Err("The speech recognizer could not be prepared.".into());
    }
    let op = recognizer.RecognizeAsync().map_err(|e| readable(e))?;
    let result = op.get().map_err(|e| readable(e))?;
    let status = result.Status().map_err(|e| readable(e))?;
    match status {
        SpeechRecognitionResultStatus::Success => Ok(result.Text().map_err(|e| readable(e))?.to_string()),
        SpeechRecognitionResultStatus::UserCanceled => Ok(String::new()),
        SpeechRecognitionResultStatus::TimeoutExceeded => Ok(String::new()),
        SpeechRecognitionResultStatus::MicrophoneUnavailable => Err("No microphone available.".into()),
        SpeechRecognitionResultStatus::NetworkFailure => Err("The speech service needs a network it could not reach.".into()),
        SpeechRecognitionResultStatus::AudioQualityFailure => Err("Audio quality too low to recognise anything.".into()),
        other => Err(format!("Recognition failed (status {})", other.0)),
    }
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

import { invoke, isTauri, listen } from './bridge';
import { LOCALES, type Language } from '@/i18n';

/**
 * One dictated utterance through Windows' speech recognizer (Rust
 * `speech_recognize`). Resolves with the text — empty when nothing was said
 * or the user stopped — and rejects with a readable reason (privacy switch,
 * missing language pack, no microphone). `onHypothesis` gets the words as
 * they are being recognised, before the final text.
 */
export async function speechRecognize(lang?: string, onHypothesis?: (text: string) => void): Promise<string> {
  if (!isTauri) throw new Error('Dictation needs the desktop app.');
  const stop = onHypothesis ? await listen<string>('speech://hypothesis', onHypothesis) : null;
  try {
    return await invoke<string>('speech_recognize', { lang });
  } finally {
    stop?.();
  }
}

/** The speech packs Windows has: the system speech language and every installed one. */
export interface SpeechLanguages {
  system: string;
  systemName: string;
  supported: Array<{ tag: string; name: string }>;
}
export async function speechLanguages(): Promise<SpeechLanguages> {
  if (!isTauri) return { system: '', systemName: '', supported: [] };
  return invoke<SpeechLanguages>('speech_languages');
}

/** Windows' default microphone: its name, volume, mute, and — over `seconds` — the loudest level heard while something records from it. */
export interface MicProbe {
  device: string;
  name: string;
  volume: number;
  muted: boolean;
  peak: number;
}
export async function micProbe(seconds = 0): Promise<MicProbe | null> {
  if (!isTauri) return null;
  return invoke<MicProbe>('speech_mic_probe', { seconds }).catch(() => null);
}

/** A short spoken line through the system voices (Web Speech synthesis works in WebView2). */
export function speak(text: string, lang?: string) {
  void speakAsync(text, lang);
}

/** The system voice for a language, when one is installed (`getVoices` is empty until the list has loaded once). */
function voiceFor(lang?: string): SpeechSynthesisVoice | undefined {
  if (!lang) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const tag = lang.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === tag) ?? voices.find((v) => v.lang.toLowerCase().startsWith(tag.split('-')[0]));
}

/** Speak and resolve when the line has been said (or could not be); anything still being said is cut. */
export function speakAsync(text: string, lang?: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!('speechSynthesis' in window) || !text.trim()) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      if (lang) u.lang = lang;
      const voice = voiceFor(lang);
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

/** Stop whatever is being said. */
export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* no voices */
  }
}

/** The BCP-47 tag for the app language ('system' → the recognizer's default). */
export function speechLang(language: string): string | undefined {
  if (language === 'system') return undefined;
  return LOCALES[language as Language] ?? undefined;
}

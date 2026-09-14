import { invoke, isTauri } from './bridge';
import { LOCALES, type Language } from '@/i18n';

/**
 * One dictated utterance through Windows' speech recognizer (Rust
 * `speech_recognize`). Resolves with the text — empty when nothing was said
 * or the user stopped — and rejects with a readable reason (privacy switch,
 * missing language pack, no microphone).
 */
export async function speechRecognize(lang?: string): Promise<string> {
  if (!isTauri) throw new Error('Dictation needs the desktop app.');
  return invoke<string>('speech_recognize', { lang });
}

/** A short spoken line through the system voices (Web Speech synthesis works in WebView2). */
export function speak(text: string, lang?: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    if (lang) u.lang = lang;
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* no voices */
  }
}

/** The BCP-47 tag for the app language ('system' → the recognizer's default). */
export function speechLang(language: string): string | undefined {
  if (language === 'system') return undefined;
  return LOCALES[language as Language] ?? undefined;
}

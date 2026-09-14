import { es } from './es';
import { ptBR } from './pt-BR';
import { fr } from './fr';
import { de } from './de';
import { it } from './it';
import { ja } from './ja';
import { zhCN } from './zh-CN';
import { ko } from './ko';
import { ru } from './ru';

/**
 * Minimal i18n: `t('English text')` returns the translation for the active
 * language, or the text itself. Keys are the English source strings, so
 * every call reads naturally in the code and a missing translation is never
 * a blank. The chrome (sidebar, title bar, dialogs, palette) re-mounts when
 * the language changes; pane bodies pick the new strings up on their next
 * render. `npm run i18n:check` proves every dictionary covers every key.
 */
export type Language = 'en' | 'es' | 'pt-BR' | 'fr' | 'de' | 'it' | 'ja' | 'zh-CN' | 'ko' | 'ru';
export type LanguageSetting = 'system' | Language;

const dictionaries: Record<Language, Record<string, string>> = { en: {}, es, 'pt-BR': ptBR, fr, de, it, ja, 'zh-CN': zhCN, ko, ru };

/** Native names, the way each language writes itself. */
export const LANGUAGES: Array<{ value: LanguageSetting; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'ko', label: '한국어' },
  { value: 'ru', label: 'Русский' },
];

/** BCP 47 tags for Intl, dates and speech, per language. */
export const LOCALES: Record<Language, string> = {
  en: 'en-US',
  es: 'es-AR',
  'pt-BR': 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ja: 'ja-JP',
  'zh-CN': 'zh-CN',
  ko: 'ko-KR',
  ru: 'ru-RU',
};

let current: Language = 'en';

/** The closest supported language for a BCP 47 tag ("pt-PT" → pt-BR, "zh-TW" → zh-CN, "es-MX" → es). */
export function matchLanguage(tag: string): Language {
  const lower = tag.toLowerCase();
  const base = lower.split(/[-_]/)[0];
  const map: Record<string, Language> = { en: 'en', es: 'es', pt: 'pt-BR', fr: 'fr', de: 'de', it: 'it', ja: 'ja', zh: 'zh-CN', ko: 'ko', ru: 'ru' };
  return map[base] ?? 'en';
}

export function resolveLanguage(setting: LanguageSetting): Language {
  if (setting !== 'system') return setting;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return matchLanguage(nav);
}

export function setLanguage(l: Language) {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALES[l];
}

export function currentLanguage(): Language {
  return current;
}

/** The BCP 47 tag of the active language. */
export function currentLocale(): string {
  return LOCALES[current];
}

/**
 * Mark a string in a table (labels, hints, group names) that is translated later with `t()` where it is shown.
 * Identity at runtime; `npm run i18n:check` extracts it like a `t()` call.
 */
export const T = (text: string): string => text;

/** Translate; `{name}` placeholders are filled from `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = dictionaries[current][text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

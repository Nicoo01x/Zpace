/**
 * Font catalogue. Defaults follow the reference screenshot: San Francisco for
 * the interface and SF Mono for the transcript / terminal — used whenever they
 * are installed (always on macOS), with the closest free faces as fallbacks.
 * Bundled faces ship with the app (fontsource); system faces
 * are offered when detected on the machine (San Francisco on macOS or when the
 * user installed SF Pro / SF Mono on Windows, Segoe UI, Cascadia, Consolas…).
 */

export interface FontOption {
  id: string;
  label: string;
  /** CSS font-family stack (without generic fallback). */
  family: string;
  kind: 'bundled' | 'system';
  /** Family name used for the install check (system fonts only). */
  probe?: string;
}

export const SANS_FONTS: FontOption[] = [
  {
    id: 'sf-pro',
    label: 'San Francisco (SF Pro)',
    family: "'SF Pro Text', 'SF Pro Display', 'SF Pro', -apple-system, BlinkMacSystemFont, 'Inter Variable'",
    kind: 'system',
    probe: 'SF Pro Text',
  },
  { id: 'inter', label: 'Inter', family: "'Inter Variable'", kind: 'bundled' },
  { id: 'geist', label: 'Geist Sans', family: "'Geist Variable'", kind: 'bundled' },
  { id: 'dm-sans', label: 'DM Sans', family: "'DM Sans Variable'", kind: 'bundled' },
  { id: 'manrope', label: 'Manrope', family: "'Manrope Variable'", kind: 'bundled' },
  { id: 'space-grotesk', label: 'Space Grotesk', family: "'Space Grotesk Variable'", kind: 'bundled' },
  { id: 'plus-jakarta', label: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans Variable'", kind: 'bundled' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', family: "'IBM Plex Sans'", kind: 'bundled' },
  { id: 'segoe', label: 'Segoe UI', family: "'Segoe UI Variable Text', 'Segoe UI Variable', 'Segoe UI'", kind: 'system', probe: 'Segoe UI' },
  { id: 'helvetica', label: 'Helvetica Neue', family: "'Helvetica Neue', Helvetica", kind: 'system', probe: 'Helvetica Neue' },
  { id: 'roboto', label: 'Roboto', family: 'Roboto', kind: 'system', probe: 'Roboto' },
  { id: 'system', label: 'System default', family: 'system-ui', kind: 'system' },
];

export const MONO_FONTS: FontOption[] = [
  {
    id: 'sf-mono',
    label: 'SF Mono',
    family: "'SF Mono', 'SFMono-Regular', Menlo, 'DejaVu Mono', 'JetBrains Mono Variable'",
    kind: 'system',
    probe: 'SF Mono',
  },
  { id: 'jetbrains', label: 'JetBrains Mono', family: "'JetBrains Mono Variable'", kind: 'bundled' },
  { id: 'geist-mono', label: 'Geist Mono', family: "'Geist Mono Variable'", kind: 'bundled' },
  { id: 'fira-code', label: 'Fira Code', family: "'Fira Code Variable'", kind: 'bundled' },
  { id: 'source-code-pro', label: 'Source Code Pro', family: "'Source Code Pro Variable'", kind: 'bundled' },
  { id: 'roboto-mono', label: 'Roboto Mono', family: "'Roboto Mono Variable'", kind: 'bundled' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', family: "'IBM Plex Mono'", kind: 'bundled' },
  { id: 'dejavu-mono', label: 'DejaVu Sans Mono', family: "'DejaVu Mono'", kind: 'bundled' },
  { id: 'menlo', label: 'Menlo', family: 'Menlo', kind: 'system', probe: 'Menlo' },
  { id: 'cascadia', label: 'Cascadia Code', family: "'Cascadia Code', 'Cascadia Mono'", kind: 'system', probe: 'Cascadia Code' },
  { id: 'consolas', label: 'Consolas', family: 'Consolas', kind: 'system', probe: 'Consolas' },
  { id: 'jetbrains-nerd', label: 'JetBrainsMono Nerd Font', family: "'JetBrainsMono Nerd Font', 'JetBrainsMono NF'", kind: 'system', probe: 'JetBrainsMono Nerd Font' },
  { id: 'cascadia-nerd', label: 'CaskaydiaCove Nerd Font', family: "'CaskaydiaCove Nerd Font', 'CaskaydiaCove NF'", kind: 'system', probe: 'CaskaydiaCove Nerd Font' },
  { id: 'monaspace', label: 'Monaspace Neon', family: "'Monaspace Neon'", kind: 'system', probe: 'Monaspace Neon' },
];

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO_FALLBACK = "ui-monospace, 'Cascadia Code', Consolas, Menlo, monospace";

/** Resolve a font setting (an option id or a custom family) to a CSS stack. */
export function resolveFontStack(value: string, mono: boolean): string {
  const list = mono ? MONO_FONTS : SANS_FONTS;
  const opt = list.find((f) => f.id === value);
  const primary = opt ? opt.family : value.trim() ? quote(value.trim()) : list[0].family;
  return `${primary}, ${mono ? MONO_FALLBACK : SANS_FALLBACK}`;
}

function quote(family: string): string {
  return /^['"]/.test(family) || /^[a-zA-Z-]+$/.test(family) ? family : `'${family.replace(/'/g, '')}'`;
}

/* ---------------------------------------------------------------- */
/*  Detection — canvas width comparison against generic fallbacks.   */
/* ---------------------------------------------------------------- */

const cache = new Map<string, boolean>();

export function isFontInstalled(family: string): boolean {
  if (typeof document === 'undefined') return false;
  const hit = cache.get(family);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const text = 'mmmmmmmmmmlliI0O1wWxyz@#%&';
  const measure = (font: string) => {
    ctx.font = `72px ${font}`;
    return ctx.measureText(text).width;
  };
  const found = (['monospace', 'sans-serif', 'serif'] as const).some((generic) => measure(`'${family}', ${generic}`) !== measure(generic));
  cache.set(family, found);
  return found;
}

export function availableFonts(list: FontOption[]): Array<FontOption & { installed: boolean }> {
  return list.map((f) => ({ ...f, installed: f.kind === 'bundled' || !f.probe || isFontInstalled(f.probe) }));
}

export const DEFAULT_SANS = 'sf-pro';
export const DEFAULT_MONO = 'sf-mono';

/* ---------------------------------------------------------------- */
/*  Terminal                                                          */
/* ---------------------------------------------------------------- */

/**
 * Icon fallbacks appended to every terminal stack: the bundled Symbols Nerd
 * Font Mono covers all Nerd Font code points at one cell width; the rest are
 * common installed families and the OS symbol font.
 */
export const TERMINAL_GLYPH_FALLBACK = "'Symbols Nerd Font Mono', 'JetBrainsMono Nerd Font', 'CaskaydiaCove Nerd Font', 'FiraCode Nerd Font', 'Segoe UI Symbol', 'Apple Symbols'";

export interface TerminalFontInput {
  /** `terminal.font` setting: 'auto' | 'mono' | an installed family name. */
  setting: string;
  /** `monoFont` setting (id or custom family). */
  monoFont: string;
  /** Font face of the default Windows Terminal profile, if detected. */
  systemTerminalFont?: string | null;
}

/** Which family actually leads the terminal stack for the current setting. */
export function terminalPrimaryFont({ setting, monoFont, systemTerminalFont }: TerminalFontInput): { family: string; source: 'windows-terminal' | 'mono' | 'custom' } {
  if (setting === 'auto') {
    if (systemTerminalFont && isFontInstalled(systemTerminalFont)) return { family: quote(systemTerminalFont), source: 'windows-terminal' };
    return { family: resolveFontStack(monoFont, true), source: 'mono' };
  }
  if (setting === 'mono' || !setting.trim()) return { family: resolveFontStack(monoFont, true), source: 'mono' };
  return { family: quote(setting.trim()), source: 'custom' };
}

/** Full CSS stack for xterm: chosen face, then icon fallbacks, then the mono fallback. */
export function terminalFontStack(input: TerminalFontInput): string {
  const { family } = terminalPrimaryFont(input);
  return `${family}, ${TERMINAL_GLYPH_FALLBACK}, ${MONO_FALLBACK}`;
}

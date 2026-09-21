import { create } from 'zustand';
import type { AgentKind } from '@/features/agent/agents';
import type { LanguageSetting } from '@/i18n';
import type { SoundTheme } from '@/features/notifications/sound';
import { DESKTOP_ISLAND_DEFAULTS, type DesktopIslandSettings } from '@/features/island/desktop/protocol';
import { persist } from 'zustand/middleware';
import { DEFAULT_MONO, DEFAULT_SANS } from '@/lib/fonts';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'default' | 'comfortable';
/** How heavy the interface text is: every weight in the UI shifts up one or two steps. */
export type TextWeight = 'regular' | 'medium' | 'bold';
export type NotificationSurface = 'both' | 'island' | 'toasts';
export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** Colour tokens the user can override per appearance. */
export type ColorToken = 'accent' | 'accentWarm' | 'canvas' | 'background' | 'surface' | 'textPrimary' | 'textSecondary' | 'border';
export type ColorOverrides = Partial<Record<ColorToken, string>>;

export const ACCENT_PRESETS: Array<{ id: string; label: string; light: string; dark: string }> = [
  { id: 'blue', label: 'Blue', light: '#2f6fde', dark: '#6da8f5' },
  { id: 'indigo', label: 'Indigo', light: '#5865e0', dark: '#8b93f5' },
  { id: 'violet', label: 'Violet', light: '#7c4fd6', dark: '#b08cf0' },
  { id: 'teal', label: 'Teal', light: '#1f8a8a', dark: '#5fc9c9' },
  { id: 'green', label: 'Green', light: '#2c8a55', dark: '#5dc98a' },
  { id: 'amber', label: 'Amber', light: '#b8791f', dark: '#e0b04a' },
  { id: 'orange', label: 'Orange', light: '#d97a45', dark: '#e38b5a' },
  { id: 'rose', label: 'Rose', light: '#d1466f', dark: '#f07a9f' },
  { id: 'graphite', label: 'Graphite', light: '#3f3f44', dark: '#c4c4c8' },
];

export interface SettingsState {
  // General
  sendKey: 'enter' | 'mod+enter';
  confirmOnClose: boolean;
  /** The close button hides the window to the tray instead of quitting. */
  closeToTray: boolean;
  /** Look for a newer version once at launch. */
  checkUpdates: boolean;
  restoreLayout: boolean;
  /** Usage / limits gauge in the title bar. */
  showUsage: boolean;
  /** Monaco zoom level (Ctrl + wheel); 0 = the normal size. */
  editorZoom: number;
  /** The entrance screen at launch (greeting, dashboard, commit map). */
  showWelcome: boolean;
  /** How the start screen greets you; empty = the git or OS user name. */
  userName: string;
  /** UI language; 'system' follows the OS. */
  language: LanguageSetting;

  // Appearance
  theme: ThemeMode;
  /** Font option id (see lib/fonts) or a custom family name. */
  font: string;
  monoFont: string;
  fontSize: number;
  textWeight: TextWeight;
  monoSize: number;
  density: Density;
  reducedMotion: 'system' | 'on' | 'off';
  accent: string; // preset id or 'custom'
  /** The theme pack last applied (appearance + tokens + terminal scheme + editor), if any. */
  themePack?: string;
  colors: { light: ColorOverrides; dark: ColorOverrides };

  // Terminal
  terminal: {
    shellId: string | null;
    /** 'auto' = Windows Terminal's face when installed, else the interface mono font; 'mono' = interface mono font; otherwise a family name. */
    font: string;
    /** Force the terminal light/dark regardless of the app theme (TUIs like Claude Code assume a dark background by default). */
    appearance: 'auto' | 'light' | 'dark';
    fontSize: number;
    cursorStyle: 'block' | 'bar' | 'underline';
    cursorBlink: boolean;
    scrollback: number;
    scheme: string;
    /** Inner padding around the grid, px. */
    padding: number;
    letterSpacing: number;
    fontWeight: 'normal' | 'medium' | 'semibold';
    /** Background opacity (1 = solid): the pane shows through below. */
    opacity: number;
    /** Bold text uses the bright ANSI colours (classic terminal look). */
    boldAsBright: boolean;
    /** Minimum contrast ratio xterm enforces between text and background (1 = off, 4.5 = readable, 21 = max). */
    minContrast: number;
    copyOnSelect: boolean;
    rightClickPaste: boolean;
    bell: 'none' | 'sound' | 'visual';
    smoothScroll: boolean;
    /** Typed into every new shell tab right after it starts (not agent programs). */
    startupCommand: string;
    /** KEY=VALUE per line, added to every terminal's environment. */
    env: string;
    lineHeight: number;
  };

  /** Which agent the "ask" entries lead with (file header button, context menus, palette). */
  defaultAgent: AgentKind;

  // Claude Code
  claude: {
    binaryPath: string;
    defaultModel: string;
    permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
    env: Record<string, string>;
    runInWsl: boolean;
    wslDistro: string;
    /** Extra CLI arguments appended to every `claude` launch (shell-style, quotes allowed). */
    extraArgs: string;
    /** Show the launch dialog (model, permission mode, arguments) every time Claude Code is opened. */
    askArgs: boolean;
    /** Resume the last conversation of the folder (`--continue`) by default. */
    continueLast: boolean;
    /** Model for Spotlight's inline answers (fast by default). */
    quickModel: string;
  };

  // Git
  git: { autoFetch: boolean; showDecorations: boolean };

  // Mascot (bloub)
  mascot: {
    enabled: boolean;
    placement: 'titlebar' | 'corner' | 'sidebar' | 'home';
    shape: string;
    /** hex; empty = follow the accent colour */
    color: string;
    expression: string;
    size: number;
  };

  // Browser
  browser: {
    /** Search engine id (see features/browser/engines). */
    searchEngine: string;
    /** Page a new browser pane opens with; empty = the engine's home. */
    homepage: string;
  };

  // Notifications
  notifications: {
    onComplete: boolean;
    onPermission: boolean;
    onError: boolean;
    /** Two-tone chime when an agent finishes or needs you. */
    sound: boolean;
    /** A short cue with every toast (success, error, warning, info). */
    toastSound: boolean;
    /** 0..1 */
    volume: number;
    /** Timbre of every cue (see notifications/sound.ts). */
    soundTheme: SoundTheme;
    toastPosition: ToastPosition;
    /** Where notifications show: the island in the title bar, sileo toasts, or both. */
    surface: NotificationSurface;
    /** Say "Claude finished" / "needs you" out loud (system voices). */
    speak: boolean;
  };

  /** The island as a floating window over the whole desktop (see features/island/desktop). */
  desktopIsland: DesktopIslandSettings;

  /** The voice assistant's ears: which microphone, which language, which whisper model. */
  voice: {
    /** A cpal input device name; '' = the system default. */
    device: string;
    /** A whisper language code ('es', 'en', …) or 'auto'. */
    language: string;
    model: 'base' | 'small';
  };

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  patch: (partial: Partial<SettingsState>) => void;
  setColor: (mode: 'light' | 'dark', token: ColorToken, value: string | undefined) => void;
  resetColors: () => void;
  reset: () => void;
}

const defaults: Omit<SettingsState, 'set' | 'patch' | 'setColor' | 'resetColors' | 'reset'> = {
  sendKey: 'enter',
  confirmOnClose: true,
  closeToTray: false,
  checkUpdates: true,
  restoreLayout: true,
  showUsage: true,
  editorZoom: 0,
  language: 'en',

  theme: 'system',
  font: DEFAULT_SANS,
  monoFont: DEFAULT_MONO,
  fontSize: 13.5,
  textWeight: 'regular',
  monoSize: 13.5,
  density: 'default',
  reducedMotion: 'system',
  accent: 'blue',
  colors: { light: {}, dark: {} },

  terminal: {
    shellId: null,
    font: 'auto',
    appearance: 'auto',
    fontSize: 13,
    cursorStyle: 'bar',
    cursorBlink: true,
    scrollback: 5000,
    scheme: 'conduit',
    lineHeight: 1.25,
    padding: 8,
    letterSpacing: 0,
    fontWeight: 'normal',
    opacity: 1,
    boldAsBright: false,
    minContrast: 1,
    copyOnSelect: false,
    rightClickPaste: true,
    bell: 'none',
    smoothScroll: true,
    startupCommand: '',
    env: '',
  },

  defaultAgent: 'claude',
  showWelcome: true,
  userName: '',
  claude: {
    binaryPath: 'claude',
    defaultModel: 'opus',
    permissionMode: 'default',
    env: {},
    runInWsl: false,
    wslDistro: '',
    extraArgs: '',
    askArgs: false,
    continueLast: false,
    quickModel: 'haiku',
  },

  git: { autoFetch: true, showDecorations: true },
  browser: { searchEngine: 'duckduckgo', homepage: '' },
  mascot: { enabled: true, placement: 'titlebar', shape: 'nuage', color: '', expression: 'neutre', size: 64 },

  notifications: { onComplete: true, onPermission: true, onError: true, sound: false, toastSound: false, volume: 0.8, soundTheme: 'glass', toastPosition: 'top-center', surface: 'island', speak: false },
  desktopIsland: DESKTOP_ISLAND_DEFAULTS,
  voice: { device: '', language: 'auto', model: 'base' },
};

/** The persisted settings over the defaults, section by section, so new nested keys are never lost. */
function withDefaults(p: Partial<SettingsState>): Partial<SettingsState> {
  return {
    ...defaults,
    ...p,
    terminal: { ...defaults.terminal, ...(p.terminal ?? {}) },
    claude: { ...defaults.claude, ...(p.claude ?? {}) },
    notifications: { ...defaults.notifications, ...(p.notifications ?? {}) },
    browser: { ...defaults.browser, ...(p.browser ?? {}) },
    mascot: { ...defaults.mascot, ...(p.mascot ?? {}) },
    voice: { ...defaults.voice, ...(p.voice ?? {}) },
    desktopIsland: { ...defaults.desktopIsland, ...(p.desktopIsland ?? {}), modules: { ...defaults.desktopIsland.modules, ...(p.desktopIsland?.modules ?? {}) }, readouts: { ...defaults.desktopIsland.readouts, ...(p.desktopIsland?.readouts ?? {}) } },
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      set: (key, value) =>
        set((s) => {
          // An accent preset must win over a theme pack's accent override, or the swatches look dead after a pack.
          if (key === 'accent' && value !== 'custom') {
            const strip = (o: ColorOverrides) => {
              const n = { ...o };
              delete n.accent;
              delete n.accentWarm;
              return n;
            };
            return { accent: value as string, colors: { light: strip(s.colors.light), dark: strip(s.colors.dark) } };
          }
          return { [key]: value } as Partial<SettingsState>;
        }),
      patch: (partial) => set(partial),
      setColor: (mode, token, value) =>
        set((s) => {
          const next = { ...s.colors[mode] };
          if (value) next[token] = value;
          else delete next[token];
          return { colors: { ...s.colors, [mode]: next } };
        }),
      resetColors: () => set({ colors: { light: {}, dark: {} }, accent: 'blue' }),
      reset: () => set(defaults),
    }),
    {
      name: 'conduit.settings',
      version: 4,
      migrate: (persisted) => {
        // v1 stored font ids 'inter' | 'geist' and monoFont 'jetbrains' | 'geist' — still valid ids.
        // v3 added terminal.font / terminal.appearance; v4 claude.extraArgs / askArgs / continueLast.
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...withDefaults(p), monoFont: p.monoFont === 'geist' ? 'geist-mono' : (p.monoFont ?? defaults.monoFont) } as SettingsState;
      },
      // Runs on every launch (migrate only when the version bumps): a key added to a nested section since the
      // settings were last saved gets its default instead of vanishing — 'surface' missing once meant toasts and the island both showed.
      merge: (persisted, current) => ({ ...current, ...withDefaults((persisted ?? {}) as Partial<SettingsState>) }),
    },
  ),
);

/**
 * Models Claude Code accepts for `--model` / `/model`. Aliases (opus, sonnet, haiku,
 * opusplan) follow the CLI; full ids are passed through as-is, and any other id can
 * be typed in the launch panel.
 */
export const MODELS = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1', context: 1_000_000, hint: '1M context' },
  { id: 'opus', label: 'Opus 5', context: 1_000_000, hint: '1M context' },
  { id: 'sonnet', label: 'Sonnet 5', context: 1_000_000, hint: '1M context' },
  { id: 'haiku', label: 'Haiku 4.5', context: 200_000, hint: '200k context' },
  { id: 'opusplan', label: 'Opus plan · Sonnet build', context: 1_000_000, hint: 'opusplan' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', context: 1_000_000, hint: '1M context' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', context: 1_000_000, hint: '1M context' },
] as const;

/** Context window for a model id (custom ids assume 1M). */
export function modelContext(id: string): number {
  return MODELS.find((m) => m.id === id)?.context ?? (id.includes('haiku') ? 200_000 : 1_000_000);
}

export function modelLabel(id: string): string {
  const m = MODELS.find((x) => x.id === id);
  return m ? `${m.label} (${m.hint})` : id;
}

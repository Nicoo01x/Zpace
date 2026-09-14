import { useSettings, type ColorOverrides } from '@/stores/settings';
import { monaco } from '@/features/files/monaco';
import { pluginPacks } from '@/features/plugins/runtime';

/**
 * Theme packs: one choice that dresses everything the same way — the app's
 * tokens (canvas, surfaces, text, border, accent), the terminal scheme and
 * the editor. The popular ones, with their canonical palettes. "Zpace" is
 * the house look, which is also the way back.
 */
export interface ThemePack {
  id: string;
  label: string;
  appearance: 'light' | 'dark';
  colors: ColorOverrides;
  /** Terminal scheme id (see terminal/schemes.ts). */
  scheme: string;
  editor: { background: string; foreground: string; selection: string; lineHighlight: string; comment: string };
}

export const THEME_PACKS: ThemePack[] = [
  { id: 'zorynq-light', label: 'Zpace', appearance: 'light', colors: {}, scheme: 'conduit', editor: { background: '#fbfbfa', foreground: '#1d1d1f', selection: '#cfe1fb', lineHighlight: '#f3f3f1', comment: '#8a8a8e' } },
  { id: 'zorynq-dark', label: 'Zpace Dark', appearance: 'dark', colors: {}, scheme: 'conduit', editor: { background: '#141414', foreground: '#e8e8e8', selection: '#2b3d5c', lineHighlight: '#1b1b1b', comment: '#7a7a7e' } },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    appearance: 'dark',
    colors: { canvas: '#181825', background: '#1e1e2e', surface: '#313244', textPrimary: '#cdd6f4', textSecondary: '#a6adc8', border: '#313244', accent: '#89b4fa', accentWarm: '#fab387' },
    scheme: 'catppuccin-mocha',
    editor: { background: '#1e1e2e', foreground: '#cdd6f4', selection: '#45475a', lineHighlight: '#262637', comment: '#6c7086' },
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    appearance: 'light',
    colors: { canvas: '#e6e9ef', background: '#eff1f5', surface: '#ffffff', textPrimary: '#4c4f69', textSecondary: '#6c6f85', border: '#ccd0da', accent: '#1e66f5', accentWarm: '#fe640b' },
    scheme: 'github-light',
    editor: { background: '#eff1f5', foreground: '#4c4f69', selection: '#ccd0da', lineHighlight: '#e6e9ef', comment: '#9ca0b0' },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    appearance: 'dark',
    colors: { canvas: '#21222c', background: '#282a36', surface: '#343746', textPrimary: '#f8f8f2', textSecondary: '#a9abb8', border: '#44475a', accent: '#bd93f9', accentWarm: '#ffb86c' },
    scheme: 'dracula',
    editor: { background: '#282a36', foreground: '#f8f8f2', selection: '#44475a', lineHighlight: '#2f313f', comment: '#6272a4' },
  },
  {
    id: 'nord',
    label: 'Nord',
    appearance: 'dark',
    colors: { canvas: '#272c36', background: '#2e3440', surface: '#3b4252', textPrimary: '#eceff4', textSecondary: '#b8c0cc', border: '#434c5e', accent: '#88c0d0', accentWarm: '#d08770' },
    scheme: 'nord',
    editor: { background: '#2e3440', foreground: '#d8dee9', selection: '#434c5e', lineHighlight: '#353b49', comment: '#616e88' },
  },
  {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    appearance: 'dark',
    colors: { canvas: '#1d2021', background: '#282828', surface: '#3c3836', textPrimary: '#ebdbb2', textSecondary: '#bdae93', border: '#3c3836', accent: '#83a598', accentWarm: '#fabd2f' },
    scheme: 'gruvbox',
    editor: { background: '#282828', foreground: '#ebdbb2', selection: '#504945', lineHighlight: '#32302f', comment: '#928374' },
  },
  {
    id: 'one-dark',
    label: 'One Dark',
    appearance: 'dark',
    colors: { canvas: '#21252b', background: '#282c34', surface: '#2c313a', textPrimary: '#abb2bf', textSecondary: '#8b929e', border: '#3e4451', accent: '#61afef', accentWarm: '#d19a66' },
    scheme: 'one-dark',
    editor: { background: '#282c34', foreground: '#abb2bf', selection: '#3e4451', lineHighlight: '#2c313a', comment: '#5c6370' },
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    appearance: 'dark',
    colors: { canvas: '#16161e', background: '#1a1b26', surface: '#24283b', textPrimary: '#c0caf5', textSecondary: '#9aa5ce', border: '#292e42', accent: '#7aa2f7', accentWarm: '#ff9e64' },
    scheme: 'tokyo-night',
    editor: { background: '#1a1b26', foreground: '#c0caf5', selection: '#33467c', lineHighlight: '#1f2335', comment: '#565f89' },
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    appearance: 'light',
    colors: { canvas: '#eee8d5', background: '#fdf6e3', surface: '#fffcf0', textPrimary: '#073642', textSecondary: '#657b83', border: '#e3dcc3', accent: '#268bd2', accentWarm: '#cb4b16' },
    scheme: 'solarized-light',
    editor: { background: '#fdf6e3', foreground: '#657b83', selection: '#eee8d5', lineHighlight: '#f7f0dc', comment: '#93a1a1' },
  },
  {
    id: 'github-light',
    label: 'GitHub Light',
    appearance: 'light',
    colors: { canvas: '#f6f8fa', background: '#ffffff', surface: '#ffffff', textPrimary: '#1f2328', textSecondary: '#656d76', border: '#d0d7de', accent: '#0969da', accentWarm: '#bc4c00' },
    scheme: 'github-light',
    editor: { background: '#ffffff', foreground: '#1f2328', selection: '#ddf4ff', lineHighlight: '#f6f8fa', comment: '#6e7781' },
  },
];

/** Redefine the editor themes from a pack (editors follow on their next paint). */
export function applyEditorTheme(pack: ThemePack) {
  const name = pack.appearance === 'dark' ? 'conduit-dark' : 'conduit-light';
  monaco.editor.defineTheme(name, {
    base: pack.appearance === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [{ token: 'comment', foreground: pack.editor.comment.replace('#', ''), fontStyle: 'italic' }],
    colors: {
      'editor.background': pack.editor.background,
      'editor.foreground': pack.editor.foreground,
      'editor.selectionBackground': pack.editor.selection,
      'editor.lineHighlightBackground': pack.editor.lineHighlight,
      'editorLineNumber.foreground': pack.editor.comment,
      'editorGutter.background': pack.editor.background,
    },
  });
  monaco.editor.setTheme(name);
}

/** Apply a pack everywhere: appearance, tokens, terminal scheme, editor. */
/** Every pack on offer: the built-in ones, then the ones enabled plugins contribute. */
export function allPacks(): ThemePack[] {
  return [...THEME_PACKS, ...pluginPacks()];
}

export function applyPack(id: string) {
  const pack = allPacks().find((p) => p.id === id);
  if (!pack) return;
  const s = useSettings.getState();
  s.patch({
    theme: pack.appearance,
    themePack: pack.id,
    accent: pack.colors.accent ? 'custom' : 'blue',
    colors: { ...s.colors, [pack.appearance]: pack.colors },
    terminal: { ...s.terminal, scheme: pack.scheme, appearance: pack.appearance },
  });
  applyEditorTheme(pack);
}

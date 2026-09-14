import type { ITheme } from '@xterm/xterm';

/**
 * Terminal colour schemes. "conduit" follows the design tokens (light/dark);
 * the rest are the classics people expect to find in a terminal app.
 */
export interface TerminalScheme {
  id: string;
  label: string;
  /** `auto` picks light/dark from the app theme. */
  appearance: 'auto' | 'light' | 'dark';
  light?: Partial<ITheme>;
  dark?: Partial<ITheme>;
}

const ansi = (colors: string[]): Partial<ITheme> => ({
  black: colors[0],
  red: colors[1],
  green: colors[2],
  yellow: colors[3],
  blue: colors[4],
  magenta: colors[5],
  cyan: colors[6],
  white: colors[7],
  brightBlack: colors[8],
  brightRed: colors[9],
  brightGreen: colors[10],
  brightYellow: colors[11],
  brightBlue: colors[12],
  brightMagenta: colors[13],
  brightCyan: colors[14],
  brightWhite: colors[15],
});

export const TERMINAL_SCHEMES: TerminalScheme[] = [
  {
    id: 'conduit',
    label: 'Zpace',
    appearance: 'auto',
    light: {
      background: '#fbfbfa',
      foreground: '#1d1d1f',
      cursor: '#1d1d1f',
      selectionBackground: 'rgba(47,111,222,0.18)',
      ...ansi(['#1d1d1f', '#c53b31', '#2a7f4f', '#a86f14', '#3567c6', '#8b4bb0', '#2c8c9c', '#6e6e73', '#9c9ca1', '#d4443b', '#2c8a55', '#b8791f', '#4f7fe0', '#a266c8', '#3aa3b6', '#1d1d1f']),
    },
    dark: {
      background: '#141414',
      foreground: '#e8e8e8',
      cursor: '#f5f5f5',
      selectionBackground: 'rgba(109,168,245,0.28)',
      ...ansi(['#1c1c1c', '#f07167', '#5dc98a', '#e0b04a', '#7ea6f3', '#c98be0', '#6fc7d6', '#d8d8d8', '#6e6e73', '#ff8a80', '#7ee0a5', '#f0c465', '#9dbcf7', '#dba7ee', '#8fd9e6', '#f5f5f5']),
    },
  },
  {
    id: 'one-dark',
    label: 'One Dark',
    appearance: 'dark',
    dark: {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      selectionBackground: 'rgba(62,68,81,0.9)',
      ...ansi(['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf', '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff']),
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    appearance: 'dark',
    dark: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: 'rgba(68,71,90,0.9)',
      ...ansi(['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    appearance: 'dark',
    dark: {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      selectionBackground: 'rgba(67,76,94,0.9)',
      ...ansi(['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0', '#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']),
    },
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    appearance: 'dark',
    dark: {
      background: '#282828',
      foreground: '#ebdbb2',
      cursor: '#ebdbb2',
      selectionBackground: 'rgba(80,73,69,0.9)',
      ...ansi(['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']),
    },
  },
  {
    id: 'monokai',
    label: 'Monokai',
    appearance: 'dark',
    dark: {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      selectionBackground: 'rgba(73,72,62,0.9)',
      ...ansi(['#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2', '#75715e', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5']),
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    appearance: 'dark',
    dark: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      selectionBackground: 'rgba(7,54,66,0.9)',
      ...ansi(['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']),
    },
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    appearance: 'light',
    light: {
      background: '#fdf6e3',
      foreground: '#657b83',
      cursor: '#586e75',
      selectionBackground: 'rgba(238,232,213,0.9)',
      ...ansi(['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']),
    },
  },
  {
    id: 'github-light',
    label: 'GitHub Light',
    appearance: 'light',
    light: {
      background: '#ffffff',
      foreground: '#24292f',
      cursor: '#24292f',
      selectionBackground: 'rgba(84,174,255,0.4)',
      ...ansi(['#24292f', '#cf222e', '#116329', '#4d2d00', '#0969da', '#8250df', '#1b7c83', '#6e7781', '#57606a', '#a40e26', '#1a7f37', '#633c01', '#218bff', '#a475f9', '#3192aa', '#8c959f']),
    },
  },
  {
    id: 'campbell',
    label: 'Campbell',
    appearance: 'dark',
    dark: {
      background: '#0c0c0c',
      foreground: '#cccccc',
      cursor: '#ffffff',
      selectionBackground: 'rgba(255,255,255,0.25)',
      ...ansi(['#0c0c0c', '#c50f1f', '#13a10e', '#c19c00', '#0037da', '#881798', '#3a96dd', '#cccccc', '#767676', '#e74856', '#16c60c', '#f9f1a5', '#3b78ff', '#b4009e', '#61d6d6', '#f2f2f2']),
    },
  },
  {
    id: 'one-half-dark',
    label: 'One Half Dark',
    appearance: 'dark',
    dark: {
      background: '#282c34',
      foreground: '#dcdfe4',
      cursor: '#dcdfe4',
      selectionBackground: 'rgba(220,223,228,0.22)',
      ...ansi(['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#dcdfe4', '#5a6374', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#dcdfe4']),
    },
  },
  {
    id: 'one-half-light',
    label: 'One Half Light',
    appearance: 'light',
    light: {
      background: '#fafafa',
      foreground: '#383a42',
      cursor: '#4f525d',
      selectionBackground: 'rgba(79,82,93,0.2)',
      ...ansi(['#383a42', '#e45649', '#50a14f', '#c18401', '#0184bc', '#a626a4', '#0997b3', '#fafafa', '#4f525d', '#df6c75', '#98c379', '#e4c07a', '#61afef', '#c577dd', '#56b5c1', '#ffffff']),
    },
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    appearance: 'dark',
    dark: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      selectionBackground: 'rgba(51,70,124,0.6)',
      ...ansi(['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5']),
    },
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    appearance: 'dark',
    dark: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: 'rgba(88,91,112,0.6)',
      ...ansi(['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de', '#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8']),
    },
  },
];

export function resolveScheme(id: string, dark: boolean): { theme: Partial<ITheme>; dark: boolean } {
  const s = TERMINAL_SCHEMES.find((x) => x.id === id) ?? TERMINAL_SCHEMES[0];
  if (s.appearance === 'auto') return { theme: (dark ? s.dark : s.light) ?? {}, dark };
  if (s.appearance === 'dark') return { theme: s.dark ?? {}, dark: true };
  return { theme: s.light ?? {}, dark: false };
}

/** Map a Windows Terminal scheme name to one of ours, if we ship it. */
export function schemeFromWindowsTerminal(name: string | null | undefined): TerminalScheme | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const alias: Record<string, string> = {
    'campbell': 'campbell',
    'campbell-powershell': 'campbell',
    'one-half-dark': 'one-half-dark',
    'one-half-light': 'one-half-light',
    'solarized-dark': 'solarized-dark',
    'solarized-light': 'solarized-light',
    'dracula': 'dracula',
    'nord': 'nord',
    'gruvbox-dark': 'gruvbox',
    'monokai': 'monokai',
    'one-dark': 'one-dark',
    'catppuccin-mocha': 'catppuccin-mocha',
  };
  const id = alias[key] ?? key;
  return TERMINAL_SCHEMES.find((x) => x.id === id);
}

/** Eight-swatch strip used by the settings preview. */
export function schemeSwatches(id: string, dark: boolean): string[] {
  const { theme } = resolveScheme(id, dark);
  return [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan, theme.foreground, theme.background].map((c) => c ?? '#888');
}

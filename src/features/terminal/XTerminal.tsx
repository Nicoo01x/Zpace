import { memo, useEffect, useRef } from 'react';
import { toast } from '@/features/notifications/toast-store';
import { playToast } from '@/features/notifications/sound';
import { t } from '@/i18n';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useSettings } from '@/stores/settings';
import { useEnvironment, whenEnvironmentReady } from '@/stores/environment';
import { terminalFontStack } from '@/lib/fonts';
import { useTerminals } from '@/stores/terminals';
import { onPtyData, onPtyExit, ptyAvailable, ptyKill, ptyResize, ptySpawn, ptyWrite } from '@/native/pty';
import { openUrl } from '@/native/system';
import type { TerminalTab } from '@/types/workspace';
import { createPreviewShell } from './previewShell';
import { resolveScheme } from './schemes';
import { registerTerminal } from './registry';
import { useTerminalFind } from './find-store';
import { matchesShortcut } from '@/lib/platform';
import { SHORTCUTS } from '@/app/shortcuts';

const WEIGHT = { normal: 400, medium: 500, semibold: 600 } as const;

/** #rrggbb → rgba(); anything else comes back as is. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return color;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** KEY=VALUE lines from the settings → an env map (blank lines and comments ignored). */
function envFromSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of useSettings.getState().terminal.env.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function themeFromSettings(): ITheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const { scheme: schemeId, appearance } = useSettings.getState().terminal;
  const appDark = appearance === 'auto' ? document.documentElement.classList.contains('dark') : appearance === 'dark';
  const { theme, dark } = resolveScheme(schemeId, appDark);
  const opacity = useSettings.getState().terminal.opacity;
  const bg = theme.background ?? (dark ? '#141414' : '#fbfbfa');
  return {
    cursor: v('--text-primary'),
    cursorAccent: bg,
    ...theme,
    background: opacity < 1 ? withAlpha(bg, opacity) : bg,
    foreground: theme.foreground ?? (dark ? '#e8e8e8' : '#1d1d1f'),
  };
}

/** CSS font stack for xterm from the current settings + detected environment. */
function fontFromSettings(): string {
  const { terminal, monoFont } = useSettings.getState();
  return terminalFontStack({ setting: terminal.font, monoFont, systemTerminalFont: useEnvironment.getState().report?.terminalFont });
}

/**
 * One xterm instance bound to a PTY (desktop) or the preview shell (browser).
 */
/** Plain text of terminal output, for a toast line. */
function stripAnsi(x: string): string {
  // eslint-disable-next-line no-control-regex
  return x.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '');
}

export const XTerminal = memo(function XTerminal({ tab, focused, onExit }: { tab: TerminalTab; focused: boolean; onExit?: (code: number | null) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  /** Re-measures rows/cols and tells the PTY; set by the mount effect. */
  const refitRef = useRef<(() => void) | null>(null);
  const fontSize = useSettings((s) => s.terminal.fontSize);
  const cursorStyle = useSettings((s) => s.terminal.cursorStyle);
  const cursorBlink = useSettings((s) => s.terminal.cursorBlink);
  const scrollback = useSettings((s) => s.terminal.scrollback);
  const theme = useSettings((s) => s.theme);
  const scheme = useSettings((s) => s.terminal.scheme);
  const lineHeight = useSettings((s) => s.terminal.lineHeight);
  const padding = useSettings((s) => s.terminal.padding);
  const letterSpacing = useSettings((s) => s.terminal.letterSpacing);
  const fontWeight = useSettings((s) => s.terminal.fontWeight);
  const opacity = useSettings((s) => s.terminal.opacity);
  const boldAsBright = useSettings((s) => s.terminal.boldAsBright);
  const minContrast = useSettings((s) => s.terminal.minContrast);
  const copyOnSelect = useSettings((s) => s.terminal.copyOnSelect);
  const rightClickPaste = useSettings((s) => s.terminal.rightClickPaste);
  const bell = useSettings((s) => s.terminal.bell);
  const smoothScroll = useSettings((s) => s.terminal.smoothScroll);
  const behaviour = useRef({ copyOnSelect, rightClickPaste, bell });
  useEffect(() => {
    behaviour.current = { copyOnSelect, rightClickPaste, bell };
  });
  const monoFont = useSettings((s) => s.monoFont);
  const terminalFont = useSettings((s) => s.terminal.font);
  const appearance = useSettings((s) => s.terminal.appearance);
  const systemTerminalFont = useEnvironment((e) => e.report?.terminalFont ?? null);
  const setPty = useTerminals((s) => s.setPty);
  const closeTab = useTerminals((s) => s.closeTab);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      // Windows Terminal's face (or the interface mono font) with the bundled Symbols Nerd Font behind it
      // so prompt glyphs (oh-my-posh, starship, Claude Code) always resolve.
      fontFamily: fontFromSettings(),
      fontSize,
      lineHeight,
      letterSpacing,
      cursorStyle,
      cursorBlink,
      scrollback,
      allowProposedApi: true,
      allowTransparency: opacity < 1,
      theme: themeFromSettings(),
      macOptionIsMeta: true,
      fontWeight: WEIGHT[fontWeight],
      fontWeightBold: 700,
      drawBoldTextInBrightColors: boldAsBright,
      minimumContrastRatio: minContrast,
      smoothScrollDuration: smoothScroll ? 120 : 0,
    });
    const cleanups: Array<() => void> = [];
    // Copy on select, right-click paste, the bell — read live so a settings change applies to open tabs.
    term.onSelectionChange(() => {
      if (!behaviour.current.copyOnSelect) return;
      const sel = term.getSelection();
      if (sel) void navigator.clipboard?.writeText(sel).catch(() => void 0);
    });
    const onContext = (e: MouseEvent) => {
      if (!behaviour.current.rightClickPaste) return;
      e.preventDefault();
      void navigator.clipboard
        ?.readText()
        .then((text) => text && term.paste(text))
        .catch(() => void 0);
    };
    host.addEventListener('contextmenu', onContext);
    cleanups.push(() => host.removeEventListener('contextmenu', onContext));
    term.onBell(() => {
      const mode = behaviour.current.bell;
      if (mode === 'sound') {
        const n = useSettings.getState().notifications;
        playToast('info', n.volume, n.soundTheme);
      } else if (mode === 'visual') {
        host.animate([{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 160 });
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon((_e, uri) => void openUrl(uri)));
    // Ctrl+F finds in this terminal; application shortcuts (palette, new terminal, …) are handled by the
    // window listener and must not also reach the shell as control characters.
    // Windows Terminal's rule: Ctrl+C with a selection copies it (and sends nothing to the shell); with nothing
    // selected it is the interrupt. Ctrl+Shift+C / Ctrl+Insert always copy, Ctrl+Shift+V / Shift+Insert paste.
    const copySelection = () => {
      const sel = term.getSelection();
      if (!sel) return false;
      void navigator.clipboard?.writeText(sel).catch(() => void 0);
      term.clearSelection();
      return true;
    };
    const pasteClipboard = () => {
      void navigator.clipboard
        ?.readText()
        .then((text) => text && term.paste(text))
        .catch(() => void 0);
    };
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.ctrlKey && !e.altKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if ((key === 'c' && !e.shiftKey && term.hasSelection()) || (key === 'c' && e.shiftKey) || (key === 'insert' && !e.shiftKey)) {
          if (copySelection()) {
            e.preventDefault();
            return false;
          }
        }
        if (key === 'v' && e.shiftKey) {
          e.preventDefault();
          pasteClipboard();
          return false;
        }
      }
      if (e.type === 'keydown' && e.key === 'Insert' && e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        pasteClipboard();
        return false;
      }
      if (matchesShortcut(e, 'mod+f')) {
        if (e.type === 'keydown') {
          e.preventDefault();
          useTerminalFind.getState().open(tab.id);
        }
        return false;
      }
      if (e.type === 'keydown' && SHORTCUTS.some((sc) => matchesShortcut(e, sc.combo))) return false;
      return true;
    });
    term.open(host);
    termRef.current = term;
    const unregister = registerTerminal(tab.id, term, search);
    // The bundled icon font loads lazily; repaint once it is in so glyphs drawn before it arrived are replaced.
    if (typeof document.fonts?.load === 'function') {
      void document.fonts.load("13px 'Symbols Nerd Font Mono'").then(() => {
        if (!disposed) term.refresh(0, term.rows - 1);
      });
    }

    let disposed = false;
    let ptyId: string | undefined;
    const decoder = new TextDecoder();

    const doFit = () => {
      try {
        fit.fit();
      } catch {
        /* host hidden */
      }
    };
    const refit = () => {
      doFit();
      if (ptyId) void ptyResize(ptyId, term.cols, term.rows);
    };
    refitRef.current = refit;
    doFit();
    const ro = new ResizeObserver(refit);
    ro.observe(host);
    cleanups.push(() => ro.disconnect());

    // Ctrl + wheel zooms the terminal text (persisted, so every terminal follows).
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const settings = useSettings.getState();
      const next = Math.min(28, Math.max(8, settings.terminal.fontSize + (e.deltaY < 0 ? 1 : -1)));
      if (next !== settings.terminal.fontSize) settings.patch({ terminal: { ...settings.terminal, fontSize: next } });
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    cleanups.push(() => host.removeEventListener('wheel', onWheel));

    if (ptyAvailable) {
      // The shell list comes from native detection; a tab restored at startup may mount before it.
      void whenEnvironmentReady()
        .then((env) => {
          if (disposed) throw new Error('disposed');
          const shell = env.shells.find((s) => s.id === tab.shellId) ?? env.shells[0];
          // A tab can run a program directly (Claude Code's TUI) instead of a shell.
          return ptySpawn({
            shell: tab.program?.path ?? shell?.path ?? (navigator.platform.startsWith('Win') ? 'powershell.exe' : '/bin/sh'),
            args: tab.program?.args ?? shell?.args ?? [],
            cwd: tab.cwd || undefined,
            cols: term.cols,
            rows: term.rows,
            env: { TERM: 'xterm-256color', COLORTERM: 'truecolor', ...envFromSettings() },
          });
        })
        .then((id) => {
          if (disposed) {
            void ptyKill(id);
            return;
          }
          ptyId = id;
          setPty(tab.id, id);
          // A startup command for shells (not for Claude Code and friends): typed once the prompt is likely up.
          const startup = useSettings.getState().terminal.startupCommand.trim();
          if (startup && !tab.program) window.setTimeout(() => void ptyWrite(id, startup + '\r'), 600);
          const startedAt = Date.now();
          let tail = '';
          cleanups.push(
            onPtyData(id, (bytes) => {
              const text = decoder.decode(bytes, { stream: true });
              term.write(text);
              if (tab.program) tail = (tail + text).slice(-600);
            }),
          );
          cleanups.push(
            onPtyExit(id, (code) => {
              term.write(`\r\n\x1b[2m[process exited with code ${code ?? '?'}]\x1b[0m\r\n`);
              // An agent that quits right away (missing binary, bad flag, no login) is an error, not a session.
              if (tab.program && code !== 0 && Date.now() - startedAt < 4000) {
                const last = stripAnsi(tail).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-2).join(' · ');
                toast.error(t('{label} exited right away (code {code})', { label: tab.program.label, code: String(code ?? '?') }), { description: last || t('Nothing was printed. Is it installed and signed in?'), origin: null, duration: 9000 });
                closeTab(tab.id);
                return;
              }
              onExit?.(code);
            }),
          );
          const d = term.onData((data) => void ptyWrite(id, data));
          cleanups.push(() => d.dispose());
        })
        .catch((e) => {
          if (e instanceof Error && e.message === 'disposed') return;
          const msg = e instanceof Error ? e.message : String(e);
          term.write(`\x1b[31mFailed to start: ${msg}\x1b[0m\r\n`);
          if (tab.program) {
            toast.error(t('{label} could not start', { label: tab.program.label }), { description: msg, origin: null, duration: 9000 });
            closeTab(tab.id);
          }
        });
    } else {
      const shell = createPreviewShell(term, tab);
      cleanups.push(shell.dispose);
    }

    return () => {
      disposed = true;
      refitRef.current = null;
      unregister();
      cleanups.forEach((c) => c());
      if (ptyId) void ptyKill(ptyId);
      term.dispose();
      termRef.current = null;
    };
    // Recreate only when the tab itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  // Live option updates.
  useEffect(() => {
    const t = termRef.current;
    if (!t) return;
    t.options.fontSize = fontSize;
    t.options.cursorStyle = cursorStyle;
    t.options.cursorBlink = cursorBlink;
    t.options.scrollback = scrollback;
    t.options.lineHeight = lineHeight;
    t.options.letterSpacing = letterSpacing;
    t.options.fontWeight = WEIGHT[fontWeight];
    t.options.drawBoldTextInBrightColors = boldAsBright;
    t.options.minimumContrastRatio = minContrast;
    t.options.smoothScrollDuration = smoothScroll ? 120 : 0;
    // A new cell size means a new row count — refit and tell the shell, or a TUI's bottom bar
    // (Claude Code's prompt) is drawn on rows that no longer fit in the pane.
    const id = requestAnimationFrame(() => refitRef.current?.());
    return () => cancelAnimationFrame(id);
  }, [fontSize, cursorStyle, cursorBlink, scrollback, lineHeight, letterSpacing, fontWeight, boldAsBright, minContrast, smoothScroll]);

  useEffect(() => {
    const t = termRef.current;
    if (!t) return;
    // Wait a frame so CSS variables have switched.
    const id = requestAnimationFrame(() => {
      t.options.theme = themeFromSettings();
      t.options.fontFamily = fontFromSettings();
      refitRef.current?.();
    });
    return () => cancelAnimationFrame(id);
  }, [theme, scheme, monoFont, terminalFont, appearance, systemTerminalFont, opacity]);

  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  return <div ref={hostRef} className="h-full w-full" style={{ backgroundColor: themeFromSettings().background, padding, boxSizing: 'border-box' }} />;
});

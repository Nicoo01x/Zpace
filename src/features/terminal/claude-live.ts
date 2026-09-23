import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { ptyAgent } from '@/native/pty';
import type { ShellKind, TerminalTab } from '@/types/workspace';

/**
 * Which terminals have Claude Code running in them right now, and with what
 * arguments — whether Zpace launched it as the tab's program or the user
 * typed `claude …` into a shell. It is read from the process tree under the
 * PTY (`pty_agent`), checked only while the terminal prints (Claude working,
 * a prompt coming back) and never while it is quiet.
 *
 * It is persisted on purpose: the app can die with Claude open (a power cut,
 * a forced shutdown) and nothing clears the entry then. On the next launch a
 * tab that still has one gets Claude back with the same flags plus `-c`, so
 * the conversation continues where it was.
 */
export interface LiveClaude {
  args: string[];
  /** When the process started (or was relaunched) — the changes panel counts the session from here. */
  since: number;
}

interface ClaudeLiveState {
  byTab: Record<string, LiveClaude>;
  /** The changes panel beside a terminal running Claude. */
  panelOpen: boolean;
  set: (tabId: string, live: LiveClaude | null) => void;
  togglePanel: () => void;
}

export const useClaudeLive = create<ClaudeLiveState>()(
  persist(
    (set) => ({
      byTab: {},
      panelOpen: true,
      set: (tabId, live) =>
        set((s) => {
          if (!live) {
            if (!s.byTab[tabId]) return s;
            const byTab = { ...s.byTab };
            delete byTab[tabId];
            return { byTab };
          }
          return { byTab: { ...s.byTab, [tabId]: live } };
        }),
      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
    }),
    { name: 'zpace.claude-live', version: 1, storage: durableStorage(), partialize: (s) => ({ byTab: s.byTab, panelOpen: s.panelOpen }) },
  ),
);

/** Claude Code subcommands that are not a conversation (`claude mcp list`, `claude update`…). */
const SUBCOMMANDS = new Set(['mcp', 'config', 'update', 'doctor', 'install', 'setup-token', 'migrate-installer', 'plugin', 'plugins']);
/** One-shot runs that end on their own: nothing to bring back. */
const ONE_SHOT = new Set(['-p', '--print', '-v', '--version', '-h', '--help']);

/** Flags followed by a value; the variadic ones take every value up to the next flag, as Claude's own parser does. */
const VALUE_FLAGS = new Set(['--model', '--permission-mode', '--session-id', '--append-system-prompt', '--system-prompt', '--settings', '--agent', '--agents', '--fallback-model', '--output-format', '--input-format', '--setting-sources', '--permission-prompt-tool', '--max-turns', '--from-pr']);
const VARIADIC_FLAGS = new Set(['--add-dir', '--allowedTools', '--allowed-tools', '--disallowedTools', '--disallowed-tools', '--mcp-config', '--betas', '--plugin-dir', '--tools']);

function isConversation(args: string[]): boolean {
  if (args.length && SUBCOMMANDS.has(args[0])) return false;
  return !args.some((a) => ONE_SHOT.has(a));
}

/**
 * The arguments that bring a conversation back: every flag it was started
 * with (model, permission mode, `--dangerously-skip-permissions`, extra
 * dirs…), minus how it was picked (`--continue`, `--resume <id>`) and the
 * initial prompt, which already ran — plus `-c`.
 */
export function resumeArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-c' || a === '--continue' || a.startsWith('--resume=')) continue;
    if (a === '-r' || a === '--resume') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) i++;
      continue;
    }
    if (VALUE_FLAGS.has(a)) {
      out.push(a);
      if (args[i + 1] !== undefined) out.push(args[++i]);
      continue;
    }
    if (VARIADIC_FLAGS.has(a)) {
      out.push(a);
      while (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) out.push(args[++i]);
      continue;
    }
    // A bare word here is the initial prompt: it ran in the first life of the session.
    if (!a.startsWith('-')) continue;
    out.push(a);
  }
  return [...out, '-c'];
}

/** The program arguments for a restored Claude tab (WSL tabs wrap them after `-- claude`). */
export function resumeProgram(program: NonNullable<TerminalTab['program']>): string[] {
  const at = program.path === 'wsl.exe' ? program.args.indexOf('claude') : -1;
  if (at >= 0) return [...program.args.slice(0, at + 1), ...resumeArgs(program.args.slice(at + 1))];
  return resumeArgs(program.args);
}

/** `claude -c …` as a line to type into a shell of this kind, each argument quoted the way that shell reads it. */
export function resumeCommand(args: string[], kind: ShellKind | undefined): string {
  const quote = (a: string) => {
    if (/^[\w.,:=/@+-]+$/.test(a)) return a;
    if (kind === 'cmd') return `"${a.replace(/"/g, '""')}"`;
    if (kind === 'powershell' || kind === 'pwsh') return `'${a.replace(/'/g, "''")}'`;
    return `'${a.replace(/'/g, `'\\''`)}'`;
  };
  return ['claude', ...resumeArgs(args).map(quote)].join(' ');
}

/* ------------------------------ detection ------------------------------ */

const CHECK_EVERY_MS = 2500;
/** A relaunch takes a moment to show up in the process tree; do not forget it before then. */
const GRACE_MS = 12_000;
const timers = new Map<string, { last: number; trailing: number | null }>();

async function check(tabId: string, ptyId: string) {
  const found = await ptyAgent(ptyId).catch(() => null);
  const store = useClaudeLive.getState();
  const current = store.byTab[tabId];
  if (found && isConversation(found.args)) {
    const same = current && current.args.length === found.args.length && current.args.every((a, i) => a === found.args[i]);
    const since = found.startedAt || current?.since || Date.now();
    if (!same || current.since !== since) store.set(tabId, { args: found.args, since });
  } else if (current && Date.now() - current.since > GRACE_MS) {
    store.set(tabId, null);
  }
}

/**
 * The terminal printed something: look at its process tree, at most every
 * 2.5 s, and once more after the output stops (that is when Claude exits back
 * to the prompt).
 */
export function noteTerminalOutput(tabId: string, ptyId: string) {
  const t = timers.get(tabId) ?? { last: 0, trailing: null };
  timers.set(tabId, t);
  const now = Date.now();
  if (t.trailing !== null) window.clearTimeout(t.trailing);
  if (now - t.last >= CHECK_EVERY_MS) {
    t.last = now;
    void check(tabId, ptyId);
  }
  t.trailing = window.setTimeout(() => {
    t.trailing = null;
    t.last = Date.now();
    void check(tabId, ptyId);
  }, CHECK_EVERY_MS);
}

/** The terminal is gone (closed, or its process ended while the app runs): so is its Claude. */
export function forgetTerminal(tabId: string) {
  const t = timers.get(tabId);
  if (t?.trailing != null) window.clearTimeout(t.trailing);
  timers.delete(tabId);
  useClaudeLive.getState().set(tabId, null);
}

/** Wait for the persisted entries, so a restore reads what the last run left behind. */
export function claudeLiveReady(): Promise<void> {
  if (useClaudeLive.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = useClaudeLive.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}

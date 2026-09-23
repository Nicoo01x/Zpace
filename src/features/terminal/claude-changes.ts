import { useEffect } from 'react';
import { create } from 'zustand';
import { git, type ChangedFile } from '@/native/git';
import { useTerminalActivity } from './activity';

/**
 * What changed in the working tree of a terminal where Claude Code runs, for
 * the changes panel beside it. It comes from git (HEAD vs. disk, untracked
 * files included), so it sees every edit the TUI makes, not only the ones a
 * structured session reports. "This session" is what was written after the
 * Claude process started, plus what it deleted (a deletion has no date: it
 * counts when the file was still there at a first look taken well after the
 * start, or always when that look came right after it). In memory only.
 */
export interface TerminalChanges {
  files: ChangedFile[];
  /** Files written (or deleted) since Claude started here. */
  session: ChangedFile[];
  branch: string | null;
  /** Not a git repository (or git is missing). */
  noRepo: boolean;
}

interface ChangesState {
  byTab: Record<string, TerminalChanges>;
  put: (tabId: string, changes: TerminalChanges) => void;
}

export const useTerminalChanges = create<ChangesState>()((set) => ({
  byTab: {},
  put: (tabId, changes) => set((s) => ({ byTab: { ...s.byTab, [tabId]: changes } })),
}));

/** Files already deleted at the first look, per tab and per session start. */
const baselines = new Map<string, { since: number; deleted: Set<string> }>();
/** File times are rounded by some file systems; a write in the same second as the start still counts. */
const SLACK_MS = 1000;
const FIRST_LOOK_MS = 15_000;
const inflight = new Set<string>();

export async function refreshChanges(tabId: string, cwd: string, since: number) {
  if (inflight.has(tabId) || !git.available) return;
  inflight.add(tabId);
  try {
    const [files, head] = await Promise.all([git.changes(cwd), git.head(cwd).catch(() => null)]);
    let base = baselines.get(tabId);
    if (!base || base.since !== since) {
      // A first look right after the start cannot tell Claude's deletions from older ones: it gives them to Claude.
      const late = Date.now() - since > FIRST_LOOK_MS;
      base = { since, deleted: new Set(late ? files.filter((f) => f.status === 'D').map((f) => f.file) : []) };
      baselines.set(tabId, base);
    }
    const gone = base.deleted;
    const session = files.filter((f) => (f.status === 'D' ? !gone.has(f.file) : f.modified >= since - SLACK_MS));
    useTerminalChanges.getState().put(tabId, { files, session, branch: head?.branch || null, noRepo: false });
  } catch {
    useTerminalChanges.getState().put(tabId, { files: [], session: [], branch: null, noRepo: true });
  } finally {
    inflight.delete(tabId);
  }
}

const WHILE_BUSY_MS = 3000;

/**
 * Keep a terminal's changes current while Claude runs in it: once at the
 * start, every 3 s while the terminal is printing, once when it goes quiet,
 * and when the window comes back to the front. Nothing runs while it is idle.
 */
export function useChangesWatch(tabId: string, cwd: string, since: number | null) {
  const busy = useTerminalActivity((s) => !!s.busy[tabId]);
  useEffect(() => {
    if (since === null) return;
    const run = () => {
      if (!document.hidden) void refreshChanges(tabId, cwd, since);
    };
    run();
    const timer = busy ? window.setInterval(run, WHILE_BUSY_MS) : null;
    window.addEventListener('focus', run);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener('focus', run);
    };
  }, [tabId, cwd, since, busy]);
}

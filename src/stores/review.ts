import { create } from 'zustand';
import { readTextFile, writeTextFile, trashPath } from '@/native/system';
import { touchKey } from './touched';

/**
 * What an agent changed, kept reviewable: the first time a session reads or
 * writes a file, its content at that moment is snapshotted; the review pane
 * shows the diff between that baseline and the file on disk, and lets you
 * keep or discard it — per file, or hunk by hunk (a discard writes the old
 * lines back; a keep moves the baseline forward). Keeping drops the
 * snapshot, so the next turn starts a fresh review.
 */
export interface Snapshot {
  sessionId: string;
  projectId?: string;
  path: string;
  key: string;
  /** null = the file did not exist before the agent created it. */
  before: string | null;
  at: number;
  /** The agent wrote it (a read-only snapshot is a baseline in waiting, never listed). */
  written: boolean;
  /** Reviewed and kept: out of the pending list, still in "all changes" with its diff. */
  kept?: boolean;
}

/** One block of the diff: original lines replaced by modified lines (either side may be empty). */
export interface Hunk {
  id: string;
  /** 1-based line where the block starts in the original (the line after, when nothing is removed). */
  origStart: number;
  origLines: string[];
  /** 1-based line where the block starts in the modified file. */
  modStart: number;
  modLines: string[];
}

interface ReviewState {
  pending: Record<string, Record<string, Snapshot>>;
  /** `hint` is the Edit tool's old/new text: when the read lands after the edit, the baseline is rebuilt from it. */
  snapshot: (sessionId: string, path: string, projectId?: string, written?: boolean, hint?: { old?: string; new?: string }) => Promise<void>;
  keepFile: (sessionId: string, key: string) => void;
  keepAll: (sessionId: string) => void;
  discardFile: (sessionId: string, key: string) => Promise<void>;
  discardAll: (sessionId: string) => Promise<void>;
  /** Write the original lines of one hunk back; the rest stays. */
  discardHunk: (sessionId: string, key: string, hunk: Hunk) => Promise<void>;
  /** Fold one hunk into the baseline so it no longer shows. */
  keepHunk: (sessionId: string, key: string, hunk: Hunk) => void;
}

const inflight = new Set<string>();
/** A write that arrived while the read-snapshot was still in flight. */
const writes = new Set<string>();

export const useReview = create<ReviewState>((set, get) => ({
  pending: {},
  snapshot: async (sessionId, path, projectId, written = false, hint) => {
    if (!path) return;
    const key = touchKey(path);
    const token = `${sessionId}:${key}`;
    const have = get().pending[sessionId]?.[key];
    if (have) {
      if (written && !have.written) set((s) => ({ pending: { ...s.pending, [sessionId]: { ...s.pending[sessionId], [key]: { ...have, written: true } } } }));
      return;
    }
    if (inflight.has(token)) {
      if (written) writes.add(token);
      return;
    }
    inflight.add(token);
    try {
      let before: string | null;
      try {
        before = await readTextFile(path);
      } catch {
        before = null;
      }
      // The agent edits the moment it decides to: if the old text is already gone and the new one is in, the read
      // came late — put the old text back to get the file as it was.
      if (before !== null && hint?.old !== undefined && hint.new !== undefined && hint.old !== hint.new && !before.includes(hint.old) && before.includes(hint.new)) {
        before = before.replace(hint.new, hint.old);
      }
      if (get().pending[sessionId]?.[key]) return;
      const wrote = written || writes.has(token);
      writes.delete(token);
      set((s) => {
        const mine = { ...(s.pending[sessionId] ?? {}) };
        // Baselines in waiting are cheap to drop: keep the newest hundred or so.
        const idle = Object.values(mine).filter((x) => !x.written).sort((a, b) => a.at - b.at);
        for (const old of idle.slice(0, Math.max(0, idle.length - 120))) delete mine[old.key];
        mine[key] = { sessionId, projectId, path, key, before, at: Date.now(), written: wrote };
        return { pending: { ...s.pending, [sessionId]: mine } };
      });
    } finally {
      inflight.delete(token);
    }
  },
  keepFile: (sessionId, key) =>
    set((s) => {
      const cur = s.pending[sessionId]?.[key];
      if (!cur) return {};
      return { pending: { ...s.pending, [sessionId]: { ...s.pending[sessionId], [key]: { ...cur, kept: true } } } };
    }),
  keepAll: (sessionId) =>
    set((s) => ({ pending: { ...s.pending, [sessionId]: Object.fromEntries(Object.entries(s.pending[sessionId] ?? {}).map(([k, v]) => [k, v.written ? { ...v, kept: true } : v])) } })),
  discardFile: async (sessionId, key) => {
    const snap = get().pending[sessionId]?.[key];
    if (!snap) return;
    if (snap.before === null) await trashPath(snap.path).catch(() => void 0);
    else await writeTextFile(snap.path, snap.before);
    // Discarded: nothing left to show — drop it.
    set((s) => {
      const rest = { ...(s.pending[sessionId] ?? {}) };
      delete rest[key];
      return { pending: { ...s.pending, [sessionId]: rest } };
    });
  },
  discardAll: async (sessionId) => {
    for (const snap of pendingFor(get().pending, sessionId)) await get().discardFile(sessionId, snap.key);
  },
  discardHunk: async (sessionId, key, hunk) => {
    const snap = get().pending[sessionId]?.[key];
    if (!snap) return;
    const current = await readTextFile(snap.path).catch(() => '');
    const eol = detectEol(current);
    const lines = splitLines(current);
    // The block must still read as the agent left it — the file may have moved on since the hunk was computed.
    const at = hunk.modStart - 1;
    const present = lines.slice(at, at + hunk.modLines.length);
    if (present.join('\n') !== hunk.modLines.join('\n')) throw new Error('The file changed since this hunk was computed — reload the review.');
    lines.splice(at, hunk.modLines.length, ...hunk.origLines);
    await writeTextFile(snap.path, joinLines(lines, eol, current));
  },
  keepHunk: (sessionId, key, hunk) =>
    set((s) => {
      const snap = s.pending[sessionId]?.[key];
      if (!snap) return {};
      const lines = splitLines(snap.before ?? '');
      const at = hunk.origStart - 1;
      lines.splice(at, hunk.origLines.length, ...hunk.modLines);
      const before = joinLines(lines, detectEol(snap.before ?? ''), snap.before ?? '');
      return { pending: { ...s.pending, [sessionId]: { ...s.pending[sessionId], [key]: { ...snap, before } } } };
    }),
}));

/** The files the agent wrote in this session and nobody reviewed yet, oldest first. */
export function pendingFor(pending: ReviewState['pending'], sessionId: string): Snapshot[] {
  return Object.values(pending[sessionId] ?? {})
    .filter((x) => x.written && !x.kept)
    .sort((a, b) => a.at - b.at);
}

/** Everything the agent wrote in this session, kept ones included. */
export function allFor(pending: ReviewState['pending'], sessionId: string): Snapshot[] {
  return Object.values(pending[sessionId] ?? {})
    .filter((x) => x.written)
    .sort((a, b) => a.at - b.at);
}

export function detectEol(text: string): string {
  return /\r\n/.test(text) ? '\r\n' : '\n';
}

/** Lines without their line breaks; a trailing newline does not produce an empty last line. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function joinLines(lines: string[], eol: string, like: string): string {
  const trailing = like === '' || /\n$/.test(like);
  return lines.join(eol) + (trailing && lines.length ? eol : '');
}

/**
 * Line-level diff (LCS) as blocks of replaced lines, with the line numbers the
 * review needs to put them back. Big files fall back to one block.
 */
export function hunksBetween(before: string | null, after: string): Hunk[] {
  const a = splitLines(before ?? '');
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return [{ id: 'all', origStart: 1, origLines: a, modStart: 1, modLines: b }];
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let open: Hunk | null = null;
  const start = () => {
    if (!open) open = { id: `${i + 1}:${j + 1}`, origStart: i + 1, origLines: [], modStart: j + 1, modLines: [] };
    return open;
  };
  const close = () => {
    if (open) hunks.push(open);
    open = null;
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      close();
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      start().origLines.push(a[i]);
      i++;
    } else {
      start().modLines.push(b[j]);
      j++;
    }
  }
  while (i < n) {
    start().origLines.push(a[i]);
    i++;
  }
  while (j < m) {
    start().modLines.push(b[j]);
    j++;
  }
  close();
  return hunks;
}

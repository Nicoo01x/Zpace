import { create } from 'zustand';
import type { FileWriteEvent } from '@/types/agent';
import type { AgentKind } from '@/features/agent/agents';
import { useProjects } from './projects';

/**
 * Files an agent has written during this run of the app, fed by the
 * structured sessions' `file_write` events. The explorer tints them, the file
 * pane reloads them and paints the added lines, the header says who touched
 * the file and when. Marks last until they are cleared (or the app restarts).
 */
export interface TouchedEdit {
  eventId: string;
  at: number;
  /** New text the tool inserted (Edit's new_string / Write's content), to find its lines in the current file. */
  after?: string;
  /** Text it replaced (Edit's old_string): lines shared with `after` are context, not additions. */
  before?: string;
  /** Added line ranges (1-based, inclusive) as the tool reported them, right after the edit. */
  ranges: Array<[number, number]>;
  additions: number;
  deletions: number;
}

export interface TouchedFile {
  /** Absolute path as the agent reported it. */
  path: string;
  sessionId: string;
  agent: AgentKind;
  /** First edit created the file. */
  created: boolean;
  at: number;
  edits: TouchedEdit[];
  additions: number;
  deletions: number;
  /** Bumps on every write so viewers can reload. */
  version: number;
}

interface TouchedState {
  files: Record<string, TouchedFile>;
  record: (ev: FileWriteEvent, projectId?: string) => void;
  clear: (key?: string) => void;
}

/** Case-insensitive, forward-slash key for a path. */
export function touchKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

const isAbsolute = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\');

/** Line ranges of the `+` lines in a unified diff, in the new file's numbering. */
function addedRanges(diff: string | undefined): Array<[number, number]> {
  if (!diff) return [];
  const out: Array<[number, number]> = [];
  let line = 0;
  let open: [number, number] | null = null;
  for (const raw of diff.split('\n')) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (m) {
      line = Number(m[1]) - 1;
      open = null;
      continue;
    }
    if (raw.startsWith('-')) continue;
    line += 1;
    if (raw.startsWith('+')) {
      if (open && open[1] === line - 1) open[1] = line;
      else {
        open = [line, line];
        out.push(open);
      }
    } else open = null;
  }
  return out;
}

export const useTouched = create<TouchedState>((set, get) => ({
  files: {},
  record: (ev, projectId) => {
    // Only once the tool has finished successfully: that is when the bytes are on disk.
    if (!ev.path || !ev.done || ev.failed) return;
    const projectPath = projectId ? useProjects.getState().projects.find((p) => p.id === projectId)?.path : undefined;
    const path = isAbsolute(ev.path) || !projectPath ? ev.path : `${projectPath.replace(/[\\/]+$/, '')}${projectPath.includes('\\') ? '\\' : '/'}${ev.path}`;
    const key = touchKey(path);
    const cur = get().files[key];
    if (cur?.edits.some((e) => e.eventId === ev.id)) return;
    const edit: TouchedEdit = { eventId: ev.id, at: ev.timestamp, after: ev.after, before: ev.before, ranges: addedRanges(ev.diff), additions: ev.additions, deletions: ev.deletions };
    const edits = [...(cur?.edits ?? []), edit];
    const next: TouchedFile = {
      path,
      sessionId: ev.sessionId,
      agent: 'claude',
      created: cur?.created ?? ev.kind === 'A',
      at: ev.timestamp,
      edits,
      additions: edits.reduce((n, e) => n + e.additions, 0),
      deletions: edits.reduce((n, e) => n + e.deletions, 0),
      version: (cur?.version ?? 0) + 1,
    };
    set((s) => ({ files: { ...s.files, [key]: next } }));
  },
  clear: (key) =>
    set((s) => {
      if (!key) return { files: {} };
      const files = { ...s.files };
      delete files[key];
      return { files };
    }),
}));

const NO_RANGES: Array<[number, number]> = [];

/** Which lines of `after` are new: everything but the leading/trailing lines it shares with `before`. */
function newPart(before: string | undefined, after: string): { skip: number; count: number } {
  const a = after.replace(/\n$/, '').split('\n');
  if (!before) return { skip: 0, count: a.length };
  const b = before.replace(/\n$/, '').split('\n');
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  return { skip: pre, count: a.length - pre - suf };
}

/**
 * Lines of `content` an agent added, for the editor's gutter: each edit's new
 * text is located in the current content (so later edits do not shift it);
 * when it cannot be found the ranges the tool reported are used as they were.
 */
export function addedLines(file: TouchedFile | undefined, content: string): Array<[number, number]> {
  if (!file) return NO_RANGES;
  const out: Array<[number, number]> = [];
  for (const e of file.edits) {
    const after = e.after;
    if (after && after.trim()) {
      if (file.created && file.edits.length === 1 && content === after) {
        out.push([1, Math.max(1, content.split('\n').length)]);
        continue;
      }
      const idx = content.indexOf(after);
      if (idx >= 0) {
        const { skip, count } = newPart(e.before, after);
        if (count > 0) {
          const start = content.slice(0, idx).split('\n').length + skip;
          out.push([start, start + count - 1]);
        }
        continue;
      }
    }
    for (const r of e.ranges) out.push(r);
  }
  return out;
}

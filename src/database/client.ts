import { isTauri } from '@/lib/platform';
import { DDL, MIGRATIONS } from './schema';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { useNotes } from '@/stores/notes';
import { useTerminals } from '@/stores/terminals';
import type { Note, TerminalTab } from '@/types/workspace';
import type { Project, Session } from '@/types/workspace';
import type { AgentEvent } from '@/types/agent';
import { modelLabel } from '@/stores/settings';

/**
 * SQLite persistence through `tauri-plugin-sql`.
 *
 * Strategy: the Zustand stores are the in-memory model (and keep a
 * localStorage mirror for the browser preview). In the desktop shell SQLite is
 * the durable store — it is read once at boot and every store change is
 * written back, debounced, as full upserts. Events are appended by id.
 */

type SqlDb = {
  execute: (q: string, args?: unknown[]) => Promise<unknown>;
  select: <T>(q: string, args?: unknown[]) => Promise<T>;
};

let sql: SqlDb | null = null;
let writing = false;
let dirtyProjects = false;
let dirtyNotes = false;
let dirtyTerminals = false;
const dirtySessions = new Set<string>();
/** Last event object written per id — a changed reference means the row must be rewritten. */
const written = new Map<string, AgentEvent>();
let timer: number | null = null;

async function open(): Promise<SqlDb | null> {
  if (!isTauri) return null;
  const Database = (await import('@tauri-apps/plugin-sql')).default;
  const d = await Database.load('sqlite:conduit.db');
  return d as unknown as SqlDb;
}

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  runtime: string;
  wsl_distro: string | null;
  last_opened_at: number;
  created_at: number;
  expanded: number;
  sort_order: number;
  color: string | null;
  /** JSON: `ProjectFolder[]`. */
  folders?: string | null;
}
interface SessionRow {
  id: string;
  project_id: string;
  title: string;
  provider_id: string;
  model: string;
  status: string;
  usage: string;
  runtime_ms: number;
  created_at: number;
  updated_at: number;
  pinned: number;
  archived: number;
  dirty_files: number;
  provider_session_id: string | null;
  worktree?: string | null;
  /** JSON: { hidden, options, agentId, folderId } — the session fields that arrived after the table. */
  extra?: string | null;
  cost_usd: number;
}
interface EventRow {
  id: string;
  session_id: string;
  payload: string;
}
interface NoteRow {
  id: string;
  title: string;
  body: string;
  tags: string;
  project_id: string | null;
  folder_id?: string | null;
  pinned: number;
  kind: string | null;
  created_at: number;
  updated_at: number;
}
interface TerminalRow {
  id: string;
  title: string;
  shell_id: string;
  cwd: string;
  program: string | null;
  project_id: string | null;
  folder_id?: string | null;
  created_at: number;
}

async function load() {
  if (!sql) return;
  const prows = await sql.select<ProjectRow[]>('SELECT * FROM projects ORDER BY sort_order ASC');
  if (prows.length) {
    const projects: Project[] = prows.map((r) => ({
      id: r.id,
      name: r.name,
      path: r.path,
      runtime: r.runtime as Project['runtime'],
      wslDistro: r.wsl_distro ?? undefined,
      lastOpenedAt: r.last_opened_at,
      createdAt: r.created_at,
      expanded: !!r.expanded,
      color: r.color ?? undefined,
      ...(r.folders ? { folders: safeJson<Project['folders']>(r.folders, undefined) } : {}),
    }));
    useProjects.getState().hydrate(projects);
  }
  const srows = await sql.select<SessionRow[]>('SELECT * FROM sessions');
  if (srows.length) {
    const sessions: Record<string, Session> = {};
    for (const r of srows) {
      sessions[r.id] = {
        id: r.id,
        projectId: r.project_id,
        title: r.title,
        providerId: r.provider_id as Session['providerId'],
        model: r.model,
        modelLabel: modelLabel(r.model),
        status: 'idle',
        activity: 'idle',
        usage: JSON.parse(r.usage),
        runtimeMs: r.runtime_ms,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        pinned: !!r.pinned,
        archived: !!r.archived,
        dirtyFiles: r.dirty_files,
        providerSessionId: r.provider_session_id ?? undefined,
        worktree: r.worktree ? safeJson<Session['worktree']>(r.worktree, undefined) : undefined,
        ...(r.extra ? safeJson<Pick<Session, 'hidden' | 'options' | 'agentId' | 'folderId'>>(r.extra, {}) : {}),
      };
    }
    const erows = await sql.select<EventRow[]>('SELECT id, session_id, payload FROM events ORDER BY timestamp ASC');
    const events: Record<string, AgentEvent[]> = {};
    for (const r of erows) {
      const ev = JSON.parse(r.payload) as AgentEvent;
      written.set(r.id, ev);
      (events[r.session_id] ??= []).push(ev);
    }
    useSessions.getState().hydrate(sessions, events);
  }
  const nrows = await sql.select<NoteRow[]>('SELECT * FROM notes');
  if (nrows.length) {
    const notes: Record<string, Note> = {};
    for (const r of nrows) {
      notes[r.id] = {
        id: r.id,
        title: r.title,
        body: r.body,
        tags: safeJson<string[]>(r.tags, []),
        projectId: r.project_id ?? undefined,
        folderId: r.folder_id ?? undefined,
        pinned: !!r.pinned,
        kind: r.kind === 'board' ? 'board' : 'text',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    useNotes.getState().hydrate(notes);
  }
  const trows = await sql.select<TerminalRow[]>('SELECT * FROM terminals ORDER BY sort_order ASC');
  if (trows.length) {
    const tabs: TerminalTab[] = trows.map((r) => ({
      id: r.id,
      title: r.title,
      shellId: r.shell_id,
      cwd: r.cwd,
      program: r.program ? safeJson<TerminalTab['program']>(r.program, undefined) : undefined,
      projectId: r.project_id ?? undefined,
      folderId: r.folder_id ?? undefined,
      createdAt: r.created_at,
    }));
    useTerminals.getState().hydrate(tabs);
  }
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Rows that are no longer in the store go — after the survivors were written, so a crash mid-flush loses nothing. */
async function dropMissing(table: string, ids: string[]) {
  if (!sql) return;
  if (!ids.length) {
    await sql.execute(`DELETE FROM ${table}`);
    return;
  }
  // One statement per 400 ids keeps well under SQLite's bound-parameter limit.
  const rows = await sql.select<Array<{ id: string }>>(`SELECT id FROM ${table}`);
  const keep = new Set(ids);
  const gone = rows.map((r) => r.id).filter((id) => !keep.has(id));
  for (let i = 0; i < gone.length; i += 400) {
    const chunk = gone.slice(i, i + 400);
    await sql.execute(`DELETE FROM ${table} WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
  }
}

async function flush() {
  if (!sql || writing) return;
  writing = true;
  try {
    if (dirtyProjects) {
      dirtyProjects = false;
      const list = useProjects.getState().projects;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        await sql.execute(
          'INSERT OR REPLACE INTO projects (id,name,path,runtime,wsl_distro,last_opened_at,created_at,expanded,sort_order,color,folders) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [p.id, p.name, p.path, p.runtime, p.wslDistro ?? null, p.lastOpenedAt, p.createdAt, p.expanded ? 1 : 0, i, p.color ?? null, p.folders?.length ? JSON.stringify(p.folders) : null],
        );
      }
      await dropMissing('projects', list.map((p) => p.id));
    }
    if (dirtyNotes) {
      dirtyNotes = false;
      const notes = Object.values(useNotes.getState().notes);
      for (const n of notes) {
        await sql.execute('INSERT OR REPLACE INTO notes (id,title,body,tags,project_id,pinned,kind,created_at,updated_at,folder_id) VALUES (?,?,?,?,?,?,?,?,?,?)', [
          n.id,
          n.title,
          n.body,
          JSON.stringify(n.tags),
          n.projectId ?? null,
          n.pinned ? 1 : 0,
          n.kind ?? 'text',
          n.createdAt,
          n.updatedAt,
          n.folderId ?? null,
        ]);
      }
      await dropMissing('notes', notes.map((n) => n.id));
    }
    if (dirtyTerminals) {
      dirtyTerminals = false;
      const tabs = useTerminals.getState().tabs;
      for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i];
        await sql.execute('INSERT OR REPLACE INTO terminals (id,title,shell_id,cwd,program,project_id,created_at,sort_order,folder_id) VALUES (?,?,?,?,?,?,?,?,?)', [
          t.id,
          t.title,
          t.shellId,
          t.cwd,
          t.program ? JSON.stringify(t.program) : null,
          t.projectId ?? null,
          t.createdAt,
          i,
          t.folderId ?? null,
        ]);
      }
      await dropMissing('terminals', tabs.map((t) => t.id));
    }
    const state = useSessions.getState();
    const ids = Array.from(dirtySessions);
    dirtySessions.clear();
    for (const id of ids) {
      const s = state.sessions[id];
      if (!s || s.hidden) {
        await sql.execute('DELETE FROM sessions WHERE id = ?', [id]);
        await sql.execute('DELETE FROM events WHERE session_id = ?', [id]);
        continue;
      }
      await sql.execute(
        `INSERT OR REPLACE INTO sessions (id,project_id,title,provider_id,model,status,usage,runtime_ms,created_at,updated_at,pinned,archived,dirty_files,provider_session_id,cost_usd,worktree,extra)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.id, s.projectId, s.title, s.providerId, s.model, s.status, JSON.stringify(s.usage), s.runtimeMs, s.createdAt, s.updatedAt, s.pinned ? 1 : 0, s.archived ? 1 : 0, s.dirtyFiles, s.providerSessionId ?? null, s.usage.costUsd, s.worktree ? JSON.stringify(s.worktree) : null, s.hidden || s.options || s.agentId || s.folderId ? JSON.stringify({ hidden: s.hidden, options: s.options, agentId: s.agentId, folderId: s.folderId }) : null],
      );
      for (const ev of state.events[id] ?? []) {
        // Events are immutable objects; a new reference (streamed text, patched status) means a rewrite.
        if (written.get(ev.id) === ev) continue;
        written.set(ev.id, ev);
        await sql.execute('INSERT OR REPLACE INTO events (id,session_id,type,timestamp,payload) VALUES (?,?,?,?,?)', [ev.id, id, ev.type, ev.timestamp, JSON.stringify(ev)]);
      }
    }
  } finally {
    writing = false;
    if (dirtyProjects || dirtyNotes || dirtyTerminals || dirtySessions.size) schedule();
  }
}

function schedule() {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    void flush();
  }, 400);
}

export const db = {
  async init() {
    try {
      sql = await open();
      if (!sql) return;
      for (const stmt of DDL) await sql.execute(stmt);
      for (const stmt of MIGRATIONS) {
        try {
          await sql.execute(stmt);
        } catch {
          /* already applied */
        }
      }
      await load();

      useProjects.subscribe((s, prev) => {
        if (s.projects !== prev.projects) {
          dirtyProjects = true;
          schedule();
        }
      });
      useNotes.subscribe((s, prev) => {
        if (s.notes !== prev.notes) {
          dirtyNotes = true;
          schedule();
        }
      });
      useTerminals.subscribe((s, prev) => {
        // Only persistent fields matter; pty ids change on every spawn.
        const strip = (tabs: TerminalTab[]) => tabs.map(({ ptyId: _p, ...t }) => JSON.stringify(t)).join('|');
        if (s.tabs !== prev.tabs && strip(s.tabs) !== strip(prev.tabs)) {
          dirtyTerminals = true;
          schedule();
        }
      });
      useSessions.subscribe((s, prev) => {
        if (s.sessions !== prev.sessions) {
          for (const id of new Set([...Object.keys(s.sessions), ...Object.keys(prev.sessions)])) {
            if (s.sessions[id] !== prev.sessions[id]) dirtySessions.add(id);
          }
        }
        if (s.events !== prev.events) {
          for (const id of Object.keys(s.events)) if (s.events[id] !== prev.events[id]) dirtySessions.add(id);
        }
        if (dirtySessions.size) schedule();
      });
    } catch (e) {
      console.warn('[db] SQLite unavailable, falling back to localStorage persistence', e);
      sql = null;
    }
  },
  get available() {
    return sql !== null;
  },
};

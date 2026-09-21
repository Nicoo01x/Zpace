import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EMPTY_USAGE, type AgentActivity, type AgentEvent, type FileWriteEvent, type SessionUsage } from '@/types/agent';
import { useTouched } from './touched';
import { useReview } from './review';
import { useLedger } from './ledger';
import type { ProviderId, Session, SessionStatus } from '@/types/workspace';
import { uid } from '@/lib/id';
import { modelLabel } from './settings';
import { isTauri } from '@/lib/platform';
import { t } from '@/i18n';

export interface SessionsState {
  sessions: Record<string, Session>;
  /** Event log per session. Kept outside `sessions` so session metadata updates stay cheap. */
  events: Record<string, AgentEvent[]>;

  createSession: (input: {
    projectId: string;
    title?: string;
    providerId?: ProviderId;
    model?: string;
    contextMax?: number;
    hidden?: boolean;
    folderId?: string;
  }) => Session;
  updateSession: (id: string, patch: Partial<Session>) => void;
  removeSession: (id: string) => void;
  duplicateSession: (id: string) => Session | undefined;
  setStatus: (id: string, status: SessionStatus, activity?: AgentActivity) => void;
  setUsage: (id: string, usage: Partial<SessionUsage>) => void;

  appendEvent: (event: AgentEvent) => void;
  appendEvents: (events: AgentEvent[]) => void;
  patchEvent: <T extends AgentEvent>(sessionId: string, eventId: string, patch: Partial<T>) => void;
  appendDelta: (sessionId: string, eventId: string, delta: string) => void;
  replaceEvents: (sessionId: string, events: AgentEvent[]) => void;
  clearEvents: (sessionId: string) => void;
  hydrate: (sessions: Record<string, Session>, events?: Record<string, AgentEvent[]>) => void;
}

/* --------------------------------------------------------------------- */
/*  Streaming batcher — coalesces token deltas into one store update per  */
/*  animation frame so the session view is never re-rendered per token.  */
/* --------------------------------------------------------------------- */
const pendingDeltas = new Map<string, string>(); // key: sessionId::eventId (ids never contain colons)
let flushScheduled = false;

function scheduleFlush(flush: () => void) {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = () => {
    flushScheduled = false;
    flush();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

/** Hydration from SQLite replaces what came from localStorage, but keeps what this launch created before the database answered. */
const BOOT_AT = Date.now();
export const useSessions = create<SessionsState>()(
  persist(
    (set, get) => ({
      sessions: {},
      events: {},

      createSession: ({ projectId, title, providerId = 'claude-code', model = 'opus', contextMax = 1_000_000, hidden, folderId }) => {
        const now = Date.now();
        const session: Session = {
          id: uid('ses'),
          projectId,
          title: title ?? t('New session'),
          providerId,
          model,
          modelLabel: modelLabel(model),
          status: 'idle',
          activity: 'idle',
          usage: { ...EMPTY_USAGE, contextMax },
          runtimeMs: 0,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          archived: false,
          dirtyFiles: 0,
          ...(hidden ? { hidden: true } : {}),
          ...(folderId ? { folderId } : {}),
        };
        set((s) => ({ sessions: { ...s.sessions, [session.id]: session }, events: { ...s.events, [session.id]: [] } }));
        return session;
      },
      updateSession: (id, patch) =>
        set((s) => {
          const cur = s.sessions[id];
          if (!cur) return {};
          return { sessions: { ...s.sessions, [id]: { ...cur, ...patch, updatedAt: Date.now() } } };
        }),
      removeSession: (id) =>
        set((s) => {
          const sessions = { ...s.sessions };
          const events = { ...s.events };
          delete sessions[id];
          delete events[id];
          return { sessions, events };
        }),
      duplicateSession: (id) => {
        const src = get().sessions[id];
        if (!src) return undefined;
        const copy: Session = {
          ...src,
          id: uid('ses'),
          title: `${src.title} (copy)`,
          status: 'idle',
          activity: 'idle',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          runStartedAt: undefined,
          providerSessionId: undefined,
        };
        const evs = (get().events[id] ?? []).map((e) => ({ ...e, id: uid('ev'), sessionId: copy.id }));
        set((s) => ({ sessions: { ...s.sessions, [copy.id]: copy }, events: { ...s.events, [copy.id]: evs } }));
        return copy;
      },
      setStatus: (id, status, activity) =>
        set((s) => {
          const cur = s.sessions[id];
          if (!cur) return {};
          const now = Date.now();
          let runtimeMs = cur.runtimeMs;
          let runStartedAt = cur.runStartedAt;
          if (status === 'running' && !runStartedAt) runStartedAt = now;
          if (status !== 'running' && runStartedAt) {
            runtimeMs += now - runStartedAt;
            runStartedAt = undefined;
          }
          return {
            sessions: {
              ...s.sessions,
              [id]: { ...cur, status, activity: activity ?? (status === 'running' ? cur.activity : 'idle'), runtimeMs, runStartedAt, updatedAt: now },
            },
          };
        }),
      setUsage: (id, usage) =>
        set((s) => {
          const cur = s.sessions[id];
          if (!cur) return {};
          // Growth in the running totals goes to the ledger (today, this project).
          const dCost = usage.costUsd !== undefined ? usage.costUsd - cur.usage.costUsd : 0;
          const dIn = usage.inputTokens !== undefined ? usage.inputTokens - cur.usage.inputTokens : 0;
          const dOut = usage.outputTokens !== undefined ? usage.outputTokens - cur.usage.outputTokens : 0;
          if (!cur.hidden && (dCost > 0 || dIn > 0 || dOut > 0)) useLedger.getState().add(cur.projectId, { costUsd: Math.max(0, dCost), inputTokens: Math.max(0, dIn), outputTokens: Math.max(0, dOut), turns: dCost > 0 ? 1 : 0 });
          return { sessions: { ...s.sessions, [id]: { ...cur, usage: { ...cur.usage, ...usage } } } };
        }),

      appendEvent: (event) => get().appendEvents([event]),
      appendEvents: (list) =>
        set((s) => {
          const events = { ...s.events };
          for (const ev of list) {
            events[ev.sessionId] = [...(events[ev.sessionId] ?? []), ev];
            // The file as it was before the agent touched it, for the review pane (first read or write wins).
            if ((ev.type === 'file_read' || ev.type === 'file_write') && isTauri) void useReview.getState().snapshot(ev.sessionId, ev.path, s.sessions[ev.sessionId]?.projectId, ev.type === 'file_write', ev.type === 'file_write' ? { old: ev.before, new: ev.after } : undefined);
          }
          return { events };
        }),
      patchEvent: (sessionId, eventId, patch) =>
        set((s) => {
          const list = s.events[sessionId];
          if (!list) return {};
          const idx = list.findIndex((e) => e.id === eventId);
          if (idx < 0) return {};
          const next = list.slice();
          const prev = next[idx];
          next[idx] = { ...next[idx], ...patch } as AgentEvent;
          if (next[idx].type === 'file_write') useTouched.getState().record(next[idx] as FileWriteEvent, s.sessions[sessionId]?.projectId);
          // With partial messages the tool input streams in: the path is only known once patched, so the review baseline is taken here.
          const ev = next[idx];
          if ((ev.type === 'file_read' || ev.type === 'file_write') && isTauri && ev.path && !('path' in prev && prev.path)) {
            void useReview.getState().snapshot(sessionId, ev.path, s.sessions[sessionId]?.projectId, ev.type === 'file_write', ev.type === 'file_write' ? { old: ev.before, new: ev.after } : undefined);
          }
          return { events: { ...s.events, [sessionId]: next } };
        }),
      appendDelta: (sessionId, eventId, delta) => {
        const key = `${sessionId}::${eventId}`;
        pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + delta);
        scheduleFlush(() => {
          const batch = new Map(pendingDeltas);
          pendingDeltas.clear();
          set((s) => {
            const events = { ...s.events };
            for (const [k, text] of batch) {
              const [sid, eid] = k.split('::');
              const list = events[sid];
              if (!list) continue;
              const idx = list.findIndex((e) => e.id === eid);
              if (idx < 0) continue;
              const cur = list[idx];
              if ('text' in cur) {
                const next = list.slice();
                next[idx] = { ...cur, text: cur.text + text } as AgentEvent;
                events[sid] = next;
              }
            }
            return { events };
          });
        });
      },
      replaceEvents: (sessionId, list) => set((s) => ({ events: { ...s.events, [sessionId]: list } })),
      clearEvents: (sessionId) => set((s) => ({ events: { ...s.events, [sessionId]: [] } })),
      hydrate: (sessions, events) =>
        set((s) => {
          const fresh = Object.fromEntries(Object.entries(s.sessions).filter(([id, x]) => !sessions[id] && x.createdAt >= BOOT_AT));
          const freshEvents = Object.fromEntries(Object.entries(s.events).filter(([id]) => fresh[id]));
          return { sessions: { ...sessions, ...fresh }, events: events ? { ...events, ...freshEvents } : { ...s.events, ...freshEvents } };
        }),
    }),
    {
      name: 'conduit.sessions',
      version: 1,
      // Only persist metadata + events. Runtime status is reset on boot.
      // In the desktop shell SQLite owns the event log (see database/client.ts),
      // so the localStorage mirror keeps metadata only and never hits the quota.
      partialize: (s) => ({
        sessions: Object.fromEntries(
          Object.entries(s.sessions).map(([id, ses]) => [
            id,
            { ...ses, status: ses.status === 'running' || ses.status === 'waiting' ? 'idle' : ses.status, activity: 'idle', runStartedAt: undefined },
          ]),
        ),
        events: isTauri ? {} : s.events,
      }),
    },
  ),
);

export const EMPTY_EVENTS: AgentEvent[] = [];

export const selectSession = (id: string | null | undefined) => (s: SessionsState) => (id ? s.sessions[id] : undefined);
export const selectEvents = (id: string | null | undefined) => (s: SessionsState) => (id ? (s.events[id] ?? EMPTY_EVENTS) : EMPTY_EVENTS);

/** Display title: sessions created before i18n keep the English default, so translate it on the way out. */
export function sessionTitle(title: string): string {
  return title === 'New session' ? t('New session') : title;
}

export function sessionsForProject(sessions: Record<string, Session>, projectId: string): Session[] {
  return Object.values(sessions)
    .filter((s) => s.projectId === projectId && !s.archived && !s.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt);
}

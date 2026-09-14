import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { uid } from '@/lib/id';
import type { Attachment } from '@/types/agent';

/**
 * Messages waiting their turn in a session: typed while the agent is busy,
 * or queued on purpose (Alt+Enter) to line up several jobs. The runner sends
 * the next one as soon as the session goes quiet; the island says how many
 * are left. Kept in the app data folder, attachments included.
 */
export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: Attachment[];
  at: number;
}

interface QueueState {
  queues: Record<string, QueuedMessage[]>;
  enqueue: (sessionId: string, text: string, attachments?: Attachment[]) => QueuedMessage;
  remove: (sessionId: string, id: string) => void;
  move: (sessionId: string, id: string, dir: -1 | 1) => void;
  /** Take the first message off the queue (the runner sends it). */
  shift: (sessionId: string) => QueuedMessage | undefined;
  clear: (sessionId: string) => void;
}

export const useQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      queues: {},
      enqueue: (sessionId, text, attachments) => {
        const m: QueuedMessage = { id: uid('q'), text, attachments: attachments?.length ? attachments : undefined, at: Date.now() };
        set((s) => ({ queues: { ...s.queues, [sessionId]: [...(s.queues[sessionId] ?? []), m] } }));
        return m;
      },
      remove: (sessionId, id) => set((s) => ({ queues: { ...s.queues, [sessionId]: (s.queues[sessionId] ?? []).filter((m) => m.id !== id) } })),
      move: (sessionId, id, dir) =>
        set((s) => {
          const list = [...(s.queues[sessionId] ?? [])];
          const i = list.findIndex((m) => m.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= list.length) return {};
          [list[i], list[j]] = [list[j], list[i]];
          return { queues: { ...s.queues, [sessionId]: list } };
        }),
      shift: (sessionId) => {
        const [first, ...rest] = get().queues[sessionId] ?? [];
        if (!first) return undefined;
        set((s) => ({ queues: { ...s.queues, [sessionId]: rest } }));
        return first;
      },
      clear: (sessionId) => set((s) => ({ queues: { ...s.queues, [sessionId]: [] } })),
    }),
    {
      name: 'conduit.queue',
      version: 1,
      storage: durableStorage(),
      // Attachments travel too, up to ~4 MB per session queue (images are data URLs); beyond that only the text.
      partialize: (s) => ({ queues: Object.fromEntries(Object.entries(s.queues).map(([k, v]) => { const size = v.reduce((n, m) => n + (m.attachments ?? []).reduce((x, a) => x + (a.url?.length ?? 0), 0), 0); return [k, size > 4_000_000 ? v.map((m) => ({ ...m, attachments: undefined })) : v]; })) }) as QueueState,
    },
  ),
);

export const queueFor = (queues: QueueState['queues'], sessionId: string): QueuedMessage[] => queues[sessionId] ?? [];
export const queuedTotal = (queues: QueueState['queues']): number => Object.values(queues).reduce((n, q) => n + q.length, 0);

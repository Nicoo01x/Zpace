import { useSessions } from '@/stores/sessions';
import { useQueue } from '@/stores/queue';
import { runtime } from '@/providers/runtime';

/**
 * Sends queued messages when their session goes quiet. Watches session
 * statuses: a session that leaves `running` / `waiting` with something in
 * its queue gets the next message a beat later (so the finished turn's
 * notifications land first); a message queued on an idle session goes at
 * once. Started once at boot.
 */
const QUIET_MS = 600;
const timers = new Map<string, number>();
const BUSY = new Set(['running', 'waiting']);

function schedule(sessionId: string) {
  if (timers.has(sessionId)) return;
  timers.set(
    sessionId,
    window.setTimeout(() => {
      timers.delete(sessionId);
      const session = useSessions.getState().sessions[sessionId];
      if (!session || BUSY.has(session.status)) return;
      const next = useQueue.getState().shift(sessionId);
      if (next) void runtime.send(sessionId, next.text, next.attachments ?? []);
    }, QUIET_MS),
  );
}

export function startQueueRunner(): () => void {
  let last = useSessions.getState().sessions;
  const unSessions = useSessions.subscribe((s) => {
    if (s.sessions === last) return;
    const prev = last;
    last = s.sessions;
    for (const [id, cur] of Object.entries(s.sessions)) {
      const was = prev[id]?.status;
      if (was && BUSY.has(was) && !BUSY.has(cur.status) && (useQueue.getState().queues[id]?.length ?? 0) > 0) schedule(id);
    }
  });
  const unQueue = useQueue.subscribe((q, prevQ) => {
    for (const [id, list] of Object.entries(q.queues)) {
      if (list.length && list.length > (prevQ.queues[id]?.length ?? 0)) {
        const session = useSessions.getState().sessions[id];
        if (session && !BUSY.has(session.status)) schedule(id);
      }
    }
  });
  return () => {
    unSessions();
    unQueue();
    for (const t of timers.values()) window.clearTimeout(t);
    timers.clear();
  };
}

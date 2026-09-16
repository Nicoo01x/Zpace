import { useShallow } from 'zustand/react/shallow';
import { useSessions, type SessionsState } from '@/stores/sessions';
import { basename } from '@/lib/format';
import type { AgentActivity, AgentEvent } from '@/types/agent';
import { t } from '@/i18n';

/**
 * What the island says while an agent works: the activity of the busiest
 * session and the file it is on (the last read / write / command of the
 * turn). Several sessions running → a count.
 */
export interface LiveState {
  sessionId: string;
  title: string;
  activity: AgentActivity;
  /** "Composer.tsx", "npm test", a search pattern — whatever the current tool is on. */
  subject?: string;
  running: number;
  waiting: number;
}

const ACTIVITY: Record<AgentActivity, string> = {
  idle: 'Working',
  thinking: 'Thinking',
  searching: 'Searching',
  reading: 'Reading',
  editing: 'Editing',
  running: 'Running',
  waiting: 'Needs you',
};

export function activityWord(a: AgentActivity): string {
  return t(ACTIVITY[a]);
}

function subjectOf(events: AgentEvent[] | undefined): string | undefined {
  if (!events) return undefined;
  for (let i = events.length - 1; i >= 0 && i >= events.length - 40; i--) {
    const e = events[i];
    if (e.type === 'user_message') return undefined;
    if (e.type === 'file_write' || e.type === 'file_read') return basename(e.path);
    if (e.type === 'shell_command') return e.command.length > 36 ? `${e.command.slice(0, 35)}…` : e.command;
    if (e.type === 'search') return e.query.length > 30 ? `${e.query.slice(0, 29)}…` : e.query;
  }
  return undefined;
}

/** The live readout for a sessions-store state (the island in the title bar and the one on the desktop both read it). */
export function liveOf(s: Pick<SessionsState, 'sessions' | 'events'>): LiveState | null {
  const busy = Object.values(s.sessions).filter((x) => !x.hidden && (x.status === 'running' || x.status === 'waiting'));
  if (!busy.length) return null;
  const waiting = busy.filter((x) => x.status === 'waiting');
  const lead = waiting[0] ?? busy.sort((a, b) => (b.runStartedAt ?? 0) - (a.runStartedAt ?? 0))[0];
  return {
    sessionId: lead.id,
    title: lead.title,
    activity: lead.status === 'waiting' ? 'waiting' : lead.activity,
    subject: lead.status === 'waiting' ? undefined : subjectOf(s.events[lead.id]),
    running: busy.length - waiting.length,
    waiting: waiting.length,
  };
}

export function useLive(): LiveState | null {
  return useSessions(useShallow(liveOf));
}

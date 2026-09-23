import type { AgentProvider, EventSink } from './AgentProvider';
import { ClaudeCodeProvider } from './claude/ClaudeCodeProvider';
import { MockProvider } from './mock/MockProvider';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { useEnvironment } from '@/stores/environment';
import { isTauri } from '@/lib/platform';
import type { AgentEvent, Attachment, PermissionDecision } from '@/types/agent';
import type { Project, Session } from '@/types/workspace';
import { toast } from '@/features/notifications/toast-store';
import { openReview } from '@/features/review/open-review';
import { claudeFinishedToast, claudePermissionToast } from '@/features/notifications/rich';
import { useUI, collectLeaves } from '@/stores/ui';
import { isWindowFocused, nativeNotify } from '@/native/system';
import { uid } from '@/lib/id';
import { playChime } from '@/features/notifications/sound';
import { speak, speechLang } from '@/native/speech';
import { celebrate } from '@/features/mascot/celebrate';
import { pullTrick } from '@/features/mascot/useMascot';
import { t } from '@/i18n';

/**
 * Agent runtime — the single place that connects providers to the stores.
 * Components call `runtime.send()` / `runtime.cancel()` and never touch a
 * provider directly.
 */

const claude = new ClaudeCodeProvider();
const mock = new MockProvider();
const started = new Set<string>();

function providerFor(): AgentProvider {
  const env = useEnvironment.getState().report;
  if (isTauri && env?.claude.found) return claude;
  return mock;
}

export function isPreviewRuntime(): boolean {
  return providerFor() === mock;
}

function makeSink(sessionId: string): EventSink {
  const s = useSessions.getState;
  return {
    emit: (event: AgentEvent) => {
      s().appendEvent(event);
      if (event.type === 'file_write') {
        const cur = s().sessions[sessionId];
        if (cur) s().updateSession(sessionId, { dirtyFiles: cur.dirtyFiles + 1 });
      }
      if (event.type === 'permission_request') void notify('permission', sessionId);
      if (event.type === 'completed' && event.reason === 'done') void notify('completed', sessionId);
      if (event.type === 'error') void notify('error', sessionId, event.message);
    },
    delta: (eventId, text) => s().appendDelta(sessionId, eventId, text),
    patch: (eventId, patch) => s().patchEvent(sessionId, eventId, patch),
    status: (status, activity) => s().setStatus(sessionId, status, activity),
    usage: (usage) => s().setUsage(sessionId, usage),
    providerSession: (providerSessionId) => s().updateSession(sessionId, { providerSessionId }),
  };
}

/** Where the turn started, so the "finished" toast lists only this turn's files. */
const turnStart = new Map<string, number>();

async function notify(kind: 'permission' | 'completed' | 'error', sessionId: string, detail?: string) {
  const prefs = useSettings.getState().notifications;
  // With the desktop island on, it already shows this over every app — a system toast on top would say it twice.
  const desktopIsland = useSettings.getState().desktopIsland.enabled && isTauri;
  const session = useSessions.getState().sessions[sessionId];
  const project = useProjects.getState().projects.find((p) => p.id === session?.projectId);
  if (!session) return;
  // Quick answers from Spotlight stay quiet.
  if (session.hidden) return;
  const focused = await isWindowFocused();
  const title = kind === 'permission' ? 'Permission required' : kind === 'completed' ? 'Claude finished' : 'Agent error';
  const body = `${project?.name ?? ''} · ${session.title}`;
  const open = () => {
    useUI.getState().setActiveSession(sessionId);
    const ui = useUI.getState();
    const leaf = collectLeaves(ui.layout).find((l) => l.content.kind === 'session' && l.content.sessionId === sessionId);
    if (leaf) ui.setActivePane(leaf.id);
    else ui.setPaneContent(ui.activePaneId, { kind: 'session', sessionId });
  };
  if (kind === 'permission' && prefs.onPermission) {
    claudePermissionToast({ sessionId, title: session.title, project: project?.name, open });
    if (!focused && !desktopIsland) void nativeNotify(title, body);
    if (prefs.sound) playChime('attention', prefs.volume, prefs.soundTheme);
    if (prefs.speak) speak(t('Claude needs you'), speechLang(useSettings.getState().language));
  }
  if (kind === 'completed' && prefs.onComplete) {
    claudeFinishedToast({
      sessionId,
      title: session.title,
      project: project?.name,
      sinceMs: turnStart.get(sessionId) ?? session.runStartedAt ?? 0,
      open,
      review: () => {
        open();
        openReview(sessionId);
      },
    });
    if (!focused && !desktopIsland) void nativeNotify(title, body);
    if (prefs.sound) playChime('done', prefs.volume, prefs.soundTheme);
    celebrate('done');
    pullTrick('burst');
    if (prefs.speak) speak(t('Claude finished'), speechLang(useSettings.getState().language));
  }
  if (kind === 'error' && prefs.onError) {
    toast.error(title, { description: detail ?? body, key: `err:${sessionId}`, origin: null });
  }
}

/** A session that works in a folder of its own (`options.cwd`) runs as if that folder were its project. */
function projectFor(session: Session): Project | undefined {
  const known = useProjects.getState().projects.find((p) => p.id === session.projectId);
  if (known) return known;
  const cwd = session.options?.cwd;
  if (!cwd) return undefined;
  return { id: session.projectId, name: cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd, path: cwd, runtime: 'windows', lastOpenedAt: 0, createdAt: 0, expanded: false };
}

async function ensureStarted(sessionId: string) {
  if (started.has(sessionId)) return;
  const session = useSessions.getState().sessions[sessionId];
  const project = session && projectFor(session);
  if (!session || !project) throw new Error('Session or project not found');
  const settings = useSettings.getState();
  await providerFor().startSession(
    {
      session,
      project,
      model: session.model,
      permissionMode: settings.claude.permissionMode,
      binaryPath: settings.claude.binaryPath,
      env: settings.claude.env,
    },
    makeSink(sessionId),
  );
  started.add(sessionId);
}

/**
 * A session's name from its first message: the words typed, not the code
 * fenced under them nor the `@file#L1-3` references — a mention alone names
 * the session after the file.
 */
/** "New session" in the current or the source language: the title a session gets before its first message. */
export function isDefaultTitle(title: string): boolean {
  return title === 'New session' || title === t('New session');
}

export function titleFrom(text: string): string {
  const noFences = text.replace(/```[\s\S]*?```/g, ' ');
  const mentions = Array.from(noFences.matchAll(/(?:^|\s)@([^\s#:]+)(?:#L[\d-]+)?:?/g), (m) => m[1]);
  const words = noFences.replace(/(?:^|\s)@[^\s]+/g, ' ').replace(/\s+/g, ' ').trim();
  const base = words || (mentions[0] ? (mentions[0].split(/[\\/]/).pop() ?? mentions[0]) : '') || text.replace(/\s+/g, ' ');
  return base.slice(0, 72);
}

export const runtime = {
  provider: providerFor,

  async send(sessionId: string, text: string, attachments: Attachment[] = []) {
    const store = useSessions.getState();
    const session = store.sessions[sessionId];
    if (!session) return;
    store.appendEvent({ id: uid('ev'), sessionId, timestamp: Date.now(), type: 'user_message', text, attachments: attachments.length ? attachments : undefined });
    if (isDefaultTitle(session.title)) {
      store.updateSession(sessionId, { title: titleFrom(text) });
    }
    try {
      // Busy from the first moment: spawning the process takes a while and nothing should mistake that for a finished turn.
      store.setStatus(sessionId, 'running', 'thinking');
      await ensureStarted(sessionId);
      await providerFor().sendMessage(sessionId, text, attachments);
    } catch (e) {
      store.appendEvent({ id: uid('ev'), sessionId, timestamp: Date.now(), type: 'error', message: e instanceof Error ? e.message : String(e) });
      store.setStatus(sessionId, 'error', 'idle');
    }
  },

  async cancel(sessionId: string) {
    await providerFor().cancel(sessionId);
  },

  async respondPermission(sessionId: string, eventId: string, decision: PermissionDecision) {
    const events = useSessions.getState().events[sessionId] ?? [];
    const ev = events.find((e) => e.id === eventId);
    if (!ev || ev.type !== 'permission_request' || !ev.parentId) return;
    toast.dismiss();
    await providerFor().respondPermission(sessionId, ev.parentId, decision);
  },

  async dispose(sessionId: string) {
    await providerFor().dispose(sessionId);
    started.delete(sessionId);
  },
};

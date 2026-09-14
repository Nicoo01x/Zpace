import { invoke, listen, isTauri } from '@/native/bridge';
import { processSpawn, onProcessLine, onProcessExit } from '@/native/process';
import { useAutomations, type Automation } from '@/stores/automations';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { useQueue } from '@/stores/queue';
import { useUI } from '@/stores/ui';
import { useEnvironment } from '@/stores/environment';
import { runtime } from '@/providers/runtime';
import { toast } from '@/features/notifications/toast-store';
import { mentionPath } from '@/features/sessions/useWorkspaceActions';
import { isWindows } from '@/lib/platform';
import { t } from '@/i18n';

/**
 * Keeps every enabled automation armed: file watchers through Rust
 * (`watch_path` → `fs://changed`), intervals and daily times through
 * timers. Firing runs the action: a prompt lands in the project's active
 * session (queued if it is busy) or a new one, with `{files}` replaced by
 * the changed files as mentions; a command runs quietly and, when it fails
 * and a follow-up prompt is set, its tail goes to Claude the same way.
 */
const COOLDOWN_MS = 5000;
const lastFired = new Map<string, number>();
const armed = new Map<string, () => void>();
let stopAll: (() => void) | null = null;

function absolute(a: Automation): string | null {
  const project = useProjects.getState().projects.find((p) => p.id === a.projectId);
  if (!project) return null;
  if (a.trigger.kind !== 'watch') return project.path;
  const p = a.trigger.path.trim();
  if (!p || p === '.') return project.path;
  if (/^[a-zA-Z]:[\\/]|^\//.test(p)) return p;
  return `${project.path.replace(/[\\/]+$/, '')}\\${p.replace(/^[\\/]+/, '')}`;
}

function sessionFor(a: Automation): string | null {
  const S = useSessions.getState();
  const action = a.action;
  const wantActive = action.kind === 'prompt' ? action.session === 'active' : true;
  if (wantActive) {
    const activeId = useUI.getState().activeSessionId;
    const active = activeId ? S.sessions[activeId] : undefined;
    if (active && active.projectId === a.projectId && !active.hidden) return active.id;
    const last = Object.values(S.sessions)
      .filter((s) => s.projectId === a.projectId && !s.hidden && !s.archived)
      .sort((x, y) => y.updatedAt - x.updatedAt)[0];
    if (last) return last.id;
  }
  const created = S.createSession({ projectId: a.projectId, title: a.name });
  return created.id;
}

function deliver(a: Automation, text: string) {
  const id = sessionFor(a);
  if (!id) return;
  const session = useSessions.getState().sessions[id];
  if (session && (session.status === 'running' || session.status === 'waiting')) useQueue.getState().enqueue(id, text);
  else void runtime.send(id, text);
}

function mentions(a: Automation, files: string[]): string {
  const project = useProjects.getState().projects.find((p) => p.id === a.projectId);
  return files
    .slice(0, 20)
    .map((f) => `@${project ? mentionPath(project.path, f) : f}`)
    .join(' ');
}

async function runCommand(a: Automation, command: string): Promise<{ code: number | null; tail: string }> {
  const project = useProjects.getState().projects.find((p) => p.id === a.projectId);
  const shells = useEnvironment.getState().report?.shells ?? [];
  const pwsh = shells.find((s) => s.id === 'pwsh') ?? shells.find((s) => s.id === 'powershell');
  const program = isWindows ? (pwsh?.path ?? 'powershell.exe') : '/bin/sh';
  const args = isWindows ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-c', command];
  const lines: string[] = [];
  const id = await processSpawn({ program, args, cwd: project?.path, env: { TERM: 'dumb', NO_COLOR: '1' } });
  return new Promise((resolve) => {
    onProcessLine(id, (p) => {
      lines.push(p.line);
      if (lines.length > 400) lines.shift();
    });
    onProcessExit(id, (code) => resolve({ code, tail: lines.slice(-60).join('\n') }));
  });
}

export async function fire(a: Automation, files: string[] = []) {
  const now = Date.now();
  if (now - (lastFired.get(a.id) ?? 0) < COOLDOWN_MS) return;
  lastFired.set(a.id, now);
  const what = files.length ? mentions(a, files) : '';
  try {
    if (a.action.kind === 'prompt') {
      const text = a.action.text.includes('{files}') ? a.action.text.replace('{files}', what) : what ? `${a.action.text}\n\n${what}` : a.action.text;
      deliver(a, text);
      useAutomations.getState().markRun(a.id, t('Prompt sent'));
      toast.info(a.name, { description: t('Prompt sent to Claude'), mark: 'claude', key: `auto:${a.id}` });
    } else {
      toast.loading(a.name, { description: a.action.command, key: `auto:${a.id}`, mark: 'terminal' });
      const { code, tail } = await runCommand(a, a.action.command);
      if (code === 0) {
        useAutomations.getState().markRun(a.id, t('Passed'));
        toast.success(a.name, { description: t('Command passed'), key: `auto:${a.id}`, mark: 'terminal' });
      } else {
        useAutomations.getState().markRun(a.id, t('Failed (code {code})', { code: String(code ?? '?') }));
        toast.error(a.name, { description: `${t('Command failed (code {code})', { code: String(code ?? '?') })}\n${tail.split('\n').slice(-3).join('\n')}`, key: `auto:${a.id}`, mark: 'terminal' });
        if (a.action.onFailurePrompt) {
          const prompt = `${a.action.onFailurePrompt}\n\n\`${a.action.command}\` ${t('exited with code {code}', { code: String(code ?? '?') })}${what ? ` (${t('after changes in')} ${what})` : ''}:\n\`\`\`\n${tail}\n\`\`\``;
          deliver(a, prompt);
        }
      }
    }
  } catch (e) {
    useAutomations.getState().markRun(a.id, String(e));
    toast.error(a.name, { description: e instanceof Error ? e.message : String(e), key: `auto:${a.id}` });
  }
}

function arm(a: Automation) {
  disarm(a.id);
  if (!a.enabled || !isTauri) return;
  const tr = a.trigger;
  if (tr.kind === 'watch') {
    const path = absolute(a);
    if (!path) return;
    let alive = true;
    void invoke('watch_path', { id: a.id, path }).catch((e: unknown) => {
      if (alive) toast.error(a.name, { description: String(e), key: `auto:${a.id}` });
    });
    armed.set(a.id, () => {
      alive = false;
      void invoke('unwatch_path', { id: a.id }).catch(() => void 0);
    });
  } else if (tr.kind === 'interval') {
    const ms = Math.max(1, tr.minutes) * 60_000;
    const timer = window.setInterval(() => void fire(a), ms);
    armed.set(a.id, () => window.clearInterval(timer));
  } else {
    let lastDay = '';
    const timer = window.setInterval(() => {
      const d = new Date();
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const day = d.toDateString();
      if (hhmm === tr.at && lastDay !== day) {
        lastDay = day;
        void fire(a);
      }
    }, 20_000);
    armed.set(a.id, () => window.clearInterval(timer));
  }
}

function disarm(id: string) {
  armed.get(id)?.();
  armed.delete(id);
}

function extMatches(include: string | undefined, path: string): boolean {
  if (!include?.trim()) return true;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return include
    .split(',')
    .map((x) => x.trim().replace(/^\*?\./, '').toLowerCase())
    .filter(Boolean)
    .includes(ext);
}

export function startAutomations(): () => void {
  if (stopAll) return stopAll;
  const sync = () => {
    const items = useAutomations.getState().items;
    for (const id of Array.from(armed.keys())) if (!items.some((a) => a.id === id && a.enabled)) disarm(id);
    for (const a of items) if (a.enabled && !armed.has(a.id)) arm(a);
  };
  sync();
  const unStore = useAutomations.subscribe((s, prev) => {
    if (s.items === prev.items) return;
    // Re-arm anything whose trigger changed.
    for (const a of s.items) {
      const before = prev.items.find((x) => x.id === a.id);
      if (before && (before.trigger !== a.trigger || before.enabled !== a.enabled)) disarm(a.id);
    }
    sync();
  });
  let unListen: (() => void) | undefined;
  void listen<{ id: string; paths: string[] }>('fs://changed', (p) => {
    const a = useAutomations.getState().items.find((x) => x.id === p.id);
    if (!a || !a.enabled || a.trigger.kind !== 'watch') return;
    const files = p.paths.filter((f) => extMatches(a.trigger.kind === 'watch' ? a.trigger.include : undefined, f));
    if (files.length) void fire(a, files);
  }).then((un) => (unListen = un));
  stopAll = () => {
    unStore();
    unListen?.();
    for (const id of Array.from(armed.keys())) disarm(id);
    stopAll = null;
  };
  return stopAll;
}

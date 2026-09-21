import { createElement, type ComponentType } from 'react';
import { Puzzle } from 'lucide-react';
import { usePlugins, enabledPlugins, type InstalledPlugin } from '@/stores/plugins';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useNotifications, type NotificationInput } from '@/stores/notifications';
import { useSettings } from '@/stores/settings';
import { useUI, collectLeaves } from '@/stores/ui';
import { useAgents } from '@/stores/agents';
import { useQueue } from '@/stores/queue';
import { useEnvironment } from '@/stores/environment';
import { runtime as agents } from '@/providers/runtime';
import { processSpawn, onProcessLine, onProcessExit } from '@/native/process';
import { openUrl, pathExists, readTextFile, writeTextFile, joinPath } from '@/native/system';
import { mediaControl, mediaNow, type MediaNow } from '@/native/media';
import { useNotes } from '@/stores/notes';
import { useIslandChips, type IslandChip } from '@/features/island/chips';
import { useFloats, floatKey } from '@/stores/floats';
import { uid } from '@/lib/id';
import { isWindows } from '@/lib/platform';
import { t } from '@/i18n';
import type { ThemePack } from '@/features/appearance/packs';
import type { Command } from '@/features/palette/commands';
import type { PaneContent } from '@/types/workspace';
import type { PluginCommandSpec, PluginPermission } from './manifest';
import { copyText } from '@/lib/clipboard';

/**
 * What a plugin's script gets. Declarative contributions (commands, themes,
 * panes) work without a script; `main.js` is for the rest — it exports
 * `activate(zpace)` and may return a function to run on deactivate. Each
 * method checks the permission the manifest declared, so what a plugin
 * can reach is what the install card said.
 */
export interface ZpaceApi {
  plugin: { id: string; version: string; dir: string };
  version: string;
  t: typeof t;
  commands: { register: (cmd: { id: string; title: string; keywords?: string[]; run: () => unknown }) => () => void };
  notify: (n: { title: string; summary?: string; variant?: NotificationInput['variant']; sticky?: boolean; action?: { label: string; run: () => void } }) => string;
  notifications: { update: (id: string, patch: { title?: string; summary?: string; variant?: NotificationInput['variant'] }) => void; remove: (id: string) => void };
  island: {
    set: (chip: IslandChip | null) => void;
    /** A card that unfolds in the island: an image, a title, a few lines, buttons. Returns its id; hides on its own after `foldMs`. */
    show: (card: IslandCard) => string;
    update: (id: string, card: IslandCard) => void;
    hide: (id: string) => void;
  };
  panes: {
    /** A declared pane: as a tile, or as a float when it says so. */
    open: (paneId: string) => void;
    /** Closes the pane's float (tiles stay: the user owns the layout). */
    close: (paneId: string) => void;
    openHtml: (title: string, html: string) => void;
    postMessage: (message: unknown) => void;
  };
  notes: {
    list: (opts?: { project?: string }) => Array<{ id: string; title: string; kind: 'text' | 'board'; tags: string[]; projectId?: string; updatedAt: number }>;
    read: (id: string) => string | null;
    create: (note: { title: string; body?: string; project?: string; tags?: string[] }) => string;
    update: (id: string, patch: { title?: string; body?: string; tags?: string[] }) => void;
    open: (id: string) => void;
  };
  media: { now: () => Promise<MediaNow | null>; control: (action: 'play' | 'pause' | 'toggle' | 'next' | 'previous') => Promise<boolean> };
  on: (event: PluginEvent, cb: (payload: unknown) => void) => () => void;
  agents: {
    ask: (text: string, opts?: { project?: string; session?: 'active' | 'new'; title?: string }) => string | null;
    list: () => Array<{ id: string; name: string; instructions: string }>;
  };
  projects: { current: () => { id: string; name: string; path: string } | null; list: () => Array<{ id: string; name: string; path: string }> };
  shell: { run: (command: string, opts?: { cwd?: string }) => Promise<{ code: number | null; output: string }> };
  fs: { readText: (path: string) => Promise<string>; writeText: (path: string, text: string) => Promise<void>; exists: (path: string) => Promise<boolean> };
  storage: { get: <T>(key: string, fallback?: T) => T | undefined; set: (key: string, value: unknown) => void };
  settings: { language: () => string; theme: () => string };
  clipboard: { write: (text: string) => Promise<void> };
  openUrl: (url: string) => Promise<void>;
}

export interface IslandCard {
  title: string;
  lines?: string[];
  /** A data URL or https image, shown round at the left. */
  image?: string;
  buttons?: Array<{ label: string; run: () => void; primary?: boolean }>;
  /** How long it stays unfolded, ms (default 8 s). */
  foldMs?: number;
}

export type PluginEvent = 'session:completed' | 'session:started' | 'notification' | 'project:changed' | 'pane:message';

interface Active {
  id: string;
  disposables: Array<() => void>;
}

const active = new Map<string, Active>();
/** Commands registered by scripts, per plugin. */
const scriptCommands = new Map<string, Command[]>();
/** Ad-hoc HTML panes opened by scripts. */
export const htmlPanes = new Map<string, { title: string; html: string }>();
/** Open pane frames per plugin, so scripts can post to them. */
export const paneWindows = new Map<string, Set<Window>>();
/** A message from one of the plugin's panes: to the script's listeners. */
export function paneMessage(pluginId: string, message: unknown) {
  for (const cb of listeners.get('pane:message') ?? []) {
    try {
      cb({ pluginId, message });
    } catch (e) {
      console.warn('[plugins] pane:message', e);
    }
  }
}
const listeners = new Map<PluginEvent, Set<(payload: unknown) => void>>();
/** Whenever a plugin comes, goes, or registers something — the palette and the theme list rebuild on it. */
const bump = () => usePlugins.getState().bumpRevision();

/* ------------------------------------------------------------------ */
/*  Contributions read by the app                                      */
/* ------------------------------------------------------------------ */

/** Theme packs from enabled plugins. */
export function pluginPacks(): ThemePack[] {
  return enabledPlugins().flatMap((p) => (p.manifest.contributes?.themes ?? []).map((th) => ({ ...th, id: th.id.startsWith(p.id + ':') ? th.id : `${p.id}:${th.id}` })));
}

/** Palette commands from every enabled plugin: the declared ones and the ones scripts registered. */
export function pluginCommands(): Command[] {
  const out: Command[] = [];
  for (const p of enabledPlugins()) {
    for (const spec of p.manifest.contributes?.commands ?? []) out.push(toCommand(p, spec));
    for (const c of scriptCommands.get(p.id) ?? []) out.push(c);
  }
  return out;
}

function toCommand(p: InstalledPlugin, spec: PluginCommandSpec): Command {
  const icon = Puzzle as ComponentType<{ className?: string }>;
  const api = apiFor(p);
  return {
    id: `plugin.${p.id}.${spec.id}`,
    title: spec.title,
    group: 'Plugins',
    icon,
    keywords: [...(spec.keywords ?? []), p.manifest.name, 'plugin'],
    run: () => {
      const a = spec.action;
      if (a.kind === 'prompt') api.agents.ask(a.text, { session: a.session ?? 'active' });
      else if (a.kind === 'shell') void api.shell.run(a.command).then((r) => api.notify({ title: spec.title, summary: r.output.split('\n').slice(-3).join(' · ').slice(0, 200), variant: r.code === 0 ? 'success' : 'error' }));
      else if (a.kind === 'url') void openUrl(a.url);
      else if (a.kind === 'pane') api.panes.open(a.pane);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Activation                                                         */
/* ------------------------------------------------------------------ */

export async function activate(p: InstalledPlugin): Promise<void> {
  deactivate(p.id);
  const entry: Active = { id: p.id, disposables: [] };
  active.set(p.id, entry);
  bump();
  if (!p.manifest.main) return;
  try {
    const code = await readTextFile(joinPath(p.dir, p.manifest.main));
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    entry.disposables.push(() => URL.revokeObjectURL(url));
    const mod = (await import(/* @vite-ignore */ url)) as { activate?: (api: ZpaceApi) => unknown; default?: (api: ZpaceApi) => unknown };
    const fn = mod.activate ?? mod.default;
    if (typeof fn !== 'function') throw new Error('main.js must export activate(zpace)');
    const result = await fn(apiFor(p));
    if (typeof result === 'function') entry.disposables.push(result as () => void);
    usePlugins.getState().setError(p.id, undefined);
  } catch (e) {
    usePlugins.getState().setError(p.id, e instanceof Error ? e.message : String(e));
  }
  bump();
}

export function deactivate(id: string): void {
  const entry = active.get(id);
  if (!entry) return;
  for (const d of entry.disposables.reverse()) {
    try {
      d();
    } catch {
      /* a plugin's cleanup is its own problem */
    }
  }
  active.delete(id);
  scriptCommands.delete(id);
  useFloats.getState().closePlugin(id);
  bump();
}

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

let watching = false;
function watch() {
  if (watching) return;
  watching = true;
  let prevStatus = new Map<string, string>();
  useSessions.subscribe((s) => {
    const next = new Map<string, string>();
    for (const [id, ses] of Object.entries(s.sessions)) {
      next.set(id, ses.status);
      const was = prevStatus.get(id);
      if (was === ses.status) continue;
      if (ses.status === 'running' && was && was !== 'running') emit('session:started', { sessionId: id, title: ses.title, projectId: ses.projectId });
      if ((ses.status === 'completed' || ses.status === 'idle') && (was === 'running' || was === 'waiting')) {
        const events = s.events[id] ?? [];
        const last = [...events].reverse().find((e) => e.type === 'assistant_message');
        emit('session:completed', { sessionId: id, title: ses.title, projectId: ses.projectId, text: last && 'text' in last ? last.text : '' });
      }
    }
    prevStatus = next;
  });
  let prevProject = useUI.getState().activeProjectId;
  useUI.subscribe((s) => {
    if (s.activeProjectId !== prevProject) {
      prevProject = s.activeProjectId;
      emit('project:changed', { projectId: s.activeProjectId });
    }
  });
  let seen = new Set(useNotifications.getState().items.map((n) => n.id));
  useNotifications.subscribe((s) => {
    for (const n of s.items) {
      if (seen.has(n.id)) continue;
      emit('notification', { id: n.id, title: n.title, summary: n.summary, variant: n.variant });
    }
    seen = new Set(s.items.map((n) => n.id));
  });
}

function emit(event: PluginEvent, payload: unknown) {
  for (const cb of listeners.get(event) ?? []) {
    try {
      cb(payload);
    } catch (e) {
      console.warn('[plugins]', event, e);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  The API                                                            */
/* ------------------------------------------------------------------ */

/** Throws unless the manifest declared the permission — every API method starts with it. */
export function need(p: InstalledPlugin, perm: PluginPermission) {
  if (!(p.manifest.permissions ?? []).includes(perm)) throw new Error(`${p.manifest.name}: permission "${perm}" not declared in plugin.json`);
}

function projectOf(id?: string) {
  const P = useProjects.getState();
  const pid = !id || id === 'active' ? useUI.getState().activeProjectId : id;
  return P.projects.find((x) => x.id === pid) ?? P.projects[0] ?? null;
}

export function apiFor(p: InstalledPlugin): ZpaceApi {
  const track = (d: () => void) => {
    active.get(p.id)?.disposables.push(d);
    return d;
  };
  return {
    plugin: { id: p.id, version: p.version, dir: p.dir },
    version: '0.1.0',
    t,
    commands: {
      register: (cmd) => {
        need(p, 'commands');
        const c: Command = { id: `plugin.${p.id}.${cmd.id}`, title: cmd.title, group: 'Plugins', icon: Puzzle as ComponentType<{ className?: string }>, keywords: [...(cmd.keywords ?? []), p.manifest.name, 'plugin'], run: cmd.run };
        scriptCommands.set(p.id, [...(scriptCommands.get(p.id) ?? []), c]);
        bump();
        return track(() => {
          scriptCommands.set(p.id, (scriptCommands.get(p.id) ?? []).filter((x) => x !== c));
          bump();
        });
      },
    },
    notify: (n) => {
      need(p, 'notifications');
      const id = uid('pn');
      useNotifications.getState().push({ id, title: n.title, summary: n.summary ?? p.manifest.name, variant: n.variant ?? 'info', sticky: n.sticky, action: n.action });
      return id;
    },
    notifications: {
      update: (id, patch) => {
        need(p, 'notifications');
        useNotifications.getState().update(id, patch);
      },
      remove: (id) => {
        need(p, 'notifications');
        useNotifications.getState().remove(id);
      },
    },
    island: {
      set: (chip) => {
        need(p, 'notifications');
        useIslandChips.getState().set(p.id, chip);
      },
      show: (card) => {
        need(p, 'notifications');
        const id = uid('pc');
        useNotifications.getState().push({ id, title: card.title, summary: card.lines?.[0] ?? p.manifest.name, variant: 'neutral', foldMs: card.foldMs ?? 8000, ...cardExtras(card) });
        cardTimers.set(id, window.setTimeout(() => useNotifications.getState().remove(id), (card.foldMs ?? 8000) + 1200));
        return id;
      },
      update: (id, card) => {
        need(p, 'notifications');
        useNotifications.getState().update(id, { title: card.title, summary: card.lines?.[0] ?? p.manifest.name, foldMs: card.foldMs ?? 8000, ...cardExtras(card) });
        window.clearTimeout(cardTimers.get(id));
        cardTimers.set(id, window.setTimeout(() => useNotifications.getState().remove(id), (card.foldMs ?? 8000) + 1200));
      },
      hide: (id) => {
        need(p, 'notifications');
        window.clearTimeout(cardTimers.get(id));
        useNotifications.getState().remove(id);
      },
    },
    panes: {
      open: (paneId) => {
        need(p, 'panes');
        openPane({ kind: 'plugin', pluginId: p.id, paneId });
      },
      close: (paneId) => {
        need(p, 'panes');
        useFloats.getState().close(floatKey(p.id, paneId));
      },
      openHtml: (title, html) => {
        need(p, 'panes');
        const paneId = `html:${Date.now().toString(36)}`;
        htmlPanes.set(`${p.id}/${paneId}`, { title, html });
        openPane({ kind: 'plugin', pluginId: p.id, paneId });
      },
      postMessage: (message) => {
        need(p, 'panes');
        for (const w of paneWindows.get(p.id) ?? []) w.postMessage({ zpace: 'message', message }, '*');
      },
    },
    notes: {
      list: (opts = {}) => {
        need(p, 'notes');
        const pid = opts.project === undefined ? undefined : projectOf(opts.project)?.id;
        return Object.values(useNotes.getState().notes)
          .filter((n) => pid === undefined || n.projectId === pid)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((n) => ({ id: n.id, title: n.title, kind: n.kind ?? 'text', tags: n.tags, projectId: n.projectId, updatedAt: n.updatedAt }));
      },
      read: (id) => {
        need(p, 'notes');
        return useNotes.getState().notes[id]?.body ?? null;
      },
      create: (note) => {
        need(p, 'notes');
        const n = useNotes.getState().createNote({ title: note.title, body: note.body ?? '', projectId: note.project === undefined ? projectOf()?.id : projectOf(note.project)?.id, tags: note.tags ?? [] });
        return n.id;
      },
      update: (id, patch) => {
        need(p, 'notes');
        useNotes.getState().updateNote(id, patch);
      },
      open: (id) => {
        need(p, 'notes');
        const ui = useUI.getState();
        const leaves = collectLeaves(ui.layout);
        const already = leaves.find((l) => l.content.kind === 'note' && l.content.noteId === id);
        if (already) ui.setActivePane(already.id);
        else ui.setPaneContent(ui.activePaneId, { kind: 'note', noteId: id });
      },
    },
    media: {
      now: () => {
        need(p, 'media');
        return mediaNow();
      },
      control: (action) => {
        need(p, 'media');
        return mediaControl(action);
      },
    },
    on: (event, cb) => {
      need(p, 'events');
      watch();
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return track(() => listeners.get(event)?.delete(cb));
    },
    agents: {
      ask: (text, opts = {}) => {
        need(p, 'agents');
        const project = projectOf(opts.project);
        if (!project) return null;
        const S = useSessions.getState();
        let id: string | null = null;
        if (opts.session !== 'new') {
          const activeId = useUI.getState().activeSessionId;
          const a = activeId ? S.sessions[activeId] : undefined;
          if (a && a.projectId === project.id && !a.hidden) id = a.id;
        }
        if (!id) id = S.createSession({ projectId: project.id, title: opts.title ?? `${p.manifest.name}` }).id;
        const ses = useSessions.getState().sessions[id];
        if (ses && (ses.status === 'running' || ses.status === 'waiting')) useQueue.getState().enqueue(id, text);
        else void agents.send(id, text);
        return id;
      },
      list: () => Object.values(useAgents.getState().agents).map((a) => ({ id: a.id, name: a.name, instructions: a.instructions })),
    },
    projects: {
      current: () => {
        const x = projectOf();
        return x ? { id: x.id, name: x.name, path: x.path } : null;
      },
      list: () => useProjects.getState().projects.map((x) => ({ id: x.id, name: x.name, path: x.path })),
    },
    shell: {
      run: async (command, opts = {}) => {
        need(p, 'shell');
        const shells = useEnvironment.getState().report?.shells ?? [];
        const pwsh = shells.find((s) => s.id === 'pwsh') ?? shells.find((s) => s.id === 'powershell');
        const program = isWindows ? (pwsh?.path ?? 'powershell.exe') : '/bin/sh';
        const args = isWindows ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-c', command];
        const lines: string[] = [];
        const pid = await processSpawn({ program, args, cwd: opts.cwd ?? projectOf()?.path, env: { TERM: 'dumb', NO_COLOR: '1' } });
        return new Promise((resolve) => {
          onProcessLine(pid, (l) => {
            lines.push(l.line);
            if (lines.length > 2000) lines.shift();
          });
          onProcessExit(pid, (code) => resolve({ code, output: lines.join('\n') }));
        });
      },
    },
    fs: {
      readText: (path) => {
        need(p, 'files');
        return readTextFile(path);
      },
      writeText: (path, text) => {
        need(p, 'files');
        return writeTextFile(path, text);
      },
      exists: (path) => {
        need(p, 'files');
        return pathExists(path);
      },
    },
    storage: {
      get: <T,>(key: string, fallback?: T) => (usePlugins.getState().storage[p.id]?.[key] as T | undefined) ?? fallback,
      set: (key, value) => usePlugins.getState().setValue(p.id, key, value),
    },
    settings: {
      language: () => useSettings.getState().language,
      theme: () => useSettings.getState().theme,
    },
    clipboard: {
      write: async (text) => {
        need(p, 'clipboard');
        await copyText(text);
      },
    },
    openUrl: (url) => {
      need(p, 'network');
      return openUrl(url);
    },
  };
}

const cardTimers = new Map<string, number>();

/** The island card's rich body: the lines and the buttons row (unfolded, it stands in for the summary); the image goes in as the glyph. */
function cardExtras(card: IslandCard) {
  const lines = (card.lines ?? []).filter((l) => l.trim());
  const rich = createElement(
    'div',
    { className: 'flex flex-col gap-1.5' },
    lines.length ? createElement('div', { className: 'flex flex-col gap-0.5 text-white/60' }, ...lines.map((l, i) => createElement('span', { key: i, className: 'truncate' }, l))) : null,
    card.buttons?.length
      ? createElement(
          'div',
          { className: 'flex items-center gap-1.5 pt-0.5' },
          ...card.buttons.map((b, i) =>
            createElement(
              'button',
              { key: i, type: 'button', onClick: b.run, className: b.primary ? 'inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-3 text-[12px] font-medium text-black transition-colors hover:bg-white/90' : 'inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white/12 px-2.5 text-[12px] text-white transition-colors hover:bg-white/20' },
              b.label,
            ),
          ),
        )
      : null,
  );
  return { rich, icon: card.image ? createElement('img', { src: card.image, alt: '' }) : undefined };
}

/** Open (or focus) a plugin pane: a float when the manifest says so, a tile in the workspace otherwise. */
export function openPane(content: Extract<PaneContent, { kind: 'plugin' }>) {
  const float = usePlugins.getState().installed[content.pluginId]?.manifest.contributes?.panes?.find((x) => x.id === content.paneId)?.float;
  if (float) {
    useFloats.getState().open(content.pluginId, content.paneId, float);
    return;
  }
  const ui = useUI.getState();
  const leaves = collectLeaves(ui.layout);
  const already = leaves.find((l) => l.content.kind === 'plugin' && l.content.pluginId === content.pluginId && l.content.paneId === content.paneId);
  if (already) {
    ui.setActivePane(already.id);
    return;
  }
  const target = leaves.find((l) => l.id === ui.activePaneId) ?? leaves[0];
  ui.setPaneContent(target.id, content);
  ui.setActivePane(target.id);
}

/** What a click on the plugin does: its first pane, else its first command; false when it has nothing to open. */
export function openPlugin(p: InstalledPlugin): boolean {
  const pane = p.manifest.contributes?.panes?.[0]?.id ?? [...htmlPanes.keys()].find((k) => k.startsWith(p.id + '/'))?.slice(p.id.length + 1);
  if (pane) {
    openPane({ kind: 'plugin', pluginId: p.id, paneId: pane });
    return true;
  }
  const cmd = pluginCommands().find((c) => c.id.startsWith(`plugin.${p.id}.`));
  if (cmd) {
    void cmd.run();
    return true;
  }
  return false;
}

/** The plugin's panes, for a menu: the declared ones and the ones its script registered. */
export function pluginPanes(p: InstalledPlugin): Array<{ id: string; title: string }> {
  const declared = (p.manifest.contributes?.panes ?? []).map((x) => ({ id: x.id, title: x.title }));
  const scripted = [...htmlPanes.entries()].filter(([k]) => k.startsWith(p.id + '/')).map(([k, v]) => ({ id: k.slice(p.id.length + 1), title: v.title }));
  return [...declared, ...scripted.filter((x) => !declared.some((d) => d.id === x.id))];
}

/** The pane's title for the tab. */
export function pluginPaneTitle(pluginId: string, paneId: string): string {
  const p = usePlugins.getState().installed[pluginId];
  return p?.manifest.contributes?.panes?.find((x) => x.id === paneId)?.title ?? htmlPanes.get(`${pluginId}/${paneId}`)?.title ?? p?.manifest.name ?? 'Plugin';
}

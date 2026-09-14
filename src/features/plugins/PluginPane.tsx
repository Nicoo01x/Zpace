import { useEffect, useMemo, useRef, useState } from 'react';
import { Puzzle } from 'lucide-react';
import { usePlugins } from '@/stores/plugins';
import { useSettings } from '@/stores/settings';
import { readTextFile } from '@/native/system';
import { Spinner } from '@/components/ui/Spinner';
import { t } from '@/i18n';
import { apiFor, htmlPanes, paneMessage, paneWindows, pluginCommands, type PluginEvent, type ZpaceApi } from './runtime';

/**
 * A plugin's page as a workspace pane: its HTML in a sandboxed iframe
 * (scripts allowed, nothing else). The page gets a `window.zpace` that
 * mirrors the script API over postMessage — `await zpace.notes.list()`,
 * `zpace.notify({…})`, `zpace.on('session:completed', cb)` — with the
 * same permissions the manifest declared. The app pushes its theme in as
 * CSS variables, and `zpace.on('theme', cb)` fires when it changes.
 */

/** Runs inside the frame: promise calls over postMessage, a Proxy so `zpace.a.b(x)` becomes call('a.b', x). */
const BRIDGE = `(() => {
  const pending = new Map(); let n = 0;
  const call = (path, ...args) => new Promise((res, rej) => { const id = ++n; pending.set(id, { res, rej }); parent.postMessage({ zpace: 'call', id, path, args }, '*'); });
  const handlers = new Map();
  const fire = (name, payload) => { for (const cb of handlers.get(name) ?? []) { try { cb(payload); } catch (e) { console.error(e); } } };
  addEventListener('message', (e) => {
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.zpace === 'result') { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.ok ? p.res(m.value) : p.rej(new Error(m.error)); }
    else if (m.zpace === 'event') fire(m.event, m.payload);
    else if (m.zpace === 'message') fire('message', m.message);
    else if (m.zpace === 'theme') { document.documentElement.dataset.theme = m.dark ? 'dark' : 'light'; for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v); fire('theme', m); }
  });
  const on = (event, cb) => { if (!handlers.has(event)) { handlers.set(event, new Set()); if (event !== 'message' && event !== 'theme') call('__on', event).catch((e) => console.error(e)); } handlers.get(event).add(cb); return () => handlers.get(event)?.delete(cb); };
  const own = { call, on, post: (message) => parent.postMessage({ zpace: 'message', message }, '*'), ready: () => parent.postMessage({ zpace: 'ready' }, '*') };
  const proxy = (path) => new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : !path && k in own ? own[k] : proxy(path ? path + '.' + String(k) : String(k))), apply: (_, __, args) => call(path, ...args) });
  window.zpace = proxy('');
})();`;

const VARS = ['--canvas', '--background', '--surface', '--surface-inset', '--surface-hover', '--text-primary', '--text-secondary', '--text-muted', '--accent', '--accent-soft', '--border', '--border-strong', '--success', '--warning', '--danger'];

function themeMessage() {
  const cs = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  for (const v of VARS) vars[v] = cs.getPropertyValue(v).trim();
  return { zpace: 'theme', dark: document.documentElement.classList.contains('dark'), vars };
}

/** `a.b.c` on the API object, bound to its parent so `this` works. */
function resolve(api: ZpaceApi, path: string): ((...args: unknown[]) => unknown) | null {
  const parts = path.split('.');
  let cur: unknown = api;
  let parent: unknown = null;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in (cur as object))) return null;
    parent = cur;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'function' ? (cur as (...a: unknown[]) => unknown).bind(parent) : null;
}

export function PluginPane({ pluginId, paneId }: { pluginId: string; paneId: string }) {
  const plugin = usePlugins((s) => s.installed[pluginId]);
  const theme = useSettings((s) => s.theme);
  const themePack = useSettings((s) => s.themePack);
  const spec = plugin?.manifest.contributes?.panes?.find((p) => p.id === paneId);
  const adhoc = htmlPanes.get(`${pluginId}/${paneId}`);
  const [html, setHtml] = useState<string | null>(adhoc?.html ?? null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (adhoc || !plugin || !spec) return;
    let cancelled = false;
    readTextFile(`${plugin.dir}\\${spec.entry.replace(/\//g, '\\')}`)
      .then((text) => !cancelled && setHtml(text))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [adhoc, plugin, spec]);

  // the bridge: calls from the page, events to it, its window registered for the script
  useEffect(() => {
    if (!plugin) return;
    const api = apiFor(plugin);
    const disposers: Array<() => void> = [];
    let registered: Window | null = null;
    const post = (m: unknown) => frame.current?.contentWindow?.postMessage(m, '*');
    const onMessage = async (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win) return;
      const m = e.data as { zpace?: string; id?: number; path?: string; args?: unknown[]; message?: unknown; title?: string; summary?: string };
      if (!m || typeof m !== 'object' || typeof m.zpace !== 'string') return;
      // the first word from the page registers its window, so the script can answer it
      if (registered !== win) {
        if (!paneWindows.has(pluginId)) paneWindows.set(pluginId, new Set());
        paneWindows.get(pluginId)!.add(win);
        registered = win;
      }
      if (m.zpace === 'ready') post(themeMessage());
      else if (m.zpace === 'call' && typeof m.id === 'number' && typeof m.path === 'string') {
        try {
          let value: unknown;
          if (m.path === '__on') {
            const event = String(m.args?.[0]) as PluginEvent;
            disposers.push(api.on(event, (payload) => post({ zpace: 'event', event, payload })));
            value = true;
          } else {
            const fn = resolve(api, m.path);
            if (!fn) throw new Error(`zpace.${m.path} is not a function`);
            value = await fn(...(m.args ?? []));
          }
          post({ zpace: 'result', id: m.id, ok: true, value: value === undefined ? null : value });
        } catch (err) {
          post({ zpace: 'result', id: m.id, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      } else if (m.zpace === 'message') paneMessage(pluginId, m.message);
      else if (m.zpace === 'notify' && m.title) api.notify({ title: String(m.title), summary: m.summary ? String(m.summary) : undefined });
      else if (m.zpace === 'command' && typeof m.id === 'string') pluginCommands().find((c) => c.id === `plugin.${pluginId}.${m.id}`)?.run();
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      for (const d of disposers) d();
      if (registered) paneWindows.get(pluginId)?.delete(registered);
    };
  }, [plugin, pluginId]);

  // theme changes reach the page
  useEffect(() => {
    const id = window.setTimeout(() => frame.current?.contentWindow?.postMessage(themeMessage(), '*'), 50);
    return () => window.clearTimeout(id);
  }, [theme, themePack]);

  const srcDoc = useMemo(() => {
    if (html === null) return null;
    const dark = document.documentElement.classList.contains('dark');
    const vars = VARS.map((v) => `${v}: ${getComputedStyle(document.documentElement).getPropertyValue(v).trim()};`).join(' ');
    const body = /<html[\s>]/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1><script>${BRIDGE}</script>`) : `<!doctype html><html data-theme="${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><script>${BRIDGE};zpace.ready()</script><style>:root{${vars}} html,body{height:100%} body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text-primary);background:var(--background)}</style></head><body>${html}</body></html>`;
    return body;
  }, [html]);

  if (!plugin || (!spec && !adhoc)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[12.5px] text-muted">
        <Puzzle className="size-5" />
        {t('This plugin pane is gone — the plugin was removed.')}
      </div>
    );
  }
  if (error) return <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-danger">{error}</div>;
  if (srcDoc === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return <iframe ref={frame} title={spec?.title ?? adhoc?.title ?? plugin.manifest.name} sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={srcDoc} className="h-full w-full border-0 bg-background" />;
}

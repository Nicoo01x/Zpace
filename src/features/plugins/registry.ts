import { usePlugins, type InstalledPlugin } from '@/stores/plugins';
import { useAgents, EMPTY_AGENT } from '@/stores/agents';
import { useAutomations } from '@/stores/automations';
import { appDataDir, createDir, pathExists, trashPath, writeTextFile } from '@/native/system';
import { homeDir } from '@/features/mcp/mcp-config';
import { isTauri } from '@/lib/platform';
import { toast } from '@/features/notifications/toast-store';
import { t } from '@/i18n';
import { indexUrl, registryRaw, TEXT_EXTENSIONS, olderThan, validateManifest, type PluginManifest, type RegistryEntry, type RegistryIndex } from './manifest';
import { activate, deactivate } from './runtime';

/**
 * The registry: `plugins.json` from the community repo, fetched at most
 * every ten minutes (or on demand). Install = fetch the entry's files,
 * write them under the app data folder, apply what the manifest
 * contributes, activate. Uninstall takes it all back.
 */

const INDEX_TTL = 10 * 60_000;

export async function refreshIndex(force = false): Promise<RegistryIndex | null> {
  const s = usePlugins.getState();
  if (!force && s.index && Date.now() - s.fetchedAt < INDEX_TTL) return s.index;
  try {
    const url = indexUrl();
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} · ${url}`);
    const index = (await res.json()) as RegistryIndex;
    if (!Array.isArray(index.plugins)) throw new Error('malformed index');
    index.plugins = index.plugins.filter((p) => validateManifest(p).length === 0 && typeof p.path === 'string' && Array.isArray(p.files));
    s.setIndex(index);
    return index;
  } catch (e) {
    s.setIndex(s.index, e instanceof Error ? e.message : String(e));
    return s.index;
  }
}

/** Newer registry version than the installed one. */
export function updateFor(p: InstalledPlugin): RegistryEntry | null {
  const entry = usePlugins.getState().index?.plugins.find((e) => e.id === p.id);
  return entry && olderThan(p.version, entry.version) ? entry : null;
}

async function ensureDir(path: string) {
  if (!(await pathExists(path))) await createDir(path);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url.split('/').slice(-2).join('/')}`);
  return res.text();
}

export async function install(entry: RegistryEntry): Promise<void> {
  const store = usePlugins.getState();
  if (!isTauri) {
    toast.warning(t('Plugins install in the desktop app.'));
    return;
  }
  if (store.busy[entry.id]) return;
  store.setBusy(entry.id, 'installing');
  try {
    const previous = store.installed[entry.id];
    if (previous) await takeBack(previous);
    const dir = `${await appDataDir()}\\plugins\\${entry.id}`;
    await ensureDir(dir);
    // the manifest first — the registry copy may be older than the folder's own
    const manifestText = await fetchText(`${registryRaw()}/${entry.path}/plugin.json`);
    const manifest = JSON.parse(manifestText) as PluginManifest;
    const problems = validateManifest(manifest);
    if (problems.length) throw new Error(problems[0]);
    if (manifest.id !== entry.id) throw new Error('manifest id mismatch');
    await writeTextFile(`${dir}\\plugin.json`, manifestText);
    for (const file of entry.files) {
      if (file === 'plugin.json' || !TEXT_EXTENSIONS.test(file) || file.includes('..')) continue;
      const text = await fetchText(`${registryRaw()}/${entry.path}/${file}`);
      const target = `${dir}\\${file.replace(/\//g, '\\')}`;
      const parent = target.slice(0, target.lastIndexOf('\\'));
      await ensureDir(parent);
      await writeTextFile(target, text);
    }
    const created = await applyContributions(manifest, dir);
    const installed: InstalledPlugin = { id: manifest.id, version: manifest.version, manifest, dir, enabled: true, installedAt: Date.now(), created };
    store.put(installed);
    await activate(installed);
    toast.success(t('{name} installed', { name: manifest.name }), { description: manifest.author ? t('by {author}', { author: manifest.author.name }) : undefined });
  } catch (e) {
    toast.error(t('Could not install {name}', { name: entry.name }), { description: e instanceof Error ? e.message : String(e) });
  } finally {
    usePlugins.getState().setBusy(entry.id, null);
  }
}

export async function uninstall(id: string): Promise<void> {
  const store = usePlugins.getState();
  const p = store.installed[id];
  if (!p || store.busy[id]) return;
  store.setBusy(id, 'removing');
  try {
    await takeBack(p);
    store.drop(id);
    toast.neutral(t('{name} removed', { name: p.manifest.name }));
  } catch (e) {
    toast.error(t('Could not remove {name}', { name: p.manifest.name }), { description: e instanceof Error ? e.message : String(e) });
  } finally {
    usePlugins.getState().setBusy(id, null);
  }
}

export async function setEnabled(id: string, enabled: boolean): Promise<void> {
  const store = usePlugins.getState();
  const p = store.installed[id];
  if (!p) return;
  store.setEnabled(id, enabled);
  if (enabled) await activate({ ...p, enabled: true });
  else deactivate(id);
}

/** Everything the manifest asks for that lives in other stores or on disk. */
async function applyContributions(m: PluginManifest, dir: string): Promise<InstalledPlugin['created']> {
  const created: InstalledPlugin['created'] = { agents: [], automations: [], skills: [] };
  for (const a of m.contributes?.agents ?? []) {
    const agent = useAgents.getState().addAgent({ ...EMPTY_AGENT, ...a, pluginId: m.id });
    created.agents.push(agent.id);
  }
  for (const sk of m.contributes?.skills ?? []) {
    // copy the skill's folder to ~/.claude/skills/<name>
    const home = await homeDir();
    const target = `${home}\\.claude\\skills\\${sk.name}`;
    await ensureDir(target);
    const src = `${dir}\\${sk.path.replace(/\//g, '\\')}`;
    await copyTree(src, target);
    created.skills.push(target);
  }
  // automations are presets: they are added disabled, for the current project, and switched on by the user
  return created;
}

async function copyTree(src: string, dst: string) {
  const { listDir, readTextFile } = await import('@/native/system');
  const entries = await listDir(src).catch(() => []);
  for (const e of entries) {
    const from = `${src}\\${e.name}`;
    const to = `${dst}\\${e.name}`;
    if (e.isDir) {
      await ensureDir(to);
      await copyTree(from, to);
    } else if (TEXT_EXTENSIONS.test(e.name)) {
      await writeTextFile(to, await readTextFile(from));
    }
  }
}

async function takeBack(p: InstalledPlugin) {
  deactivate(p.id);
  for (const id of p.created.agents) useAgents.getState().removeAgent(id);
  for (const id of p.created.automations) useAutomations.getState().remove(id);
  for (const path of p.created.skills) if (await pathExists(path)) await trashPath(path).catch(() => void 0);
  if (await pathExists(p.dir)) await trashPath(p.dir).catch(() => void 0);
}

/** Activate every enabled plugin at launch. */
export async function bootPlugins(): Promise<void> {
  if (!isTauri) return;
  for (const p of Object.values(usePlugins.getState().installed)) if (p.enabled) await activate(p);
  void refreshIndex();
}

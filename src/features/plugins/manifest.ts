import type { ThemePack } from '@/features/appearance/packs';
import type { AgentDraft } from '@/stores/agents';
import type { Trigger, Action } from '@/stores/automations';

/**
 * A Zpace plugin is a folder in the community registry
 * (github.com/Nicoo01x/zpace-plugins): a `plugin.json` and the files it
 * names. Everything is plain text — the app fetches the files from the
 * repo and writes them under the app data folder — so a plugin is
 * reviewable as a pull request and installs without a build step.
 *
 * What a plugin can contribute, all optional:
 *   themes       theme packs (colours, terminal scheme, editor colours)
 *   commands     palette entries that send a prompt, run a command or open a URL
 *   agents       ready-made Zpace agents (persona, rules, tools)
 *   skills       Claude Code skills, copied to ~/.claude/skills/<name>
 *   automations  automation presets (added disabled, per project on use)
 *   panes        HTML pages opened as workspace panes
 *   main         a script activated with the `zpace` API (see runtime.ts)
 */

export const REGISTRY_REPO = 'Nicoo01x/zpace-plugins';
export const REGISTRY_BRANCH = 'main';
export const REGISTRY_URL = `https://github.com/${REGISTRY_REPO}`;
/**
 * Where the files come from, in order of preference: GitHub's raw host, then jsDelivr's mirror of the
 * same repo (GitHub's CDN edge in some regions answers 503 for a while; jsDelivr serves the same bytes
 * with a few minutes of cache). Read on every call so a dev override
 * (`localStorage['zpace.registry'] = 'http://127.0.0.1:3777'`) takes effect without a reload.
 */
export function registryBases(): string[] {
  const override = import.meta.env.DEV && typeof localStorage !== 'undefined' ? localStorage.getItem('zpace.registry') : null;
  if (override) return [override.replace(/[/]+$/, '')];
  return [`https://raw.githubusercontent.com/${REGISTRY_REPO}/refs/heads/${REGISTRY_BRANCH}`, `https://cdn.jsdelivr.net/gh/${REGISTRY_REPO}@${REGISTRY_BRANCH}`];
}
/** The preferred base (for URLs shown or used once, like icons). */
export const registryRaw = () => registryBases()[0];

/** What a script may touch; shown before install. */
export type PluginPermission = 'commands' | 'panes' | 'events' | 'agents' | 'shell' | 'files' | 'network' | 'notifications' | 'clipboard' | 'notes' | 'media';
export const PERMISSIONS: PluginPermission[] = ['commands', 'panes', 'events', 'agents', 'shell', 'files', 'network', 'notifications', 'clipboard', 'notes', 'media'];

export type PluginTag = 'theme' | 'agent' | 'skill' | 'command' | 'automation' | 'pane' | 'script' | 'tool';

export interface PluginAuthor {
  name: string;
  /** GitHub login — the avatar and the profile link come from it. */
  github: string;
}

export interface PluginCommandSpec {
  id: string;
  title: string;
  keywords?: string[];
  action: { kind: 'prompt'; text: string; session?: 'active' | 'new' } | { kind: 'shell'; command: string } | { kind: 'url'; url: string } | { kind: 'pane'; pane: string } | { kind: 'script'; fn: string };
}

export interface PluginPaneSpec {
  id: string;
  title: string;
  /** HTML file in the plugin folder. */
  entry: string;
}

export interface PluginSkillSpec {
  /** Folder name under ~/.claude/skills. */
  name: string;
  /** Folder in the plugin. */
  path: string;
}

export interface PluginAutomationSpec {
  name: string;
  trigger: Trigger;
  action: Action;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: PluginAuthor;
  /** SVG file in the plugin folder. */
  icon?: string;
  /** Pictures of the plugin (png/jpg/webp/gif in the folder) — shown on the card straight from the repo, never installed. */
  screenshots?: string[];
  homepage?: string;
  tags?: PluginTag[];
  /** Lowest app version it works with. */
  minZpace?: string;
  permissions?: PluginPermission[];
  contributes?: {
    themes?: ThemePack[];
    commands?: PluginCommandSpec[];
    agents?: Array<Partial<AgentDraft> & { name: string }>;
    skills?: PluginSkillSpec[];
    automations?: PluginAutomationSpec[];
    panes?: PluginPaneSpec[];
  };
  /** Script file in the plugin folder, an ES module exporting `activate(zpace)`. */
  main?: string;
}

/** One entry of the registry's `plugins.json`: the manifest plus where its files are. */
export interface RegistryEntry extends PluginManifest {
  /** Folder in the registry repo. */
  path: string;
  /** Every file to fetch, relative to `path`. */
  files: string[];
  /** ISO date of the last change. */
  updated?: string;
}

export interface RegistryIndex {
  updated: string;
  plugins: RegistryEntry[];
}

/** Text is all a plugin ships; anything else stays out of the app data folder. */
export const TEXT_EXTENSIONS = /\.(json|js|mjs|css|html|htm|md|txt|svg|yml|yaml|toml)$/i;
/** Pictures may sit in the folder for the card; they stay in the repo. */
export const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;

const ID = /^[a-z0-9][a-z0-9-]{1,48}$/;
const SEMVER = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;

/** Problems with a manifest, in order — empty means it is fine. */
export function validateManifest(m: unknown): string[] {
  const out: string[] = [];
  if (!m || typeof m !== 'object') return ['not an object'];
  const p = m as Partial<PluginManifest>;
  if (!p.id || !ID.test(p.id)) out.push('id: lowercase letters, digits and dashes, 2–49 chars');
  if (!p.name?.trim()) out.push('name: required');
  if (!p.version || !SEMVER.test(p.version)) out.push('version: semver (1.2.3)');
  if (!p.description?.trim()) out.push('description: required');
  if (!p.author?.github || !/^[A-Za-z0-9-]{1,39}$/.test(p.author.github)) out.push('author.github: a GitHub login');
  if (!p.author?.name?.trim()) out.push('author.name: required');
  for (const perm of p.permissions ?? []) if (!PERMISSIONS.includes(perm)) out.push(`permissions: unknown "${perm}"`);
  if (p.main && !TEXT_EXTENSIONS.test(p.main)) out.push('main: must be a .js/.mjs file');
  for (const sh of p.screenshots ?? []) if (!IMAGE_EXTENSIONS.test(sh) || sh.includes('..')) out.push(`screenshots: "${sh}" must be a png/jpg/webp/gif in the plugin folder`);
  const c = p.contributes ?? {};
  for (const cmd of c.commands ?? []) if (!cmd.id || !cmd.title || !cmd.action?.kind) out.push(`commands: "${cmd.id ?? '?'}" needs id, title and action`);
  for (const th of c.themes ?? []) if (!th.id || !th.label || !th.appearance) out.push(`themes: "${th.id ?? '?'}" needs id, label and appearance`);
  for (const pane of c.panes ?? []) if (!pane.id || !pane.title || !pane.entry) out.push(`panes: "${pane.id ?? '?'}" needs id, title and entry`);
  for (const sk of c.skills ?? []) if (!sk.name || !sk.path) out.push(`skills: "${sk.name ?? '?'}" needs name and path`);
  return out;
}

/** a < b for semver-ish strings. */
export function olderThan(a: string, b: string): boolean {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

export const avatarOf = (github: string, size = 64) => `https://github.com/${github}.png?size=${size}`;
export const profileOf = (github: string) => `https://github.com/${github}`;

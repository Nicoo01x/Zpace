import { createDir, listDir, pathExists, readTextFile, trashPath, writeTextFile, joinPath } from '@/native/system';
import { homeDir, type McpConfig } from '@/features/mcp/mcp-config';
import { slugOf } from '@/features/agents/subagents';
import type { ResolvedScope } from './scope';

/**
 * The files the Studio edits, read and written in Claude Code's own formats:
 * a skill is `skills/<name>/SKILL.md` (frontmatter + Markdown, with whatever
 * else the folder holds), a command is `commands/<name>.md`, memory is a
 * CLAUDE.md, hooks live under `hooks` in settings.json, MCP servers in
 * `~/.claude.json` (user) or the project's `.mcp.json`. Frontmatter keys the
 * editor does not know are kept as they were; JSON files keep every other key.
 */

/* ----------------------------- frontmatter ----------------------------- */

export interface Front {
  fields: Array<[string, string]>;
  body: string;
}

export function parseFront(text: string): Front {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(t);
  if (!m) return { fields: [], body: t };
  const fields: Array<[string, string]> = [];
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s/.test(line)) continue;
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    // Block scalars: the indented lines that follow, joined.
    if (/^[>|][-+]?$/.test(value)) {
      const parts: string[] = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim())) {
        i++;
        if (lines[i].trim()) parts.push(lines[i].trim());
      }
      value = parts.join(' ');
    } else value = value.replace(/^(["'])(.*)\1$/, '$2');
    fields.push([kv[1], value]);
  }
  return { fields, body: m[2] };
}

export function fieldOf(f: Front, key: string): string {
  return f.fields.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1] ?? '';
}

/** A frontmatter value, quoted when YAML would read it wrong. */
function yamlValue(v: string): string {
  const s = v.trim().replace(/\s+/g, ' ');
  return /[:#"'{}[\],&*?|<>=!%@`]/.test(s) || /^(true|false|null|yes|no|~)$/i.test(s) || /^[\d.-]/.test(s) ? JSON.stringify(s) : s;
}

export function serializeFront(fields: Array<[string, string]>, body: string): string {
  const front = fields.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return `---\n${front.join('\n')}\n---\n\n${body.trim()}\n`;
}

/* -------------------------------- skills ------------------------------- */

export interface SkillDoc {
  /** SKILL.md; empty for a new one. */
  path: string;
  folder: string;
  name: string;
  description: string;
  argumentHint: string;
  userInvocable: boolean;
  extra: Array<[string, string]>;
  body: string;
  /** Other files in the folder (relative paths), for the editor's chips. */
  files: string[];
}

const SKILL_KNOWN = new Set(['name', 'description', 'argument-hint', 'user-invocable']);

export const BLANK_SKILL: SkillDoc = { path: '', folder: '', name: '', description: '', argumentHint: '', userInvocable: true, extra: [], body: '', files: [] };

async function walk(dir: string, prefix: string, out: string[], depth: number): Promise<void> {
  if (depth > 3 || out.length > 60) return;
  const entries = await listDir(dir).catch(() => []);
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDir) await walk(joinPath(dir, e.name), rel, out, depth + 1);
    else if (rel !== 'SKILL.md') out.push(rel);
  }
}

export async function readSkill(path: string): Promise<SkillDoc> {
  const text = await readTextFile(path);
  const f = parseFront(text);
  const folder = path.replace(/[\\/][^\\/]*$/, '');
  const files: string[] = [];
  await walk(folder, '', files, 0);
  return {
    path,
    folder,
    name: fieldOf(f, 'name') || folder.split(/[\\/]/).pop() || '',
    description: fieldOf(f, 'description'),
    argumentHint: fieldOf(f, 'argument-hint'),
    userInvocable: fieldOf(f, 'user-invocable').toLowerCase() !== 'false',
    extra: f.fields.filter(([k]) => !SKILL_KNOWN.has(k.toLowerCase())),
    body: f.body.trim(),
    files: files.sort(),
  };
}

export function serializeSkill(s: SkillDoc): string {
  const fields: Array<[string, string]> = [
    ['name', slugOf(s.name)],
    ['description', s.description],
  ];
  if (s.argumentHint.trim()) fields.push(['argument-hint', s.argumentHint]);
  if (!s.userInvocable) fields.push(['user-invocable', 'false']);
  for (const [k, v] of s.extra) if (!SKILL_KNOWN.has(k.toLowerCase())) fields.push([k, v]);
  return serializeFront(fields, s.body);
}

/** Writes `<root>/skills/<slug>/SKILL.md`; a renamed skill moves nothing — its folder keeps the old name until the user renames it on disk. */
export async function writeSkill(s: SkillDoc, scope: ResolvedScope): Promise<string> {
  const folder = s.folder || joinPath(joinPath(scope.root, 'skills'), slugOf(s.name));
  if (!(await pathExists(folder))) await createDir(folder);
  const target = joinPath(folder, 'SKILL.md');
  await writeTextFile(target, serializeSkill(s));
  return target;
}

export async function deleteSkill(s: SkillDoc): Promise<void> {
  if (s.folder) await trashPath(s.folder);
}

/* ------------------------------- commands ------------------------------ */

export interface CommandDoc {
  path: string;
  name: string;
  description: string;
  argumentHint: string;
  extra: Array<[string, string]>;
  body: string;
}

const COMMAND_KNOWN = new Set(['description', 'argument-hint']);

export const BLANK_COMMAND: CommandDoc = { path: '', name: '', description: '', argumentHint: '', extra: [], body: '' };

export async function readCommand(path: string): Promise<CommandDoc> {
  const f = parseFront(await readTextFile(path));
  return {
    path,
    name: path.split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? '',
    description: fieldOf(f, 'description'),
    argumentHint: fieldOf(f, 'argument-hint'),
    extra: f.fields.filter(([k]) => !COMMAND_KNOWN.has(k.toLowerCase())),
    body: f.body.trim(),
  };
}

export function serializeCommand(c: CommandDoc): string {
  const fields: Array<[string, string]> = [['description', c.description]];
  if (c.argumentHint.trim()) fields.push(['argument-hint', c.argumentHint]);
  for (const [k, v] of c.extra) if (!COMMAND_KNOWN.has(k.toLowerCase())) fields.push([k, v]);
  return serializeFront(fields, c.body);
}

export async function writeCommand(c: CommandDoc, scope: ResolvedScope): Promise<string> {
  const dir = joinPath(scope.root, 'commands');
  if (!(await pathExists(dir))) await createDir(dir);
  const target = joinPath(dir, `${slugOf(c.name)}.md`);
  await writeTextFile(target, serializeCommand(c));
  // A renamed command leaves its old file behind otherwise.
  if (c.path && c.path.replace(/\\/g, '/').toLowerCase() !== target.replace(/\\/g, '/').toLowerCase() && (await pathExists(c.path))) await trashPath(c.path).catch(() => undefined);
  return target;
}

export async function deleteCommand(c: CommandDoc): Promise<void> {
  if (c.path) await trashPath(c.path);
}

/* -------------------------------- hooks -------------------------------- */

export const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'SessionStart', 'SessionEnd', 'PreCompact'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookRow {
  /** `<event>:<group index>:<hook index>` in the file; '' for a new one. */
  id: string;
  event: HookEvent;
  matcher: string;
  command: string;
  timeout: string;
}

interface HookEntry {
  type?: string;
  command?: string;
  timeout?: number;
  [k: string]: unknown;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
  [k: string]: unknown;
}
type SettingsJson = { hooks?: Record<string, HookGroup[]>; [k: string]: unknown };

async function readSettings(path: string): Promise<SettingsJson> {
  if (!(await pathExists(path))) return {};
  const text = await readTextFile(path);
  if (!text.trim()) return {};
  return JSON.parse(text) as SettingsJson;
}

export async function readHooks(settingsPath: string): Promise<HookRow[]> {
  const cfg = await readSettings(settingsPath).catch(() => ({}) as SettingsJson);
  const out: HookRow[] = [];
  for (const [event, groups] of Object.entries(cfg.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((g, gi) => {
      (g.hooks ?? []).forEach((h, hi) => {
        out.push({ id: `${event}:${gi}:${hi}`, event: event as HookEvent, matcher: g.matcher ?? '', command: h.command ?? '', timeout: h.timeout != null ? String(h.timeout) : '' });
      });
    });
  }
  return out;
}

/** Puts a hook in the file: replaces the one `row.id` names (or adds it), keeping every other key of settings.json. */
export async function writeHook(settingsPath: string, row: HookRow): Promise<string> {
  const cfg = await readSettings(settingsPath);
  const hooks = cfg.hooks ?? {};
  if (row.id) removeFrom(hooks, row.id);
  const groups = (hooks[row.event] ??= []);
  const matcher = row.matcher.trim();
  let group = groups.find((g) => (g.matcher ?? '') === matcher);
  if (!group) {
    group = matcher ? { matcher, hooks: [] } : { hooks: [] };
    groups.push(group);
  }
  const entry: HookEntry = { type: 'command', command: row.command.trim() };
  const timeout = Number(row.timeout);
  if (row.timeout.trim() && Number.isFinite(timeout) && timeout > 0) entry.timeout = timeout;
  (group.hooks ??= []).push(entry);
  cfg.hooks = hooks;
  await writeSettings(settingsPath, cfg);
  return `${row.event}:${groups.indexOf(group)}:${group.hooks.length - 1}`;
}

export async function deleteHook(settingsPath: string, id: string): Promise<void> {
  const cfg = await readSettings(settingsPath);
  if (!cfg.hooks) return;
  removeFrom(cfg.hooks, id);
  await writeSettings(settingsPath, cfg);
}

function removeFrom(hooks: Record<string, HookGroup[]>, id: string) {
  const [event, gi, hi] = id.split(':');
  const groups = hooks[event];
  const group = groups?.[Number(gi)];
  if (!group?.hooks) return;
  group.hooks.splice(Number(hi), 1);
  if (group.hooks.length === 0) groups.splice(Number(gi), 1);
  if (groups.length === 0) delete hooks[event];
}

async function writeSettings(path: string, cfg: SettingsJson): Promise<void> {
  const dir = path.replace(/[\\/][^\\/]*$/, '');
  if (!(await pathExists(dir))) await createDir(dir);
  await writeTextFile(path, JSON.stringify(cfg, null, 2) + '\n');
}

/* --------------------------------- MCP --------------------------------- */

export interface McpDoc {
  /** The name it had in the file; '' for a new one. */
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command: string;
  /** One per line. */
  args: string;
  /** KEY=value, one per line. */
  env: string;
  url: string;
  /** Header: value, one per line. */
  headers: string;
}

export const BLANK_MCP: McpDoc = { id: '', name: '', transport: 'stdio', command: '', args: '', env: '', url: '', headers: '' };

const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const pairs = (s: string, sep: string): Record<string, string> => Object.fromEntries(lines(s).map((l) => [l.slice(0, l.indexOf(sep)).trim(), l.slice(l.indexOf(sep) + 1).trim()]).filter(([k]) => k));

export function mcpDocOf(name: string, c: McpConfig): McpDoc {
  return {
    id: name,
    name,
    transport: c.url ? 'http' : 'stdio',
    command: c.command ?? '',
    args: (c.args ?? []).join('\n'),
    env: Object.entries(c.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    url: c.url ?? '',
    headers: Object.entries(c.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
  };
}

export function mcpConfigOf(d: McpDoc): McpConfig {
  if (d.transport === 'http') {
    const headers = pairs(d.headers, ':');
    return { type: 'http', url: d.url.trim(), ...(Object.keys(headers).length ? { headers } : {}) };
  }
  const env = pairs(d.env, '=');
  return { command: d.command.trim(), args: lines(d.args), ...(Object.keys(env).length ? { env } : {}) };
}

type McpFile = { mcpServers?: Record<string, McpConfig>; [k: string]: unknown };

async function mcpFileOf(scope: ResolvedScope): Promise<string> {
  return scope.kind === 'user' ? joinPath(await homeDir(), '.claude.json') : joinPath(scope.base, '.mcp.json');
}

/** Adds or replaces a server in the scope's file (`~/.claude.json` keeps everything else Claude Code stores there). */
export async function writeMcp(scope: ResolvedScope, d: McpDoc): Promise<void> {
  const file = await mcpFileOf(scope);
  const cfg: McpFile = (await pathExists(file)) ? (JSON.parse((await readTextFile(file)) || '{}') as McpFile) : {};
  const servers = { ...(cfg.mcpServers ?? {}) };
  if (d.id && d.id !== d.name.trim()) delete servers[d.id];
  servers[d.name.trim()] = mcpConfigOf(d);
  cfg.mcpServers = servers;
  await writeTextFile(file, JSON.stringify(cfg, null, 2) + '\n');
}

export async function deleteMcp(scope: ResolvedScope, name: string): Promise<void> {
  const file = await mcpFileOf(scope);
  if (!(await pathExists(file))) return;
  const cfg = JSON.parse((await readTextFile(file)) || '{}') as McpFile;
  if (!cfg.mcpServers?.[name]) return;
  delete cfg.mcpServers[name];
  await writeTextFile(file, JSON.stringify(cfg, null, 2) + '\n');
}

/* -------------------------------- memory ------------------------------- */

export async function readMemory(path: string): Promise<{ text: string; exists: boolean }> {
  if (!(await pathExists(path))) return { text: '', exists: false };
  return { text: await readTextFile(path), exists: true };
}

export async function writeMemory(path: string, text: string): Promise<void> {
  const dir = path.replace(/[\\/][^\\/]*$/, '');
  if (!(await pathExists(dir))) await createDir(dir);
  await writeTextFile(path, text.endsWith('\n') ? text : text + '\n');
}

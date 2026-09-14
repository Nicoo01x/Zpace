import { createDir, pathExists, readTextFile, trashPath, writeTextFile } from '@/native/system';
import { homeDir } from '@/features/mcp/mcp-config';
import { useCapabilities, type AssetInfo } from '@/stores/capabilities';
import { useAgents, lines, type CustomAgent } from '@/stores/agents';
import { personaPrompt } from './room-runtime';

/**
 * Claude Code's own subagents: Markdown files with a frontmatter, in
 * `~/.claude/agents/` (the user's) or `<project>/.claude/agents/` (the
 * project's). Claude Code delegates to them on its own or on request. Zpace
 * lists them, edits them in place, creates new ones, and can turn one of its
 * custom agents into one (and the other way round).
 *
 *   ---
 *   name: code-reviewer
 *   description: Expert code review specialist. Use proactively after changes.
 *   tools: Read, Grep, Glob, Bash
 *   model: sonnet
 *   ---
 *   You are a senior code reviewer…
 */
export type SubagentScope = 'user' | 'project';

export interface Subagent {
  /** Where the file is (empty for a new one). */
  path: string;
  scope: SubagentScope | 'plugin';
  name: string;
  description: string;
  /** Comma-separated tool names, as Claude Code writes them; empty = all tools. */
  tools: string;
  /** sonnet | opus | haiku | inherit | '' */
  model: string;
  permissionMode: string;
  /** Frontmatter keys this editor does not know — kept as they were. */
  extra: Array<[string, string]>;
  /** The system prompt. */
  body: string;
}

const KNOWN = new Set(['name', 'description', 'tools', 'model', 'permissionMode']);

export function parseSubagent(text: string, path: string, scope: Subagent['scope']): Subagent {
  const out: Subagent = { path, scope, name: '', description: '', tools: '', model: '', permissionMode: '', extra: [], body: '' };
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(t);
  if (!m) {
    out.body = t.trim();
    return out;
  }
  for (const raw of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(raw);
    if (!kv) continue;
    const [, key, value] = kv;
    const v = value.trim().replace(/^(["'])(.*)\1$/, '$2');
    if (key === 'name') out.name = v;
    else if (key === 'description') out.description = v;
    else if (key === 'tools') out.tools = v;
    else if (key === 'model') out.model = v;
    else if (key === 'permissionMode') out.permissionMode = v;
    else out.extra.push([key, value.trim()]);
  }
  out.body = m[2].trim();
  return out;
}

export function serializeSubagent(a: Subagent): string {
  const front: string[] = [`name: ${a.name.trim()}`];
  const desc = a.description.trim().replace(/\s+/g, ' ');
  if (desc) front.push(`description: ${/[:#]/.test(desc) ? JSON.stringify(desc) : desc}`);
  if (a.tools.trim()) front.push(`tools: ${a.tools.trim()}`);
  if (a.model.trim() && a.model !== 'inherit') front.push(`model: ${a.model.trim()}`);
  if (a.permissionMode.trim()) front.push(`permissionMode: ${a.permissionMode.trim()}`);
  for (const [k, v] of a.extra) if (!KNOWN.has(k)) front.push(`${k}: ${v}`);
  return `---\n${front.join('\n')}\n---\n\n${a.body.trim()}\n`;
}

/** A file name Claude Code accepts: lower-case, dashes. */
export function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
}

async function agentsDir(scope: SubagentScope, projectPath?: string): Promise<string> {
  if (scope === 'project') {
    if (!projectPath) throw new Error('No project');
    return `${projectPath.replace(/[\\/]+$/, '')}/.claude/agents`;
  }
  return `${await homeDir()}/.claude/agents`;
}

export async function readSubagent(info: AssetInfo): Promise<Subagent> {
  const text = await readTextFile(info.path);
  const scope: Subagent['scope'] = info.source === 'user' ? 'user' : info.source === 'project' ? 'project' : 'plugin';
  return parseSubagent(text, info.path, scope);
}

/** Write it where its scope says; a renamed one keeps a tidy file name (the old file is trashed). */
export async function writeSubagent(a: Subagent, scope: SubagentScope, projectPath?: string): Promise<string> {
  const dir = await agentsDir(scope, projectPath);
  if (!(await pathExists(dir))) await createDir(dir);
  const target = `${dir}/${slugOf(a.name)}.md`;
  await writeTextFile(target, serializeSubagent({ ...a, name: slugOf(a.name) }));
  if (a.path && a.path.replace(/\\/g, '/').toLowerCase() !== target.replace(/\\/g, '/').toLowerCase() && (await pathExists(a.path))) await trashPath(a.path).catch(() => undefined);
  void useCapabilities.getState().loadAssets(projectPath, true);
  return target;
}

export async function deleteSubagent(a: Subagent, projectPath?: string): Promise<void> {
  if (a.path) await trashPath(a.path);
  void useCapabilities.getState().loadAssets(projectPath, true);
}

/** A Zpace agent as a Claude Code subagent: the persona becomes the system prompt, the tool lists carry over. */
export async function exportAgentAsSubagent(agent: CustomAgent, scope: SubagentScope, projectPath?: string): Promise<string> {
  const assets = await useCapabilities.getState().loadAssets(projectPath);
  const allowed = lines(agent.allowedTools)
    .map((l) => l.replace(/\(.*$/, ''))
    .filter(Boolean);
  const sub: Subagent = {
    path: '',
    scope,
    name: slugOf(agent.name),
    description: (agent.instructions.split('\n').find((l) => l.trim()) ?? agent.name).trim().slice(0, 200),
    tools: [...new Set(allowed)].join(', '),
    model: /^(opus|sonnet|haiku)$/.test(agent.model) ? agent.model : '',
    permissionMode: agent.permissionMode ?? '',
    extra: [],
    body: personaPrompt(agent, assets.skills),
  };
  return writeSubagent(sub, scope, projectPath);
}

/** A Claude Code subagent as a Zpace agent: its prompt becomes the instructions. */
export function importSubagentAsAgent(sub: Subagent): CustomAgent {
  const model = /^(opus|sonnet|haiku)$/.test(sub.model) ? sub.model : 'opus';
  const permissionMode = ['default', 'acceptEdits', 'plan', 'bypassPermissions'].includes(sub.permissionMode) ? (sub.permissionMode as CustomAgent['permissionMode']) : undefined;
  return useAgents.getState().addAgent({
    name: sub.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    shape: 'squircle',
    color: '#8b5cf6',
    expression: 'attentif',
    model,
    instructions: [sub.description, '', sub.body].filter((x, i) => i === 1 || x.trim()).join('\n').trim(),
    rules: '',
    knowledge: '',
    links: [],
    files: [],
    skills: [],
    mcp: [],
    allowedTools: sub.tools
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n'),
    disallowedTools: '',
    permissionMode,
  });
}

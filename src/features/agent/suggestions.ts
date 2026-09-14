import type { ComponentType } from 'react';
import { Slash, Sparkles, Terminal, Bot, Puzzle, FileText, Folder, GitBranch, File as FileIcon, Scissors } from 'lucide-react';
import { fuzzyFilter } from '@/lib/fuzzy';
import { BUILTIN_COMMANDS, LOCAL_COMMANDS, TUI_ONLY, type AgentAssets, type SessionCaps } from '@/stores/capabilities';
import { t, T } from '@/i18n';

/**
 * Everything the composer can offer after `/` or `@`: Claude Code's own
 * commands (from the session's init message), skills and custom commands from
 * disk (with descriptions), plugin skills, plus file and folder mentions.
 */
export interface Suggestion {
  /** Stable id for keys. */
  id: string;
  /** What is shown, e.g. `/graphify` or `@src/app.ts`. */
  label: string;
  /** Text inserted into the composer (trailing space added by the caller). */
  insert: string;
  hint: string;
  group: 'Session' | 'Claude Code' | 'Skills' | 'Commands' | 'Plugins' | 'Agents' | 'Mentions' | 'Files' | 'Snippets';
  icon: ComponentType<{ className?: string }>;
  argumentHint?: string;
  /** Handled by the composer itself instead of being sent (clear, cost, model, help). */
  local?: boolean;
  /** Interactive-only built-in: runs in a Claude Code terminal opened beside the chat. */
  tui?: boolean;
}

const LOCAL: Array<{ cmd: string; hint: string }> = [
  { cmd: '/clear', hint: T('Start a fresh conversation') },
  { cmd: '/cost', hint: T('Show token usage and cost') },
  { cmd: '/model', hint: T('Switch the model for this session') },
  { cmd: '/help', hint: T('Keyboard shortcuts') },
  { cmd: '/arena', hint: T('The same task to several agents in parallel — compare and keep one') },
];

const MENTIONS: Array<{ key: string; hint: string; icon: ComponentType<{ className?: string }> }> = [
  { key: '@file', hint: T('Pick a file to reference'), icon: FileText },
  { key: '@folder', hint: T('Pick a folder to reference'), icon: Folder },
  { key: '@git', hint: T('Insert git status of the project'), icon: GitBranch },
  { key: '@terminal', hint: T('Insert the last terminal output'), icon: Terminal },
];

const GROUP_ORDER: Suggestion['group'][] = ['Session', 'Snippets', 'Skills', 'Commands', 'Plugins', 'Claude Code', 'Agents', 'Mentions', 'Files'];

/** All slash suggestions for a session (before filtering). */
export function slashSuggestions(caps: SessionCaps | undefined, assets: AgentAssets, snippets: Array<{ name: string; body: string }> = []): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion) => {
    const key = s.insert.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  // Saved snippets: `/snippet:name` drops the body into the composer.
  for (const sn of snippets) push({ id: `snippet:${sn.name}`, label: `/snippet:${sn.name}`, insert: `/snippet:${sn.name}`, hint: sn.body.replace(/\s+/g, ' ').slice(0, 60), group: 'Snippets', icon: Scissors, local: true });
  for (const l of LOCAL) push({ id: `local:${l.cmd}`, label: l.cmd, insert: l.cmd, hint: t(l.hint), group: 'Session', icon: Slash, local: true });
  for (const [bare, hint] of Object.entries(LOCAL_COMMANDS)) push({ id: `local:/${bare}`, label: `/${bare}`, insert: `/${bare}`, hint: t(hint), group: 'Session', icon: Slash, local: true });
  for (const s of assets.skills) {
    if (!s.userInvocable) continue;
    const plugin = s.source.startsWith('plugin:');
    push({ id: `skill:${s.path}`, label: s.invoke, insert: s.invoke, hint: s.description, group: plugin ? 'Plugins' : 'Skills', icon: plugin ? Puzzle : Sparkles, argumentHint: s.argumentHint });
  }
  for (const c of assets.commands) {
    const plugin = c.source.startsWith('plugin:');
    push({ id: `cmd:${c.path}`, label: c.invoke, insert: c.invoke, hint: c.description || (c.source === 'project' ? t('Project command') : t('Custom command')), group: plugin ? 'Plugins' : 'Commands', icon: plugin ? Puzzle : Terminal, argumentHint: c.argumentHint });
  }
  const reported = new Set((caps?.slashCommands ?? []).map((n) => n.replace(/^\//, '')));
  for (const name of caps?.slashCommands ?? []) {
    const bare = name.replace(/^\//, '');
    push({ id: `cli:${bare}`, label: `/${bare}`, insert: `/${bare}`, hint: BUILTIN_COMMANDS[bare] ? t(BUILTIN_COMMANDS[bare]) : bare.includes(':') ? t('Plugin command') : t('Claude Code command'), group: bare.includes(':') ? 'Plugins' : 'Claude Code', icon: bare.includes(':') ? Puzzle : Slash });
  }
  // Every built-in Claude Code knows, whether or not this session reported it: the ones that only
  // work interactively (/rc, /config, /resume…) open in a Claude Code terminal beside the chat.
  for (const [bare, hint] of Object.entries(BUILTIN_COMMANDS)) {
    if (reported.has(bare)) continue;
    const tui = TUI_ONLY.has(bare);
    push({ id: `cli:${bare}`, label: `/${bare}`, insert: `/${bare}`, hint: tui ? `${t(hint)} · terminal` : t(hint), group: 'Claude Code', icon: tui ? Terminal : Slash, tui });
  }
  return out;
}

/** Agents are not slash-invoked; they surface as `@agent` hints that expand to a request to use them. */
export function agentSuggestions(caps: SessionCaps | undefined, assets: AgentAssets): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const a of assets.agents) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    out.push({ id: `agent:${a.path}`, label: `@${a.name}`, insert: `Use the ${a.name} subagent to `, hint: a.description || (a.source.startsWith('plugin:') ? a.source : t('Subagent')), group: 'Agents', icon: Bot });
  }
  for (const name of caps?.agents ?? []) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: `agent:${name}`, label: `@${name}`, insert: `Use the ${name} subagent to `, hint: t('Subagent'), group: 'Agents', icon: Bot });
  }
  return out;
}

export function mentionSuggestions(files: string[], query: string, caps: SessionCaps | undefined, assets: AgentAssets): Suggestion[] {
  const base: Suggestion[] = MENTIONS.map((m) => ({ id: `mention:${m.key}`, label: m.key, insert: m.key, hint: t(m.hint), group: 'Mentions', icon: m.icon }));
  const agents = agentSuggestions(caps, assets);
  const q = query.replace(/^@/, '');
  if (!q) return [...base, ...agents.slice(0, 4)];
  const fileHits = fuzzyFilter(q, files, (f) => f, 8).map((r) => ({ id: `file:${r.item}`, label: `@${r.item}`, insert: `@${r.item}`, hint: t('File'), group: 'Files' as const, icon: FileIcon }));
  return [...base, ...agents, ...fileHits];
}

/** Filter + rank suggestions for what has been typed after the trigger character. */
export function filterSuggestions(items: Suggestion[], query: string, limit = 14): Suggestion[] {
  const q = query.replace(/^[/@]/, '').toLowerCase();
  if (!q) return items.slice(0, limit);
  const ranked = fuzzyFilter(q, items, (s) => [s.label.replace(/^[/@]/, ''), s.hint], 60).map((r) => r.item);
  // Prefix matches on the name come first, then keep the fuzzy order.
  const prefix = ranked.filter((s) => s.label.replace(/^[/@]/, '').toLowerCase().startsWith(q));
  const rest = ranked.filter((s) => !prefix.includes(s));
  return [...prefix, ...rest].slice(0, limit);
}

export function groupOrder(g: Suggestion['group']): number {
  return GROUP_ORDER.indexOf(g);
}

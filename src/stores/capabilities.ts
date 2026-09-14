import { create } from 'zustand';
import { T } from '@/i18n';
import { scanAgentAssets } from '@/native/system';

/**
 * What a Claude Code session can do — from two sources:
 *  - the CLI's `system/init` message on the stream-json channel: tools, MCP
 *    servers (with status), slash commands, agents, model, permission mode,
 *    output style, version;
 *  - the disk: skills, custom commands and subagents from `~/.claude`, the
 *    project's `.claude` and installed plugins (with descriptions from their
 *    frontmatter), scanned per project and cached.
 * The composer's `/` menu and the session's capabilities panel read both.
 */
export interface McpServer {
  name: string;
  status: string;
}

export interface SessionCaps {
  tools: string[];
  mcpServers: McpServer[];
  slashCommands: string[];
  agents: string[];
  skills: string[];
  model?: string;
  permissionMode?: string;
  outputStyle?: string;
  version?: string;
  cwd?: string;
  receivedAt: number;
}

export interface AssetInfo {
  name: string;
  invoke: string;
  description: string;
  source: string;
  path: string;
  argumentHint?: string;
  userInvocable: boolean;
}

export interface AgentAssets {
  skills: AssetInfo[];
  commands: AssetInfo[];
  agents: AssetInfo[];
}

interface CapabilitiesState {
  bySession: Record<string, SessionCaps>;
  assets: Record<string, { at: number; data: AgentAssets }>;
  setInit: (sessionId: string, init: Record<string, unknown>) => void;
  loadAssets: (projectPath: string | undefined, force?: boolean) => Promise<AgentAssets>;
}

const EMPTY_ASSETS: AgentAssets = { skills: [], commands: [], agents: [] };
const TTL = 60_000;
const inflight = new Map<string, Promise<AgentAssets>>();

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x && 'name' in x ? String((x as { name: unknown }).name) : '')).filter(Boolean) : []);

export const useCapabilities = create<CapabilitiesState>((set, get) => ({
  bySession: {},
  assets: {},
  setInit: (sessionId, init) => {
    const mcp = Array.isArray(init.mcp_servers)
      ? (init.mcp_servers as Array<Record<string, unknown>>).map((m) => ({ name: String(m.name ?? ''), status: String(m.status ?? 'unknown') })).filter((m) => m.name)
      : [];
    const caps: SessionCaps = {
      tools: strings(init.tools),
      mcpServers: mcp,
      slashCommands: strings(init.slash_commands),
      agents: strings(init.agents),
      skills: strings(init.skills),
      model: typeof init.model === 'string' ? init.model : undefined,
      permissionMode: typeof init.permissionMode === 'string' ? init.permissionMode : undefined,
      outputStyle: typeof init.output_style === 'string' ? init.output_style : undefined,
      version: typeof init.claude_code_version === 'string' ? init.claude_code_version : undefined,
      cwd: typeof init.cwd === 'string' ? init.cwd : undefined,
      receivedAt: Date.now(),
    };
    set((s) => ({ bySession: { ...s.bySession, [sessionId]: caps } }));
  },
  loadAssets: async (projectPath, force = false) => {
    const key = projectPath ?? '';
    const cached = get().assets[key];
    if (cached && !force && Date.now() - cached.at < TTL) return cached.data;
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = scanAgentAssets(projectPath)
      .then((data) => {
        set((s) => ({ assets: { ...s.assets, [key]: { at: Date.now(), data } } }));
        return data;
      })
      .catch(() => cached?.data ?? EMPTY_ASSETS)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  },
}));

export const NO_ASSETS = EMPTY_ASSETS;

/** Short descriptions for Claude Code's own slash commands (the init message only lists names). */
export const BUILTIN_COMMANDS: Record<string, string> = {
  compact: T('Summarise the conversation to free context'),
  clear: T('Start a fresh conversation'),
  cost: T('Show token usage and cost'),
  review: T('Review the current changes'),
  init: T('Create a CLAUDE.md for this project'),
  'pr-comments': T('Fetch and address PR comments'),
  'security-review': T('Security review of the changes'),
  'release-notes': T('Draft release notes'),
  model: T('Switch the model'),
  help: T('Keyboard shortcuts and help'),
  memory: T('Edit CLAUDE.md memory files'),
  config: T('Claude Code settings'),
  status: T('Account and system status'),
  doctor: T('Check the installation'),
  agents: T('Manage subagents'),
  hooks: T('Manage hooks'),
  mcp: T('Manage MCP servers'),
  permissions: T('Manage tool permissions'),
  resume: T('Resume a previous conversation'),
  'add-dir': T('Add a working directory'),
  context: T('Show context usage'),
  export: T('Export the conversation'),
  todos: T('Show the todo list'),
  usage: T('Plan usage and limits'),
  bug: T('Report a bug'),
  vim: T('Toggle vim editing mode'),
  'terminal-setup': T('Terminal key bindings'),
  statusline: T('Configure the status line'),
  plugin: T('Manage plugins'),
  skills: T('List skills'),
  rewind: T('Rewind to an earlier point'),
  'output-style': T('Change the output style'),
  login: T('Sign in'),
  logout: T('Sign out'),
  upgrade: T('Upgrade the plan'),
  diff: T('Show the diff of the changes'),
  branch: T('Create a branch for the changes'),
  commit: T('Commit the changes'),
  fast: T('Toggle fast mode'),
  effort: T('Set the reasoning effort'),
  loop: T('Repeat a task on a schedule'),
  'code-review': T('Multi-agent code review'),
  ultrareview: T('Multi-agent cloud review of the branch'),
  rc: T('Remote Control: drive this session from another device'),
  theme: T('Light or dark theme'),
  keybindings: T('Keyboard bindings'),
  'privacy-settings': T('Privacy settings'),
  'install-slack-app': T('Set up Claude in Slack'),
  tasks: T('Background tasks'),
  workflows: T('Running workflows'),
  artifacts: T('Your artifacts'),
  copy: T('Copy the last response'),
  feedback: T('Send feedback'),
  exit: T('Leave Claude Code'),
  quit: T('Leave Claude Code'),
  files: T('Files touched in this session'),
  'ide': T('Connect to an IDE'),
  'insights': T('Session insights'),
  'reload-plugins': T('Reload plugins'),
  'settings': T('Settings'),
  'share': T('Share the session'),
  'stats': T('Usage statistics'),
};

/**
 * Built-ins that only make sense in Claude's own interactive terminal: the chat
 * view hands them to a Claude Code terminal (opened beside it) instead of
 * sending them as text.
 */
export const TUI_ONLY = new Set([
  'rc', 'vim', 'terminal-setup', 'statusline', 'login', 'logout', 'hooks', 'mcp', 'agents', 'doctor', 'bug', 'feedback', 'plugin', 'reload-plugins',
  'install-slack-app', 'resume', 'rewind', 'tasks', 'privacy-settings', 'upgrade', 'status', 'export', 'output-style', 'fast', 'loop', 'workflows',
  'artifacts', 'ide', 'insights', 'share', 'stats', 'skills', 'files', 'ultrareview', 'code-review',
]);

/** Handled by Zpace itself (session options, its own screens); listed under "Session" in the composer. */
export const LOCAL_COMMANDS: Record<string, string> = {
  effort: T('Effort for this session: low · medium · high · xhigh · max'),
  'add-dir': T('Give this session another folder'),
  autocompact: T('Auto-compact window: auto or a token count'),
  agent: T('Run this session as a subagent'),
  'fallback-model': T('Model to fall back to'),
  permissions: T('Permission mode: default · acceptEdits · plan · bypassPermissions'),
  config: T('Claude Code settings'),
  theme: T('Appearance settings'),
  keybindings: T('Keyboard shortcuts'),
  usage: T('Usage and limits gauge'),
  memory: T('Open CLAUDE.md beside the chat'),
  diff: T('Open the git panel'),
  copy: T('Copy the last response'),
  exit: T('Close this session'),
};

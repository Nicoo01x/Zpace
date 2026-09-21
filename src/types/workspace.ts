import type { AgentActivity, SessionUsage } from './agent';

export type ProjectRuntime = 'windows' | 'wsl' | 'native';

export interface Project {
  id: string;
  name: string;
  /** Absolute path in the host OS format (C:\… on Windows). */
  path: string;
  runtime: ProjectRuntime;
  /** Distro name when runtime === 'wsl'. */
  wslDistro?: string;
  /** Folder colour in the sidebar (a PROJECT_COLORS value); none = the neutral glyph. */
  color?: string;
  git?: GitSummary;
  lastOpenedAt: number;
  createdAt: number;
  /** Sidebar expanded state. */
  expanded: boolean;
  /** Sub-folders in the sidebar: named groups for the project's items, optionally bound to a real folder. */
  folders?: ProjectFolder[];
}

/**
 * A sub-folder of a project in the sidebar. With a `path` it is a real folder
 * inside the project and the terminals and sessions created in it work there;
 * without one it is only a way to keep things tidy.
 */
export interface ProjectFolder {
  id: string;
  name: string;
  /** Absolute path of the folder on disk, when bound to one. */
  path?: string;
  /** Glyph colour; none = the project's own. */
  color?: string;
  expanded: boolean;
  createdAt: number;
}

export interface GitSummary {
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
  isRepo: boolean;
}

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'error';

export type ProviderId = 'claude-code' | 'codex' | 'gemini' | 'opencode';

export interface SessionOptions {
  /** low | medium | high | xhigh | max */
  effort?: string;
  addDirs?: string[];
  /** auto | <tokens> */
  autocompact?: string;
  agent?: string;
  fallbackModel?: string;
  /** Permission mode for this session; overrides the global default. */
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  /** Appended to Claude Code's system prompt (a custom agent's persona and instructions). */
  appendSystemPrompt?: string;
  /** Only these MCP servers (`--mcp-config` + `--strict-mcp-config`); the values are the servers' configs. */
  mcpServers?: Record<string, unknown>;
  /** Tool patterns allowed without a prompt / never allowed (`--allowedTools` / `--disallowedTools`). */
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  providerId: ProviderId;
  model: string;
  modelLabel: string;
  /** Per-session CLI options set from the composer (/effort, /add-dir, …); applied when the process (re)starts. */
  options?: SessionOptions;
  status: SessionStatus;
  activity: AgentActivity;
  usage: SessionUsage;
  /** Cumulative runtime spent with the agent working, in ms. */
  runtimeMs: number;
  /** When the current run started (ms), if running. */
  runStartedAt?: number;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  /** A quick answer asked from Spotlight: not listed anywhere until it is continued in the chat. */
  hidden?: boolean;
  /** Pending file changes produced by this session. */
  dirtyFiles: number;
  /** Provider-side session id for resume (e.g. Claude's session_id). */
  providerSessionId?: string;
  /** A git worktree of the project this session works in (its own branch), instead of the project folder. */
  worktree?: { path: string; branch: string };
  /** The custom agent this session speaks as (its avatar, its instructions). */
  agentId?: string;
  /** The project sub-folder this session is listed in (and works in, when the folder has a path). */
  folderId?: string;
}

export interface RecentProject {
  name: string;
  path: string;
  lastOpenedAt: number;
  branch?: string;
}

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'gitbash' | 'wsl' | 'zsh' | 'bash' | 'fish' | 'nushell';

export interface ShellInfo {
  id: string;
  kind: ShellKind;
  label: string;
  path: string;
  args: string[];
  /** For WSL entries. */
  distro?: string;
}

export interface EnvironmentReport {
  platform: 'windows' | 'macos' | 'linux';
  claude: ToolCheck;
  codex?: ToolCheck;
  gemini?: ToolCheck;
  opencode?: ToolCheck;
  git: ToolCheck;
  node: ToolCheck;
  wsl: { available: boolean; distros: string[]; default?: string };
  shells: ShellInfo[];
  /** Font face of the default Windows Terminal profile, when Windows Terminal is installed. */
  terminalFont?: string | null;
  /** Colour scheme of the default Windows Terminal profile. */
  terminalScheme?: string | null;
  /** Installed font families carrying Nerd Font glyphs. */
  nerdFonts?: string[];
  /** OS account name. */
  user?: string | null;
}

export interface ToolCheck {
  found: boolean;
  version?: string;
  path?: string;
}

export interface TerminalTab {
  id: string;
  title: string;
  shellId: string;
  cwd: string;
  ptyId?: string;
  createdAt: number;
  /** Run a program instead of the shell (e.g. Claude Code's interactive TUI). `agent` picks the brand mark. */
  program?: { path: string; args: string[]; label: string; agent?: 'claude' | 'codex' | 'gemini' | 'opencode' };
  /** Project this terminal belongs to, if any. */
  projectId?: string;
  /** The project sub-folder this terminal is listed in. */
  folderId?: string;
}

export interface Note {
  id: string;
  title: string;
  /** Markdown body — or, for a board, the JSON `BoardDoc`. */
  body: string;
  /** 'text' (default) or 'board': a whiteboard with cards and links. */
  kind?: 'text' | 'board';
  tags: string[];
  projectId?: string;
  /** The project sub-folder this note is listed in. */
  folderId?: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------ boards ----------------------------- */

export type BoardColor = 'yellow' | 'blue' | 'green' | 'pink' | 'grey';

export interface BoardCard {
  id: string;
  x: number;
  y: number;
  w: number;
  title: string;
  body: string;
  color: BoardColor;
}

export interface BoardEdge {
  id: string;
  from: string;
  to: string;
}

export interface BoardDoc {
  cards: BoardCard[];
  edges: BoardEdge[];
  /** Positions the user gave to live project nodes (sessions, terminals, notes, files), by entity id. */
  live: Record<string, { x: number; y: number }>;
  view: { x: number; y: number; zoom: number };
  /** Project boards: draw the live nodes. */
  showLive: boolean;
}

/** Workspace pane tree for split views. */
export type PaneContent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'terminal'; terminalId: string }
  | { kind: 'note'; noteId: string }
  | { kind: 'file'; path: string; projectId?: string; line?: number }
  | { kind: 'browser'; browserId: string; url: string; projectId?: string }
  | { kind: 'diff'; path: string; sessionId?: string; root?: string }
  | { kind: 'git'; projectId: string }
  | { kind: 'review'; sessionId: string }
  | { kind: 'arena'; arenaId: string }
  | { kind: 'room'; roomId: string }
  | { kind: 'plugin'; pluginId: string; paneId: string }
  | { kind: 'empty' };

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string | null;
  ahead: number;
  behind: number;
  subject: string;
  date: string;
}

export interface GitFileStatus {
  path: string;
  status: 'M' | 'A' | 'D' | 'U' | 'R' | 'C';
  staged: boolean;
}

export interface GitCommit {
  hash: string;
  subject: string;
  author: string;
  /** Author e-mail, for the avatar. */
  email: string;
  date: string;
}

export interface PaneLeaf {
  type: 'leaf';
  id: string;
  content: PaneContent;
}

export interface PaneSplit {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  /** 0..1 share of the first child. */
  ratio: number;
  children: [PaneNode, PaneNode];
}

export type PaneNode = PaneLeaf | PaneSplit;

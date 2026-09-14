/**
 * Normalised agent event model.
 *
 * The UI never consumes the raw CLI output. Every provider (Claude Code today,
 * Codex / Gemini / OpenCode later) is responsible for translating its own wire
 * format into this schema through an adapter.
 */

export type AgentEventType =
  | 'user_message'
  | 'assistant_message'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'shell_command'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'search'
  | 'permission_request'
  | 'image'
  | 'error'
  | 'completed'
  | 'usage_update'
  | 'status';

interface BaseEvent {
  id: string;
  sessionId: string;
  /** Unix ms. */
  timestamp: number;
  /** Optional parent tool call id (results and nested calls). */
  parentId?: string;
}

export interface UserMessageEvent extends BaseEvent {
  type: 'user_message';
  text: string;
  attachments?: Attachment[];
}

export interface AssistantMessageEvent extends BaseEvent {
  type: 'assistant_message';
  /** Markdown. Grows while streaming. */
  text: string;
  streaming?: boolean;
}

export interface ThinkingEvent extends BaseEvent {
  type: 'thinking';
  text: string;
  streaming?: boolean;
}

export interface ToolCallEvent extends BaseEvent {
  type: 'tool_call';
  toolName: string;
  /** Short human label, e.g. "Read", "Bash". */
  label: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  durationMs?: number;
}

export interface ToolResultEvent extends BaseEvent {
  type: 'tool_result';
  toolCallId: string;
  output: string;
  isError?: boolean;
  durationMs?: number;
}

export interface ShellCommandEvent extends BaseEvent {
  type: 'shell_command';
  command: string;
  cwd?: string;
  status: ToolStatus;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  description?: string;
}

export interface FileReadEvent extends BaseEvent {
  type: 'file_read';
  path: string;
  lines?: number;
}

export interface FileWriteEvent extends BaseEvent {
  type: 'file_write';
  path: string;
  /** 'M' modified, 'A' created */
  kind: 'M' | 'A';
  additions: number;
  deletions: number;
  /** Unified diff, when available. */
  diff?: string;
  before?: string;
  after?: string;
  /** The tool has returned (the file is on disk). */
  done?: boolean;
  failed?: boolean;
}

export interface FileDeleteEvent extends BaseEvent {
  type: 'file_delete';
  path: string;
}

export interface SearchEvent extends BaseEvent {
  type: 'search';
  kind: 'pattern' | 'glob' | 'list';
  query: string;
  path?: string;
  matches?: number;
}

export interface PermissionRequestEvent extends BaseEvent {
  type: 'permission_request';
  toolName: string;
  /** Human readable description of what is about to happen. */
  summary: string;
  /** Raw payload (e.g. the command). */
  detail: string;
  decision?: PermissionDecision;
}

export interface ImageEvent extends BaseEvent {
  type: 'image';
  attachments: Attachment[];
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  message: string;
  detail?: string;
}

export interface CompletedEvent extends BaseEvent {
  type: 'completed';
  durationMs: number;
  /** e.g. "done", "cancelled" */
  reason: 'done' | 'cancelled' | 'error';
}

export interface UsageUpdateEvent extends BaseEvent {
  type: 'usage_update';
  usage: Partial<SessionUsage>;
}

export interface StatusEvent extends BaseEvent {
  type: 'status';
  activity: AgentActivity;
}

export type AgentEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | ShellCommandEvent
  | FileReadEvent
  | FileWriteEvent
  | FileDeleteEvent
  | SearchEvent
  | PermissionRequestEvent
  | ImageEvent
  | ErrorEvent
  | CompletedEvent
  | UsageUpdateEvent
  | StatusEvent;

export type ToolStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export type PermissionDecision = 'allow_once' | 'allow_always' | 'deny';

export type AgentActivity =
  | 'idle'
  | 'thinking'
  | 'searching'
  | 'reading'
  | 'editing'
  | 'running'
  | 'waiting';

export interface Attachment {
  id: string;
  kind: 'image' | 'file' | 'folder';
  name: string;
  /** Local path when available. */
  path?: string;
  /** data: URL or blob URL for previews. */
  url?: string;
  size?: number;
  mime?: string;
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Tokens currently occupying the context window. */
  contextUsed: number;
  contextMax: number;
  costUsd: number;
}

export const EMPTY_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  contextUsed: 0,
  contextMax: 200_000,
  costUsd: 0,
};

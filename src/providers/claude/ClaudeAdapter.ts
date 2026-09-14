import type { AgentEvent, FileWriteEvent, SearchEvent, ShellCommandEvent, ToolCallEvent } from '@/types/agent';
import { useUsage } from '@/stores/usage';
import { useCapabilities } from '@/stores/capabilities';
import type { EventSink } from '../AgentProvider';
import { uid } from '@/lib/id';

/**
 * ClaudeAdapter — translates Claude Code's `stream-json` wire format into
 * normalised AgentEvents. It is deliberately stateful: tool_use ids map to the
 * UI events they produced, and partial deltas are stitched onto them.
 *
 * Wire format (claude -p --output-format stream-json --verbose --include-partial-messages):
 *   { type: "system", subtype: "init", session_id, model, cwd, tools }
 *   { type: "stream_event", event: <Anthropic SSE event> }
 *   { type: "assistant", message: { content: [text | tool_use] , usage } }
 *   { type: "user", message: { content: [tool_result] }, tool_use_result? }
 *   { type: "result", subtype, duration_ms, total_cost_usd, usage, is_error }
 *   { type: "control_request", request_id, request: { subtype: "can_use_tool", tool_name, input } }
 */

export interface ClaudeControlRequest {
  request_id: string;
  request: { subtype: string; tool_name?: string; input?: Record<string, unknown>; tool_use_id?: string; [k: string]: unknown };
}

interface ToolState {
  eventId: string;
  name: string;
  inputJson: string;
  startedAt: number;
}

export class ClaudeAdapter {
  private tools = new Map<string, ToolState>(); // tool_use_id → state
  private streamingTextId: string | null = null;
  private streamingThinkingId: string | null = null;
  private blockIndexToToolUse = new Map<number, string>();
  private blockIndexKind = new Map<number, 'text' | 'thinking' | 'tool_use'>();
  private turnStartedAt = 0;
  private contextMax: number;
  private seenTextIds = new Set<string>();

  constructor(
    private sessionId: string,
    private sink: EventSink,
    opts: { contextMax?: number } = {},
  ) {
    this.contextMax = opts.contextMax ?? 200_000;
  }

  startTurn() {
    this.turnStartedAt = Date.now();
    this.streamingTextId = null;
    this.streamingThinkingId = null;
    this.blockIndexToToolUse.clear();
    this.blockIndexKind.clear();
    this.sink.status('running', 'thinking');
  }

  /** Feed one stdout line. Returns a control request when the CLI is asking for a permission decision. */
  handleLine(line: string): ClaudeControlRequest | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return null;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return null;
    }
    switch (msg.type) {
      case 'system':
        return this.onSystem(msg);
      case 'stream_event':
        this.onStreamEvent(msg.event as Record<string, unknown>);
        return null;
      case 'assistant':
        this.onAssistant(msg);
        return null;
      case 'user':
        this.onUser(msg);
        return null;
      case 'result':
        this.onResult(msg);
        return null;
      case 'control_request':
        return msg as unknown as ClaudeControlRequest;
      case 'rate_limit_event': {
        // Plan limits as the CLI sees them: { rate_limit_info: { status, resetsAt, rateLimitType, utilization, … } }
        const info = (msg.rate_limit_info ?? msg.rateLimitInfo ?? msg) as Record<string, unknown>;
        useUsage.getState().report(info);
        return null;
      }
      default:
        return null;
    }
  }

  private base() {
    return { id: uid('ev'), sessionId: this.sessionId, timestamp: Date.now() };
  }

  private onSystem(msg: Record<string, unknown>) {
    if (msg.subtype === 'init' && typeof msg.session_id === 'string') {
      this.sink.providerSession(msg.session_id);
      // Tools, MCP servers, slash commands, agents… feed the composer menu and the capabilities panel.
      useCapabilities.getState().setInit(this.sessionId, msg);
    }
    return null;
  }

  /* ----------------------------- streaming ----------------------------- */

  private onStreamEvent(ev: Record<string, unknown>) {
    const type = ev.type as string;
    if (type === 'content_block_start') {
      const index = ev.index as number;
      const block = ev.content_block as Record<string, unknown>;
      if (block.type === 'text') {
        this.blockIndexKind.set(index, 'text');
        const e = { ...this.base(), type: 'assistant_message' as const, text: '', streaming: true };
        this.streamingTextId = e.id;
        this.seenTextIds.add(e.id);
        this.sink.emit(e);
        this.sink.status('running', 'thinking');
      } else if (block.type === 'thinking') {
        this.blockIndexKind.set(index, 'thinking');
        const e = { ...this.base(), type: 'thinking' as const, text: '', streaming: true };
        this.streamingThinkingId = e.id;
        this.sink.emit(e);
      } else if (block.type === 'tool_use') {
        this.blockIndexKind.set(index, 'tool_use');
        const toolUseId = block.id as string;
        const name = block.name as string;
        this.blockIndexToToolUse.set(index, toolUseId);
        this.beginTool(toolUseId, name, {});
      }
    } else if (type === 'content_block_delta') {
      const index = ev.index as number;
      const delta = ev.delta as Record<string, unknown>;
      const kind = this.blockIndexKind.get(index);
      if (delta.type === 'text_delta' && kind === 'text' && this.streamingTextId) {
        this.sink.delta(this.streamingTextId, delta.text as string);
      } else if (delta.type === 'thinking_delta' && kind === 'thinking' && this.streamingThinkingId) {
        this.sink.delta(this.streamingThinkingId, delta.thinking as string);
      } else if (delta.type === 'input_json_delta' && kind === 'tool_use') {
        const toolUseId = this.blockIndexToToolUse.get(index);
        const st = toolUseId ? this.tools.get(toolUseId) : undefined;
        if (st) st.inputJson += delta.partial_json as string;
      }
    } else if (type === 'content_block_stop') {
      const index = ev.index as number;
      const kind = this.blockIndexKind.get(index);
      if (kind === 'text' && this.streamingTextId) {
        this.sink.patch(this.streamingTextId, { streaming: false });
        this.streamingTextId = null;
      } else if (kind === 'thinking' && this.streamingThinkingId) {
        this.sink.patch(this.streamingThinkingId, { streaming: false });
        this.streamingThinkingId = null;
      } else if (kind === 'tool_use') {
        const toolUseId = this.blockIndexToToolUse.get(index);
        const st = toolUseId ? this.tools.get(toolUseId) : undefined;
        if (st && st.inputJson) {
          try {
            this.applyToolInput(st, JSON.parse(st.inputJson));
          } catch {
            /* partial */
          }
        }
      }
    } else if (type === 'message_delta') {
      const usage = ev.usage as Record<string, number> | undefined;
      if (usage) this.applyUsage(usage);
    }
  }

  /* --------------------------- full messages --------------------------- */

  private onAssistant(msg: Record<string, unknown>) {
    const message = msg.message as Record<string, unknown>;
    const content = (message.content ?? []) as Array<Record<string, unknown>>;
    for (const block of content) {
      if (block.type === 'text') {
        // When partial messages are on, the text was already streamed.
        if (!this.streamingTextId && !this.seenTextIds.size) {
          this.sink.emit({ ...this.base(), type: 'assistant_message', text: block.text as string });
        }
      } else if (block.type === 'tool_use') {
        const id = block.id as string;
        const st = this.tools.get(id);
        const input = (block.input ?? {}) as Record<string, unknown>;
        if (!st) this.beginTool(id, block.name as string, input);
        else this.applyToolInput(st, input);
      }
    }
    this.seenTextIds.clear();
    const usage = message.usage as Record<string, number> | undefined;
    if (usage) this.applyUsage(usage);
  }

  private onUser(msg: Record<string, unknown>) {
    const message = msg.message as Record<string, unknown>;
    const content = message.content;
    if (!Array.isArray(content)) return;
    const extra = msg.tool_use_result as Record<string, unknown> | undefined;
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type !== 'tool_result') continue;
      const toolUseId = block.tool_use_id as string;
      const st = this.tools.get(toolUseId);
      const output = flattenContent(block.content);
      const isError = Boolean(block.is_error);
      const durationMs = st ? Date.now() - st.startedAt : undefined;
      if (st) {
        this.finishTool(st, output, isError, durationMs, extra);
        this.tools.delete(toolUseId);
      }
      this.sink.emit({ ...this.base(), type: 'tool_result', toolCallId: st?.eventId ?? toolUseId, output, isError, durationMs, parentId: st?.eventId });
    }
  }

  private onResult(msg: Record<string, unknown>) {
    const usage = msg.usage as Record<string, number> | undefined;
    // The result usage is the turn's total across every API call — good for cost and token counts,
    // not for the context window (that is the last call's size, already recorded from the assistant message).
    if (usage) this.applyUsage(usage, msg.total_cost_usd as number | undefined, false);
    const isError = Boolean(msg.is_error);
    if (isError) {
      this.sink.emit({ ...this.base(), type: 'error', message: String(msg.subtype ?? 'error'), detail: typeof msg.result === 'string' ? msg.result : undefined });
    }
    this.sink.emit({
      ...this.base(),
      type: 'completed',
      durationMs: (msg.duration_ms as number) ?? Date.now() - this.turnStartedAt,
      reason: isError ? 'error' : 'done',
    });
    this.sink.status(isError ? 'error' : 'completed', 'idle');
  }

  /* ------------------------------ tools -------------------------------- */

  private beginTool(toolUseId: string, name: string, input: Record<string, unknown>) {
    const st: ToolState = { eventId: uid('ev'), name, inputJson: '', startedAt: Date.now() };
    this.tools.set(toolUseId, st);
    const base = { ...this.base(), id: st.eventId };
    switch (name) {
      case 'Bash': {
        const e: ShellCommandEvent = { ...base, type: 'shell_command', command: String(input.command ?? ''), description: input.description as string | undefined, status: 'running' };
        this.sink.emit(e);
        this.sink.status('running', 'running');
        return;
      }
      case 'Read':
        this.sink.emit({ ...base, type: 'file_read', path: String(input.file_path ?? '') });
        this.sink.status('running', 'reading');
        return;
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
      case 'NotebookEdit': {
        const e: FileWriteEvent = { ...base, type: 'file_write', path: String(input.file_path ?? input.notebook_path ?? ''), kind: name === 'Write' ? 'A' : 'M', additions: 0, deletions: 0 };
        this.sink.emit(e);
        this.sink.status('running', 'editing');
        return;
      }
      case 'Glob':
      case 'Grep':
      case 'LS': {
        const e: SearchEvent = {
          ...base,
          type: 'search',
          kind: name === 'Grep' ? 'pattern' : name === 'Glob' ? 'glob' : 'list',
          query: String(input.pattern ?? input.path ?? ''),
          path: input.path as string | undefined,
        };
        this.sink.emit(e);
        this.sink.status('running', 'searching');
        return;
      }
      default: {
        const e: ToolCallEvent = { ...base, type: 'tool_call', toolName: name, label: name, input, status: 'running' };
        this.sink.emit(e);
        this.sink.status('running', 'running');
      }
    }
  }

  private applyToolInput(st: ToolState, input: Record<string, unknown>) {
    switch (st.name) {
      case 'Bash':
        this.sink.patch<ShellCommandEvent>(st.eventId, { command: String(input.command ?? ''), description: input.description as string | undefined });
        break;
      case 'Read':
        this.sink.patch(st.eventId, { path: String(input.file_path ?? '') } as Partial<AgentEvent>);
        break;
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
      case 'NotebookEdit':
        this.sink.patch<FileWriteEvent>(st.eventId, {
          path: String(input.file_path ?? input.notebook_path ?? ''),
          before: typeof input.old_string === 'string' ? input.old_string : undefined,
          after: typeof input.new_string === 'string' ? input.new_string : typeof input.content === 'string' ? input.content : undefined,
        });
        break;
      case 'Glob':
      case 'Grep':
      case 'LS':
        this.sink.patch<SearchEvent>(st.eventId, { query: String(input.pattern ?? input.path ?? ''), path: input.path as string | undefined });
        break;
      default:
        this.sink.patch<ToolCallEvent>(st.eventId, { input });
    }
  }

  private finishTool(st: ToolState, output: string, isError: boolean, durationMs: number | undefined, extra?: Record<string, unknown>) {
    const status = isError ? 'error' : 'success';
    switch (st.name) {
      case 'Bash': {
        const stdout = typeof extra?.stdout === 'string' ? extra.stdout : output;
        const stderr = typeof extra?.stderr === 'string' ? extra.stderr : '';
        this.sink.patch<ShellCommandEvent>(st.eventId, {
          status: extra?.interrupted ? 'cancelled' : status,
          output: [stdout, stderr].filter(Boolean).join('\n'),
          exitCode: isError ? 1 : 0,
          durationMs,
        });
        break;
      }
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
      case 'NotebookEdit': {
        const { additions, deletions, diff } = countPatch(extra);
        this.sink.patch<FileWriteEvent>(st.eventId, { additions, deletions, diff, done: true, failed: isError });
        break;
      }
      case 'Read':
        this.sink.patch(st.eventId, { lines: output ? output.split('\n').length : undefined } as Partial<AgentEvent>);
        break;
      case 'Glob':
      case 'Grep':
      case 'LS': {
        const n = typeof extra?.numFiles === 'number' ? extra.numFiles : output ? output.split('\n').filter(Boolean).length : 0;
        this.sink.patch<SearchEvent>(st.eventId, { matches: n });
        break;
      }
      default:
        this.sink.patch<ToolCallEvent>(st.eventId, { status, durationMs });
    }
  }

  /* ------------------------------ usage -------------------------------- */

  private applyUsage(usage: Record<string, number>, costUsd?: number, context = true) {
    const input = usage.input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    // Context = everything the model saw on the last call.
    const contextUsed = input + cacheRead + cacheWrite + output;
    this.sink.usage({
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      ...(context && contextUsed > 0 ? { contextUsed } : {}),
      contextMax: this.contextMax,
      ...(costUsd !== undefined ? { costUsd } : {}),
    });
  }
}

function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
      .join('\n');
  }
  return '';
}

function countPatch(extra?: Record<string, unknown>): { additions: number; deletions: number; diff?: string } {
  const patch = extra?.structuredPatch as Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }> | undefined;
  if (!patch) return { additions: 0, deletions: 0 };
  let additions = 0;
  let deletions = 0;
  const parts: string[] = [];
  for (const h of patch) {
    parts.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    for (const l of h.lines) {
      if (l.startsWith('+')) additions++;
      else if (l.startsWith('-')) deletions++;
      parts.push(l);
    }
  }
  return { additions, deletions, diff: parts.join('\n') };
}

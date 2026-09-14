import type {
  AgentEvent,
  AssistantMessageEvent,
  CompletedEvent,
  ErrorEvent,
  FileDeleteEvent,
  FileReadEvent,
  FileWriteEvent,
  ImageEvent,
  PermissionRequestEvent,
  SearchEvent,
  ShellCommandEvent,
  ThinkingEvent,
  ToolCallEvent,
  UserMessageEvent,
} from '@/types/agent';
import { pluralize } from '@/lib/format';

/**
 * Blocks are what the session view renders. Consecutive tool events collapse
 * into a single ToolGroup with a natural-language summary; file writes are
 * lifted into their own FileChanges block so they read as a change list.
 */

export type ToolEvent = SearchEvent | FileReadEvent | ShellCommandEvent | ToolCallEvent;

export type Block =
  | { kind: 'user'; id: string; event: UserMessageEvent }
  | { kind: 'assistant'; id: string; event: AssistantMessageEvent }
  | { kind: 'thinking'; id: string; event: ThinkingEvent }
  | { kind: 'tools'; id: string; events: ToolEvent[]; summary: string; running: boolean }
  | { kind: 'files'; id: string; events: Array<FileWriteEvent | FileDeleteEvent> }
  | { kind: 'permission'; id: string; event: PermissionRequestEvent }
  | { kind: 'image'; id: string; event: ImageEvent }
  | { kind: 'error'; id: string; event: ErrorEvent }
  | { kind: 'completed'; id: string; event: CompletedEvent };

const TOOL_TYPES = new Set(['search', 'file_read', 'shell_command', 'tool_call']);
const FILE_TYPES = new Set(['file_write', 'file_delete']);

export function deriveBlocks(events: AgentEvent[]): Block[] {
  const out: Block[] = [];
  let tools: ToolEvent[] | null = null;
  let files: Array<FileWriteEvent | FileDeleteEvent> | null = null;

  const flush = () => {
    if (tools && tools.length) {
      out.push({ kind: 'tools', id: `tg_${tools[0].id}`, events: tools, summary: summarize(tools), running: tools.some(isRunning) });
    }
    tools = null;
    if (files && files.length) {
      out.push({ kind: 'files', id: `fg_${files[0].id}`, events: files });
    }
    files = null;
  };

  for (const ev of events) {
    if (TOOL_TYPES.has(ev.type)) {
      if (files) {
        // keep order: files then tools
        out.push({ kind: 'files', id: `fg_${files[0].id}`, events: files });
        files = null;
      }
      (tools ??= []).push(ev as ToolEvent);
      continue;
    }
    if (FILE_TYPES.has(ev.type)) {
      if (tools) {
        out.push({ kind: 'tools', id: `tg_${tools[0].id}`, events: tools, summary: summarize(tools), running: tools.some(isRunning) });
        tools = null;
      }
      (files ??= []).push(ev as FileWriteEvent | FileDeleteEvent);
      continue;
    }
    // status / usage / tool_result are not rendered on their own
    if (ev.type === 'status' || ev.type === 'usage_update' || ev.type === 'tool_result') continue;
    flush();
    switch (ev.type) {
      case 'user_message':
        out.push({ kind: 'user', id: ev.id, event: ev });
        break;
      case 'assistant_message':
        out.push({ kind: 'assistant', id: ev.id, event: ev });
        break;
      case 'thinking':
        out.push({ kind: 'thinking', id: ev.id, event: ev });
        break;
      case 'permission_request':
        out.push({ kind: 'permission', id: ev.id, event: ev });
        break;
      case 'image':
        out.push({ kind: 'image', id: ev.id, event: ev });
        break;
      case 'error':
        out.push({ kind: 'error', id: ev.id, event: ev });
        break;
      case 'completed':
        out.push({ kind: 'completed', id: ev.id, event: ev });
        break;
    }
  }
  flush();
  return out;
}

function isRunning(e: ToolEvent): boolean {
  return (e.type === 'shell_command' || e.type === 'tool_call') && (e.status === 'running' || e.status === 'pending');
}

/** "Searched for 10 patterns, listed 4 directories, ran 6 shell commands, read 3 files" */
export function summarize(events: ToolEvent[]): string {
  let patterns = 0;
  let globs = 0;
  let lists = 0;
  let commands = 0;
  let reads = 0;
  const other = new Map<string, number>();
  for (const e of events) {
    switch (e.type) {
      case 'search':
        if (e.kind === 'pattern') patterns++;
        else if (e.kind === 'glob') globs++;
        else lists++;
        break;
      case 'shell_command':
        commands++;
        break;
      case 'file_read':
        reads++;
        break;
      case 'tool_call':
        other.set(e.label, (other.get(e.label) ?? 0) + 1);
        break;
    }
  }
  const parts: string[] = [];
  const searched = patterns + globs;
  if (searched) parts.push(`Searched for ${pluralize(searched, 'pattern')}`);
  if (lists) parts.push(`listed ${pluralize(lists, 'directory', 'directories')}`);
  if (commands) parts.push(`ran ${pluralize(commands, 'shell command')}`);
  if (reads) parts.push(`read ${pluralize(reads, 'file')}`);
  for (const [label, n] of other) parts.push(`used ${label}${n > 1 ? ` ×${n}` : ''}`);
  if (parts.length === 0) return 'Worked';
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ToolGroupSections {
  search: SearchEvent[];
  commands: ShellCommandEvent[];
  reads: FileReadEvent[];
  other: ToolCallEvent[];
}

export function sectionize(events: ToolEvent[]): ToolGroupSections {
  const s: ToolGroupSections = { search: [], commands: [], reads: [], other: [] };
  for (const e of events) {
    if (e.type === 'search') s.search.push(e);
    else if (e.type === 'shell_command') s.commands.push(e);
    else if (e.type === 'file_read') s.reads.push(e);
    else s.other.push(e);
  }
  return s;
}

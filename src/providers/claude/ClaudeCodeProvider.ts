import type { AgentProvider, EventSink, ProviderCapabilities, SessionContext } from '../AgentProvider';
import type { Attachment, PermissionDecision, SessionUsage } from '@/types/agent';
import { ClaudeAdapter, type ClaudeControlRequest } from './ClaudeAdapter';
import { onProcessExit, onProcessLine, processKill, processSpawn, processWrite } from '@/native/process';
import { toWslPath } from '@/native/system';
import { uid } from '@/lib/id';

/**
 * ClaudeCodeProvider — runs the real `claude` binary as a child process in
 * bidirectional stream-json mode:
 *
 *   claude -p --output-format stream-json --input-format stream-json --verbose
 *          --include-partial-messages --permission-prompt-tool stdio
 *          [--model X] [--permission-mode Y] [--resume <id>]
 *          [--append-system-prompt <persona>] [--mcp-config <json> --strict-mcp-config]
 *
 * Each user turn is written to stdin as a JSON user message. Permission
 * prompts arrive as `control_request` lines and are answered on stdin with
 * `control_response`. The process is kept alive across turns so the session
 * stays warm; `--resume` restores it after an app restart.
 */

interface Running {
  processId: string;
  adapter: ClaudeAdapter;
  sink: EventSink;
  ctx: SessionContext;
  usage: Partial<SessionUsage>;
  pendingPermissions: Map<string, { eventId: string; request: ClaudeControlRequest }>;
  alwaysAllow: Set<string>;
  unsubscribe: () => void;
}

export class ClaudeCodeProvider implements AgentProvider {
  readonly id = 'claude-code' as const;
  readonly label = 'Claude Code';
  private running = new Map<string, Running>();

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: true,
      images: true,
      permissions: true,
      resume: true,
      models: [
        { id: 'opus', label: 'Opus 5', context: 1_000_000 },
        { id: 'sonnet', label: 'Sonnet 5', context: 1_000_000 },
        { id: 'haiku', label: 'Haiku 4.5', context: 200_000 },
      ],
      slashCommands: ['/clear', '/compact', '/cost', '/help', '/init', '/model', '/review', '/status'],
    };
  }

  async startSession(ctx: SessionContext, sink: EventSink, resumeId?: string): Promise<void> {
    const sessionId = ctx.session.id;
    if (this.running.has(sessionId)) return;

    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
      '--model',
      ctx.model,
    ];
    const opts = ctx.session.options ?? {};
    const permissionMode = opts.permissionMode ?? ctx.permissionMode;
    if (permissionMode !== 'default') args.push('--permission-mode', permissionMode);
    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.autocompact) args.push('--autocompact', opts.autocompact);
    if (opts.agent) args.push('--agent', opts.agent);
    if (opts.fallbackModel) args.push('--fallback-model', opts.fallbackModel);
    if (opts.addDirs?.length) args.push('--add-dir', ...opts.addDirs);
    if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt);
    // A custom agent's servers, inline: `--mcp-config` takes JSON strings as well as files.
    if (opts.mcpServers) args.push('--mcp-config', JSON.stringify({ mcpServers: opts.mcpServers }), '--strict-mcp-config');
    if (opts.allowedTools?.length) args.push('--allowedTools', ...opts.allowedTools);
    if (opts.disallowedTools?.length) args.push('--disallowedTools', ...opts.disallowedTools);
    const providerSessionId = resumeId ?? ctx.session.providerSessionId;
    if (providerSessionId) args.push('--resume', providerSessionId);

    let program = ctx.binaryPath || 'claude';
    // A session in a worktree works there: its own checkout, its own branch.
    const root = ctx.session.worktree?.path ?? ctx.project.path;
    let cwd = root;
    let finalArgs = args;
    if (ctx.project.runtime === 'wsl') {
      // Run inside the distro with the project mounted under /mnt.
      program = 'wsl.exe';
      finalArgs = ['-d', ctx.project.wslDistro ?? 'Ubuntu', '--cd', toWslPath(root), '--', 'claude', ...args];
      cwd = root;
    }

    const adapter = new ClaudeAdapter(sessionId, sink, { contextMax: ctx.session.usage.contextMax });
    const processId = await processSpawn({ program, args: finalArgs, cwd, env: { ...ctx.env, CLAUDE_CODE_ENTRYPOINT: 'zpace' } });

    const run: Running = {
      processId,
      adapter,
      sink,
      ctx,
      usage: {},
      pendingPermissions: new Map(),
      alwaysAllow: new Set(),
      unsubscribe: () => void 0,
    };

    const offLine = onProcessLine(processId, (p) => {
      if (p.stream === 'stderr') {
        if (p.line.trim()) sink.emit({ id: uid('ev'), sessionId, timestamp: Date.now(), type: 'error', message: p.line.trim() });
        return;
      }
      const control = adapter.handleLine(p.line);
      if (control) void this.handleControl(run, control);
    });
    const offExit = onProcessExit(processId, (code) => {
      this.running.delete(sessionId);
      sink.status(code === 0 || code === null ? 'idle' : 'error', 'idle');
      if (code && code !== 0) {
        sink.emit({ id: uid('ev'), sessionId, timestamp: Date.now(), type: 'error', message: `Claude Code exited with code ${code}` });
      }
    });
    run.unsubscribe = () => {
      offLine();
      offExit();
    };
    this.running.set(sessionId, run);
  }

  async sendMessage(sessionId: string, text: string, attachments: Attachment[] = []): Promise<void> {
    const run = this.running.get(sessionId);
    if (!run) throw new Error('Session is not running');
    run.adapter.startTurn();
    const content: Array<Record<string, unknown>> = [];
    for (const a of attachments) {
      if (a.kind === 'image' && a.url?.startsWith('data:')) {
        const [meta, data] = a.url.split(',');
        const mime = /data:(.*?);/.exec(meta)?.[1] ?? 'image/png';
        content.push({ type: 'image', source: { type: 'base64', media_type: mime, data } });
      } else if (a.path) {
        text += `\n\n@${a.path}`;
      }
    }
    content.push({ type: 'text', text });
    const msg = { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: run.ctx.session.providerSessionId ?? '' };
    await processWrite(run.processId, JSON.stringify(msg) + '\n');
  }

  async cancel(sessionId: string): Promise<void> {
    const run = this.running.get(sessionId);
    if (!run) return;
    const msg = { type: 'control_request', request_id: uid('req'), request: { subtype: 'interrupt' } };
    await processWrite(run.processId, JSON.stringify(msg) + '\n');
    run.sink.status('idle', 'idle');
  }

  async resume(sessionId: string, providerSessionId: string): Promise<void> {
    const run = this.running.get(sessionId);
    if (run) {
      await this.dispose(sessionId);
      await this.startSession({ ...run.ctx, session: { ...run.ctx.session, providerSessionId } }, run.sink, providerSessionId);
    }
  }

  async respondPermission(sessionId: string, requestId: string, decision: PermissionDecision): Promise<void> {
    const run = this.running.get(sessionId);
    if (!run) return;
    const pending = run.pendingPermissions.get(requestId);
    if (!pending) return;
    run.pendingPermissions.delete(requestId);
    const toolName = pending.request.request.tool_name ?? '';
    if (decision === 'allow_always') run.alwaysAllow.add(toolName);
    const response =
      decision === 'deny'
        ? { behavior: 'deny', message: 'The user denied this action.' }
        : { behavior: 'allow', updatedInput: pending.request.request.input ?? {} };
    const msg = { type: 'control_response', response: { subtype: 'success', request_id: requestId, response } };
    await processWrite(run.processId, JSON.stringify(msg) + '\n');
    run.sink.patch(pending.eventId, { decision } as never);
    run.sink.status('running', 'running');
  }

  getUsage(sessionId: string): SessionUsage | undefined {
    const run = this.running.get(sessionId);
    return run ? (run.usage as SessionUsage) : undefined;
  }

  async dispose(sessionId: string): Promise<void> {
    const run = this.running.get(sessionId);
    if (!run) return;
    run.unsubscribe();
    this.running.delete(sessionId);
    try {
      await processKill(run.processId);
    } catch {
      /* already gone */
    }
  }

  private async handleControl(run: Running, control: ClaudeControlRequest) {
    const { request_id, request } = control;
    if (request.subtype !== 'can_use_tool') {
      // Unknown control requests are acknowledged so the CLI does not stall.
      const ack = { type: 'control_response', response: { subtype: 'success', request_id, response: {} } };
      await processWrite(run.processId, JSON.stringify(ack) + '\n');
      return;
    }
    const toolName = request.tool_name ?? 'tool';
    if (run.alwaysAllow.has(toolName)) {
      const msg = { type: 'control_response', response: { subtype: 'success', request_id, response: { behavior: 'allow', updatedInput: request.input ?? {} } } };
      await processWrite(run.processId, JSON.stringify(msg) + '\n');
      return;
    }
    const eventId = uid('ev');
    run.pendingPermissions.set(request_id, { eventId, request: control });
    run.sink.emit({
      id: eventId,
      sessionId: run.ctx.session.id,
      timestamp: Date.now(),
      type: 'permission_request',
      toolName,
      summary: describePermission(toolName, request.input ?? {}),
      detail: detailPermission(toolName, request.input ?? {}),
      parentId: request_id,
    });
    run.sink.status('waiting', 'waiting');
  }
}

function describePermission(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Bash':
      return 'Claude wants to run a shell command';
    case 'Edit':
    case 'MultiEdit':
      return `Claude wants to edit ${String(input.file_path ?? 'a file')}`;
    case 'Write':
      return `Claude wants to write ${String(input.file_path ?? 'a file')}`;
    case 'WebFetch':
      return `Claude wants to fetch ${String(input.url ?? 'a URL')}`;
    default:
      return `Claude wants to use ${tool}`;
  }
}

function detailPermission(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Bash') return String(input.command ?? '');
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.url === 'string') return input.url;
  return JSON.stringify(input, null, 2);
}

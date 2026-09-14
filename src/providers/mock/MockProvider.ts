import type { AgentProvider, EventSink, ProviderCapabilities, SessionContext } from '../AgentProvider';
import type { Attachment, PermissionDecision, SessionUsage } from '@/types/agent';
import { uid } from '@/lib/id';

/**
 * MockProvider — a scripted agent used in the browser preview (no Tauri) and
 * when Claude Code is not installed. It streams text token by token, emits a
 * tool group, a permission request and a completion so every block, state and
 * animation in the session view can be exercised without a real CLI.
 */
export class MockProvider implements AgentProvider {
  readonly id = 'claude-code' as const;
  readonly label = 'Claude Code (preview)';
  private sinks = new Map<string, EventSink>();
  private timers = new Map<string, number[]>();
  private pending = new Map<string, string>(); // requestId → eventId

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: true,
      images: true,
      permissions: true,
      resume: false,
      models: [
        { id: 'opus', label: 'Opus 5', context: 1_000_000 },
        { id: 'sonnet', label: 'Sonnet 5', context: 1_000_000 },
      ],
      slashCommands: ['/clear', '/compact', '/cost', '/help', '/model'],
    };
  }

  async startSession(ctx: SessionContext, sink: EventSink): Promise<void> {
    this.sinks.set(ctx.session.id, sink);
  }

  async sendMessage(sessionId: string, text: string, _attachments?: Attachment[]): Promise<void> {
    const sink = this.sinks.get(sessionId);
    if (!sink) throw new Error('Session is not running');
    const timers: number[] = [];
    this.timers.set(sessionId, timers);
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const base = () => ({ id: uid('ev'), sessionId, timestamp: Date.now() });
    const started = Date.now();
    let t = 300;

    sink.status('running', 'thinking');

    // 1. searching
    at((t += 400), () => sink.status('running', 'searching'));
    const searches = ['useSession', 'composer', 'StatusBar'];
    searches.forEach((q, i) => at((t += 260 + i * 40), () => sink.emit({ ...base(), type: 'search', kind: 'pattern', query: q, matches: 3 + i })));
    at((t += 220), () => sink.emit({ ...base(), type: 'search', kind: 'list', query: 'src/features', matches: 9 }));
    at((t += 260), () => sink.status('running', 'reading'));
    at((t += 200), () => sink.emit({ ...base(), type: 'file_read', path: 'src/features/agent/SessionView.tsx', lines: 210 }));

    // 2. a shell command that takes a moment
    let cmdId = '';
    at((t += 320), () => {
      cmdId = uid('ev');
      sink.status('running', 'running');
      sink.emit({ ...base(), id: cmdId, type: 'shell_command', command: 'npm run typecheck', status: 'running' });
    });
    at((t += 1400), () => sink.patch(cmdId, { status: 'success', exitCode: 0, durationMs: 1380, output: '> tsc -b --noEmit\n' } as never));

    // 3. streamed answer
    let msgId = '';
    const answer = `Entendido — "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}".\n\nRevisé el composer y el status bar. El cambio es pequeño: muevo la lógica de envío a un hook y dejo el componente sólo con presentación.`;
    at((t += 300), () => {
      msgId = uid('ev');
      sink.status('running', 'thinking');
      sink.emit({ ...base(), id: msgId, type: 'assistant_message', text: '', streaming: true });
    });
    const words = answer.split(/(\s+)/);
    words.forEach((w) => at((t += 18 + Math.random() * 30), () => sink.delta(msgId, w)));
    at((t += 100), () => sink.patch(msgId, { streaming: false } as never));

    // 4. edit
    at((t += 300), () => sink.status('running', 'editing'));
    at((t += 400), () =>
      sink.emit({
        ...base(),
        type: 'file_write',
        path: 'src/features/agent/Composer.tsx',
        kind: 'M',
        additions: 18,
        deletions: 7,
        before: 'const send = () => {\n  onSend(value)\n  setValue("")\n}',
        after: 'const { send } = useComposer({ onSend })',
      }),
    );

    // 5. permission
    at((t += 500), () => {
      const reqId = uid('req');
      const evId = uid('ev');
      this.pending.set(reqId, evId);
      sink.emit({ ...base(), id: evId, type: 'permission_request', toolName: 'Bash', summary: 'Claude wants to run a shell command', detail: 'rm -rf dist/', parentId: reqId });
      sink.status('waiting', 'waiting');
      sink.usage({ inputTokens: 12_400, outputTokens: 2_100, contextUsed: 24_800, costUsd: 0.31 });
    });

    // The rest continues after respondPermission().
    this.pendingContinue.set(sessionId, () => {
      const t2: number[] = [];
      this.timers.set(sessionId, t2);
      let u = 200;
      t2.push(
        window.setTimeout(() => {
          sink.status('running', 'running');
        }, u),
      );
      t2.push(
        window.setTimeout(() => {
          sink.emit({ ...base(), type: 'shell_command', command: 'npm run build', status: 'success', exitCode: 0, durationMs: 4200, output: 'vite v8.3.0 building for production...\n✓ 214 modules transformed.\ndist/index.html  0.62 kB\n✓ built in 4.11s' });
        }, (u += 600)),
      );
      t2.push(
        window.setTimeout(() => {
          const id = uid('ev');
          sink.emit({ ...base(), id, type: 'assistant_message', text: 'Listo. Build limpio y sin cambios de comportamiento.' });
          sink.usage({ inputTokens: 18_900, outputTokens: 3_400, contextUsed: 41_200, costUsd: 0.52 });
          sink.emit({ ...base(), type: 'completed', durationMs: Date.now() - started, reason: 'done' });
          sink.status('completed', 'idle');
        }, u + 900),
      );
    });
  }

  private pendingContinue = new Map<string, () => void>();

  async cancel(sessionId: string): Promise<void> {
    for (const id of this.timers.get(sessionId) ?? []) clearTimeout(id);
    this.timers.delete(sessionId);
    const sink = this.sinks.get(sessionId);
    sink?.emit({ id: uid('ev'), sessionId, timestamp: Date.now(), type: 'completed', durationMs: 0, reason: 'cancelled' });
    sink?.status('idle', 'idle');
  }

  async resume(): Promise<void> {
    /* not supported in preview */
  }

  async respondPermission(sessionId: string, requestId: string, decision: PermissionDecision): Promise<void> {
    const sink = this.sinks.get(sessionId);
    const eventId = this.pending.get(requestId);
    if (!sink || !eventId) return;
    this.pending.delete(requestId);
    sink.patch(eventId, { decision } as never);
    if (decision === 'deny') {
      sink.emit({ id: uid('ev'), sessionId, timestamp: Date.now(), type: 'assistant_message', text: 'Entendido, no borro `dist/`. Dejo el build anterior en su lugar.' });
      sink.emit({ id: uid('ev'), sessionId, timestamp: Date.now(), type: 'completed', durationMs: 0, reason: 'done' });
      sink.status('completed', 'idle');
      return;
    }
    this.pendingContinue.get(sessionId)?.();
    this.pendingContinue.delete(sessionId);
  }

  getUsage(): SessionUsage | undefined {
    return undefined;
  }

  async dispose(sessionId: string): Promise<void> {
    await this.cancel(sessionId);
    this.sinks.delete(sessionId);
  }
}

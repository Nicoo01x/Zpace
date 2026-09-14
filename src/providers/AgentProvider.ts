import type { AgentEvent, Attachment, PermissionDecision, SessionUsage } from '@/types/agent';
import type { Project, ProviderId, Session } from '@/types/workspace';

/**
 * A provider drives one CLI agent (Claude Code, Codex, Gemini, OpenCode…)
 * for one session. It owns the child process and emits normalised events.
 */
export interface AgentProvider {
  readonly id: ProviderId;
  readonly label: string;

  getCapabilities(): ProviderCapabilities;

  /** Start (or resume) the underlying process for a session. */
  startSession(ctx: SessionContext, sink: EventSink): Promise<void>;

  /** Send a user turn. Attachments are provider-dependent (images for Claude). */
  sendMessage(sessionId: string, text: string, attachments?: Attachment[]): Promise<void>;

  /** Cancel the current turn (SIGINT-like). */
  cancel(sessionId: string): Promise<void>;

  /** Resume a previously persisted provider session. */
  resume(sessionId: string, providerSessionId: string): Promise<void>;

  /** Respond to a pending permission request. */
  respondPermission(sessionId: string, requestId: string, decision: PermissionDecision): Promise<void>;

  getUsage(sessionId: string): SessionUsage | undefined;

  /** Tear down the process, keep nothing running. */
  dispose(sessionId: string): Promise<void>;
}

export interface ProviderCapabilities {
  streaming: boolean;
  images: boolean;
  permissions: boolean;
  resume: boolean;
  models: Array<{ id: string; label: string; context: number }>;
  slashCommands: string[];
}

export interface SessionContext {
  session: Session;
  project: Project;
  model: string;
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  binaryPath: string;
  env: Record<string, string>;
}

export interface EventSink {
  emit: (event: AgentEvent) => void;
  /** Stream a text delta into an existing event. */
  delta: (eventId: string, text: string) => void;
  patch: <T extends AgentEvent>(eventId: string, patch: Partial<T>) => void;
  status: (status: Session['status'], activity?: Session['activity']) => void;
  usage: (usage: Partial<SessionUsage>) => void;
  providerSession: (providerSessionId: string) => void;
}

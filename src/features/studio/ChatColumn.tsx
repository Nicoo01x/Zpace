import { useEffect } from 'react';
import { ArrowLeft, PanelRightClose, RotateCcw } from 'lucide-react';
import { t } from '@/i18n';
import { useStudio } from '@/stores/studio';
import { useSessions } from '@/stores/sessions';
import { IconButton } from '@/components/ui/IconButton';
import { SessionView } from '@/features/agent/SessionView';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { insertIntoComposer } from '@/features/agent/composer-drafts';
import { ensureBuilder, resetBuilder, stopTest } from './builder';
import type { ResolvedScope } from './scope';

/**
 * The chat beside the stage: the builder — the Claude that writes this
 * Claude — or, while a subagent is being tried, that subagent as the
 * session itself. The transcript is the app's own session view, so it is
 * unmistakably the same chat as everywhere else in Zpace.
 */
export function ChatColumn({ scope }: { scope: ResolvedScope | null }) {
  const setChatOpen = useStudio((s) => s.setChatOpen);
  const testing = useStudio((s) => (scope ? s.testing[scope.key] : undefined));
  const builderId = useStudio((s) => (scope ? s.builders[scope.key] : undefined));
  const hasBuilder = useSessions((s) => !!builderId && !!s.sessions[builderId]);
  // The builder exists (and carries the scope's current prompt) as long as the column is up.
  useEffect(() => {
    if (scope) ensureBuilder(scope);
  }, [scope, hasBuilder]);
  const sessionId = testing?.sessionId ?? (hasBuilder ? builderId : null) ?? null;
  const events = useSessions((s) => (sessionId ? (s.events[sessionId]?.length ?? 0) : 0));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2.5 pl-4 pr-2 hairline-b">
        <ClaudeLogo size={16} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-primary">{testing ? t('Testing {name}', { name: testing.agent }) : t('Builder')}</span>
          <span className="truncate text-[11px] text-muted">{testing ? t('as the session itself') : scope ? t('writes {name}', { name: scope.label }) : ''}</span>
        </div>
        {testing && scope ? (
          <IconButton label={t('Back to the builder')} size="sm" onClick={() => void stopTest(scope)}>
            <ArrowLeft />
          </IconButton>
        ) : scope ? (
          <IconButton label={t('New conversation')} size="sm" disabled={events === 0} onClick={() => void resetBuilder(scope)}>
            <RotateCcw />
          </IconButton>
        ) : null}
        <IconButton label={t('Hide the chat')} size="sm" onClick={() => setChatOpen(false)}>
          <PanelRightClose />
        </IconButton>
      </div>
      {sessionId ? <SessionView key={sessionId} sessionId={sessionId} focused empty={testing ? <TestEmpty agent={testing.agent} /> : <BuilderEmpty sessionId={sessionId} />} /> : null}
    </div>
  );
}

/** Before the first message: what the builder is for, and three ways to begin as chips that fill the composer. */
function BuilderEmpty({ sessionId }: { sessionId: string }) {
  const starters = [t('Make me a skill for '), t('Create a subagent that '), t('Write a slash command that ')];
  return (
    <div className="flex flex-1 flex-col items-start justify-end gap-3 px-5 pb-5">
      <div className="text-[13px] leading-relaxed text-secondary">{t('Say what your Claude should be able to do. The builder writes the files and they show up on the left.')}</div>
      <div className="flex flex-wrap gap-1.5">
        {starters.map((s) => (
          <button key={s} type="button" onClick={() => insertIntoComposer(sessionId, s)} className="inline-flex h-7 items-center rounded-full bg-surface-inset px-3 text-[12px] text-secondary press hover:bg-surface-hover hover:text-primary">
            {s.trim()}…
          </button>
        ))}
      </div>
    </div>
  );
}

function TestEmpty({ agent }: { agent: string }) {
  return <div className="flex flex-1 flex-col items-start justify-end px-5 pb-5 text-[13px] leading-relaxed text-secondary">{t('This session runs as {name}: its prompt, its tools, its model. Say something it should handle.', { name: agent })}</div>;
}

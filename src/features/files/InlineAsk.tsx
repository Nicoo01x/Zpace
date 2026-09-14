import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUp, Square, X, ExternalLink, Copy, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LivingSwitch } from '@/components/ui/Living';
import { t } from '@/i18n';
import { springs } from '@/lib/motion';
import { useSessions, selectEvents } from '@/stores/sessions';
import { useSettings, modelContext } from '@/stores/settings';
import { runtime } from '@/providers/runtime';
import { Markdown } from '@/features/agent/Markdown';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { LiveStatus } from '@/features/agent/blocks/AgentStatus';
import { IconButton } from '@/components/ui/IconButton';
import { Textarea } from '@/components/ui/Textarea';
import { basename } from '@/lib/format';
import { toast } from '@/features/notifications/toast-store';
import { mentionPath, useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';

/**
 * "Ask Claude about this code": a small card that floats over the editor next
 * to the selection — movable by its header, resizable from every edge and
 * corner — with a prompt line and Claude's answer streaming in. It runs on a
 * real structured session (created for the file, reused for later questions),
 * so the full transcript is one click away. Dressed in Claude's terracotta.
 */
export interface InlineAskTarget {
  path: string;
  projectId?: string;
  projectPath?: string;
  code: string;
  startLine: number;
  endLine: number;
  language: string;
  /** where the selection ended, in viewport px */
  anchor: { x: number; y: number };
}

const QUICK = ['Explain this', 'Find bugs', 'Refactor for clarity', 'Add tests', 'Add comments'];
const MIN_W = 340;
const MIN_H = 220;

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Array<{ edge: Edge; className: string }> = [
  { edge: 'n', className: 'left-3 right-3 top-0 h-1.5 cursor-ns-resize' },
  { edge: 's', className: 'bottom-0 left-3 right-3 h-1.5 cursor-ns-resize' },
  { edge: 'e', className: 'bottom-3 right-0 top-3 w-1.5 cursor-ew-resize' },
  { edge: 'w', className: 'bottom-3 left-0 top-3 w-1.5 cursor-ew-resize' },
  { edge: 'ne', className: 'right-0 top-0 size-4 cursor-nesw-resize' },
  { edge: 'nw', className: 'left-0 top-0 size-4 cursor-nwse-resize' },
  { edge: 'se', className: 'bottom-0 right-0 size-4 cursor-nwse-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-4 cursor-nesw-resize' },
];

export function InlineAsk({ target, onClose }: { target: InlineAskTarget; onClose: () => void }) {
  const [pos, setPos] = useState(() => ({ x: Math.max(8, Math.min(target.anchor.x + 12, window.innerWidth - 488)), y: Math.max(8, Math.min(target.anchor.y + 12, window.innerHeight - 328)) }));
  const [size, setSize] = useState({ w: 460, h: 300 });
  const [prompt, setPrompt] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const events = useSessions(selectEvents(sessionId));
  const session = useSessions((s) => (sessionId ? s.sessions[sessionId] : undefined));
  const { openSession } = useWorkspaceActions();
  const busy = session?.status === 'running' || session?.status === 'waiting';

  // Only what came back since this card opened: the last assistant message and whether it is streaming.
  const answer = useMemo(() => {
    const last = [...events].reverse().find((e) => e.type === 'assistant_message');
    return last && 'text' in last ? { text: String(last.text), streaming: !!(last as { streaming?: boolean }).streaming } : null;
  }, [events]);

  const rel = target.projectPath ? mentionPath(target.projectPath, target.path) : basename(target.path);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || !target.projectId) return;
    let id = sessionId;
    if (!id) {
      const settings = useSettings.getState();
      const model = settings.claude.defaultModel;
      const s = useSessions.getState().createSession({ projectId: target.projectId, title: `${basename(target.path)}:${target.startLine}`, model, contextMax: modelContext(model) });
      id = s.id;
      setSessionId(id);
    }
    const fence = '```';
    const text = `${q}\n\n@${rel} lines ${target.startLine}–${target.endLine}:\n${fence}${target.language}\n${target.code}\n${fence}`;
    void runtime.send(id, text);
    setPrompt('');
  };

  // Drag by the header; resize from the edges and corners.
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ edge: Edge; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resize.current;
    if (!r) return;
    const dx = e.clientX - r.sx;
    const dy = e.clientY - r.sy;
    let { x, y, w, h } = r;
    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 16;
    if (r.edge.includes('e')) w = Math.min(maxW, Math.max(MIN_W, r.w + dx));
    if (r.edge.includes('s')) h = Math.min(maxH, Math.max(MIN_H, r.h + dy));
    if (r.edge.includes('w')) {
      w = Math.min(maxW, Math.max(MIN_W, r.w - dx));
      x = r.x + (r.w - w);
    }
    if (r.edge.includes('n')) {
      h = Math.min(maxH, Math.max(MIN_H, r.h - dy));
      y = r.y + (r.h - h);
    }
    setPos({ x, y });
    setSize({ w, h });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={springs.pop}
      className={cn(
        'fixed z-[60] flex max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl bg-surface-raised text-primary shadow-popover ring-1 ring-claude/30',
        busy && 'inline-ask-busy',
      )}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      role="dialog"
      aria-label={t('Ask Claude about this code')}
    >
      {/* Claude's colours: a warm strip on top and a tinted header. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-claude via-accent-warm to-claude/40" />
      <div
        className="flex h-9 shrink-0 cursor-grab select-none items-center gap-2 bg-claude-soft pl-3 pr-1.5 hairline-b active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({ x: Math.max(0, drag.current.ox + e.clientX - drag.current.sx), y: Math.max(0, drag.current.oy + e.clientY - drag.current.sy) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <GripHorizontal className="size-[13px] text-claude/60" />
        <ClaudeLogo size={13} />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-secondary">
          {basename(target.path)}
          <span className="text-claude/80">
            :{target.startLine}
            {target.endLine !== target.startLine ? `–${target.endLine}` : ''}
          </span>
        </span>
        {busy ? <span className="mr-1 size-1.5 animate-pulse rounded-full bg-claude" /> : null}
        {sessionId ? (
          <IconButton label={t('Open the full chat')} size="xs" onClick={() => { openSession(sessionId); onClose(); }}>
            <ExternalLink />
          </IconButton>
        ) : null}
        <IconButton label={t('Close')} shortcut="esc" size="xs" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <LivingSwitch k={!sessionId ? 'quick' : answer ? 'answer' : busy && session ? 'busy' : 'none'}>
        {!sessionId ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK.map((q, i) => (
              <motion.button
                key={q}
                type="button"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.pop, delay: 0.03 * i }}
                onClick={() => ask(q)}
                className="rounded-full bg-claude-soft px-2.5 py-1 text-[12px] font-medium text-claude transition-colors hover:bg-claude hover:text-white"
              >
                {t(q)}
              </motion.button>
            ))}
          </div>
        ) : answer ? (
          <div className="prose-agent prose-note selectable text-[13px]">
            <Markdown text={answer.text} />
            {answer.streaming ? <span className="streaming-caret" /> : null}
          </div>
        ) : busy && session ? (
          <div className="pt-1">
            <LiveStatus activity={session.activity} startedAt={session.runStartedAt} waiting={session.status === 'waiting'} />
          </div>
        ) : null}
        </LivingSwitch>
        {session?.status === 'waiting' ? (
          <div className="mt-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">{t('Claude needs a permission — open the full chat to answer.')}</div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-end gap-2 px-3 py-2 hairline-t">
        <span className="pb-[3px] font-mono text-[13px] text-claude">❯</span>
        <Textarea
          bare
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('Ask about the selection…')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(prompt);
            }
            e.stopPropagation();
          }}
          className="max-h-24 min-h-[22px] flex-1 text-[13px]"
        />
        {answer ? (
          <IconButton label={t('Copy answer')} size="xs" onClick={() => { void navigator.clipboard.writeText(answer.text); toast.neutral(t('Copied'), { origin: null, duration: 1200 }); }}>
            <Copy />
          </IconButton>
        ) : null}
        {busy && sessionId ? (
          <button type="button" aria-label={t('Stop')} onClick={() => void runtime.cancel(sessionId)} className="inline-flex size-7 items-center justify-center rounded-full bg-claude text-white shadow-sm">
            <Square className="size-3" fill="currentColor" />
          </button>
        ) : (
          <button type="button" aria-label={t('Send')} disabled={!prompt.trim()} onClick={() => ask(prompt)} className={cn('inline-flex size-7 items-center justify-center rounded-full bg-claude text-white shadow-sm transition-opacity', !prompt.trim() && 'opacity-30')}>
            <ArrowUp className="size-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Resize handles: every edge and corner, plus a visible grip in the corner. */}
      {EDGES.map(({ edge, className }) => (
        <div
          key={edge}
          className={cn('absolute z-10 touch-none', className)}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resize.current = { edge, sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y, w: size.w, h: size.h };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={onResizeMove}
          onPointerUp={() => {
            resize.current = null;
          }}
        />
      ))}
      <svg aria-hidden className="pointer-events-none absolute bottom-1 right-1 size-2.5 text-claude/50" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M9 1 1 9M9 5 5 9M9 9h0" />
      </svg>
    </motion.div>
  );
}

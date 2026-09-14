import { useCallback, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Terminal as TerminalIcon, FileText, Globe, NotebookPen, FileDiff, LayoutDashboard, Folder, GitBranch } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useUI, collectLeaves } from '@/stores/ui';
import { sessionTitle, useSessions } from '@/stores/sessions';
import { useTerminals } from '@/stores/terminals';
import { useNotes } from '@/stores/notes';
import { useProjects } from '@/stores/projects';
import { basename } from '@/lib/format';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { StatusDot } from '@/components/ui/StatusDot';
import { Shortcut } from '@/components/ui/Shortcut';
import type { PaneContent } from '@/types/workspace';

/**
 * Window stack — Ctrl+Tab. Every open pane as a card in a deck: the front one
 * is the pane that will be shown; each Ctrl+Tab sends it to the back and
 * brings the next forward; releasing Ctrl (or Enter / a click) switches to
 * it, Escape leaves things as they were. The deck follows one recipe:
 *   front      scale 1     x 0       y 0     z 30
 *   second     scale 0.96  x ±35px   y 10px  z 20
 *   third      scale 0.92  x ±65px   y 20px  z 10
 * (further cards keep receding and fade out).
 */
const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;

function slot(depth: number, side: 1 | -1) {
  if (depth === 0) return { scale: 1, x: 0, y: 0, zIndex: 30, opacity: 1 };
  if (depth === 1) return { scale: 0.96, x: 35 * side, y: 10, zIndex: 20, opacity: 1 };
  if (depth === 2) return { scale: 0.92, x: 65 * side, y: 20, zIndex: 10, opacity: 1 };
  return { scale: 0.88, x: 95 * side, y: 30, zIndex: 0, opacity: 0 };
}

export function WindowStack() {
  const open = useUI((s) => s.stackOpen);
  const setOpen = useUI((s) => s.setStackOpen);
  const layout = useUI((s) => s.layout);
  const setActivePane = useUI((s) => s.setActivePane);
  const leaves = useMemo(() => collectLeaves(layout).filter((l) => l.content.kind !== 'empty'), [layout]);
  // Order of the deck (front first) lives in the store: set when the stack opens, rotated by Ctrl+Tab.
  const order = useUI((s) => s.stackOrder);
  const advance = useUI((s) => s.rotateStack);
  const promote = useUI((s) => s.promoteStack);
  const commit = useCallback(() => {
    const front = order[0];
    if (front) setActivePane(front);
    setOpen(false);
  }, [order, setActivePane, setOpen]);

  // Ctrl held: Tab cycles; letting Ctrl go picks the front card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        advance(e.shiftKey ? -1 : 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        advance(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        advance(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') commit();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onUp, true);
    };
  }, [open, advance, commit, setOpen]);

  return (
    <AnimatePresence>
      {open && order.length > 0 ? (
        <motion.div
          key="stack"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-[930] flex flex-col items-center justify-center bg-black/25 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative h-[360px] w-[560px] max-w-[calc(100vw-48px)]">
            {order.map((id, depth) => {
              const leaf = leaves.find((l) => l.id === id);
              if (!leaf) return null;
              const side: 1 | -1 = depth % 2 === 1 ? 1 : -1;
              const s = slot(depth, side);
              return (
                <motion.div
                  key={id}
                  layout
                  initial={{ ...slot(Math.min(depth + 1, 3), side), opacity: 0 }}
                  animate={s}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
                  transition={SPRING}
                  style={{ zIndex: s.zIndex }}
                  onClick={() => {
                    if (depth === 0) commit();
                    else promote(id);
                  }}
                  className={cn('absolute inset-0 cursor-pointer overflow-hidden rounded-xl bg-surface-raised text-primary shadow-popover ring-1 ring-black/10', depth > 0 && 'brightness-[0.97]')}
                >
                  <WindowCard content={leaf.content} front={depth === 0} />
                </motion.div>
              );
            })}
          </div>
          <div className="mt-8 flex items-center gap-4 text-[12px] text-white/85">
            <span className="inline-flex items-center gap-1.5">
              <Shortcut combo="ctrl+tab" /> {t('next')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shortcut combo="ctrl+shift+tab" /> {t('previous')}
            </span>
            <span className="inline-flex items-center gap-1.5">{t('release Ctrl to switch')}</span>
            <span className="inline-flex items-center gap-1.5">
              <Shortcut combo="esc" /> {t('cancel')}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** What a pane looks like from afar: title bar with its kind, then a glimpse of its content. */
function WindowCard({ content, front }: { content: PaneContent; front: boolean }) {
  const sessionId = content.kind === 'session' ? content.sessionId : null;
  const terminalId = content.kind === 'terminal' ? content.terminalId : null;
  const noteId = content.kind === 'note' ? content.noteId : null;
  const session = useSessions((s) => (sessionId ? s.sessions[sessionId] : undefined));
  const lastText = useSessions((s) => {
    if (!sessionId) return '';
    const evs = s.events[sessionId] ?? [];
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (e.type === 'assistant_message' && 'text' in e) return String(e.text).slice(0, 600);
    }
    return '';
  });
  const terminal = useTerminals((s) => (terminalId ? s.tabs.find((x) => x.id === terminalId) : undefined));
  const note = useNotes((s) => (noteId ? s.notes[noteId] : undefined));
  const projectId = session?.projectId ?? terminal?.projectId ?? note?.projectId ?? (content.kind === 'file' ? content.projectId : undefined);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));

  let icon = <Folder className="size-[14px] text-muted" />;
  let title = project?.name ?? 'Zpace';
  let body: React.ReactNode = null;
  switch (content.kind) {
    case 'session':
      icon = (
        <span className="relative inline-flex">
          <AgentGlyph className="size-[14px] text-muted" active={session?.status === 'running'} />
          {session ? (
            <span className="absolute -right-1 -top-1">
              <StatusDot status={session.status} size={5} />
            </span>
          ) : null}
        </span>
      );
      title = session ? sessionTitle(session.title) : t('Session');
      body = lastText ? <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-secondary">{lastText}</p> : <p className="text-[12.5px] text-muted">{t('No messages yet.')}</p>;
      break;
    case 'terminal':
      icon = <TerminalIcon className="size-[14px] text-muted" />;
      title = terminal?.title ?? t('Terminal');
      body = (
        <div className="rounded-md bg-[#141414] px-3 py-2 font-mono text-[12px] text-[#e8e8e8]">
          <span className="text-[#7ee0a5]">❯</span> {terminal?.cwd ?? ''}
        </div>
      );
      break;
    case 'note':
      icon = note?.kind === 'board' ? <LayoutDashboard className="size-[14px] text-muted" /> : <NotebookPen className="size-[14px] text-muted" />;
      title = note?.title || t('Untitled note');
      body = note?.kind === 'board' ? <p className="text-[12.5px] text-muted">{t('Board')}</p> : <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-secondary">{(note?.body ?? '').slice(0, 500)}</p>;
      break;
    case 'file':
      icon = <FileText className="size-[14px] text-muted" />;
      title = basename(content.path);
      body = <p className="truncate font-mono text-[12px] text-muted">{content.path}</p>;
      break;
    case 'browser':
      icon = <Globe className="size-[14px] text-muted" />;
      title = t('Browser');
      body = <p className="truncate font-mono text-[12px] text-accent">{content.url}</p>;
      break;
    case 'diff':
      icon = <FileDiff className="size-[14px] text-muted" />;
      title = content.path;
      break;
    case 'git':
      icon = <GitBranch className="size-[14px] text-muted" />;
      title = 'Git';
      break;
    default:
      break;
  }
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-[42px] shrink-0 items-center gap-2 px-4 hairline-b', front ? 'text-primary' : 'text-secondary')}>
        {icon}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</span>
        {project ? <span className="truncate text-[11.5px] text-muted">{project.name}</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">{body}</div>
    </div>
  );
}

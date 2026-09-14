import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquarePlus, Check, Trash2, Square, CornerDownLeft, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { formatRelative } from '@/lib/format';
import { useMargin, notesFor, type MarginNote } from '@/stores/margin';
import { useSessions } from '@/stores/sessions';
import { useSettings, modelContext } from '@/stores/settings';
import { useProjects } from '@/stores/projects';
import { runtime } from '@/providers/runtime';
import { Markdown } from '@/features/agent/Markdown';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { Textarea } from '@/components/ui/Textarea';
import { mentionPath } from '@/features/sessions/useWorkspaceActions';
import { t } from '@/i18n';

/**
 * The margin: notes pinned to line ranges of the file, like a reviewer's
 * pencil. Write one against the current selection, ask Claude and the
 * answer sits under it (a quick hidden session with the lines and the file
 * for context); resolve or delete when done. Clicking a note reveals its
 * lines in the editor.
 */
export function MarginPanel({ path, projectId, text, selection, onReveal }: { path: string; projectId?: string; text: string; selection: { startLine: number; endLine: number } | null; onReveal: (start: number, end: number) => void }) {
  const notes = useMargin((s) => notesFor(s.notes, path));
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const lines = useMemo(() => text.replace(/\r\n/g, '\n').split('\n'), [text]);
  const anchor = selection ?? { startLine: 1, endLine: 1 };
  const excerpt = lines.slice(anchor.startLine - 1, anchor.endLine).join('\n');

  const add = () => {
    const body = draft.trim();
    if (!body) return;
    useMargin.getState().add({ path, startLine: anchor.startLine, endLine: anchor.endLine, excerpt: excerpt.slice(0, 2000), text: body });
    setDraft('');
    setComposing(false);
  };

  return (
    <aside data-margin className="flex h-full min-h-0 w-[300px] shrink-0 flex-col bg-canvas hairline-l">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted hairline-b">
        {t('Margin')}
        <span className="tabular">{notes.filter((n) => !n.resolved).length}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setComposing((v) => !v)} className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 normal-case tracking-normal text-accent hover:bg-surface-hover">
          <MessageSquarePlus className="size-[13px]" /> {selection ? t('Note on L{a}–{b}', { a: String(selection.startLine), b: String(selection.endLine) }) : t('Note')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {composing ? (
            <motion.div key="compose" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={springs.snappy} className="mb-2 rounded-lg bg-surface-raised p-2 shadow-[0_0_0_1px_var(--accent)]">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                <span className="font-mono text-accent">L{anchor.startLine}{anchor.endLine !== anchor.startLine ? `–${anchor.endLine}` : ''}</span>
                <span className="truncate font-mono">{lines[anchor.startLine - 1]?.trim().slice(0, 40)}</span>
              </div>
              <Textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder={t('What is this for? Why this way? — ask, or leave yourself a note')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add();
                  if (e.key === 'Escape') setComposing(false);
                }}
                className="text-[12.5px]"
              />
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <button type="button" onClick={() => setComposing(false)} className="h-6 rounded-md px-2 text-[11.5px] text-secondary hover:bg-surface-hover hover:text-primary">
                  {t('Cancel')}
                </button>
                <button type="button" onClick={add} disabled={!draft.trim()} className="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11.5px] font-medium text-inverse hover:opacity-90 disabled:opacity-40">
                  <CornerDownLeft className="size-[11px]" /> {t('Pin note')}
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {notes.length === 0 && !composing ? (
          <div className="px-3 py-8 text-center text-[12px] leading-relaxed text-muted">{t('Nothing in the margin. Select some lines and pin a note; ask Claude about them without leaving the file.')}</div>
        ) : null}
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} path={path} projectId={projectId} lines={lines} onReveal={onReveal} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function NoteCard({ note, path, projectId, lines, onReveal }: { note: MarginNote; path: string; projectId?: string; lines: string[]; onReveal: (a: number, b: number) => void }) {
  const session = useSessions((s) => (note.sessionId ? s.sessions[note.sessionId] : undefined));
  const events = useSessions((s) => (note.sessionId ? s.events[note.sessionId] : undefined));
  const live = useMemo(() => {
    if (!events) return null;
    const last = [...events].reverse().find((e) => e.type === 'assistant_message');
    return last && 'text' in last ? String(last.text) : null;
  }, [events]);
  const busy = !!session && (session.status === 'running' || session.status === 'waiting');
  const moved = lines.slice(note.startLine - 1, note.endLine).join('\n') !== note.excerpt;

  // When the hidden session settles, keep its answer with the note and let the session go.
  useEffect(() => {
    if (!note.sessionId || !session || busy) return;
    if (session.status === 'completed' || session.status === 'error' || session.status === 'idle') {
      const answer = live ?? note.answer ?? '';
      useMargin.getState().update(path, note.id, { answer, pending: false, sessionId: undefined });
      void runtime.dispose(note.sessionId).catch(() => void 0);
      useSessions.getState().removeSession(note.sessionId);
    }
  }, [busy, session, live, note.sessionId, note.id, note.answer, path]);

  const ask = () => {
    const project = useProjects.getState().projects.find((p) => p.id === projectId) ?? useProjects.getState().projects[0];
    if (!project) return;
    const model = useSettings.getState().claude.quickModel || 'haiku';
    const s = useSessions.getState().createSession({ projectId: project.id, title: note.text.slice(0, 60), model, contextMax: modelContext(model), hidden: true });
    useMargin.getState().update(path, note.id, { pending: true, sessionId: s.id, answer: undefined });
    const rel = mentionPath(project.path, path);
    const code = lines.slice(note.startLine - 1, note.endLine).join('\n');
    void runtime.send(
      s.id,
      `A margin note on @${rel} lines ${note.startLine}-${note.endLine}. Answer it briefly and directly in the language of the note (about 150 words), in plain Markdown — no preamble. Read the file if the excerpt is not enough.\n\nNote: ${note.text}\n\nLines ${note.startLine}-${note.endLine}:\n\`\`\`\n${code}\n\`\`\``,
    );
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springs.snappy} className={cn('group/note rounded-lg bg-surface-raised p-2.5 shadow-[0_0_0_1px_var(--border)]', note.resolved && 'opacity-60')}>
      <button type="button" onClick={() => onReveal(note.startLine, note.endLine)} className="flex w-full items-center gap-2 text-left text-[11px] text-muted hover:text-primary">
        <span className="font-mono text-accent">
          L{note.startLine}
          {note.endLine !== note.startLine ? `–${note.endLine}` : ''}
        </span>
        {moved ? <span className="rounded-[3px] bg-warning-soft px-1 text-[10px] text-warning">{t('lines moved')}</span> : null}
        <span className="ml-auto">{formatRelative(note.at)}</span>
      </button>
      <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-primary">{note.text}</div>
      {note.pending || note.answer ? (
        <div className="mt-2 rounded-md bg-claude-soft px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-claude">
            <ClaudeLogo size={11} /> Claude
            {busy ? (
              <button type="button" aria-label={t('Stop')} onClick={() => note.sessionId && void runtime.cancel(note.sessionId)} className="ml-auto inline-flex size-4 items-center justify-center rounded-full bg-claude text-white">
                <Square className="size-2" fill="currentColor" />
              </button>
            ) : null}
          </div>
          {live || note.answer ? (
            <div className="prose-agent prose-note selectable text-[12.5px]">
              <Markdown text={live ?? note.answer ?? ''} />
              {busy ? <span className="streaming-caret" /> : null}
            </div>
          ) : (
            <div className="text-[12px] text-claude/70">{t('Thinking…')}</div>
          )}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/note:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={ask} disabled={busy} className="inline-flex h-6 items-center gap-1 rounded-md bg-claude-soft px-2 text-[11.5px] font-medium text-claude hover:brightness-95 disabled:opacity-50">
          <ClaudeLogo size={11} /> {note.answer ? t('Ask again') : t('Ask Claude')}
        </button>
        <span className="flex-1" />
        <button type="button" aria-label={note.resolved ? t('Reopen') : t('Resolve')} onClick={() => useMargin.getState().update(path, note.id, { resolved: !note.resolved })} className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-success">
          {note.resolved ? <RotateCcw className="size-[13px]" /> : <Check className="size-[13px]" />}
        </button>
        <button type="button" aria-label={t('Delete')} onClick={() => useMargin.getState().remove(path, note.id)} className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger">
          <Trash2 className="size-[13px]" />
        </button>
      </div>
    </motion.div>
  );
}

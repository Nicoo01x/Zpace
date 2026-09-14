import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Pin, Plus, SquarePen, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useNotes, sortedNotes, notePreview, noteTitle } from '@/stores/notes';
import { useProjects } from '@/stores/projects';
import { useUI, collectLeaves } from '@/stores/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import type { Note } from '@/types/workspace';
import { t } from '@/i18n';

/**
 * Title-bar entry to the notes: a compose glyph with the note count. Click and
 * the notes drop down as yellow stickies (Windows Sticky Notes / iOS Notes);
 * pick one to open it in the workspace, or start a new one from the header.
 */
export function NotesChip() {
  const notes = useNotes(useShallow((s) => sortedNotes(s.notes)));
  const [open, setOpen] = useState(false);
  const { newNote } = useWorkspaceActions();
  const count = notes.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={t('Notes')} shortcut="mod+shift+n">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Notes (${count})`}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-secondary transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary',
              'data-[state=open]:bg-surface-active data-[state=open]:text-primary',
            )}
          >
            <SquarePen className="size-[15px]" strokeWidth={1.75} />
            {count > 0 ? <span className="tabular">{count}</span> : null}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" sideOffset={4} className="w-[336px] p-0">
        <div className="flex h-10 items-center gap-2 pl-3.5 pr-2 hairline-b">
          <span className="text-[12.5px] font-semibold text-primary">{t('Notes')}</span>
          <span className="text-[11.5px] text-muted">{count === 0 ? '' : `${count}`}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              newNote();
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-note-paper-strong px-2 text-[12px] font-medium text-note-ink shadow-[inset_0_0_0_1px_var(--note-line)] transition-[filter] duration-(--motion-fast) hover:brightness-[0.97]"
          >
            <Plus className="size-[13px]" strokeWidth={2} />
            {t('New note')}
          </button>
        </div>
        <div className="max-h-[min(60vh,520px)] overflow-y-auto p-2">
          {count === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-muted">{t('No notes yet.')}</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {notes.map((n) => (
                <Sticky key={n.id} note={n} onOpen={() => setOpen(false)} />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Sticky({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === note.projectId));
  const update = useNotes((s) => s.updateNote);
  const activePaneContent = useUI((s) => collectLeaves(s.layout).find((l) => l.id === s.activePaneId)?.content);
  const { openNote, deleteNote } = useWorkspaceActions();
  const active = activePaneContent?.kind === 'note' && activePaneContent.noteId === note.id;
  const preview = notePreview(note);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      onClick={() => {
        onOpen();
        openNote(note.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onOpen();
          openNote(note.id);
        }
        if (e.key === 'Delete') deleteNote(note.id);
      }}
      className={cn(
        'group/sticky relative flex h-[132px] cursor-default flex-col overflow-hidden rounded-[10px] bg-note-paper text-primary outline-none',
        'shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--border)] transition-[transform,box-shadow] duration-(--motion-fast) ease-(--ease-out)',
        'hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border)] focus-visible:shadow-[0_0_0_2px_var(--note-accent)]',
        active && 'shadow-[0_0_0_2px_var(--note-accent),0_1px_2px_rgba(0,0,0,0.08)]',
      )}
    >
      {/* sticky header strip */}
      <div className="flex h-7 shrink-0 items-center gap-1 bg-note-paper-strong pl-2.5 pr-1 text-note-ink">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{noteTitle(note)}</span>
        <span className="hidden items-center group-hover/sticky:flex group-focus-within/sticky:flex">
          <button
            type="button"
            aria-label={note.pinned ? t('Unpin') : t('Pin')}
            onClick={(e) => {
              e.stopPropagation();
              update(note.id, { pinned: !note.pinned });
            }}
            className="inline-flex size-5 items-center justify-center rounded-[4px] text-note-ink-soft hover:bg-[rgba(0,0,0,0.08)] hover:text-note-ink"
          >
            <Pin className="size-[11px]" />
          </button>
          <button
            type="button"
            aria-label={t('Delete note')}
            onClick={(e) => {
              e.stopPropagation();
              deleteNote(note.id);
            }}
            className="inline-flex size-5 items-center justify-center rounded-[4px] text-note-ink-soft hover:bg-[rgba(0,0,0,0.08)] hover:text-note-ink"
          >
            <Trash2 className="size-[11px]" />
          </button>
        </span>
        {note.pinned ? <Pin className="size-[11px] shrink-0 text-note-ink-soft group-hover/sticky:hidden" /> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden whitespace-pre-line px-2.5 pt-1.5 text-[11.5px] leading-[1.45] text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">
        {preview || <span className="italic opacity-70">{t('Empty note')}</span>}
      </div>
      <div className="flex h-6 shrink-0 items-center gap-1 px-2.5 text-[10.5px] text-muted">
        <span className="min-w-0 truncate">{project?.name ?? ''}</span>
        <span className="ml-auto shrink-0">{formatRelative(note.updatedAt)}</span>
      </div>
    </div>
  );
}

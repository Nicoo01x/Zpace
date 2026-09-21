import { memo } from 'react';
import { Copy, Pin, PinOff, SplitSquareHorizontal, Trash2, FileText, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Note } from '@/types/workspace';
import { useNotes, noteTitle } from '@/stores/notes';
import { useUI, collectLeaves } from '@/stores/ui';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { Grip } from '@/components/ui/Grip';
import { paneDragProps } from '@/features/sessions/pane-drag';
import { MoveToSub } from '@/features/projects/MoveToMenu';
import { t } from '@/i18n';

export const NoteRow = memo(function NoteRow({ note }: { note: Note }) {
  const update = useNotes((s) => s.updateNote);
  const duplicate = useNotes((s) => s.duplicateNote);
  const activePaneContent = useUI((s) => collectLeaves(s.layout).find((l) => l.id === s.activePaneId)?.content);
  const { openNote, deleteNote, splitActive } = useWorkspaceActions();
  const active = activePaneContent?.kind === 'note' && activePaneContent.noteId === note.id;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          aria-selected={active}
          tabIndex={0}
          {...paneDragProps({ kind: 'note', noteId: note.id }, noteTitle(note))}
          onClick={() => openNote(note.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openNote(note.id);
            if (e.key === 'Delete') deleteNote(note.id);
          }}
          className={cn(
            'group/row relative flex h-(--row-height) select-none items-center gap-2 rounded-lg pl-2.5 pr-2.5 text-ui outline-none transition-colors duration-(--motion-fast)',
            active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover',
          )}
        >
          <span className="inline-flex w-5 shrink-0 items-center justify-center">
            <Grip className={cn('transition-opacity duration-(--motion-fast)', active ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-40')} />
          </span>
          {note.kind === 'board' ? <LayoutDashboard className="size-[14px] shrink-0 text-muted" strokeWidth={1.75} /> : <FileText className="size-[14px] shrink-0 text-muted" strokeWidth={1.75} />}
          <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{noteTitle(note)}</span>
          {note.pinned ? <Pin className="size-[11px] shrink-0 text-muted" /> : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={note.pinned ? <PinOff /> : <Pin />} onSelect={() => update(note.id, { pinned: !note.pinned })}>
          {note.pinned ? t('Unpin') : t('Pin')}
        </ContextMenuItem>
        <ContextMenuItem icon={<SplitSquareHorizontal />} onSelect={() => splitActive('horizontal', { kind: 'note', noteId: note.id })}>
          {t('Open to the side')}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Copy />}
          onSelect={() => {
            const c = duplicate(note.id);
            if (c) openNote(c.id);
          }}
        >
          {t('Duplicate')}
        </ContextMenuItem>
        {note.projectId ? <MoveToSub item={{ kind: 'note', id: note.id }} projectId={note.projectId} current={note.folderId} /> : null}
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} danger onSelect={() => deleteNote(note.id)}>
          {t('Delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

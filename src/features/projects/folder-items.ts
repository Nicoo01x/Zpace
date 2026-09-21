import type { DragEvent } from 'react';
import type { PaneContent } from '@/types/workspace';
import { PANE_DRAG_MIME, usePaneDrag } from '@/features/sessions/pane-drag';
import { useTerminals } from '@/stores/terminals';
import { useSessions } from '@/stores/sessions';
import { useNotes } from '@/stores/notes';
import { useAgents } from '@/stores/agents';
import { useArena } from '@/stores/arena';

/**
 * What can live in a project sub-folder, and how a sidebar row lands in one.
 * Rows already drag as pane content (to open them in a split); a folder row
 * reads that same drag and files the item instead of showing it.
 */
export interface FolderItem {
  kind: 'terminal' | 'session' | 'note' | 'room' | 'arena';
  id: string;
}

/** The item a pane drag carries, when it is one a folder can hold. */
export function folderItemOf(content: PaneContent | null | undefined): FolderItem | null {
  switch (content?.kind) {
    case 'terminal':
      return { kind: 'terminal', id: content.terminalId };
    case 'session':
      return { kind: 'session', id: content.sessionId };
    case 'note':
      return { kind: 'note', id: content.noteId };
    case 'room':
      return { kind: 'room', id: content.roomId };
    case 'arena':
      return { kind: 'arena', id: content.arenaId };
    default:
      return null;
  }
}

/** Where the item is filed right now (its project, and the folder inside it if any). */
export function locateItem(item: FolderItem): { projectId: string; folderId?: string } | null {
  switch (item.kind) {
    case 'terminal': {
      const tab = useTerminals.getState().tabs.find((x) => x.id === item.id);
      return tab?.projectId ? { projectId: tab.projectId, folderId: tab.folderId } : null;
    }
    case 'session': {
      const s = useSessions.getState().sessions[item.id];
      return s ? { projectId: s.projectId, folderId: s.folderId } : null;
    }
    case 'note': {
      const n = useNotes.getState().notes[item.id];
      return n?.projectId ? { projectId: n.projectId, folderId: n.folderId } : null;
    }
    case 'room': {
      const r = useAgents.getState().rooms[item.id];
      return r ? { projectId: r.projectId, folderId: r.folderId } : null;
    }
    case 'arena': {
      const a = useArena.getState().arenas[item.id];
      return a ? { projectId: a.projectId, folderId: a.folderId } : null;
    }
  }
}

/**
 * Make a row a drop target for sidebar items. `accept` says whether the item
 * in flight may land here; `over` follows the pointer so the row can show it.
 */
export function folderDropProps(accept: (item: FolderItem) => boolean, onDrop: (item: FolderItem) => void, over: (v: boolean) => void) {
  const inFlight = () => {
    const item = folderItemOf(usePaneDrag.getState().content);
    return item && accept(item) ? item : null;
  };
  return {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!inFlight()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      over(true);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      // Moving onto a child of the row is not leaving it.
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
      over(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      over(false);
      let item = inFlight();
      if (!item) {
        // The mirror store is empty when the drag started in another window; the payload itself still tells.
        try {
          item = folderItemOf(JSON.parse(e.dataTransfer.getData(PANE_DRAG_MIME)) as PaneContent);
        } catch {
          item = null;
        }
        if (!item || !accept(item)) return;
      }
      e.preventDefault();
      e.stopPropagation();
      onDrop(item);
    },
  };
}

import { create } from 'zustand';
import type { DragEvent } from 'react';
import type { PaneContent } from '@/types/workspace';
import { useUI, collectLeaves } from '@/stores/ui';

/**
 * Drag a sidebar item (terminal, Claude Code, note, session) into the
 * workspace: drop on a pane's edge to split it there, on its middle to
 * replace what it shows. HTML5 drag & drop carries the content; this store
 * mirrors the in-flight drag so panes can show their drop zones while the
 * pointer is still moving (dataTransfer is unreadable until the drop).
 */

export const PANE_DRAG_MIME = 'application/x-conduit-pane';

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';

interface PaneDragState {
  content: PaneContent | null;
  label: string;
  start: (content: PaneContent, label: string) => void;
  end: () => void;
}

export const usePaneDrag = create<PaneDragState>((set) => ({
  content: null,
  label: '',
  start: (content, label) => set({ content, label }),
  end: () => set({ content: null, label: '' }),
}));

/** Wire a sidebar row: `<div draggable {...paneDragProps(content, label)}>`. */
export function paneDragProps(content: PaneContent, label: string) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData(PANE_DRAG_MIME, JSON.stringify(content));
      e.dataTransfer.setData('text/plain', label);
      e.dataTransfer.effectAllowed = 'move';
      usePaneDrag.getState().start(content, label);
    },
    onDragEnd: () => usePaneDrag.getState().end(),
  };
}

/** Which zone of a box the pointer is in: a 28% band on each edge splits, the rest replaces. */
export function zoneAt(rect: DOMRect, x: number, y: number): DropZone {
  const px = (x - rect.left) / rect.width;
  const py = (y - rect.top) / rect.height;
  const band = 0.28;
  const dl = px, dr = 1 - px, dt = py, db = 1 - py;
  const min = Math.min(dl, dr, dt, db);
  if (min > band) return 'center';
  if (min === dl) return 'left';
  if (min === dr) return 'right';
  if (min === dt) return 'top';
  return 'bottom';
}

function sameContent(a: PaneContent, b: PaneContent): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'terminal':
      return b.kind === 'terminal' && a.terminalId === b.terminalId;
    case 'note':
      return b.kind === 'note' && a.noteId === b.noteId;
    case 'session':
      return b.kind === 'session' && a.sessionId === b.sessionId;
    case 'file':
      return b.kind === 'file' && a.path === b.path;
    case 'browser':
      return b.kind === 'browser' && a.browserId === b.browserId;
    default:
      return false;
  }
}

/**
 * Place dragged content relative to a pane. An item already open elsewhere is
 * moved, not duplicated (a terminal has one PTY; two views would fight over it).
 */
export function dropOnPane(paneId: string, zone: DropZone, content: PaneContent) {
  const ui = useUI.getState();
  const leaves = collectLeaves(ui.layout);
  const target = leaves.find((l) => l.id === paneId);
  if (!target) return;
  if (sameContent(target.content, content) && zone === 'center') return;
  const previous = leaves.filter((l) => l.id !== paneId && sameContent(l.content, content)).map((l) => l.id);

  if (zone === 'center') {
    ui.setPaneContent(paneId, content);
  } else {
    ui.splitPane(paneId, zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical', content, zone === 'left' || zone === 'top');
  }
  // The item left its old pane: close that pane (the layout collapses around it).
  for (const id of previous) useUI.getState().closePane(id);
  if (content.kind === 'session') ui.setActiveSession(content.sessionId);
}

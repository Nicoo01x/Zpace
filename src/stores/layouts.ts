import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { uid } from '@/lib/id';
import type { PaneNode, PaneContent } from '@/types/workspace';
import { useUI, collectLeaves } from './ui';
import { useSessions } from './sessions';
import { useTerminals } from './terminals';
import { useNotes } from './notes';
import { useArena } from './arena';
import { useAgents } from './agents';

/**
 * Named arrangements of the workspace — the pane tree plus which side panels
 * are up — saved per project ("review mode": chat + review + explorer;
 * "terminals": three shells) and brought back with a command or Ctrl+Alt+1…9.
 * Panes whose session, terminal or note is gone come back empty.
 */
export interface SavedLayout {
  id: string;
  name: string;
  projectId?: string;
  layout: PaneNode;
  sidebarOpen: boolean;
  explorerOpen: boolean;
  terminalPanelOpen: boolean;
  gitPanelOpen: boolean;
  at: number;
}

interface LayoutsState {
  layouts: SavedLayout[];
  save: (name: string, projectId?: string) => SavedLayout;
  apply: (id: string) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
}

/** Contents that no longer resolve to anything become empty panes. */
function prune(node: PaneNode): PaneNode {
  if (node.type === 'split') return { ...node, children: [prune(node.children[0]), prune(node.children[1])] };
  return { ...node, content: alive(node.content) ? node.content : { kind: 'empty' } };
}

function alive(c: PaneContent): boolean {
  switch (c.kind) {
    case 'session':
      return !!useSessions.getState().sessions[c.sessionId];
    case 'review':
      return !!useSessions.getState().sessions[c.sessionId];
    case 'arena':
      return !!useArena.getState().arenas[c.arenaId];
    case 'room':
      return !!useAgents.getState().rooms[c.roomId];
    case 'plugin':
      return true;
    case 'terminal':
      return useTerminals.getState().tabs.some((t) => t.id === c.terminalId);
    case 'note':
      return !!useNotes.getState().notes[c.noteId];
    default:
      return true;
  }
}

export const useLayouts = create<LayoutsState>()(
  persist(
    (set, get) => ({
      layouts: [],
      save: (name, projectId) => {
        const ui = useUI.getState();
        const item: SavedLayout = {
          id: uid('lay'),
          name,
          projectId,
          layout: ui.layout,
          sidebarOpen: ui.sidebarOpen,
          explorerOpen: ui.explorerOpen,
          terminalPanelOpen: ui.terminalPanelOpen,
          gitPanelOpen: ui.gitPanelOpen,
          at: Date.now(),
        };
        set((s) => ({ layouts: [...s.layouts.filter((l) => !(l.name === name && l.projectId === projectId)), item] }));
        return item;
      },
      apply: (id) => {
        const item = get().layouts.find((l) => l.id === id);
        if (!item) return;
        const ui = useUI.getState();
        const layout = prune(item.layout);
        const leaves = collectLeaves(layout);
        const first = leaves.find((l) => l.content.kind === 'session') ?? leaves[0];
        useUI.setState({
          layout,
          activePaneId: leaves.some((l) => l.id === ui.activePaneId) ? ui.activePaneId : (first?.id ?? ui.activePaneId),
          activeSessionId: first?.content.kind === 'session' ? first.content.sessionId : ui.activeSessionId,
          sidebarOpen: item.sidebarOpen,
          explorerOpen: item.explorerOpen,
          terminalPanelOpen: item.terminalPanelOpen,
          gitPanelOpen: item.gitPanelOpen,
        });
      },
      remove: (id) => set((s) => ({ layouts: s.layouts.filter((l) => l.id !== id) })),
      rename: (id, name) => set((s) => ({ layouts: s.layouts.map((l) => (l.id === id ? { ...l, name } : l)) })),
    }),
    { name: 'conduit.layouts', version: 1, storage: durableStorage() },
  ),
);

/** The layouts that apply here: the project's own first, then the global ones. */
export function layoutsFor(layouts: SavedLayout[], projectId?: string): SavedLayout[] {
  return [...layouts.filter((l) => l.projectId && l.projectId === projectId), ...layouts.filter((l) => !l.projectId)];
}

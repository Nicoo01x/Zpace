import { create } from 'zustand';

/** The agent editor: a new agent, or an existing one by id. */
interface EditorState {
  target: { agentId?: string } | null;
  open: (agentId?: string) => void;
  close: () => void;
}

export const useAgentEditor = create<EditorState>((set) => ({
  target: null,
  open: (agentId) => set({ target: { agentId } }),
  close: () => set({ target: null }),
}));

/** The room launcher: a new room in a project. */
interface RoomLauncherState {
  target: { projectId?: string } | null;
  open: (projectId?: string) => void;
  close: () => void;
}

export const useRoomLauncher = create<RoomLauncherState>((set) => ({
  target: null,
  open: (projectId) => set({ target: { projectId } }),
  close: () => set({ target: null }),
}));

/** Claude Code's subagent editor: a new file, or an existing one (its asset info). */
interface SubagentEditorState {
  target: { path?: string; scope?: 'user' | 'project' } | null;
  open: (target?: { path?: string; scope?: 'user' | 'project' }) => void;
  close: () => void;
}

export const useSubagentEditor = create<SubagentEditorState>((set) => ({
  target: null,
  open: (target = {}) => set({ target }),
  close: () => set({ target: null }),
}));

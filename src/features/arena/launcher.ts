import { create } from 'zustand';

/**
 * The arena launch panel: opened from the composer, the palette, a project's
 * "+" menu or `/arena`, with whatever text was there as the task.
 */
interface LauncherState {
  target: { projectId: string; prompt: string } | null;
  open: (projectId: string, prompt?: string) => void;
  close: () => void;
}

export const useArenaLauncher = create<LauncherState>((set) => ({
  target: null,
  open: (projectId, prompt = '') => set({ target: { projectId, prompt } }),
  close: () => set({ target: null }),
}));

import { create } from 'zustand';

/**
 * A one-line question — a name for a layout, a snippet, a watcher. `ask()`
 * resolves with the text, or null when dismissed (the webview has no
 * `prompt()`).
 */
export interface PromptRequest {
  title: string;
  description?: string;
  placeholder?: string;
  initial?: string;
  confirm?: string;
  /** The confirm button works with nothing typed (the answer is then ''). */
  allowEmpty?: boolean;
  resolve: (value: string | null) => void;
}

interface PromptState {
  current: PromptRequest | null;
  ask: (opts: Omit<PromptRequest, 'resolve'>) => Promise<string | null>;
  close: (value: string | null) => void;
}

export const usePrompt = create<PromptState>((set, get) => ({
  current: null,
  ask: (opts) =>
    new Promise<string | null>((resolve) => {
      get().current?.resolve(null);
      set({ current: { ...opts, resolve } });
    }),
  close: (value) => {
    const cur = get().current;
    set({ current: null });
    cur?.resolve(value);
  },
}));

export const askText = (opts: Omit<PromptRequest, 'resolve'>) => usePrompt.getState().ask(opts);

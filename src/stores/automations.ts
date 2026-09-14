import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { uid } from '@/lib/id';

/**
 * Automations: something happens (files change under a path, a clock ticks)
 * and something runs (a prompt goes to Claude, a command runs — and if it
 * fails, its output goes to Claude). Kept per project; the runner in
 * features/automations wires the triggers while the app is up.
 */
export type Trigger =
  | { kind: 'watch'; path: string; include?: string }
  | { kind: 'interval'; minutes: number }
  | { kind: 'daily'; at: string };

export type Action =
  | { kind: 'prompt'; text: string; session: 'active' | 'new' }
  | { kind: 'command'; command: string; onFailurePrompt?: string };

export interface Automation {
  id: string;
  name: string;
  projectId: string;
  enabled: boolean;
  trigger: Trigger;
  action: Action;
  lastRun?: number;
  lastResult?: string;
  runs: number;
}

interface AutomationsState {
  items: Automation[];
  add: (a: Omit<Automation, 'id' | 'runs'>) => Automation;
  update: (id: string, patch: Partial<Omit<Automation, 'id'>>) => void;
  remove: (id: string) => void;
  markRun: (id: string, result: string) => void;
}

export const useAutomations = create<AutomationsState>()(
  persist(
    (set) => ({
      items: [],
      add: (a) => {
        const item: Automation = { ...a, id: uid('auto'), runs: 0 };
        set((s) => ({ items: [...s.items, item] }));
        return item;
      },
      update: (id, patch) => set((s) => ({ items: s.items.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((a) => a.id !== id) })),
      markRun: (id, result) => set((s) => ({ items: s.items.map((a) => (a.id === id ? { ...a, lastRun: Date.now(), lastResult: result, runs: a.runs + 1 } : a)) })),
    }),
    { name: 'conduit.automations', version: 1, storage: durableStorage() },
  ),
);

export function describeTrigger(tr: Trigger): string {
  switch (tr.kind) {
    case 'watch':
      return `${tr.path || '.'}${tr.include ? ` (${tr.include})` : ''}`;
    case 'interval':
      return `every ${tr.minutes} min`;
    case 'daily':
      return `daily at ${tr.at}`;
  }
}

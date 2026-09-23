import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';

/**
 * The Studio — Claude's own room: a full-screen mode where the user looks at
 * their Claude Code setup (the user's `~/.claude`, or a project's `.claude`)
 * and builds it: skills, subagents, commands, memory files, MCP servers and
 * hooks, with a builder session beside that writes those files for them.
 *
 * What is remembered: where they were (scope, kind, selection), whether the
 * chat column was open, and the builder session of each scope, so coming
 * back continues the same conversation. Everything else is per launch.
 */
export type StudioScope = { kind: 'user' } | { kind: 'project'; projectId: string };
export type StudioKind = 'overview' | 'skills' | 'agents' | 'commands' | 'memory' | 'mcp' | 'hooks';

export const STUDIO_KINDS: StudioKind[] = ['overview', 'skills', 'agents', 'commands', 'memory', 'mcp', 'hooks'];

/** The storage key of a scope ('user' or 'project:<id>'). */
export function scopeKey(scope: StudioScope): string {
  return scope.kind === 'user' ? 'user' : `project:${scope.projectId}`;
}

interface StudioState {
  open: boolean;
  scope: StudioScope;
  kind: StudioKind;
  /** The item on the stage (a file path, a server name, a hook id); null = the kind's list alone / the overview. */
  selected: string | null;
  /** A new, unsaved item of `kind` is on the stage. */
  draft: boolean;
  chatOpen: boolean;
  /** The stage's editor has unsaved changes: a selection change waits (`pending`) until it is saved or discarded. */
  dirty: boolean;
  pending: { kind: StudioKind; selected: string | null; draft: boolean } | null;
  /** Bumped when a session of the Studio finishes a turn: catalogs that read the disk reload. */
  revision: number;
  /** The builder session of each scope key. */
  builders: Record<string, string>;
  /** A test session shown in the chat column instead of the builder, per scope key. */
  testing: Record<string, { sessionId: string; agent: string }>;

  setOpen: (v: boolean) => void;
  setScope: (scope: StudioScope) => void;
  /** Go somewhere; with unsaved changes the move is parked in `pending` instead. */
  go: (kind: StudioKind, selected?: string | null, draft?: boolean) => void;
  cancelPending: () => void;
  setDirty: (v: boolean) => void;
  setChatOpen: (v: boolean) => void;
  bump: () => void;
  setBuilder: (key: string, sessionId: string) => void;
  setTesting: (key: string, value: { sessionId: string; agent: string } | null) => void;
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      open: false,
      scope: { kind: 'user' },
      kind: 'overview',
      selected: null,
      draft: false,
      chatOpen: true,
      dirty: false,
      pending: null,
      revision: 0,
      builders: {},
      testing: {},

      setOpen: (open) => set({ open }),
      setScope: (scope) => set({ scope, kind: 'overview', selected: null, draft: false, dirty: false, pending: null }),
      go: (kind, selected = null, draft = false) => {
        if (get().dirty) {
          set({ pending: { kind, selected, draft } });
          return;
        }
        set({ kind, selected, draft, pending: null });
      },
      cancelPending: () => set({ pending: null }),
      setDirty: (dirty) => set((s) => (s.dirty === dirty ? s : { dirty })),
      setChatOpen: (chatOpen) => set({ chatOpen }),
      bump: () => set((s) => ({ revision: s.revision + 1 })),
      setBuilder: (key, sessionId) => set((s) => ({ builders: { ...s.builders, [key]: sessionId } })),
      setTesting: (key, value) =>
        set((s) => {
          const testing = { ...s.testing };
          if (value) testing[key] = value;
          else delete testing[key];
          return { testing };
        }),
    }),
    {
      name: 'conduit.studio',
      version: 1,
      storage: durableStorage(),
      partialize: (s) => ({ scope: s.scope, kind: s.kind, selected: s.selected, chatOpen: s.chatOpen, builders: s.builders }),
      migrate: (state) => state as StudioState,
    },
  ),
);

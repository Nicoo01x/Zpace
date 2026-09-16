import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaneContent, PaneNode } from '@/types/workspace';
import { uid } from '@/lib/id';

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'agents'
  | 'claude'
  | 'terminal'
  | 'git'
  | 'browser'
  | 'mascot'
  | 'notifications'
  | 'island'
  | 'automations'
  | 'mcp'
  | 'keyboard'
  | 'advanced'
  | 'plugins'
  | 'about';

export interface LightboxState {
  url: string;
  name?: string;
}

export interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  explorerOpen: boolean;
  gitPanelOpen: boolean;
  terminalPanelOpen: boolean;
  terminalPanelHeight: number;

  paletteOpen: boolean;
  paletteMode: 'commands' | 'files' | 'sessions';
  searchOpen: boolean;
  spotlightOpen: boolean;
  /** The entrance screen (greeting + dashboard), once per launch. */
  welcomeOpen: boolean;
  /** A pane shown alone, full size (Ctrl+Shift+Enter / the maximize button); null = the whole layout. */
  zoomedPaneId: string | null;
  /** Ctrl+Tab window stack: open flag and the deck order (front first). */
  stackOpen: boolean;
  stackOrder: string[];
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  onboardingDone: boolean;
  lightbox: LightboxState | null;
  diffViewer: { path: string; sessionId?: string; root?: string } | null;
  aboutOpen: boolean;
  summaryOpen: boolean;
  cloneOpen: boolean;
  /** Folder picked for a project that is being added (name + colour dialog). */
  newProject: { path: string } | null;
  /** Claude Code launch dialog target (project already resolved). */
  claudeLaunch: { projectId: string } | null;
  sidebarSections: { projects: boolean; agents: boolean; terminals: boolean; notes: boolean; plugins: boolean };
  /** Sidebar filter (Ctrl+Shift+S): narrows projects, sessions, terminals and notes by title. */
  sidebarFilterOpen: boolean;
  sidebarFilter: string;

  layout: PaneNode;
  activePaneId: string;
  /** Session that is currently focused in the workspace. */
  activeSessionId: string | null;
  /** Project selected in the sidebar (context for new terminals, notes, git). */
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;

  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  toggleExplorer: () => void;
  toggleGitPanel: () => void;
  toggleTerminalPanel: () => void;
  setTerminalPanelHeight: (h: number) => void;

  openPalette: (mode?: UIState['paletteMode']) => void;
  closePalette: () => void;
  setSearchOpen: (v: boolean) => void;
  setSpotlightOpen: (v: boolean) => void;
  setWelcomeOpen: (v: boolean) => void;
  toggleZoom: (paneId?: string) => void;
  setStackOpen: (v: boolean) => void;
  rotateStack: (dir: 1 | -1) => void;
  promoteStack: (id: string) => void;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setOnboardingDone: (v: boolean) => void;
  openLightbox: (state: LightboxState) => void;
  closeLightbox: () => void;
  openDiff: (path: string, sessionId?: string, root?: string) => void;
  closeDiff: () => void;
  setAboutOpen: (v: boolean) => void;
  setSummaryOpen: (v: boolean) => void;
  setCloneOpen: (v: boolean) => void;
  setNewProject: (v: { path: string } | null) => void;
  setClaudeLaunch: (v: { projectId: string } | null) => void;
  toggleSection: (s: 'projects' | 'agents' | 'terminals' | 'notes' | 'plugins') => void;
  setSidebarFilterOpen: (v: boolean) => void;
  setSidebarFilter: (q: string) => void;

  setActiveSession: (id: string | null) => void;
  setActivePane: (id: string) => void;
  /** `before` puts the new pane first (left / top) instead of after (right / bottom). */
  splitPane: (paneId: string, direction: 'horizontal' | 'vertical', content: PaneContent, before?: boolean) => void;
  closePane: (paneId: string) => void;
  setPaneContent: (paneId: string, content: PaneContent) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
  resetLayout: () => void;
}

function leaf(content: PaneContent): PaneNode {
  return { type: 'leaf', id: uid('pane'), content };
}

/** Bottom-up map: children first, then the node — a leaf replaced by a split is never re-visited. */
function mapTree(node: PaneNode, fn: (n: PaneNode) => PaneNode): PaneNode {
  if (node.type === 'split') {
    return fn({ ...node, children: [mapTree(node.children[0], fn), mapTree(node.children[1], fn)] });
  }
  return fn(node);
}

function removeLeaf(node: PaneNode, id: string): PaneNode | null {
  if (node.type === 'leaf') return node.id === id ? null : node;
  const a = removeLeaf(node.children[0], id);
  const b = removeLeaf(node.children[1], id);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return { ...node, children: [a, b] };
}

export function findFirstLeaf(node: PaneNode): PaneNode & { type: 'leaf' } {
  if (node.type === 'leaf') return node;
  return findFirstLeaf(node.children[0]);
}

export function collectLeaves(node: PaneNode, out: Array<PaneNode & { type: 'leaf' }> = []) {
  if (node.type === 'leaf') out.push(node);
  else {
    collectLeaves(node.children[0], out);
    collectLeaves(node.children[1], out);
  }
  return out;
}

const initialLeaf = leaf({ kind: 'empty' });

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      sidebarWidth: 264,
      explorerOpen: false,
      gitPanelOpen: false,
      terminalPanelOpen: false,
      terminalPanelHeight: 260,

      paletteOpen: false,
      paletteMode: 'commands',
      searchOpen: false,
      spotlightOpen: false,
      welcomeOpen: false,
      zoomedPaneId: null,
      stackOpen: false,
      stackOrder: [],
      settingsOpen: false,
      settingsSection: 'general',
      onboardingDone: false,
      lightbox: null,
      diffViewer: null,
      aboutOpen: false,
      summaryOpen: false,
      cloneOpen: false,
      newProject: null,
      claudeLaunch: null,
      sidebarSections: { projects: true, agents: true, terminals: true, notes: true, plugins: true },
      sidebarFilterOpen: false,
      sidebarFilter: '',

      layout: initialLeaf,
      activePaneId: initialLeaf.id,
      activeSessionId: null,
      activeProjectId: null,
      setActiveProject: (id) => set({ activeProjectId: id }),

      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarWidth: (w) => set({ sidebarWidth: Math.min(360, Math.max(220, Math.round(w))) }),
      toggleExplorer: () => set((s) => ({ explorerOpen: !s.explorerOpen })),
      toggleGitPanel: () => set((s) => ({ gitPanelOpen: !s.gitPanelOpen })),
      toggleTerminalPanel: () => set((s) => ({ terminalPanelOpen: !s.terminalPanelOpen })),
      setTerminalPanelHeight: (h) => set({ terminalPanelHeight: Math.min(700, Math.max(120, Math.round(h))) }),

      openPalette: (mode = 'commands') => set({ paletteOpen: true, paletteMode: mode }),
      closePalette: () => set({ paletteOpen: false }),
      setSearchOpen: (v) => set({ searchOpen: v }),
      setSpotlightOpen: (v) => set({ spotlightOpen: v }),
      setWelcomeOpen: (v) => set({ welcomeOpen: v }),
      toggleZoom: (paneId) =>
        set((s) => {
          const id = paneId ?? s.activePaneId;
          return s.zoomedPaneId === id ? { zoomedPaneId: null } : { zoomedPaneId: id, activePaneId: id };
        }),
      setStackOpen: (v) =>
        set((s) => {
          if (!v) return { stackOpen: false, stackOrder: [] };
          const ids = collectLeaves(s.layout).filter((l) => l.content.kind !== 'empty').map((l) => l.id);
          return { stackOpen: true, stackOrder: [s.activePaneId, ...ids.filter((id) => id !== s.activePaneId)].filter((id) => ids.includes(id)) };
        }),
      rotateStack: (dir) => set((s) => ({ stackOrder: s.stackOrder.length < 2 ? s.stackOrder : dir > 0 ? [...s.stackOrder.slice(1), s.stackOrder[0]] : [s.stackOrder[s.stackOrder.length - 1], ...s.stackOrder.slice(0, -1)] })),
      promoteStack: (id) => set((s) => ({ stackOrder: [id, ...s.stackOrder.filter((x) => x !== id)] })),
      openSettings: (section) => set((s) => ({ settingsOpen: true, settingsSection: section ?? s.settingsSection })),
      closeSettings: () => set({ settingsOpen: false }),
      setOnboardingDone: (v) => set({ onboardingDone: v }),
      openLightbox: (lightbox) => set({ lightbox }),
      closeLightbox: () => set({ lightbox: null }),
      openDiff: (path, sessionId, root) => set({ diffViewer: { path, sessionId, root } }),
      closeDiff: () => set({ diffViewer: null }),
      setAboutOpen: (v) => set({ aboutOpen: v }),
      setSummaryOpen: (v) => set({ summaryOpen: v }),
      setCloneOpen: (v) => set({ cloneOpen: v }),
      setNewProject: (v) => set({ newProject: v }),
      setClaudeLaunch: (claudeLaunch) => set({ claudeLaunch }),
      toggleSection: (k) => set((s) => ({ sidebarSections: { ...s.sidebarSections, [k]: !s.sidebarSections[k] } })),
      setSidebarFilterOpen: (v) => set(v ? { sidebarFilterOpen: true, sidebarOpen: true } : { sidebarFilterOpen: false, sidebarFilter: '' }),
      setSidebarFilter: (sidebarFilter) => set({ sidebarFilter }),

      setActiveSession: (id) => {
        const { layout, activePaneId } = get();
        // Put the session in the active pane (or first leaf).
        const leaves = collectLeaves(layout);
        const target = leaves.find((l) => l.id === activePaneId) ?? leaves[0];
        const next = id
          ? mapTree(layout, (n) => (n.type === 'leaf' && n.id === target.id ? { ...n, content: { kind: 'session', sessionId: id } } : n))
          : layout;
        set({ activeSessionId: id, layout: next });
      },
      setActivePane: (id) => {
        const leaves = collectLeaves(get().layout);
        const l = leaves.find((x) => x.id === id);
        set({ activePaneId: id, activeSessionId: l?.content.kind === 'session' ? l.content.sessionId : get().activeSessionId });
      },
      splitPane: (paneId, direction, content, before = false) => {
        const newLeaf = leaf(content);
        const next = mapTree(get().layout, (n) =>
          n.type === 'leaf' && n.id === paneId
            ? { type: 'split', id: uid('split'), direction, ratio: 0.5, children: before ? [newLeaf, n] : [n, newLeaf] }
            : n,
        );
        set({ layout: next, activePaneId: newLeaf.id });
      },
      closePane: (paneId) => {
        if (get().zoomedPaneId === paneId) set({ zoomedPaneId: null });
        const next = removeLeaf(get().layout, paneId) ?? leaf({ kind: 'empty' });
        const first = findFirstLeaf(next);
        set({
          layout: next,
          activePaneId: get().activePaneId === paneId ? first.id : get().activePaneId,
          activeSessionId: first.content.kind === 'session' ? first.content.sessionId : null,
        });
      },
      setPaneContent: (paneId, content) => {
        set({
          layout: mapTree(get().layout, (n) => (n.type === 'leaf' && n.id === paneId ? { ...n, content } : n)),
          activeSessionId: content.kind === 'session' ? content.sessionId : get().activeSessionId,
        });
      },
      setSplitRatio: (splitId, ratio) => {
        set({
          layout: mapTree(get().layout, (n) =>
            n.type === 'split' && n.id === splitId ? { ...n, ratio: Math.min(0.85, Math.max(0.15, ratio)) } : n,
          ),
        });
      },
      resetLayout: () => {
        const l = leaf({ kind: 'empty' });
        set({ layout: l, activePaneId: l.id, activeSessionId: null });
      },
    }),
    {
      name: 'conduit.ui',
      version: 1,
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        sidebarWidth: s.sidebarWidth,
        explorerOpen: s.explorerOpen,
        gitPanelOpen: s.gitPanelOpen,
        terminalPanelOpen: s.terminalPanelOpen,
        terminalPanelHeight: s.terminalPanelHeight,
        onboardingDone: s.onboardingDone,
        sidebarSections: s.sidebarSections,
        layout: s.layout,
        activePaneId: s.activePaneId,
        activeSessionId: s.activeSessionId,
        activeProjectId: s.activeProjectId,
      }),
    },
  ),
);

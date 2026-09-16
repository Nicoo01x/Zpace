import { create } from 'zustand';
import type { ClipboardChange, Foreground, NotificationsAccess, Power, Volume, WinNotification } from '@/native/desktop';
import type { MediaNow } from '@/native/media';
import type { ChipData, IslandConfig, LiveState, SerialNotification } from './protocol';

/**
 * The desktop island's own state: what the main window sent (config, Zpace
 * notifications, the live agent, plugin chips) and what Windows sent (media,
 * toasts, the app in front, volume, battery, clipboard) — plus what the pill
 * is showing right now. A "card" is one thing unfolded; cards queue by
 * priority, transient ones (volume, an app switch) are dropped rather than
 * queued, and anything that needs an answer holds the pill until it gets one.
 * Never persisted: the island is only as alive as the windows feeding it.
 */
export type Card =
  | { kind: 'zpace'; id: string; n: SerialNotification }
  | { kind: 'win'; id: string; n: WinNotification }
  | { kind: 'media'; id: string }
  | { kind: 'app'; id: string; app: Foreground }
  | { kind: 'volume'; id: string }
  | { kind: 'power'; id: string; power: Power; reason: 'plugged' | 'unplugged' | 'low' }
  | { kind: 'clipboard'; id: string; change: ClipboardChange }
  | { kind: 'menu'; id: string };

export interface Shown {
  card: Card;
  /** Higher wins the pill; equal replaces. */
  priority: number;
  /** ms unfolded; null = until dismissed. */
  foldMs: number | null;
  /** When it was (last) shown — the fold timer counts from here. */
  at: number;
}

/** Kinds that are moments, not messages: missed is fine, they never wait in the queue. */
const TRANSIENT: ReadonlySet<Card['kind']> = new Set(['volume', 'app', 'clipboard', 'menu']);

interface IslandState {
  config: IslandConfig | null;
  items: SerialNotification[];
  live: LiveState | null;
  chips: Record<string, ChipData>;
  media: MediaNow | null;
  /** When `media` arrived (the position is extrapolated from it while playing). */
  mediaAt: number;
  foreground: Foreground | null;
  volume: Volume | null;
  power: Power | null;
  win: WinNotification[];
  winAccess: NotificationsAccess | null;
  /** Windows toasts that arrived since the centre was last opened. */
  winUnseen: number;

  shown: Shown | null;
  queue: Shown[];
  open: boolean;
  hover: boolean;
  /** Nothing happened for a while (see config.idle). */
  idle: boolean;
  /** Hidden from the menu until the next card. */
  hidden: boolean;
  /** Bumps whenever something happens, so the idle timer restarts. */
  pulse: number;

  setConfig: (c: IslandConfig) => void;
  setItems: (items: SerialNotification[]) => void;
  setLive: (l: LiveState | null) => void;
  setChips: (c: Record<string, ChipData>) => void;
  setMedia: (m: MediaNow | null) => void;
  setForeground: (f: Foreground | null) => void;
  setVolume: (v: Volume | null) => void;
  setPower: (p: Power | null) => void;
  setWinAccess: (a: NotificationsAccess) => void;
  addWin: (added: WinNotification[], removed: number[]) => void;
  removeWin: (id: number) => void;
  clearWin: () => void;

  show: (card: Card, priority: number, foldMs: number | null) => void;
  /** The shown card is done: the next in line takes the pill. */
  fold: () => void;
  /** Drop a card wherever it is (shown or queued). */
  drop: (id: string) => void;
  setOpen: (open: boolean) => void;
  setHover: (hover: boolean) => void;
  setIdle: (idle: boolean) => void;
  setHidden: (hidden: boolean) => void;
}

const QUEUE_MAX = 6;

export const useIsland = create<IslandState>((set, get) => ({
  config: null,
  items: [],
  live: null,
  chips: {},
  media: null,
  mediaAt: 0,
  foreground: null,
  volume: null,
  power: null,
  win: [],
  winAccess: null,
  winUnseen: 0,
  shown: null,
  queue: [],
  open: false,
  hover: false,
  idle: false,
  hidden: false,
  pulse: 0,

  setConfig: (config) => set({ config }),
  setItems: (items) =>
    set((s) => {
      // A Zpace card whose notification went away (dismissed in the app) folds with it.
      const gone = s.shown?.card.kind === 'zpace' && !items.some((i) => i.id === s.shown?.card.id);
      return { items, ...(gone ? { shown: s.queue[0] ? { ...s.queue[0], at: Date.now() } : null, queue: s.queue.slice(1) } : {}) };
    }),
  setLive: (live) => set({ live }),
  setChips: (chips) => set({ chips }),
  setMedia: (m) =>
    set((s) => {
      // Position ticks arrive without the cover: keep the one we have for the same track.
      const media = m && m.same_art && s.media ? { ...m, thumbnail: s.media.thumbnail } : m;
      return { media, mediaAt: Date.now() };
    }),
  setForeground: (foreground) => set({ foreground }),
  setVolume: (volume) => set({ volume }),
  setPower: (power) => set({ power }),
  setWinAccess: (winAccess) => set({ winAccess }),
  addWin: (added, removed) =>
    set((s) => {
      const gone = new Set(removed);
      const kept = s.win.filter((n) => !gone.has(n.id) && !added.some((a) => a.id === n.id));
      const win = [...added.slice().reverse(), ...kept].slice(0, 60);
      const shownGone = s.shown?.card.kind === 'win' && gone.has(s.shown.card.n.id);
      return {
        win,
        winUnseen: s.open ? 0 : s.winUnseen + added.length,
        queue: s.queue.filter((q) => !(q.card.kind === 'win' && gone.has(q.card.n.id))),
        ...(shownGone ? { shown: null } : {}),
      };
    }),
  removeWin: (id) => set((s) => ({ win: s.win.filter((n) => n.id !== id) })),
  clearWin: () => set({ win: [], winUnseen: 0 }),

  show: (card, priority, foldMs) => {
    const s = get();
    const next: Shown = { card, priority, foldMs, at: Date.now() };
    const patch: Partial<IslandState> = { idle: false, hidden: false, pulse: s.pulse + 1 };
    // Do not disturb: only what needs an answer (and the island's own menu) gets through.
    if (s.config?.dnd && !(card.kind === 'zpace' && card.n.sticky) && card.kind !== 'menu') {
      set(patch);
      return;
    }
    if (s.open && card.kind !== 'menu') {
      // The centre is open: the list shows it; nothing unfolds over it.
      set(patch);
      return;
    }
    const cur = s.shown;
    if (!cur) {
      set({ ...patch, shown: next, open: false });
      return;
    }
    // The island's own menu always comes up; whatever was there waits behind it.
    if (card.kind === 'menu') {
      const back = TRANSIENT.has(cur.card.kind) ? [] : [cur];
      set({ ...patch, shown: next, queue: [...back, ...s.queue].slice(0, QUEUE_MAX) });
      return;
    }
    // The same thing again (a volume tick, a card updated): swap in place, the timer restarts.
    if (cur.card.kind === card.kind && cur.card.id === card.id) {
      set({ ...patch, shown: next });
      return;
    }
    const curSticky = cur.foldMs === null;
    if (!curSticky && priority >= cur.priority) {
      // Take the pill; a message that was there goes back to the front of the line, a moment is gone.
      const back = TRANSIENT.has(cur.card.kind) ? [] : [cur];
      set({ ...patch, shown: next, queue: [...back, ...s.queue.filter((q) => q.card.id !== card.id)].slice(0, QUEUE_MAX) });
      return;
    }
    if (TRANSIENT.has(card.kind)) {
      set(patch);
      return;
    }
    set({ ...patch, queue: [...s.queue.filter((q) => q.card.id !== card.id), next].slice(0, QUEUE_MAX) });
  },
  fold: () =>
    set((s) => {
      const [head, ...rest] = s.queue;
      return { shown: head ? { ...head, at: Date.now() } : null, queue: rest };
    }),
  drop: (id) =>
    set((s) => {
      const queue = s.queue.filter((q) => q.card.id !== id);
      if (s.shown?.card.id !== id) return { queue };
      const [head, ...rest] = queue;
      return { shown: head ? { ...head, at: Date.now() } : null, queue: rest };
    }),
  setOpen: (open) => set((s) => ({ open, shown: open ? null : s.shown, winUnseen: open ? 0 : s.winUnseen, idle: false, hidden: false, pulse: s.pulse + 1 })),
  setHover: (hover) => set((s) => (hover ? { hover, idle: false, pulse: s.pulse + 1 } : { hover })),
  setIdle: (idle) => set({ idle }),
  setHidden: (hidden) => set({ hidden }),
}));

/** Unread in the island: Zpace notifications not yet read plus Windows toasts not yet seen here. */
export function unreadOf(s: Pick<IslandState, 'items' | 'winUnseen'>): number {
  return s.items.reduce((n, i) => n + (i.read ? 0 : 1), 0) + s.winUnseen;
}

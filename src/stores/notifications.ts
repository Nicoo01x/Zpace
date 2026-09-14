import type { ReactNode } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { uid } from '@/lib/id';

/**
 * The notification centre behind the island: every toast the app fires
 * lands here with a plain-text summary, so it can be read back later from
 * the title bar. The island "blooms" with the latest one — unfolding into a
 * card with the rich content (files touched, a commit's hash) and the
 * action — then folds back; the list keeps the last hundred across launches.
 * Rich nodes and callbacks live in `extras`, out of storage.
 */
export type NotificationVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'loading';
/** A recognisable mark instead of the variant glyph (rendered by the island, never persisted as a node). */
export type NotificationMark = 'claude' | 'codex' | 'gemini' | 'opencode' | 'commit' | 'push' | 'pull' | 'terminal' | 'note' | 'browser' | 'clipboard';

export interface AppNotification {
  id: string;
  variant: NotificationVariant;
  title: string;
  summary: string;
  at: number;
  read: boolean;
  mark?: NotificationMark;
  /** Stays unfolded until clicked or dismissed (a permission request). */
  sticky?: boolean;
  /** How long the island keeps it unfolded (ms); the island's defaults otherwise. */
  foldMs?: number;
}

export interface NotificationExtras {
  /** The rich description (a files list, deploy steps) shown while unfolded. */
  rich?: ReactNode;
  icon?: ReactNode;
  action?: { label: string; run: () => void };
}

export type NotificationInput = Omit<AppNotification, 'id' | 'at' | 'read'> & { id?: string } & NotificationExtras;

interface NotificationsState {
  items: AppNotification[];
  /** The one the island is showing right now (null = compact). */
  bloom: AppNotification | null;
  /** The centre panel under the island. */
  open: boolean;
  /** Where the island sits along the title bar: offset from the centre as a fraction of the window width (held and dragged there). */
  shift: number;
  extras: Record<string, NotificationExtras>;
  push: (n: NotificationInput) => AppNotification;
  /** Change one in place (a loading state that resolved) and unfold it again. */
  update: (id: string, patch: Partial<Omit<AppNotification, 'id'>> & NotificationExtras) => void;
  setBloom: (n: AppNotification | null) => void;
  setOpen: (open: boolean) => void;
  setShift: (shift: number) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

const MAX = 100;

function withExtras(extras: Record<string, NotificationExtras>, id: string, n: NotificationExtras): Record<string, NotificationExtras> {
  const e: NotificationExtras = { ...extras[id] };
  if (n.rich !== undefined) e.rich = n.rich;
  if (n.icon !== undefined) e.icon = n.icon;
  if (n.action !== undefined) e.action = n.action;
  return e.rich === undefined && e.icon === undefined && e.action === undefined ? extras : { ...extras, [id]: e };
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [],
      bloom: null,
      shift: 0,
      open: false,
      extras: {},
      push: (n) => {
        const item: AppNotification = { id: n.id ?? uid('ntf'), variant: n.variant, title: n.title, summary: n.summary, mark: n.mark, sticky: n.sticky, foldMs: n.foldMs, at: Date.now(), read: false };
        set((s) => ({
          items: [item, ...s.items.filter((i) => i.id !== item.id)].slice(0, MAX),
          bloom: s.open ? null : item,
          extras: withExtras(s.extras, item.id, n),
        }));
        return item;
      },
      update: (id, patch) =>
        set((s) => {
          const cur = s.items.find((i) => i.id === id);
          if (!cur) return {};
          const next: AppNotification = { ...cur, ...patch, id, at: Date.now(), read: false };
          return {
            items: [next, ...s.items.filter((i) => i.id !== id)],
            bloom: s.open ? null : next,
            extras: withExtras(s.extras, id, patch),
          };
        }),
      setBloom: (bloom) => set({ bloom }),
      setOpen: (open) => set((s) => ({ open, bloom: open ? null : s.bloom, items: open ? s.items.map((i) => (i.read ? i : { ...i, read: true })) : s.items })),
      markAllRead: () => set((s) => ({ items: s.items.map((i) => (i.read ? i : { ...i, read: true })) })),
      setShift: (shift) => set({ shift: Math.max(-0.5, Math.min(0.5, shift)) }),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id), bloom: s.bloom?.id === id ? null : s.bloom })),
      clear: () => set({ items: [], bloom: null, extras: {} }),
    }),
    // Loading states never come back from storage as such: a launch in the middle of a push is over.
    { name: 'conduit.notifications', version: 1, storage: durableStorage(), partialize: (s) => ({ items: s.items.filter((i) => i.variant !== 'loading'), shift: s.shift }) as NotificationsState },
  ),
);

export const unreadCount = (items: AppNotification[]): number => items.reduce((n, i) => n + (i.read ? 0 : 1), 0);

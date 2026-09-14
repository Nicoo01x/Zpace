import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { REPO } from '@/features/settings/author';

/**
 * The update on offer and where its install stands. `notes` are the
 * release's own text from GitHub (title, body, date) when the API answers;
 * otherwise the manifest's notes. `skipped` is the version the user
 * declined — it is not offered again until a newer one appears.
 */
export type UpdatePhase = 'offered' | 'downloading' | 'installed' | 'error';

export interface ReleaseNotes {
  title: string;
  body: string;
  date?: string;
  url?: string;
}

export interface OfferedUpdate {
  version: string;
  currentVersion: string;
  notes: ReleaseNotes;
  /** Runs the download; resolves when installed. */
  install: (onProgress: (done: number, total: number | null) => void) => Promise<void>;
}

interface UpdateState {
  offer: OfferedUpdate | null;
  phase: UpdatePhase;
  /** 0..1 while downloading; null when the size is unknown. */
  progress: number | null;
  error: string | null;
  open: boolean;
  skipped: string;
  setOffer: (offer: OfferedUpdate | null) => void;
  setOpen: (open: boolean) => void;
  skip: () => void;
  start: () => Promise<void>;
}

export const useUpdate = create<UpdateState>()(
  persist(
    (set, get) => ({
      offer: null,
      phase: 'offered',
      progress: null,
      error: null,
      open: false,
      skipped: '',
      setOffer: (offer) => set({ offer, phase: 'offered', progress: null, error: null, open: !!offer }),
      setOpen: (open) => set({ open }),
      skip: () => {
        const v = get().offer?.version ?? '';
        set({ skipped: v, open: false });
      },
      start: async () => {
        const offer = get().offer;
        if (!offer || get().phase === 'downloading') return;
        set({ phase: 'downloading', progress: null, error: null, open: true });
        try {
          await offer.install((done, total) => set({ progress: total ? Math.min(1, done / total) : null }));
          set({ phase: 'installed', progress: 1 });
        } catch (e) {
          set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
        }
      },
    }),
    { name: 'conduit.updater', version: 1, storage: durableStorage(), partialize: (s) => ({ skipped: s.skipped }) as UpdateState },
  ),
);

/** The release's own notes for a version tag (`v1.2.3` or `1.2.3`), or null when GitHub has none. */
export async function fetchReleaseNotes(version: string): Promise<ReleaseNotes | null> {
  for (const tag of [`v${version}`, version]) {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) continue;
      const r = (await res.json()) as { name?: string; body?: string; published_at?: string; html_url?: string };
      return { title: r.name?.trim() || `Zpace ${version}`, body: (r.body ?? '').trim(), date: r.published_at, url: r.html_url };
    } catch {
      /* offline, or rate limited — the manifest's notes will do */
    }
  }
  return null;
}

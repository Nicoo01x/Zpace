import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { uid } from '@/lib/id';
import { t } from '@/i18n';
import { readClipboardText } from '@/lib/clipboard';

/**
 * Two small memories for the composer: the clipboard history (what was
 * copied in the app, plus what the system clipboard held when the window
 * came back into focus) and named snippets. Both reachable from the palette
 * — "Clipboard: …" and "Snippet: name" insert into the active composer —
 * and snippets also from `/snippet:name` in the chat.
 */
export interface Clip {
  id: string;
  text: string;
  at: number;
}

export interface Snippet {
  id: string;
  name: string;
  body: string;
  projectId?: string;
  at: number;
}

interface ClipsState {
  clips: Clip[];
  snippets: Snippet[];
  pushClip: (text: string) => void;
  removeClip: (id: string) => void;
  clearClips: () => void;
  addSnippet: (name: string, body: string, projectId?: string) => Snippet;
  removeSnippet: (id: string) => void;
}

const MAX_CLIPS = 40;

export const useClips = create<ClipsState>()(
  persist(
    (set) => ({
      clips: [],
      snippets: [],
      pushClip: (raw) => {
        const text = raw.replace(/\r\n/g, '\n');
        if (!text.trim() || text.length > 20_000) return;
        set((s) => {
          if (s.clips[0]?.text === text) return {};
          return { clips: [{ id: uid('clip'), text, at: Date.now() }, ...s.clips.filter((c) => c.text !== text)].slice(0, MAX_CLIPS) };
        });
      },
      removeClip: (id) => set((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),
      clearClips: () => set({ clips: [] }),
      addSnippet: (name, body, projectId) => {
        const sn: Snippet = { id: uid('snip'), name: name.trim(), body, projectId, at: Date.now() };
        set((s) => ({ snippets: [...s.snippets.filter((x) => !(x.name.toLowerCase() === sn.name.toLowerCase() && x.projectId === projectId)), sn] }));
        return sn;
      },
      removeSnippet: (id) => set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) })),
    }),
    { name: 'conduit.clips', version: 1, storage: durableStorage() },
  ),
);

/** A clip as one line for a list. */
export function clipLabel(text: string, max = 72): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** "Copied" on the island: the first line, how many lines — gone in a beat, never in the list. */
export function copied(text: string) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const first = lines[0]?.trim() ?? '';
  void import('@/features/notifications/toast-store').then(({ toast }) =>
    toast.neutral(lines.length > 1 ? t('Copied {n} lines', { n: lines.length }) : t('Copied'), { key: 'copied', duration: 1500, ephemeral: true, summary: first.length > 60 ? `${first.slice(0, 59)}…` : first, mark: 'clipboard' }),
  );
}

/**
 * Watches for copies: `copy` events inside the app, and the system clipboard
 * whenever the window regains focus (what you copied elsewhere). Idempotent.
 */
let watching = false;
export function watchClipboard() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  document.addEventListener('copy', () => {
    const sel = window.getSelection()?.toString();
    if (sel) {
      useClips.getState().pushClip(sel);
      copied(sel);
    } else {
      window.setTimeout(
        () =>
          void readClipboardText().then((t) => {
            if (!t) return;
            useClips.getState().pushClip(t);
            copied(t);
          }),
        50,
      );
    }
  });
  document.addEventListener('cut', () => {
    const sel = window.getSelection()?.toString();
    if (sel) useClips.getState().pushClip(sel);
  });
  window.addEventListener('focus', () => {
    void readClipboardText().then((t) => t && useClips.getState().pushClip(t));
  });
}

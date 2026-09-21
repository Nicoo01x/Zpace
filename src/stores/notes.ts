import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardDoc, Note } from '@/types/workspace';
import { uid } from '@/lib/id';
import { t } from '@/i18n';

export interface NotesState {
  notes: Record<string, Note>;
  createNote: (input?: Partial<Pick<Note, 'title' | 'body' | 'projectId' | 'folderId' | 'tags' | 'kind'>>) => Note;
  updateNote: (id: string, patch: Partial<Omit<Note, 'id' | 'createdAt'>>) => void;
  removeNote: (id: string) => void;
  duplicateNote: (id: string) => Note | undefined;
  hydrate: (notes: Record<string, Note>) => void;
}

/** Hydration from SQLite replaces what came from localStorage, but keeps what this launch created before the database answered. */
const BOOT_AT = Date.now();
/** What a note is called on screen: its title, or the translated "Untitled" / "Board" while it has none. */
export function noteTitle(note: { title?: string; kind?: string }): string {
  const raw = (note.title ?? '').trim();
  if (raw && raw !== 'Untitled' && raw !== 'Board') return raw;
  return t(note.kind === 'board' ? 'Board' : 'Untitled');
}

export const useNotes = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: {},
      createNote: (input = {}) => {
        const now = Date.now();
        const note: Note = {
          id: uid('note'),
          title: input.title ?? '',
          body: input.body ?? (input.kind === 'board' ? JSON.stringify(emptyBoard()) : ''),
          kind: input.kind ?? 'text',
          tags: input.tags ?? [],
          projectId: input.projectId,
          folderId: input.folderId,
          pinned: false,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ notes: { ...s.notes, [note.id]: note } }));
        return note;
      },
      updateNote: (id, patch) =>
        set((s) => {
          const cur = s.notes[id];
          if (!cur) return {};
          return { notes: { ...s.notes, [id]: { ...cur, ...patch, updatedAt: Date.now() } } };
        }),
      removeNote: (id) =>
        set((s) => {
          const notes = { ...s.notes };
          delete notes[id];
          return { notes };
        }),
      duplicateNote: (id) => {
        const src = get().notes[id];
        if (!src) return undefined;
        const copy: Note = { ...src, id: uid('note'), title: `${src.title} (copy)`, pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
        set((s) => ({ notes: { ...s.notes, [copy.id]: copy } }));
        return copy;
      },
      hydrate: (notes) => set((s) => ({ notes: { ...notes, ...Object.fromEntries(Object.entries(s.notes).filter(([id, n]) => !notes[id] && n.createdAt >= BOOT_AT)) } })),
    }),
    { name: 'conduit.notes', version: 1 },
  ),
);

export function emptyBoard(): BoardDoc {
  return { cards: [], edges: [], live: {}, view: { x: 0, y: 0, zoom: 1 }, showLive: true };
}

/** Parse a board note body; tolerant of an empty or broken body. */
export function parseBoard(body: string): BoardDoc {
  try {
    const d = JSON.parse(body) as Partial<BoardDoc>;
    return { ...emptyBoard(), ...d, cards: d.cards ?? [], edges: d.edges ?? [], live: d.live ?? {}, view: d.view ?? { x: 0, y: 0, zoom: 1 } };
  } catch {
    return emptyBoard();
  }
}

/** The project's board note (created on first use). */
export function projectBoard(projectId: string): Note {
  const state = useNotes.getState();
  const existing = Object.values(state.notes).find((n) => n.kind === 'board' && n.projectId === projectId && n.tags.includes('project-board'));
  if (existing) return existing;
  return state.createNote({ kind: 'board', projectId, title: 'Board', tags: ['project-board'] });
}

export function sortedNotes(notes: Record<string, Note>): Note[] {
  return Object.values(notes).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

/** First few non-empty lines of the body with Markdown markers stripped — a sticky-note preview. */
export function notePreview(note: Note, lines = 5): string {
  if (note.kind === 'board') {
    const b = parseBoard(note.body);
    return b.cards.length ? b.cards.slice(0, lines).map((c) => `▢ ${c.title || 'Card'}`).join('\n') : 'Empty board';
  }
  return note.body
    .split('\n')
    .map((l) =>
      l
        .replace(/^#+\s*/, '')
        .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, '☐ ')
        .replace(/^\s*[-*+]\s+/, '• ')
        .replace(/[*_`>]/g, '')
        .trim(),
    )
    .filter((l) => l.length > 0)
    .slice(0, lines)
    .join('\n');
}

/** First non-empty line of the body, for previews. */
export function noteExcerpt(note: Note, max = 90): string {
  if (note.kind === 'board') {
    const n = parseBoard(note.body).cards.length;
    return n ? `Board · ${n} ${n === 1 ? 'card' : 'cards'}` : 'Empty board';
  }
  const line = note.body
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/[*_`>]/g, '').trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

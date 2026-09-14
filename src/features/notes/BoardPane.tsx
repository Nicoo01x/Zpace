import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AgentKind } from '@/features/agent/agents';
import { Plus, Minus, Maximize2, Trash2, Link2, Eye, EyeOff, FileText, SquareTerminal, StickyNote, Folder } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { uid } from '@/lib/id';
import { basename } from '@/lib/format';
import { useNotes, parseBoard, noteTitle } from '@/stores/notes';
import { useProjects } from '@/stores/projects';
import { useSessions, sessionsForProject } from '@/stores/sessions';
import { useTerminals } from '@/stores/terminals';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from '@/features/agent/BrandIcon';
import { useEnvironment } from '@/stores/environment';
import { useUI } from '@/stores/ui';
import { ChevronDown, NotebookPen, Sparkles } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { StatusDot } from '@/components/ui/StatusDot';
import { AgentLogo } from '@/features/agent/BrandIcon';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import type { BoardCard, BoardColor, BoardDoc, Note } from '@/types/workspace';
import { t } from '@/i18n';

/**
 * A whiteboard: dotted paper you can pan and zoom, sticky cards you can write
 * on, move and link with curves. A project's board (the eye on the folder)
 * also draws what is live in that project — agent sessions with their status,
 * the files they touched, terminals and notes — as nodes you can arrange and
 * connect to your own cards. Double-click the paper for a new card.
 */

const GRID = 24;
const CARD_W = 220;
const COLORS: Record<BoardColor, { bg: string; head: string; ink: string }> = {
  yellow: { bg: '#fff8c2', head: '#f9ea86', ink: '#3d3200' },
  blue: { bg: '#dfe9ff', head: '#bcd0ff', ink: '#15265b' },
  green: { bg: '#dcf5e2', head: '#b3e9c1', ink: '#0d3b22' },
  pink: { bg: '#ffe0ec', head: '#ffbfd7', ink: '#5b0f2e' },
  grey: { bg: '#ececec', head: '#d6d6d6', ink: '#222' },
};

type LiveKind = 'project' | 'session' | 'terminal' | 'note' | 'file';
interface LiveNode {
  id: string;
  kind: LiveKind;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status?: 'running' | 'waiting' | 'error' | 'idle';
  agent?: AgentKind;
  open: () => void;
}

interface Pt {
  x: number;
  y: number;
}

export const BoardPane = memo(function BoardPane({ noteId }: { noteId: string }) {
  const note = useNotes((s) => s.notes[noteId]);
  const update = useNotes((s) => s.updateNote);
  const [doc, setDoc] = useState<BoardDoc>(() => parseBoard(note?.body ?? ''));
  const [loadedFor, setLoadedFor] = useState(noteId);
  if (loadedFor !== noteId && note) {
    setLoadedFor(noteId);
    setDoc(parseBoard(note.body));
  }

  // Persist (debounced) — the board is the note's body.
  const saveTimer = useRef<number | null>(null);
  const dirty = useRef(false);
  const commit = useCallback(
    (next: BoardDoc | ((d: BoardDoc) => BoardDoc)) => {
      setDoc((d) => (typeof next === 'function' ? next(d) : next));
      dirty.current = true;
    },
    [],
  );
  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      dirty.current = false;
      update(noteId, { body: JSON.stringify(doc) });
    }, 300);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [doc, noteId, update]);

  if (!note) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('Board deleted')}</div>;
  return <Board note={note} doc={doc} commit={commit} />;
});

function Board({ note, doc, commit }: { note: Note; doc: BoardDoc; commit: (next: BoardDoc | ((d: BoardDoc) => BoardDoc)) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ from: string; to: Pt } | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [focusCard, setFocusCard] = useState<string | null>(null);
  const isProjectBoard = note.tags.includes('project-board') && !!note.projectId;
  const live = useLiveNodes(isProjectBoard && doc.showLive ? note.projectId! : null, doc.live);
  const { openClaudeTerminal, openAgentTerminal, openTerminalPane, newSession, newNote } = useWorkspaceActions();
  const codex = useEnvironment((s) => s.report?.codex?.found ?? false);
  const gemini = useEnvironment((s) => s.report?.gemini?.found ?? false);
  const opencode = useEnvironment((s) => s.report?.opencode?.found ?? false);
  /** New things open in a pane beside the board, so the board stays in view and shows them as nodes. */
  const beside = (fn: () => unknown) => {
    const ui = useUI.getState();
    ui.splitPane(ui.activePaneId, 'horizontal', { kind: 'empty' });
    if (isProjectBoard) commit((d) => ({ ...d, showLive: true }));
    void fn();
  };

  const { view } = doc;
  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = hostRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left - view.x) / view.zoom, y: (clientY - r.top - view.y) / view.zoom };
    },
    [view],
  );

  /* ------------------------------ pan / zoom ------------------------------ */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = host.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        commit((d) => {
          const zoom = Math.min(2.5, Math.max(0.25, d.view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
          const k = zoom / d.view.zoom;
          return { ...d, view: { zoom, x: px - (px - d.view.x) * k, y: py - (py - d.view.y) * k } };
        });
      } else {
        commit((d) => ({ ...d, view: { ...d.view, x: d.view.x - e.deltaX, y: d.view.y - e.deltaY } }));
      }
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [commit]);

  const pan = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    setSelected(null);
    pan.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onBackgroundMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pan.current) {
      const { sx, sy, ox, oy } = pan.current;
      commit((d) => ({ ...d, view: { ...d.view, x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) } }));
    }
    if (linking) setLinking({ ...linking, to: toWorld(e.clientX, e.clientY) });
  };
  const onBackgroundUp = () => {
    pan.current = null;
    setPanning(false);
    if (linking) {
      if (hoverNode && hoverNode !== linking.from) addEdge(linking.from, hoverNode);
      setLinking(null);
    }
  };

  /* -------------------------------- cards --------------------------------- */
  const addCard = (at?: Pt, color: BoardColor = 'yellow') => {
    const host = hostRef.current!.getBoundingClientRect();
    const p = at ?? toWorld(host.left + host.width / 2, host.top + host.height / 2);
    const card: BoardCard = { id: uid('card'), x: Math.round(p.x - CARD_W / 2), y: Math.round(p.y - 40), w: CARD_W, title: '', body: '', color };
    commit((d) => ({ ...d, cards: [...d.cards, card] }));
    setSelected(card.id);
    setFocusCard(card.id);
  };
  const patchCard = (id: string, p: Partial<BoardCard>) => commit((d) => ({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const removeCard = (id: string) => {
    commit((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id), edges: d.edges.filter((e) => e.from !== id && e.to !== id) }));
    if (selected === id) setSelected(null);
  };
  const moveNode = (id: string, x: number, y: number, isLive: boolean) => {
    if (isLive) commit((d) => ({ ...d, live: { ...d.live, [id]: { x, y } } }));
    else patchCard(id, { x, y });
  };
  const addEdge = (from: string, to: string) => {
    commit((d) => (d.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from)) ? d : { ...d, edges: [...d.edges, { id: uid('edge'), from, to }] }));
  };
  const removeEdge = (id: string) => commit((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (doc.cards.some((c) => c.id === selected)) removeCard(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, doc.cards]);

  /* --------------------------------- edges -------------------------------- */
  const boxes = useMemo(() => {
    const m = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const c of doc.cards) m.set(c.id, { x: c.x, y: c.y, w: c.w, h: cardHeight(c) });
    for (const n of live) m.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
    return m;
  }, [doc.cards, live]);
  const center = (id: string): Pt | null => {
    const b = boxes.get(id);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  };
  const edges = doc.edges.map((e) => ({ e, a: center(e.from), b: center(e.to) })).filter((x) => x.a && x.b) as Array<{ e: BoardDoc['edges'][number]; a: Pt; b: Pt }>;
  const liveEdges = useMemo(() => {
    const out: Array<{ id: string; a: Pt; b: Pt }> = [];
    for (const n of live) {
      if (n.kind === 'file' && n.subtitle) {
        const from = boxes.get(n.subtitle);
        if (from) out.push({ id: `${n.subtitle}->${n.id}`, a: { x: from.x + from.w / 2, y: from.y + from.h / 2 }, b: { x: n.x + n.w / 2, y: n.y + n.h / 2 } });
      } else if (n.kind !== 'project') {
        const hub = boxes.get('project');
        if (hub) out.push({ id: `project->${n.id}`, a: { x: hub.x + hub.w / 2, y: hub.y + hub.h / 2 }, b: { x: n.x + n.w / 2, y: n.y + n.h / 2 } });
      }
    }
    return out;
  }, [live, boxes]);

  const fit = () => {
    const all = Array.from(boxes.values());
    if (!all.length) return commit((d) => ({ ...d, view: { x: 0, y: 0, zoom: 1 } }));
    const minX = Math.min(...all.map((b) => b.x)) - 60;
    const minY = Math.min(...all.map((b) => b.y)) - 60;
    const maxX = Math.max(...all.map((b) => b.x + b.w)) + 60;
    const maxY = Math.max(...all.map((b) => b.y + b.h)) + 60;
    const r = hostRef.current!.getBoundingClientRect();
    const zoom = Math.min(1.5, Math.max(0.25, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))));
    commit((d) => ({ ...d, view: { zoom, x: (r.width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (r.height - (maxY - minY) * zoom) / 2 - minY * zoom } }));
  };
  const zoomBy = (k: number) => {
    const r = hostRef.current!.getBoundingClientRect();
    const px = r.width / 2;
    const py = r.height / 2;
    commit((d) => {
      const zoom = Math.min(2.5, Math.max(0.25, d.view.zoom * k));
      const kk = zoom / d.view.zoom;
      return { ...d, view: { zoom, x: px - (px - d.view.x) * kk, y: py - (py - d.view.y) * kk } };
    });
  };

  // A board opened for the first time (default view) starts centred — or fitted to what it already shows.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current) return;
    const host = hostRef.current;
    if (!host) return;
    const isDefault = view.x === 0 && view.y === 0 && view.zoom === 1;
    if (!isDefault) {
      framed.current = true;
      return;
    }
    if (boxes.size === 0) {
      const r = host.getBoundingClientRect();
      if (r.width === 0) return;
      framed.current = true;
      commit((d) => ({ ...d, view: { x: Math.round(r.width / 2), y: Math.round(r.height / 2), zoom: 1 } }));
      return;
    }
    framed.current = true;
    fit();
    // Runs once, when the board first has a size and its nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes.size]);

  const linkPath = (a: Pt, b: Pt) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.4);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  return (
    <div
      ref={hostRef}
      className="board relative h-full w-full select-none overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle, var(--board-dot) 1px, transparent 1.4px)',
        backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        cursor: panning ? 'grabbing' : 'default',
      }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onBackgroundMove}
      onPointerUp={onBackgroundUp}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) addCard(toWorld(e.clientX, e.clientY));
      }}
    >
      {/* world */}
      <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
        <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1} style={{ pointerEvents: 'none' }}>
          {liveEdges.map((l) => (
            <path key={l.id} d={linkPath(l.a, l.b)} fill="none" stroke="var(--board-live-edge)" strokeWidth={1.5} strokeDasharray="4 5" />
          ))}
          {edges.map(({ e, a, b }) => (
            <g key={e.id} style={{ pointerEvents: 'auto' }}>
              <path d={linkPath(a, b)} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer" onClick={() => removeEdge(e.id)} />
              <path d={linkPath(a, b)} fill="none" stroke="var(--board-edge)" strokeWidth={2} />
            </g>
          ))}
          {linking ? (() => {
            const a = center(linking.from);
            return a ? <path d={linkPath(a, linking.to)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" /> : null;
          })() : null}
        </svg>

        {live.map((n) => (
          <LiveNodeView
            key={n.id}
            node={n}
            zoom={view.zoom}
            selected={selected === n.id}
            onSelect={() => setSelected(n.id)}
            onMove={(x, y) => moveNode(n.id, x, y, true)}
            onHover={(v) => setHoverNode(v ? n.id : null)}
            onLinkStart={(p) => setLinking({ from: n.id, to: p })}
            linking={!!linking}
          />
        ))}
        {doc.cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            zoom={view.zoom}
            selected={selected === c.id}
            onSelect={() => setSelected(c.id)}
            onMove={(x, y) => moveNode(c.id, x, y, false)}
            onPatch={(p) => patchCard(c.id, p)}
            onRemove={() => removeCard(c.id)}
            onHover={(v) => setHoverNode(v ? c.id : null)}
            onLinkStart={(p) => setLinking({ from: c.id, to: p })}
            linking={!!linking}
            autoFocus={focusCard === c.id}
            onFocused={() => setFocusCard(null)}
          />
        ))}
      </div>

      {/* toolbar */}
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-surface-raised p-1 shadow-popover">
        <Tooltip content={t('New card (double-click the board)')} side="bottom">
          <button type="button" onClick={() => addCard()} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-primary hover:bg-surface-hover">
            <Plus className="size-[14px]" /> {t('Card')}
          </button>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-primary hover:bg-surface-hover data-[state=open]:bg-surface-active">
              {t('Add')} <ChevronDown className="size-[13px] text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6}>
            <DropdownMenuLabel>{t('Opens beside the board')}</DropdownMenuLabel>
            <DropdownMenuItem icon={<ClaudeLogo />} onSelect={() => beside(() => openClaudeTerminal({ projectId: note.projectId }))}>
              {t('Claude Code')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Sparkles />} onSelect={() => beside(() => newSession(note.projectId))}>
              {t('Structured session (chat view)')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<CodexLogo />} disabled={!codex} onSelect={() => beside(() => openAgentTerminal('codex', { projectId: note.projectId }))}>
              Codex{!codex ? <span className="ml-auto pl-3 text-meta text-muted">{t('not installed')}</span> : null}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<GeminiLogo />} disabled={!gemini} onSelect={() => beside(() => openAgentTerminal('gemini', { projectId: note.projectId }))}>
              Gemini CLI{!gemini ? <span className="ml-auto pl-3 text-meta text-muted">{t('not installed')}</span> : null}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<OpenCodeLogo />} disabled={!opencode} onSelect={() => beside(() => openAgentTerminal('opencode', { projectId: note.projectId }))}>
              OpenCode{!opencode ? <span className="ml-auto pl-3 text-meta text-muted">{t('not installed')}</span> : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<SquareTerminal />} onSelect={() => beside(() => openTerminalPane({ projectId: note.projectId ?? null }))}>
              {t('Terminal')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<NotebookPen />} onSelect={() => beside(() => newNote({ projectId: note.projectId ?? null }))}>
              {t('Note')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isProjectBoard ? (
          <Tooltip content={doc.showLive ? t('Hide agents, terminals, notes and files') : t('Show what is live in the project')} side="bottom">
            <button
              type="button"
              onClick={() => commit((d) => ({ ...d, showLive: !d.showLive }))}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium hover:bg-surface-hover', doc.showLive ? 'text-primary' : 'text-muted')}
            >
              {doc.showLive ? <Eye className="size-[14px]" /> : <EyeOff className="size-[14px]" />} {t('Live')}
            </button>
          </Tooltip>
        ) : null}
        <span className="mx-0.5 h-4 w-px bg-border" />
        <IconButton label={t('Zoom out')} size="xs" onClick={() => zoomBy(1 / 1.2)}>
          <Minus />
        </IconButton>
        <button type="button" onClick={() => commit((d) => ({ ...d, view: { ...d.view, zoom: 1 } }))} className="w-11 text-center text-[11.5px] tabular text-secondary hover:text-primary">
          {Math.round(view.zoom * 100)}%
        </button>
        <IconButton label={t('Zoom in')} size="xs" onClick={() => zoomBy(1.2)}>
          <Plus />
        </IconButton>
        <IconButton label={t('Fit everything')} size="xs" onClick={fit}>
          <Maximize2 />
        </IconButton>
      </div>
      {doc.cards.length === 0 && live.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12.5px] text-muted">{t('Double-click anywhere to add a card · drag to pan · Ctrl + wheel to zoom')}</div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function cardHeight(c: BoardCard): number {
  const lines = Math.max(1, c.body.split('\n').length + Math.floor(c.body.length / 34));
  return 36 + Math.min(12, lines) * 18 + 16;
}

function useDrag(zoom: number, start: Pt, onMove: (x: number, y: number) => void, onSelect: () => void) {
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('input, textarea, button, [data-link-handle]')) return;
      e.stopPropagation();
      onSelect();
      drag.current = { sx: e.clientX, sy: e.clientY, ox: start.x, oy: start.y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      const dx = (e.clientX - drag.current.sx) / zoom;
      const dy = (e.clientY - drag.current.sy) / zoom;
      if (!drag.current.moved && Math.hypot(dx, dy) < 2) return;
      drag.current.moved = true;
      onMove(Math.round(drag.current.ox + dx), Math.round(drag.current.oy + dy));
    },
    onPointerUp: () => {
      drag.current = null;
    },
  };
}

function LinkHandle({ onStart }: { onStart: (p: Pt) => void }) {
  return (
    <Tooltip content={t('Drag to link')} side="right">
      <button
        type="button"
        data-link-handle
        aria-label={t('Link')}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          onStart({ x: r.right, y: r.top + r.height / 2 });
        }}
        className="absolute -right-2.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised text-muted opacity-0 shadow-[0_0_0_1px_var(--border)] transition-opacity group-hover/node:opacity-100 hover:text-primary"
      >
        <Link2 className="size-[11px]" />
      </button>
    </Tooltip>
  );
}

function CardView({ card, zoom, selected, onSelect, onMove, onPatch, onRemove, onHover, onLinkStart, linking, autoFocus, onFocused }: { card: BoardCard; zoom: number; selected: boolean; onSelect: () => void; onMove: (x: number, y: number) => void; onPatch: (p: Partial<BoardCard>) => void; onRemove: () => void; onHover: (v: boolean) => void; onLinkStart: (p: Pt) => void; linking: boolean; autoFocus?: boolean; onFocused?: () => void }) {
  const drag = useDrag(zoom, { x: card.x, y: card.y }, onMove, onSelect);
  const c = COLORS[card.color] ?? COLORS.yellow;
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    titleRef.current?.focus();
    onFocused?.();
  }, [autoFocus, onFocused]);
  return (
    <div
      className={cn('group/node absolute flex flex-col rounded-[10px] shadow-[0_2px_8px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]', selected && 'shadow-[0_0_0_2px_var(--accent),0_4px_14px_rgba(0,0,0,0.16)]', linking && 'cursor-crosshair')}
      style={{ left: card.x, top: card.y, width: card.w, background: c.bg, color: c.ink }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerUp={(e) => {
        // Finishing a link on this card is handled by the board's pointerup via hover state.
        drag.onPointerUp();
        void e;
      }}
      {...{ onPointerDown: drag.onPointerDown, onPointerMove: drag.onPointerMove }}
    >
      <div className="flex h-9 items-center gap-1 rounded-t-[10px] pl-3 pr-1" style={{ background: c.head }}>
        <input
          ref={titleRef}
          value={card.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder={t('Title')}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:opacity-50"
          style={{ color: c.ink }}
        />
        <div className="hidden items-center gap-0.5 group-hover/node:flex">
          {(Object.keys(COLORS) as BoardColor[]).map((k) => (
            <button key={k} type="button" aria-label={`Colour ${k}`} onClick={() => onPatch({ color: k })} className={cn('size-3 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]', card.color === k && 'ring-1 ring-black/40')} style={{ background: COLORS[k].head }} />
          ))}
          <button type="button" aria-label={t('Delete card')} onClick={onRemove} className="ml-1 inline-flex size-5 items-center justify-center rounded-[4px] opacity-70 hover:bg-black/10 hover:opacity-100">
            <Trash2 className="size-[11px]" />
          </button>
        </div>
      </div>
      <textarea
        value={card.body}
        onChange={(e) => onPatch({ body: e.target.value })}
        placeholder={t('Write…')}
        spellCheck={false}
        rows={Math.max(2, Math.min(12, card.body.split('\n').length + Math.floor(card.body.length / 34)))}
        className="w-full resize-none bg-transparent px-3 py-2 text-[12.5px] leading-[1.45] outline-none placeholder:opacity-50"
        style={{ color: c.ink }}
      />
      <LinkHandle onStart={onLinkStart} />
    </div>
  );
}

function LiveNodeView({ node, zoom, selected, onSelect, onMove, onHover, onLinkStart, linking }: { node: LiveNode; zoom: number; selected: boolean; onSelect: () => void; onMove: (x: number, y: number) => void; onHover: (v: boolean) => void; onLinkStart: (p: Pt) => void; linking: boolean }) {
  const drag = useDrag(zoom, { x: node.x, y: node.y }, onMove, onSelect);
  const icon =
    node.kind === 'session' ? (
      <AgentLogo agent={node.agent ?? 'claude'} size={14} />
    ) : node.kind === 'terminal' ? (
      node.agent ? <AgentLogo agent={node.agent} size={14} /> : <SquareTerminal className="size-[14px] text-muted" />
    ) : node.kind === 'note' ? (
      <StickyNote className="size-[14px] text-note-accent" />
    ) : node.kind === 'file' ? (
      <FileText className="size-[14px] text-muted" />
    ) : (
      <Folder className="size-[15px] text-accent-warm" />
    );
  return (
    <div
      className={cn(
        'group/node absolute flex items-center gap-2 rounded-lg bg-surface-raised px-2.5 text-[12.5px] text-primary shadow-[0_1px_4px_rgba(0,0,0,0.1),0_0_0_1px_var(--border)]',
        node.kind === 'project' && 'h-10 rounded-xl px-3 text-[13px] font-semibold',
        node.kind === 'file' && 'font-mono text-[11.5px]',
        selected && 'shadow-[0_0_0_2px_var(--accent),0_4px_14px_rgba(0,0,0,0.14)]',
        linking && 'cursor-crosshair',
      )}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        node.open();
      }}
      {...drag}
    >
      <span className="inline-flex shrink-0 items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{node.title}</span>
      {node.status ? <StatusDot status={node.status === 'idle' ? 'idle' : node.status} /> : null}
      {node.kind !== 'project' ? (
        <button type="button" aria-label={t('Open')} onClick={node.open} className="hidden shrink-0 rounded-[4px] px-1 text-[10.5px] text-muted hover:bg-surface-hover hover:text-primary group-hover/node:inline">
          {t('open')}
        </button>
      ) : null}
      <LinkHandle onStart={onLinkStart} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */

/** Live nodes for a project: hub, sessions with the files they wrote, terminals, notes. */
function useLiveNodes(projectId: string | null, positions: BoardDoc['live']): LiveNode[] {
  const project = useProjects((s) => (projectId ? s.projects.find((p) => p.id === projectId) : undefined));
  const sessions = useSessions(useShallow((s) => (projectId ? sessionsForProject(s.sessions, projectId) : [])));
  const events = useSessions((s) => s.events);
  const terminals = useTerminals(useShallow((s) => (projectId ? s.tabs.filter((t) => t.projectId === projectId) : [])));
  const notes = useNotes(useShallow((s) => (projectId ? Object.values(s.notes).filter((n) => n.projectId === projectId && n.kind !== 'board') : [])));
  const { openSession, focusTerminal, openNote, openFile } = useWorkspaceActions();
  return useMemo(() => {
    if (!projectId || !project) return [];
    const out: LiveNode[] = [];
    const at = (id: string, x: number, y: number) => positions[id] ?? { x, y };
    const hub = at('project', -80, -20);
    out.push({ id: 'project', kind: 'project', title: project.name, ...hub, w: 180, h: 40, open: () => void 0 });
    sessions.forEach((s, i) => {
      const p = at(s.id, -520, -140 + i * 150);
      out.push({
        id: s.id,
        kind: 'session',
        title: s.title,
        ...p,
        w: 240,
        h: 34,
        status: s.status === 'running' || s.status === 'waiting' || s.status === 'error' ? s.status : 'idle',
        agent: 'claude',
        open: () => openSession(s.id),
      });
      const files = Array.from(new Set((events[s.id] ?? []).filter((e) => e.type === 'file_write').map((e) => (e as { path: string }).path))).slice(-6);
      files.forEach((f, j) => {
        const id = `${s.id}:${f}`;
        const fp = at(id, -860, -140 + i * 150 - 20 + j * 30);
        out.push({ id, kind: 'file', title: basename(f), subtitle: s.id, ...fp, w: 220, h: 26, open: () => openFile(f, projectId) });
      });
    });
    terminals.forEach((t, i) => {
      const p = at(t.id, 300, -120 + i * 60);
      out.push({ id: t.id, kind: 'terminal', title: t.title, ...p, w: 200, h: 32, status: t.ptyId ? 'running' : 'idle', agent: t.program?.agent ?? (t.program ? 'claude' : undefined), open: () => focusTerminal(t.id) });
    });
    notes.forEach((n, i) => {
      const p = at(n.id, -80 + (i % 3) * 210, 120 + Math.floor(i / 3) * 60);
      out.push({ id: n.id, kind: 'note', title: noteTitle(n), ...p, w: 190, h: 32, open: () => openNote(n.id) });
    });
    return out;
  }, [projectId, project, sessions, events, terminals, notes, positions, openSession, focusTerminal, openNote, openFile]);
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Search, CornerDownLeft } from 'lucide-react';
import { FileIcon } from '@/features/files/FileIcon';
import { cn } from '@/lib/cn';
import { useUI } from '@/stores/ui';
import { usePlugins } from '@/stores/plugins';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Shortcut } from '@/components/ui/Shortcut';
import { StatusDot } from '@/components/ui/StatusDot';
import { fuzzyFilter } from '@/lib/fuzzy';
import { buildCommands, type Command } from './commands';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { formatRelative, basename } from '@/lib/format';
import { Dialog as RD } from 'radix-ui';
import { listProjectFiles, joinPath } from '@/native/system';
import { creatableName, createMissing } from '@/features/files/create-missing';
import { FilePlus, FolderPlus } from 'lucide-react';
import { isTauri } from '@/lib/platform';
import { t } from '@/i18n';

interface Row {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string;
  indices: number[];
  /** Keep the palette open after running (folders narrow the query). */
  keepOpen?: boolean;
  run: () => void | Promise<void>;
}

/** Folder of a relative path, '' at the root. */
const folderOf = (rel: string) => {
  const i = Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\'));
  return i >= 0 ? rel.slice(0, i) : '';
};

// Per-project file index for quick open (invalidated when the palette is reopened).
const fileIndex = new Map<string, string[]>();

/**
 * Command palette — Ctrl+K. Fuzzy, keyboard-first, grouped. Also serves
 * "quick open" (files) and "switch session" modes.
 */
export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const mode = useUI((s) => s.paletteMode);
  const close = useUI((s) => s.closePalette);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent size="lg" placement="top" hideClose overlay="dim" className="max-h-[68vh] w-[720px]" aria-describedby={undefined}>
        <RD.Title className="sr-only">{t('Command palette')}</RD.Title>
        {/* Keyed on mode so query/selection reset when switching modes; the body unmounts on close. */}
        <PaletteBody key={mode} mode={mode} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ mode }: { mode: 'commands' | 'files' | 'sessions' }) {
  const close = useUI((s) => s.closePalette);
  const openPalette = useUI((s) => s.openPalette);
  const sessions = useSessions((s) => s.sessions);
  const projects = useProjects((s) => s.projects);
  const actions = useWorkspaceActions();
  const [query, setQueryRaw] = useState('');
  const [rawIndex, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const project = actions.currentProject();
  const [files, setFiles] = useState<string[] | null>(project ? (fileIndex.get(project.path) ?? null) : []);

  useEffect(() => {
    if (mode !== 'files' || !project || !isTauri) return;
    let cancelled = false;
    listProjectFiles(project.path)
      .then((list) => {
        fileIndex.set(project.path, list);
        if (!cancelled) setFiles(list);
      })
      .catch(() => !cancelled && setFiles([]));
    return () => {
      cancelled = true;
    };
  }, [mode, project]);
  const setQuery = (v: string) => {
    setQueryRaw(v);
    setIndex(0);
  };

  const pluginRevision = usePlugins((s) => s.revision);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const commands = useMemo<Command[]>(() => buildCommands(actions), [actions, pluginRevision]);
  // Every folder of the index, once, for folder rows in quick open.
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const f of files ?? []) {
      let dir = folderOf(f);
      while (dir && !set.has(dir)) {
        set.add(dir);
        dir = folderOf(dir);
      }
    }
    return Array.from(set);
  }, [files]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    if (mode === 'files') {
      const list = files ?? [];
      const source = q ? list : list.slice(0, 300);
      const out: Row[] = [];
      // Folders that match come first; picking one narrows the query to its contents.
      if (q) {
        for (const r of fuzzyFilter(q, folders, (d) => d, 4)) {
          out.push({
            id: `dir:${r.item}`,
            title: r.item,
            group: t('Folders'),
            icon: <FileIcon name={basename(r.item)} isDir size={16} />,
            indices: r.indices,
            keepOpen: true,
            run: () => setQuery(`${r.item}/`),
          });
        }
      }
      // Files are grouped under their folder, shown by name.
      for (const r of fuzzyFilter(q, source, (f) => f, 80)) {
        const dir = folderOf(r.item);
        const name = r.item.slice(dir ? dir.length + 1 : 0);
        out.push({
          id: r.item,
          title: name,
          group: dir || (project ? project.name : 'Files'),
          icon: <FileIcon name={name} size={16} />,
          indices: r.indices.map((i) => i - (r.item.length - name.length)).filter((i) => i >= 0),
          run: () => project && actions.openFile(joinPath(project.path, r.item), project.id),
        });
      }
      // Nothing by that exact name: offer to create it.
      const want = q ? creatableName(q) : null;
      if (project && want && !list.some((f) => f.toLowerCase() === want.rel.toLowerCase()) && !folders.some((d) => d.toLowerCase() === want.rel.toLowerCase())) {
        out.push({
          id: `create:${want.rel}`,
          title: want.dir ? t('Create folder “{name}”', { name: want.rel }) : t('Create file “{name}”', { name: want.rel }),
          group: t('Create'),
          icon: want.dir ? <FolderPlus className="size-[14px] text-accent" /> : <FilePlus className="size-[14px] text-accent" />,
          indices: [],
          run: () => void createMissing(project.path, want.rel, want.dir, (p) => actions.openFile(p, project.id)),
        });
      }
      return out;
    }
    if (mode === 'sessions') {
      const list = Object.values(sessions).filter((s) => !s.hidden).sort((a, b) => Number(a.archived) - Number(b.archived) || b.updatedAt - a.updatedAt);
      return fuzzyFilter(q, list, (s) => [s.title, projects.find((p) => p.id === s.projectId)?.name ?? ''], 40).map((r) => ({
        id: r.item.id,
        title: r.item.title,
        subtitle: `${projects.find((p) => p.id === r.item.projectId)?.name ?? ''} · ${formatRelative(r.item.updatedAt)}${r.item.archived ? ' · archived' : ''}`,
        group: 'Sessions',
        icon: (
          <span className="relative inline-flex">
            <AgentGlyph className="size-[13px] text-muted" active={r.item.status === 'running'} />
            <span className="absolute -right-1 -top-1">
              <StatusDot status={r.item.status} size={5} />
            </span>
          </span>
        ),
        indices: r.field === 0 ? r.indices : [],
        run: () => {
          if (r.item.archived) useSessions.getState().updateSession(r.item.id, { archived: false });
          actions.openSession(r.item.id);
        },
      }));
    }
    const available = commands.filter((c) => !c.when || c.when());
    const scored = fuzzyFilter(q, available, (c) => [c.title, ...(c.keywords ?? []), c.group], 60);
    return scored.map<Row>((r) => ({
      id: r.item.id,
      title: r.item.title,
      group: r.item.group,
      icon: r.item.icon ? <r.item.icon className="size-[14px] text-muted" /> : <span className="inline-block size-[14px]" />,
      shortcut: r.item.shortcut,
      indices: r.field === 0 ? r.indices : [],
      run: () => void r.item.run(),
    }));
  }, [actions, commands, files, folders, mode, project, projects, query, sessions]);

  // Group rows preserving score order within groups; keyboard order follows the grouped list.
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);
  const ordered = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);
  const index = Math.min(rawIndex, Math.max(0, ordered.length - 1));

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (row: Row) => {
    if (!row.keepOpen) close();
    void row.run();
  };

  let flat = -1;
  const placeholder = mode === 'files' ? t('Search files by name…') : mode === 'sessions' ? t('Switch to session…') : t('Type a command or search…');

  return (
    <>
        <div className="flex h-[64px] items-center gap-3.5 pl-5 pr-4 hairline-b">
          {mode === 'commands' ? <span className="text-[18px] text-muted">›</span> : <Search className="size-[18px] text-muted" />}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-primary outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(ordered.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const r = ordered[index];
                if (r) run(r);
              } else if (e.key === 'Backspace' && !query && mode !== 'commands') {
                openPalette('commands');
              } else if (e.key === 'Tab') {
                e.preventDefault();
                openPalette(mode === 'commands' ? 'files' : mode === 'files' ? 'sessions' : 'commands');
              }
            }}
          />
          <div className="flex items-center gap-1">
            {(['commands', 'files', 'sessions'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => openPalette(m)}
                className={cn('h-6 rounded-md px-2 text-[11.5px] capitalize transition-colors', m === mode ? 'bg-surface-active text-primary' : 'text-muted hover:bg-surface-hover hover:text-primary')}
              >
                {t(m === 'commands' ? 'Commands' : m === 'files' ? 'Files' : 'Sessions')}
              </button>
            ))}
          </div>
        </div>
        <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-muted">
              {mode === 'files' && !project ? t('Add a project to search its files.') : mode === 'files' && !isTauri ? t('File search reads the disk in the desktop app.') : mode === 'files' && files === null ? t('Indexing…') : t('No results')}
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">{t(group)}</div>
                {items.map((r) => {
                  flat += 1;
                  const i = flat;
                  const selected = i === index;
                  return (
                    <div
                      key={r.id}
                      role="option"
                      aria-selected={selected}
                      data-index={i}
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => run(r)}
                      className={cn('relative flex h-(--row-height) cursor-default items-center gap-3 rounded-lg px-3 text-ui', selected ? 'text-primary' : 'text-secondary')}
                    >
                      {selected ? <motion.span layoutId="palette-highlight" transition={{ type: 'spring', stiffness: 700, damping: 44, mass: 0.7 }} className="absolute inset-0 -z-10 rounded-lg bg-surface-hover" /> : null}
                      <span className="inline-flex w-[16px] shrink-0 justify-center">{r.icon}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <Highlight text={r.title} indices={r.indices} />
                        {r.subtitle ? <span className="ml-2 text-[11.5px] text-muted">{r.subtitle}</span> : null}
                      </span>
                      {r.shortcut ? <Shortcut combo={r.shortcut} /> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex h-8 shrink-0 items-center gap-3 px-3 text-[11px] text-muted hairline-t">
          <span className="inline-flex items-center gap-1">
            <Shortcut combo="up" />
            <Shortcut combo="down" /> {t('navigate')}
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" /> {t('run')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Shortcut combo="Tab" /> {t('switch mode')}
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Shortcut combo="esc" /> {t('close')}
          </span>
        </div>
    </>
  );
}

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {text.split('').map((ch, i) => (
        <span key={i} className={set.has(i) ? 'font-semibold text-primary' : undefined}>
          {ch}
        </span>
      ))}
    </>
  );
}

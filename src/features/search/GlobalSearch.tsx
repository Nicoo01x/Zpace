import { useEffect, useMemo, useState } from 'react';
import { searchText, type SearchHit } from '@/native/search';
import { insertIntoComposer } from '@/features/agent/composer-drafts';
import { mentionPath } from '@/features/sessions/useWorkspaceActions';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { isTauri } from '@/lib/platform';
import { Dialog as RD } from 'radix-ui';
import { Search, MessageSquare, Terminal, FileText, NotebookPen, Folder, SquareTerminal } from 'lucide-react';
import { useNotes } from '@/stores/notes';
import { useTerminals } from '@/stores/terminals';
import { terminalMatches } from '@/features/terminal/registry';
import { useTerminalFind } from '@/features/terminal/find-store';
import { cn } from '@/lib/cn';
import { useUI } from '@/stores/ui';
import { sessionTitle, useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Shortcut } from '@/components/ui/Shortcut';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { formatRelative } from '@/lib/format';
import { t as tr } from '@/i18n';

type ResultType = 'session' | 'prompt' | 'message' | 'command' | 'file' | 'note' | 'terminal' | 'project' | 'code';

interface Result {
  id: string;
  type: ResultType;
  title: string;
  snippet?: string;
  project: string;
  projectId: string;
  sessionId?: string;
  noteId?: string;
  terminalId?: string;
  /** Terminal output hit: open the find bar on this query after focusing. */
  findInTerminal?: boolean;
  /** A line in a file on disk (text search). */
  hit?: SearchHit;
  timestamp: number;
}

const TYPE_LABEL: Record<ResultType, string> = {
  project: 'Projects',
  terminal: 'Terminals',
  note: 'Notes',
  session: 'Sessions',
  prompt: 'Prompts',
  message: 'Agent messages',
  command: 'Commands',
  file: 'Files',
  code: 'In files',
};
const DATE_FILTERS = [
  { id: 'any', label: 'Any time', ms: Infinity },
  { id: 'day', label: 'Today', ms: 24 * 3600e3 },
  { id: 'week', label: 'This week', ms: 7 * 24 * 3600e3 },
  { id: 'month', label: 'This month', ms: 30 * 24 * 3600e3 },
];

/** Global search (Ctrl+Shift+F) across projects, terminals (titles and output), notes, sessions, prompts, messages, commands and files. */
export function GlobalSearch() {
  const open = useUI((s) => s.searchOpen);
  const setOpen = useUI((s) => s.setSearchOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="lg" placement="top" hideClose overlay="dim" className="max-h-[68vh] w-[680px]" aria-describedby={undefined}>
        <RD.Title className="sr-only">{tr('Search')}</RD.Title>
        <SearchBody />
      </DialogContent>
    </Dialog>
  );
}

function SearchBody() {
  const setOpen = useUI((s) => s.setSearchOpen);
  const sessions = useSessions((s) => s.sessions);
  const events = useSessions((s) => s.events);
  const projects = useProjects((s) => s.projects);
  const notes = useNotes((s) => s.notes);
  const terminals = useTerminals((s) => s.tabs);
  const setActiveProject = useUI((s) => s.setActiveProject);
  const { openSession, openNote, focusTerminal, newSession } = useWorkspaceActions();
  const showInActivePane = useUI((s) => s.setPaneContent);
  const activeSessionId = useUI((s) => s.activeSessionId);
  const [q, setQRaw] = useState('');
  const [types, setTypes] = useState<Set<ResultType>>(new Set());
  const [projectId, setProjectId] = useState<string | 'all'>('all');
  const [date, setDate] = useState('any');
  const [rawIndex, setIndex] = useState(0);
  const [now] = useState(() => Date.now());
  const setQ = (v: string) => {
    setQRaw(v);
    setIndex(0);
  };
  // Text inside the projects' files, from the Rust walker — a beat after typing stops, per project in scope.
  const [code, setCode] = useState<{ hits: Array<SearchHit & { projectId: string }>; truncated: boolean; scanned: number; q: string }>({ hits: [], truncated: false, scanned: 0, q: '' });
  useEffect(() => {
    const needle = q.trim();
    if (!isTauri || needle.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        // The current project first (it answers fast); the rest with a short budget each so a big tree never stalls the box.
        const current = useUI.getState().activeProjectId;
        const scope = projects.filter((p) => projectId === 'all' || p.id === projectId).sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : 0));
        const all: Array<SearchHit & { projectId: string }> = [];
        let truncated = false;
        let scanned = 0;
        for (const p of scope) {
          try {
            const r = await searchText(p.path, needle, { maxHits: 300, budgetMs: p.id === current || projectId !== 'all' ? 6000 : 2500 });
            all.push(...r.hits.map((h) => ({ ...h, projectId: p.id })));
            truncated ||= r.truncated;
            scanned += r.filesScanned;
          } catch {
            /* unreadable project */
          }
          if (cancelled) return;
          // Each project lands as it finishes — the current one answers first.
          setCode({ hits: all.slice(0, 400), truncated: truncated || all.length > 400, scanned, q: needle });
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, projectId, projects]);

  const results = useMemo<Result[]>(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: Result[] = [];
    const cutoff = now - (DATE_FILTERS.find((d) => d.id === date)?.ms ?? Infinity);
    const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
    for (const p of projects) {
      if (projectId !== 'all' && p.id !== projectId) continue;
      if (p.name.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle)) {
        out.push({ id: `p_${p.id}`, type: 'project', title: p.name, snippet: p.path, project: '', projectId: p.id, timestamp: p.lastOpenedAt ?? now });
      }
    }
    for (const t of terminals) {
      if (projectId !== 'all' && t.projectId !== projectId) continue;
      if (t.createdAt < cutoff) continue;
      const pname = t.projectId ? projectName(t.projectId) : '';
      if (t.title.toLowerCase().includes(needle) || t.cwd.toLowerCase().includes(needle)) {
        out.push({ id: `t_${t.id}`, type: 'terminal', title: t.title, snippet: t.cwd, project: pname, projectId: t.projectId ?? '', terminalId: t.id, timestamp: t.createdAt });
      }
      // Output of live terminals (scrollback); the hit opens the terminal with the find bar on this query.
      for (const m of terminalMatches(t.id, needle, 6)) {
        const idx = m.text.toLowerCase().indexOf(needle);
        const start = Math.max(0, idx - 40);
        out.push({
          id: `to_${t.id}_${m.line}`,
          type: 'terminal',
          title: t.title,
          snippet: (start > 0 ? '…' : '') + m.text.slice(start, idx + needle.length + 80).trim(),
          project: pname,
          projectId: t.projectId ?? '',
          terminalId: t.id,
          findInTerminal: true,
          timestamp: t.createdAt,
        });
      }
    }
    for (const s of Object.values(sessions)) {
      if (s.hidden) continue;
      if (projectId !== 'all' && s.projectId !== projectId) continue;
      if (s.title.toLowerCase().includes(needle) && s.updatedAt >= cutoff) {
        out.push({ id: `s_${s.id}`, type: 'session', title: sessionTitle(s.title), project: projectName(s.projectId), projectId: s.projectId, sessionId: s.id, timestamp: s.updatedAt });
      }
      for (const e of events[s.id] ?? []) {
        if (e.timestamp < cutoff) continue;
        let type: ResultType | null = null;
        let text = '';
        if (e.type === 'user_message') {
          type = 'prompt';
          text = e.text;
        } else if (e.type === 'assistant_message') {
          type = 'message';
          text = e.text;
        } else if (e.type === 'shell_command') {
          type = 'command';
          text = e.command;
        } else if (e.type === 'file_write' || e.type === 'file_read') {
          type = 'file';
          text = e.path;
        }
        if (!type) continue;
        const idx = text.toLowerCase().indexOf(needle);
        if (idx < 0) continue;
        const start = Math.max(0, idx - 48);
        const snippet = (start > 0 ? '…' : '') + text.slice(start, idx + needle.length + 72).replace(/\s+/g, ' ') + (idx + 72 < text.length ? '…' : '');
        out.push({ id: `e_${e.id}`, type, title: s.title, snippet, project: projectName(s.projectId), projectId: s.projectId, sessionId: s.id, timestamp: e.timestamp });
      }
    }
    for (const n of Object.values(notes)) {
      if (projectId !== 'all' && n.projectId !== projectId) continue;
      if (n.updatedAt < cutoff) continue;
      const hay = `${n.title}
${n.body}
${n.tags.join(' ')}`;
      const idx = hay.toLowerCase().indexOf(needle);
      if (idx < 0) continue;
      const start = Math.max(0, idx - 48);
      const snippet = (start > 0 ? '…' : '') + hay.slice(start, idx + needle.length + 72).replace(/\s+/g, ' ');
      out.push({ id: `n_${n.id}`, type: 'note', title: n.title || 'Untitled', snippet, project: projectName(n.projectId ?? ''), projectId: n.projectId ?? '', noteId: n.id, timestamp: n.updatedAt });
    }
    const ranked = out.filter((r) => types.size === 0 || types.has(r.type)).sort((a, b) => b.timestamp - a.timestamp).slice(0, 80);
    if ((types.size === 0 || types.has('code')) && code.q === q.trim()) {
      for (const h of code.hits.slice(0, 200)) {
        ranked.push({ id: `c_${h.path}_${h.line}`, type: 'code', title: `${h.rel}:${h.line}`, snippet: h.text.trim(), project: projectName(h.projectId), projectId: h.projectId, hit: h, timestamp: 0 });
      }
    }
    return ranked;
  }, [date, events, notes, now, projectId, projects, q, sessions, terminals, types, code]);

  const codeShown = results.filter((r) => r.type === 'code');
  /** Hand the matches to Claude as `@file#Lline` references — the active session, or a new one in the project of the first hit. */
  const askClaude = () => {
    if (!codeShown.length) return;
    const first = codeShown[0];
    const lines = codeShown.slice(0, 40).map((r) => {
      const p = projects.find((x) => x.id === r.projectId);
      return `@${p ? mentionPath(p.path, r.hit!.path) : r.hit!.rel}#L${r.hit!.line}`;
    });
    const text = `Look at these matches for "${q.trim()}" (${codeShown.length} in files):\n${lines.join('\n')}\n\n`;
    const active = activeSessionId ? sessions[activeSessionId] : undefined;
    const target = active && !active.hidden ? active : newSession(first.projectId);
    if (!target) return;
    setOpen(false);
    openSession(target.id);
    window.setTimeout(() => insertIntoComposer(target.id, text), 80);
  };

  const index = Math.min(rawIndex, Math.max(0, results.length - 1));

  const go = (r: Result) => {
    setOpen(false);
    if (r.type === 'project') {
      setActiveProject(r.projectId);
      useProjects.getState().toggleExpanded(r.projectId, true);
    } else if (r.terminalId) {
      focusTerminal(r.terminalId);
      if (r.findInTerminal) {
        const id = r.terminalId;
        // Let the pane mount before the find bar asks the addon to highlight.
        window.setTimeout(() => useTerminalFind.getState().open(id, q.trim()), 60);
      }
    } else if (r.hit) {
      showInActivePane(useUI.getState().activePaneId, { kind: 'file', path: r.hit.path, projectId: r.projectId, line: r.hit.line });
    } else if (r.noteId) openNote(r.noteId);
    else if (r.sessionId) openSession(r.sessionId);
  };

  const toggleType = (t: ResultType) =>
    setTypes((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const Icon = ({ type }: { type: ResultType }) =>
    type === 'session' ? (
      <AgentGlyph className="size-[13px]" />
    ) : type === 'prompt' ? (
      <MessageSquare className="size-[13px]" />
    ) : type === 'command' ? (
      <Terminal className="size-[13px]" />
    ) : type === 'file' ? (
      <FileText className="size-[13px]" />
    ) : type === 'note' ? (
      <NotebookPen className="size-[13px]" />
    ) : type === 'terminal' ? (
      <SquareTerminal className="size-[13px]" />
    ) : type === 'project' ? (
      <Folder className="size-[13px]" />
    ) : type === 'code' ? (
      <Search className="size-[13px]" />
    ) : (
      <span className="block size-[6px] rounded-full bg-current" />
    );

  return (
    <>
        <div className="flex h-12 items-center gap-2.5 px-4 hairline-b">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr('Search projects, terminals, notes, sessions, prompts, files…')}
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-primary outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === 'Enter' && results[index]) go(results[index]);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 hairline-b">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label={tr('Project')}
            className="h-6 rounded-md bg-surface-inset px-1.5 text-[11.5px] text-secondary outline-none"
          >
            <option value="all">{tr('All projects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {(Object.keys(TYPE_LABEL) as ResultType[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={types.has(t)}
              onClick={() => toggleType(t)}
              className={cn('h-6 rounded-md px-2 text-[11.5px] transition-colors', types.has(t) ? 'bg-surface-active text-primary' : 'bg-surface-inset text-secondary hover:text-primary')}
            >
              {tr(TYPE_LABEL[t])}
            </button>
          ))}
          <span className="flex-1" />
          <select value={date} onChange={(e) => setDate(e.target.value)} aria-label={tr('Date')} className="h-6 rounded-md bg-surface-inset px-1.5 text-[11.5px] text-secondary outline-none">
            {DATE_FILTERS.map((d) => (
              <option key={d.id} value={d.id}>
                {tr(d.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {q.trim().length < 2 ? (
            <div className="px-3 py-10 text-center text-[12.5px] text-muted">{tr('Type at least two characters.')}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-10 text-center text-[12.5px] text-muted">{tr('No matches for “{q}”.', { q })}</div>
          ) : (
            results.map((r, i) => (
              <div
                key={r.id}
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(r)}
                className={cn('flex cursor-default items-start gap-2.5 rounded-md px-2.5 py-1.5', i === index ? 'bg-surface-hover text-primary' : 'text-secondary')}
              >
                <span className="mt-[3px] inline-flex w-[16px] shrink-0 justify-center text-muted">
                  <Icon type={r.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-ui text-primary">{r.title}</span>
                    <span className="shrink-0 text-[11px] text-muted">{r.project}</span>
                    {r.timestamp ? <span className="ml-auto shrink-0 text-[11px] text-muted">{formatRelative(r.timestamp)}</span> : null}
                  </div>
                  {r.snippet ? <div className={cn('mt-0.5 truncate text-[12px] text-secondary', r.type === 'command' || r.type === 'file' || r.type === 'terminal' || r.type === 'project' || r.type === 'code' ? 'font-mono' : '')}>{r.snippet}</div> : null}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex h-8 shrink-0 items-center gap-3 px-3 text-[11px] text-muted hairline-t">
          <span className="inline-flex items-center gap-1">
            <Shortcut combo="enter" /> {tr('open')}
          </span>
          {codeShown.length ? (
            <>
              <span>
                {tr('{n} in files', { n: codeShown.length })}
                {code.truncated ? '+' : ''} · {tr('{n} files scanned', { n: code.scanned })}
              </span>
              <button type="button" onClick={askClaude} className="inline-flex items-center gap-1 rounded-md bg-claude-soft px-2 py-0.5 text-[11px] font-medium text-claude hover:brightness-95">
                <ClaudeLogo size={11} /> {tr('Ask Claude about these matches')}
              </button>
            </>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1">
            <Shortcut combo="esc" /> {tr('close')}
          </span>
        </div>
    </>
  );
}

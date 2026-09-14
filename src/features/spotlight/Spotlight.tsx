import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, CornerDownLeft, Globe, Calculator, StickyNote, Folder, Copy, ArrowUpRight, MessageSquare, Square, Sparkles, ExternalLink } from 'lucide-react';
import { Markdown } from '@/features/agent/Markdown';
import { LiveStatus } from '@/features/agent/blocks/AgentStatus';
import { selectEvents } from '@/stores/sessions';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { springs } from '@/lib/motion';
import { fuzzyFilter } from '@/lib/fuzzy';
import { useUI } from '@/stores/ui';
import { usePlugins } from '@/stores/plugins';
import { useSessions } from '@/stores/sessions';
import { useNotes } from '@/stores/notes';
import { useProjects } from '@/stores/projects';
import { useSettings, modelContext } from '@/stores/settings';
import { runtime } from '@/providers/runtime';
import { isTauri } from '@/lib/platform';
import { joinPath } from '@/native/system';
import { formatRelative, basename } from '@/lib/format';
import { FileIcon } from '@/features/files/FileIcon';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { EngineLogo } from '@/features/browser/EngineLogo';
import { engineById, aiAnswerUrl } from '@/features/browser/engines';
import { fetchEngineAnswer, type EngineAnswerData } from './engine-answer';
import { Shortcut } from '@/components/ui/Shortcut';
import { toast } from '@/features/notifications/toast-store';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { buildCommands } from '@/features/palette/commands';
import { projectFiles } from '@/features/files/file-index';
import { creatableName, createMissing } from '@/features/files/create-missing';
import { FilePlus, FolderPlus } from 'lucide-react';

/**
 * Spotlight — Ctrl+Space. One bar, anything: files of the current project,
 * commands, notes, sessions, projects, a sum, a URL, a web search with the
 * configured engine, or a question for Claude. Results appear as you type;
 * Enter runs the highlighted one.
 */
interface Hit {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: ReactNode;
  indices?: number[];
  trailing?: ReactNode;
  run: () => void;
  /** Keep the bar open after running. */
  keepOpen?: boolean;
}

const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i;
const MATH_RE = /^[\d\s+\-*/().,%^]+$/;

/** Evaluate a plain arithmetic expression without touching anything else. */
function calc(expr: string): string | null {
  const src = expr.replace(/,/g, '.').replace(/\^/g, '**').replace(/(\d)\s*%/g, '($1/100)');
  if (!/[+\-*/^%]/.test(expr) || !/\d/.test(expr)) return null;
  try {
    const v = new Function(`"use strict"; return (${src});`)() as unknown;
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(8)));
  } catch {
    return null;
  }
}

export function Spotlight() {
  const open = useUI((s) => s.spotlightOpen);
  const setOpen = useUI((s) => s.setSpotlightOpen);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="spotlight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[940] flex items-start justify-center bg-black/10 pt-[16vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <SpotlightBar close={() => setOpen(false)} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SpotlightBar({ close }: { close: () => void }) {
  const [query, setQueryRaw] = useState('');
  const [rawIndex, setIndex] = useState(0);
  const [files, setFiles] = useState<string[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const actions = useWorkspaceActions();
  const project = actions.currentProject();
  const sessions = useSessions((s) => s.sessions);
  const notes = useNotes((s) => s.notes);
  const projects = useProjects((s) => s.projects);
  const engineId = useSettings((s) => s.browser.searchEngine);
  const engine = engineById(engineId);
  // Inline answer: a hidden session that streams into the bar; kept only if continued in the chat.
  const [answer, setAnswer] = useState<{ sessionId: string; q: string; kept: boolean } | null>(null);
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);
  const askInline = (q: string) => {
    const pid = project?.id ?? projects[0]?.id;
    if (!pid || !q.trim()) return;
    const prev = answerRef.current;
    if (prev && prev.q === q) return;
    if (prev && !prev.kept) {
      void runtime.dispose(prev.sessionId).catch(() => void 0);
      useSessions.getState().removeSession(prev.sessionId);
    }
    const model = useSettings.getState().claude.quickModel || 'haiku';
    const s = useSessions.getState().createSession({ projectId: pid, title: q.slice(0, 60), model, contextMax: modelContext(model), hidden: true });
    setAnswer({ sessionId: s.id, q, kept: false });
    void runtime.send(s.id, `Answer briefly and directly, in the language of the question (about 120 words at most), in plain Markdown — no preamble, no follow-up questions. If it is about this project, look at the files.\n\nQuestion: ${q}`);
  };
  // The engine's own AI answer (Google AI Mode by default), embedded in the bar.
  // Asked for, never guessed: Enter on the "answer" row (or the button) — typing alone opens nothing.
  const [ai, setAi] = useState<string | null>(null);
  // Closing the bar discards an answer that was not continued.
  useEffect(
    () => () => {
      const a = answerRef.current;
      if (a && !a.kept) {
        void runtime.dispose(a.sessionId).catch(() => void 0);
        useSessions.getState().removeSession(a.sessionId);
      }
    },
    [],
  );
  const setQuery = (v: string) => {
    setQueryRaw(v);
    setIndex(0);
  };
  // Escape closes the bar wherever focus ended up (e.g. after a click on a row).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if ((e.target as HTMLElement | null)?.closest?.('[aria-label="Spotlight"] input')) return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  useEffect(() => {
    if (!project || !isTauri) return;
    let cancelled = false;
    void projectFiles(project.path).then((list) => !cancelled && setFiles(list));
    return () => {
      cancelled = true;
    };
  }, [project]);

  const pluginRevision = usePlugins((s) => s.revision);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const commands = useMemo(() => buildCommands(actions), [actions, pluginRevision]);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const out: Hit[] = [];

    const sum = MATH_RE.test(q) ? calc(q) : null;
    if (sum !== null) {
      out.push({
        id: 'calc',
        title: `= ${sum}`,
        subtitle: q,
        group: t('Calculator'),
        icon: <Calculator className="size-[15px] text-muted" />,
        trailing: <span className="text-[11px] text-muted">{t('Enter copies')}</span>,
        run: () => {
          void navigator.clipboard.writeText(sum);
          toast.neutral(t('Copied'), { description: sum, origin: null, duration: 1200 });
        },
      });
    }

    if (project && files) {
      // Names first; the whole path only when the query looks like one.
      const byPath = /[/\\]/.test(q);
      for (const r of fuzzyFilter(q, files, (f) => (byPath ? f : basename(f)), 6)) {
        const name = basename(r.item);
        out.push({
          id: `file:${r.item}`,
          title: name,
          subtitle: r.item === name ? undefined : r.item,
          group: project.name,
          icon: <FileIcon name={name} size={16} />,
          indices: byPath ? r.indices.map((i) => i - (r.item.length - name.length)).filter((i) => i >= 0) : r.indices,
          run: () => actions.openFile(joinPath(project.path, r.item), project.id),
        });
      }
    }

    if (project && files) {
      const want = creatableName(q);
      if (want && !files.some((f) => f.toLowerCase() === want.rel.toLowerCase())) {
        out.push({
          id: `create:${want.rel}`,
          title: want.dir ? t('Create folder “{name}”', { name: want.rel }) : t('Create file “{name}”', { name: want.rel }),
          subtitle: project.name,
          group: project.name,
          icon: want.dir ? <FolderPlus className="size-[14px] text-accent" /> : <FilePlus className="size-[14px] text-accent" />,
          run: () => void createMissing(project.path, want.rel, want.dir, (p) => actions.openFile(p, project.id)),
        });
      }
    }

    const available = commands.filter((c) => !c.when || c.when());
    for (const r of fuzzyFilter(q, available, (c) => [c.title, ...(c.keywords ?? [])], 5)) {
      out.push({
        id: `cmd:${r.item.id}`,
        title: r.item.title,
        subtitle: r.item.group,
        group: t('Commands'),
        icon: r.item.icon ? <r.item.icon className="size-[14px] text-muted" /> : <span className="inline-block size-[14px]" />,
        indices: r.field === 0 ? r.indices : [],
        trailing: r.item.shortcut ? <Shortcut combo={r.item.shortcut} /> : undefined,
        run: () => void r.item.run(),
      });
    }

    for (const r of fuzzyFilter(q, Object.values(notes), (n) => [n.title, n.body.slice(0, 400)], 4)) {
      out.push({
        id: `note:${r.item.id}`,
        title: r.item.title || t('Untitled note'),
        subtitle: formatRelative(r.item.updatedAt),
        group: t('Notes'),
        icon: <StickyNote className="size-[14px] text-muted" />,
        indices: r.field === 0 ? r.indices : [],
        run: () => actions.openNote(r.item.id),
      });
    }

    const sessionList = Object.values(sessions).filter((s) => !s.archived);
    for (const r of fuzzyFilter(q, sessionList, (s) => s.title, 4)) {
      out.push({
        id: `session:${r.item.id}`,
        title: r.item.title,
        subtitle: `${projects.find((p) => p.id === r.item.projectId)?.name ?? ''} · ${formatRelative(r.item.updatedAt)}`,
        group: t('Sessions'),
        icon: <AgentGlyph className="size-[13px] text-muted" active={r.item.status === 'running'} />,
        indices: r.indices,
        run: () => actions.openSession(r.item.id),
      });
    }

    for (const r of fuzzyFilter(q, projects, (p) => p.name, 3)) {
      out.push({
        id: `project:${r.item.id}`,
        title: r.item.name,
        subtitle: r.item.path,
        group: t('Projects'),
        icon: <Folder className="size-[14px] text-muted" />,
        indices: r.indices,
        run: () => useUI.getState().setActiveProject(r.item.id),
      });
    }

    if (URL_RE.test(q)) {
      const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
      out.push({
        id: 'url',
        title: t('Open {url}', { url: q }),
        group: t('Web'),
        icon: <Globe className="size-[14px] text-muted" />,
        trailing: <ArrowUpRight className="size-3.5 text-muted" />,
        run: () => actions.openBrowser(url),
      });
    }
    out.push({
      id: 'web',
      title: t('Search “{q}” on {engine}', { q, engine: engine.label }),
      group: t('Web'),
      icon: <EngineLogo engine={engine} size={16} />,
      trailing: <ArrowUpRight className="size-3.5 text-muted" />,
      run: () => actions.openBrowser(engine.query.replace('%s', encodeURIComponent(q))),
    });
    const aiTarget = aiAnswerUrl(engine, q);
    out.push({
      id: 'ai',
      title: t('Answer with {label}', { label: aiTarget.label }),
      subtitle: q.length > 40 ? q.slice(0, 40) + '…' : q,
      group: t('Web'),
      icon: <Sparkles className="size-[14px] text-accent" />,
      keepOpen: true,
      run: () => setAi(q),
    });
    if (project ?? projects[0]) {
      out.push({
        id: 'ask',
        title: t('Ask Claude: “{q}”', { q }),
        subtitle: t('answer here'),
        group: t('Claude'),
        icon: <ClaudeLogo size={14} />,
        keepOpen: true,
        run: () => void 0, // handled by run(): it needs the answer state
      });
    }
    return out;
  }, [query, files, project, commands, notes, sessions, projects, engine, actions]);

  const index = Math.min(rawIndex, Math.max(0, hits.length - 1));
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (h: Hit) => {
    if (h.id === 'ask') {
      askInline(query.trim());
      return;
    }
    if (!h.keepOpen) close();
    h.run();
  };
  const keepAnswer = () => {
    if (!answer) return;
    useSessions.getState().updateSession(answer.sessionId, { hidden: false });
    setAnswer({ ...answer, kept: true });
    actions.openSession(answer.sessionId);
    close();
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const h of hits) {
      if (!map.has(h.group)) map.set(h.group, []);
      map.get(h.group)!.push(h);
    }
    return Array.from(map.entries());
  }, [hits]);
  let flat = -1;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -6, transition: { duration: 0.1 } }}
      transition={springs.pop}
      role="dialog"
      aria-label={t('Spotlight')}
      className="flex w-[640px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl bg-surface-raised/95 text-primary shadow-popover backdrop-blur-xl"
      onMouseDown={(e) => {
        e.stopPropagation();
        // Clicks on rows and buttons keep the caret in the input (so Escape and typing keep working).
        if (!(e.target as HTMLElement).closest('input, textarea, [contenteditable]')) e.preventDefault();
      }}
    >
      <div className={cn('flex h-[58px] items-center gap-3 px-5', hits.length > 0 && 'hairline-b')}>
        <Search className="size-[22px] shrink-0 text-muted" strokeWidth={1.75} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search files, commands, notes… or the web')}
          aria-label={t('Spotlight')}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[20px] font-light tracking-[-0.01em] text-primary outline-none placeholder:text-muted"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(hits.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              const q = query.trim();
              if (q) run({ id: 'web', title: '', group: '', icon: null, run: () => actions.openBrowser(engine.query.replace('%s', encodeURIComponent(q))) });
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const h = hits[index];
              if (h) run(h);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              if (query) setQuery('');
              else close();
            }
            e.stopPropagation();
          }}
        />
        {!query ? <Shortcut combo="mod+space" /> : null}
      </div>
      {ai ? <EngineAnswer q={ai} engineId={engine.id} onWeb={(url) => { close(); actions.openBrowser(url); }} onAskClaude={() => { setAi(null); askInline(ai); }} onClose={() => setAi(null)} /> : null}
      {answer ? <AnswerCard sessionId={answer.sessionId} q={answer.q} engineLabel={engine.label} onWeb={() => { close(); actions.openBrowser(engine.query.replace('%s', encodeURIComponent(answer.q))); }} onKeep={keepAnswer} /> : null}
      {hits.length > 0 ? (
        <div ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
          {grouped.map(([group, items]) => (
            <div key={group} className="mb-1">
              <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">{group}</div>
              {items.map((h) => {
                flat += 1;
                const i = flat;
                const selected = i === index;
                return (
                  <div
                    key={h.id}
                    role="option"
                    aria-selected={selected}
                    data-index={i}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => run(h)}
                    className={cn('relative flex h-10 cursor-default items-center gap-3 rounded-lg px-3', selected ? 'text-primary' : 'text-secondary')}
                  >
                    {selected ? <motion.span layoutId="spotlight-highlight" transition={{ type: 'spring', stiffness: 700, damping: 44, mass: 0.7 }} className="absolute inset-0 -z-10 rounded-lg bg-accent-soft" /> : null}
                    <span className="inline-flex w-[18px] shrink-0 items-center justify-center">{h.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">
                      <Highlight text={h.title} indices={h.indices} />
                      {h.subtitle ? <span className="ml-2 text-[11.5px] text-muted">{h.subtitle}</span> : null}
                    </span>
                    {h.trailing ?? (selected ? <CornerDownLeft className="size-3.5 text-muted" /> : null)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : query ? (
        <div className="px-5 pb-4 pt-1 text-[12.5px] text-muted">{t('Nothing yet…')}</div>
      ) : null}
      {answer || ai || query ? null : (
        <div className="flex items-center gap-3 px-5 pb-3 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Copy className="size-3" /> {t('Sums are copied')}
          </span>
          <span>·</span>
          <span>{t('URLs and searches open in the browser pane')}</span>
        </div>
      )}
    </motion.div>
  );
}

function Highlight({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices?.length) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {Array.from(text).map((ch, i) =>
        set.has(i) ? (
          <span key={i} className="font-semibold text-primary">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

/** Claude's answer, streaming inside the bar — like a search engine's overview, but local. */
function AnswerCard({ sessionId, q, engineLabel, onWeb, onKeep }: { sessionId: string; q: string; engineLabel: string; onWeb: () => void; onKeep: () => void }) {
  const events = useSessions(selectEvents(sessionId));
  const session = useSessions((s) => s.sessions[sessionId]);
  const busy = session?.status === 'running' || session?.status === 'waiting';
  const text = useMemo(() => {
    const last = [...events].reverse().find((e) => e.type === 'assistant_message');
    return last && 'text' in last ? { text: String(last.text), streaming: !!(last as { streaming?: boolean }).streaming } : null;
  }, [events]);
  const error = useMemo(() => {
    const e = [...events].reverse().find((x) => x.type === 'error');
    return e && 'message' in e ? String(e.message) : null;
  }, [events]);
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={springs.pop} className="mx-1.5 mt-1.5 rounded-xl bg-claude-soft px-3.5 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-[11.5px] font-medium text-claude">
        <ClaudeLogo size={13} />
        <span className="min-w-0 flex-1 truncate">{t('Claude on “{q}”', { q })}</span>
        {session ? <span className="font-normal text-claude/70">{session.modelLabel}</span> : null}
        {busy && session ? (
          <button type="button" aria-label={t('Stop')} onClick={() => void runtime.cancel(sessionId)} className="inline-flex size-5 items-center justify-center rounded-full bg-claude text-white">
            <Square className="size-2.5" fill="currentColor" />
          </button>
        ) : null}
      </div>
      {text ? (
        <div className="prose-agent prose-note selectable max-h-[34vh] overflow-y-auto text-[13px]">
          <Markdown text={text.text} />
          {text.streaming ? <span className="streaming-caret" /> : null}
        </div>
      ) : error ? (
        <div className="text-[12.5px] text-danger">{error}</div>
      ) : session ? (
        <LiveStatus activity={session.activity} startedAt={session.runStartedAt} waiting={session.status === 'waiting'} />
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onWeb} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-raised px-2.5 text-[12px] font-medium text-primary shadow-sm transition-colors hover:bg-surface-hover">
          <Globe className="size-3.5 text-muted" /> {t('Open in the browser ({engine})', { engine: engineLabel })}
        </button>
        {text ? (
          <button type="button" onClick={() => { void navigator.clipboard.writeText(text.text); toast.neutral(t('Copied'), { origin: null, duration: 1200 }); }} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-raised px-2.5 text-[12px] font-medium text-primary shadow-sm transition-colors hover:bg-surface-hover">
            <Copy className="size-3.5 text-muted" /> {t('Copy')}
          </button>
        ) : null}
        <button type="button" onClick={onKeep} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-claude px-2.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:brightness-110">
          <MessageSquare className="size-3.5" /> {t('Continue in the chat')}
        </button>
        <span className="ml-auto text-[11px] text-muted">{t('Ctrl+Enter searches the web')}</span>
      </div>
    </motion.div>
  );
}

/**
 * The search engine's AI answer (Google AI Mode, Copilot Search, Brave…) in
 * the bar's own style: the page loads hidden, its text and sources are lifted
 * out and rendered here — paragraphs, bullets, source chips — with the page
 * one click away. "Ask Claude instead" hands the same question to Claude.
 */
function EngineAnswer({ q, engineId, onWeb, onAskClaude, onClose }: { q: string; engineId: string; onWeb: (url: string) => void; onAskClaude: () => void; onClose: () => void }) {
  const engine = engineById(engineId);
  const { url, label } = aiAnswerUrl(engine, q);
  const [data, setData] = useState<EngineAnswerData>({ text: '', sources: [], done: false });
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const stop = fetchEngineAnswer(url, setData);
    const tick = window.setInterval(() => setElapsed((e) => e + 500), 500);
    return () => {
      stop();
      window.clearInterval(tick);
    };
  }, [url]);
  const mark = engine.ai ? engine : engineById('google');
  const empty = data.done && !data.text.trim();
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={springs.pop} className="mx-1.5 mt-1.5 rounded-xl bg-accent-soft px-3.5 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-[11.5px] font-medium text-accent">
        <EngineLogo engine={mark} size={15} />
        <span className="min-w-0 flex-1 truncate">{t('{label} on “{q}”', { label, q })}</span>
        {!data.done ? <span className="size-1.5 animate-pulse rounded-full bg-accent" /> : null}
        <button type="button" aria-label={t('Close')} onClick={onClose} className="inline-flex size-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-primary">
          ×
        </button>
      </div>
      {data.text.trim() ? (
        <div className="prose-agent prose-note selectable max-h-[38vh] overflow-y-auto font-sans text-[13px] leading-relaxed [&_*]:font-sans">
          <Markdown text={data.text} />
          {!data.done ? <span className="streaming-caret" /> : null}
        </div>
      ) : empty ? (
        <div className="text-[12.5px] text-muted">{t('{label} did not answer this one — open the page, or ask Claude.', { label })}</div>
      ) : (
        <Searching label={label} engine={mark} elapsed={elapsed} />
      )}
      {data.sources.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {data.sources.map((src) => (
            <button key={src.url} type="button" onClick={() => onWeb(src.url)} title={src.title} className="inline-flex h-6 max-w-[220px] items-center gap-1.5 rounded-full bg-surface-raised pl-1.5 pr-2.5 text-[11.5px] text-secondary shadow-sm transition-colors hover:bg-surface-hover hover:text-primary">
              <img src={`https://www.google.com/s2/favicons?domain=${src.host}&sz=32`} alt="" width={14} height={14} className="rounded-[3px]" referrerPolicy="no-referrer" />
              <span className="truncate">{src.host}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onWeb(url)} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-raised px-2.5 text-[12px] font-medium text-primary shadow-sm transition-colors hover:bg-surface-hover">
          <ExternalLink className="size-3.5 text-muted" /> {t('Open in the browser')}
        </button>
        {data.text.trim() ? (
          <button type="button" onClick={() => { void navigator.clipboard.writeText(data.text); toast.neutral(t('Copied'), { origin: null, duration: 1200 }); }} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-raised px-2.5 text-[12px] font-medium text-primary shadow-sm transition-colors hover:bg-surface-hover">
            <Copy className="size-3.5 text-muted" /> {t('Copy')}
          </button>
        ) : null}
        <button type="button" onClick={onAskClaude} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-claude px-2.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:brightness-110">
          <ClaudeLogo size={13} color="#fff" /> {t('Ask Claude instead')}
        </button>
      </div>
    </motion.div>
  );
}

/** While the engine thinks: a mark with an orbiting ring, shimmering lines where the answer will be, and what is going on. */
function Searching({ label, engine, elapsed }: { label: string; engine: ReturnType<typeof engineById>; elapsed: number }) {
  const phases = [t('Asking {label}…', { label }), t('Reading results…'), t('Putting the answer together…'), t('Checking sources…'), t('Still reading {label}…', { label })];
  const phase = phases[Math.min(phases.length - 1, Math.floor(elapsed / 2600))];
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="relative mt-0.5 inline-flex size-9 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-accent/15" />
        <motion.span className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent" animate={{ rotate: 360 }} transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }} />
        <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }} className="inline-flex">
          <EngineLogo engine={engine} size={20} />
        </motion.span>
      </span>
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }} className="mb-2 text-[12.5px] text-secondary">
            {phase}
          </motion.div>
        </AnimatePresence>
        <div className="flex flex-col gap-2">
          {[92, 100, 74, 56].map((w, i) => (
            <span key={i} className="search-shimmer block h-2.5 rounded-full" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

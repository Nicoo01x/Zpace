import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Save, Lock, LockOpen, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { springs } from '@/lib/motion';
import { AgentLogo } from '@/features/agent/BrandIcon';
import { AGENT_LABEL, agentPromptArgs, type AgentKind } from '@/features/agent/agents';
import { useEnvironment } from '@/stores/environment';
import { useTouched, touchKey, addedLines as agentAddedLines } from '@/stores/touched';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useSettings } from '@/stores/settings';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { AgentFileItems } from '@/features/agent/AgentFileMenu';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/features/notifications/toast-store';
import { openPath, readTextFile, revealInFileManager, writeTextFile } from '@/native/system';
import { basename, dirname, formatBytes } from '@/lib/format';
import { languageFor } from './languages';
import { isTauri } from '@/lib/platform';
import { t } from '@/i18n';
import { AnimatePresence } from 'motion/react';
import { InlineAsk, type InlineAskTarget } from './InlineAsk';
import { MediaView, HexView } from './MediaPane';
import { mediaKind } from './media-kind';
import { useSelectionContext } from '@/stores/selection';
import { useWorkspaceActions, claudeLaunchDefaults, mentionPath } from '@/features/sessions/useWorkspaceActions';
import { useUI } from '@/stores/ui';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import type { EditorSelection } from './MonacoEditor';
import { LensBar, type Lens } from './lens/LensBar';
import { TimelineLens } from './lens/TimelineLens';
import { MarginPanel } from './lens/MarginPanel';
import { useMargin, notesFor } from '@/stores/margin';
import { useShallow } from 'zustand/react/shallow';

const MonacoEditor = lazy(() => import('./MonacoEditor'));

/**
 * File viewer / light editor backed by Monaco. Opens read-only; unlock to edit
 * and save with Ctrl/⌘ S.
 */
export function FilePane({ path, projectId, line, focused }: { path: string; projectId?: string; /** Reveal this line (1-based) once the file is up — a search hit. */ line?: number; focused: boolean }) {
  const theme = useSettings((s) => s.theme);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(isTauri ? null : 'File preview is available in the desktop app.');
  const [draft, setDraft] = useState<string>('');
  const [readOnly, setReadOnly] = useState(true);
  // Lenses: the same file as code or as the timeline of what the agent did to it;
  // the margin (notes pinned to lines) can sit beside any of them.
  const [lens, setLens] = useState<Lens>('code');
  const [margin, setMargin] = useState(false);
  const [selLines, setSelLines] = useState<{ startLine: number; endLine: number } | null>(null);
  const [jumpTo, setJumpTo] = useState<{ line: number; nonce: number } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const marginNotes = useMargin((st) => notesFor(st.notes, path));
  const noteLines = useMemo(() => marginNotes.filter((n) => !n.resolved).map((n) => [n.startLine, n.endLine] as [number, number]), [marginNotes]);
  const noteCount = noteLines.length;
  const timelineSteps = useSessions(
    useShallow((st) => {
      const key = touchKey(path);
      let n = 1;
      for (const s of Object.values(st.sessions)) for (const e of st.events[s.id] ?? []) if (e.type === 'file_write' && touchKey(e.path) === key && !e.failed) n++;
      return n;
    }),
  );
  // Alt+1/2 pick a lens, Alt+M the margin — only while this pane has the focus.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === '1') setLens('code');
      else if (e.key === '2') setLens('timeline');
      else if (e.key.toLowerCase() === 'm') setMargin((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused]);
  const [ask, setAsk] = useState<InlineAskTarget | null>(null);
  const [metaFor, setMetaFor] = useState<{ path: string; text: string } | null>(null);
  const meta = metaFor?.path === path ? metaFor.text : null;
  const media = mediaKind(path);
  const { currentProject, launchClaude, askAgentAboutFile, openAgentTerminal } = useWorkspaceActions();
  const defaultAgent = useSettings((s) => s.defaultAgent);
  const agentFound = useEnvironment((s) => (defaultAgent === 'claude' ? true : (s.report?.[defaultAgent]?.found ?? false)));
  const touched = useTouched((s) => s.files[touchKey(path)]);
  const openDiff = useUI((s) => s.openDiff);
  // What is selected here is offered to the chat beside as a chip.
  const onSelectionChange = (sel: EditorSelection | null) => {
    const store = useSelectionContext.getState();
    if (sel) setSelLines({ startLine: sel.startLine, endLine: sel.endLine });
    if (!sel || !sel.code.trim()) {
      store.clear(path);
      return;
    }
    const project = (projectId ? useProjects.getState().projects.find((x) => x.id === projectId) : undefined) ?? currentProject();
    store.set({ path, rel: project ? mentionPath(project.path, path) : basename(path), projectId: project?.id, startLine: sel.startLine, endLine: sel.endLine, code: sel.code, language: languageFor(path) });
  };
  useEffect(() => () => useSelectionContext.getState().clear(path), [path]);
  const askAbout = (sel: EditorSelection) => {
    const project = currentProject();
    setAsk({ path, projectId: project?.id, projectPath: project?.path, code: sel.code, startLine: sel.startLine, endLine: sel.endLine, language: languageFor(path), anchor: sel.anchor });
  };
  const openInAgent = (agent: AgentKind, sel: EditorSelection) => {
    const project = currentProject();
    if (!project) return;
    const rel = mentionPath(project.path, path);
    const fence = '```';
    const prompt = `Look at @${rel} lines ${sel.startLine}–${sel.endLine}:
${fence}
${sel.code}
${fence}
Wait for my instructions.`;
    const ui = useUI.getState();
    ui.splitPane(ui.activePaneId, 'horizontal', { kind: 'empty' });
    if (agent === 'claude') void launchClaude(project.id, { ...claudeLaunchDefaults(useSettings.getState().claude), prompt });
    else void openAgentTerminal(agent, { projectId: project.id, args: agentPromptArgs(agent, prompt) });
  };
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    let cancelled = false;
    if (!isTauri || media !== 'text') return;
    readTextFile(path)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setDraft(text);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // reloadNonce: a timeline restore re-reads the file.
  }, [path, media, reloadNonce]);
  const binary = error === 'Binary file';

  const dirty = content !== null && draft !== content;

  // An agent wrote this file: pick up the new bytes (unless there are unsaved edits here).
  const touchedVersion = touched?.version ?? 0;
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (!isTauri || !touchedVersion) return;
    let cancelled = false;
    readTextFile(path)
      .then((text) => {
        if (cancelled) return;
        if (dirtyRef.current) return;
        setContent(text);
        setDraft(text);
      })
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [touchedVersion, path]);
  const added = useMemo(() => agentAddedLines(touched, draft), [touched, draft]);

  const save = async () => {
    if (!dirty) return;
    try {
      await writeTextFile(path, draft);
      setContent(draft);
      toast.success(t('Saved'), { description: basename(path), duration: 1500, origin: null });
    } catch (e) {
      toast.error(t('Save failed'), { description: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, dirty, draft, path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="@container flex h-10 shrink-0 items-center gap-2 px-3 hairline-b">
        <div className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
          <span className="text-muted">{dirname(path) !== path ? `${dirname(path)}${path.includes('\\') ? '\\' : '/'}` : ''}</span>
          <span className="text-primary">{basename(path)}</span>
          {dirty ? <span className="ml-2 text-accent-warm">●</span> : null}
        </div>
        {touched ? (
          <motion.button
            key={touched.version}
            type="button"
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={springs.pop}
            onClick={() => {
              const project = currentProject();
              if (project) openDiff(mentionPath(project.path, path), undefined, project.path);
            }}
            title={`${t('Edited by {agent}', { agent: AGENT_LABEL[touched.agent] })} · ${formatRelative(touched.at)} · ${t('Open diff')}`}
            className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-success-soft pl-1.5 pr-2 text-[11.5px] font-medium text-success transition-colors hover:brightness-95"
          >
            <AgentLogo agent={touched.agent} size={12} />
            <span className="hidden @[620px]:inline">{t('Edited by {agent}', { agent: AGENT_LABEL[touched.agent] })}</span>
            <span className="hidden text-success/70 @[760px]:inline">· {formatRelative(touched.at)}</span>
            <span className="font-mono tabular">+{touched.additions}</span>
            {touched.deletions ? <span className="font-mono tabular text-danger/80">−{touched.deletions}</span> : null}
          </motion.button>
        ) : null}
        {meta ? <span className="whitespace-nowrap text-[11.5px] tabular text-muted">{meta}</span> : null}
        {content !== null ? <span className="whitespace-nowrap text-[11.5px] tabular text-muted">{formatBytes(new Blob([content]).size)}</span> : null}
        <div className="inline-flex h-7 items-stretch overflow-hidden rounded-md bg-surface-inset text-[12px] font-medium text-primary">
          <button
            type="button"
            disabled={!agentFound}
            onClick={() => askAgentAboutFile(defaultAgent === 'claude' ? 'claude-chat' : defaultAgent, path)}
            className="inline-flex items-center gap-1.5 pl-2 pr-2 transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            <AgentLogo agent={defaultAgent} size={13} /> {t('Ask {agent}', { agent: AGENT_LABEL[defaultAgent].replace(' Code', '').replace(' CLI', '') })}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t('More agents')} className="inline-flex w-6 items-center justify-center transition-colors hover:bg-surface-hover data-[state=open]:bg-surface-active hairline-l">
                <ChevronDown className="size-3.5 text-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <AgentFileItems Item={DropdownMenuItem} path={path} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {media === 'text' && !binary ? (
          <>
            <IconButton label={readOnly ? t('Unlock for editing') : t('Lock (read-only)')} size="sm" onClick={() => setReadOnly((v) => !v)} active={!readOnly}>
              {readOnly ? <Lock /> : <LockOpen />}
            </IconButton>
            <IconButton label={t('Save')} shortcut="mod+s" size="sm" onClick={() => void save()} disabled={!dirty}>
              <Save />
            </IconButton>
          </>
        ) : null}
        <IconButton label={t('Reveal in file manager')} size="sm" onClick={() => void revealInFileManager(path)}>
          <FolderOpen />
        </IconButton>
        <IconButton label={t('Open with default app')} size="sm" onClick={() => void openPath(path)}>
          <ExternalLink />
        </IconButton>
      </div>
      {media === 'text' && !binary && content !== null ? (
        <div className="@container">
          <LensBar lens={lens} onLens={setLens} margin={margin} onMargin={() => setMargin((v) => !v)} notes={noteCount} steps={timelineSteps} />
        </div>
      ) : null}
      <div className={cn('flex min-h-0 flex-1', readOnly && media === 'text' && 'opacity-[0.97]')}>
        <div className="min-h-0 min-w-0 flex-1">
        {media !== 'text' ? (
          isTauri ? <MediaView path={path} kind={media} onMeta={(text) => setMetaFor({ path, text })} /> : <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-muted">{error}</div>
        ) : binary ? (
          <HexView path={path} />
        ) : error ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-muted">{error}</div>
        ) : content === null ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            }
          >
            {lens === 'timeline' ? (
              <TimelineLens path={path} current={draft} language={languageFor(path)} onRestored={() => setReloadNonce((n) => n + 1)} />
            ) : (
              <MonacoEditor value={draft} onChange={setDraft} language={languageFor(path)} readOnly={readOnly} theme={dark ? 'conduit-dark' : 'conduit-light'} addedLines={added} notedLines={noteLines} onAskClaude={askAbout} onOpenInAgent={openInAgent} onSelectionChange={onSelectionChange} revealLine={jumpTo?.line ?? line} revealNonce={jumpTo?.nonce} findPath={path} />
            )}
          </Suspense>
        )}
        </div>
        {margin && media === 'text' && !binary && content !== null ? (
          <MarginPanel
            path={path}
            projectId={projectId}
            text={draft}
            selection={selLines}
            onReveal={(a, b) => {
              setLens('code');
              setJumpTo({ line: a, nonce: Date.now() });
              setSelLines({ startLine: a, endLine: b });
            }}
          />
        ) : null}
      </div>
      <AnimatePresence>{ask ? <InlineAsk key={`${ask.startLine}-${ask.endLine}`} target={ask} onClose={() => setAsk(null)} /> : null}</AnimatePresence>
    </div>
  );
}

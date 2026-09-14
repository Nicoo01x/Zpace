import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Swords, RefreshCw, Trash2, Columns2, Rows3, MessageSquare, Check, X, GitMerge, Square, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LivingBox, LivingGroup, LivingItem, Turn } from '@/components/ui/Living';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { basename, formatCost, formatDuration, formatRelative } from '@/lib/format';
import { git, type ChangedFile } from '@/native/git';
import { useArena, type Arena, type ArenaVariant } from '@/stores/arena';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useSettings, MODELS } from '@/stores/settings';
import { useUI, collectLeaves } from '@/stores/ui';
import { runtime } from '@/providers/runtime';
import { activityWord } from '@/features/island/live';
import { FileIcon } from '@/features/files/FileIcon';
import { languageFor } from '@/features/files/languages';
import MonacoDiff from '@/features/files/MonacoDiff';
import { Markdown } from '@/features/agent/Markdown';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { Tooltip } from '@/components/ui/Tooltip';
import { chooseVariant, discardVariant, removeArena } from './launch';
import { VARIANT_TONES } from './tones';
import type { AgentEvent } from '@/types/agent';
import { t } from '@/i18n';

/**
 * The arena: one card per variant (what it is doing, then what it said),
 * the files any of them touched with each variant's +/− beside, and the
 * diff of the chosen file — one variant at a time, or all of them side by
 * side. Choose brings a variant home; discard drops it.
 */
type Changes = Record<string, ChangedFile[]>;

/** What the agent is on right now: the last file or command of the turn. */
function subjectOf(events: AgentEvent[] | undefined): string | null {
  if (!events) return null;
  for (let i = events.length - 1; i >= 0 && i >= events.length - 40; i--) {
    const e = events[i];
    if (e.type === 'file_write' || e.type === 'file_read') return basename(e.path);
    if (e.type === 'shell_command') return e.command.length > 40 ? e.command.slice(0, 39) + '…' : e.command;
  }
  return null;
}

export function ArenaPane({ arenaId }: { arenaId: string }) {
  const arena = useArena((s) => s.arenas[arenaId]);
  if (!arena) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('This arena is gone.')}</div>;
  return <ArenaBody arena={arena} />;
}

function ArenaBody({ arena }: { arena: Arena }) {
  const projectPath = useProjects((s) => s.projects.find((p) => p.id === arena.projectId)?.path ?? '');
  const sessions = useSessions(useShallow((s) => arena.variants.map((v) => s.sessions[v.sessionId])));
  const anyBusy = sessions.some((s) => s && (s.status === 'running' || s.status === 'waiting'));
  const [changes, setChanges] = useState<Changes>({});
  const [nonce, setNonce] = useState(0);
  const [file, setFile] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string>(arena.variants[0]?.id ?? '');
  const [sideBySide, setSideBySide] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const refresh = useCallback(async () => {
    const next: Changes = {};
    await Promise.all(
      arena.variants
        .filter((v) => v.verdict !== 'discarded')
        .map(async (v) => {
          if (v.verdict === 'chosen') {
            next[v.id] = v.landed ?? [];
            return;
          }
          try {
            next[v.id] = await git.changes(v.dir, arena.base);
          } catch {
            next[v.id] = [];
          }
        }),
    );
    setChanges(next);
    setNonce((n) => n + 1);
  }, [arena.variants, arena.base]);

  // Fresh on mount, every few seconds while anyone works, and once more when the last one stops.
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const id = anyBusy ? window.setInterval(() => void refresh(), 3000) : 0;
    return () => {
      window.clearTimeout(first);
      if (id) window.clearInterval(id);
    };
  }, [refresh, anyBusy]);

  const files = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(changes)) for (const c of list) set.add(c.file);
    return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [changes]);
  const selectedFile = file && files.includes(file) ? file : (files[0] ?? null);
  // Discarded variants drop out of the comparison; a chosen one stays, read from the project folder where it landed.
  const open = arena.variants.filter((v) => v.verdict !== 'discarded');
  const selectedVariant = arena.variants.find((v) => v.id === variantId && v.verdict !== 'discarded') ?? open[0] ?? null;
  const dirOf = (v: ArenaVariant) => (v.verdict === 'chosen' ? projectPath : v.dir);
  const done = !anyBusy;

  return (
    <div className="flex h-full min-h-0 flex-col @container">
      <LivingGroup id="arena">
      {/* the task */}
      <LivingBox className="shrink-0 px-4 pb-2 pt-3 hairline-b">
        <LivingItem still className="flex items-center gap-2 text-[12px] text-muted">
          <Swords className="size-[13px] text-accent" />
          <span className="font-mono">{arena.baseBranch}</span>
          <span>·</span>
          <span>{t('{n} variants', { n: arena.variants.length })}</span>
          <span>·</span>
          <span>{formatRelative(arena.createdAt)}</span>
          {arena.mergedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
              <GitMerge className="size-3" /> {t('Merged')}
            </span>
          ) : null}
          <span className="flex-1" />
          <Tooltip content={t('Refresh')} side="bottom">
            <button type="button" aria-label={t('Refresh')} onClick={() => void refresh()} className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-primary">
              <RefreshCw className="size-[13px]" />
            </button>
          </Tooltip>
          <Tooltip content={t('Close the arena (discards what is still open)')} side="bottom">
            <button type="button" aria-label={t('Delete')} onClick={() => void removeArena(arena.id)} className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger">
              <Trash2 className="size-[13px]" />
            </button>
          </Tooltip>
        </LivingItem>
        <LivingItem still>
          <button type="button" onClick={() => setShowPrompt((v) => !v)} className="mt-1 flex w-full items-start gap-1.5 text-left">
            <span className={cn('min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-primary', !showPrompt && 'truncate whitespace-nowrap')}>{arena.prompt}</span>
            {arena.prompt.length > 80 || arena.prompt.includes('\n') ? (
              <Turn open={showPrompt} degrees={180} className="mt-1 shrink-0 text-muted">
                <ChevronDown className="size-3" />
              </Turn>
            ) : null}
          </button>
        </LivingItem>
      </LivingBox>
      {/* the variants */}
      <LivingItem still className="grid shrink-0 gap-2 p-3 hairline-b" style={{ gridTemplateColumns: `repeat(${Math.min(4, arena.variants.length)}, minmax(0, 1fr))` }}>
        {arena.variants.map((v, i) => (
          <VariantCard key={v.id} arena={arena} v={v} tone={VARIANT_TONES[i % VARIANT_TONES.length]} changes={changes[v.id] ?? v.landed ?? []} selected={v.id === selectedVariant?.id} onSelect={() => setVariantId(v.id)} canChoose={done && !arena.mergedAt} />
        ))}
      </LivingItem>
      {/* the files and the diff */}
      {files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-[12.5px] leading-relaxed text-muted">{anyBusy ? t('Nothing written yet — the files show up here as the agents work.') : open.length ? t('No files changed.') : t('Nothing left to compare.')}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside data-arena-files className="flex w-[260px] shrink-0 flex-col overflow-y-auto py-1 hairline-r">
            {files.map((f) => (
              <button key={f} type="button" onClick={() => setFile(f)} className={cn('flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-surface-hover', selectedFile === f ? 'bg-surface-active text-primary' : 'text-secondary')}>
                <FileIcon name={basename(f)} size={14} />
                <span className="min-w-0 flex-1 truncate" title={f}>
                  {basename(f)}
                  <span className="ml-1 text-[10.5px] text-muted">{f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {open.map((v) => {
                    const c = (changes[v.id] ?? []).find((x) => x.file === f);
                    const idx = arena.variants.indexOf(v);
                    const label = c ? 'V' + v.n + ' +' + c.additions + ' −' + c.deletions : 'V' + v.n + ' · ' + t('untouched');
                    return (
                      <span key={v.id} className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1 font-mono text-[9.5px] tabular', c ? 'text-white' : 'bg-surface-inset text-muted/50')} style={c ? { background: VARIANT_TONES[idx % VARIANT_TONES.length] } : undefined} title={label}>
                        {c ? '+' + c.additions : '·'}
                      </span>
                    );
                  })}
                </span>
              </button>
            ))}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-1 px-2 hairline-b">
              {open.map((v) => {
                const idx = arena.variants.indexOf(v);
                const c = (changes[v.id] ?? []).find((x) => x.file === selectedFile);
                return (
                  <button key={v.id} type="button" onClick={() => setVariantId(v.id)} className={cn('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium', !sideBySide && v.id === selectedVariant?.id ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
                    <span className="size-2 rounded-full" style={{ background: VARIANT_TONES[idx % VARIANT_TONES.length] }} />V{v.n}
                    {c ? (
                      <span className="font-mono text-[10.5px] tabular">
                        <span className="text-success">+{c.additions}</span> <span className="text-danger">−{c.deletions}</span>
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-muted">{t('untouched')}</span>
                    )}
                  </button>
                );
              })}
              <span className="flex-1" />
              {open.length > 1 ? (
                <button type="button" onClick={() => setSideBySide((v) => !v)} className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px]', sideBySide ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary')}>
                  {sideBySide ? <Rows3 className="size-[12px]" /> : <Columns2 className="size-[12px]" />} {sideBySide ? t('One at a time') : t('All side by side')}
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              {selectedFile && sideBySide && open.length > 1 ? (
                <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${open.length}, minmax(0, 1fr))` }}>
                  {open.map((v, i) => {
                    const idx = arena.variants.indexOf(v);
                    const c = (changes[v.id] ?? []).find((x) => x.file === selectedFile);
                    return (
                      <div key={v.id} className={cn('flex min-w-0 flex-col', i > 0 && 'hairline-l')}>
                        <div className="flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium text-secondary hairline-b">
                          <span className="size-2 rounded-full" style={{ background: VARIANT_TONES[idx % VARIANT_TONES.length] }} />V{v.n}
                          <span className="truncate font-normal text-muted">· {v.angleLabel}</span>
                          <span className="flex-1" />
                          {c ? (
                            <span className="font-mono text-[10.5px] tabular">
                              <span className="text-success">+{c.additions}</span> <span className="text-danger">−{c.deletions}</span>
                            </span>
                          ) : null}
                        </div>
                        <div className="min-h-0 flex-1">
                          <VariantDiff dir={dirOf(v)} v={v} base={arena.base} file={selectedFile} nonce={nonce} touched={!!c} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : selectedFile && selectedVariant ? (
                <VariantDiff dir={dirOf(selectedVariant)} v={selectedVariant} base={arena.base} file={selectedFile} nonce={nonce} touched={!!(changes[selectedVariant.id] ?? []).find((x) => x.file === selectedFile)} />
              ) : null}
            </div>
          </div>
        </div>
      )}
      </LivingGroup>
    </div>
  );
}

function VariantCard({ arena, v, tone, changes, selected, onSelect, canChoose }: { arena: Arena; v: ArenaVariant; tone: string; changes: ChangedFile[]; selected: boolean; onSelect: () => void; canChoose: boolean }) {
  const session = useSessions((s) => s.sessions[v.sessionId]);
  const events = useSessions((s) => s.events[v.sessionId]);
  const busy = !!session && (session.status === 'running' || session.status === 'waiting');
  const summary = useMemo(() => {
    if (!events) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'assistant_message' && 'text' in e && String(e.text).trim()) return String(e.text);
    }
    return null;
  }, [events]);
  const subject = busy ? subjectOf(events) : null;
  // A ticking clock while it works.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy]);
  const elapsed = session ? session.runtimeMs + (busy && session.runStartedAt ? now - session.runStartedAt : 0) : 0;
  const adds = changes.reduce((a, c) => a + c.additions, 0);
  const dels = changes.reduce((a, c) => a + c.deletions, 0);
  const [confirm, setConfirm] = useState<'choose' | 'discard' | null>(null);
  const [working, setWorking] = useState(false);
  const model = MODELS.find((m) => m.id === v.model)?.label ?? v.model;
  const openSession = () => {
    const ui = useUI.getState();
    ui.setActiveSession(v.sessionId);
    const leaf = collectLeaves(ui.layout).find((l) => l.content.kind === 'session' && l.content.sessionId === v.sessionId);
    if (leaf) ui.setActivePane(leaf.id);
    else ui.splitPane(ui.activePaneId, 'horizontal', { kind: 'session', sessionId: v.sessionId });
  };
  const act = async () => {
    setWorking(true);
    if (confirm === 'choose') await chooseVariant(arena.id, v.id);
    else if (confirm === 'discard') await discardVariant(arena.id, v.id);
    setWorking(false);
    setConfirm(null);
  };
  const gone = v.verdict !== 'open';

  return (
    <motion.div layout transition={springs.living} onClick={v.verdict === 'discarded' ? undefined : onSelect} className={cn('min-w-0 overflow-hidden bg-surface-raised p-2.5 text-[12px] shadow-[0_0_0_1px_var(--border)]', selected && v.verdict !== 'discarded' && 'shadow-[0_0_0_1.5px_var(--tone)]', v.verdict === 'discarded' && 'opacity-55')} style={{ '--tone': tone, borderRadius: 8 } as CSSProperties}>
      <LivingItem still className="relative flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[10.5px] font-semibold text-white" style={{ background: tone }}>
          V{v.n}
        </span>
        <span className="truncate font-medium text-primary">{model}</span>
        <span className="truncate text-muted">· {v.angleLabel}</span>
        <span className="flex-1" />
        {v.verdict === 'chosen' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <Check className="size-3" /> {t('Chosen')}
          </span>
        ) : v.verdict === 'discarded' ? (
          <span className="text-[11px] text-muted">{t('Discarded')}</span>
        ) : session?.status === 'waiting' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
            <span className="size-1.5 rounded-full bg-warning" /> {t('Needs you')}
          </span>
        ) : busy ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-accent-warm">
            <AgentGlyph active className="size-[11px]" /> {activityWord(session!.activity)}
          </span>
        ) : session?.status === 'error' ? (
          <span className="text-[11px] text-danger">{t('Error')}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-success">
            <Check className="size-3" /> {t('Done')}
          </span>
        )}
      </div>
      <div className="min-h-[36px] text-[12px] leading-relaxed text-secondary">
        {busy ? (
          <span className="font-mono text-[11.5px]">{subject ?? t('Working…')}</span>
        ) : summary ? (
          <div className="prose-agent prose-note line-clamp-3 text-[12px]" title={summary.length > 300 ? summary.slice(0, 600) : undefined}>
            <Markdown text={summary.length > 420 ? `${summary.slice(0, 420)}…` : summary} />
          </div>
        ) : (
          <span className="text-muted">{gone ? '' : t('Starting…')}</span>
        )}
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px] tabular text-muted">
        <span>
          {changes.length} {t('files')}
        </span>
        <span>
          <span className="text-success">+{adds}</span> <span className="text-danger">−{dels}</span>
        </span>
        {session ? <span>{formatCost(session.usage.costUsd)}</span> : null}
        {elapsed > 0 ? <span>{formatDuration(elapsed, { compact: elapsed > 3_600_000 })}</span> : null}
      </div>
      {!gone ? (
        <AnimatePresence mode="popLayout" initial={false}>
          {confirm ? (
            <LivingItem key={confirm} className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
              <div className="text-[11.5px] leading-relaxed text-secondary">{confirm === 'choose' ? t('Commit this worktree and merge {branch} into {base}; the other variants are discarded.', { branch: v.branch, base: arena.baseBranch }) : t('Drop the session, the worktree and the branch {branch}.', { branch: v.branch })}</div>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={working} onClick={() => void act()} className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium text-white disabled:opacity-50', confirm === 'choose' ? 'bg-success' : 'bg-danger')}>
                  {working ? t('Working…') : confirm === 'choose' ? t('Merge') : t('Discard')}
                </button>
                <button type="button" onClick={() => setConfirm(null)} className="h-6 rounded-md px-2 text-[11.5px] text-secondary hover:bg-surface-hover hover:text-primary">
                  {t('Cancel')}
                </button>
              </div>
            </LivingItem>
          ) : (
            <LivingItem key="actions" className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={openSession} className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-secondary hover:bg-surface-hover hover:text-primary">
                <MessageSquare className="size-[12px]" /> {t('Open session')}
              </button>
              {busy ? (
                <button type="button" onClick={() => void runtime.cancel(v.sessionId)} className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-secondary hover:bg-surface-hover hover:text-primary">
                  <Square className="size-[10px]" fill="currentColor" /> {t('Stop')}
                </button>
              ) : null}
              <span className="flex-1" />
              <Tooltip content={canChoose ? t('Merge this variant into the project') : t('Wait for every variant to finish')} side="bottom">
                <button type="button" disabled={!canChoose || busy} onClick={() => setConfirm('choose')} className="inline-flex h-6 items-center gap-1 rounded-md bg-success-soft px-2 text-[11.5px] font-medium text-success hover:brightness-95 disabled:opacity-40">
                  <GitMerge className="size-[12px]" /> {t('Choose')}
                </button>
              </Tooltip>
              <button type="button" aria-label={t('Discard')} onClick={() => setConfirm('discard')} className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger">
                <X className="size-[13px]" />
              </button>
            </LivingItem>
          )}
        </AnimatePresence>
      ) : v.verdict === 'chosen' ? (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={openSession} className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-secondary hover:bg-surface-hover hover:text-primary">
            <MessageSquare className="size-[12px]" /> {t('Open session')}
          </button>
          <span className="text-[11px] text-muted">{t('now in the project folder')}</span>
        </div>
      ) : null}
      </LivingItem>
    </motion.div>
  );
}

/** The diff of one file in one variant's worktree (or the project, once it landed) against the arena's base commit. */
function VariantDiff({ dir, v, base, file, nonce, touched }: { dir: string; v: ArenaVariant; base: string; file: string; nonce: number; touched: boolean }) {
  const theme = useSettings((s) => s.theme);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [diff, setDiff] = useState<{ key: string; original: string; modified: string } | null>(null);
  const key = `${v.id}:${file}:${nonce}`;
  useEffect(() => {
    if (!touched) return;
    let alive = true;
    void git
      .diffFile(dir, file, base)
      .then((d) => alive && setDiff({ key, ...d }))
      .catch(() => alive && setDiff({ key, original: '', modified: '' }));
    return () => {
      alive = false;
    };
  }, [dir, file, base, key, touched]);
  if (!touched) return <div className="flex h-full items-center justify-center text-[12px] text-muted">{t('V{n} did not touch this file', { n: v.n })}</div>;
  if (!diff || diff.key.split(':').slice(0, 2).join(':') !== `${v.id}:${file}`) return <div className="flex h-full items-center justify-center text-[12px] text-muted">{t('Loading…')}</div>;
  return <MonacoDiff original={diff.original} modified={diff.modified} language={languageFor(file)} inline theme={dark ? 'conduit-dark' : 'conduit-light'} />;
}

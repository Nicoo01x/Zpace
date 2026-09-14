import { useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, FolderOpen, Heart, RefreshCw, SquareTerminal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUI } from '@/stores/ui';
import { useEnvironment } from '@/stores/environment';
import { useSettings, ACCENT_PRESETS } from '@/stores/settings';
import { allPacks, applyPack } from '@/features/appearance/packs';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Spinner } from '@/components/ui/Spinner';
import { ZorynqTile } from '@/features/brand/ZorynqMark';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from '@/features/agent/BrandIcon';
import { Bloub } from '@/features/mascot/Bloub';
import { SHAPES, COLORS } from '@/features/mascot/bloub/skins';
import { EXPRESSIONS } from '@/features/mascot/bloub/expressions';
import { SHAPE_LABEL, EXPR_LABEL } from '@/features/mascot/labels';
import { useMascotColor, usePaper } from '@/features/mascot/useMascot';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { detectEnvironment, openUrl } from '@/native/system';
import { living, springs } from '@/lib/motion';
import { t, LANGUAGES, type LanguageSetting } from '@/i18n';
import { AuthorAvatar } from './AuthorCard';
import { AUTHOR, AUTHOR_URL } from './author';

/**
 * First run: six short steps — language, name, look, mascot, what's
 * installed, done. Every choice lands in Settings as it is made (the app
 * re-renders in the chosen language at once), so nothing here is a draft
 * except the name, which is committed on Continue. The step lives outside
 * React state because a language change remounts the whole chrome.
 */

const STEPS = ['language', 'name', 'look', 'mascot', 'tools', 'done'] as const;
type Step = (typeof STEPS)[number];

const useWizard = create<{ step: number; dir: 1 | -1; name: string | null; go: (to: number) => void; setName: (v: string) => void }>((set, get) => ({
  step: 0,
  dir: 1,
  name: null,
  go: (to) => set({ step: Math.max(0, Math.min(STEPS.length - 1, to)), dir: to >= get().step ? 1 : -1 }),
  setName: (name) => set({ name }),
}));

export function Onboarding() {
  const done = useUI((s) => s.onboardingDone);
  const setDone = useUI((s) => s.setOnboardingDone);
  const report = useEnvironment((s) => s.report);
  const setReport = useEnvironment((s) => s.setReport);
  const { step, dir, go } = useWizard();
  const id: Step = STEPS[step];

  // Detect the toolchain in the background from the first screen, so the tools step is instant.
  useEffect(() => {
    if (done || report) return;
    let cancelled = false;
    void detectEnvironment().then((r) => {
      if (!cancelled) setReport(r);
    });
    return () => {
      cancelled = true;
    };
  }, [done, report, setReport]);

  const next = () => {
    if (id === 'name') commitName();
    go(step + 1);
  };
  const back = () => go(step - 1);

  // Enter continues (unless a menu or a multi-line field has the keyboard).
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest('[role="menu"], [role="listbox"], textarea, button')) return;
      if (id === 'done') return;
      e.preventDefault();
      next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, id, step]);

  if (done) return null;

  return (
    <AnimatePresence>
      <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.22 } }} className="absolute inset-0 z-[700] flex items-center justify-center bg-canvas">
        <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-10" />
        <motion.div initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={springs.modal} className="flex w-[600px] max-w-[calc(100vw-48px)] flex-col" style={{ height: 'min(640px, calc(100vh - 64px))' }}>
          {/* header: the mark, the step, skip */}
          <div className="flex items-center gap-3">
            <ZorynqTile size={32} className="shadow-[0_0_0_1px_var(--border)]" />
            <div className="text-[13px] font-semibold tracking-[-0.01em]">Zpace</div>
            <div className="ml-auto flex items-center gap-3">
              <Dots count={STEPS.length} at={step} onPick={go} />
              {id !== 'done' ? (
                <button type="button" onClick={() => setDone(true)} className="text-[12px] text-muted transition-colors hover:text-primary">
                  {t('Skip setup')}
                </button>
              ) : null}
            </div>
          </div>

          {/* the step */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.div
                key={id}
                custom={dir}
                variants={{ enter: (d: number) => ({ opacity: 0, x: 36 * d, scale: 0.99 }), present: { opacity: 1, x: 0, scale: 1 }, exit: (d: number) => ({ opacity: 0, x: -36 * d, scale: 0.99, transition: { duration: 0.18, ease: 'easeIn' } }) }}
                initial="enter"
                animate="present"
                exit="exit"
                transition={{ default: springs.living, opacity: { duration: 0.22 } }}
                className="absolute inset-0 flex flex-col overflow-y-auto pt-9"
              >
                {id === 'language' && <LanguageStep />}
                {id === 'name' && <NameStep onSubmit={next} />}
                {id === 'look' && <LookStep />}
                {id === 'mascot' && <MascotStep />}
                {id === 'tools' && <ToolsStep />}
                {id === 'done' && <DoneStep onDone={() => setDone(true)} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* footer */}
          <div className="flex items-center justify-between pt-5">
            <div className="text-[11.5px] tabular text-muted">{t('Step {n} of {total}', { n: step + 1, total: STEPS.length })}</div>
            {id !== 'done' ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" leading={<ArrowLeft />} disabled={step === 0} onClick={back}>
                  {t('Back')}
                </Button>
                <Button variant="primary" trailing={<ArrowRight />} onClick={next}>
                  {t('Continue')}
                </Button>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function commitName() {
  const draft = useWizard.getState().name;
  if (draft !== null) useSettings.getState().set('userName', draft.trim());
}

/* ------------------------------------------------------------------ */

function Dots({ count, at, onPick }: { count: number; at: number; onPick: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <motion.button key={i} type="button" tabIndex={-1} onClick={() => i < at && onPick(i)} animate={{ width: i === at ? 18 : 6, opacity: i <= at ? 1 : 0.35 }} transition={springs.snappy} className={cn('h-1.5 rounded-full', i <= at ? 'bg-accent' : 'bg-[var(--text-muted)]')} />
      ))}
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-primary">{title}</h1>
      {sub ? <p className="mt-1.5 max-w-[480px] text-[13px] leading-relaxed text-secondary">{sub}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  1 · Language                                                       */
/* ------------------------------------------------------------------ */

function LanguageStep() {
  const language = useSettings((s) => s.language);
  const set = useSettings((s) => s.set);
  const system = LANGUAGES.find((l) => l.value !== 'system' && navigator.language.toLowerCase().startsWith(l.value.slice(0, 2).toLowerCase()))?.label ?? 'English';
  return (
    <>
      <Heading title={t('Welcome to Zpace')} sub={t('Pick your language. You can change it any time in Settings.')} />
      <motion.div initial={living.fieldFrom} animate={living.fieldTo} transition={living.field(0)} className="flex items-center justify-between gap-6 rounded-lg bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--border)]">
        <div>
          <div className="text-ui text-primary">{t('Language')}</div>
          <div className="mt-0.5 text-[12px] text-secondary">{t('Your system is in {lang}.', { lang: system })}</div>
        </div>
        <Select className="w-[220px] shrink-0" value={language} onChange={(v) => set('language', v as LanguageSetting)} options={LANGUAGES.map((l) => ({ value: l.value, label: l.value === 'system' ? `${t('System')} · ${system}` : l.label }))} />
      </motion.div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  2 · Name                                                           */
/* ------------------------------------------------------------------ */

function NameStep({ onSubmit }: { onSubmit: () => void }) {
  const saved = useSettings((s) => s.userName);
  const envUser = useEnvironment((s) => s.report?.user ?? '');
  const { name, setName } = useWizard();
  const value = name ?? saved ?? '';
  return (
    <>
      <Heading title={t('What should we call you?')} sub={t('Only for the greeting on the start screen. Leave it empty and Zpace just says hi.')} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-2"
      >
        <label className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted" htmlFor="ob-name">
          {t('Your name')}
        </label>
        <TextInput id="ob-name" autoFocus size="md" value={value} onChange={(e) => setName(e.target.value)} placeholder={envUser || t('Your name')} className="h-11 text-[15px]" />
        {envUser && !value ? (
          <button type="button" onClick={() => setName(envUser)} className="self-start text-[12px] text-secondary transition-colors hover:text-primary">
            {t('Use “{name}”', { name: envUser })}
          </button>
        ) : null}
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  3 · Look                                                           */
/* ------------------------------------------------------------------ */

function LookStep() {
  const s = useSettings();
  return (
    <>
      <Heading title={t('Make it yours')} sub={t('A theme pack sets the colours, the terminal and the editor together. Fonts, density and every colour are in Settings › Appearance.')} />
      <div className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">{t('Theme packs')}</div>
      <div className="grid grid-cols-4 gap-2">
        {allPacks().map((pk, i) => {
          const on = s.themePack === pk.id || (!s.themePack && pk.id === (s.theme === 'dark' ? 'zorynq-dark' : 'zorynq-light'));
          const bg = pk.colors.background ?? (pk.appearance === 'dark' ? '#141414' : '#fbfbfa');
          const canvas = pk.colors.canvas ?? (pk.appearance === 'dark' ? '#1d1d1f' : '#f2f2f0');
          const text = pk.colors.textPrimary ?? (pk.appearance === 'dark' ? '#e8e8e8' : '#1d1d1f');
          const accent = pk.colors.accent ?? '#2f6fde';
          return (
            <motion.button
              key={pk.id}
              type="button"
              aria-pressed={on}
              initial={living.fieldFrom}
              animate={living.fieldTo}
              transition={living.field(i)}
              onClick={() => applyPack(pk.id)}
              className={cn('overflow-hidden rounded-lg text-left transition-shadow duration-(--motion-fast) press', on ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--text-muted)]')}
            >
              <div className="flex h-10" style={{ background: canvas }}>
                <div className="w-1/3" />
                <div className="flex flex-1 flex-col gap-1 p-2" style={{ background: bg }}>
                  <span className="h-1.5 w-2/3 rounded-full" style={{ background: text, opacity: 0.8 }} />
                  <span className="h-1.5 w-1/2 rounded-full" style={{ background: text, opacity: 0.35 }} />
                  <span className="mt-auto h-2 w-6 rounded-full" style={{ background: accent }} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11.5px]">
                <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
                <span className="truncate text-primary">{pk.label}</span>
                {on ? <Check className="ml-auto size-[12px] shrink-0 text-accent" /> : null}
              </div>
            </motion.button>
          );
        })}
      </div>
      <div className="mb-2 mt-5 text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">{t('Accent')}</div>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((p, i) => {
          const selected = s.accent === p.id;
          return (
            <motion.button
              key={p.id}
              type="button"
              aria-label={t(p.label)}
              aria-pressed={selected}
              initial={living.fieldFrom}
              animate={living.fieldTo}
              transition={living.field(i + 4)}
              onClick={() => s.set('accent', p.id)}
              className={cn('inline-flex size-7 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-transform duration-(--motion-fast) hover:scale-110', selected && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--canvas)]')}
              style={{ background: p.light }}
            >
              {selected ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
            </motion.button>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  4 · Mascot                                                         */
/* ------------------------------------------------------------------ */

function MascotStep() {
  const s = useSettings();
  const m = s.mascot;
  const patch = (p: Partial<typeof m>) => s.patch({ mascot: { ...m, ...p } });
  const color = useMascotColor();
  const paper = usePaper();
  return (
    <>
      <Heading title={t('Meet your mascot')} sub={t('It lives in the title bar and reacts to what the agents do — thinking, waiting for you, done. Pick a shape, a colour and a mood.')} />
      <div className="flex gap-5">
        <div className="flex w-[168px] shrink-0 flex-col items-center gap-3">
          <div className="flex size-[168px] items-center justify-center rounded-xl bg-surface-inset">
            <Bloub size={132} shape={m.shape} color={color} expression={m.expression} paper={paper} state="idle" follow />
          </div>
          <div className="flex w-full items-center justify-between gap-3 px-1">
            <span className="text-[12.5px] text-primary">{t('Show the mascot')}</span>
            <Switch checked={m.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">{t('Shape')}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {SHAPES.map((sh, i) => {
                const selected = m.shape === sh.id;
                return (
                  <motion.button
                    key={sh.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={t(SHAPE_LABEL[sh.id] ?? sh.id)}
                    initial={living.fieldFrom}
                    animate={living.fieldTo}
                    transition={living.field(i)}
                    onClick={() => patch({ shape: sh.id })}
                    className={cn('flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-[background-color,box-shadow] duration-(--motion-fast) press', selected ? 'bg-surface-active shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'hover:bg-surface-hover')}
                  >
                    <Bloub size={38} shape={sh.id} color={color} expression={m.expression} paper={paper} state="idle" follow={false} frozenAt={0.4} />
                    <span className="text-[10.5px] text-secondary">{t(SHAPE_LABEL[sh.id] ?? sh.id)}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <div className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">{t('Colour')}</div>
              <button type="button" onClick={() => patch({ color: '' })} className={cn('text-[11.5px]', m.color ? 'text-secondary hover:text-primary' : 'text-muted')}>
                {t('Use the accent colour')}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {COLORS.map((c) => {
                const selected = m.color.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button key={c.id} type="button" aria-label={c.id} aria-pressed={selected} onClick={() => patch({ color: c.hex })} className={cn('inline-flex size-6 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-transform duration-(--motion-fast) hover:scale-110', selected && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--canvas)]')} style={{ background: c.hex }}>
                    {selected ? <Check className="size-3" style={{ color: c.id === 'creme' ? '#333' : '#fff' }} strokeWidth={3} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-[12.5px] text-primary">{t('Resting expression')}</div>
            <Select size="sm" className="w-[150px] shrink-0" value={m.expression} onChange={(v) => patch({ expression: v })} options={EXPRESSIONS.map((e) => ({ value: e.id, label: t(EXPR_LABEL[e.id] ?? e.id) }))} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  5 · Tools                                                          */
/* ------------------------------------------------------------------ */

interface ToolRow {
  id: string;
  label: string;
  icon: ReactNode;
  ok: boolean | null;
  detail?: string;
  required?: boolean;
}

function ToolsStep() {
  const report = useEnvironment((s) => s.report);
  const setReport = useEnvironment((s) => s.setReport);
  const [checking, setChecking] = useState(false);
  const retry = async () => {
    setChecking(true);
    setReport(await detectEnvironment());
    setChecking(false);
  };
  const rows: ToolRow[] = [
    { id: 'claude', label: 'Claude Code', icon: <ClaudeLogo size={15} />, ok: report ? report.claude.found : null, detail: report?.claude.version?.split(' ')[0], required: true },
    { id: 'codex', label: 'Codex', icon: <CodexLogo size={15} />, ok: report ? !!report.codex?.found : null, detail: report?.codex?.version?.split(' ')[0] },
    { id: 'gemini', label: 'Gemini CLI', icon: <GeminiLogo size={15} />, ok: report ? !!report.gemini?.found : null, detail: report?.gemini?.version?.split(' ')[0] },
    { id: 'opencode', label: 'OpenCode', icon: <OpenCodeLogo size={15} />, ok: report ? !!report.opencode?.found : null, detail: report?.opencode?.version?.split(' ')[0] },
    { id: 'git', label: 'Git', icon: <span className="font-mono text-[11px] font-bold text-muted">git</span>, ok: report ? report.git.found : null, detail: report?.git.version?.replace(/^git version /, '') },
    { id: 'node', label: 'Node.js', icon: <span className="font-mono text-[11px] font-bold text-muted">js</span>, ok: report ? report.node.found : null, detail: report?.node.version },
    { id: 'shell', label: t('Shells'), icon: <SquareTerminal className="size-[15px] text-muted" />, ok: report ? report.shells.length > 0 : null, detail: report?.shells.map((sh) => sh.label).slice(0, 3).join(' · ') },
  ];
  const claudeMissing = !!report && !report.claude.found;
  return (
    <>
      <Heading title={t('What’s installed')} sub={t('Zpace drives the agents you already have. Claude Code is the main one; the others are optional and can be added later.')} />
      <div className="flex flex-col rounded-lg bg-surface shadow-[0_0_0_1px_var(--border)]">
        {rows.map((r, i) => (
          <motion.div key={r.id} initial={living.fieldFrom} animate={living.fieldTo} transition={living.field(i)} className="flex h-10 items-center gap-3 px-3 text-[12.5px] hairline-b last:shadow-none">
            <span className="inline-flex w-5 items-center justify-center">{r.icon}</span>
            <span className={cn('w-[120px] font-medium', r.ok === false && !r.required ? 'text-secondary' : 'text-primary')}>{r.label}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted">{r.detail ?? ''}</span>
            <span className="inline-flex size-4 items-center justify-center">
              {r.ok === null ? (
                <Spinner size={12} />
              ) : r.ok ? (
                <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.pop} className="inline-flex size-4 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check className="size-[10px]" strokeWidth={3} />
                </motion.span>
              ) : (
                <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.pop} className={cn('inline-flex size-4 items-center justify-center rounded-full', r.required ? 'bg-danger-soft text-danger' : 'bg-surface-inset text-muted')}>
                  <X className="size-[10px]" strokeWidth={3} />
                </motion.span>
              )}
            </span>
          </motion.div>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {claudeMissing ? (
          <motion.div key="missing" initial={living.enter} animate={living.present} exit={living.exit} transition={living.transition} className="mt-4 rounded-lg bg-surface px-4 py-3 shadow-[0_0_0_1px_color-mix(in_srgb,var(--danger)_25%,transparent)]">
            <div className="text-ui font-medium text-primary">{t('Claude Code not found')}</div>
            <div className="mt-0.5 text-[12px] text-secondary">{t('Install it, then retry. You can still explore the interface with the sample workspace.')}</div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" leading={<ExternalLink />} onClick={() => void openUrl('https://docs.anthropic.com/en/docs/claude-code/quickstart')}>
                {t('Install Claude Code')}
              </Button>
              <Button size="sm" leading={<RefreshCw />} loading={checking} onClick={() => void retry()}>
                {t('Retry')}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  6 · Done                                                           */
/* ------------------------------------------------------------------ */

function DoneStep({ onDone }: { onDone: () => void }) {
  const userName = useSettings((s) => s.userName);
  const { openProject, openTerminalPane } = useWorkspaceActions();
  const first = userName.trim().split(/\s+/)[0];
  return (
    <>
      <Heading title={first ? t('You’re all set, {name}.', { name: first }) : t('You’re all set.')} sub={t('Everything you chose can be changed later in Settings.')} />
      <motion.div initial={living.fieldFrom} animate={living.fieldTo} transition={living.field(0)} className="flex items-center gap-4 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--border)]">
        <AuthorAvatar size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-primary">{t('Made by {name}', { name: AUTHOR.name })}</div>
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-secondary">{t('If Zpace is useful to you, follow along on GitHub — new features land there first.')}</div>
        </div>
        <Button variant="default" leading={<Heart className="text-danger" />} onClick={() => void openUrl(AUTHOR_URL)}>
          {t('Follow on GitHub')}
        </Button>
      </motion.div>
      <div className="mb-2 mt-8 text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">{t('Get started')}</div>
      <motion.div initial={living.fieldFrom} animate={living.fieldTo} transition={living.field(1)} className="flex items-center gap-2">
        <Button
          variant="primary"
          leading={<FolderOpen />}
          onClick={() => {
            onDone();
            void openProject();
          }}
        >
          {t('Open a project folder')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            onDone();
            openTerminalPane();
          }}
        >
          {t('Just open a terminal')}
        </Button>
      </motion.div>
    </>
  );
}

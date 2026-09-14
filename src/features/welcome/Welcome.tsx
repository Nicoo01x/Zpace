import { useEffect, useMemo, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, FolderOpen, MessageSquare, NotebookPen, Terminal as TerminalIcon, GitCommit, FileText, Flame } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { springs } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { useSettings } from '@/stores/settings';
import { sessionTitle, useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useNotes } from '@/stores/notes';
import { useTerminals } from '@/stores/terminals';
import { useEnvironment } from '@/stores/environment';
import { useUsage, limitLabel, resetsIn } from '@/stores/usage';
import { useShallow } from 'zustand/react/shallow';
import { AgentLogo } from '@/features/agent/BrandIcon';
import { AGENT_KINDS, AGENT_LABEL } from '@/features/agent/agents';
import { git } from '@/native/git';
import { isTauri } from '@/lib/platform';
import { formatCost, formatTokens, formatRelative } from '@/lib/format';
import { Brand } from './Brand';
import { MacFolder } from '@/components/ui/MacFolder';
import { Bloub } from '@/features/mascot/Bloub';
import { useMascotColor, usePaper } from '@/features/mascot/useMascot';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { Shortcut } from '@/components/ui/Shortcut';
import { Switch } from '@/components/ui/Switch';

/**
 * The entrance: once per launch (unless turned off), a greeting with the
 * mascot waving, then the numbers of what has been built here — projects,
 * sessions and what they cost, notes, files the agents wrote — and the
 * commit map of the current project, GitHub-style. Enter or the button on
 * the left gets you in; the checkbox on the right stops it from coming back
 * (Settings › General turns it on again).
 */
const EASE = [0.2, 0.8, 0.2, 1] as const;

function greeting(hour: number): string {
  if (hour < 6) return t('Good night');
  if (hour < 13) return t('Good morning');
  if (hour < 20) return t('Good afternoon');
  return t('Good evening');
}

export function Welcome() {
  const open = useUI((s) => s.welcomeOpen);
  return <AnimatePresence>{open ? <WelcomeScreen key="welcome" /> : null}</AnimatePresence>;
}

function WelcomeScreen() {
  const close = useUI((s) => s.setWelcomeOpen);
  const setSetting = useSettings((s) => s.set);
  const showWelcome = useSettings((s) => s.showWelcome);
  const [skip, setSkip] = useState(!showWelcome);
  const { openProject, currentProject } = useWorkspaceActions();
  const color = useMascotColor();
  const paper = usePaper();
  const mascot = useSettings((s) => s.mascot);
  const envUser = useEnvironment((s) => s.report?.user ?? null);
  const userName = useSettings((s) => (s.userName ?? '').trim());
  const projects = useProjects((s) => s.projects);
  const sessions = useSessions((s) => s.sessions);
  const events = useSessions((s) => s.events);
  const notes = useNotes((s) => s.notes);
  const terminals = useTerminals((s) => s.tabs);
  const [name, setName] = useState<string | null>(null);
  // The plan's real numbers (5-hour / weekly), refreshed for the entrance.
  const limits = useUsage(useShallow((st) => Object.values(st.limits).filter((l) => ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'].includes(l.type)).sort((a, b) => a.type.localeCompare(b.type))));
  const plan = useUsage((st) => st.plan);
  const refreshUsage = useUsage((st) => st.refresh);
  const envReport = useEnvironment((st) => st.report);
  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);
  const [activity, setActivity] = useState<Array<{ date: string; count: number }> | null>(null);
  const project = currentProject();

  useEffect(() => {
    if (!isTauri) return;
    void git.userName(project?.path).then((n) => setName(n ?? null)).catch(() => void 0);
  }, [project?.path]);
  useEffect(() => {
    if (!isTauri || !project?.git?.isRepo) return;
    let cancelled = false;
    void git.activity(project.path, 365).then((a) => !cancelled && setActivity(a)).catch(() => !cancelled && setActivity([]));
    return () => {
      cancelled = true;
    };
  }, [project?.path, project?.git?.isRepo]);

  const stats = useMemo(() => {
    const list = Object.values(sessions).filter((s) => !s.hidden);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let cost = 0;
    let tokens = 0;
    let costToday = 0;
    let filesWritten = 0;
    let commands = 0;
    for (const s of list) {
      cost += s.usage.costUsd;
      tokens += s.usage.inputTokens + s.usage.outputTokens;
      if (s.updatedAt >= start.getTime()) costToday += s.usage.costUsd;
      for (const e of events[s.id] ?? []) {
        if (e.type === 'file_write') filesWritten++;
        else if (e.type === 'shell_command') commands++;
      }
    }
    const recentProjects = [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 4);
    const recentSessions = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
    return { sessions: list.length, cost, costToday, tokens, filesWritten, commands, notes: Object.keys(notes).length, terminals: terminals.length, recentProjects, recentSessions };
  }, [sessions, events, projects, notes, terminals]);

  // No repository? Then the map shows the days worked inside Zpace (session activity, notes, terminals).
  const appActivity = useMemo(() => {
    const byDay = new Map<string, number>();
    const key = (ms: number) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const bump = (ms: number, n = 1) => {
      if (!ms) return;
      const k = key(ms);
      byDay.set(k, (byDay.get(k) ?? 0) + n);
    };
    for (const s of Object.values(sessions)) {
      if (s.hidden) continue;
      bump(s.createdAt);
      for (const e of events[s.id] ?? []) bump(e.timestamp);
    }
    for (const n of Object.values(notes)) {
      bump(n.createdAt);
      bump(n.updatedAt);
    }
    for (const tab of terminals) bump(tab.createdAt ?? 0);
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [sessions, events, notes, terminals]);
  const useGit = !!project?.git?.isRepo && (activity === null || activity.length > 0);
  const mapData = useGit ? activity : appActivity;

  const who = userName || name || envUser || '';
  const enter = () => {
    if (skip !== !showWelcome) setSetting('showWelcome', !skip);
    close(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        enter();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, showWelcome]);

  const hour = new Date().getHours();
  const cards = [
    { icon: <FolderOpen className="size-4" />, label: t('Projects'), value: String(projects.length) },
    { icon: <MessageSquare className="size-4" />, label: t('Claude sessions'), value: String(stats.sessions), hint: stats.cost ? `${formatCost(stats.cost)} · ${formatTokens(stats.tokens)} ${t('tokens')}` : undefined },
    { icon: <FileText className="size-4" />, label: t('Files written by agents'), value: String(stats.filesWritten), hint: stats.commands ? t('{n} commands run', { n: stats.commands }) : undefined },
    { icon: <NotebookPen className="size-4" />, label: t('Notes & boards'), value: String(stats.notes) },
    { icon: <TerminalIcon className="size-4" />, label: t('Terminals'), value: String(stats.terminals) },
    { icon: <ClaudeLogo size={16} />, label: t('Spent today'), value: formatCost(stats.costToday) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.01, transition: { duration: 0.28, ease: EASE } }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[920] flex flex-col overflow-hidden bg-canvas pt-[var(--titlebar-height)] text-primary"
      role="dialog"
      aria-label={t('Welcome')}
    >
      {/* The glow starts under the title bar, which sits on top of this overlay with no background of its own. */}
      <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: `radial-gradient(70% 55% at 30% 0%, color-mix(in srgb, ${color} 22%, transparent), transparent 70%), radial-gradient(40% 40% at 85% 10%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)` }} />
      <div className="relative mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col overflow-y-auto px-10 pb-8 pt-10">
        {/* the brand: the island's tile with the Z and the word assembling; entering flies the Z up into the title bar */}
        <Brand />

        {/* greeting */}
        <div className="flex items-center gap-6">
          <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ ...springs.pop, delay: 0.1 }}>
            <Bloub size={112} data-mascot shape={mascot.shape} color={color} expression="heureux" paper={paper} state="notify" follow />
          </motion.div>
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.25 }} className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
              {greeting(hour)}
            </motion.div>
            <h1 className="mt-1 flex items-center gap-3 text-[40px] font-semibold leading-none tracking-[-0.02em]">
              <Words text={who ? t('Hi, {name}', { name: who }) : t('Hi')} delay={0.35} />
              <motion.span
                aria-hidden
                initial={{ opacity: 0, rotate: 0 }}
                animate={{ opacity: 1, rotate: [0, 18, -8, 16, -4, 12, 0] }}
                transition={{ opacity: { delay: 0.7, duration: 0.2 }, rotate: { delay: 0.7, duration: 1.4, ease: 'easeInOut', times: [0, 0.15, 0.35, 0.55, 0.7, 0.85, 1] } }}
                style={{ transformOrigin: '70% 70%', display: 'inline-block' }}
              >
                👋
              </motion.span>
            </h1>
            <motion.span aria-hidden initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: EASE, delay: 0.6 }} className="mt-3 block h-[3px] w-14 origin-left rounded-full" style={{ background: color }} />
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.75 }} className="mt-2 text-[14px] text-secondary">
              {project ? t('Picking up {project} where you left it.', { project: project.name }) : t('Everything here is local. Open a folder to begin.')}
            </motion.div>
          </div>
        </div>

        {/* numbers */}
        <div className="mt-7 grid grid-cols-3 gap-3 md:grid-cols-6">
          {cards.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...springs.pop, delay: 0.6 + i * 0.06 }}
              className="rounded-xl bg-surface-raised px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_var(--border)]"
            >
              <div className="flex min-h-[30px] items-start gap-1.5 text-[11.5px] text-muted">
                <span className="mt-px shrink-0">{c.icon}</span>
                <span className="line-clamp-2 leading-tight">{c.label}</span>
              </div>
              <div className="mt-1.5 text-[26px] font-semibold leading-none tabular tracking-[-0.02em]">{c.value}</div>
              {c.hint ? <div className="mt-1 truncate text-[11.5px] text-secondary">{c.hint}</div> : null}
            </motion.div>
          ))}
        </div>

        {/* commit map + AIs, then the recents side by side */}
        <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 1 }} className="min-w-0 rounded-xl bg-surface-raised px-4 pb-3 pt-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_var(--border)]">
              <div className="mb-3 flex items-center gap-2 text-[12.5px] text-secondary">
                {useGit ? <GitCommit className="size-4 text-muted" /> : <Flame className="size-4 text-muted" />}
                <span className="font-medium text-primary">{useGit ? t('Commits, last year') : t('Days worked in Zpace')}</span>
                {useGit && project ? <span className="text-muted">· {project.name}</span> : null}
                <span className="flex-1" />
                {mapData ? <Streak activity={mapData} unit={useGit ? 'commits' : 'days'} /> : null}
              </div>
              {mapData && mapData.length > 0 ? (
                <CommitMap activity={mapData} color={color} unit={useGit ? 'commits' : 'actions'} />
              ) : (
                <div className="flex h-[112px] items-center justify-center text-[12.5px] text-muted">{useGit && !activity ? t('Reading history…') : t('Nothing yet — it fills up as you work here.')}</div>
              )}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 1.15 }} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Recents title={t('Recent projects')} items={stats.recentProjects.map((p) => ({ id: p.id, title: p.name, sub: formatRelative(p.lastOpenedAt), icon: <MacFolder color={p.color || undefined} size={15} />, run: () => { useUI.getState().setActiveProject(p.id); enter(); } }))} empty={t('No projects yet.')} action={{ label: t('Open a folder'), run: () => { enter(); void openProject(); } }} />
              <Recents title={t('Recent sessions')} items={stats.recentSessions.map((s) => ({ id: s.id, title: sessionTitle(s.title), sub: `${projects.find((p) => p.id === s.projectId)?.name ?? ''} · ${formatRelative(s.updatedAt)}`, icon: <ClaudeLogo size={13} />, run: () => { enter(); useUI.getState().setActiveSession(s.id); } }))} empty={t('No sessions yet.')} />
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 1.1 }} className="min-w-0">
            <Limits limits={limits} plan={plan} agents={AGENT_KINDS.map((a) => ({ id: a, label: AGENT_LABEL[a], found: a === 'claude' ? !!envReport?.claude.found : !!envReport?.[a]?.found, version: a === 'claude' ? envReport?.claude.version : envReport?.[a]?.version }))} />
          </motion.div>
        </div>

        {/* footer */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 1.2 }} className="mt-auto flex items-center justify-between gap-4 pt-6">
          <button
            type="button"
            onClick={enter}
            autoFocus
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--text-primary)] pl-5 pr-4 text-[13.5px] font-medium text-inverse shadow-sm outline-none press hover:scale-[1.02]"
          >
            {t('Enter')}
            <ArrowRight className="size-4" />
            <Shortcut combo="enter" className="ml-1 opacity-70" />
          </button>
          {/* Show-at-launch: a settings-style row, positive wording, the switch does the talking. */}
          <label htmlFor="welcome-show" className="inline-flex cursor-pointer select-none items-center gap-3 rounded-full bg-[color-mix(in_srgb,var(--surface-raised)_82%,transparent)] py-1.5 pl-4 pr-2 text-[12.5px] shadow-[0_0_0_1px_var(--border)] backdrop-blur-sm transition-colors hover:bg-surface-raised">
            <span className="flex flex-col leading-tight">
              <span className="font-medium text-primary">{t('Show at launch')}</span>
              <span className="text-[11px] text-muted">{skip ? t('Straight to the workspace next time') : t('This entrance, every time the app opens')}</span>
            </span>
            <Switch id="welcome-show" checked={!skip} onCheckedChange={(v) => setSkip(!v)} aria-label={t('Show at launch')} />
          </label>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Words rising in one after the other. */
function Words({ text, delay }: { text: string; delay: number }) {
  return (
    <span className="inline-flex flex-wrap gap-x-[0.28em]">
      {text.split(' ').map((w, i) => (
        <motion.span key={`${w}-${i}`} initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.5, ease: EASE, delay: delay + i * 0.08 }} className="inline-block">
          {w}
        </motion.span>
      ))}
    </span>
  );
}

function Streak({ activity, unit }: { activity: Array<{ date: string; count: number }>; unit: 'commits' | 'days' }) {
  const total = unit === 'commits' ? activity.reduce((n, d) => n + d.count, 0) : activity.length;
  const set = new Set(activity.map((d) => d.date));
  let streak = 0;
  const day = new Date();
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 400; i++) {
    const key = local(day);
    if (set.has(key)) streak++;
    else if (i > 0) break;
    day.setDate(day.getDate() - 1);
  }
  return (
    <span className="inline-flex items-center gap-3 text-[11.5px] text-muted">
      <span className="tabular">{unit === 'commits' ? t('{n} commits', { n: total }) : t('{n} active days', { n: total })}</span>
      {streak > 1 ? (
        <span className="inline-flex items-center gap-1 tabular text-accent-warm">
          <Flame className="size-3.5" /> {t('{n}-day streak', { n: streak })}
        </span>
      ) : null}
    </span>
  );
}

/** 53 weeks × 7 days, filled column by column. */
function CommitMap({ activity, color, unit }: { activity: Array<{ date: string; count: number }>; color: string; unit: 'commits' | 'actions' }) {
  const byDay = useMemo(() => new Map(activity.map((d) => [d.date, d.count])), [activity]);
  const max = Math.max(1, ...activity.map((d) => d.count));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 364 - today.getDay());
  const weeks: Array<Array<{ key: string; count: number; month: number; future: boolean }>> = [];
  const d = new Date(start);
  while (d <= today || weeks.length < 53) {
    const col: Array<{ key: string; count: number; month: number; future: boolean }> = [];
    for (let i = 0; i < 7; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      col.push({ key, count: byDay.get(key) ?? 0, month: d.getMonth(), future: d > today });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(col);
    if (weeks.length >= 53) break;
  }
  const months = t('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec').split(' ');
  // A month label where a month begins — skipped when the previous label sits fewer than three columns back.
  const labels: Array<{ col: number; name: string }> = [];
  let last = -1;
  weeks.forEach((w, i) => {
    if (w[0].month !== last) {
      if (labels.length === 0 || i - labels[labels.length - 1].col >= 3) labels.push({ col: i, name: months[w[0].month] });
      last = w[0].month;
    }
  });
  if (labels.length > 1 && weeks.length - labels[labels.length - 1].col < 3) labels.pop();
  const level = (n: number) => (n === 0 ? 0 : n >= max * 0.75 ? 4 : n >= max * 0.5 ? 3 : n >= max * 0.25 ? 2 : 1);
  const alpha = [0.1, 0.35, 0.6, 0.82, 1];
  // Whole pixels for every square — measured from the card, so the grid never has to stretch a fractional column.
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const LEFT = 26;
  const TOP = 14;
  const gap = 3;
  const cell = Math.max(6, Math.floor((width - LEFT - gap * (weeks.length - 1)) / weeks.length));
  const step = cell + gap;
  const svgW = LEFT + weeks.length * step - gap;
  const svgH = TOP + 7 * step - gap;
  const fill = (n: number) => (n === 0 ? 'var(--surface-inset)' : `color-mix(in srgb, ${color} ${Math.round(alpha[level(n)] * 100)}%, var(--surface-inset))`);
  const days = ['', t('Mon'), '', t('Wed'), '', t('Fri'), ''];
  return (
    <div ref={host} className="w-full">
      {width > 0 ? (
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="block" style={{ maxWidth: '100%' }} role="img" aria-label={unit === 'commits' ? t('Commits, last year') : t('Days worked in Zpace')}>
          {labels.map((l) => (
            <text key={`${l.col}-${l.name}`} x={LEFT + l.col * step} y={9} className="fill-[var(--text-muted)] text-[9.5px]">
              {l.name}
            </text>
          ))}
          {days.map((l, i) =>
            l ? (
              <text key={i} x={0} y={TOP + i * step + cell * 0.78} className="fill-[var(--text-muted)] text-[9px]">
                {l}
              </text>
            ) : null,
          )}
          {weeks.map((w, wi) =>
            w.map((c, di) =>
              c.future ? null : (
                <rect key={c.key} x={LEFT + wi * step} y={TOP + di * step} width={cell} height={cell} rx={2} style={{ fill: fill(c.count), animationDelay: `${1.0 + wi * 0.012}s` }} className="commit-cell">
                  <title>{`${c.key} · ${unit === 'commits' ? t('{n} commits', { n: c.count }) : t('{n} actions', { n: c.count })}`}</title>
                </rect>
              ),
            ),
          )}
        </svg>
      ) : (
        <div style={{ height: 7 * 13 + TOP }} />
      )}
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted">
        {t('Less')}
        {alpha.map((a, i) => (
          <span key={i} className="size-[10px] rounded-[2px]" style={{ background: i === 0 ? 'var(--surface-inset)' : `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, var(--surface-inset))` }} />
        ))}
        {t('More')}
      </div>
    </div>
  );
}

function Recents({ title, items, empty, action }: { title: string; items: Array<{ id: string; title: string; sub: string; icon: React.ReactNode; run: () => void }>; empty: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="rounded-xl bg-surface-raised p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_var(--border)]">
      <div className="mb-1.5 flex items-center justify-between px-1 text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">
        {title}
        {action ? (
          <button type="button" onClick={action.run} className="normal-case tracking-normal text-accent hover:underline">
            {action.label}
          </button>
        ) : null}
      </div>
      {items.length === 0 ? <div className="px-1 py-2 text-[12.5px] text-muted">{empty}</div> : null}
      {items.map((it) => (
        <button key={it.id} type="button" onClick={it.run} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[12.5px] transition-colors hover:bg-surface-hover">
          <span className="inline-flex w-4 shrink-0 justify-center text-muted">{it.icon}</span>
          <span className="min-w-0 flex-1 truncate text-primary">{it.title}</span>
          <span className="shrink-0 truncate text-[11px] text-muted">{it.sub}</span>
        </button>
      ))}
    </div>
  );
}

/** The AIs at hand and Claude's real plan windows, as arcs that fill up. */
function Limits({ limits, plan, agents }: { limits: Array<{ type: string; utilization?: number; resetsAt?: number }>; plan: string | null; agents: Array<{ id: 'claude' | 'codex' | 'gemini' | 'opencode'; label: string; found: boolean; version?: string }> }) {
  return (
    <div className="rounded-xl bg-surface-raised p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_var(--border)]">
      <div className="mb-2 flex items-center justify-between px-1 text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted">
        {t('Your AIs')}
        {plan ? <span className="rounded-md bg-claude-soft px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-claude">Claude {plan}</span> : null}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5 px-1">
        {agents.map((a, i) => (
          <motion.span
            key={a.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springs.pop, delay: 1.2 + i * 0.05 }}
            title={a.version ?? ''}
            className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11.5px]', a.found ? 'bg-surface-inset text-primary' : 'bg-surface-inset/60 text-muted line-through decoration-muted/60')}
          >
            <AgentLogo agent={a.id} size={12} />
            {a.label}
          </motion.span>
        ))}
      </div>
      {limits.length === 0 ? (
        <div className="px-1 pb-1 text-[12px] text-muted">{t('Sign in with Claude Code to see your plan limits here.')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-1 pb-1">
          {limits.map((l, i) => {
            const pct = Math.round((l.utilization ?? 0) * 100);
            const tone = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--accent)';
            const r = 17;
            const c = 2 * Math.PI * r;
            return (
              <div key={l.type} className="flex items-center gap-2.5">
                <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0 -rotate-90">
                  <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-inset)" strokeWidth="5" />
                  <motion.circle cx="22" cy="22" r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * Math.min(100, pct)) / 100 }} transition={{ duration: 1.1, ease: EASE, delay: 1.3 + i * 0.12 }} />
                </svg>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-none tabular">{pct}%</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-secondary">{t(limitLabel(l.type))}</div>
                  <div className="text-[10.5px] leading-tight text-muted">{resetsIn(l.resetsAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

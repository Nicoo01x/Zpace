import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GitCommit, FileText, NotebookPen, Terminal as TerminalIcon, MessageSquare, Save } from 'lucide-react';
import { useUI } from '@/stores/ui';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useNotes } from '@/stores/notes';
import { useTerminals } from '@/stores/terminals';
import { useLedger, dayKey } from '@/stores/ledger';
import { git } from '@/native/git';
import { isTauri } from '@/lib/platform';
import { formatCost, formatTokens, basename } from '@/lib/format';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { MacFolder } from '@/components/ui/MacFolder';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { CostByProject } from '@/features/agent/CostByProject';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { t, currentLocale } from '@/i18n';

/**
 * The day in numbers: turns, tokens and cost per project (from the ledger),
 * commits today per repository, files the agents wrote, notes touched,
 * terminals opened. "Save as note" keeps it as Markdown in the project that
 * did the most.
 */
function startOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function DaySummaryDialog() {
  const open = useUI((s) => s.summaryOpen);
  const setOpen = useUI((s) => s.setSummaryOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md">{open ? <Body onClose={() => setOpen(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const projects = useProjects((s) => s.projects);
  const todayRow = useLedger((s) => s.days[dayKey()]);
  const today = useMemo(() => todayRow ?? {}, [todayRow]);
  const { sessions, events } = useSessions(useShallow((s) => ({ sessions: s.sessions, events: s.events })));
  const notes = useNotes((s) => s.notes);
  const terminals = useTerminals((s) => s.tabs);
  const { newNote } = useWorkspaceActions();
  const [commits, setCommits] = useState<Record<string, number>>({});
  const since = startOfDay();

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    void (async () => {
      const out: Record<string, number> = {};
      for (const p of projects) {
        if (!p.git?.isRepo) continue;
        try {
          const rows = await git.activity(p.path, 1);
          out[p.id] = rows.reduce((n, r) => n + r.count, 0);
        } catch {
          /* not a repo any more */
        }
      }
      if (!cancelled) setCommits(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const stats = useMemo(() => {
    const files = new Map<string, Set<string>>();
    let commands = 0;
    let turns = 0;
    const activeSessions = new Set<string>();
    for (const s of Object.values(sessions)) {
      if (s.hidden) continue;
      for (const e of events[s.id] ?? []) {
        if (e.timestamp < since) continue;
        activeSessions.add(s.id);
        if (e.type === 'file_write') {
          if (!files.has(s.projectId)) files.set(s.projectId, new Set());
          files.get(s.projectId)!.add(e.path);
        } else if (e.type === 'shell_command') commands++;
        else if (e.type === 'user_message') turns++;
      }
    }
    const notesToday = Object.values(notes).filter((n) => n.updatedAt >= since).length;
    const terminalsToday = terminals.filter((x) => x.createdAt >= since).length;
    const cost = Object.values(today).reduce((n, c) => n + c.costUsd, 0);
    const tokens = Object.values(today).reduce((n, c) => n + c.inputTokens + c.outputTokens, 0);
    const commitsTotal = Object.values(commits).reduce((n, c) => n + c, 0);
    const filesTotal = Array.from(files.values()).reduce((n, s) => n + s.size, 0);
    const perProject = projects
      .map((p) => ({ project: p, cost: today[p.id]?.costUsd ?? 0, turns: today[p.id]?.turns ?? 0, files: files.get(p.id)?.size ?? 0, commits: commits[p.id] ?? 0, fileNames: Array.from(files.get(p.id) ?? []) }))
      .filter((r) => r.cost > 0 || r.files > 0 || r.commits > 0 || r.turns > 0)
      .sort((a, b) => b.cost - a.cost || b.commits - a.commits);
    return { cost, tokens, turns, commands, sessions: activeSessions.size, notesToday, terminalsToday, commitsTotal, filesTotal, perProject };
  }, [sessions, events, notes, terminals, today, commits, projects, since]);

  const markdown = () => {
    const lines = [`# ${t('Day summary')} — ${new Date().toLocaleDateString(currentLocale())}`, ''];
    lines.push(`- ${t('Spent')}: ${formatCost(stats.cost)} · ${formatTokens(stats.tokens)} ${t('tokens')} · ${stats.turns} ${t('turns')}`);
    lines.push(`- ${t('Commits')}: ${stats.commitsTotal} · ${t('Files written by agents')}: ${stats.filesTotal} · ${t('Commands run')}: ${stats.commands}`);
    lines.push(`- ${t('Notes touched')}: ${stats.notesToday} · ${t('Terminals opened')}: ${stats.terminalsToday}`);
    for (const r of stats.perProject) {
      lines.push('', `## ${r.project.name}`, `${formatCost(r.cost)} · ${r.turns} ${t('turns')} · ${r.commits} ${t('commits')}`);
      for (const f of r.fileNames) lines.push(`- ${basename(f)}`);
    }
    return lines.join('\n');
  };

  const cards = [
    { icon: <ClaudeLogo size={15} />, label: t('Spent'), value: formatCost(stats.cost), hint: `${formatTokens(stats.tokens)} ${t('tokens')} · ${stats.turns} ${t(stats.turns === 1 ? 'turn' : 'turns')}` },
    { icon: <GitCommit className="size-4" />, label: t('Commits'), value: String(stats.commitsTotal) },
    { icon: <FileText className="size-4" />, label: t('Files written'), value: String(stats.filesTotal), hint: stats.commands ? t('{n} commands run', { n: stats.commands }) : undefined },
    { icon: <MessageSquare className="size-4" />, label: t('Sessions'), value: String(stats.sessions) },
    { icon: <NotebookPen className="size-4" />, label: t('Notes touched'), value: String(stats.notesToday) },
    { icon: <TerminalIcon className="size-4" />, label: t('Terminals opened'), value: String(stats.terminalsToday) },
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Day summary')}</DialogTitle>
        <DialogDescription>{new Date().toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid grid-cols-3 gap-2">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg bg-surface-inset px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                {c.icon}
                <span className="truncate">{c.label}</span>
              </div>
              <div className="mt-1 text-[20px] font-semibold leading-none tabular tracking-[-0.02em]">{c.value}</div>
              {c.hint ? <div className="mt-1 truncate text-[11px] text-secondary">{c.hint}</div> : null}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{t('Per project today')}</div>
            {stats.perProject.length === 0 ? (
              <div className="text-[12px] text-muted">{t('Quiet so far.')}</div>
            ) : (
              <div className="flex flex-col gap-2">
                {stats.perProject.map((r) => (
                  <div key={r.project.id} className="rounded-lg px-2.5 py-2 shadow-[0_0_0_1px_var(--border)]">
                    <div className="flex items-center gap-2 text-[12.5px]">
                      <MacFolder color={r.project.color || undefined} size={14} />
                      <span className="min-w-0 flex-1 truncate font-medium text-primary">{r.project.name}</span>
                      <span className="tabular text-muted">{formatCost(r.cost)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-secondary">
                      <span>{r.turns === 1 ? t('{n} turn', { n: r.turns }) : t('{n} turns', { n: r.turns })}</span>
                      <span>{t('{n} commits', { n: r.commits })}</span>
                      <span>{t('{n} files', { n: r.files })}</span>
                    </div>
                    {r.fileNames.length ? <div className="mt-1 truncate font-mono text-[11px] text-muted">{r.fileNames.map(basename).join(' · ')}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{t('Spend')}</div>
            <CostByProject />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const top = stats.perProject[0]?.project.id ?? null;
            newNote({ projectId: top, title: `${t('Day summary')} ${new Date().toLocaleDateString(currentLocale())}`, body: markdown() });
            onClose();
          }}
        >
          <Save className="size-[13px]" /> {t('Save as note')}
        </Button>
        <Button size="sm" onClick={onClose}>
          {t('Close')}
        </Button>
      </DialogFooter>
    </>
  );
}

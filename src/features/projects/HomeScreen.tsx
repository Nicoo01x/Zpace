import { FolderOpen, GitBranch, Clock, Terminal, NotebookPen, Globe, Sparkles, X } from 'lucide-react';
import { Mascot } from '@/features/mascot/MascotView';
import { useSettings } from '@/stores/settings';
import { motion } from 'motion/react';
import { useProjects } from '@/stores/projects';
import { useUI } from '@/stores/ui';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { formatRelative } from '@/lib/format';
import { ZorynqMark } from '@/features/brand/ZorynqMark';
import { easings } from '@/lib/motion';
import { Shortcut } from '@/components/ui/Shortcut';
import type { ReactNode } from 'react';
import { t } from '@/i18n';

/** Empty pane: what you can start, and where you have been. */
export function HomeScreen() {
  const mascotEnabled = useSettings((s) => s.mascot.enabled);
  const recents = useProjects((s) => s.recents);
  const projects = useProjects((s) => s.projects);
  const setCloneOpen = useUI((s) => s.setCloneOpen);
  const { openProject, openTerminalPane, openClaudeTerminal, newNote, openBrowser, addProjectPath, newSession } = useWorkspaceActions();

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: easings.out }} className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center gap-3">
          {mascotEnabled ? <Mascot size={56} className="-ml-2" /> : <ZorynqMark size={28} className="text-primary" />}
          <div>
            <div className="text-[18px] font-semibold tracking-[-0.015em]">Zpace</div>
            <div className="text-[12.5px] text-secondary">{t('Terminals, Claude Code, notes and git — all local.')}</div>
          </div>
        </div>

        <Label>{t('Start')}</Label>
        <div className="mb-8 flex flex-col">
          <Row icon={<Terminal />} onClick={() => openTerminalPane()} shortcut="mod+shift+t">
            {t('New terminal')}
          </Row>
          <Row icon={<Sparkles />} onClick={() => void openClaudeTerminal()}>
            {t('Claude Code in folder…')}
          </Row>
          <Row icon={<NotebookPen />} onClick={() => newNote()} shortcut="mod+shift+n">
            {t('New note')}
          </Row>
          <Row icon={<Globe />} onClick={() => openBrowser()}>
            {t('Browser')}
          </Row>
          <Row icon={<FolderOpen />} onClick={() => void openProject()} shortcut="mod+o">
            {t('Add project…')}
          </Row>
          <Row icon={<GitBranch />} onClick={() => setCloneOpen(true)}>
            {t('Clone repository…')}
          </Row>
        </div>

        <Label>{t('Recent projects')}</Label>
        {recents.length === 0 ? (
          <div className="rounded-md px-2 py-6 text-center text-[12.5px] text-muted">{t('Projects you open will show up here.')}</div>
        ) : (
          <div className="flex flex-col">
            {recents.map((r) => (
              <button
                key={r.path}
                type="button"
                onClick={() => {
                  const existing = projects.find((p) => p.path.toLowerCase() === r.path.toLowerCase());
                  if (existing) newSession(existing.id);
                  else void addProjectPath(r.path, r.name).then((p) => newSession(p.id));
                }}
                className="group flex h-11 items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ui font-medium text-primary">{r.name}</div>
                  <div className="truncate font-mono text-[11.5px] text-muted">{r.path}</div>
                </div>
                {r.branch ? (
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                    <GitBranch className="size-3" />
                    {r.branch}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                  <Clock className="size-3" />
                  {formatRelative(r.lastOpenedAt)}
                </span>
                <span
                  role="button"
                  aria-label={t('Remove from recents')}
                  title={t('Remove from recents')}
                  onClick={(e) => {
                    e.stopPropagation();
                    useProjects.getState().forgetRecent(r.path);
                  }}
                  className="inline-flex size-5 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-surface-active hover:text-primary group-hover:opacity-100"
                >
                  <X className="size-3" />
                </span>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{children}</div>;
}

function Row({ icon, children, onClick, shortcut }: { icon: ReactNode; children: ReactNode; onClick: () => void; shortcut?: string }) {
  return (
    <button type="button" onClick={onClick} className="group flex h-9 items-center gap-3 rounded-md px-2 text-left text-ui text-primary transition-colors hover:bg-surface-hover [&>svg]:size-4 [&>svg]:text-muted group-hover:[&>svg]:text-primary">
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut ? <Shortcut combo={shortcut} /> : null}
    </button>
  );
}

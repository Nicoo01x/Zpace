import { useRef, useState } from 'react';
import { FilePlus2, FileMinus2, GitBranch, PanelRightClose, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { basename } from '@/lib/format';
import { joinPath } from '@/native/system';
import type { ChangedFile } from '@/native/git';
import { useUI } from '@/stores/ui';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { IconButton } from '@/components/ui/IconButton';
import { LivingItem, LivingList, LivingSwitch } from '@/components/ui/Living';
import { Tooltip } from '@/components/ui/Tooltip';
import { FileIcon } from '@/features/files/FileIcon';
import { useTerminalChanges, refreshChanges } from './claude-changes';
import { useClaudeLive, PANEL_MIN, PANEL_MAX } from './claude-live';
import { t } from '@/i18n';

/**
 * The changes panel beside a terminal where Claude Code runs: the files it
 * touched in this session (or everything uncommitted), their +/− counts, and
 * the diff one click away. It reads git, so it works for Claude typed into
 * any shell, not only for the sessions Zpace drives itself.
 */
export function ClaudeChanges({ tabId, cwd, since }: { tabId: string; cwd: string; since: number }) {
  const changes = useTerminalChanges((s) => s.byTab[tabId]);
  const [mode, setMode] = useState<'session' | 'all'>('session');
  const files = (mode === 'session' ? changes?.session : changes?.files) ?? [];
  const adds = files.reduce((n, f) => n + f.additions, 0);
  const dels = files.reduce((n, f) => n + f.deletions, 0);
  const width = useClaudeLive((s) => s.panelWidth);

  return (
    <aside style={{ width }} className="relative flex h-full shrink-0 flex-col bg-surface hairline-l">
      <ResizeEdge width={width} />
      <div className="flex h-10 shrink-0 items-center gap-1 pl-2 pr-1.5 hairline-b">
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={setMode}
          aria-label={t('Changes')}
          options={[
            { value: 'session', label: <Count label={t('This session')} n={changes?.session.length} /> },
            { value: 'all', label: <Count label={t('All')} n={changes?.files.length} /> },
          ]}
        />
        <span className="flex-1" />
        <IconButton label={t('Refresh')} size="xs" onClick={() => void refreshChanges(tabId, cwd, since)}>
          <RefreshCw />
        </IconButton>
        <IconButton label={t('Hide changes')} size="xs" onClick={() => useClaudeLive.getState().togglePanel()}>
          <PanelRightClose />
        </IconButton>
      </div>
      {changes && !changes.noRepo ? (
        <div className="flex h-8 shrink-0 items-center gap-1.5 px-3 text-meta text-muted">
          <GitBranch className="size-[12px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">{changes.branch ?? t('detached HEAD')}</span>
          {adds || dels ? (
            <span className="shrink-0 font-mono text-[11px] tabular">
              {adds ? <span className="text-success">+{adds}</span> : null}
              {adds && dels ? ' ' : ''}
              {dels ? <span className="text-danger">−{dels}</span> : null}
            </span>
          ) : null}
        </div>
      ) : null}
      <LivingSwitch k={mode} className="flex min-h-0 flex-1 flex-col">
        {!changes ? null : changes.noRepo ? (
          <Quiet>{t('Not a git repository — changes show up here in one.')}</Quiet>
        ) : files.length === 0 ? (
          <Quiet>{mode === 'session' ? t('Claude has not changed files yet.') : t('No uncommitted changes.')}</Quiet>
        ) : (
          <LivingList className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
            {files.map((f) => (
              <LivingItem key={f.file}>
                <Row file={f} cwd={cwd} />
              </LivingItem>
            ))}
          </LivingList>
        )}
      </LivingSwitch>
    </aside>
  );
}

/** The panel's left edge: drag to widen or narrow it, double-click for the default width. */
function ResizeEdge({ width }: { width: number }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [active, setActive] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize')}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: width };
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        useClaudeLive.getState().setPanelWidth(drag.current.w + drag.current.x - e.clientX);
      }}
      onPointerUp={() => {
        drag.current = null;
        setActive(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setActive(false);
      }}
      onDoubleClick={() => useClaudeLive.getState().setPanelWidth(300)}
      className={cn('absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-[3px] after:w-[2px] after:rounded-full after:transition-colors', active ? 'after:bg-accent' : 'hover:after:bg-border-strong')}
    />
  );
}

function Count({ label, n }: { label: string; n: number | undefined }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {n ? <span className="tabular text-muted">{n}</span> : null}
    </span>
  );
}

function Quiet({ children }: { children: string }) {
  return <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] leading-relaxed text-muted">{children}</div>;
}

function Row({ file, cwd }: { file: ChangedFile; cwd: string }) {
  const name = basename(file.file);
  const dir = file.file.slice(0, Math.max(0, file.file.length - name.length - 1));
  return (
    <div className="px-1.5">
      <button
        type="button"
        onClick={() => useUI.getState().openDiff(joinPath(cwd, file.file), undefined, cwd)}
        className="flex h-(--row-height) w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-secondary hover:bg-surface-hover hover:text-primary"
      >
        <FileIcon name={name} size={14} />
        <span className={cn('min-w-0 flex-1 truncate', file.status === 'D' && 'line-through decoration-danger/60')}>
          {name}
          {dir ? <span className="ml-1.5 text-[11px] text-muted">{dir}</span> : null}
        </span>
        {file.status === 'A' ? (
          <Tooltip content={t('New file')} side="top">
            <FilePlus2 className="size-[12px] shrink-0 text-success" />
          </Tooltip>
        ) : file.status === 'D' ? (
          <Tooltip content={t('Deleted')} side="top">
            <FileMinus2 className="size-[12px] shrink-0 text-danger" />
          </Tooltip>
        ) : null}
        <span className="shrink-0 font-mono text-[11px] tabular">
          {file.additions ? <span className="text-success">+{file.additions}</span> : null}
          {file.additions && file.deletions ? ' ' : ''}
          {file.deletions ? <span className="text-danger">−{file.deletions}</span> : null}
        </span>
      </button>
    </div>
  );
}

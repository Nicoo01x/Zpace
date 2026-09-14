import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Puzzle, LibraryBig } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePlugins, type InstalledPlugin } from '@/stores/plugins';
import { useUI } from '@/stores/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { Switch } from '@/components/ui/Switch';
import { setEnabled } from './registry';
import { openPlugin } from './runtime';
import { useIcon } from './useIcon';
import { PluginIcon } from './PluginIcon';
import { t } from '@/i18n';

/**
 * Title-bar entry to the plugins, next to the notes: a puzzle piece with
 * the count of what is switched on. Click and the installed plugins drop
 * down — pick one to open it, flip its switch, or go to the library.
 */
export function PluginsChip() {
  // alphabetical, not on-first: a row must not jump when its switch is flipped
  const plugins = usePlugins(useShallow((s) => Object.values(s.installed).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))));
  const openSettings = useUI((s) => s.openSettings);
  const [open, setOpen] = useState(false);
  const on = plugins.filter((p) => p.enabled).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={t('Plugins')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Plugins (${on})`}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-secondary transition-colors duration-(--motion-fast) hover:bg-surface-hover hover:text-primary',
              'data-[state=open]:bg-surface-active data-[state=open]:text-primary',
            )}
          >
            <Puzzle className="size-[15px]" strokeWidth={1.75} />
            {on > 0 ? <span className="tabular">{on}</span> : null}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" sideOffset={4} className="w-[316px] p-0">
        <div className="flex h-10 items-center gap-2 pl-3.5 pr-2 hairline-b">
          <span className="text-[12.5px] font-semibold text-primary">{t('Plugins')}</span>
          <span className="text-[11.5px] text-muted">{plugins.length ? `${on}/${plugins.length}` : ''}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openSettings('plugins');
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-surface-inset px-2 text-[12px] font-medium text-primary shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-(--motion-fast) hover:bg-surface-hover"
          >
            <LibraryBig className="size-[13px]" strokeWidth={2} />
            {t('Library')}
          </button>
        </div>
        <div className="max-h-[min(60vh,480px)] overflow-y-auto p-1.5">
          {plugins.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-muted">
              {t('Nothing installed yet.')}{' '}
              <button
                type="button"
                className="font-medium text-secondary hover:text-primary"
                onClick={() => {
                  setOpen(false);
                  openSettings('plugins');
                }}
              >
                {t('Browse the library')}
              </button>
              .
            </div>
          ) : (
            <div className="flex flex-col gap-px">
              {plugins.map((p) => (
                <Row key={p.id} plugin={p} onOpen={() => setOpen(false)} />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ plugin: p, onOpen }: { plugin: InstalledPlugin; onOpen: () => void }) {
  const entry = usePlugins(useShallow((s) => s.index?.plugins.find((e) => e.id === p.id)));
  const icon = useIcon(entry, p.manifest);
  const openSettings = useUI((s) => s.openSettings);
  const open = () => {
    if (!p.enabled) return void setEnabled(p.id, true);
    onOpen();
    if (!openPlugin(p)) openSettings('plugins');
  };
  return (
    <div className={cn('group/plugin flex items-center gap-2.5 rounded-lg py-1.5 pl-2 pr-2 transition-colors duration-(--motion-fast) hover:bg-surface-hover', !p.enabled && 'opacity-60')}>
      <button type="button" onClick={open} title={p.error ?? p.manifest.description} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <PluginIcon src={icon} name={p.manifest.name} size={26} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-primary">{p.manifest.name}</span>
          <span className={cn('block truncate text-[11px]', p.error ? 'text-danger' : 'text-muted')}>{p.error ?? p.manifest.description}</span>
        </span>
      </button>
      <Switch checked={p.enabled} onCheckedChange={(v) => void setEnabled(p.id, v)} aria-label={p.enabled ? t('Switch off') : t('Switch on')} />
    </div>
  );
}

import { memo } from 'react';
import { PanelRight, PictureInPicture2, Power, Settings2, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useUI, collectLeaves } from '@/stores/ui';
import { usePlugins, type InstalledPlugin } from '@/stores/plugins';
import { useFloats, floatKey } from '@/stores/floats';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/ContextMenu';
import { setEnabled, uninstall } from './registry';
import { openPane, openPlugin, pluginPanes } from './runtime';
import { useIcon } from './useIcon';
import { PluginIcon } from './PluginIcon';

/**
 * An installed plugin in the sidebar: click opens it (its pane, or runs
 * its command); a switched-off one is dimmed and a click switches it on.
 * The context menu has its panes, on/off, the library and uninstall.
 */
export const PluginRow = memo(function PluginRow({ plugin: p }: { plugin: InstalledPlugin }) {
  const entry = usePlugins(useShallow((s) => s.index?.plugins.find((e) => e.id === p.id)));
  const icon = useIcon(entry, p.manifest);
  const error = p.error;
  const activeTile = useUI((s) => {
    const c = collectLeaves(s.layout).find((l) => l.id === s.activePaneId)?.content;
    return c?.kind === 'plugin' && c.pluginId === p.id;
  });
  const floatOpen = useFloats((s) => Object.values(s.floats).some((f) => f.pluginId === p.id));
  const active = activeTile || floatOpen;
  // script panes register at activation, so the list is read when the menu is built, not memoised
  const panes = pluginPanes(p);
  const open = () => {
    if (!p.enabled) {
      void setEnabled(p.id, true);
      return;
    }
    if (!openPlugin(p)) useUI.getState().openSettings('plugins');
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="treeitem"
          aria-selected={active}
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter') open();
          }}
          title={error ? error : p.enabled ? p.manifest.description : t('Off — click to switch it on')}
          className={cn(
            'group/row relative flex h-(--row-height) select-none items-center gap-2 rounded-lg pl-2.5 pr-2.5 text-ui outline-none transition-colors duration-(--motion-fast)',
            active ? 'bg-surface-active text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover',
            !p.enabled && 'opacity-55',
          )}
        >
          <span className="inline-flex w-5 shrink-0 items-center justify-center">
            <PluginIcon src={icon} name={p.manifest.name} size={16} />
          </span>
          <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{p.manifest.name}</span>
          {error ? <span className="size-1.5 shrink-0 rounded-full bg-danger" /> : !p.enabled ? <span className="shrink-0 text-[10px] uppercase tracking-[0.05em] text-muted">{t('off')}</span> : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {panes.map((pane) => {
          const float = p.manifest.contributes?.panes?.find((x) => x.id === pane.id)?.float;
          const open = float && useFloats.getState().floats[floatKey(p.id, pane.id)];
          return open ? (
            <ContextMenuItem key={pane.id} icon={<X />} onSelect={() => useFloats.getState().close(floatKey(p.id, pane.id))}>
              {t('Close {name}', { name: pane.title })}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem key={pane.id} icon={float ? <PictureInPicture2 /> : <PanelRight />} onSelect={() => openPane({ kind: 'plugin', pluginId: p.id, paneId: pane.id })}>
              {t('Open {name}', { name: pane.title })}
            </ContextMenuItem>
          );
        })}
        {panes.length ? <ContextMenuSeparator /> : null}
        <ContextMenuItem icon={<Power />} onSelect={() => void setEnabled(p.id, !p.enabled)}>
          {p.enabled ? t('Switch off') : t('Switch on')}
        </ContextMenuItem>
        <ContextMenuItem icon={<Settings2 />} onSelect={() => useUI.getState().openSettings('plugins')}>
          {t('Manage plugins…')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} danger onSelect={() => void uninstall(p.id)}>
          {t('Uninstall')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

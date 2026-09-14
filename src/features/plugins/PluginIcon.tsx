import { Puzzle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlugins } from '@/stores/plugins';
import { useIcon } from './useIcon';
/** A plugin's icon: the registry SVG, or the name's initial in the accent colour. Sizes pick their own corner radius. */
export function PluginIcon({ src, name, size = 40, className }: { src: string | null; name: string; size?: number; className?: string }) {
  const radius = size >= 32 ? 10 : size >= 20 ? 6 : 4;
  return src ? (
    <img src={src} alt="" width={size} height={size} className={className ?? 'shrink-0 object-cover shadow-[0_1px_3px_rgba(0,0,0,0.18)]'} style={{ width: size, height: size, borderRadius: radius }} />
  ) : (
    <span className={className ?? 'inline-flex shrink-0 items-center justify-center bg-accent-soft text-accent shadow-[0_0_0_1px_var(--border)]'} style={{ width: size, height: size, fontSize: size * 0.4, fontWeight: 600, borderRadius: radius }}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

/** The icon of an installed plugin for a pane header or a tab: its registry SVG, or the puzzle piece while it loads. */
export function InstalledPluginIcon({ pluginId, size = 14, className }: { pluginId: string; size?: number; className?: string }) {
  const p = usePlugins((s) => s.installed[pluginId]);
  const entry = usePlugins(useShallow((s) => s.index?.plugins.find((e) => e.id === pluginId)));
  const src = useIcon(entry, p?.manifest ?? { id: pluginId, name: pluginId, version: '0', description: '', author: { name: '', github: '' } });
  if (!src) return <Puzzle className={className ?? 'size-[14px] shrink-0 text-accent'} />;
  return <img src={src} alt="" width={size} height={size} className={className ?? 'shrink-0'} style={{ width: size, height: size, borderRadius: 4 }} />;
}

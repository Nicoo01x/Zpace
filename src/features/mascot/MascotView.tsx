import { memo } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { springs } from '@/lib/motion';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/i18n';
import { Bloub } from './Bloub';
import { useMascotColor, useMascotState, usePaper } from './useMascot';

/**
 * The mascot as it lives in the app: floating in a corner of the workspace or
 * sitting in the sidebar footer, eyes on the pointer, mood from the agents.
 * Click for a trick, double-click for its settings.
 */
export const Mascot = memo(function Mascot({ size, className, paper: paperOverride }: { size: number; className?: string; paper?: string }) {
  const shape = useSettings((s) => s.mascot.shape);
  const expression = useSettings((s) => s.mascot.expression);
  const color = useMascotColor();
  const paper = usePaper();
  const { state, poke } = useMascotState();
  const openSettings = useUI((s) => s.openSettings);
  return (
    <Tooltip content={t('Click for a trick · double-click for settings')} side="left">
      <motion.button
        type="button"
        aria-label={t('Mascot')}
        data-mascot
        onClick={poke}
        onDoubleClick={() => openSettings('mascot')}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={springs.snappy}
        className={cn('inline-flex select-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]', className)}
      >
        <Bloub size={size} shape={shape} color={color} expression={expression} paper={paperOverride ?? paper} state={state} follow />
      </motion.button>
    </Tooltip>
  );
});

/** Floating in the bottom-right of the workspace, above panes, never in the way of text. */
export function MascotCorner() {
  const enabled = useSettings((s) => s.mascot.enabled);
  const placement = useSettings((s) => s.mascot.placement);
  const size = useSettings((s) => s.mascot.size);
  if (!enabled || placement !== 'corner') return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-30">
      <div className="pointer-events-auto">
        <Mascot size={size} />
      </div>
    </div>
  );
}

/** In the title bar, beside the window controls: small, out of the way, always in view. */
export function MascotTitleBar() {
  const enabled = useSettings((s) => s.mascot.enabled);
  const placement = useSettings((s) => s.mascot.placement);
  if (!enabled || placement !== 'titlebar') return null;
  return (
    <div className="no-drag mr-1 flex h-full items-center overflow-visible">
      <Mascot size={44} className="-my-2" />
    </div>
  );
}

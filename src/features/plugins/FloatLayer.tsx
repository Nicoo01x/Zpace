import { memo, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useFloats, type FloatWindow } from '@/stores/floats';
import { usePlugins } from '@/stores/plugins';
import { springs, tweens } from '@/lib/motion';
import { PluginPane } from './PluginPane';

/**
 * The layer where plugin floats live: over the sidebar and the workspace,
 * under the palette and the dialogs. A float is frameless — its page fills
 * it on a transparent background and draws its own chrome, moving and
 * resizing itself through `zpace.float` — so the layer only places each one
 * where the store says, keeps the stack order, and raises the one that
 * takes the keyboard.
 */
export function FloatLayer() {
  const floats = useFloats((s) => s.floats);
  const list = Object.values(floats).sort((a, b) => a.z - b.z);

  // Focus into a float's frame (a click on its page) brings it to the front.
  useEffect(() => {
    const onBlur = () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLIFrameElement)) return;
      const key = el.closest<HTMLElement>('[data-float]')?.dataset.float;
      if (key) useFloats.getState().raise(key);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  useEffect(() => {
    const onResize = () => useFloats.getState().clampAll();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <AnimatePresence>
        {list.map((f) => (
          <Float key={`${f.pluginId}/${f.paneId}`} float={f} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const Float = memo(function Float({ float: f }: { float: FloatWindow }) {
  const key = `${f.pluginId}/${f.paneId}`;
  const reduced = useReducedMotion();
  const alive = usePlugins((s) => {
    const p = s.installed[f.pluginId];
    return !!p && p.enabled && !!p.manifest.contributes?.panes?.some((x) => x.id === f.paneId);
  });

  // The plugin was switched off or removed while its float was open: it goes.
  useEffect(() => {
    if (!alive) useFloats.getState().close(key);
  }, [alive, key]);

  return (
    <motion.div
      data-float={key}
      className="pointer-events-auto absolute"
      style={{ left: f.x, top: f.y, width: f.width, height: f.height, zIndex: f.z }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reduced ? { opacity: 0, transition: tweens.fadeFast } : { opacity: 0, scale: 0.97, y: 4, transition: tweens.fadeFast }}
      transition={{ default: springs.pop, opacity: tweens.fadeFast }}
      onAnimationComplete={() => useFloats.getState().nudge()}
      onPointerDownCapture={() => useFloats.getState().raise(key)}
    >
      <PluginPane pluginId={f.pluginId} paneId={f.paneId} floating />
    </motion.div>
  );
});

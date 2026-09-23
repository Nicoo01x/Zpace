import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStudio } from '@/stores/studio';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LivingGroup } from '@/components/ui/Living';
import { t } from '@/i18n';
import { useResolvedScope } from './scope';
import { useCatalog } from './catalog';
import { Rail } from './Rail';
import { Stage } from './Stage';
import { ChatColumn } from './ChatColumn';

/**
 * The Studio: Claude's room. A full-screen mode over the workspace (under
 * the title bar, like the entrance) with the rail on the canvas — the scope,
 * the kinds, the list — the stage as the workspace's white card, and the
 * builder's chat beside it. Esc leaves; the layout, the selection and the
 * conversation are there again next time.
 */
const EASE = [0.2, 0.8, 0.2, 1] as const;

export function Studio() {
  const open = useStudio((s) => s.open);
  return <AnimatePresence>{open ? <StudioScreen key="studio" /> : null}</AnimatePresence>;
}

function StudioScreen() {
  const scope = useStudio((s) => s.scope);
  const chatOpen = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setOpen);
  const resolved = useResolvedScope(scope);
  const catalog = useCatalog(resolved);

  // Esc leaves the Studio — unless a menu is up or the user is typing somewhere that uses Esc itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, .monaco-editor, [contenteditable="true"], [role="dialog"], [data-radix-popper-content-wrapper]')) return;
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"]')) return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.01, transition: { duration: 0.22, ease: EASE } }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[920] flex flex-col overflow-hidden bg-canvas pt-[var(--titlebar-height)] text-primary"
      role="region"
      aria-label={t('Studio')}
    >
      <LivingGroup id="studio">
        <div className="flex min-h-0 flex-1 gap-(--card-gap) pb-(--card-gap) pr-(--card-gap)">
          <ErrorBoundary compact label={t('Studio')}>
            <Rail scope={resolved} catalog={catalog} />
          </ErrorBoundary>
          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-background shadow-card">
            <ErrorBoundary label={t('Studio')}>
              <Stage scope={resolved} catalog={catalog} />
            </ErrorBoundary>
          </div>
          <AnimatePresence initial={false}>
            {chatOpen ? (
              <motion.div key="chat" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }} transition={{ duration: 0.26, ease: EASE }} className="flex w-[clamp(340px,29vw,420px)] shrink-0 overflow-hidden rounded-[10px] bg-background shadow-card">
                <ErrorBoundary compact label={t('Studio')}>
                  <ChatColumn scope={resolved} />
                </ErrorBoundary>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </LivingGroup>
    </motion.div>
  );
}

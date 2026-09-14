import { AnimatePresence, motion } from 'motion/react';
import { Dialog as RD } from 'radix-ui';
import { X } from 'lucide-react';
import { useUI } from '@/stores/ui';
import { easings, springs } from '@/lib/motion';
import { IconButton } from '@/components/ui/IconButton';
import { t } from '@/i18n';

/** Image lightbox — dim + blur, image scales up from 92%. Esc / click to close. */
export function Lightbox() {
  const lightbox = useUI((s) => s.lightbox);
  const close = useUI((s) => s.closeLightbox);
  return (
    <RD.Root open={!!lightbox} onOpenChange={(o) => !o && close()}>
      <AnimatePresence>
        {lightbox && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: easings.out }}
                className="fixed inset-0 z-[980] bg-black/70 backdrop-blur-[8px]"
              />
            </RD.Overlay>
            <RD.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, scale: 0.92, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.94, filter: 'blur(8px)', transition: { duration: 0.16 } }}
                transition={{ default: springs.modal, opacity: { duration: 0.18 }, filter: { duration: 0.3, ease: easings.soft } }}
                className="fixed inset-0 z-[981] flex items-center justify-center p-10 outline-none"
                onClick={close}
              >
                <RD.Title className="sr-only">{lightbox.name ?? 'Image'}</RD.Title>
                <img src={lightbox.url} alt={lightbox.name ?? ''} className="max-h-full max-w-full rounded-lg shadow-window" onClick={(e) => e.stopPropagation()} draggable={false} />
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[12px] text-white/90 backdrop-blur">{lightbox.name}</div>
                <IconButton label={t('Close')} tooltip={false} className="absolute right-4 top-4 bg-black/40 text-white hover:bg-black/60 hover:text-white" onClick={close}>
                  <X />
                </IconButton>
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}

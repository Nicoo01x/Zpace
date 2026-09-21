import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { popoverVariants, popoverTransition } from '@/lib/motion';
import { LivingBox, LivingGroup, LivingItem, LivingList, LivingSwitch } from '@/components/ui/Living';
import { createDragToDismiss } from '@/components/ui/drag-dismiss';
import { openWindowsSettings } from '@/native/system';
import { VoiceOrb } from './VoiceOrb';
import { useVoice, type VoicePhase } from './store';
import { talk, dismissVoice } from './agent';
import { t } from '@/i18n';

/**
 * The voice assistant on screen: the orb floating bottom-centre with a line
 * under it — what was heard, what the tools did, what Claude answered. It
 * appears when you talk and stays until you dismiss it (Escape, ×, or drag it
 * away — it is a nico-mockup card). Nothing behind it is blocked: the app
 * stays usable while it works.
 */
const ORB = 96;

function label(phase: VoicePhase): string {
  switch (phase) {
    case 'listening':
      return t('Listening…');
    case 'setup':
      return t('Setting up voice…');
    case 'thinking':
      return t('Thinking…');
    case 'speaking':
      return t('Tap to interrupt');
    default:
      return t('Tap to talk');
  }
}

export function VoiceOverlay() {
  const phase = useVoice((s) => s.phase);
  const transcript = useVoice((s) => s.transcript);
  const hearing = useVoice((s) => s.hearing);
  const level = useVoice((s) => s.level);
  const setup = useVoice((s) => s.setup);
  const answer = useVoice((s) => s.answer);
  const acts = useVoice((s) => s.acts);
  const error = useVoice((s) => s.error);
  const fix = useVoice((s) => s.fix);
  const open = phase !== 'off';
  const cardRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Escape dismisses wherever focus is, unless a dialog or a menu is the one that should take it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      dismissVoice();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // The card physics: grab the orb or its line anywhere; thrown far enough, it leaves and the assistant goes with it.
  useEffect(() => {
    const card = cardRef.current;
    if (!open || !card || reduced) return;
    return createDragToDismiss(card, { onFly: dismissVoice });
  }, [open, reduced]);

  const busy = phase === 'listening' || phase === 'thinking' || phase === 'setup';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div key="voice" variants={popoverVariants} initial="hidden" animate="visible" exit="exit" transition={popoverTransition} className="pointer-events-none fixed inset-x-0 bottom-7 z-[1100] flex justify-center">
          <div ref={cardRef} className="pointer-events-auto flex w-[min(460px,calc(100vw-32px))] flex-col items-center gap-2.5">
            {/* A div, not a button: Draggable spares buttons, and the orb must be a handle as well as a tap target. */}
            <div
              role="button"
              tabIndex={0}
              aria-label={label(phase)}
              title={label(phase)}
              onClick={() => void talk()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void talk();
                }
              }}
              // The shader was drawn for black behind it: the dark sphere is part of the orb in both themes, not a theme colour.
              className={cn('press relative size-24 select-none overflow-hidden rounded-full bg-[#0a0a0c] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)_inset] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]', busy && 'cursor-default')}
            >
              <VoiceOrb phase={phase} level={level} size={ORB} className="rounded-full" />
            </div>

            <LivingGroup id="voice-line">
              <LivingBox radius={14} className="relative w-full rounded-[14px] bg-surface-raised shadow-popover backdrop-blur-xl">
                <button type="button" aria-label={t('Close')} onClick={dismissVoice} className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-[5px] text-muted hover:bg-surface-hover hover:text-primary">
                  <X className="size-[13px]" />
                </button>
                <LivingSwitch k={phase === 'idle' && !error && !answer ? 'ready' : phase} className="px-4 py-3 pr-9">
                  {phase === 'setup' ? (
                    <div className="flex flex-col gap-1">
                      <div className="text-ui text-primary">{t('Setting up voice…')}</div>
                      <div className="text-[12px] text-secondary">{setup?.stage === 'model' ? t('Downloading the speech model') : t('Downloading the speech engine')}{setup && setup.total > 0 ? ` · ${Math.round(setup.received / 1048576)} / ${Math.round(setup.total / 1048576)} MB` : ''}</div>
                      <div className="text-[11px] text-muted">{t('Once, about 70 MB. Everything runs on this machine afterwards.')}</div>
                    </div>
                  ) : phase === 'listening' ? (
                    <div className="flex items-center gap-2.5 text-ui">
                      <motion.span className="size-2 shrink-0 rounded-full bg-danger" animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
                      {hearing ? <span className="min-w-0 text-primary">{hearing}</span> : <span className="text-secondary">{t('Listening…')}</span>}
                      <span className="ml-auto flex h-3 shrink-0 items-end gap-[3px]" aria-hidden>
                        {[0.35, 0.7, 1, 0.7, 0.35].map((k, i) => (
                          <span key={i} className="w-[3px] rounded-full bg-accent transition-[height] duration-75" style={{ height: `${Math.max(2, Math.min(12, 2 + level * 10 * k))}px` }} />
                        ))}
                      </span>
                    </div>
                  ) : phase === 'thinking' ? (
                    <LivingList className="flex flex-col gap-1">
                      <LivingItem still key="heard" className="text-ui text-primary">
                        {transcript}
                      </LivingItem>
                      {acts.map((line, i) => (
                        <LivingItem key={`act-${i}`} className="flex items-start gap-1.5 text-[12px] text-secondary">
                          <Check className="mt-[3px] size-3 shrink-0 text-success" />
                          <span className="min-w-0">{line}</span>
                        </LivingItem>
                      ))}
                      <LivingItem key="thinking" className="text-[12px] text-muted">
                        {t('Thinking…')}
                      </LivingItem>
                    </LivingList>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {transcript ? <div className="text-[12px] text-muted">{transcript}</div> : null}
                      {error ? <div className="text-ui text-danger">{error}</div> : answer ? <div className="text-ui text-primary">{answer}</div> : <div className="text-ui text-secondary">{t('Tap the orb and say what you need.')}</div>}
                      {error && fix ? (
                        <button type="button" onClick={() => void openWindowsSettings(fix === 'privacy' ? 'privacy-speech' : fix === 'microphone' ? 'sound' : 'regionlanguage')} className="press mt-0.5 inline-flex h-7 w-fit items-center gap-1.5 rounded-full bg-surface-inset px-2.5 text-[12px] font-medium text-primary hover:bg-surface-hover">
                          {fix === 'privacy' ? t('Open Windows speech settings') : fix === 'microphone' ? t('Open Windows sound settings') : t('Open language settings')}
                          <ExternalLink className="size-3 text-muted" />
                        </button>
                      ) : null}
                      <div className="text-[11px] text-muted">{phase === 'speaking' ? t('Tap to interrupt · Esc closes') : t('Tap to talk again · Esc closes')}</div>
                    </div>
                  )}
                </LivingSwitch>
              </LivingBox>
            </LivingGroup>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

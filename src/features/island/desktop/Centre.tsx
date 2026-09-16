import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { X, Trash2, BellOff, ExternalLink } from 'lucide-react';
import { formatRelative } from '@/lib/format';
import { notificationDismiss, notificationsClear } from '@/native/desktop';
import { NotificationGlyph } from '../NotificationGlyph';
import { useIsland } from './store';
import { Brand } from './parts';
import { fade } from './util';
import { Bars } from './Compact';
import { AppLogo } from './Cards';
import { act, reveal } from './actions';
import { t } from '@/i18n';
import type { IslandConfig } from './protocol';

/**
 * The centre under the desktop island: what is playing, then every Windows
 * toast still in the Action Center and everything Zpace said — one list,
 * newest first, each row dismissable, both sides clearable. A Zpace row
 * opens the app on the thing it talks about.
 */
function Kicker({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="flex items-center px-3 pb-1 pt-2">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-white/40">{children}</span>
      <span className="ml-auto">{action}</span>
    </div>
  );
}

export function Centre({ config }: { config: IslandConfig }) {
  const { items, win, media, winAccess } = useIsland(useShallow((s) => ({ items: s.items, win: s.win, media: s.media, winAccess: s.winAccess })));
  const setOpen = useIsland((s) => s.setOpen);
  const removeWin = useIsland((s) => s.removeWin);
  const clearWin = useIsland((s) => s.clearWin);
  const show = useIsland((s) => s.show);
  const [now] = useState(() => Date.now());
  const zpace = config.modules.zpace ? items : [];
  const windows = config.modules.windows ? win : [];
  const total = zpace.length + windows.length;
  const empty = !total && !media;
  return (
    <motion.div {...fade} className="w-[380px]">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
        <Brand accent={config.accent} />
        <span className="ml-2 text-[11.5px] text-white/50">{t('Notifications')}</span>
        <span className="ml-auto text-[11px] tabular text-white/45">{total}</span>
        <button type="button" onClick={() => void reveal({ type: 'reveal' })} title={t('Open Zpace')} aria-label={t('Open Zpace')} className="inline-flex size-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
          <ExternalLink className="size-[12px]" />
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('Close')} className="inline-flex size-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
          <X className="size-[13px]" />
        </button>
      </div>
      {empty ? (
        <div className="flex flex-col items-center gap-1.5 px-6 pb-5 pt-3 text-center">
          <BellOff className="size-[18px] text-white/35" />
          <div className="text-[12px] text-white/55">{winAccess === 'denied' ? t('Windows is not sharing its notifications with Zpace — allow it in Settings › Privacy › Notifications.') : t('Nothing yet — what Windows and Zpace say lands here.')}</div>
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto px-1.5 pb-1.5">
          {media ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                show({ kind: 'media', id: 'media' }, 2, 8000);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/8"
            >
              <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/10">{media.thumbnail ? <img src={media.thumbnail} alt="" className="size-full object-cover" draggable={false} /> : <Bars playing={media.playing} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium leading-tight">{media.title}</span>
                <span className="block truncate text-[11.5px] leading-snug text-white/55">{media.artist}</span>
              </span>
              <span className="mr-1 inline-flex shrink-0 text-[#3ddc84]">
                <Bars playing={media.playing} />
              </span>
            </button>
          ) : null}
          {windows.length ? (
            <>
              <Kicker
                action={
                  <button
                    type="button"
                    onClick={() => {
                      clearWin();
                      void notificationsClear().catch(() => void 0);
                    }}
                    title={t('Clear all')}
                    aria-label={t('Clear all')}
                    className="inline-flex size-5 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 className="size-[12px]" />
                  </button>
                }
              >
                {t('Windows')}
              </Kicker>
              {windows.map((n) => (
                <div key={`w:${n.id}`} className="group/ntf relative">
                  <div className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/8">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                      <AppLogo src={n.logo} size={15} fallback="bell" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[12.5px] font-medium leading-tight">{n.title || n.app}</span>
                        <span className="ml-auto shrink-0 text-[10.5px] tabular text-white/40">{formatRelative(n.at, now)}</span>
                      </span>
                      {n.body ? <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-[11.5px] leading-snug text-white/55">{n.body}</span> : null}
                      <span className="mt-0.5 block text-[10.5px] text-white/35">{n.app}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={t('Dismiss')}
                    onClick={() => {
                      removeWin(n.id);
                      void notificationDismiss(n.id).catch(() => void 0);
                    }}
                    className="absolute right-2 top-2 hidden size-5 items-center justify-center rounded-md bg-[#111] text-white/60 hover:text-white group-hover/ntf:inline-flex"
                  >
                    <X className="size-[11px]" />
                  </button>
                </div>
              ))}
            </>
          ) : null}
          {zpace.length ? (
            <>
              <Kicker
                action={
                  <button type="button" onClick={() => void act({ type: 'clear-notifications' })} title={t('Clear all')} aria-label={t('Clear all')} className="inline-flex size-5 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
                    <Trash2 className="size-[12px]" />
                  </button>
                }
              >
                Zpace
              </Kicker>
              {zpace.map((n) => (
                <div key={n.id} className="group/ntf relative">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void reveal({ type: 'notification', id: n.id });
                    }}
                    className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/8"
                  >
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <NotificationGlyph variant={n.variant} mark={n.mark} image={n.image} size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[12.5px] font-medium leading-tight">{n.title}</span>
                        <span className="ml-auto shrink-0 text-[10.5px] tabular text-white/40">{formatRelative(n.at, now)}</span>
                      </span>
                      {n.summary ? <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-white/55">{n.summary}</span> : null}
                      {n.actionLabel ? (
                        <span className="mt-1 inline-block text-[11px] font-medium" style={{ color: config.accent }}>
                          {n.actionLabel} →
                        </span>
                      ) : null}
                    </span>
                    {!n.read ? <span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: config.accent }} /> : null}
                  </button>
                  <button type="button" aria-label={t('Dismiss')} onClick={() => void act({ type: 'remove-notification', id: n.id })} className="absolute right-2 top-2 hidden size-5 items-center justify-center rounded-md bg-[#111] text-white/60 hover:text-white group-hover/ntf:inline-flex">
                    <X className="size-[11px]" />
                  </button>
                </div>
              ))}
            </>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}

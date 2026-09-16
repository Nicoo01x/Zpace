import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX, ClipboardCheck, Image, AppWindow, ArrowUpRight, BellOff, Settings, EyeOff, Power as PowerIcon, Bell } from 'lucide-react';
import { cn } from '@/lib/cn';
import { mediaControl } from '@/native/media';
import { activateApp, notificationDismiss, volumeSet } from '@/native/desktop';
import { NotificationGlyph } from '../NotificationGlyph';
import { useIsland, type Card } from './store';
import { CardRow, RoundButton } from './parts';
import { fade, mmss } from './util';
import { BatteryIcon } from './Compact';
import { act, reveal } from './actions';
import { t } from '@/i18n';
import type { IslandConfig } from './protocol';

/**
 * What unfolds in the desktop island, one component per kind of card. Each
 * one is the whole pill's content: the brand row on top (who, when, the
 * cross), then the thing. Widths are fixed per kind so the pill springs to a
 * known size instead of chasing text.
 */
const body = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, delay: 0.06 } };

export function CardView({ card, config }: { card: Card; config: IslandConfig }) {
  switch (card.kind) {
    case 'zpace':
      return <ZpaceCard card={card} />;
    case 'win':
      return <WinCard card={card} />;
    case 'media':
      return <MediaCard />;
    case 'app':
      return <AppCard card={card} />;
    case 'volume':
      return <VolumeCard />;
    case 'power':
      return <PowerCard card={card} />;
    case 'clipboard':
      return <ClipboardCard card={card} />;
    case 'menu':
      return <MenuCard config={config} />;
  }
}

/* ------------------------------- Zpace ------------------------------ */

function ZpaceCard({ card }: { card: Extract<Card, { kind: 'zpace' }> }) {
  const n = card.n;
  const drop = useIsland((s) => s.drop);
  const setOpen = useIsland((s) => s.setOpen);
  return (
    <motion.div {...fade} className="w-[360px]">
      <CardRow at={n.at} onOpen={() => setOpen(true)} onDismiss={() => (n.sticky ? void act({ type: 'remove-notification', id: n.id }) : drop(card.id))} />
      <motion.div {...body} className="flex items-start gap-2.5 px-3 pb-3 pt-0.5">
        <span className="mt-px inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10">
          <NotificationGlyph variant={n.variant} mark={n.mark} image={n.image} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{n.title}</div>
          {n.summary ? <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/60">{n.summary}</div> : null}
          {n.actionLabel ? (
            <button type="button" onClick={() => void reveal({ type: 'notification', id: n.id })} className="mt-2 inline-flex h-6 items-center rounded-full bg-white px-2.5 text-[11.5px] font-medium text-black transition-colors hover:bg-white/90">
              {n.actionLabel}
            </button>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------ Windows ----------------------------- */

export function AppLogo({ src, size = 16, fallback }: { src: string | null | undefined; size?: number; fallback?: 'app' | 'bell' }) {
  if (src) return <img src={src} alt="" className="shrink-0 rounded-[3px] object-contain" style={{ width: size, height: size }} draggable={false} />;
  return <span className="inline-flex shrink-0 items-center justify-center text-white/60" style={{ width: size, height: size }}>{fallback === 'bell' ? <Bell className="size-[70%]" /> : <AppWindow className="size-[70%]" />}</span>;
}

function WinCard({ card }: { card: Extract<Card, { kind: 'win' }> }) {
  const n = card.n;
  const drop = useIsland((s) => s.drop);
  const removeWin = useIsland((s) => s.removeWin);
  const setOpen = useIsland((s) => s.setOpen);
  const dismiss = () => {
    drop(card.id);
    removeWin(n.id);
    void notificationDismiss(n.id).catch(() => void 0);
  };
  return (
    <motion.div {...fade} className="w-[360px]">
      <CardRow
        leading={
          <button type="button" onClick={() => setOpen(true)} className="inline-flex min-w-0 items-center gap-1.5" aria-label={t('Notifications')}>
            <AppLogo src={n.logo} size={14} fallback="bell" />
            <span className="truncate text-[12px] font-semibold leading-none tracking-[-0.01em]">{n.app || t('Windows')}</span>
          </button>
        }
        at={n.at}
        onDismiss={dismiss}
      />
      <motion.div {...body} className="flex items-start gap-2.5 px-3 pb-3 pt-0.5">
        <span className="mt-px inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
          <AppLogo src={n.logo} size={18} fallback="bell" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{n.title || n.app}</div>
          {n.body ? <div className="mt-0.5 line-clamp-3 whitespace-pre-line text-[12px] leading-snug text-white/60">{n.body}</div> : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------- Media ------------------------------ */

/** The position, extrapolated from the last report while the track plays. */
function usePosition(): number | null {
  const media = useIsland((s) => s.media);
  const at = useIsland((s) => s.mediaAt);
  const [now, setNow] = useState(at);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (!media?.playing) return;
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [media?.playing, at]);
  if (!media || media.position_ms === null) return null;
  const pos = media.playing ? media.position_ms + Math.max(0, now - at) : media.position_ms;
  return media.duration_ms ? Math.min(pos, media.duration_ms) : pos;
}

function MediaCard() {
  const media = useIsland((s) => s.media);
  const drop = useIsland((s) => s.drop);
  const pos = usePosition();
  if (!media) return null;
  const pct = media.duration_ms && pos !== null ? Math.max(0, Math.min(1, pos / media.duration_ms)) : null;
  const app = media.app.replace(/\.exe$/i, '').split('!').pop() ?? media.app;
  return (
    <motion.div {...fade} className="w-[380px]">
      <CardRow onDismiss={() => drop('media')} trailing={<span className="mr-2 text-[10.5px] text-white/40">{app}</span>} />
      <motion.div {...body} className="flex items-center gap-3 px-3 pb-3 pt-0.5">
        <button type="button" onClick={() => void activateApp(media.app)} className="relative size-[56px] shrink-0 overflow-hidden rounded-lg bg-white/10" title={t('Open the player')}>
          {media.thumbnail ? <img src={media.thumbnail} alt="" className="size-full object-cover" draggable={false} /> : <span className="flex size-full items-center justify-center text-white/40"><Volume2 className="size-5" /></span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{media.title}</div>
          <div className="mt-0.5 truncate text-[12px] leading-snug text-white/60">
            {media.artist}
            {media.album && media.album !== media.title ? <span className="text-white/35"> · {media.album}</span> : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-8 shrink-0 text-right text-[10.5px] tabular text-white/45">{pos !== null ? mmss(pos) : '–:––'}</span>
            <span className="relative h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
              {pct !== null ? <motion.span className="absolute inset-y-0 left-0 origin-left rounded-full bg-white/85" animate={{ scaleX: pct }} initial={false} transition={{ duration: 0.9, ease: 'linear' }} style={{ width: '100%' }} /> : null}
            </span>
            <span className="w-8 shrink-0 text-[10.5px] tabular text-white/45">{media.duration_ms ? mmss(media.duration_ms) : ''}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <RoundButton label={t('Previous')} onClick={() => void mediaControl('previous')}>
            <SkipBack className="size-[13px]" fill="currentColor" />
          </RoundButton>
          <RoundButton label={media.playing ? t('Pause') : t('Play')} onClick={() => void mediaControl('toggle')} primary size={30}>
            {media.playing ? <Pause className="size-[13px]" fill="currentColor" /> : <Play className="ml-px size-[13px]" fill="currentColor" />}
          </RoundButton>
          <RoundButton label={t('Next')} onClick={() => void mediaControl('next')}>
            <SkipForward className="size-[13px]" fill="currentColor" />
          </RoundButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------- App ------------------------------- */

function AppCard({ card }: { card: Extract<Card, { kind: 'app' }> }) {
  const a = card.app;
  return (
    <motion.div {...fade} className="flex h-[40px] w-max max-w-[420px] items-center gap-2.5 px-2.5">
      <span className="inline-flex size-6 shrink-0 items-center justify-center">
        <AppLogo src={a.icon} size={22} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium leading-tight">
          <span className="text-white/55">{a.fresh ? t('Opened') : t('Now in')} </span>
          {a.name}
        </div>
        {a.title && a.title !== a.name ? <div className="mt-px max-w-[320px] truncate text-[11px] leading-tight text-white/45">{a.title}</div> : null}
      </div>
    </motion.div>
  );
}

/* ------------------------------- Volume ----------------------------- */

function VolumeCard() {
  const volume = useIsland((s) => s.volume);
  const level = volume?.level ?? 0;
  const muted = volume?.muted ?? false;
  const Icon = muted || level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  return (
    <motion.div {...fade} className="flex h-[34px] w-[250px] items-center gap-2.5 px-3">
      <button type="button" onClick={() => void volumeSet(level, !muted)} className="inline-flex shrink-0 text-white/85 hover:text-white" aria-label={muted ? t('Unmute') : t('Mute')}>
        <Icon className="size-4" />
      </button>
      <span
        className="relative h-[5px] min-w-0 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/15"
        onPointerDown={(e) => {
          const el = e.currentTarget;
          const setFrom = (x: number) => {
            const r = el.getBoundingClientRect();
            void volumeSet(Math.max(0, Math.min(1, (x - r.left) / r.width)), false);
          };
          setFrom(e.clientX);
          const move = (ev: PointerEvent) => setFrom(ev.clientX);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      >
        <motion.span className={cn('absolute inset-y-0 left-0 origin-left rounded-full', muted ? 'bg-white/35' : 'bg-white')} style={{ width: '100%' }} animate={{ scaleX: level }} initial={false} transition={{ type: 'spring', stiffness: 700, damping: 46, mass: 0.8 }} />
      </span>
      <span className="w-8 shrink-0 text-right text-[11.5px] tabular text-white/70">{Math.round(level * 100)}%</span>
    </motion.div>
  );
}

/* -------------------------------- Power ----------------------------- */

function PowerCard({ card }: { card: Extract<Card, { kind: 'power' }> }) {
  const p = card.power;
  const label = card.reason === 'plugged' ? t('Charging') : card.reason === 'low' ? t('Low battery') : t('On battery');
  const color = card.reason === 'plugged' ? '#3ddc84' : card.reason === 'low' ? '#ff5f57' : 'rgba(255,255,255,0.85)';
  const left = p.minutes !== null && !p.charging ? (p.minutes >= 60 ? t('{h} h {m} min left', { h: Math.floor(p.minutes / 60), m: p.minutes % 60 }) : t('{m} min left', { m: p.minutes })) : null;
  return (
    <motion.div {...fade} className="flex h-[36px] w-max max-w-[360px] items-center gap-2.5 px-3">
      <BatteryIcon percent={p.percent} charging={p.charging} className="size-4 shrink-0" />
      <span className="text-[12.5px] font-medium" style={{ color }}>
        {label}
      </span>
      {p.percent !== null ? <span className="text-[12.5px] tabular text-white/85">{p.percent}%</span> : null}
      {left ? <span className="text-[11.5px] text-white/45">{left}</span> : null}
    </motion.div>
  );
}

/* ------------------------------ Clipboard --------------------------- */

function ClipboardCard({ card }: { card: Extract<Card, { kind: 'clipboard' }> }) {
  const c = card.change;
  return (
    <motion.div {...fade} className="flex h-[40px] w-max max-w-[420px] items-center gap-2.5 px-3">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/85">{c.kind === 'image' ? <Image className="size-[13px]" /> : <ClipboardCheck className="size-[13px]" />}</span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium leading-tight">
          {t('Copied')}
          <span className="text-white/45"> · {c.kind === 'image' ? t('image {size}', { size: c.preview }) : t('{n} characters', { n: c.chars })}</span>
        </div>
        {c.kind === 'text' ? <div className="mt-px max-w-[340px] truncate text-[11px] leading-tight text-white/50">{c.preview}</div> : null}
      </div>
    </motion.div>
  );
}

/* -------------------------------- Menu ------------------------------ */

function MenuCard({ config }: { config: IslandConfig }) {
  const drop = useIsland((s) => s.drop);
  const setHidden = useIsland((s) => s.setHidden);
  const rows: Array<{ icon: ReactNode; label: string; run: () => void; checked?: boolean }> = [
    { icon: <ArrowUpRight className="size-[13px]" />, label: t('Open Zpace'), run: () => void reveal({ type: 'reveal' }) },
    { icon: <BellOff className="size-[13px]" />, label: t('Do not disturb'), checked: config.dnd, run: () => void act({ type: 'dnd', value: !config.dnd }) },
    { icon: <EyeOff className="size-[13px]" />, label: t('Hide until something happens'), run: () => setHidden(true) },
    { icon: <Settings className="size-[13px]" />, label: t('Island settings…'), run: () => void reveal({ type: 'open-settings' }) },
    { icon: <PowerIcon className="size-[13px]" />, label: t('Turn the desktop island off'), run: () => void act({ type: 'disable' }) },
  ];
  return (
    <motion.div {...fade} className="w-[250px] py-1">
      {rows.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={() => {
            drop('menu');
            r.run();
          }}
          className="flex h-[30px] w-full items-center gap-2.5 px-3 text-left text-[12.5px] text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <span className="inline-flex w-4 shrink-0 justify-center text-white/60">{r.icon}</span>
          <span className="min-w-0 flex-1 truncate">{r.label}</span>
          {r.checked !== undefined ? <span className={cn('size-1.5 rounded-full', r.checked ? 'bg-[#ffbd2e]' : 'bg-white/20')} /> : null}
        </button>
      ))}
    </motion.div>
  );
}

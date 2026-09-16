import { motion, AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { Battery, BatteryCharging, BatteryLow, BatteryWarning } from 'lucide-react';
import { springs } from '@/lib/motion';
import { ClaudeLogo } from '@/features/agent/BrandIcon';
import { activityWord } from '../live';
import { Brand } from './parts';
import { fade, useClock } from './util';
import { useIsland, unreadOf } from './store';
import { act, reveal } from './actions';
import { t, currentLocale } from '@/i18n';
import type { IslandConfig } from './protocol';

/**
 * The island at rest: the brand, then the readouts the settings asked for —
 * the time, what is playing (with the bars moving while it does), what the
 * agent is on, the battery — and the plugins' chips. Each one is a button:
 * the track opens its card, the agent goes to its session, the brand opens
 * the centre. In `dot` idle it is a sliver until the pointer comes near.
 */
const chip = {
  initial: { opacity: 0, width: 0 },
  animate: { opacity: 1, width: 'auto' },
  exit: { opacity: 0, width: 0, transition: { duration: 0.16 } },
  transition: springs.snappy,
} as const;

function Sep() {
  return <span className="mr-2 h-3 w-px shrink-0 bg-white/20" />;
}

/** Three bars that dance while a track plays, still when it is paused. */
export function Bars({ playing, color }: { playing: boolean; color?: string }) {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden>
      {[0.5, 0.9, 0.65].map((h, i) => (
        <motion.span
          key={i}
          className="block h-full w-[2px] origin-bottom rounded-full"
          style={{ background: color ?? 'currentColor' }}
          animate={playing ? { scaleY: [0.3, h, 0.45, h * 0.8, 0.3] } : { scaleY: 0.3 }}
          transition={playing ? { duration: 1.1 + i * 0.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        />
      ))}
    </span>
  );
}

export function BatteryIcon({ percent, charging, className }: { percent: number | null; charging: boolean; className?: string }) {
  if (charging) return <BatteryCharging className={className} />;
  if (percent !== null && percent <= 10) return <BatteryWarning className={className} />;
  if (percent !== null && percent <= 25) return <BatteryLow className={className} />;
  return <Battery className={className} />;
}

export function Compact({ config, dot, maxWidth }: { config: IslandConfig; dot: boolean; maxWidth: number }) {
  const { unread, live, media, power, chips } = useIsland(useShallow((s) => ({ unread: unreadOf(s), live: s.live, media: s.media, power: s.power, chips: s.chips })));
  const setOpen = useIsland((s) => s.setOpen);
  const show = useIsland((s) => s.show);
  const now = useClock(config.readouts.clock || config.readouts.date);
  const r = config.readouts;
  const locale = currentLocale();

  if (dot) {
    return (
      <motion.div {...fade} className="flex h-[10px] w-[44px] items-center justify-center">
        <span className="block h-[3px] w-[18px] rounded-full bg-white/60" />
      </motion.div>
    );
  }

  const chipList = config.modules.plugins ? Object.entries(chips) : [];
  return (
    <motion.div {...fade} className="flex h-[24px] min-w-0 items-center" style={{ maxWidth }}>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('Notifications')} title={unread ? t('{n} unread', { n: unread }) : t('Notifications')} className="flex h-full shrink-0 items-center pl-2.5 pr-2">
        <Brand unread={unread} accent={config.accent} />
      </button>
      <AnimatePresence initial={false}>
        {r.clock || r.date ? (
          <motion.span key="clock" {...chip} className="flex h-full shrink-0 items-center overflow-hidden whitespace-nowrap pr-2.5 text-[11.5px] leading-none tabular text-white/85">
            <Sep />
            {r.date ? <span className="mr-1.5 text-white/50">{new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(now)}</span> : null}
            {r.clock ? <span>{new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(now)}</span> : null}
          </motion.span>
        ) : null}
        {live && config.modules.agents && r.agent ? (
          <motion.button key={`live:${live.sessionId}`} {...chip} type="button" onClick={() => void reveal({ type: 'focus-session', id: live.sessionId })} title={live.title} className="flex h-full min-w-0 shrink items-center overflow-hidden whitespace-nowrap pr-2.5 text-[11.5px] leading-none">
            <Sep />
            {live.waiting ? (
              <span className="mr-1.5 block size-1.5 rounded-full bg-[#ffbd2e]" />
            ) : (
              <motion.span animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} className="mr-1.5 inline-flex">
                <ClaudeLogo size={11} />
              </motion.span>
            )}
            <span className={live.waiting ? 'text-[#ffbd2e]' : 'text-white/85'}>{activityWord(live.activity)}</span>
            {live.subject ? <span className="ml-1 min-w-0 max-w-[200px] truncate font-mono text-white/55">{live.subject}</span> : null}
            {live.running + live.waiting > 1 ? <span className="ml-1.5 text-white/45">+{live.running + live.waiting - 1}</span> : null}
          </motion.button>
        ) : null}
        {media && r.media ? (
          <motion.button key="media" {...chip} type="button" onClick={() => show({ kind: 'media', id: 'media' }, 2, 8000)} title={`${media.title}${media.artist ? ` — ${media.artist}` : ''}`} className="flex h-full min-w-0 shrink items-center overflow-hidden whitespace-nowrap pr-2.5 text-[11.5px] leading-none text-white/85">
            <Sep />
            <span className="mr-1.5 inline-flex text-[#3ddc84]">
              <Bars playing={media.playing} />
            </span>
            <span className="min-w-0 max-w-[220px] truncate">
              {media.title}
              {media.artist ? <span className="text-white/50"> · {media.artist}</span> : null}
            </span>
          </motion.button>
        ) : null}
        {power?.hasBattery && r.battery ? (
          <motion.span key="battery" {...chip} className="flex h-full shrink-0 items-center overflow-hidden whitespace-nowrap pr-2.5 text-[11.5px] leading-none tabular" style={{ color: power.charging ? '#3ddc84' : power.percent !== null && power.percent <= 10 ? '#ff5f57' : 'rgba(255,255,255,0.85)' }} title={power.charging ? t('Charging') : t('On battery')}>
            <Sep />
            <BatteryIcon percent={power.percent} charging={power.charging} className="mr-1 size-[13px]" />
            {power.percent !== null ? <span>{power.percent}%</span> : null}
          </motion.span>
        ) : null}
        {chipList.map(([owner, c]) => (
          <motion.button key={owner} {...chip} type="button" onClick={() => void act({ type: 'chip', owner })} title={c.title ?? c.text} className="flex h-full min-w-0 shrink items-center overflow-hidden whitespace-nowrap pr-2.5 text-[11.5px] leading-none tabular" style={{ color: c.color ?? 'rgba(255,255,255,0.85)' }}>
            <Sep />
            {c.icon ? c.icon.trimStart().startsWith('<svg') ? <span aria-hidden className="mr-1.5 inline-flex [&>svg]:size-3 [&>svg]:shrink-0" dangerouslySetInnerHTML={{ __html: c.icon }} /> : <span className="mr-1.5 inline-flex text-[11px]">{c.icon}</span> : null}
            <span className="min-w-0 max-w-[240px] truncate">{c.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

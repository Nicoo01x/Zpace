import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useSettings } from '@/stores/settings';
import { Switch } from '@/components/ui/Switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { LivingBox, LivingItem, LivingReveal } from '@/components/ui/Living';
import { openUrl } from '@/native/system';
import { isTauri, isWindows } from '@/lib/platform';
import { ZorynqMark } from '@/features/brand/ZorynqMark';
import { springs } from '@/lib/motion';
import type { DesktopIslandSettings } from './desktop/protocol';

/**
 * Settings › Desktop island: the switch, where and how the pill sits, what
 * it announces, what it shows at rest, and how it behaves when nothing is
 * happening. The preview at the top is a still of the pill in the chosen
 * look and size.
 */
/** A settings row — a position node, so the rows below a reveal glide when it opens. */
function Row({ label, hint, children, align = 'center' }: { label: string; hint?: string; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <LivingItem still className={cn('flex justify-between gap-6 py-3 hairline-b last:shadow-none', align === 'center' ? 'items-center' : 'items-start')}>
      <div className="min-w-0">
        <div className="text-ui text-primary">{label}</div>
        {hint ? <div className="mt-0.5 text-[12px] leading-snug text-secondary">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </LivingItem>
  );
}

/** A group is one layout box: a reveal inside it springs the box and moves the rows under it. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-7">
      {title ? <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{title}</div> : null}
      <LivingBox clip={false}>{children}</LivingBox>
    </div>
  );
}

const LOOK_BG: Record<DesktopIslandSettings['look'], string> = { black: '#111', graphite: '#202024', accent: 'color-mix(in srgb, var(--accent) 30%, #101012)' };
const SCALE: Record<DesktopIslandSettings['size'], number> = { compact: 0.9, regular: 1, large: 1.15 };

/** A still of the pill, in the chosen look, size and opacity, sitting on a strip of "desktop". */
function Preview({ d }: { d: DesktopIslandSettings }) {
  return (
    <div className="relative mb-4 flex h-[72px] items-start justify-center overflow-hidden rounded-lg bg-surface-inset" style={{ alignItems: d.edge === 'top' ? 'flex-start' : 'flex-end' }}>
      <div className="absolute inset-x-3 top-3 h-2 rounded-full bg-surface-hover" />
      <div className="absolute inset-x-8 top-7 h-2 w-1/2 rounded-full bg-surface-hover" />
      <motion.div layout transition={springs.living} className="relative z-10 flex h-[24px] items-center gap-2 rounded-full px-2.5 text-white shadow-[0_4px_18px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.08)]" style={{ background: LOOK_BG[d.look], opacity: d.opacity, transform: `scale(${SCALE[d.size]})`, transformOrigin: d.edge === 'top' ? 'top center' : 'bottom center', marginTop: d.edge === 'top' ? 5 : 0, marginBottom: d.edge === 'bottom' ? 5 : 0 }}>
        <ZorynqMark size={12} className="text-white" />
        <span className="text-[12px] font-semibold leading-none tracking-[-0.01em]">Zpace</span>
        {d.readouts.clock ? (
          <>
            <span className="h-3 w-px bg-white/20" />
            <span className="text-[11.5px] leading-none tabular text-white/85">14:32</span>
          </>
        ) : null}
        {d.readouts.media ? (
          <>
            <span className="h-3 w-px bg-white/20" />
            <span className="inline-flex h-3 items-end gap-[2px] text-[#3ddc84]">
              <span className="block h-[40%] w-[2px] rounded-full bg-current" />
              <span className="block h-[90%] w-[2px] rounded-full bg-current" />
              <span className="block h-[60%] w-[2px] rounded-full bg-current" />
            </span>
            <span className="text-[11.5px] leading-none text-white/85">Nightcall</span>
          </>
        ) : null}
      </motion.div>
    </div>
  );
}

export function DesktopIslandSection() {
  const s = useSettings();
  const d = s.desktopIsland;
  const patch = (p: Partial<DesktopIslandSettings>) => s.patch({ desktopIsland: { ...d, ...p } });
  const modules = (p: Partial<DesktopIslandSettings['modules']>) => patch({ modules: { ...d.modules, ...p } });
  const readouts = (p: Partial<DesktopIslandSettings['readouts']>) => patch({ readouts: { ...d.readouts, ...p } });
  const system = isTauri && isWindows;
  return (
    <>
      <Preview d={d} />
      <Group>
        <Row label={t('Show the island over the desktop')} hint={t('A floating pill at the edge of the screen, over every app: what Windows says, what is playing, what the agents are doing. The one in the title bar steps aside.')}>
          <Switch checked={d.enabled} onCheckedChange={(v) => patch({ enabled: v })} disabled={!isTauri} />
        </Row>
        {!system ? <div className="pt-2 text-[12px] text-secondary">{t('The system readouts (media, notifications, apps, volume, battery, clipboard) are Windows-only for now; the island still shows what Zpace says.')}</div> : null}
      </Group>
      <Group title={t('Where and how')}>
        <Row label={t('Edge')}>
          <SegmentedControl
            size="sm"
            value={d.edge}
            onChange={(v) => patch({ edge: v })}
            options={[
              { value: 'top', label: t('Top') },
              { value: 'bottom', label: t('Bottom') },
            ]}
          />
        </Row>
        <Row label={t('Size')}>
          <SegmentedControl
            size="sm"
            value={d.size}
            onChange={(v) => patch({ size: v })}
            options={[
              { value: 'compact', label: t('Compact') },
              { value: 'regular', label: t('Regular') },
              { value: 'large', label: t('Large') },
            ]}
          />
        </Row>
        <Row label={t('Look')}>
          <SegmentedControl
            size="sm"
            value={d.look}
            onChange={(v) => patch({ look: v })}
            options={[
              { value: 'black', label: t('Black') },
              { value: 'graphite', label: t('Graphite') },
              { value: 'accent', label: t('Accent') },
            ]}
          />
        </Row>
        <Row label={t('Opacity')}>
          <div className="flex items-center gap-2">
            <input type="range" min={0.6} max={1} step={0.05} value={d.opacity} aria-label={t('Opacity')} onChange={(e) => patch({ opacity: Number(e.target.value) })} className="w-[160px] accent-[var(--accent)]" />
            <span className="w-8 text-right text-[11.5px] tabular text-muted">{Math.round(d.opacity * 100)}%</span>
          </div>
        </Row>
        <Row label={t('Position')} hint={t('Hold the island and slide it along the edge; it snaps back to the middle.')}>
          <Button size="sm" variant="subtle" onClick={() => patch({ shift: 0 })} disabled={d.shift === 0}>
            {t('Back to the centre')}
          </Button>
        </Row>
      </Group>
      <Group title={t('What it announces')}>
        <Row label={t('Now playing')} hint={t('Spotify, a browser, any player: the track and its cover when it changes, with controls.')}>
          <Switch checked={d.modules.media} onCheckedChange={(v) => modules({ media: v })} />
        </Row>
        <Row label={t('Windows notifications')} hint={t('Every toast in the Action Center, with the app’s logo; dismissing it here dismisses it there.')}>
          <Switch checked={d.modules.windows} onCheckedChange={(v) => modules({ windows: v })} />
        </Row>
        <LivingReveal open={d.modules.windows && system}>
          <div className="flex items-center justify-between gap-6 py-2 pl-4 hairline-b">
            <div className="text-[12px] leading-snug text-secondary">{t('If nothing arrives, Windows is keeping them: allow Zpace under Settings › Privacy › Notifications.')}</div>
            <Button size="xs" variant="ghost" trailing={<ExternalLink className="size-3" />} onClick={() => void openUrl('ms-settings:privacy-notifications')}>
              {t('Open Windows settings')}
            </Button>
          </div>
        </LivingReveal>
        <Row label={t('Apps')} hint={t('"Opened Google Chrome", with its icon.')}>
          <Select
            size="sm"
            value={d.modules.foreground}
            onChange={(v) => modules({ foreground: v })}
            options={[
              { value: 'off', label: t('Nothing') },
              { value: 'launches', label: t('Apps that open') },
              { value: 'always', label: t('Every switch'), hint: t('Alt-tab included') },
            ]}
          />
        </Row>
        <Row label={t('Volume')} hint={t('A bar while you change it — and a slider to change it here.')}>
          <Switch checked={d.modules.volume} onCheckedChange={(v) => modules({ volume: v })} />
        </Row>
        <Row label={t('Battery')} hint={t('Plugged in, unplugged, and at 20, 10 and 5 %.')}>
          <Switch checked={d.modules.power} onCheckedChange={(v) => modules({ power: v })} />
        </Row>
        <Row label={t('Clipboard')} hint={t('Every copy, from any app: a glimpse of what was copied.')}>
          <Switch checked={d.modules.clipboard} onCheckedChange={(v) => modules({ clipboard: v })} />
        </Row>
        <Row label={t('Agents')} hint={t('What Claude is on right now; a click goes to the session.')}>
          <Switch checked={d.modules.agents} onCheckedChange={(v) => modules({ agents: v })} />
        </Row>
        <Row label={t('Zpace notifications')} hint={t('Finished turns, commits, pushes, errors — the same ones the title bar shows.')}>
          <Switch checked={d.modules.zpace} onCheckedChange={(v) => modules({ zpace: v })} />
        </Row>
        <Row label={t('Plugin readouts')} hint={t('The chips plugins put in the island (a timer, a track).')}>
          <Switch checked={d.modules.plugins} onCheckedChange={(v) => modules({ plugins: v })} />
        </Row>
      </Group>
      <Group title={t('At rest')}>
        <Row label={t('Time')}>
          <Switch checked={d.readouts.clock} onCheckedChange={(v) => readouts({ clock: v })} />
        </Row>
        <Row label={t('Date')}>
          <Switch checked={d.readouts.date} onCheckedChange={(v) => readouts({ date: v })} />
        </Row>
        <Row label={t('What is playing')}>
          <Switch checked={d.readouts.media} onCheckedChange={(v) => readouts({ media: v })} />
        </Row>
        <Row label={t('The agent at work')}>
          <Switch checked={d.readouts.agent} onCheckedChange={(v) => readouts({ agent: v })} />
        </Row>
        <Row label={t('Battery level')}>
          <Switch checked={d.readouts.battery} onCheckedChange={(v) => readouts({ battery: v })} />
        </Row>
      </Group>
      <Group title={t('Behaviour')}>
        <Row label={t('Fold after')} hint={t('How long a card stays open; errors and warnings stay half as long again.')}>
          <div className="flex items-center gap-2">
            <input type="range" min={2} max={15} step={1} value={d.foldSeconds} aria-label={t('Fold after')} onChange={(e) => patch({ foldSeconds: Number(e.target.value) })} className="w-[160px] accent-[var(--accent)]" />
            <span className="w-8 text-right text-[11.5px] tabular text-muted">{d.foldSeconds}s</span>
          </div>
        </Row>
        <Row label={t('When nothing is happening')}>
          <Select
            size="sm"
            value={d.idle}
            onChange={(v) => patch({ idle: v })}
            options={[
              { value: 'stay', label: t('Stay as it is') },
              { value: 'dot', label: t('Shrink to a sliver'), hint: t('Back when the pointer comes near') },
              { value: 'hide', label: t('Step off the screen'), hint: t('Back with the next thing to say') },
            ]}
          />
        </Row>
        <LivingReveal open={d.idle !== 'stay'}>
          <div className="flex items-center justify-between gap-6 py-3 hairline-b">
            <div className="text-ui text-primary">{t('After')}</div>
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={120} step={5} value={d.idleSeconds} aria-label={t('After')} onChange={(e) => patch({ idleSeconds: Number(e.target.value) })} className="w-[160px] accent-[var(--accent)]" />
              <span className="w-8 text-right text-[11.5px] tabular text-muted">{d.idleSeconds}s</span>
            </div>
          </div>
        </LivingReveal>
        <Row label={t('Do not disturb')} hint={t('Nothing unfolds except what needs an answer. Also in the island’s right-click menu.')}>
          <Switch checked={d.dnd} onCheckedChange={(v) => patch({ dnd: v })} />
        </Row>
      </Group>
    </>
  );
}

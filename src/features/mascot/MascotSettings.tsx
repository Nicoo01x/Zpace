import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { useSettings } from '@/stores/settings';
import { Switch } from '@/components/ui/Switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Bloub } from './Bloub';
import { SHAPES, COLORS } from './bloub/skins';
import { EXPRESSIONS } from './bloub/expressions';
import { SHAPE_LABEL, EXPR_LABEL } from './labels';
import { STATES } from './bloub/states';
import { useMascotColor, usePaper } from './useMascot';
import type { StateId } from './bloub/states';

/**
 * Settings › Mascot: a live preview that follows the pointer, the shape
 * (cloud by default), the colour (a palette or any hex — the accent when
 * unset), the resting expression, where it lives and how big it is, and a
 * strip of every state to see what the moods look like.
 */

/** Names for the engine's state ids. */
const MOOD_LABEL: Record<string, string> = { idle: 'Idle', thinking: 'Thinking', alert: 'Alert', notify: 'Notify', sleep: 'Asleep', exclaim: 'Exclaim', wide: 'Wide-eyed', happy: 'Happy', sad: 'Sad', love: 'In love', angry: 'Angry', dizzy: 'Dizzy', wink: 'Wink', surprised: 'Surprised' };

export function MascotSection() {
  const s = useSettings();
  const m = s.mascot;
  const patch = (p: Partial<typeof m>) => s.patch({ mascot: { ...m, ...p } });
  const color = useMascotColor();
  const paper = usePaper();
  const [preview, setPreview] = useState<StateId>('idle');
  const [custom, setCustom] = useState(m.color);

  return (
    <>
      <div className="flex items-center gap-6 py-3 hairline-b">
        <div className="flex size-[140px] shrink-0 items-center justify-center rounded-xl bg-surface-inset">
          <Bloub size={120} shape={m.shape} color={color} expression={m.expression} paper={paper} state={preview} follow />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="text-ui text-primary">{t('Show the mascot')}</div>
              <div className="mt-0.5 text-[12px] text-secondary">{t('It watches the pointer and reacts to what the agents do: thinking, waiting for you, done, asleep.')}</div>
            </div>
            <Switch checked={m.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="text-ui text-primary">{t('Where')}</div>
            <SegmentedControl
              size="sm"
              value={m.placement}
              onChange={(v) => patch({ placement: v })}
              options={[
                { value: 'titlebar', label: t('Title bar') },
                { value: 'corner', label: t('Corner') },
                { value: 'sidebar', label: t('Sidebar') },
                { value: 'home', label: t('Home only') },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="text-ui text-primary">{t('Size')}</div>
            <SegmentedControl size="sm" value={String(m.size)} onChange={(v) => patch({ size: Number(v) })} options={['48', '64', '80', '104'].map((v) => ({ value: v, label: v }))} />
          </div>
        </div>
      </div>

      <div className="py-3 hairline-b">
        <div className="mb-2 text-ui text-primary">{t('Shape')}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map((sh) => {
            const selected = m.shape === sh.id;
            return (
              <button
                key={sh.id}
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ shape: sh.id })}
                className={cn('flex flex-col items-center gap-1 rounded-lg px-2 py-2 transition-[background-color,box-shadow] duration-(--motion-fast)', selected ? 'bg-surface-active shadow-[inset_0_0_0_1px_var(--border-strong)]' : 'hover:bg-surface-hover')}
              >
                <Bloub size={44} shape={sh.id} color={color} expression={m.expression} paper={paper} state="idle" follow={false} frozenAt={0.4} />
                <span className="text-[11.5px] text-secondary">{t(SHAPE_LABEL[sh.id] ?? sh.id)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="py-3 hairline-b">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-ui text-primary">{t('Colour')}</div>
          <button type="button" onClick={() => { patch({ color: '' }); setCustom(''); }} className={cn('text-[11.5px]', m.color ? 'text-secondary hover:text-primary' : 'text-muted')}>
            {t('Use the accent colour')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {COLORS.map((c) => {
            const selected = m.color.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.id}
                aria-pressed={selected}
                onClick={() => { patch({ color: c.hex }); setCustom(c.hex); }}
                className={cn('inline-flex size-7 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-transform hover:scale-110', selected && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]')}
                style={{ background: c.hex }}
              >
                {selected ? <Check className="size-3.5" style={{ color: c.id === 'creme' ? '#333' : '#fff' }} strokeWidth={3} /> : null}
              </button>
            );
          })}
          <label className="relative inline-flex h-7 items-center gap-2 rounded-md bg-surface pl-1 pr-2 text-[11.5px] tabular text-secondary shadow-[0_0_0_1px_var(--border)]">
            <span className="size-5 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ backgroundColor: custom || color }} />
            <span className="font-mono">{(custom || color).toLowerCase()}</span>
            <input
              type="color"
              aria-label={t('Custom colour')}
              value={/^#[0-9a-f]{6}$/i.test(custom || color) ? custom || color : '#000000'}
              onChange={(e) => {
                setCustom(e.target.value);
                patch({ color: e.target.value });
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-3 hairline-b">
        <div className="min-w-0 flex-1">
          <div className="text-ui text-primary">{t('Resting expression')}</div>
          <div className="mt-0.5 text-[12px] text-secondary">{t('How it looks when nothing is happening.')}</div>
        </div>
        <Select size="sm" className="w-[150px] shrink-0" value={m.expression} onChange={(v) => patch({ expression: v })} options={EXPRESSIONS.map((e) => ({ value: e.id, label: t(EXPR_LABEL[e.id] ?? e.id) }))} />
      </div>

      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-ui text-primary">{t('Moods')}</div>
          <div className="mt-0.5 text-[12px] text-secondary">{t('Pick one to preview it above. The app chooses them on its own: thinking while an agent works, alert when it needs you, notify when it is done, sleep when you are away.')}</div>
        </div>
        <Select size="sm" className="w-[150px] shrink-0" value={preview} onChange={(v) => setPreview(v)} options={STATES.map((st) => ({ value: st.id, label: t(MOOD_LABEL[st.id] ?? st.id) }))} />
      </div>
    </>
  );
}

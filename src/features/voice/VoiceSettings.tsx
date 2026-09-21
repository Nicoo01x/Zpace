import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { isTauri } from '@/lib/platform';
import { useSettings } from '@/stores/settings';
import { Select } from '@/components/ui/Select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button } from '@/components/ui/Button';
import { voiceDevices, voiceMeter, voiceReady, voiceSetup, type VoiceDevice, type VoiceModel } from '@/native/voice';

/** Whisper's language codes for the app's languages, plus a few more people speak to a computer in. */
const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
  { value: 'ru', label: 'Русский' },
  { value: 'ca', label: 'Català' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'tr', label: 'Türkçe' },
];

type RowComponent = ComponentType<{ label: string; hint?: string; children: ReactNode; align?: 'center' | 'start' }>;
type GroupComponent = ComponentType<{ title?: string; children: ReactNode; action?: ReactNode }>;

/**
 * Settings › Voice: which microphone the assistant listens to (the system
 * default is often not the one you talk into), the language, the whisper
 * model, and a level test so you can see the microphone hear you before
 * you rely on it.
 */
export function VoiceSection({ Row, Group }: { Row: RowComponent; Group: GroupComponent }) {
  const s = useSettings();
  const v = s.voice;
  const patch = (p: Partial<typeof v>) => s.patch({ voice: { ...v, ...p } });
  const [devices, setDevices] = useState<VoiceDevice[]>([]);
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [peak, setPeak] = useState<number | null>(null);
  const [ready, setReady] = useState<{ binary: boolean; model: boolean } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const refresh = () => {
    void voiceDevices().then(setDevices);
    void voiceReady(v.model).then((r) => setReady({ binary: r.binary, model: r.model }));
  };
  useEffect(refresh, [v.model]);

  const test = async () => {
    setTesting(true);
    setPeak(null);
    const loudest = await voiceMeter(v.device, 4, setLevel).catch(() => 0);
    setLevel(0);
    setPeak(loudest);
    setTesting(false);
  };

  const download = async (model: VoiceModel) => {
    setDownloading(t('Downloading…'));
    try {
      await voiceSetup(model, (p) => setDownloading(p.total > 0 ? `${Math.round(p.received / 1048576)} / ${Math.round(p.total / 1048576)} MB` : t('Downloading…')));
    } catch (e) {
      setDownloading(e instanceof Error ? e.message : String(e));
      return;
    }
    setDownloading(null);
    refresh();
  };

  const deviceOptions = [{ value: '', label: t('System default') + (devices[0]?.isDefault ? ` · ${devices[0].name}` : '') }, ...devices.map((d) => ({ value: d.name, label: d.name }))];
  const known = !v.device || devices.some((d) => d.name === v.device);

  return (
    <>
      <Group title={t('Listening')}>
        <Row label={t('Microphone')} hint={known ? t('What the orb listens to. Windows’ default input is often a virtual device, not the one you talk into.') : t('“{name}” is not connected right now; the system default is used until it is back.', { name: v.device })}>
          <div className="flex items-center gap-1.5">
            <Select size="sm" value={known ? v.device : ''} onChange={(d) => patch({ device: d })} options={deviceOptions} className="max-w-[300px]" />
            <Button size="sm" variant="ghost" aria-label={t('Refresh')} onClick={refresh}>
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </Row>
        <Row label={t('Test the microphone')} hint={peak === null ? t('Four seconds: say something and watch the bars move.') : peak > 0.08 ? t('Heard you — loudest at {pct}%.', { pct: Math.round(peak * 100) }) : t('Nothing came through. Try another microphone above.')}>
          <div className="flex items-center gap-3">
            <span className="flex h-4 items-end gap-[3px]" aria-hidden>
              {[0.3, 0.55, 0.8, 1, 0.8, 0.55, 0.3].map((k, i) => (
                <span key={i} className={cn('w-[4px] rounded-full transition-[height,background-color] duration-75', level * k > 0.05 ? 'bg-accent' : 'bg-border')} style={{ height: `${Math.max(3, Math.min(16, 3 + level * 13 * k))}px` }} />
              ))}
            </span>
            <Button size="sm" disabled={testing || !isTauri} onClick={() => void test()}>
              {testing ? t('Listening…') : t('Test')}
            </Button>
          </div>
        </Row>
        <Row label={t('Language')} hint={t('Auto detects it from the words; picking one is more reliable for short commands.')}>
          <Select size="sm" value={v.language} onChange={(language) => patch({ language })} options={LANGUAGES.map((l) => ({ value: l.value, label: l.value === 'auto' ? t('Auto') : l.label }))} />
        </Row>
      </Group>

      <Group title={t('Speech engine')}>
        <Row label={t('Model')} hint={t('whisper.cpp on this machine, nothing leaves it. Base answers in about a second; Small hears better and takes several.')}>
          <SegmentedControl size="sm" value={v.model} onChange={(model) => patch({ model })} options={[{ value: 'base', label: t('Base · 60 MB') }, { value: 'small', label: t('Small · 190 MB') }]} />
        </Row>
        <Row label={t('Downloaded')} hint={ready === null ? '' : ready.binary && ready.model ? t('The engine and the {model} model are ready.', { model: v.model }) : t('Fetched the first time you talk, or now.')}>
          {ready && (!ready.binary || !ready.model) ? (
            <Button size="sm" disabled={!!downloading || !isTauri} onClick={() => void download(v.model)}>
              {downloading ?? t('Download now')}
            </Button>
          ) : (
            <span className="text-[12px] text-success">{ready ? t('Ready') : ''}</span>
          )}
        </Row>
      </Group>
    </>
  );
}

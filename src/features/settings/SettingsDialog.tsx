import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Dialog as RD } from 'radix-ui';
import { Sun, Moon, Monitor, Plus, X, Check, RotateCcw, SlidersHorizontal, Palette, Bot, SquareTerminal, GitBranch, Bell, Keyboard, Wrench, Globe, Smile, RefreshCw, Hexagon, Workflow, Plug, Info, Puzzle, PanelTop, Mic } from 'lucide-react';
import { MascotSection } from '@/features/mascot/MascotSettings';
import { VoiceSection } from '@/features/voice/VoiceSettings';
import { SEARCH_ENGINES } from '@/features/browser/engines';
import { EngineLogo } from '@/features/browser/EngineLogo';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo, AgentLogo } from '@/features/agent/BrandIcon';
import { AGENT_LABEL, AGENT_KINDS } from '@/features/agent/agents';
import { detectEnvironment } from '@/native/system';
import { ZorynqTile } from '@/features/brand/ZorynqMark';
import { AuthorCard, Contributors } from './AuthorCard';
import { cn } from '@/lib/cn';
import { useUI, type SettingsSection } from '@/stores/ui';
import { useSettings, MODELS, ACCENT_PRESETS, type ColorToken } from '@/stores/settings';
import { useEnvironment } from '@/stores/environment';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/Select';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Shortcut } from '@/components/ui/Shortcut';
import { Tooltip } from '@/components/ui/Tooltip';
import { LivingSwitch } from '@/components/ui/Living';
import { springs } from '@/lib/motion';
import { SHORTCUTS } from '@/app/shortcuts';
import type { ShellInfo, ToolCheck } from '@/types/workspace';
import { MONO_FONTS, SANS_FONTS, availableFonts, resolveFontStack, terminalFontStack, terminalPrimaryFont, type FontOption } from '@/lib/fonts';
import { TERMINAL_SCHEMES, schemeFromWindowsTerminal, schemeSwatches } from '@/features/terminal/schemes';
import { isTauri } from '@/lib/platform';
import { FilesTouched } from '@/features/notifications/RichContent';
import { toast } from '@/features/notifications/toast-store';
import { allPacks, applyPack } from '@/features/appearance/packs';
import { checkForUpdates } from '@/features/updater/updater';
import { speak, speechLang } from '@/native/speech';
import { celebrate } from '@/features/mascot/celebrate';
import { pullTrick } from '@/features/mascot/useMascot';
import { AutomationsSection } from '@/features/automations/AutomationsSection';
import { McpSection } from '@/features/mcp/McpSection';
import { PluginsSection } from '@/features/plugins/PluginsSection';
import { DesktopIslandSection } from '@/features/island/DesktopIslandSection';
import { playChime, playToast, previewTheme, SOUND_THEMES } from '@/features/notifications/sound';
import { claudeArgs, claudeLaunchDefaults } from '@/features/sessions/useWorkspaceActions';
import { t as tr, LANGUAGES, currentLocale } from '@/i18n';
import { copyText } from '@/lib/clipboard';

const NO_SHELLS: ShellInfo[] = [];
const NO_FONTS: string[] = [];

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: 'general', label: 'General', icon: <SlidersHorizontal /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette /> },
  { id: 'agents', label: 'Agents & binaries', icon: <Bot /> },
  { id: 'claude', label: 'Claude Code', icon: <ClaudeLogo size={15} /> },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal /> },
  { id: 'git', label: 'Git', icon: <GitBranch /> },
  { id: 'browser', label: 'Browser', icon: <Globe /> },
  { id: 'mascot', label: 'Mascot', icon: <Smile /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell /> },
  { id: 'island', label: 'Desktop island', icon: <PanelTop /> },
  { id: 'voice', label: 'Voice', icon: <Mic /> },
  { id: 'automations', label: 'Automations', icon: <Workflow /> },
  { id: 'mcp', label: 'MCP servers', icon: <Plug /> },
  { id: 'keyboard', label: 'Keyboard', icon: <Keyboard /> },
  { id: 'plugins', label: 'Plugins', icon: <Puzzle /> },
  { id: 'advanced', label: 'Advanced', icon: <Wrench /> },
  { id: 'about', label: 'About', icon: <Info /> },
];

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  const close = useUI((s) => s.closeSettings);
  const section = useUI((s) => s.settingsSection);
  const openSettings = useUI((s) => s.openSettings);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent size="xl" className="h-[min(680px,calc(100vh-40px))] w-[min(960px,calc(100vw-40px))]" aria-describedby={undefined}>
        <RD.Title className="sr-only">{tr('Settings')}</RD.Title>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[212px] shrink-0 flex-col gap-[3px] overflow-y-auto bg-sidebar p-2 pt-4 hairline-r" aria-label={tr('Settings sections')}>
            <div className="mb-2 px-2.5 text-[15px] font-semibold tracking-[-0.01em]">{tr('Settings')}</div>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSettings(s.id)}
                className={cn(
                  'relative flex h-8 items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 text-left text-ui outline-none transition-colors [&>svg]:size-[15px] [&>svg]:shrink-0',
                  s.id === section ? 'text-primary' : 'text-secondary hover:bg-surface-hover hover:text-primary',
                )}
              >
                {s.id === section ? <motion.span layoutId="settings-nav" transition={springs.layout} className="absolute inset-0 -z-10 rounded-md bg-surface-active" /> : null}
                <span className={cn('inline-flex [&>svg]:size-[15px]', s.id === section ? 'text-primary' : 'text-muted')}>{s.icon}</span>
                {tr(s.label)}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <h2 className="mb-5 flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] [&>span>svg]:size-4">
              <span className="inline-flex text-secondary">{SECTIONS.find((s) => s.id === section)?.icon}</span>
              {tr(SECTIONS.find((s) => s.id === section)?.label ?? '')}
            </h2>
            <LivingSwitch k={section}>
            {section === 'general' && <General />}
            {section === 'appearance' && <Appearance />}
            {section === 'agents' && <Agents />}
            {section === 'claude' && <ClaudeSection />}
            {section === 'terminal' && <TerminalSection />}
            {section === 'git' && <GitSection />}
            {section === 'browser' && <BrowserSection />}
            {section === 'mascot' && <MascotSection />}
            {section === 'notifications' && <Notifications />}
            {section === 'island' && <DesktopIslandSection />}
            {section === 'voice' && <VoiceSection Row={Row} Group={Group} />}
            {section === 'automations' && <AutomationsSection />}
            {section === 'mcp' && <McpSection />}
            {section === 'keyboard' && <KeyboardSection />}
            {section === 'plugins' && <PluginsSection />}
            {section === 'advanced' && <Advanced />}
            {section === 'about' && <About />}
            </LivingSwitch>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, hint, children, align = 'center' }: { label: string; hint?: string; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <div className={cn('flex justify-between gap-6 py-3 hairline-b last:shadow-none', align === 'center' ? 'items-center' : 'items-start')}>
      <div className="min-w-0">
        <div className="text-ui text-primary">{label}</div>
        {hint ? <div className="mt-0.5 text-[12px] leading-snug text-secondary">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Group({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7">
      {title ? (
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{title}</div>
          {action}
        </div>
      ) : null}
      <div>{children}</div>
    </div>
  );
}

/* ------------------------------ General ---------------------------- */

function General() {
  const s = useSettings();
  return (
    <Group>
      <Row label={tr('Your name')} hint={tr('For the greeting on the start screen.')}>
        <TextInput size="sm" className="w-[200px]" value={s.userName ?? ''} onChange={(e) => s.set('userName', e.target.value)} placeholder={tr('Your name')} />
      </Row>
      <Row label={tr('Send message with')} hint={tr('Shift+Enter always inserts a newline.')}>
        <SegmentedControl
          size="sm"
          value={s.sendKey}
          onChange={(v) => s.set('sendKey', v)}
          options={[
            { value: 'enter', label: 'Enter' },
            { value: 'mod+enter', label: 'Ctrl+Enter' },
          ]}
        />
      </Row>
      <Row label={tr('Confirm before closing')} hint={tr('Ask when agents or terminals are still running.')}>
        <Switch checked={s.confirmOnClose} onCheckedChange={(v) => s.set('confirmOnClose', v)} />
      </Row>
      <Row label={tr('Close to the tray')} hint={tr('The close button hides Zpace in the notification area; agents keep running and the island\x27s news arrives as system notifications. Left-click the tray icon to bring it back.')}>
        <Switch checked={s.closeToTray} onCheckedChange={(v) => s.set('closeToTray', v)} />
      </Row>
      <Row label={tr('Check for updates at launch')} hint={tr('Signed builds from the update channel; installs when you restart.')}>
        <div className="flex items-center gap-2">
          <Switch checked={s.checkUpdates} onCheckedChange={(v) => s.set('checkUpdates', v)} />
          <Button size="sm" variant="ghost" onClick={() => void checkForUpdates()}>
            {tr('Check now')}
          </Button>
        </div>
      </Row>
      <Row label={tr('Restore layout on launch')} hint={tr('Reopen panes, terminals and the active session.')}>
        <Switch checked={s.restoreLayout} onCheckedChange={(v) => s.set('restoreLayout', v)} />
      </Row>
      <Row label={tr('Entrance screen')} hint={tr('The greeting with the dashboard and the commit map, once per launch.')}>
          <Switch checked={s.showWelcome} onCheckedChange={(v) => s.set('showWelcome', v)} />
        </Row>
      <Row label={tr('Language')} hint={tr('Follows the system language by default.')}>
        <Select size="sm" value={s.language} onChange={(v) => s.set('language', v)} options={LANGUAGES.map((l) => ({ value: l.value, label: l.value === 'system' ? tr('System') : l.label }))} />
      </Row>
      <Row label={tr('Usage gauge in the title bar')} hint={tr("Claude Code's 5-hour / weekly limits, the active session's context and today's cost.")}>
        <Switch checked={s.showUsage} onCheckedChange={(v) => s.set('showUsage', v)} />
      </Row>
    </Group>
  );
}

/* ----------------------------- Appearance -------------------------- */

function Appearance() {
  const s = useSettings();
  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const mode = dark ? 'dark' : 'light';
  return (
    <>
      <Group title={tr('Theme packs')}>
        <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-3">
          {allPacks().map((pk) => {
            const on = s.themePack === pk.id;
            const bg = pk.colors.background ?? (pk.appearance === 'dark' ? '#141414' : '#fbfbfa');
            const canvas = pk.colors.canvas ?? (pk.appearance === 'dark' ? '#1d1d1f' : '#f2f2f0');
            const text = pk.colors.textPrimary ?? (pk.appearance === 'dark' ? '#e8e8e8' : '#1d1d1f');
            const accent = pk.colors.accent ?? '#2f6fde';
            return (
              <button
                key={pk.id}
                type="button"
                onClick={() => applyPack(pk.id)}
                aria-pressed={on}
                className={cn('group/pack overflow-hidden rounded-lg text-left transition-shadow', on ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--text-muted)]')}
              >
                <div className="flex h-14" style={{ background: canvas }}>
                  <div className="w-1/3" />
                  <div className="flex flex-1 flex-col gap-1 p-2" style={{ background: bg }}>
                    <span className="h-1.5 w-2/3 rounded-full" style={{ background: text, opacity: 0.8 }} />
                    <span className="h-1.5 w-1/2 rounded-full" style={{ background: text, opacity: 0.35 }} />
                    <span className="mt-auto h-2 w-6 rounded-full" style={{ background: accent }} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px]">
                  <span className="size-2 rounded-full" style={{ background: accent }} />
                  <span className="truncate text-primary">{pk.label}</span>
                  {on ? <Check className="ml-auto size-[12px] text-accent" /> : null}
                </div>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title={tr('Theme')}>
        <Row label={tr('Appearance')}>
          <SegmentedControl
            size="sm"
            value={s.theme}
            onChange={(v) => s.set('theme', v)}
            options={[
              { value: 'light', label: tr('Light'), icon: <Sun /> },
              { value: 'dark', label: tr('Dark'), icon: <Moon /> },
              { value: 'system', label: tr('System'), icon: <Monitor /> },
            ]}
          />
        </Row>
        <Row label={tr('Density')}>
          <SegmentedControl
            size="sm"
            value={s.density}
            onChange={(v) => s.set('density', v)}
            options={[
              { value: 'compact', label: tr('Compact') },
              { value: 'default', label: tr('Default') },
              { value: 'comfortable', label: tr('Comfortable') },
            ]}
          />
        </Row>
        <Row label={tr('Reduce motion')} hint={tr('Follows the OS setting by default.')}>
          <SegmentedControl
            size="sm"
            value={s.reducedMotion}
            onChange={(v) => s.set('reducedMotion', v)}
            options={[
              { value: 'system', label: tr('System') },
              { value: 'off', label: tr('Off') },
              { value: 'on', label: tr('On') },
            ]}
          />
        </Row>
      </Group>

      <Group title={tr('Accent')}>
        <div className="flex flex-wrap items-center gap-2 py-2">
          {ACCENT_PRESETS.map((a) => (
            <Tooltip key={a.id} content={a.label}>
              <button
                type="button"
                aria-label={a.label}
                aria-pressed={s.accent === a.id}
                onClick={() => s.set('accent', a.id)}
                className={cn(
                  'relative inline-flex size-6 items-center justify-center rounded-full transition-transform duration-(--motion-fast) hover:scale-110',
                  s.accent === a.id && 'ring-2 ring-offset-2 ring-offset-[var(--surface-raised)]',
                )}
                style={{ backgroundColor: dark ? a.dark : a.light, ['--tw-ring-color' as string]: dark ? a.dark : a.light }}
              >
                {s.accent === a.id ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
              </button>
            </Tooltip>
          ))}
          <ColorSwatch
            label={tr('Custom accent')}
            value={s.colors[mode].accent ?? (dark ? '#6da8f5' : '#2f6fde')}
            active={s.accent === 'custom'}
            onChange={(v) => {
              s.set('accent', 'custom');
              s.setColor(mode, 'accent', v);
            }}
          />
        </div>
      </Group>

      <Group
        title={`Colours · ${mode}`}
        action={
          <Button size="xs" variant="ghost" leading={<RotateCcw />} onClick={() => s.resetColors()}>
            {tr('Reset colours')}
          </Button>
        }
      >
        <ColorRow token="canvas" label={tr('Canvas')} hint={tr('Window and sidebar')} mode={mode} fallback={dark ? '#111111' : '#f4f4f2'} />
        <ColorRow token="background" label={tr('Workspace')} hint={tr('The card that hosts panes')} mode={mode} fallback={dark ? '#161616' : '#fcfcfb'} />
        <ColorRow token="surface" label={tr('Surfaces')} hint={tr('Menus, inputs, dialogs')} mode={mode} fallback={dark ? '#1c1c1c' : '#ffffff'} />
        <ColorRow token="textPrimary" label={tr('Text')} mode={mode} fallback={dark ? '#f5f5f5' : '#1d1d1f'} />
        <ColorRow token="textSecondary" label={tr('Secondary text')} mode={mode} fallback={dark ? '#a1a1a6' : '#6e6e73'} />
        <ColorRow token="accentWarm" label={tr('Warm accent')} hint={tr('Grip, context meter, activity')} mode={mode} fallback={dark ? '#e38b5a' : '#d97a45'} />
        <ColorRow token="border" label={tr('Hairlines')} mode={mode} fallback={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} />
      </Group>

      <Group title={tr('Typography')}>
        <FontPicker label={tr('Interface font')} list={SANS_FONTS} value={s.font} onChange={(v) => s.set('font', v)} sample="Production deployment setup · melon-mind" />
        <Row label={tr('Interface size')}>
          <SegmentedControl size="sm" value={String(s.fontSize)} onChange={(v) => s.set('fontSize', Number(v))} options={['12', '13', '13.5', '14', '15'].map((v) => ({ value: v, label: v }))} />
        </Row>
        <Row label={tr('Text weight')} hint={tr('Heavier text everywhere — labels, rows, titles.')}>
          <SegmentedControl
            size="sm"
            value={s.textWeight}
            onChange={(v) => s.set('textWeight', v)}
            options={[
              { value: 'regular', label: tr('Regular') },
              { value: 'medium', label: tr('Medium') },
              { value: 'bold', label: tr('Bold') },
            ]}
          />
        </Row>
        <FontPicker label={tr('Monospace font')} hint={tr('Transcript, code, notes editor and terminal.')} list={MONO_FONTS} value={s.monoFont} onChange={(v) => s.set('monoFont', v)} sample="● Brewed for 1m 35s · done 10:43 PM  {a: 0}" mono />
        <Row label={tr('Transcript size')}>
          <SegmentedControl size="sm" value={String(s.monoSize)} onChange={(v) => s.set('monoSize', Number(v))} options={['12', '13', '13.5', '14', '15'].map((v) => ({ value: v, label: v }))} />
        </Row>
      </Group>
    </>
  );
}

function ColorRow({ token, label, hint, mode, fallback }: { token: ColorToken; label: string; hint?: string; mode: 'light' | 'dark'; fallback: string }) {
  const s = useSettings();
  const value = s.colors[mode][token];
  return (
    <Row label={label} hint={hint}>
      <div className="flex items-center gap-2">
        {value ? (
          <button type="button" className="text-[11.5px] text-muted hover:text-primary" onClick={() => s.setColor(mode, token, undefined)}>
            {tr('Default')}
          </button>
        ) : null}
        <ColorSwatch label={label} value={value ?? fallback} active={!!value} onChange={(v) => s.setColor(mode, token, v)} />
      </div>
    </Row>
  );
}

function ColorSwatch({ label, value, active, onChange }: { label: string; value: string; active?: boolean; onChange: (v: string) => void }) {
  const hex = useMemo(() => toHex(value), [value]);
  // The native picker fires an input event per pixel of drag; commit at most once per frame.
  const pending = useRef<{ frame: number; value: string } | null>(null);
  const schedule = (v: string) => {
    if (pending.current) {
      pending.current.value = v;
      return;
    }
    pending.current = {
      value: v,
      frame: requestAnimationFrame(() => {
        const next = pending.current?.value;
        pending.current = null;
        if (next) onChange(next);
      }),
    };
  };
  useEffect(() => () => {
    if (pending.current) cancelAnimationFrame(pending.current.frame);
  }, []);
  return (
    <label className={cn('relative inline-flex h-7 items-center gap-2 rounded-md bg-surface pl-1 pr-2 text-[11.5px] tabular text-secondary shadow-[0_0_0_1px_var(--border)] transition-[box-shadow] hover:shadow-[0_0_0_1px_var(--border-strong)]', active && 'text-primary')}>
      <span className="size-5 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ backgroundColor: value }} />
      <span className="font-mono">{hex}</span>
      <input type="color" aria-label={label} value={hex} onChange={(e) => schedule(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

/** Convert any CSS colour to #rrggbb for <input type="color">. */
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return '#000000';
  c.fillStyle = '#000';
  c.fillStyle = color;
  const v = c.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function FontPicker({ label, hint, list, value, onChange, sample, mono }: { label: string; hint?: string; list: FontOption[]; value: string; onChange: (v: string) => void; sample: string; mono?: boolean }) {
  const fonts = useMemo(() => availableFonts(list), [list]);
  const isCustom = !list.some((f) => f.id === value);
  const [custom, setCustom] = useState(isCustom ? value : '');
  const options = useMemo(() => {
    const opts = fonts.map((f) => ({
      value: f.id,
      label: f.label,
      hint: f.kind === 'bundled' ? 'bundled' : f.installed ? 'system' : 'not installed',
      style: { fontFamily: resolveFontStack(f.id, !!mono) },
      disabled: !f.installed,
    }));
    if (isCustom && value) opts.push({ value, label: value, hint: 'custom', style: { fontFamily: resolveFontStack(value, !!mono) }, disabled: false });
    return opts;
  }, [fonts, isCustom, mono, value]);
  return (
    <div className="py-3 hairline-b">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-ui text-primary">{label}</div>
          {hint ? <div className="mt-0.5 text-[12px] leading-snug text-secondary">{hint}</div> : null}
        </div>
        <Select size="sm" value={value} onChange={onChange} options={options} className="w-[240px] shrink-0" />
      </div>
      <div className={cn('mt-2.5 truncate rounded-md bg-surface-inset px-3 py-2 text-[13.5px] text-primary', mono && 'font-mono')} style={{ fontFamily: resolveFontStack(value, !!mono) }}>
        {sample}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <TextInput
          size="sm"
          placeholder={tr('Custom family, e.g. Berkeley Mono')}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && custom.trim()) onChange(custom.trim());
          }}
          className="w-[280px]"
        />
        <Button size="sm" disabled={!custom.trim()} onClick={() => onChange(custom.trim())}>
          {tr('Use')}
        </Button>
        {isCustom ? <span className="text-[11.5px] text-muted">{tr('Using “{value}”', { value })}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------- Agents ---------------------------- */

function Agents() {
  const s = useSettings();
  const env = useEnvironment((e) => e.report);
  const loading = useEnvironment((e) => e.loading);
  const redetect = async () => {
    const st = useEnvironment.getState();
    st.setLoading(true);
    try {
      st.setReport(await detectEnvironment());
      toast.success(tr('Environment re-detected'), { origin: null, duration: 1600 });
    } catch (e) {
      st.setError(e instanceof Error ? e.message : String(e));
    }
  };
  const binaries: Array<{ id: string; label: string; icon: ReactNode; check?: ToolCheck; hint: string }> = [
    { id: 'claude', label: 'Claude Code', icon: <ClaudeLogo size={16} />, check: env?.claude, hint: 'claude' },
    { id: 'codex', label: 'Codex', icon: <CodexLogo size={16} />, check: env?.codex, hint: 'codex' },
    { id: 'gemini', label: 'Gemini CLI', icon: <GeminiLogo size={16} />, check: env?.gemini, hint: 'gemini' },
    { id: 'opencode', label: 'OpenCode', icon: <OpenCodeLogo size={16} />, check: env?.opencode, hint: 'opencode' },
    { id: 'git', label: 'Git', icon: <GitBranch className="size-4" />, check: env?.git, hint: 'git' },
    { id: 'node', label: 'Node.js', icon: <Hexagon className="size-4" />, check: env?.node, hint: 'node' },
  ];
  return (
    <>
      <Group title={tr('Default agent')}>
        <div className="mb-3 text-[12px] leading-snug text-secondary">{tr('Leads the “ask” entries: the file header button, context menus and the palette.')}</div>
        <div className="grid grid-cols-4 gap-3">
          {AGENT_KINDS.map((a) => {
            const check = a === 'claude' ? env?.claude : env?.[a];
            const found = a === 'claude' ? true : (check?.found ?? false);
            const active = s.defaultAgent === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => s.set('defaultAgent', a)}
                aria-pressed={active}
                className={cn(
                  'relative flex flex-col items-start gap-2.5 rounded-xl px-4 py-3.5 text-left transition-colors',
                  active ? 'bg-accent-soft ring-1 ring-[var(--accent)]/40' : 'bg-surface-inset hover:bg-surface-hover',
                  !found && 'opacity-70',
                )}
              >
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-surface-raised shadow-sm">
                  <AgentLogo agent={a} size={18} />
                </span>
                <span className="text-ui font-medium text-primary">{AGENT_LABEL[a]}</span>
                <span className={cn('text-[11.5px]', found ? 'text-success' : 'text-muted')}>{found ? (check?.version ? check.version.split(' ')[0] : tr('Detected')) : tr('Not installed')}</span>
                {active ? <Check className="absolute right-3 top-3 size-3.5 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      </Group>
      <Group
        title={tr('Binaries')}
        action={
          <Button size="xs" variant="ghost" onClick={() => void redetect()} disabled={loading || !isTauri}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> {loading ? tr('Detecting…') : tr('Re-detect')}
          </Button>
        }
      >
        {binaries.map((b) => (
          <BinaryRow key={b.id} label={b.label} icon={b.icon} check={b.check} binary={b.hint} />
        ))}
      </Group>
      <Group title={tr('Shells')}>
        {(env?.shells ?? NO_SHELLS).map((sh) => (
          <BinaryRow key={sh.id} label={sh.label} icon={<SquareTerminal className="size-4" />} check={{ found: true, path: sh.path, version: sh.distro ? `WSL · ${sh.distro}` : sh.kind }} binary={sh.path} />
        ))}
        {env?.wsl.available ? (
          <Row label="WSL" hint={env.wsl.distros.length ? `${tr('Distros')}: ${env.wsl.distros.join(', ')}${env.wsl.default ? ` · ${tr('default')}: ${env.wsl.default}` : ''}` : undefined}>
            <span className="rounded-md bg-success-soft px-2 py-0.5 text-[11.5px] font-medium text-success">{tr('Detected')}</span>
          </Row>
        ) : null}
        {env?.nerdFonts?.length ? (
          <Row label={tr('Nerd Fonts')} hint={env.nerdFonts.slice(0, 6).join(', ') + (env.nerdFonts.length > 6 ? ` +${env.nerdFonts.length - 6}` : '')}>
            <span className="rounded-md bg-success-soft px-2 py-0.5 text-[11.5px] font-medium text-success">{env.nerdFonts.length}</span>
          </Row>
        ) : null}
      </Group>
    </>
  );
}

/** One detected binary: mark, name, version, path (click copies) and a status pill. */
function BinaryRow({ label, icon, check, binary }: { label: string; icon: ReactNode; check?: ToolCheck; binary: string }) {
  const found = check?.found ?? false;
  const path = check?.path ?? '';
  return (
    <div className="flex items-center gap-4 py-3.5 hairline-b last:shadow-none">
      <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-inset', found ? 'text-primary' : 'text-muted')}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="text-ui font-medium text-primary">{label}</span>
          {check?.version ? <span className="rounded-md bg-surface-inset px-1.5 py-px font-mono text-[11px] text-secondary">{check.version}</span> : null}
        </div>
        {path ? (
          <Tooltip content={tr('Copy path')} side="bottom" align="start">
            <button
              type="button"
              onClick={() => {
                void copyText(path);
                toast.neutral(tr('Path copied'), { origin: null, duration: 1200 });
              }}
              className="mt-1.5 block max-w-full truncate font-mono text-[11.5px] text-muted transition-colors hover:text-primary"
            >
              {path}
            </button>
          </Tooltip>
        ) : (
          <div className="mt-1.5 font-mono text-[11.5px] text-muted">{found ? binary : tr('Not found on PATH')}</div>
        )}
      </div>
      <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-medium', found ? 'bg-success-soft text-success' : 'bg-surface-inset text-muted')}>{found ? tr('Detected') : tr('Not installed')}</span>
    </div>
  );
}

/* ----------------------------- Claude Code ------------------------- */

function ClaudeSection() {
  const s = useSettings();
  const env = useEnvironment((e) => e.report);
  const [envKey, setEnvKey] = useState('');
  const [envVal, setEnvVal] = useState('');
  const claude = s.claude;
  const patch = (p: Partial<typeof claude>) => s.patch({ claude: { ...claude, ...p } });
  return (
    <>
      <Group title={tr('Binary')}>
        <Row label={tr('Claude Code')} hint={env?.claude.found ? `${env.claude.version} · ${env.claude.path}` : tr('Not detected on PATH')}>
          <span className={cn('rounded-md px-2 py-0.5 text-[11.5px] font-medium', env?.claude.found ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
            {env?.claude.found ? tr('Found') : tr('Missing')}
          </span>
        </Row>
        <Row label={tr('Binary path')} hint={tr('Leave as “claude” to resolve from PATH.')}>
          <TextInput size="sm" mono value={claude.binaryPath} onChange={(e) => patch({ binaryPath: e.target.value })} className="w-[280px]" />
        </Row>
      </Group>
      <Group title={tr('Defaults')}>
        <Row label={tr('Default model')} hint={MODELS.some((m) => m.id === claude.defaultModel) ? undefined : `Custom id: ${claude.defaultModel}`}>
          <div className="flex items-center gap-2">
            <Select
              size="sm"
              value={MODELS.some((m) => m.id === claude.defaultModel) ? claude.defaultModel : '__custom'}
              onChange={(v) => patch({ defaultModel: v === '__custom' ? '' : v })}
              options={[...MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.hint })), { value: '__custom', label: tr('Other model id…') }]}
            />
            {MODELS.some((m) => m.id === claude.defaultModel) ? null : (
              <TextInput size="sm" mono value={claude.defaultModel} onChange={(e) => patch({ defaultModel: e.target.value })} placeholder="claude-opus-5" spellCheck={false} className="w-[180px]" />
            )}
          </div>
        </Row>
        <Row label={tr('Quick answers')} hint={tr('Model behind the inline answer in Spotlight (Ctrl+Space). Fast beats deep here.')}>
          <Select size="sm" value={claude.quickModel} onChange={(v) => patch({ quickModel: v })} options={MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.hint }))} />
        </Row>
        <Row label={tr('Permission mode')} hint={tr('Shift+Tab in the composer cycles this.')}>
          <Select
            size="sm"
            value={claude.permissionMode}
            onChange={(v) => patch({ permissionMode: v })}
            options={[
              { value: 'default', label: tr('Ask for permissions') },
              { value: 'acceptEdits', label: tr('Accept edits') },
              { value: 'plan', label: tr('Plan mode') },
              { value: 'bypassPermissions', label: tr('Bypass permissions') },
            ]}
          />
        </Row>
        <Row label={tr('Continue last conversation')} hint={tr("Starts with --continue so the folder's previous session resumes.")}>
          <Switch checked={claude.continueLast} onCheckedChange={(v) => patch({ continueLast: v })} />
        </Row>
        <div className="py-3 hairline-b">
          <div className="text-ui text-primary">{tr('Extra arguments')}</div>
          <div className="mb-2 mt-0.5 text-[12px] text-secondary">
            {tr('Appended to every launch, as written — anything')} <code className="font-mono">claude --help</code> {tr('accepts. Quotes group a value.')}
          </div>
          <TextInput size="sm" mono value={claude.extraArgs} onChange={(e) => patch({ extraArgs: e.target.value })} placeholder='--resume  --add-dir ../shared  --append-system-prompt "…"' spellCheck={false} className="w-full" />
          <div className="mt-2 rounded-md bg-surface-inset px-3 py-1.5 font-mono text-[11.5px] leading-[1.5] text-secondary break-all">
            <span className="text-muted">❯ </span>
            {['claude', ...claudeArgs(claudeLaunchDefaults(claude)).map((a) => (/\s/.test(a) ? `"${a}"` : a))].join(' ')}
          </div>
        </div>
        <Row label={tr('Ask before launching')} hint={tr('Show the launch panel (model, permissions, arguments) every time Claude Code opens.')}>
          <Switch checked={claude.askArgs} onCheckedChange={(v) => patch({ askArgs: v })} />
        </Row>
        <Row label={tr('Run inside WSL by default')} hint={env?.wsl.available ? tr('Distros: {list}', { list: env.wsl.distros.join(', ') }) : tr('WSL not detected')}>
          <Switch checked={claude.runInWsl} onCheckedChange={(v) => patch({ runInWsl: v })} disabled={!env?.wsl.available} />
        </Row>
        {claude.runInWsl ? (
          <Row label={tr('WSL distro')}>
            <Select size="sm" value={claude.wslDistro || env?.wsl.default || ''} onChange={(v) => patch({ wslDistro: v })} options={(env?.wsl.distros ?? []).map((d) => ({ value: d, label: d }))} />
          </Row>
        ) : null}
      </Group>
      <Group title={tr('Environment variables')}>
        <div className="flex flex-col gap-1.5">
          {Object.entries(claude.env).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 font-mono text-[12px]">
              <span className="w-[200px] truncate text-primary">{k}</span>
              <span className="min-w-0 flex-1 truncate text-secondary">{v}</span>
              <button
                type="button"
                aria-label={`Remove ${k}`}
                onClick={() => {
                  const next = { ...claude.env };
                  delete next[k];
                  patch({ env: next });
                }}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-primary"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <TextInput size="sm" mono placeholder="KEY" value={envKey} onChange={(e) => setEnvKey(e.target.value)} className="w-[200px]" />
            <TextInput size="sm" mono placeholder="value" value={envVal} onChange={(e) => setEnvVal(e.target.value)} className="flex-1" />
            <Button
              size="sm"
              leading={<Plus />}
              disabled={!envKey.trim()}
              onClick={() => {
                patch({ env: { ...claude.env, [envKey.trim()]: envVal } });
                setEnvKey('');
                setEnvVal('');
              }}
            >
              {tr('Add')}
            </Button>
          </div>
        </div>
      </Group>
    </>
  );
}

/* ------------------------------ Terminal --------------------------- */

function TerminalSection() {
  const s = useSettings();
  const shells = useEnvironment((e) => e.report?.shells ?? NO_SHELLS);
  const systemTerminalFont = useEnvironment((e) => e.report?.terminalFont ?? null);
  const systemTerminalScheme = useEnvironment((e) => e.report?.terminalScheme ?? null);
  const nerdFonts = useEnvironment((e) => e.report?.nerdFonts ?? NO_FONTS);
  const appDark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const t = s.terminal;
  const dark = t.appearance === 'auto' ? appDark : t.appearance === 'dark';
  const patch = (p: Partial<typeof t>) => s.patch({ terminal: { ...t, ...p } });
  const wtScheme = schemeFromWindowsTerminal(systemTerminalScheme);
  const primary = terminalPrimaryFont({ setting: t.font, monoFont: s.monoFont, systemTerminalFont });
  const fontOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: 'auto', label: systemTerminalFont ? `Windows Terminal · ${systemTerminalFont}` : 'Automatic' },
      { value: 'mono', label: tr('Interface monospace font') },
    ];
    for (const f of nerdFonts) if (f !== systemTerminalFont) opts.push({ value: f, label: f });
    if (t.font !== 'auto' && t.font !== 'mono' && !opts.some((o) => o.value === t.font)) opts.push({ value: t.font, label: t.font });
    return opts;
  }, [systemTerminalFont, nerdFonts, t.font]);
  const [customFont, setCustomFont] = useState('');
  return (
    <>
      <Group title={tr('Shell')}>
        <Row label={tr('Default shell')}>
          <Select size="sm" value={t.shellId ?? shells[0]?.id ?? ''} onChange={(v) => patch({ shellId: v })} options={shells.map((sh) => ({ value: sh.id, label: sh.label }))} />
        </Row>
      </Group>
      <Group title={tr('Font')}>
        <Row label={tr('Terminal font')} hint={tr('Nerd Font glyphs (oh-my-posh, starship, Claude Code) always render: the bundled Symbols Nerd Font sits behind whichever face you pick.')}>
          <Select size="sm" value={t.font} onChange={(v) => patch({ font: v })} options={fontOptions} />
        </Row>
        <div className="py-3 hairline-b">
          <div
            className="rounded-md px-3 py-2.5 text-[13px] leading-[1.5]"
            style={{ fontFamily: terminalFontStack({ setting: t.font, monoFont: s.monoFont, systemTerminalFont }), background: schemeSwatches(t.scheme, dark)[7], color: schemeSwatches(t.scheme, dark)[6] }}
          >
            {''}
            <span style={{ color: schemeSwatches(t.scheme, dark)[3] }}>{'  ~/conduit '}</span>
            {' '}
            <span style={{ color: schemeSwatches(t.scheme, dark)[1] }}>{' main ↑ 2'}</span>
            {'  '}
            <span style={{ color: schemeSwatches(t.scheme, dark)[4] }}>{' pwsh'}</span>
            {' ❯ echo “brewed for 1m 35s”'}
          </div>
          <div className="mt-1.5 text-[11.5px] text-muted">
            {tr('Using {what}.', { what: primary.source === 'windows-terminal' ? tr("Windows Terminal's face ({font})", { font: systemTerminalFont ?? '' }) : primary.source === 'mono' ? tr('the interface monospace font') : `“${t.font}”` })}
          </div>
        </div>
        <div className="flex items-center gap-2 py-3 hairline-b">
          <TextInput
            size="sm"
            placeholder={tr('Custom family, e.g. Berkeley Mono')}
            value={customFont}
            onChange={(e) => setCustomFont(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customFont.trim()) {
                patch({ font: customFont.trim() });
                setCustomFont('');
              }
            }}
            className="w-[280px]"
          />
          <Button
            size="sm"
            disabled={!customFont.trim()}
            onClick={() => {
              patch({ font: customFont.trim() });
              setCustomFont('');
            }}
          >
            {tr('Use')}
          </Button>
        </div>
      </Group>
      <Group
        title={tr('Colours')}
        action={
          wtScheme && t.scheme !== wtScheme.id ? (
            <Button size="xs" variant="ghost" onClick={() => patch({ scheme: wtScheme.id })}>
              {tr('Match Windows Terminal ({scheme})', { scheme: wtScheme.label })}
            </Button>
          ) : undefined
        }
      >
        <Row label={tr('Appearance')} hint={tr('TUIs such as Claude Code assume a dark background by default; force dark if colours look off in light mode.')}>
          <SegmentedControl
            size="sm"
            value={t.appearance}
            onChange={(v) => patch({ appearance: v })}
            options={[
              { value: 'auto', label: tr('Follow app') },
              { value: 'light', label: tr('Light') },
              { value: 'dark', label: tr('Dark') },
            ]}
          />
        </Row>
        <div className="grid grid-cols-2 gap-1.5 py-2">
          {TERMINAL_SCHEMES.map((sc) => {
            const selected = t.scheme === sc.id;
            const sw = schemeSwatches(sc.id, dark);
            return (
              <button
                key={sc.id}
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ scheme: sc.id })}
                className={cn('flex items-center gap-3 rounded-md px-2.5 py-2 text-left transition-[background-color,box-shadow]', selected ? 'bg-surface-active shadow-[inset_0_0_0_1px_var(--border-strong)]' : 'hover:bg-surface-hover')}
              >
                <span className="flex h-6 w-[88px] shrink-0 overflow-hidden rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ backgroundColor: sw[7] }}>
                  {sw.slice(0, 7).map((c, i) => (
                    <span key={i} className="my-1.5 ml-1 w-2 rounded-[2px]" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="text-[12.5px] text-primary">{sc.label}</span>
                {sc.appearance !== 'auto' ? <span className="ml-auto text-[10.5px] uppercase tracking-[0.05em] text-muted">{tr(sc.appearance === 'dark' ? 'Dark' : 'Light')}</span> : null}
              </button>
            );
          })}
        </div>
      </Group>
      <Group title={tr('Text')}>
        <Row label={tr('Font size')}>
          <SegmentedControl size="sm" value={String(t.fontSize)} onChange={(v) => patch({ fontSize: Number(v) })} options={['11', '12', '13', '14', '15', '16'].map((v) => ({ value: v, label: v }))} />
        </Row>
        <Row label={tr('Line height')}>
          <SegmentedControl size="sm" value={String(t.lineHeight)} onChange={(v) => patch({ lineHeight: Number(v) })} options={['1', '1.15', '1.25', '1.4'].map((v) => ({ value: v, label: v }))} />
        </Row>
        <Row label={tr('Cursor')}>
          <SegmentedControl
            size="sm"
            value={t.cursorStyle}
            onChange={(v) => patch({ cursorStyle: v })}
            options={[
              { value: 'bar', label: tr('Bar') },
              { value: 'block', label: tr('Block') },
              { value: 'underline', label: tr('Underline') },
            ]}
          />
        </Row>
        <Row label={tr('Cursor blink')}>
          <Switch checked={t.cursorBlink} onCheckedChange={(v) => patch({ cursorBlink: v })} />
        </Row>
        <Row label={tr('Scrollback lines')}>
          <Select size="sm" value={String(t.scrollback)} onChange={(v) => patch({ scrollback: Number(v) })} options={['1000', '5000', '10000', '50000'].map((v) => ({ value: v, label: Number(v).toLocaleString(currentLocale()) }))} />
        </Row>
        <Row label={tr('Weight')}>
          <SegmentedControl size="sm" value={t.fontWeight} onChange={(v) => patch({ fontWeight: v })} options={[{ value: 'normal', label: tr('Regular') }, { value: 'medium', label: tr('Medium') }, { value: 'semibold', label: tr('Semibold') }]} />
        </Row>
        <Row label={tr('Letter spacing')}>
          <SegmentedControl size="sm" value={String(t.letterSpacing)} onChange={(v) => patch({ letterSpacing: Number(v) })} options={['-0.5', '0', '0.5', '1'].map((v) => ({ value: v, label: v }))} />
        </Row>
        <Row label={tr('Bold as bright')} hint={tr('Bold text takes the bright ANSI colours, the classic terminal way.')}>
          <Switch checked={t.boldAsBright} onCheckedChange={(v) => patch({ boldAsBright: v })} />
        </Row>
        <Row label={tr('Minimum contrast')} hint={tr('xterm lifts dim colours until they reach this ratio against the background (1 = off).')}>
          <SegmentedControl size="sm" value={String(t.minContrast)} onChange={(v) => patch({ minContrast: Number(v) })} options={[{ value: '1', label: tr('Off') }, { value: '3', label: '3' }, { value: '4.5', label: '4.5' }, { value: '7', label: '7' }]} />
        </Row>
      </Group>
      <Group title={tr('Look')}>
        <Row label={tr('Padding')}>
          <SegmentedControl size="sm" value={String(t.padding)} onChange={(v) => patch({ padding: Number(v) })} options={['0', '4', '8', '12', '16'].map((v) => ({ value: v, label: v }))} />
        </Row>
        <Row label={tr('Background opacity')} hint={tr('Below 100 % the pane shows through the terminal.')}>
          <div className="flex items-center gap-2">
            <input type="range" min={0.5} max={1} step={0.05} value={t.opacity} aria-label={tr('Background opacity')} onChange={(e) => patch({ opacity: Number(e.target.value) })} className="w-[160px] accent-[var(--accent)]" />
            <span className="w-10 text-right text-[11.5px] tabular text-muted">{Math.round(t.opacity * 100)}%</span>
          </div>
        </Row>
        <Row label={tr('Smooth scrolling')}>
          <Switch checked={t.smoothScroll} onCheckedChange={(v) => patch({ smoothScroll: v })} />
        </Row>
      </Group>
      <Group title={tr('Behaviour')}>
        <Row label={tr('Copy on select')} hint={tr('Selecting text copies it, like PuTTY and most Linux terminals.')}>
          <Switch checked={t.copyOnSelect} onCheckedChange={(v) => patch({ copyOnSelect: v })} />
        </Row>
        <Row label={tr('Right click pastes')}>
          <Switch checked={t.rightClickPaste} onCheckedChange={(v) => patch({ rightClickPaste: v })} />
        </Row>
        <Row label={tr('Bell')}>
          <SegmentedControl size="sm" value={t.bell} onChange={(v) => patch({ bell: v })} options={[{ value: 'none', label: tr('Off') }, { value: 'sound', label: tr('Sound') }, { value: 'visual', label: tr('Flash') }]} />
        </Row>
        <Row label={tr('Startup command')} hint={tr('Typed into every new shell tab once it starts (not into agents).')} align="start">
          <TextInput value={t.startupCommand} onChange={(e) => patch({ startupCommand: e.target.value })} placeholder="cls; git status" spellCheck={false} className="w-[260px] font-mono" />
        </Row>
        <Row label={tr('Environment')} hint={tr('KEY=VALUE per line, added to every terminal.')} align="start">
          <Textarea value={t.env} onChange={(e) => patch({ env: e.target.value })} rows={3} placeholder={'EDITOR=code\nNODE_OPTIONS=--max-old-space-size=4096'} spellCheck={false} className="w-[260px] font-mono text-[12px]" />
        </Row>
      </Group>
    </>
  );
}

/* -------------------------------- Git ------------------------------ */

function GitSection() {
  const s = useSettings();
  return (
    <Group>
      <Row label={tr('Auto-fetch')} hint={tr('Fetch every 5 minutes to keep ahead/behind counts fresh.')}>
        <Switch checked={s.git.autoFetch} onCheckedChange={(v) => s.patch({ git: { ...s.git, autoFetch: v } })} />
      </Row>
      <Row label={tr('Decorations in explorer')} hint={tr('M / A / D / U markers next to file names.')}>
        <Switch checked={s.git.showDecorations} onCheckedChange={(v) => s.patch({ git: { ...s.git, showDecorations: v } })} />
      </Row>
    </Group>
  );
}

/* ------------------------------ Browser ---------------------------- */

function BrowserSection() {
  const s = useSettings();
  const b = s.browser;
  const patch = (p: Partial<typeof b>) => s.patch({ browser: { ...b, ...p } });
  return (
    <>
      <Group title={tr('Search engine')}>
        <div className="grid grid-cols-2 gap-1.5 py-2">
          {SEARCH_ENGINES.map((e) => {
            const selected = b.searchEngine === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ searchEngine: e.id })}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-[background-color,box-shadow] duration-(--motion-fast)',
                  selected ? 'bg-surface-active shadow-[inset_0_0_0_1px_var(--border-strong)]' : 'hover:bg-surface-hover',
                )}
              >
                <EngineLogo engine={e} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-primary">{e.label}</span>
                  <span className="block truncate text-[11px] text-muted">{e.home.replace(/^https?:\/\//, '')}</span>
                </span>
                {selected ? <Check className="size-[14px] shrink-0 text-accent" strokeWidth={2.5} /> : null}
              </button>
            );
          })}
        </div>
      </Group>
      <Group title={tr('Home page')}>
        <Row label={tr('New tabs open')} hint={tr("Leave empty for the search engine's home.")}>
          <TextInput size="sm" mono value={b.homepage} onChange={(e) => patch({ homepage: e.target.value })} placeholder="https://" spellCheck={false} className="w-[280px]" />
        </Row>
      </Group>
    </>
  );
}

/* --------------------------- Notifications ------------------------- */

function Notifications() {
  const s = useSettings();
  const n = s.notifications;
  const patch = (p: Partial<typeof n>) => s.patch({ notifications: { ...n, ...p } });
  return (
    <>
      <Group title={tr('Native notifications')}>
        <Row label={tr('Agent finished')} hint={tr('When the app is in the background.')}>
          <Switch checked={n.onComplete} onCheckedChange={(v) => patch({ onComplete: v })} />
        </Row>
        <Row label={tr('Permission required')}>
          <Switch checked={n.onPermission} onCheckedChange={(v) => patch({ onPermission: v })} />
        </Row>
        <Row label={tr('Errors')}>
          <Switch checked={n.onError} onCheckedChange={(v) => patch({ onError: v })} />
        </Row>
        <Row label={tr('Sound')} hint={tr('A soft chime when an agent finishes or needs you.')}>
          <Switch
            checked={n.sound}
            onCheckedChange={(v) => {
              patch({ sound: v });
              if (v) playChime('done', n.volume, n.soundTheme);
            }}
          />
        </Row>
      </Group>
      <Group title={tr('Sounds')}>
        <Row label={tr('Timbre')} hint={tr('The instrument behind every cue. Pick one to hear it.')}>
          <Select
            size="sm"
            value={n.soundTheme}
            onChange={(v) => {
              patch({ soundTheme: v });
              previewTheme(v, n.volume);
            }}
            options={SOUND_THEMES.map((th) => ({ value: th.id, label: th.label, hint: tr(th.hint) }))}
          />
        </Row>
        <Row label={tr('Say it out loud')} hint={tr('"Claude finished" / "Claude needs you" with a system voice, on top of the chime.')}>
          <Switch
            checked={n.speak}
            onCheckedChange={(v) => {
              patch({ speak: v });
              if (v) speak(tr('Claude finished'), speechLang(s.language));
            }}
          />
        </Row>
        <Row label={tr('Toast sounds')} hint={tr('A short cue with every toast — rising for success, low for errors.')}>
          <Switch
            checked={n.toastSound}
            onCheckedChange={(v) => {
              patch({ toastSound: v });
              if (v) playToast('success', n.volume, n.soundTheme);
            }}
          />
        </Row>
        <Row label={tr('Volume')}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={n.volume}
              aria-label={tr('Volume')}
              onChange={(e) => patch({ volume: Number(e.target.value) })}
              onPointerUp={() => playToast('info', n.volume, n.soundTheme)}
              className="w-[160px] accent-[var(--accent)]"
            />
            <span className="w-8 text-right text-[11.5px] tabular text-muted">{Math.round(n.volume * 100)}%</span>
          </div>
        </Row>
      </Group>
      <Group title={tr('Notifications')}>
        <Row label={tr('Where they show')} hint={tr('The island is the black pill at the top of the window: it blooms with each notification and opens the notification centre.')}>
          <Select
            size="sm"
            value={n.surface}
            onChange={(v) => patch({ surface: v })}
            options={[
              { value: 'both', label: tr('Island and toasts') },
              { value: 'island', label: tr('Island only'), hint: tr('Toasts that need a hand still pop up') },
              { value: 'toasts', label: tr('Toasts only') },
            ]}
          />
        </Row>
        <Row label={tr('Preview')} hint={tr('What "Claude finished" looks like: the files it wrote with their added and removed lines.')}>
          <Button
            size="sm"
            onClick={() => {
              celebrate('done');
              pullTrick('burst');
              toast.success(tr('Claude finished'), {
                mark: 'claude',
                icon: <ClaudeLogo size={16} />,
                summary: 'zpace · Refactor the composer · 4 files · +61 −12',
                description: <FilesTouched files={[{ path: 'src/features/agent/Composer.tsx', add: 42, del: 7 }, { path: 'src/stores/selection.ts', add: 12, del: 0 }, { path: 'src/i18n/es.ts', add: 6, del: 2 }, { path: 'README.md', add: 1, del: 3 }]} />,
                action: { label: tr('Open'), onClick: () => void 0 },
              });
            }}
          >
            {tr('Show an example')}
          </Button>
        </Row>
      </Group>
    </>
  );
}

/* ------------------------------ Keyboard --------------------------- */

function KeyboardSection() {
  return (
    <Group>
      {SHORTCUTS.map((s) => (
        <Row key={s.combo} label={tr(s.label)}>
          <Shortcut combo={s.combo} />
        </Row>
      ))}
    </Group>
  );
}

/* ------------------------------ Advanced --------------------------- */

function Advanced() {
  const s = useSettings();
  return (
    <>
      <Group title={tr('Data')}>
        <Row label={tr('Storage')} hint={isTauri ? tr('SQLite database in the app data folder. Nothing leaves this machine.') : tr('Browser preview keeps data in localStorage.')}>
          <span className="rounded-md bg-surface-inset px-2 py-0.5 text-[11.5px] text-muted">{tr('100% local')}</span>
        </Row>
      </Group>
      <Group title={tr('Reset')}>
        <Row label={tr('Reset all settings')} hint={tr('Appearance, fonts, terminal and Claude settings return to defaults.')}>
          <Button size="sm" variant="danger" onClick={() => s.reset()}>
            {tr('Reset')}
          </Button>
        </Row>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ */

/** The app, its version, and who made it — the avatar comes straight from GitHub, so it follows the profile. */
function About() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri) return;
    void import('@tauri-apps/api/app').then(({ getVersion }) => getVersion()).then(setVersion).catch(() => void 0);
  }, []);
  return (
    <>
      <Group>
        <div className="flex items-center gap-4 py-2">
          <ZorynqTile size={56} />
          <div className="min-w-0">
            <div className="text-[17px] font-semibold tracking-[-0.01em]">Zpace</div>
            <div className="mt-0.5 text-[12px] text-secondary">{version ? `${tr('Version')} ${version}` : tr('Your workspace for the agent era.')}</div>
          </div>
          {isTauri ? (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void checkForUpdates()}>
              <RefreshCw className="size-[13px]" /> {tr('Check now')}
            </Button>
          ) : null}
        </div>
      </Group>
      <Group title={tr('Created by')}>
        <AuthorCard />
        <Contributors />
      </Group>
    </>
  );
}

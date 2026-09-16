import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { useUI } from '@/stores/ui';
import { useEnvironment } from '@/stores/environment';
import { useTouched } from '@/stores/touched';
import { useMargin } from '@/stores/margin';
import { useNotifications } from '@/stores/notifications';
import { useArena } from '@/stores/arena';
import { useUpdate } from '@/features/updater/store';
import { useAgents } from '@/stores/agents';
import { useSettings } from '@/stores/settings';
import { useTerminals } from '@/stores/terminals';
import { useNotes } from '@/stores/notes';
import { detectEnvironment, gitSummary } from '@/native/system';
import { mockEvents, mockProjects, mockRunningEvents, mockSessions, mockWaitingEvents, MOCK_ACTIVE_SESSION_ID } from '@/mock/data';
import { db } from '@/database/client';
import { startQueueRunner } from '@/features/agent/queue-runner';
import { watchClipboard } from '@/stores/clips';
import { startAutomations } from '@/features/automations/runner';
import { checkForUpdates } from '@/features/updater/updater';
import { allPacks, applyEditorTheme, applyPack } from '@/features/appearance/packs';
import { bootPlugins, install as installPlugin, uninstall as uninstallPlugin, refreshIndex } from '@/features/plugins/registry';
import { getTerminal } from '@/features/terminal/registry';
import { pluginCommands } from '@/features/plugins/runtime';
import { watchDesktopIsland } from '@/features/island/desktop/bridge';

import { usePlugins } from '@/stores/plugins';
import { resolveFontStack } from '@/lib/fonts';
import { resolveLanguage, setLanguage } from '@/i18n';
import { ACCENT_PRESETS, type ColorToken } from '@/stores/settings';

/** Seed the sample workspace described in the product brief. */
export function seedMockWorkspace() {
  useProjects.getState().hydrate(mockProjects);
  useProjects.setState({ recents: mockProjects.map((p) => ({ name: p.name, path: p.path, lastOpenedAt: p.lastOpenedAt, branch: p.git?.branch })) });
  useSessions.getState().hydrate(mockSessions, {
    [MOCK_ACTIVE_SESSION_ID]: mockEvents,
    ses_melon_docs: mockRunningEvents,
    ses_melon_deploy: mockWaitingEvents,
    ses_money_1: [],
    ses_luis_1: [],
    ses_sbt_1: [],
  });
  useUI.getState().setActiveSession(MOCK_ACTIVE_SESSION_ID);
}

/** Runs once at startup: environment detection, persistence, git refresh. */
export async function bootstrap() {
  startQueueRunner();
  watchClipboard();
  startAutomations();
  // The desktop island: a second window over the screen, when the setting is on.
  watchDesktopIsland();
  // Plugins: activate the enabled ones once their store has hydrated, then a quiet look at the registry.
  window.setTimeout(() => void bootPlugins(), 1500);
  // A quiet look at the update channel a few seconds in (only says something when there is news).
  window.setTimeout(() => {
    if (useSettings.getState().checkUpdates) void checkForUpdates({ quiet: true });
  }, 8000);
  // The entrance: once per launch, after the first paint, when onboarding is done and it is not turned off.
  window.setTimeout(() => {
    const ui = useUI.getState();
    if (ui.onboardingDone && useSettings.getState().showWelcome) ui.setWelcomeOpen(true);
  }, 350);
  if (import.meta.env.DEV) {
    // Automation hook for dev/e2e scripts only (never shipped in production builds).
    (window as unknown as { __conduit?: unknown }).__conduit = { useProjects, useSessions, useUI, useSettings, useTerminals, useNotes, useEnvironment, useTouched, useMargin, useNotifications, useArena, useAgents, useUpdate, usePlugins, seedMockWorkspace, dev: { pluginCommands, installPlugin, uninstallPlugin, refreshIndex, applyPack, allPacks, getTerminal } };
  }
  const env = useEnvironment.getState();
  env.setLoading(true);
  try {
    const report = await detectEnvironment();
    env.setReport(report);
    // Default terminal shell.
    const settings = useSettings.getState();
    if (!settings.terminal.shellId && report.shells[0]) {
      settings.patch({ terminal: { ...settings.terminal, shellId: report.shells[0].id } });
    }
  } catch (e) {
    env.setError(e instanceof Error ? e.message : String(e));
  }

  // SQLite persistence (desktop only). Loads previous state, then mirrors changes.
  await db.init();

  if (!useSettings.getState().restoreLayout) useUI.getState().resetLayout();

  // Refresh git summaries for open projects.
  for (const p of useProjects.getState().projects) {
    const g = await gitSummary(p.path);
    if (g) useProjects.getState().setGit(p.id, g);
  }
}

/** Apply theme / fonts / colours / density to <html>. Everything is a CSS variable, so this is cheap. */
// Language is needed before the first render: the settings store hydrates synchronously.
setLanguage(resolveLanguage(useSettings.getState().language));

export function applyAppearance() {
  const s = useSettings.getState();
  setLanguage(resolveLanguage(s.language));
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.dataset.density = s.density;
  root.dataset.weight = s.textWeight;

  // Fonts
  root.style.setProperty('--font-sans', resolveFontStack(s.font, false));
  root.style.setProperty('--font-mono', resolveFontStack(s.monoFont, true));
  // Density nudges type a touch either way; row heights and padding come from the [data-density] rules.
  const delta = s.density === 'compact' ? -0.5 : s.density === 'comfortable' ? 0.5 : 0;
  root.style.setProperty('--font-size-ui', `${s.fontSize + delta}px`);
  root.style.setProperty('--font-size-content', `${s.monoSize + delta}px`);
  root.style.setProperty('--font-size-meta', `${Math.max(10.5, s.fontSize - 1.5)}px`);
  root.style.setProperty('--font-size-terminal', `${s.terminal.fontSize}px`);

  // Colours: accent preset, then per-token overrides for the active appearance.
  const mode = dark ? 'dark' : 'light';
  const preset = ACCENT_PRESETS.find((a) => a.id === s.accent);
  const overrides = s.colors[mode];
  const map: Record<ColorToken, string> = {
    accent: '--accent',
    accentWarm: '--accent-warm',
    canvas: '--canvas',
    background: '--background',
    surface: '--surface',
    textPrimary: '--text-primary',
    textSecondary: '--text-secondary',
    border: '--border',
  };
  // No computed-style reads here: --accent-soft / --accent-warm-soft derive from the accent in CSS
  // (color-mix), so a colour picker drag only writes a few custom properties per frame.
  for (const v of Object.values(map)) root.style.removeProperty(v);
  root.style.removeProperty('--surface-raised');
  if (preset && s.accent !== 'custom') {
    root.style.setProperty('--accent', preset[mode]);
  }
  for (const [token, value] of Object.entries(overrides) as Array<[ColorToken, string]>) {
    if (value) root.style.setProperty(map[token], value);
  }
  if (overrides.surface) root.style.setProperty('--surface-raised', overrides.surface);

  // The editor theme lives in Monaco, not in CSS: re-derive it from the pack.
  const pack = allPacks().find((x) => x.id === s.themePack);
  if (pack) applyEditorTheme(pack);

  if (s.reducedMotion === 'on') root.style.setProperty('--motion-fast', '0ms');
  else root.style.removeProperty('--motion-fast');
}

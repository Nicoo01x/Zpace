import { useEffect } from 'react';
import { t } from '@/i18n';
import { MotionConfig } from 'motion/react';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { TitleBar } from '@/components/layout/TitleBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { Workspace } from '@/components/layout/Workspace';
import { FloatLayer } from '@/features/plugins/FloatLayer';
import { Toaster } from '@/features/notifications/Toaster';
import { CommandPalette } from '@/features/palette/CommandPalette';
import { GlobalSearch } from '@/features/search/GlobalSearch';
import { Spotlight } from '@/features/spotlight/Spotlight';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { WindowStack } from '@/features/switcher/WindowStack';
import { Welcome } from '@/features/welcome/Welcome';
import { DaySummaryDialog } from '@/features/summary/DaySummary';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { Celebration } from '@/features/mascot/Celebration';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { AboutDialog } from '@/features/settings/AboutDialog';
import { Onboarding } from '@/features/settings/Onboarding';
import { UpdateDialog } from '@/features/updater/UpdateDialog';
import { DiffViewer } from '@/features/files/DiffViewer';
import { Lightbox } from '@/features/files/Lightbox';
import { GitPanel } from '@/features/git/GitPanel';
import { CloneDialog } from '@/features/git/CloneDialog';
import { NewProjectDialog } from '@/features/projects/NewProjectDialog';
import { ClaudeLaunchDialog } from '@/features/agent/ClaudeLaunchDialog';
import { ArenaDialog } from '@/features/arena/ArenaDialog';
import { AgentEditorDialog } from '@/features/agents/AgentEditorDialog';
import { RoomDialog } from '@/features/agents/RoomDialog';
import { SubagentEditorDialog } from '@/features/agents/SubagentEditorDialog';
import { ConfirmCloseDialog } from '@/features/settings/ConfirmCloseDialog';
import { useSettings } from '@/stores/settings';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { applyAppearance, bootstrap } from './bootstrap';
import { useAutoFetch } from '@/features/git/useAutoFetch';

export function App() {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const language = useSettings((s) => s.language);
  useGlobalShortcuts();
  useAutoFetch();

  // Appearance: theme / fonts / colours / density → <html>.
  useEffect(() => {
    applyAppearance();
    const unsub = useSettings.subscribe(applyAppearance);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyAppearance);
    return () => {
      unsub();
      mq.removeEventListener('change', applyAppearance);
    };
  }, []);

  useEffect(() => {
    void bootstrap();
  }, []);

  // Block the browser's own context menu everywhere — we provide our own.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, .selectable, .xterm, .monaco-editor')) return;
      e.preventDefault();
    };
    window.addEventListener('contextmenu', onCtx);
    return () => window.removeEventListener('contextmenu', onCtx);
  }, []);

  return (
    <MotionConfig reducedMotion={reducedMotion === 'system' ? 'user' : reducedMotion === 'on' ? 'always' : 'never'}>
      <TooltipProvider>
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-canvas text-primary">
          {/* The chrome re-mounts on a language change so every label re-reads t(); pane bodies keep their state. */}
          <ErrorBoundary compact label={t('Title bar')}>
            <TitleBar key={`tb-${language}`} />
          </ErrorBoundary>
          <div className="relative flex min-h-0 flex-1">
            <ErrorBoundary compact label={t('Sidebar')}>
              <Sidebar key={`sb-${language}`} />
            </ErrorBoundary>
            <ErrorBoundary label={t('Workspace')}>
              <Workspace />
            </ErrorBoundary>
            <ErrorBoundary compact label={t('Plugins')}>
              <FloatLayer />
            </ErrorBoundary>
          </div>
          <Onboarding key={`ob-${language}`} />
        </div>
        <CommandPalette key={`cp-${language}`} />
        <GlobalSearch key={`gs-${language}`} />
        <Spotlight key={`sl-${language}`} />
        <WindowStack key={`ws-${language}`} />
        <ErrorBoundary compact label={t('Welcome')}>
          <Welcome key={`wl-${language}`} />
        </ErrorBoundary>
        <SettingsDialog key={`sd-${language}`} />
        <AboutDialog key={`ab-${language}`} />
        <UpdateDialog key={`ud-${language}`} />
        <DaySummaryDialog key={`ds-${language}`} />
        <PromptDialog />
        <Celebration />
        <CloneDialog key={`cd-${language}`} />
        <NewProjectDialog key={`np-${language}`} />
        <ClaudeLaunchDialog key={`cl-${language}`} />
        <ArenaDialog key={`arena-${language}`} />
        <AgentEditorDialog key={`agent-${language}`} />
        <RoomDialog key={`room-${language}`} />
        <SubagentEditorDialog key={`subagent-${language}`} />
        <ConfirmCloseDialog key={`cc-${language}`} />
        <DiffViewer />
        <GitPanel key={`gp-${language}`} />
        <Lightbox />
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}

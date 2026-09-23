import type { ComponentType } from 'react';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from '@/features/agent/BrandIcon';
import { useEnvironment } from '@/stores/environment';
import { openStudio } from '@/features/studio/open';
import {
  FolderOpen,
  Plus,
  Terminal,
  PanelLeft,
  Sun,
  Moon,
  Monitor,
  Settings,
  Search,
  GitBranch,
  SplitSquareHorizontal,
  SplitSquareVertical,
  FolderTree,
  StopCircle,
  Trash2,
  Copy,
  Archive,
  Pin,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  Sparkles,
  NotebookPen,
  Globe,
  GitPullRequestArrow,
  Bell,
  FileDiff,
  CalendarDays,
  LayoutTemplate,
  ClipboardList,
  Scissors,
  Palette,
  Workflow,
  Plug,
  Swords,
  Wand2,
  Bot,
  Users,
  Puzzle,
  Mic,
} from 'lucide-react';
import { allPacks, applyPack } from '@/features/appearance/packs';
import { pluginCommands } from '@/features/plugins/runtime';
import { useClips, clipLabel } from '@/stores/clips';
import { insertIntoComposer } from '@/features/agent/composer-drafts';
import { useLayouts, layoutsFor } from '@/stores/layouts';
import { askText } from '@/stores/prompt';
import { useTerminals } from '@/stores/terminals';
import { useNotifications } from '@/stores/notifications';
import { openReview } from '@/features/review/open-review';
import { useArenaLauncher } from '@/features/arena/launcher';
import { useAgentEditor, useRoomLauncher, useSubagentEditor } from '@/features/agents/editor';
import { useUI, collectLeaves } from '@/stores/ui';
import { useSettings } from '@/stores/settings';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { runtime } from '@/providers/runtime';
import { toast } from '@/features/notifications/toast-store';
import { seedMockWorkspace } from '@/app/bootstrap';
import { git } from '@/native/git';
import { gitSummary } from '@/native/system';
import { isTauri } from '@/lib/platform';
import type { WorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { startVoice } from '@/features/voice/agent';
import { t, T } from '@/i18n';


export interface Command {
  id: string;
  title: string;
  group: 'Create' | 'Session' | 'Project' | 'View' | 'Layout' | 'Clipboard' | 'Terminal' | 'Git' | 'Appearance' | 'Settings' | 'Help' | 'Plugins';
  icon?: ComponentType<{ className?: string }>;
  shortcut?: string;
  keywords?: string[];
  run: () => unknown;
  /** Hide when not applicable. */
  when?: () => boolean;
}

async function refreshAllGit() {
  const store = useProjects.getState();
  for (const p of store.projects) {
    const g = await gitSummary(p.path);
    if (g) store.setGit(p.id, g);
  }
}

/** The palette's section headers, translated where they render. */
export const COMMAND_GROUPS = [T('Create'), T('Session'), T('Project'), T('Git'), T('Appearance'), T('Settings'), T('Plugins'), T('Help'), T('Layout'), T('Clipboard'), T('Terminal'), T('View')] as const;

export function buildCommands(a: WorkspaceActions): Command[] {
  const ui = () => useUI.getState();
  const settings = () => useSettings.getState();
  const activeSession = () => {
    const id = ui().activeSessionId;
    return id ? useSessions.getState().sessions[id] : undefined;
  };
  const hasSession = () => !!activeSession();
  const busy = () => {
    const s = activeSession();
    return !!s && (s.status === 'running' || s.status === 'waiting');
  };
  const project = () => a.currentProject();
  const env = () => useEnvironment.getState().report;
  const hasRepo = () => !!project()?.git?.isRepo && isTauri;

  const gitOp = (label: string, fn: (path: string) => Promise<unknown>, success: string) => async () => {
    const p = project();
    if (!p || !isTauri) return void toast.info(t('Git runs in the desktop app with a project open'));
    await toast.promise(
      fn(p.path).then(() => refreshAllGit()),
      { loading: `${label}…`, success, error: (e) => t('{label} failed: {error}', { label, error: e instanceof Error ? e.message : String(e) }) },
      { origin: null },
    );
  };

  return [
    // Create
    { id: 'voice.talk', title: t('Talk to Zpace'), group: 'Create', icon: Mic, shortcut: 'mod+shift+space', keywords: ['voice', 'speak', 'microphone', 'assistant', 'voz'], when: () => isTauri, run: () => startVoice() },
    { id: 'create.terminal', title: t('New terminal'), group: 'Create', icon: Terminal, shortcut: 'mod+shift+t', run: () => { a.openTerminalPane(); } },
    { id: 'create.claude', title: t('Claude Code in folder…'), group: 'Create', icon: ClaudeLogo, keywords: ['tui', 'interactive'], run: () => void a.openClaudeTerminal() },
    { id: 'create.claude-here', title: t('Claude Code in current project'), group: 'Create', icon: ClaudeLogo, when: () => !!project(), run: () => void a.openClaudeTerminal({ projectId: project()!.id }) },
    { id: 'create.claude-args', title: t('Claude Code with arguments…'), group: 'Create', icon: ClaudeLogo, keywords: ['flags', 'model', 'resume', 'continue'], run: () => void a.openClaudeTerminal({ projectId: project()?.id, ask: true }) },
    { id: 'create.codex', title: t('Codex in current project'), group: 'Create', icon: CodexLogo, keywords: ['openai', 'tui'], when: () => !!project() && !!env()?.codex?.found, run: () => void a.openAgentTerminal('codex', { projectId: project()!.id }) },
    { id: 'create.gemini', title: t('Gemini CLI in current project'), group: 'Create', icon: GeminiLogo, keywords: ['google', 'tui'], when: () => !!project() && !!env()?.gemini?.found, run: () => void a.openAgentTerminal('gemini', { projectId: project()!.id }) },
    { id: 'create.opencode', title: t('OpenCode in current project'), group: 'Create', icon: OpenCodeLogo, keywords: ['sst', 'tui'], when: () => !!project() && !!env()?.opencode?.found, run: () => void a.openAgentTerminal('opencode', { projectId: project()!.id }) },
    { id: 'create.board', title: t('New board'), group: 'Create', icon: Plus, keywords: ['whiteboard', 'canvas', 'pizarra', 'map'], run: () => { a.newBoard(); } },
    { id: 'create.project-board', title: t('Project board'), group: 'Create', icon: Plus, keywords: ['whiteboard', 'agents', 'map'], when: () => !!project(), run: () => { a.openProjectBoard(project()!.id); } },
    { id: 'create.session', title: t('New structured Claude session (chat view)'), group: 'Create', icon: Plus, shortcut: 'mod+n', keywords: ['structured', 'transcript', 'agent'], run: () => { a.newSession(); } },
    { id: 'create.note', title: t('New note'), group: 'Create', icon: NotebookPen, shortcut: 'mod+shift+n', run: () => { a.newNote(); } },
    { id: 'create.browser', title: t('Open browser'), group: 'Create', icon: Globe, keywords: ['web'], run: () => a.openBrowser() },
    { id: 'create.project', title: t('Add project…'), group: 'Create', icon: FolderOpen, shortcut: 'mod+o', run: () => void a.openProject() },
    { id: 'create.clone', title: t('Clone repository…'), group: 'Create', icon: GitPullRequestArrow, run: () => ui().setCloneOpen(true) },

    // Session
    { id: 'session.switch', title: t('Switch session…'), group: 'Session', icon: Search, keywords: ['go to', 'jump'], run: () => ui().openPalette('sessions') },
    { id: 'session.stop', title: t('Stop agent'), group: 'Session', icon: StopCircle, when: busy, run: () => void runtime.cancel(ui().activeSessionId!) },
    { id: 'session.pin', title: t('Pin session'), group: 'Session', icon: Pin, when: hasSession, run: () => useSessions.getState().updateSession(ui().activeSessionId!, { pinned: !activeSession()?.pinned }) },
    {
      id: 'session.duplicate',
      title: t('Duplicate session'),
      group: 'Session',
      icon: Copy,
      when: hasSession,
      run: () => {
        const c = useSessions.getState().duplicateSession(ui().activeSessionId!);
        if (c) ui().setActiveSession(c.id);
      },
    },
    {
      id: 'session.archive',
      title: t('Archive session'),
      group: 'Session',
      icon: Archive,
      when: hasSession,
      run: () => {
        useSessions.getState().updateSession(ui().activeSessionId!, { archived: true });
        ui().setActiveSession(null);
      },
    },
    { id: 'session.delete', title: t('Delete session'), group: 'Session', icon: Trash2, when: hasSession, run: () => a.deleteSession(ui().activeSessionId!) },

    // Project
    { id: 'project.files', title: t('Go to file…'), group: 'Project', icon: Search, shortcut: 'mod+p', keywords: ['quick open', 'search files'], run: () => ui().openPalette('files') },
    { id: 'project.refresh-git', title: t('Refresh git status'), group: 'Project', icon: RefreshCw, run: () => void refreshAllGit().then(() => toast.neutral(t('Git status refreshed'), { origin: null })) },

    // View
    { id: 'view.sidebar', title: t('Toggle sidebar'), group: 'View', icon: PanelLeft, shortcut: 'mod+b', run: () => ui().toggleSidebar() },
    { id: 'view.explorer', title: t('Toggle file explorer'), group: 'View', icon: FolderTree, shortcut: 'mod+shift+e', run: () => ui().toggleExplorer() },
    { id: 'view.search', title: t('Global search'), group: 'View', icon: Search, shortcut: 'mod+shift+f', run: () => ui().setSearchOpen(true) },
    { id: 'review.open', title: t('Review the agent\x27s changes'), group: 'Session', icon: FileDiff, keywords: ['diff', 'keep', 'discard', 'revert'], when: () => !!ui().activeSessionId, run: () => openReview(ui().activeSessionId!) },
    { id: 'agent.new', title: t('New agent…'), group: 'Create', icon: Bot, keywords: ['agent', 'persona', 'custom', 'agente'], run: () => useAgentEditor.getState().open() },
    { id: 'subagent.new', title: t('New Claude Code subagent…'), group: 'Create', icon: Bot, keywords: ['subagent', 'claude', 'agents', 'delegate', 'subagente'], run: () => useSubagentEditor.getState().open({ scope: project() ? 'project' : 'user' }) },
    { id: 'plugins.open', title: t('Plugins…'), group: 'Settings', icon: Puzzle, keywords: ['plugin', 'plugins', 'extension', 'library', 'community'], run: () => ui().openSettings('plugins') },
    { id: 'room.new', title: t('Multi-agent room…'), group: 'Create', icon: Users, keywords: ['room', 'multi', 'agents', 'sala', 'chat'], run: () => useRoomLauncher.getState().open(project()?.id) },
    { id: 'arena.new', title: t('Agent arena…'), group: 'Session', icon: Swords, keywords: ['arena', 'variants', 'parallel', 'compare', 'worktree', 'agents'], when: () => !!project()?.git?.isRepo, run: () => useArenaLauncher.getState().open(project()!.id) },
    { id: 'view.git-pane', title: t('Git as a pane'), group: 'Git', icon: GitBranch, keywords: ['undock', 'split'], when: () => !!project(), run: () => a.splitActive('horizontal', { kind: 'git', projectId: project()!.id }) },
    { id: 'view.welcome', title: t('Show the entrance screen'), group: 'View', icon: Search, keywords: ['welcome', 'dashboard', 'intro', 'inicio'], run: () => ui().setWelcomeOpen(true) },
    { id: 'view.studio', title: t('Studio: build your Claude'), group: 'View', icon: Wand2, keywords: ['studio', 'skills', 'subagents', 'commands', 'hooks', 'mcp', 'claude.md', 'memory', 'estudio', 'sala'], run: () => openStudio() },
    { id: 'view.studio-project', title: t('Studio: this project’s Claude'), group: 'View', icon: Wand2, keywords: ['studio', 'project', 'skills', '.claude', 'estudio'], when: () => !!project(), run: () => openStudio({ kind: 'project', projectId: project()!.id }) },
    { id: 'view.zoom', title: t('Maximize / restore the pane'), group: 'View', icon: Search, shortcut: 'mod+shift+enter', keywords: ['zoom', 'fullscreen', 'pantalla grande', 'maximize'], run: () => ui().toggleZoom() },
    { id: 'view.stack', title: t('Window stack'), group: 'View', icon: Search, shortcut: 'ctrl+tab', keywords: ['switch', 'panes', 'windows', 'cycle'], run: () => ui().setStackOpen(true) },
    { id: 'view.spotlight', title: t('Spotlight'), group: 'View', icon: Search, shortcut: 'mod+space', keywords: ['search', 'web', 'files', 'anything'], run: () => ui().setSpotlightOpen(true) },
    { id: 'view.split-right', title: t('Split right'), group: 'View', icon: SplitSquareHorizontal, run: () => a.splitActive('horizontal') },
    { id: 'view.split-down', title: t('Split down'), group: 'View', icon: SplitSquareVertical, run: () => a.splitActive('vertical') },
    { id: 'view.close-pane', title: t('Close pane'), group: 'View', shortcut: 'mod+w', run: a.closeActivePane },
    { id: 'view.reset-layout', title: 'Reset layout', group: 'View', run: () => ui().resetLayout() },

    // Terminal
    { id: 'terminal.toggle', title: t('Toggle terminal drawer'), group: 'Terminal', icon: Terminal, shortcut: 'mod+`', run: () => ui().toggleTerminalPanel() },
    { id: 'terminal.split', title: t('Open terminal to the side'), group: 'Terminal', icon: SplitSquareHorizontal, run: () => { a.openTerminal({ split: 'horizontal' }); } },

    // Git
    { id: 'git.panel', title: t('Git panel'), group: 'Git', icon: GitBranch, shortcut: 'mod+shift+g', keywords: ['branches', 'commit'], run: () => ui().toggleGitPanel() },
    { id: 'git.fetch', title: t('Git: Fetch'), group: 'Git', icon: RefreshCw, when: hasRepo, run: gitOp(t('Fetching'), (p) => git.fetch(p), t('Fetched')) },
    { id: 'git.pull', title: t('Git: Pull'), group: 'Git', icon: ArrowDownToLine, when: hasRepo, run: gitOp(t('Pulling'), (p) => git.pull(p), t('Pull completed')) },
    { id: 'git.push', title: t('Git: Push'), group: 'Git', icon: ArrowUpFromLine, when: hasRepo, run: gitOp(t('Pushing'), (p) => git.push(p), t('Pushed')) },

    // Appearance
    { id: 'theme.light', title: t('Theme: Light'), group: 'Appearance', icon: Sun, run: () => settings().set('theme', 'light') },
    { id: 'theme.dark', title: t('Theme: Dark'), group: 'Appearance', icon: Moon, run: () => settings().set('theme', 'dark') },
    { id: 'theme.system', title: t('Theme: System'), group: 'Appearance', icon: Monitor, run: () => settings().set('theme', 'system') },
    {
      id: 'theme.toggle',
      title: t('Toggle theme'),
      group: 'Appearance',
      keywords: ['dark', 'light'],
      run: () => {
        const t = settings().theme;
        const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        settings().set('theme', dark ? 'light' : 'dark');
      },
    },
    { id: 'appearance.open', title: t('Fonts & colours…'), group: 'Appearance', icon: Settings, run: () => ui().openSettings('appearance') },

    // Settings
    { id: 'settings.open', title: t('Open settings'), group: 'Settings', icon: Settings, shortcut: 'mod+comma', run: () => ui().openSettings() },
    { id: 'settings.keyboard', title: t('Keyboard shortcuts'), group: 'Settings', run: () => ui().openSettings('keyboard') },
    { id: 'settings.automations', title: t('Automations'), group: 'Settings', icon: Workflow, keywords: ['watch', 'schedule', 'cron', 'automatizaciones'], run: () => ui().openSettings('automations') },
    { id: 'settings.mcp', title: t('MCP servers'), group: 'Settings', icon: Plug, keywords: ['mcp', 'tools'], run: () => ui().openSettings('mcp') },
    { id: 'settings.claude', title: t('Claude Code settings'), group: 'Settings', run: () => ui().openSettings('claude') },
    { id: 'settings.terminal', title: t('Terminal settings'), group: 'Settings', run: () => ui().openSettings('terminal') },

    // Help
    { id: 'notifications.centre', title: t('Notifications'), group: 'Help', icon: Bell, run: () => useNotifications.getState().setOpen(true) },
    { id: 'summary.day', title: t('Day summary'), group: 'Help', icon: CalendarDays, keywords: ['resumen', 'today', 'cost', 'commits'], run: () => ui().setSummaryOpen(true) },
    { id: 'help.about', title: t('About Zpace'), group: 'Help', icon: Info, run: () => ui().setAboutOpen(true) },
    { id: 'help.onboarding', title: t('Show welcome screen'), group: 'Help', icon: Sparkles, run: () => ui().setOnboardingDone(false) },
    { id: 'help.sample', title: t('Load demo workspace (sample data)'), group: 'Help', icon: Sparkles, keywords: ['mock', 'demo'], run: () => seedMockWorkspace() },

    // Theme packs
    ...allPacks().map((pk): Command => ({ id: `theme.${pk.id}`, title: t('Theme: {name}', { name: pk.label }), group: 'Appearance', icon: Palette, keywords: ['theme', 'pack', pk.label, pk.appearance], run: () => applyPack(pk.id) })),

    // Clipboard history and snippets: insert into the active chat
    ...useClips.getState().clips.slice(0, 12).map((c): Command => ({
      id: `clip.${c.id}`,
      title: t('Clipboard: {text}', { text: clipLabel(c.text, 60) }),
      group: 'Clipboard',
      icon: ClipboardList,
      keywords: ['clipboard', 'paste', c.text.slice(0, 80)],
      when: hasSession,
      run: () => insertIntoComposer(ui().activeSessionId!, c.text),
    })),
    { id: 'clip.clear', title: t('Clear clipboard history'), group: 'Clipboard', icon: Trash2, when: () => useClips.getState().clips.length > 0, run: () => useClips.getState().clearClips() },
    ...useClips
      .getState()
      .snippets.filter((x) => !x.projectId || x.projectId === project()?.id)
      .map((sn): Command => ({
        id: `snippet.${sn.id}`,
        title: t('Snippet: {name}', { name: sn.name }),
        group: 'Clipboard',
        icon: Scissors,
        keywords: ['snippet', sn.name, sn.body.slice(0, 80)],
        when: hasSession,
        run: () => insertIntoComposer(ui().activeSessionId!, sn.body),
      })),
    {
      id: 'snippet.save',
      title: t('Save a snippet…'),
      group: 'Clipboard',
      icon: Scissors,
      keywords: ['snippet', 'template', 'prompt'],
      run: () => {
        void askText({ title: t('Snippet name'), placeholder: t('e.g. review-checklist'), confirm: t('Next') }).then((name) => {
          if (!name) return;
          void askText({ title: t('Snippet text'), description: t('Inserted with /snippet:{name} in the chat.', { name }), initial: window.getSelection()?.toString() ?? '', confirm: t('Save') }).then((body) => {
            if (!body) return;
            useClips.getState().addSnippet(name, body, project()?.id);
            toast.success(t('Snippet saved'), { description: `/snippet:${name}`, mark: 'note' });
          });
        });
      },
    },
    ...useClips
      .getState()
      .snippets.filter((x) => !x.projectId || x.projectId === project()?.id)
      .map((sn): Command => ({ id: `snippet.delete.${sn.id}`, title: t('Delete snippet: {name}', { name: sn.name }), group: 'Clipboard', icon: Trash2, keywords: ['snippet', sn.name], run: () => useClips.getState().removeSnippet(sn.id) })),

    // Layouts: save the arrangement, bring one back (Ctrl+Alt+1…9 in the order listed), or one of the ready-made ones
    {
      id: 'layout.save',
      title: t('Save layout as…'),
      group: 'Layout',
      icon: LayoutTemplate,
      keywords: ['workspace', 'arrangement', 'panes'],
      run: () => {
        void askText({ title: t('Save layout'), description: project() ? t('Saved for {project}; Ctrl+Alt+number brings it back.', { project: project()!.name }) : undefined, placeholder: t('Review mode'), confirm: t('Save') }).then((name) => {
          if (!name) return;
          useLayouts.getState().save(name, project()?.id);
          toast.success(t('Layout saved'), { description: name, mark: 'note' });
        });
      },
    },
    ...layoutsFor(useLayouts.getState().layouts, project()?.id).map((l, i): Command => ({
      id: `layout.apply.${l.id}`,
      title: t('Layout: {name}', { name: l.name }),
      group: 'Layout',
      icon: LayoutTemplate,
      shortcut: i < 9 ? `mod+alt+${i + 1}` : undefined,
      keywords: ['layout', l.name],
      run: () => useLayouts.getState().apply(l.id),
    })),
    ...layoutsFor(useLayouts.getState().layouts, project()?.id).map((l): Command => ({
      id: `layout.delete.${l.id}`,
      title: t('Delete layout: {name}', { name: l.name }),
      group: 'Layout',
      icon: Trash2,
      keywords: ['layout', l.name],
      run: () => useLayouts.getState().remove(l.id),
    })),
    { id: 'layout.preset.review', title: t('Layout: chat + review + explorer'), group: 'Layout', icon: LayoutTemplate, when: hasSession, run: () => presetReview(ui().activeSessionId!) },
    { id: 'layout.preset.terminal', title: t('Layout: chat + terminal'), group: 'Layout', icon: LayoutTemplate, when: hasSession, run: () => presetChatTerminal(ui().activeSessionId!, a) },
    { id: 'layout.preset.terminals', title: t('Layout: three terminals'), group: 'Layout', icon: LayoutTemplate, when: () => !!project(), run: () => presetTerminals(a) },
    ...pluginCommands(),
  ];
}

/** Chat on the left, the review of its changes on the right, the explorer up. */
function presetReview(sessionId: string) {
  const ui = useUI.getState();
  ui.resetLayout();
  const u = useUI.getState();
  u.setPaneContent(u.activePaneId, { kind: 'session', sessionId });
  u.setActiveSession(sessionId);
  u.splitPane(useUI.getState().activePaneId, 'horizontal', { kind: 'review', sessionId });
  if (!useUI.getState().explorerOpen) useUI.getState().toggleExplorer();
}

function presetChatTerminal(sessionId: string, a: WorkspaceActions) {
  const ui = useUI.getState();
  ui.resetLayout();
  const u = useUI.getState();
  u.setPaneContent(u.activePaneId, { kind: 'session', sessionId });
  u.setActiveSession(sessionId);
  const session = useSessions.getState().sessions[sessionId];
  const tab = a.openTerminalPane({ projectId: session?.projectId ?? null });
  const leaf = collectLeaves(useUI.getState().layout).find((l) => l.content.kind === 'terminal' && l.content.terminalId === tab.id);
  if (!leaf) useUI.getState().splitPane(useUI.getState().activePaneId, 'horizontal', { kind: 'terminal', terminalId: tab.id });
}

function presetTerminals(a: WorkspaceActions) {
  const ui = useUI.getState();
  ui.resetLayout();
  const p = a.currentProject();
  const first = a.openTerminalPane({ projectId: p?.id ?? null });
  const second = useTerminals.getState().createTab({ shellId: first.shellId, cwd: first.cwd, projectId: p?.id });
  const third = useTerminals.getState().createTab({ shellId: first.shellId, cwd: first.cwd, projectId: p?.id });
  const u = useUI.getState();
  u.splitPane(u.activePaneId, 'horizontal', { kind: 'terminal', terminalId: second.id });
  useUI.getState().splitPane(useUI.getState().activePaneId, 'vertical', { kind: 'terminal', terminalId: third.id });
}

import { useCallback, useMemo } from 'react';
import { useUI, collectLeaves } from '@/stores/ui';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useSettings, modelLabel, modelContext } from '@/stores/settings';
import { useBrowserMemory } from '@/stores/browser-memory';
import { useTerminals } from '@/stores/terminals';
import { useNotes, projectBoard } from '@/stores/notes';
import { useEnvironment } from '@/stores/environment';
import { pickFolder, gitSummary, pathExists, joinPath } from '@/native/system';
import { git } from '@/native/git';
import { toast } from '@/features/notifications/toast-store';
import { runtime } from '@/providers/runtime';
import { uid } from '@/lib/id';
import { basename } from '@/lib/format';
import { isTauri } from '@/lib/platform';
import type { PaneContent, TerminalTab } from '@/types/workspace';
import { AGENT_BINARY, AGENT_LABEL, agentPromptArgs, type AgentKind } from '@/features/agent/agents';
import { engineById } from '@/features/browser/engines';
import { queueDraft } from '@/features/agent/composer-drafts';
import { t } from '@/i18n';

/** Creation toasts are confirmations, not news — keep them brief. */
const CREATED_TOAST_MS = 2600;

/** What a Claude Code launch is made of; the dialog edits this, settings hold the defaults. */
export interface ClaudeLaunchArgs {
  /** '' = let Claude pick its own default. */
  model: string;
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  /** `--continue`: resume the folder's last conversation. */
  continueLast: boolean;
  /** Free-form extra arguments, shell-style (quotes allowed). */
  extraArgs: string;
  /** Initial prompt (positional argument): the TUI starts with it submitted. */
  prompt?: string;
}

export function claudeLaunchDefaults(c: { defaultModel: string; permissionMode: ClaudeLaunchArgs['permissionMode']; continueLast: boolean; extraArgs: string }): ClaudeLaunchArgs {
  return { model: c.defaultModel, permissionMode: c.permissionMode, continueLast: c.continueLast, extraArgs: c.extraArgs };
}

/** Split a shell-style argument string: whitespace separates, single/double quotes group. */
export function splitArgs(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** CLI arguments for a launch. Explicit flags come first; free-form extras last so they can override. */
export function claudeArgs(l: ClaudeLaunchArgs): string[] {
  const args: string[] = [];
  const extras = splitArgs(l.extraArgs);
  if (l.model && !extras.includes('--model')) args.push('--model', l.model);
  if (l.permissionMode !== 'default' && !extras.includes('--permission-mode')) args.push('--permission-mode', l.permissionMode);
  if (l.continueLast && !extras.includes('--continue') && !extras.includes('-c')) args.push('--continue');
  return [...args, ...extras, ...(l.prompt ? [l.prompt] : [])];
}

/** Path relative to the project, forward slashes — how `@` mentions are written. */
export function mentionPath(root: string, path: string): string {
  const norm = (x: string) => x.replace(/\\/g, '/').replace(/\/+$/, '');
  const r = norm(root);
  const f = norm(path);
  return f.toLowerCase().startsWith(r.toLowerCase() + '/') ? f.slice(r.length + 1) : f;
}

/**
 * High-level workspace actions shared by the title bar, sidebar, palette and
 * shortcuts. Everything the "+" menu can do lives here.
 */
export function useWorkspaceActions() {
  /* ------------------------------ panes ------------------------------ */

  const showInActivePane = useCallback((content: PaneContent) => {
    const ui = useUI.getState();
    const leaves = collectLeaves(ui.layout);
    const target = leaves.find((l) => l.id === ui.activePaneId) ?? leaves[0];
    ui.setPaneContent(target.id, content);
    ui.setActivePane(target.id);
  }, []);

  const splitActive = useCallback((direction: 'horizontal' | 'vertical', content?: PaneContent) => {
    const ui = useUI.getState();
    const leaves = collectLeaves(ui.layout);
    const active = leaves.find((l) => l.id === ui.activePaneId) ?? leaves[0];
    ui.splitPane(active.id, direction, content ?? active.content);
  }, []);

  const closeActivePane = useCallback(() => {
    const ui = useUI.getState();
    const leaves = collectLeaves(ui.layout);
    if (leaves.length <= 1) {
      ui.setActiveSession(null);
      ui.setPaneContent(leaves[0].id, { kind: 'empty' });
      return;
    }
    ui.closePane(ui.activePaneId);
  }, []);

  /* ----------------------------- projects ---------------------------- */

  const currentProject = useCallback(() => {
    const ui = useUI.getState();
    const session = ui.activeSessionId ? useSessions.getState().sessions[ui.activeSessionId] : undefined;
    const projects = useProjects.getState().projects;
    const leaves = collectLeaves(ui.layout);
    const active = leaves.find((l) => l.id === ui.activePaneId)?.content;
    const fromPane =
      active?.kind === 'terminal'
        ? useTerminals.getState().tabs.find((t) => t.id === active.terminalId)?.projectId
        : active?.kind === 'note'
          ? useNotes.getState().notes[active.noteId]?.projectId
          : active?.kind === 'file'
            ? active.projectId
            : undefined;
    return projects.find((p) => p.id === (session?.projectId ?? fromPane ?? ui.activeProjectId)) ?? projects[0];
  }, []);

  const addProjectPath = useCallback(async (path: string, name?: string) => {
    const p = useProjects.getState().addProject({ path, name });
    const g = await gitSummary(path);
    if (g) useProjects.getState().setGit(p.id, g);
    toast.success(t('Project added'), { description: p.name });
    return p;
  }, []);

  /** Pick a folder, then name and colour it in the "New project" dialog (which adds it). */
  const openProject = useCallback(async () => {
    const path = await pickFolder();
    if (!path) return undefined;
    const existing = useProjects.getState().projects.find((p) => p.path.toLowerCase() === path.toLowerCase());
    if (existing) {
      useUI.getState().setActiveProject(existing.id);
      toast.info(t('Already open'), { description: existing.name });
      return existing;
    }
    useUI.getState().setNewProject({ path });
    return undefined;
  }, []);

  const closeProject = useCallback((projectId: string) => {
    const sessions = useSessions.getState();
    for (const s of Object.values(sessions.sessions)) {
      if (s.projectId === projectId) void runtime.dispose(s.id);
    }
    useProjects.getState().removeProject(projectId);
    const ui = useUI.getState();
    const active = ui.activeSessionId ? sessions.sessions[ui.activeSessionId] : undefined;
    if (active?.projectId === projectId) ui.resetLayout();
  }, []);

  const cloneRepository = useCallback(
    async (url: string, parentDir: string) => {
      const name = basename(url.replace(/\.git$/, '').replace(/\/+$/, ''));
      const dest = `${parentDir.replace(/[\\/]+$/, '')}${parentDir.includes('\\') ? '\\' : '/'}${name}`;
      if (await pathExists(dest)) throw new Error(`${dest} already exists`);
      const id = toast.loading(`Cloning ${name}…`, { origin: null });
      try {
        await git.clone(url, dest);
        const p = await addProjectPath(dest, name);
        toast.update(id, { variant: 'success', title: t('Repository cloned'), description: dest, duration: 4200 });
        return p;
      } catch (e) {
        toast.update(id, { variant: 'error', title: t('Clone failed'), description: e instanceof Error ? e.message : String(e), duration: 8000 });
        throw e;
      }
    },
    [addProjectPath],
  );

  /* ----------------------------- sessions ---------------------------- */

  /**
   * Where files live for the current context: the active session's worktree when it has one,
   * else the project folder. The explorer and the git panel follow this.
   */
  const currentRoot = useCallback((): string | undefined => {
    const ui = useUI.getState();
    const session = ui.activeSessionId ? useSessions.getState().sessions[ui.activeSessionId] : undefined;
    if (session?.worktree) return session.worktree.path;
    return currentProject()?.path;
  }, [currentProject]);

  /**
   * A session on its own branch, in a git worktree beside the project folder
   * (`<parent>/<project>.worktrees/<branch>`) — agents can work in parallel without
   * stepping on each other. The branch is created from HEAD when it does not exist.
   */
  const newWorktreeSession = useCallback(
    async (projectId: string, input: string, baseArg?: string) => {
      const project = useProjects.getState().projects.find((p) => p.id === projectId);
      if (!project) return undefined;
      // "feature/x from main" / "feature/x desde origin/main": the base for a new branch (HEAD otherwise).
      const m = /^(.*?)\s+(?:from|desde)\s+(\S+)\s*$/i.exec(input.trim());
      const branch = (m ? m[1] : input).trim();
      const baseRef = baseArg ?? m?.[2];
      const safe = branch.replace(/[^\w./-]+/g, '-').replace(/\/+/g, '-');
      if (!safe) return undefined;
      const root = project.path.replace(/[\\/]+$/, '');
      const parent = root.slice(0, Math.max(root.lastIndexOf('\\'), root.lastIndexOf('/')));
      const dest = joinPath(parent, `${basename(root)}.worktrees/${safe}`);
      try {
        const existing = (await git.worktrees(project.path)).find((w) => w.path.replace(/\\/g, '/').toLowerCase() === dest.replace(/\\/g, '/').toLowerCase());
        if (!existing) await git.worktreeAdd(project.path, dest, branch, baseRef);
      } catch (e) {
        toast.error(t('Could not create the worktree'), { description: e instanceof Error ? e.message : String(e) });
        return undefined;
      }
      const s = useSessions.getState().createSession({ projectId, title: branch });
      useSessions.getState().updateSession(s.id, { worktree: { path: dest, branch } });
      useProjects.getState().toggleExpanded(projectId, true);
      useUI.getState().setActiveSession(s.id);
      showInActivePane({ kind: 'session', sessionId: s.id });
      toast.success(t('Worktree session'), { description: `${branch} · ${dest}`, mark: 'commit' });
      return s;
    },
    [showInActivePane],
  );

  const newSession = useCallback(
    (projectId?: string) => {
      const sessions = useSessions.getState();
      const settings = useSettings.getState();
      const pid = projectId ?? currentProject()?.id;
      if (!pid) {
        toast.info(t('Open a project first'), { description: t('Agent sessions live inside a project folder.') });
        return undefined;
      }
      const model = settings.claude.defaultModel;
      const contextMax = modelContext(model);
      const s = sessions.createSession({ projectId: pid, model, contextMax });
      useProjects.getState().toggleExpanded(pid, true);
      useUI.getState().setActiveSession(s.id);
      const project = useProjects.getState().projects.find((p) => p.id === pid);
      toast.success(t('New session'), { description: `${project?.name ?? 'Project'} · ${modelLabel(model)}`, duration: CREATED_TOAST_MS });
      return s;
    },
    [currentProject],
  );

  const openSession = useCallback((sessionId: string) => {
    useUI.getState().setActiveSession(sessionId);
    const s = useSessions.getState().sessions[sessionId];
    if (s) useProjects.getState().touch(s.projectId);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    void runtime.dispose(sessionId);
    const ui = useUI.getState();
    for (const l of collectLeaves(ui.layout)) {
      if (l.content.kind === 'session' && l.content.sessionId === sessionId) ui.setPaneContent(l.id, { kind: 'empty' });
    }
    if (ui.activeSessionId === sessionId) ui.setActiveSession(null);
    useSessions.getState().removeSession(sessionId);
  }, []);

  /* ----------------------------- terminals --------------------------- */

  /** `projectId: null` opens a terminal that belongs to no project (home directory, listed under the global Terminals section). */
  const createTerminalTab = useCallback(
    (opts: { shellId?: string; cwd?: string; projectId?: string | null; program?: TerminalTab['program']; title?: string } = {}) => {
      const env = useEnvironment.getState().report;
      const settings = useSettings.getState();
      const shells = env?.shells ?? [];
      const shellId = opts.shellId ?? settings.terminal.shellId ?? shells[0]?.id ?? 'pwsh';
      const project = opts.projectId === null ? undefined : opts.projectId ? useProjects.getState().projects.find((p) => p.id === opts.projectId) : currentProject();
      const cwd = opts.cwd ?? project?.path ?? '';
      const shell = shells.find((s) => s.id === shellId);
      const title = opts.title ?? (opts.program ? opts.program.label : (shell?.label ?? shellId));
      // Project terminals are listed inside their project — make sure it is unfolded so the new row is visible.
      if (project) useProjects.getState().toggleExpanded(project.id, true);
      return useTerminals.getState().createTab({ shellId, cwd, title, program: opts.program, projectId: project?.id });
    },
    [currentProject],
  );

  /** Terminal in the bottom drawer (Ctrl+`). */
  const openTerminal = useCallback(
    (opts: { split?: 'horizontal' | 'vertical'; shellId?: string; cwd?: string; projectId?: string | null } = {}) => {
      const tab = createTerminalTab(opts);
      const ui = useUI.getState();
      if (opts.split) splitActive(opts.split, { kind: 'terminal', terminalId: tab.id });
      else if (!ui.terminalPanelOpen) ui.toggleTerminalPanel();
      return tab;
    },
    [createTerminalTab, splitActive],
  );

  /** Terminal as a first-class pane (sidebar item). */
  const openTerminalPane = useCallback(
    (opts: { shellId?: string; cwd?: string; projectId?: string | null; program?: TerminalTab['program']; title?: string } = {}) => {
      const tab = createTerminalTab(opts);
      showInActivePane({ kind: 'terminal', terminalId: tab.id });
      if (!opts.program) {
        const project = tab.projectId ? useProjects.getState().projects.find((p) => p.id === tab.projectId) : undefined;
        toast.success(`${tab.title} opened`, { description: project ? `In ${project.name}` : 'Home directory', duration: CREATED_TOAST_MS });
      }
      return tab;
    },
    [createTerminalTab, showInActivePane],
  );

  const focusTerminal = useCallback(
    (terminalId: string) => {
      useTerminals.getState().setActive(terminalId);
      showInActivePane({ kind: 'terminal', terminalId });
    },
    [showInActivePane],
  );

  /**
   * Start Claude Code's TUI in a project with explicit launch arguments.
   * Called by the launch dialog, or directly with the settings defaults.
   */
  const launchClaude = useCallback(
    (projectId: string, launch: ClaudeLaunchArgs) => {
      const env = useEnvironment.getState().report;
      const settings = useSettings.getState();
      const project = useProjects.getState().projects.find((p) => p.id === projectId);
      if (!project) return undefined;
      if (isTauri && !env?.claude.found) {
        toast.error(t('Claude Code not found'), { description: t('Install it or set the binary path in Settings › Claude Code.') });
        return undefined;
      }
      const path = settings.claude.binaryPath && settings.claude.binaryPath !== 'claude' ? settings.claude.binaryPath : (env?.claude.path ?? 'claude');
      const args = claudeArgs(launch);
      const tab =
        project.runtime === 'wsl'
          ? openTerminalPane({
              projectId: project.id,
              cwd: project.path,
              program: { path: 'wsl.exe', args: ['-d', project.wslDistro ?? 'Ubuntu', '--cd', project.path, '--', 'claude', ...args], label: t('Claude Code'), agent: 'claude' },
            })
          : openTerminalPane({ projectId: project.id, cwd: project.path, program: { path, args, label: t('Claude Code'), agent: 'claude' } });
      toast.success(t('Claude Code started'), { description: args.length ? `${project.name} · ${args.join(' ')}` : project.name, duration: CREATED_TOAST_MS });
      return tab;
    },
    [openTerminalPane],
  );

  /** Other agent CLIs (Codex, Gemini CLI, OpenCode) as a terminal TUI in a project folder. */
  const openAgentTerminal = useCallback(
    async (agent: Exclude<AgentKind, 'claude'>, opts: { projectId?: string; folder?: string; args?: string[] } = {}) => {
      const env = useEnvironment.getState().report;
      const tool = env?.[agent];
      if (isTauri && !tool?.found) {
        toast.error(`${AGENT_LABEL[agent]} not found`, { description: `Install the \`${AGENT_BINARY[agent]}\` CLI and make sure it is on PATH.` });
        return undefined;
      }
      let project = opts.projectId ? useProjects.getState().projects.find((p) => p.id === opts.projectId) : undefined;
      if (!project && opts.folder) project = await addProjectPath(opts.folder);
      if (!project) {
        const folder = await pickFolder(`Open ${AGENT_LABEL[agent]} in folder`);
        if (!folder) return undefined;
        project = await addProjectPath(folder);
      }
      const path = tool?.path ?? AGENT_BINARY[agent];
      const args = opts.args ?? [];
      const tab =
        project.runtime === 'wsl'
          ? openTerminalPane({
              projectId: project.id,
              cwd: project.path,
              program: { path: 'wsl.exe', args: ['-d', project.wslDistro ?? 'Ubuntu', '--cd', project.path, '--', AGENT_BINARY[agent], ...args], label: AGENT_LABEL[agent], agent },
            })
          : openTerminalPane({ projectId: project.id, cwd: project.path, program: { path, args, label: AGENT_LABEL[agent], agent } });
      toast.success(`${AGENT_LABEL[agent]} started`, { description: project.name, duration: CREATED_TOAST_MS });
      return tab;
    },
    [addProjectPath, openTerminalPane],
  );

  /**
   * Bring a file to an agent, like the VS Code extension's "open in Claude": the chat
   * view starts with the @mention typed, the TUIs start with it as the first prompt.
   */
  const askAgentAboutFile = useCallback(
    (agent: 'claude-chat' | AgentKind, path: string, projectId?: string) => {
      const project = (projectId ? useProjects.getState().projects.find((p) => p.id === projectId) : undefined) ?? currentProject();
      if (!project) {
        toast.info(t('Open a project first'));
        return;
      }
      const rel = mentionPath(project.path, path);
      // Keep the file in view: make sure it is open in a pane, then split that pane so the
      // chat / terminal lands beside it instead of replacing it.
      const ui = useUI.getState();
      const norm = (x: string) => x.replace(/\\/g, '/').toLowerCase();
      const showing = collectLeaves(ui.layout).find((l) => l.content.kind === 'file' && norm(l.content.path) === norm(path));
      if (showing) ui.setActivePane(showing.id);
      else ui.setPaneContent(ui.activePaneId, { kind: 'file', path, projectId: project.id });
      const filePane = useUI.getState().activePaneId;
      useUI.getState().splitPane(filePane, 'horizontal', { kind: 'empty' });
      if (agent === 'claude-chat') {
        const s = newSession(project.id);
        if (s) queueDraft(s.id, `@${rel} `);
        return;
      }
      const prompt = `Look at @${rel} and wait for my instructions.`;
      if (agent === 'claude') {
        void launchClaude(project.id, { ...claudeLaunchDefaults(useSettings.getState().claude), prompt });
        return;
      }
      void openAgentTerminal(agent, { projectId: project.id, args: agentPromptArgs(agent, prompt) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProject],
  );

  /**
   * Claude Code's own interactive TUI, in a folder. Resolves the project (picking a
   * folder if needed), then either launches with the settings defaults or opens the
   * launch dialog (`ask`, or Settings › Claude Code › "Ask before launching").
   */
  const openClaudeTerminal = useCallback(
    async (opts: { projectId?: string; folder?: string; ask?: boolean } = {}) => {
      const settings = useSettings.getState();
      let project = opts.projectId ? useProjects.getState().projects.find((p) => p.id === opts.projectId) : undefined;
      if (!project && opts.folder) project = await addProjectPath(opts.folder);
      if (!project) {
        const folder = await pickFolder('Open Claude Code in folder');
        if (!folder) return undefined;
        project = await addProjectPath(folder);
      }
      if (opts.ask || settings.claude.askArgs) {
        useUI.getState().setClaudeLaunch({ projectId: project.id });
        return undefined;
      }
      return launchClaude(project.id, claudeLaunchDefaults(settings.claude));
    },
    [addProjectPath, launchClaude],
  );

  /* ------------------------------- notes ----------------------------- */

  /** `projectId: null` creates a note outside any project (global Notes section). */
  const newNote = useCallback(
    (input: { projectId?: string | null; title?: string; body?: string } = {}) => {
      const projectId = input.projectId === null ? undefined : (input.projectId ?? currentProject()?.id);
      if (projectId) useProjects.getState().toggleExpanded(projectId, true);
      const note = useNotes.getState().createNote({ title: input.title, body: input.body, projectId });
      showInActivePane({ kind: 'note', noteId: note.id });
      const project = projectId ? useProjects.getState().projects.find((p) => p.id === projectId) : undefined;
      toast.success(t('Note created'), { description: project ? `In ${project.name}` : 'Outside any project', duration: CREATED_TOAST_MS });
      return note;
    },
    [currentProject, showInActivePane],
  );

  const openNote = useCallback((noteId: string) => showInActivePane({ kind: 'note', noteId }), [showInActivePane]);

  /** A whiteboard note (cards + links on dotted paper). */
  const newBoard = useCallback(
    (input: { projectId?: string | null; title?: string } = {}) => {
      const projectId = input.projectId === null ? undefined : (input.projectId ?? currentProject()?.id);
      if (projectId) useProjects.getState().toggleExpanded(projectId, true);
      const note = useNotes.getState().createNote({ kind: 'board', title: input.title, projectId });
      showInActivePane({ kind: 'note', noteId: note.id });
      const project = projectId ? useProjects.getState().projects.find((p) => p.id === projectId) : undefined;
      toast.success(t('Board created'), { description: project ? `In ${project.name}` : 'Outside any project', duration: CREATED_TOAST_MS });
      return note;
    },
    [currentProject, showInActivePane],
  );

  /** The project's own board: what its agents, terminals, notes and files are up to, plus your cards. */
  const openProjectBoard = useCallback(
    (projectId: string) => {
      const board = projectBoard(projectId);
      useUI.getState().setActiveProject(projectId);
      showInActivePane({ kind: 'note', noteId: board.id });
      return board;
    },
    [showInActivePane],
  );

  const deleteNote = useCallback((noteId: string) => {
    const ui = useUI.getState();
    for (const l of collectLeaves(ui.layout)) {
      if (l.content.kind === 'note' && l.content.noteId === noteId) ui.setPaneContent(l.id, { kind: 'empty' });
    }
    useNotes.getState().removeNote(noteId);
  }, []);

  /* --------------------------- files / browser ----------------------- */

  const openFile = useCallback(
    (path: string, projectId?: string, mode: 'pane' | 'split' = 'pane') => {
      const content: PaneContent = { kind: 'file', path, projectId: projectId ?? currentProject()?.id };
      if (mode === 'split') splitActive('horizontal', content);
      else showInActivePane(content);
    },
    [currentProject, showInActivePane, splitActive],
  );

  const openBrowser = useCallback(
    (url?: string, mode: 'pane' | 'split' = 'pane', projectId?: string) => {
      const b = useSettings.getState().browser;
      const pid = projectId ?? currentProject()?.id;
      // No URL given: the project's last page, else the home page.
      url ??= (pid ? useBrowserMemory.getState().byProject[pid]?.url : undefined) || b.homepage.trim() || engineById(b.searchEngine).home;
      const content: PaneContent = { kind: 'browser', browserId: uid('web'), url, projectId: pid };
      if (mode === 'split') splitActive('horizontal', content);
      else showInActivePane(content);
      let host = url;
      try {
        host = new URL(url).hostname;
      } catch {
        /* keep raw */
      }
      toast.success(t('Browser opened'), { description: host, duration: CREATED_TOAST_MS });
    },
    [showInActivePane, splitActive, currentProject],
  );

  return useMemo(
    () => ({
      showInActivePane,
      splitActive,
      closeActivePane,
      currentProject,
      addProjectPath,
      openProject,
      closeProject,
      cloneRepository,
      newSession,
      newWorktreeSession,
      currentRoot,
      openSession,
      deleteSession,
      createTerminalTab,
      openTerminal,
      openTerminalPane,
      focusTerminal,
      openClaudeTerminal,
      launchClaude,
      openAgentTerminal,
      askAgentAboutFile,
      newNote,
      newBoard,
      openProjectBoard,
      openNote,
      deleteNote,
      openFile,
      openBrowser,
    }),
    [
      showInActivePane,
      splitActive,
      closeActivePane,
      currentProject,
      addProjectPath,
      openProject,
      closeProject,
      cloneRepository,
      newSession,
      newWorktreeSession,
      currentRoot,
      openSession,
      deleteSession,
      createTerminalTab,
      openTerminal,
      openTerminalPane,
      focusTerminal,
      openClaudeTerminal,
      launchClaude,
      openAgentTerminal,
      askAgentAboutFile,
      newNote,
      newBoard,
      openProjectBoard,
      openNote,
      deleteNote,
      openFile,
      openBrowser,
    ],
  );
}

export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;

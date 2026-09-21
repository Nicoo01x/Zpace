import type { McpToolDef } from '@/native/mcp';
import { ptyWrite } from '@/native/pty';
import { useProjects, folderOf } from '@/stores/projects';
import { useSessions, sessionsForProject } from '@/stores/sessions';
import { useTerminals } from '@/stores/terminals';
import { useNotes, noteTitle } from '@/stores/notes';
import { useSettings, type ThemeMode } from '@/stores/settings';
import { useUI, collectLeaves, type SettingsSection } from '@/stores/ui';
import { runtime } from '@/providers/runtime';
import { claudeLaunchDefaults } from '@/features/sessions/useWorkspaceActions';
import { workspaceActions } from '@/features/sessions/actions-ref';
import type { Project, ProjectFolder, Session, TerminalTab } from '@/types/workspace';
import { useVoice } from './store';

/**
 * What the voice assistant can do to the app: each tool is an MCP tool
 * definition (what Claude sees) and a handler that acts on the stores and
 * says in one line what it did. Names given by voice are matched loosely
 * (an id, or a case-insensitive part of the name); when several things
 * match, the tool answers with the candidates instead of guessing.
 */
export interface VoiceTool extends McpToolDef {
  run: (args: Record<string, unknown>) => Promise<string> | string;
}

const str = (args: Record<string, unknown>, key: string): string | undefined => {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

class Ambiguous extends Error {}

function pick<T>(list: T[], query: string | undefined, label: (x: T) => string, id: (x: T) => string, what: string): T | undefined {
  if (!query) return undefined;
  const q = query.toLowerCase();
  const byId = list.find((x) => id(x) === query);
  if (byId) return byId;
  const exact = list.filter((x) => label(x).toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const loose = list.filter((x) => label(x).toLowerCase().includes(q));
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) throw new Ambiguous(`Several ${what} match "${query}": ${loose.map((x) => `${label(x)} (${id(x)})`).join(', ')}. Ask which one.`);
  return undefined;
}

/** The project named, else the active one, else the only one. */
function project(args: Record<string, unknown>): Project {
  const projects = useProjects.getState().projects;
  const named = pick(projects, str(args, 'project'), (p) => p.name, (p) => p.id, 'projects');
  if (named) return named;
  if (str(args, 'project')) throw new Error(`No project called "${str(args, 'project')}". Projects: ${projects.map((p) => p.name).join(', ') || 'none'}.`);
  const active = useUI.getState().activeProjectId;
  const current = projects.find((p) => p.id === active) ?? (projects.length === 1 ? projects[0] : undefined);
  if (!current) throw new Error(projects.length ? `Which project? ${projects.map((p) => p.name).join(', ')}.` : 'No project is open. Open one with open_project.');
  return current;
}

function folder(p: Project, args: Record<string, unknown>): ProjectFolder | undefined {
  const name = str(args, 'folder');
  if (!name) return undefined;
  const f = pick(p.folders ?? [], name, (x) => x.name, (x) => x.id, 'folders');
  if (!f) throw new Error(`No folder called "${name}" in ${p.name}. Folders: ${(p.folders ?? []).map((x) => x.name).join(', ') || 'none'}.`);
  return f;
}

function terminal(args: Record<string, unknown>): TerminalTab {
  const tabs = useTerminals.getState().tabs;
  const label = (x: TerminalTab) => x.title;
  const t = pick(tabs, str(args, 'terminal'), label, (x) => x.id, 'terminals');
  if (t) return t;
  const active = useTerminals.getState().activeTabId;
  const cur = tabs.find((x) => x.id === active);
  if (!str(args, 'terminal') && cur) return cur;
  throw new Error(tabs.length ? `Which terminal? ${tabs.map((x) => `${x.title} (${x.id})`).join(', ')}.` : 'There is no terminal open.');
}

function session(args: Record<string, unknown>): Session {
  const all = Object.values(useSessions.getState().sessions).filter((s) => !s.hidden && !s.archived);
  const s = pick(all, str(args, 'session'), (x) => x.title, (x) => x.id, 'sessions');
  if (s) return s;
  const active = useUI.getState().activeSessionId;
  const cur = all.find((x) => x.id === active);
  if (!str(args, 'session') && cur) return cur;
  throw new Error(all.length ? `Which session? ${all.map((x) => `${x.title} (${x.id})`).join(', ')}.` : 'There is no session open.');
}

const where = (p: Project, f?: ProjectFolder) => (f ? `${p.name} / ${f.name}` : p.name);

/** What the tool did, for the overlay's list. */
const did = (line: string) => {
  useVoice.getState().addAct(line);
  return line;
};

const S = (description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', description, properties, required, additionalProperties: false });
const P = (description: string) => ({ type: 'string', description });

export const VOICE_TOOLS: VoiceTool[] = [
  {
    name: 'list_projects',
    description: 'The projects open in Zpace: id, name, path, sub-folders, and which one is active.',
    inputSchema: S('No arguments.'),
    run: () => {
      const { projects } = useProjects.getState();
      const active = useUI.getState().activeProjectId;
      if (!projects.length) return 'No projects are open.';
      return projects.map((p) => `${p.id} · ${p.name} · ${p.path}${p.id === active ? ' · active' : ''}${p.folders?.length ? ` · folders: ${p.folders.map((f) => `${f.name} (${f.id}${f.path ? `, ${f.path}` : ''})`).join(', ')}` : ''}`).join('\n');
    },
  },
  {
    name: 'list_workspace',
    description: "A project's sessions, terminals and notes with their ids, status and folder. Defaults to the active project.",
    inputSchema: S('Which project to list.', { project: P('Project name or id (optional).') }),
    run: (args) => {
      const p = project(args);
      const fname = (id?: string) => folderOf(p, id)?.name;
      const sessions = sessionsForProject(useSessions.getState().sessions, p.id).map((s) => `session ${s.id} · "${s.title}" · ${s.status}${fname(s.folderId) ? ` · in ${fname(s.folderId)}` : ''}`);
      const terminals = useTerminals.getState().tabs.filter((t) => t.projectId === p.id).map((t) => `terminal ${t.id} · "${t.title}"${t.program ? ` · running ${t.program.label}` : ''} · ${t.ptyId ? 'running' : 'not started'}${fname(t.folderId) ? ` · in ${fname(t.folderId)}` : ''}`);
      const notes = Object.values(useNotes.getState().notes).filter((n) => n.projectId === p.id).map((n) => `${n.kind === 'board' ? 'board' : 'note'} ${n.id} · "${noteTitle(n)}"${fname(n.folderId) ? ` · in ${fname(n.folderId)}` : ''}`);
      const lines = [...sessions, ...terminals, ...notes];
      return lines.length ? `${p.name}:\n${lines.join('\n')}` : `${p.name} has no sessions, terminals or notes yet.`;
    },
  },
  {
    name: 'open_project',
    description: 'Open a folder on disk as a project (or switch to it if it is already open) and make it the active project.',
    inputSchema: S('The folder to open.', { path: P('Absolute path of the folder.') }, ['path']),
    run: async (args) => {
      const path = str(args, 'path');
      if (!path) throw new Error('path is required.');
      const p = await workspaceActions().addProjectPath(path);
      if (!p) throw new Error(`Could not open ${path}.`);
      useUI.getState().setActiveProject(p.id);
      return did(`Opened project ${p.name}`);
    },
  },
  {
    name: 'focus_project',
    description: 'Make a project the active one (new things are created in it) and unfold it in the sidebar.',
    inputSchema: S('Which project.', { project: P('Project name or id.') }, ['project']),
    run: (args) => {
      const p = project(args);
      useUI.getState().setActiveProject(p.id);
      useProjects.getState().toggleExpanded(p.id, true);
      return did(`${p.name} is the active project`);
    },
  },
  {
    name: 'open_terminal',
    description: 'Open a new terminal in a project (in one of its sub-folders when given) and show it.',
    inputSchema: S('Where to open it.', { project: P('Project name or id (optional, defaults to the active one).'), folder: P('Sub-folder name (optional).'), shell: P('Shell id or name, e.g. pwsh, cmd, gitbash, wsl (optional).') }),
    run: (args) => {
      const p = project(args);
      const f = folder(p, args);
      const shell = str(args, 'shell');
      const tab = workspaceActions().openTerminalPane({ projectId: p.id, folderId: f?.id, shellId: shell });
      return did(`Opened ${tab.title} in ${where(p, f)}`);
    },
  },
  {
    name: 'run_claude_code',
    description: 'Start Claude Code (the interactive terminal UI) in a project or one of its sub-folders, with an optional first prompt.',
    inputSchema: S('Where and what.', { project: P('Project name or id (optional).'), folder: P('Sub-folder name (optional).'), prompt: P('What Claude Code should start working on (optional).') }),
    run: (args) => {
      const p = project(args);
      const f = folder(p, args);
      const launch = { ...claudeLaunchDefaults(useSettings.getState().claude), prompt: str(args, 'prompt') };
      const tab = workspaceActions().launchClaude(p.id, launch, f?.id);
      if (!tab) throw new Error('Claude Code could not start (is it installed?).');
      return did(`Started Claude Code in ${where(p, f)}${launch.prompt ? ` with: ${launch.prompt}` : ''}`);
    },
  },
  {
    name: 'new_chat_session',
    description: 'Create a structured Claude session (chat view) in a project and optionally send it a first message.',
    inputSchema: S('Where and what.', { project: P('Project name or id (optional).'), folder: P('Sub-folder name (optional).'), message: P('The first message to send (optional).') }),
    run: (args) => {
      const p = project(args);
      const f = folder(p, args);
      const s = workspaceActions().newSession(p.id, { folderId: f?.id });
      if (!s) throw new Error('Could not create the session.');
      const message = str(args, 'message');
      if (message) void runtime.send(s.id, message);
      return did(`New session in ${where(p, f)}${message ? `, asked: ${message}` : ''}`);
    },
  },
  {
    name: 'send_to_terminal',
    description: 'Type a line into a running terminal and press Enter (a shell command, or a message to the Claude Code running there).',
    inputSchema: S('Which terminal and what to type.', { terminal: P('Terminal title or id (optional, defaults to the active terminal).'), text: P('The line to type.') }, ['text']),
    run: async (args) => {
      const text = str(args, 'text');
      if (!text) throw new Error('text is required.');
      const tab = terminal(args);
      if (!tab.ptyId) {
        workspaceActions().focusTerminal(tab.id);
        throw new Error(`${tab.title} was not running; it is starting now — try again in a moment.`);
      }
      await ptyWrite(tab.ptyId, `${text}\r`);
      workspaceActions().focusTerminal(tab.id);
      return did(`Typed "${text}" into ${tab.title}`);
    },
  },
  {
    name: 'close_terminal',
    description: 'Close a terminal (kills its shell).',
    inputSchema: S('Which terminal.', { terminal: P('Terminal title or id.') }, ['terminal']),
    run: (args) => {
      const tab = terminal(args);
      const ui = useUI.getState();
      for (const l of collectLeaves(ui.layout)) if (l.content.kind === 'terminal' && l.content.terminalId === tab.id) ui.closePane(l.id);
      useTerminals.getState().closeTab(tab.id);
      return did(`Closed ${tab.title}`);
    },
  },
  {
    name: 'close_session',
    description: 'Close a chat session: stops it and archives it (it can be found again in the archive; nothing is deleted).',
    inputSchema: S('Which session.', { session: P('Session title or id.') }, ['session']),
    run: async (args) => {
      const s = session(args);
      await runtime.dispose(s.id).catch(() => void 0);
      const ui = useUI.getState();
      for (const l of collectLeaves(ui.layout)) if (l.content.kind === 'session' && l.content.sessionId === s.id) ui.closePane(l.id);
      if (ui.activeSessionId === s.id) ui.setActiveSession(null);
      useSessions.getState().updateSession(s.id, { archived: true });
      return did(`Closed "${s.title}"`);
    },
  },
  {
    name: 'show',
    description: 'Bring a session, terminal or note to the front (opens it in the active pane).',
    inputSchema: S('What to show.', { kind: { type: 'string', enum: ['session', 'terminal', 'note'], description: 'What kind of item.' }, item: P('Its title or id.') }, ['kind', 'item']),
    run: (args) => {
      const kind = str(args, 'kind');
      const a = workspaceActions();
      if (kind === 'session') {
        const s = session({ session: args.item });
        a.openSession(s.id);
        return did(`Showing "${s.title}"`);
      }
      if (kind === 'terminal') {
        const tab = terminal({ terminal: args.item });
        a.focusTerminal(tab.id);
        return did(`Showing ${tab.title}`);
      }
      const notes = Object.values(useNotes.getState().notes);
      const n = pick(notes, str(args, 'item'), noteTitle, (x) => x.id, 'notes');
      if (!n) throw new Error(`No note called "${str(args, 'item')}".`);
      a.openNote(n.id);
      return did(`Showing note "${noteTitle(n)}"`);
    },
  },
  {
    name: 'new_note',
    description: 'Create a note (or a board) in a project, with a title and optional Markdown body, and open it.',
    inputSchema: S('The note.', { project: P('Project name or id (optional).'), folder: P('Sub-folder name (optional).'), title: P('Title.'), body: P('Markdown body (optional).'), board: { type: 'boolean', description: 'true for a whiteboard instead of a text note.' } }, ['title']),
    run: (args) => {
      const p = project(args);
      const f = folder(p, args);
      const title = str(args, 'title') ?? '';
      const note = args.board === true ? workspaceActions().newBoard({ projectId: p.id, folderId: f?.id, title }) : workspaceActions().newNote({ projectId: p.id, folderId: f?.id, title, body: str(args, 'body') });
      return did(`Created ${note.kind === 'board' ? 'board' : 'note'} "${noteTitle(note)}" in ${where(p, f)}`);
    },
  },
  {
    name: 'new_folder',
    description: 'Create a sub-folder (a named group) inside a project in the sidebar.',
    inputSchema: S('The folder.', { project: P('Project name or id (optional).'), name: P('Folder name.') }, ['name']),
    run: (args) => {
      const p = project(args);
      const name = str(args, 'name');
      if (!name) throw new Error('name is required.');
      const f = useProjects.getState().addFolder(p.id, { name });
      if (!f) throw new Error('Could not create the folder.');
      return did(`Created folder ${name} in ${p.name}`);
    },
  },
  {
    name: 'move_to_folder',
    description: "Move a session, terminal or note into one of its project's sub-folders, or back to the project root.",
    inputSchema: S('What and where.', { kind: { type: 'string', enum: ['session', 'terminal', 'note'], description: 'What kind of item.' }, item: P('Its title or id.'), folder: P('Destination folder name, or "root" for the project itself.') }, ['kind', 'item', 'folder']),
    run: (args) => {
      const kind = str(args, 'kind');
      const dest = str(args, 'folder');
      let target: { kind: 'session' | 'terminal' | 'note'; id: string; projectId: string; label: string };
      if (kind === 'session') {
        const s = session({ session: args.item });
        target = { kind: 'session', id: s.id, projectId: s.projectId, label: s.title };
      } else if (kind === 'terminal') {
        const tab = terminal({ terminal: args.item });
        if (!tab.projectId) throw new Error(`${tab.title} belongs to no project.`);
        target = { kind: 'terminal', id: tab.id, projectId: tab.projectId, label: tab.title };
      } else {
        const n = pick(Object.values(useNotes.getState().notes), str(args, 'item'), noteTitle, (x) => x.id, 'notes');
        if (!n?.projectId) throw new Error(`No project note called "${str(args, 'item')}".`);
        target = { kind: 'note', id: n.id, projectId: n.projectId, label: noteTitle(n) };
      }
      const p = useProjects.getState().projects.find((x) => x.id === target.projectId);
      if (!p) throw new Error('The item belongs to a project that is not open.');
      const f = dest && dest.toLowerCase() !== 'root' ? folder(p, { folder: dest }) : undefined;
      workspaceActions().moveToFolder({ kind: target.kind, id: target.id }, f?.id);
      return did(`Moved "${target.label}" to ${where(p, f)}`);
    },
  },
  {
    name: 'set_theme',
    description: 'Switch the app between light, dark and system theme.',
    inputSchema: S('The theme.', { theme: { type: 'string', enum: ['light', 'dark', 'system'], description: 'light, dark or system.' } }, ['theme']),
    run: (args) => {
      const theme = str(args, 'theme') as ThemeMode | undefined;
      if (!theme || !['light', 'dark', 'system'].includes(theme)) throw new Error('theme must be light, dark or system.');
      useSettings.getState().patch({ theme });
      return did(`Theme: ${theme}`);
    },
  },
  {
    name: 'toggle_panel',
    description: 'Show or hide a panel: the sidebar, the file explorer, the terminal drawer or the git panel.',
    inputSchema: S('Which panel.', { panel: { type: 'string', enum: ['sidebar', 'explorer', 'terminal', 'git'], description: 'The panel.' }, open: { type: 'boolean', description: 'true to show, false to hide; omit to toggle.' } }, ['panel']),
    run: (args) => {
      const ui = useUI.getState();
      const panel = str(args, 'panel');
      const state: Record<string, [boolean, () => void]> = {
        sidebar: [ui.sidebarOpen, ui.toggleSidebar],
        explorer: [ui.explorerOpen, ui.toggleExplorer],
        terminal: [ui.terminalPanelOpen, ui.toggleTerminalPanel],
        git: [ui.gitPanelOpen, ui.toggleGitPanel],
      };
      const entry = panel ? state[panel] : undefined;
      if (!entry) throw new Error('panel must be sidebar, explorer, terminal or git.');
      const [isOpen, toggle] = entry;
      const want = typeof args.open === 'boolean' ? args.open : !isOpen;
      if (want !== isOpen) toggle();
      return did(`${panel} ${want ? 'shown' : 'hidden'}`);
    },
  },
  {
    name: 'open_settings',
    description: 'Open the settings dialog, at a section when given.',
    inputSchema: S('Which section.', { section: { type: 'string', enum: ['general', 'appearance', 'agents', 'claude', 'terminal', 'git', 'browser', 'mascot', 'notifications', 'island', 'voice', 'automations', 'mcp', 'keyboard', 'advanced', 'plugins', 'about'], description: 'The section (optional).' } }),
    run: (args) => {
      useUI.getState().openSettings(str(args, 'section') as SettingsSection | undefined);
      return did('Opened settings');
    },
  },
];

/** The MCP definitions alone (what the server lists). */
export const voiceToolDefs = (): McpToolDef[] => VOICE_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

/** Run one call; errors become a text the model can act on (ask, retry) rather than a crash. */
export async function runVoiceTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> {
  const tool = VOICE_TOOLS.find((x) => x.name === name);
  if (!tool) return { text: `Unknown tool ${name}.`, isError: true };
  try {
    return { text: await tool.run(args ?? {}) };
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), isError: !(e instanceof Ambiguous) };
  }
}

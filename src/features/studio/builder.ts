import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useSettings, modelContext } from '@/stores/settings';
import { useStudio } from '@/stores/studio';
import { useCapabilities } from '@/stores/capabilities';
import { runtime } from '@/providers/runtime';
import { insertIntoComposer } from '@/features/agent/composer-drafts';
import type { ResolvedScope } from './scope';

/**
 * The Studio's sessions. The builder is a Claude Code session that works in
 * the scope's folder with a system prompt that says what the Studio is and
 * where every kind of file goes, so "make me a skill for X" lands as
 * `skills/x/SKILL.md`. Testing a subagent is another session started with
 * `--agent <name>`. Both are hidden from the sidebar; the Studio is their
 * only surface. When either finishes a turn, the catalogs re-read the disk.
 */
const SETTLED = new Set(['idle', 'completed', 'error']);

/** For the model, in English; the answer follows the user's language. */
export function builderPrompt(scope: ResolvedScope): string {
  const root = scope.root;
  const where = scope.kind === 'user' ? `the user's own Claude Code setup in ${root}` : `the Claude Code setup of the project "${scope.label}" (${scope.base}), in ${root}`;
  return [
    `You are the builder in Zpace's Studio: the user is shaping ${where}. Your job is to write and refine the files that make up their Claude — directly on disk, in Claude Code's own formats — and to explain briefly what you did.`,
    'Where things go:',
    `- Skills: ${root}/skills/<name>/SKILL.md — frontmatter with \`name\` (lower-case, dashes), \`description\` (when to use it: this is what triggers it), optional \`argument-hint\`, \`user-invocable: false\` for model-only skills; then the instructions in Markdown. Supporting material goes in references/ and scripts/ inside the folder.`,
    `- Subagents: ${root}/agents/<name>.md — frontmatter \`name\`, \`description\` (when Claude should delegate; "use proactively" makes it reach for it on its own), optional \`tools\` (comma-separated), \`model\` (sonnet | opus | haiku), \`permissionMode\`; then the system prompt.`,
    `- Slash commands: ${root}/commands/<name>.md — optional frontmatter \`description\`, \`argument-hint\`; the body is the prompt, \`$ARGUMENTS\` stands for what the user types after the command.`,
    `- Memory: ${scope.memory.map((m) => m.path).join(', ')} — instructions Claude Code reads at the start of every session in this scope. Keep it short and specific.`,
    `- Hooks: the \`hooks\` key of ${scope.settings} — { "<Event>": [ { "matcher": "<tool pattern>", "hooks": [ { "type": "command", "command": "…", "timeout": 60 } ] } ] }. Events: PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact. Keep every other key of the file as it is.`,
    scope.kind === 'user' ? '- MCP servers: the `mcpServers` key of ~/.claude.json (keep everything else in that file untouched), or `claude mcp add`.' : `- MCP servers: ${scope.base}/.mcp.json under \`mcpServers\`.`,
    'How to work: write the file first, then say what you made in two or three lines with the path. Ask one short question only when the request could mean materially different things. Good skills and agents are specific about when they apply and what they must never do; prefer examples over adjectives. When asked to improve something, read it first and keep what works.',
    'Answer in the language the user writes in.',
  ].join('\n');
}

let watching = false;

/** Re-read the Studio's catalogs when one of its sessions ends a turn (it probably wrote files). */
function ensureWatcher() {
  if (watching) return;
  watching = true;
  useSessions.subscribe((state, prev) => {
    const studio = useStudio.getState();
    const ids = new Set([...Object.values(studio.builders), ...Object.values(studio.testing).map((x) => x.sessionId)]);
    for (const id of ids) {
      const was = prev.sessions[id]?.status;
      const now = state.sessions[id]?.status;
      if (was && now && was !== now && !SETTLED.has(was) && SETTLED.has(now)) {
        const projectPath = useProjects.getState().projects.find((p) => p.id === state.sessions[id]?.projectId)?.path;
        void useCapabilities.getState().loadAssets(projectPath, true);
        studio.bump();
      }
    }
  });
}

/** The builder session of a scope: the remembered one, or a fresh hidden session; its prompt is refreshed every time. */
export function ensureBuilder(scope: ResolvedScope): string {
  ensureWatcher();
  const S = useSessions.getState();
  const studio = useStudio.getState();
  const model = useSettings.getState().claude.defaultModel || 'opus';
  const options = { appendSystemPrompt: builderPrompt(scope), ...(scope.kind === 'user' ? { cwd: scope.root } : {}) };
  const existing = studio.builders[scope.key];
  if (existing && S.sessions[existing]) {
    S.updateSession(existing, { options: { ...S.sessions[existing].options, ...options } });
    return existing;
  }
  const s = S.createSession({ projectId: scope.project?.id ?? 'studio', title: 'Studio', model, contextMax: modelContext(model), hidden: true });
  S.updateSession(s.id, { options });
  studio.setBuilder(scope.key, s.id);
  return s.id;
}

/** A fresh builder for the scope; the old conversation is dropped. */
export async function resetBuilder(scope: ResolvedScope): Promise<string> {
  const studio = useStudio.getState();
  const old = studio.builders[scope.key];
  if (old) {
    await runtime.dispose(old).catch(() => undefined);
    useSessions.getState().removeSession(old);
    studio.setBuilder(scope.key, '');
  }
  return ensureBuilder(scope);
}

/** Talk to a subagent as the session itself (`claude --agent <name>`), in the scope's folder so Claude Code finds it. */
export async function startTest(scope: ResolvedScope, agent: string): Promise<string> {
  ensureWatcher();
  const studio = useStudio.getState();
  const S = useSessions.getState();
  const old = studio.testing[scope.key];
  if (old) {
    await runtime.dispose(old.sessionId).catch(() => undefined);
    S.removeSession(old.sessionId);
  }
  const model = useSettings.getState().claude.defaultModel || 'opus';
  const s = S.createSession({ projectId: scope.project?.id ?? 'studio', title: agent, model, contextMax: modelContext(model), hidden: true });
  S.updateSession(s.id, { options: { agent, ...(scope.kind === 'user' ? { cwd: scope.root } : {}) } });
  studio.setTesting(scope.key, { sessionId: s.id, agent });
  studio.setChatOpen(true);
  return s.id;
}

export async function stopTest(scope: ResolvedScope): Promise<void> {
  const studio = useStudio.getState();
  const cur = studio.testing[scope.key];
  if (!cur) return;
  await runtime.dispose(cur.sessionId).catch(() => undefined);
  useSessions.getState().removeSession(cur.sessionId);
  studio.setTesting(scope.key, null);
}

/** Put a request in the builder's composer (the user sends it) and make sure the chat is showing. */
export function askBuilder(scope: ResolvedScope, text: string): void {
  const studio = useStudio.getState();
  if (studio.testing[scope.key]) void stopTest(scope);
  const id = ensureBuilder(scope);
  studio.setChatOpen(true);
  insertIntoComposer(id, text);
}

import { useAgents, mentionsIn, handleOf, lines, type AgentFile, type CustomAgent, type Room, type RoomMessage } from '@/stores/agents';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useUI, collectLeaves } from '@/stores/ui';
import { useCapabilities, type AssetInfo } from '@/stores/capabilities';
import { modelContext } from '@/stores/settings';
import { runtime } from '@/providers/runtime';
import { loadMcpEntries } from '@/features/mcp/mcp-config';
import { appDataDir, copyFile } from '@/native/system';
import type { SessionOptions } from '@/types/workspace';
import { t } from '@/i18n';

/**
 * How a custom agent runs: as a Claude Code session whose system prompt
 * carries its persona, with only its MCP servers loaded. Alone, that is its
 * chat. In a room, every agent has a hidden session of its own; a message
 * goes to whoever is @mentioned (or to everyone), each one hears what the
 * others said since its last turn, and a reply that mentions another agent
 * is passed on — two hops at most, so a conversation between agents cannot
 * run away on its own.
 */
const MAX_HOPS = 2;
/** A turn is over when the session is one of these (a finished turn reads `completed`, not `idle`). */
const SETTLED = new Set(['idle', 'completed', 'error']);

function firstLine(s: string): string {
  return s.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

/** The persona, for the system prompt. In English: it is for the model; the reply follows the user's language. */
export function personaPrompt(agent: CustomAgent, skills: AssetInfo[], room?: { room: Room; others: CustomAgent[] }): string {
  const out: string[] = [];
  out.push(`You are "${agent.name}", a custom agent in Zpace.`);
  if (agent.instructions.trim()) out.push(agent.instructions.trim());
  const rules = lines(agent.rules);
  if (rules.length) {
    out.push('Rules you must always follow:');
    for (const r of rules) out.push(`- ${r}`);
  }
  if (agent.knowledge.trim()) out.push('Background you know by heart:', agent.knowledge.trim());
  if (agent.links.length) {
    out.push('References you know about (fetch them when it helps and you can):');
    for (const l of agent.links) out.push(`- ${l}`);
  }
  if (agent.files.length) {
    const dir = agent.files[0].path.replace(/[\\/][^\\/]*$/, '');
    out.push(`Your library — files in ${dir} (open them with your file tools when they matter; images can be viewed):`);
    for (const f of agent.files) out.push(`- ${f.name}${f.kind === 'image' ? ' (image)' : ''}`);
  }
  const mine = skills.filter((s) => agent.skills.includes(s.invoke));
  if (mine.length) {
    out.push('Skills to reach for when they apply (invoke them by name):');
    for (const s of mine) out.push(`- ${s.invoke}${s.description ? ` — ${s.description}` : ''}`);
  }
  if (room) {
    out.push(`You are in the room "${room.room.name}" with the user${room.others.length ? ' and these other agents:' : '.'}`);
    for (const o of room.others) out.push(`- ${o.name} (${handleOf(o)})${o.instructions.trim() ? ` — ${firstLine(o.instructions)}` : ''}`);
    out.push(`Messages from other participants arrive quoted with their names. Speak only as ${agent.name}; never answer for the others. Keep it focused. If you truly need another agent, address it by its handle (e.g. ${room.others[0] ? handleOf(room.others[0]) : '@name'}) — only then.`);
  }
  out.push('Answer in the language the user writes in.');
  return out.join('\n');
}

/** The session options a custom agent runs with (its persona, its servers, its permission mode). */
export async function agentOptions(agent: CustomAgent, projectPath: string | undefined, room?: { room: Room; others: CustomAgent[] }): Promise<SessionOptions> {
  const assets = await useCapabilities.getState().loadAssets(projectPath);
  const opts: SessionOptions = { appendSystemPrompt: personaPrompt(agent, assets.skills, room) };
  if (agent.permissionMode) opts.permissionMode = agent.permissionMode;
  if (agent.effort) opts.effort = agent.effort;
  const allowed = lines(agent.allowedTools);
  const blocked = lines(agent.disallowedTools);
  if (allowed.length) opts.allowedTools = allowed;
  if (blocked.length) opts.disallowedTools = blocked;
  // Its library folder is reachable for its file tools.
  if (agent.files.length) opts.addDirs = [agent.files[0].path.replace(/[\\/][^\\/]*$/, '')];
  if (agent.mcp.length) {
    const entries = await loadMcpEntries(projectPath);
    const picked: Record<string, unknown> = {};
    for (const e of entries) if (agent.mcp.includes(e.name)) picked[e.name] = e.config;
    opts.mcpServers = picked;
  }
  return opts;
}

/* ------------------------------- library ------------------------------- */

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const TEXT = /\.(md|txt|json|ya?ml|csv|toml|xml|html?|css|[jt]sx?|py|rs|go|java|rb|sh|ps1)$/i;

/** Where an agent keeps its files: `<app data>/agents/<id>/`. */
export async function agentDir(agentId: string): Promise<string> {
  return `${await appDataDir()}\\agents\\${agentId}`;
}

/** Copy files into the agent's folder; a name that is already there gets a suffix. Returns the entries to add. */
export async function importAgentFiles(agentId: string, paths: string[]): Promise<AgentFile[]> {
  const dir = await agentDir(agentId);
  const existing = new Set((useAgents.getState().agents[agentId]?.files ?? []).map((f) => f.name.toLowerCase()));
  const out: AgentFile[] = [];
  for (const src of paths) {
    const base = src.split(/[\\/]/).pop() ?? 'file';
    let name = base;
    for (let i = 2; existing.has(name.toLowerCase()); i++) name = base.replace(/(\.[^.]*)?$/, ` ${i}$1`);
    existing.add(name.toLowerCase());
    const target = `${dir}\\${name}`;
    const size = await copyFile(src, target);
    out.push({ name, path: target, kind: IMAGE.test(name) ? 'image' : TEXT.test(name) ? 'text' : 'file', size, addedAt: Date.now() });
  }
  return out;
}

/* ------------------------------ solo chat ------------------------------ */

/** The agent's own chat in a project: the existing one, or a fresh session speaking as it. */
export async function chatWithAgent(agentId: string, projectId?: string): Promise<string | undefined> {
  const agent = useAgents.getState().agents[agentId];
  if (!agent) return undefined;
  const pid = projectId ?? useUI.getState().activeProjectId ?? useProjects.getState().projects[0]?.id;
  if (!pid) return undefined;
  const project = useProjects.getState().projects.find((p) => p.id === pid);
  const S = useSessions.getState();
  const existing = Object.values(S.sessions).find((s) => s.agentId === agentId && s.projectId === pid && !s.hidden && !s.archived);
  const options = await agentOptions(agent, project?.path);
  let id: string;
  if (existing) {
    S.updateSession(existing.id, { options: { ...existing.options, ...options }, model: agent.model });
    id = existing.id;
  } else {
    const s = S.createSession({ projectId: pid, title: agent.name, model: agent.model, contextMax: modelContext(agent.model) });
    S.updateSession(s.id, { agentId, options });
    id = s.id;
  }
  useProjects.getState().toggleExpanded(pid, true);
  useUI.getState().setActiveSession(id);
  return id;
}

/* -------------------------------- rooms -------------------------------- */

export function openRoom(roomId: string) {
  const ui = useUI.getState();
  const leaves = collectLeaves(ui.layout);
  const already = leaves.find((l) => l.content.kind === 'room' && l.content.roomId === roomId);
  if (already) {
    ui.setActivePane(already.id);
    return;
  }
  const target = leaves.find((l) => l.id === ui.activePaneId) ?? leaves[0];
  ui.setPaneContent(target.id, { kind: 'room', roomId });
  ui.setActivePane(target.id);
}

export async function removeRoom(roomId: string) {
  const room = useAgents.getState().rooms[roomId];
  if (!room) return;
  const ui = useUI.getState();
  for (const l of collectLeaves(ui.layout)) if (l.content.kind === 'room' && l.content.roomId === roomId) ui.setPaneContent(l.id, { kind: 'empty' });
  for (const sid of Object.values(room.sessions)) {
    pending.delete(sid);
    await runtime.dispose(sid).catch(() => undefined);
    useSessions.getState().removeSession(sid);
  }
  useAgents.getState().removeRoom(roomId);
}

function roomAgents(room: Room): CustomAgent[] {
  const all = useAgents.getState().agents;
  return room.agentIds.map((id) => all[id]).filter((a): a is CustomAgent => !!a);
}

export function nameOf(from: string): string {
  if (from === 'user') return t('You');
  return useAgents.getState().agents[from]?.name ?? t('Agent');
}

/** The hidden session an agent speaks through in a room — created on first use, its persona refreshed every time. */
async function ensureAgentSession(room: Room, agent: CustomAgent): Promise<string> {
  const project = useProjects.getState().projects.find((p) => p.id === room.projectId);
  const others = roomAgents(room).filter((a) => a.id !== agent.id);
  const options = await agentOptions(agent, project?.path, { room, others });
  const S = useSessions.getState();
  const existing = room.sessions[agent.id];
  if (existing && S.sessions[existing]) {
    S.updateSession(existing, { options: { ...S.sessions[existing].options, ...options }, model: agent.model });
    return existing;
  }
  const s = S.createSession({ projectId: room.projectId, title: `${agent.name} · ${room.name}`, model: agent.model, contextMax: modelContext(agent.model), hidden: true });
  S.updateSession(s.id, { agentId: agent.id, options });
  const fresh = useAgents.getState().rooms[room.id];
  useAgents.getState().updateRoom(room.id, { sessions: { ...(fresh?.sessions ?? room.sessions), [agent.id]: s.id } });
  return s.id;
}

interface Pending {
  roomId: string;
  agentId: string;
  sentAt: number;
  hop: number;
}
const pending = new Map<string, Pending>();
let watching = false;
/** One turn at a time per agent: a message that arrives while it works waits for the turn to end. */
const chains = new Map<string, Promise<void>>();

function waitIdle(sessionId: string): Promise<void> {
  const idle = (st?: string) => !st || SETTLED.has(st);
  if (idle(useSessions.getState().sessions[sessionId]?.status)) return Promise.resolve();
  return new Promise((resolve) => {
    const off = useSessions.subscribe((state) => {
      if (idle(state.sessions[sessionId]?.status)) {
        off();
        resolve();
      }
    });
  });
}

/** Watches the agents' sessions: when a turn ends, its last message becomes the agent's line in the room. */
function ensureWatcher() {
  if (watching) return;
  watching = true;
  useSessions.subscribe((state, prev) => {
    for (const [sid, p] of [...pending]) {
      const s = state.sessions[sid];
      if (!s) {
        pending.delete(sid);
        continue;
      }
      const was = prev.sessions[sid]?.status;
      if (was === s.status) continue;
      if (!SETTLED.has(s.status)) continue;
      pending.delete(sid);
      const events = state.events[sid] ?? [];
      let text = '';
      let error: string | undefined;
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.timestamp < p.sentAt) break;
        if (e.type === 'assistant_message' && 'text' in e && String(e.text).trim()) {
          text = String(e.text).trim();
          break;
        }
        if (!error && e.type === 'error' && 'message' in e) error = String(e.message);
      }
      if (!text && !error) error = s.status === 'error' ? t('The agent stopped with an error.') : t('No reply.');
      const room = useAgents.getState().rooms[p.roomId];
      if (!room) continue;
      const agents = roomAgents(room);
      const to = text ? mentionsIn(text, agents).filter((a) => a.id !== p.agentId) : [];
      const msg = useAgents.getState().appendMessage(p.roomId, { from: p.agentId, to: to.map((a) => a.id), text, error });
      // Passed on to whoever it called — a couple of hops, no further.
      if (text && p.hop < MAX_HOPS) for (const a of to) void dispatch(p.roomId, a, msg, p.hop + 1);
    }
  });
}

async function dispatch(roomId: string, agent: CustomAgent, msg: RoomMessage, hop: number) {
  const room = useAgents.getState().rooms[roomId];
  if (!room) return;
  let sessionId: string;
  try {
    sessionId = await ensureAgentSession(room, agent);
  } catch (e) {
    useAgents.getState().appendMessage(roomId, { from: agent.id, to: [], text: '', error: String(e) });
    return;
  }
  const now = useAgents.getState().rooms[roomId];
  if (!now) return;
  const heard = now.heard[agent.id] ?? 0;
  const unheard = now.messages.slice(heard).filter((m) => m.from !== agent.id && m.id !== msg.id && (m.text || m.error));
  useAgents.getState().updateRoom(roomId, { heard: { ...now.heard, [agent.id]: now.messages.length } });
  const line = (m: RoomMessage) => `${nameOf(m.from)}${m.to.length && !m.to.includes(agent.id) ? ` (${t('to')} ${m.to.map((id) => nameOf(id)).join(', ')})` : ''}: ${m.text || `[${m.error}]`}`;
  const parts: string[] = [];
  if (unheard.length) parts.push(`[${t('Meanwhile, in the room')}]\n${unheard.map(line).join('\n\n')}`);
  parts.push(line(msg));
  const text = parts.join('\n\n');
  const turn = (chains.get(sessionId) ?? Promise.resolve()).then(async () => {
    await waitIdle(sessionId);
    pending.set(sessionId, { roomId, agentId: agent.id, sentAt: Date.now(), hop });
    ensureWatcher();
    try {
      await runtime.send(sessionId, text);
    } catch (e) {
      pending.delete(sessionId);
      useAgents.getState().appendMessage(roomId, { from: agent.id, to: [], text: '', error: String(e) });
    }
    // The turn is over when the session settles again; the watcher has posted the reply by then.
    await waitIdle(sessionId);
  });
  chains.set(sessionId, turn);
  await turn;
}

/** The user speaks: to whoever is mentioned, else to everyone in the room. */
export function sendToRoom(roomId: string, text: string) {
  const room = useAgents.getState().rooms[roomId];
  const body = text.trim();
  if (!room || !body) return;
  const agents = roomAgents(room);
  const mentioned = mentionsIn(body, agents);
  const targets = mentioned.length ? mentioned : agents;
  const msg = useAgents.getState().appendMessage(roomId, { from: 'user', to: mentioned.map((a) => a.id), text: body });
  for (const a of targets) void dispatch(roomId, a, msg, 0);
}

/** Stop an agent's current turn in a room. */
export async function stopAgent(roomId: string, agentId: string) {
  const room = useAgents.getState().rooms[roomId];
  const sid = room?.sessions[agentId];
  if (!sid) return;
  await runtime.cancel(sid).catch(() => undefined);
}

/** Whether an agent is working in a room right now. */
export function isAgentBusy(room: Room, agentId: string): boolean {
  const sid = room.sessions[agentId];
  const s = sid ? useSessions.getState().sessions[sid] : undefined;
  return !!s && (s.status === 'running' || s.status === 'waiting');
}

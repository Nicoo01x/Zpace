import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableStorage } from '@/lib/durable-storage';
import { uid } from '@/lib/id';

/**
 * Custom agents and the rooms they meet in.
 *
 * An agent is a persona on top of Claude Code: a little creature of its own
 * (a shape, a colour, a face), the model, what it is for (instructions),
 * the rules it must follow, a library of its own — photos, documents, notes,
 * links — and what it carries: the skills it should reach for, the MCP
 * servers it may load, the tools it is allowed. It has its own chat, and it
 * can sit in a room with other agents, where a message goes to whoever is
 * @mentioned — or to everyone.
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AgentFile {
  /** File name inside the agent's folder. */
  name: string;
  /** Absolute path of the copy in the agent's folder. */
  path: string;
  kind: 'image' | 'text' | 'file';
  size?: number;
  addedAt: number;
}

export interface CustomAgent {
  id: string;
  name: string;
  /** The creature: a mascot shape id (cercle, galet, squircle, capsule, triangle, hexagone, nuage, goutte). */
  shape: string;
  /** Body colour, hex. */
  color: string;
  /** Resting expression id (neutre, heureux, curieux, fier…). */
  expression: string;
  model: string;
  /** What it is and how it should work — becomes part of its system prompt. */
  instructions: string;
  /** Hard rules, one per line ("never ship without tests", "8px grid only"). */
  rules: string;
  /** Background it should know — a brand guide, a glossary, the team's conventions. */
  knowledge: string;
  /** Links it should know about (docs, Figma, tickets). */
  links: string[];
  /** Its library: copies of photos and documents, in its own folder. */
  files: AgentFile[];
  /** Skill invocations (`/name`, `/plugin:skill`) it should use when they apply. */
  skills: string[];
  /** MCP server names it may use (nothing else is loaded). */
  mcp: string[];
  /** Tool patterns it may use without asking / never (Claude Code's --allowedTools / --disallowedTools), one per line. */
  allowedTools: string;
  disallowedTools: string;
  effort?: Effort;
  permissionMode?: PermissionMode;
  /** Set when a plugin created it; uninstalling the plugin removes it. */
  pluginId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RoomMessage {
  id: string;
  at: number;
  /** 'user' or an agent id. */
  from: string;
  /** Who it was addressed to (agent ids); empty = everyone. */
  to: string[];
  text: string;
  /** An agent's turn that did not finish. */
  error?: string;
}

export interface Room {
  id: string;
  projectId: string;
  name: string;
  agentIds: string[];
  /** The hidden session each agent speaks through, per agent. */
  sessions: Record<string, string>;
  /** How far into `messages` each agent has been shown (what it has "heard"). */
  heard: Record<string, number>;
  messages: RoomMessage[];
  createdAt: number;
  updatedAt: number;
}

export type AgentDraft = Omit<CustomAgent, 'id' | 'createdAt' | 'updatedAt'>;

interface AgentsState {
  agents: Record<string, CustomAgent>;
  rooms: Record<string, Room>;
  addAgent: (a: AgentDraft) => CustomAgent;
  updateAgent: (id: string, patch: Partial<CustomAgent>) => void;
  removeAgent: (id: string) => void;
  addRoom: (r: Omit<Room, 'id' | 'sessions' | 'heard' | 'messages' | 'createdAt' | 'updatedAt'>) => Room;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  removeRoom: (id: string) => void;
  appendMessage: (roomId: string, m: Omit<RoomMessage, 'id' | 'at'>) => RoomMessage;
  patchMessage: (roomId: string, messageId: string, patch: Partial<RoomMessage>) => void;
}

/** A blank agent — the editor starts from this. */
export const EMPTY_AGENT: AgentDraft = { name: '', shape: 'nuage', color: '#3b93f0', expression: 'heureux', model: 'opus', instructions: '', rules: '', knowledge: '', links: [], files: [], skills: [], mcp: [], allowedTools: '', disallowedTools: '' };

export const useAgents = create<AgentsState>()(
  persist(
    (set) => ({
      agents: {},
      rooms: {},
      addAgent: (a) => {
        const now = Date.now();
        const agent: CustomAgent = { ...EMPTY_AGENT, ...a, id: uid('agt'), createdAt: now, updatedAt: now };
        set((s) => ({ agents: { ...s.agents, [agent.id]: agent } }));
        return agent;
      },
      updateAgent: (id, patch) => set((s) => (s.agents[id] ? { agents: { ...s.agents, [id]: { ...s.agents[id], ...patch, updatedAt: Date.now() } } } : s)),
      removeAgent: (id) =>
        set((s) => {
          const agents = { ...s.agents };
          delete agents[id];
          // Rooms keep going without it.
          const rooms = Object.fromEntries(Object.entries(s.rooms).map(([rid, r]) => [rid, r.agentIds.includes(id) ? { ...r, agentIds: r.agentIds.filter((x) => x !== id) } : r]));
          return { agents, rooms };
        }),
      addRoom: (r) => {
        const now = Date.now();
        const room: Room = { ...r, id: uid('room'), sessions: {}, heard: {}, messages: [], createdAt: now, updatedAt: now };
        set((s) => ({ rooms: { ...s.rooms, [room.id]: room } }));
        return room;
      },
      updateRoom: (id, patch) => set((s) => (s.rooms[id] ? { rooms: { ...s.rooms, [id]: { ...s.rooms[id], ...patch, updatedAt: Date.now() } } } : s)),
      removeRoom: (id) =>
        set((s) => {
          const rooms = { ...s.rooms };
          delete rooms[id];
          return { rooms };
        }),
      appendMessage: (roomId, m) => {
        const msg: RoomMessage = { ...m, id: uid('rm'), at: Date.now() };
        set((s) => {
          const r = s.rooms[roomId];
          if (!r) return s;
          return { rooms: { ...s.rooms, [roomId]: { ...r, messages: [...r.messages, msg], updatedAt: msg.at } } };
        });
        return msg;
      },
      patchMessage: (roomId, messageId, patch) =>
        set((s) => {
          const r = s.rooms[roomId];
          if (!r) return s;
          return { rooms: { ...s.rooms, [roomId]: { ...r, messages: r.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) } } };
        }),
    }),
    {
      name: 'conduit.agents',
      version: 2,
      storage: durableStorage(),
      // v1 agents wore an emoji; every field that came later gets its blank.
      migrate: (state) => {
        const s = state as { agents?: Record<string, Partial<CustomAgent> & { icon?: string }>; rooms?: Record<string, Room> };
        const agents = Object.fromEntries(Object.entries(s.agents ?? {}).map(([id, a]) => [id, { ...EMPTY_AGENT, ...a, shape: a.shape ?? 'nuage', expression: a.expression ?? 'heureux' }]));
        return { ...s, agents } as AgentsState;
      },
    },
  ),
);

export function roomsFor(rooms: Record<string, Room>, projectId: string): Room[] {
  return Object.values(rooms)
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function agentList(agents: Record<string, CustomAgent>): CustomAgent[] {
  return Object.values(agents).sort((a, b) => a.createdAt - b.createdAt);
}

/** `@Name` or `@name-without-spaces`, case-insensitive; the longest names first so "Dev Senior" wins over "Dev". */
export function mentionsIn(text: string, agents: CustomAgent[]): CustomAgent[] {
  const lower = text.toLowerCase();
  const hit: CustomAgent[] = [];
  for (const a of [...agents].sort((x, y) => y.name.length - x.name.length)) {
    const forms = [a.name, a.name.replace(/\s+/g, '-'), a.name.replace(/\s+/g, '_'), a.name.replace(/\s+/g, '')].map((f) => '@' + f.toLowerCase());
    if (forms.some((f) => lower.includes(f))) hit.push(a);
  }
  return hit;
}

/** The handle a mention uses for an agent (no spaces, so it survives a line of text). */
export function handleOf(a: CustomAgent): string {
  return '@' + a.name.replace(/\s+/g, '-');
}

/** Lines of a multi-line field, trimmed, empties dropped. */
export function lines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

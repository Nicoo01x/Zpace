import { isTauri } from '@/lib/platform';
import { speechLang, speakAsync, stopSpeaking, micProbe } from '@/native/speech';
import { voiceReady, voiceSetup, voiceListen, voiceCancel } from '@/native/voice';
import { mcpStart, mcpSetTools, mcpReply, onMcpCall } from '@/native/mcp';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useSettings, modelContext } from '@/stores/settings';
import { useUI } from '@/stores/ui';
import { runtime } from '@/providers/runtime';
import { toast } from '@/features/notifications/toast-store';
import { runVoiceTool, voiceToolDefs } from './tools';
import { useVoice } from './store';
import { t } from '@/i18n';


/**
 * The voice assistant's turn: listen (whisper, local), hand the words to
 * a hidden Claude Code session that only has Zpace's own tools (plus reading
 * files), wait for it to finish, say the answer aloud. The session lives
 * while the orb is up, so "close that one" can refer to the last thing; it
 * goes when the orb is dismissed.
 */
const VOICE_PROMPT = `You are Zpace's voice assistant. Zpace is a desktop workspace for coding agents: projects (folders on disk) with sub-folders, terminals, Claude Code terminals, chat sessions, notes and boards.
The user speaks to you; your reply is read aloud. Answer in the language the user spoke, in one or two short spoken sentences: no Markdown, no lists, no code, no emoji.
Act on the app through the zpace tools; use list_projects or list_workspace first when you need ids or are unsure what exists. Confirm briefly what you did.
When a request is ambiguous (which project, which terminal), ask one short question instead of guessing. When something fails, say what happened.
For questions about the code, look at the files with Read, Glob and Grep and answer briefly. Never run shell commands yourself: to run something, type it into a terminal with send_to_terminal.`;

const DISALLOWED = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'TodoWrite', 'KillShell', 'BashOutput', 'EnterPlanMode', 'ExitPlanMode'];

let wired: Promise<number> | null = null;
let sessionId: string | null = null;
let turn = 0;

/** The MCP server up, the tools listed, calls answered. Once per launch. */
function wire(): Promise<number> {
  wired ??= (async () => {
    const port = await mcpStart();
    await mcpSetTools(voiceToolDefs());
    await onMcpCall(async (call) => {
      const result = await runVoiceTool(call.name, call.arguments);
      await mcpReply(call.id, result);
    });
    return port;
  })();
  return wired;
}

/** The hidden session the assistant speaks through, in the active project (any project does: the tools take names). */
function ensureSession(port: number): string {
  const sessions = useSessions.getState();
  if (sessionId && sessions.sessions[sessionId]) return sessionId;
  const projects = useProjects.getState().projects;
  const pid = useUI.getState().activeProjectId ?? projects[0]?.id;
  if (!pid || !projects.some((p) => p.id === pid)) throw new Error(t('Open a project first'));
  const settings = useSettings.getState();
  const model = settings.claude.quickModel || 'haiku';
  const s = sessions.createSession({ projectId: pid, title: 'Voice', model, contextMax: modelContext(model), hidden: true });
  sessions.updateSession(s.id, {
    options: {
      mcpServers: { zpace: { type: 'http', url: `http://127.0.0.1:${port}/mcp` } },
      allowedTools: ['mcp__zpace__*', 'Read', 'Glob', 'Grep'],
      disallowedTools: DISALLOWED,
      appendSystemPrompt: VOICE_PROMPT,
      permissionMode: 'default',
    },
  });
  sessionId = s.id;
  return s.id;
}

/** Resolves when the session is no longer running its turn. */
function waitTurn(id: string): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      const s = useSessions.getState().sessions[id];
      return !s || s.status !== 'running';
    };
    if (done()) return resolve();
    const unsub = useSessions.subscribe(() => {
      if (!done()) return;
      unsub();
      resolve();
    });
  });
}

/** The last thing Claude said in the session, as plain speech (Markdown marks dropped). */
function lastAnswer(id: string): string {
  const events = useSessions.getState().events[id] ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'user_message') break;
    if (ev.type === 'assistant_message' && ev.text.trim()) return plain(ev.text);
    if (ev.type === 'error') return ev.message;
  }
  return '';
}

function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One tap: listen, act, answer. A tap while it speaks cuts the answer and listens again. */
export async function talk() {
  const v = useVoice.getState();
  if (v.phase === 'listening' || v.phase === 'thinking') return;
  if (!isTauri) {
    toast.info(t('Voice needs the desktop app.'));
    return;
  }
  stopSpeaking();
  const my = ++turn;
  v.begin();
  let heard: string;
  try {
    const { model, language, device } = useSettings.getState().voice;
    // First time: the speech engine and its model come down once (~70 MB), with the orb showing how far along it is.
    const ready = await voiceReady(model);
    if (!ready.binary || !ready.model) {
      useVoice.getState().settingUp({ stage: ready.binary ? 'model' : 'binary', received: 0, total: 0 });
      await voiceSetup(model, (p) => {
        if (turn === my) useVoice.getState().settingUp(p);
      });
      if (turn !== my) return;
      useVoice.getState().begin();
    }
    // Settings › Voice: the microphone and the language ('auto' = detected from the words; the UI language says nothing about the voice).
    heard = (await voiceListen(model, language, device, (level, speaking) => useVoice.getState().levelNow(level, speaking))).trim();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (turn === my) useVoice.getState().failed(message, message.includes('microphone') ? 'microphone' : undefined);
    return;
  }
  if (turn !== my || useVoice.getState().phase !== 'listening') return;
  if (!heard) {
    // Nothing at all: name the microphone Windows recorded from — it is often not the one the user talks into.
    const mic = await micProbe(0);
    if (turn !== my) return;
    if (mic?.name) useVoice.getState().failed(mic.muted ? t('Nothing heard — {device} is muted in Windows.', { device: mic.name }) : t('Nothing heard from {device}. If that is not the microphone you use, make yours the default input in Windows.', { device: mic.name }), 'microphone');
    else useVoice.getState().failed(t('Didn’t catch that — tap to try again.'));
    return;
  }
  await converse(heard, my);
}

/** The same turn from typed words (automation, and a way in when there is no microphone). */
export async function voiceText(text: string) {
  const v = useVoice.getState();
  if (v.phase === 'listening' || v.phase === 'thinking') return;
  stopSpeaking();
  const my = ++turn;
  v.begin();
  await converse(text.trim(), my);
}

/** Hand the words to Claude, wait, say the answer. `my` is the turn this belongs to: a newer tap or a dismiss makes it drop its result. */
async function converse(heard: string, my: number) {
  if (!heard) return;
  useVoice.getState().heard(heard);
  // The answer comes back in the language spoken; the system voice matches it far more often than the UI language does.
  const lang = speechLang('system');
  try {
    const port = await wire();
    const id = ensureSession(port);
    await runtime.send(id, heard);
    await waitTurn(id);
    if (turn !== my || useVoice.getState().phase !== 'thinking') return;
    const session = useSessions.getState().sessions[id];
    const answer = session?.status === 'waiting' ? t('Claude is waiting for a permission — check the notifications.') : lastAnswer(id) || t('Done.');
    useVoice.getState().answered(answer);
    await speakAsync(answer, lang);
    if (turn === my && useVoice.getState().phase === 'speaking') useVoice.getState().setPhase('idle');
  } catch (e) {
    if (turn === my) useVoice.getState().failed(e instanceof Error ? e.message : String(e));
  }
}

/** The orb goes; the assistant's session with it. */
export function dismissVoice() {
  stopSpeaking();
  if (useVoice.getState().phase === 'listening') void voiceCancel();
  turn++;
  useVoice.getState().off();
  const id = sessionId;
  sessionId = null;
  if (id) {
    void runtime.dispose(id).catch(() => void 0);
    useSessions.getState().removeSession(id);
  }
}

/** The entry point: opens the orb and listens, or listens again when it is already up. */
export function startVoice() {
  void talk();
}

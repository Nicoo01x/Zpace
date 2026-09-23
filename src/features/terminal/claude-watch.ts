import { create } from 'zustand';
import { onAnyPtyData } from '@/native/pty';
import { isWindowFocused, nativeNotify } from '@/native/system';
import { useTerminals } from '@/stores/terminals';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { useUI, collectLeaves } from '@/stores/ui';
import { playChime } from '@/features/notifications/sound';
import { claudeTerminalDoneToast } from '@/features/notifications/rich';
import { speak, speechLang } from '@/native/speech';
import { isTauri } from '@/lib/platform';
import { claudeTitle, noteTerminalOutput, useClaudeLive } from './claude-live';
import { refreshChanges, useTerminalChanges } from './claude-changes';
import { t } from '@/i18n';

/**
 * Reads every terminal's output, attached to a view or not, for what Claude
 * Code says about itself in the terminal title (OSC 0/2): "◐ Fixing the login"
 * while it works — the glyph turns — and "✳ Fixing the login" once it waits
 * for you. That gives the sidebar the conversation's name, and the turn from
 * a spinner to ✳ is "Claude finished": the same toast, chime and system
 * notification a chat session gets. The output is also what wakes the
 * process check that finds Claude in a shell.
 */
interface WorkingState {
  byTab: Record<string, boolean>;
  set: (tabId: string, working: boolean) => void;
}

export const useClaudeWorking = create<WorkingState>()((set) => ({
  byTab: {},
  set: (tabId, working) => set((s) => (!!s.byTab[tabId] === working ? s : { byTab: { ...s.byTab, [tabId]: working } })),
}));

const IDLE_GLYPH = '✳';
// OSC 0 or 2 (window title), ended by BEL or ST.
// eslint-disable-next-line no-control-regex
const TITLE_RE = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
/** A turn this short is a keystroke's repaint, not work worth a notification. */
const MIN_TURN_MS = 2500;

const decoders = new Map<string, TextDecoder>();
/** The tail of the last chunk, in case a title sequence was cut in two. */
const carry = new Map<string, string>();
const workingSince = new Map<string, number>();
let started = false;

export function startClaudeWatch() {
  if (started) return;
  started = true;
  onAnyPtyData((ptyId, bytes) => {
    const tab = useTerminals.getState().tabs.find((x) => x.ptyId === ptyId);
    if (!tab) return;
    noteTerminalOutput(tab.id, ptyId);
    const decoder = decoders.get(ptyId) ?? new TextDecoder();
    decoders.set(ptyId, decoder);
    const text = (carry.get(ptyId) ?? '') + decoder.decode(bytes, { stream: true });
    const open = text.lastIndexOf('\x1b]');
    carry.set(ptyId, open >= 0 && text.indexOf('\x07', open) < 0 && text.indexOf('\x1b\\', open) < 0 ? text.slice(open, open + 512) : '');
    if (!text.includes('\x1b]')) return;
    for (const m of text.matchAll(TITLE_RE)) onTitle(tab.id, m[1]);
  });
}

function onTitle(tabId: string, raw: string) {
  const glyph = raw.trimStart().charAt(0);
  // Shells set titles too (a path, the command running): only Claude's carry its glyph.
  if (glyph !== IDLE_GLYPH && !/^[◐◓◑◒⠀-⣿✢✶✻✽·*]$/.test(glyph)) return;
  const name = claudeTitle(raw);
  if (name) useClaudeLive.getState().setTitle(tabId, name);
  const working = glyph !== IDLE_GLYPH;
  const was = useClaudeWorking.getState().byTab[tabId] ?? false;
  useClaudeWorking.getState().set(tabId, working);
  if (working && !was) workingSince.set(tabId, Date.now());
  if (!working && was && Date.now() - (workingSince.get(tabId) ?? Date.now()) >= MIN_TURN_MS) void notifyDone(tabId);
}

async function notifyDone(tabId: string) {
  const prefs = useSettings.getState().notifications;
  if (!prefs.onComplete) return;
  const tab = useTerminals.getState().tabs.find((x) => x.id === tabId);
  if (!tab) return;
  const live = useClaudeLive.getState();
  const since = live.byTab[tabId]?.since;
  if (since && tab.cwd) await refreshChanges(tabId, tab.cwd, since);
  const project = useProjects.getState().projects.find((p) => p.id === tab.projectId);
  const title = live.titles[tabId] ?? tab.title;
  const files = (useTerminalChanges.getState().byTab[tabId]?.session ?? []).map((f) => ({ path: f.file, add: f.additions, del: f.deletions }));
  const open = () => {
    const ui = useUI.getState();
    const leaf = collectLeaves(ui.layout).find((l) => l.content.kind === 'terminal' && l.content.terminalId === tabId);
    if (leaf) ui.setActivePane(leaf.id);
    else ui.setPaneContent(ui.activePaneId, { kind: 'terminal', terminalId: tabId });
  };
  claudeTerminalDoneToast({ key: `done:${tabId}`, title, project: project?.name, files, open });
  // With the desktop island on, it already shows this over every app — a system toast on top would say it twice.
  const desktopIsland = useSettings.getState().desktopIsland.enabled && isTauri;
  if (!desktopIsland && !(await isWindowFocused())) void nativeNotify(t('Claude finished'), `${project ? `${project.name} · ` : ''}${title}`);
  if (prefs.sound) playChime('done', prefs.volume, prefs.soundTheme);
  if (prefs.speak) speak(t('Claude finished'), speechLang(useSettings.getState().language));
}

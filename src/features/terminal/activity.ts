import { create } from 'zustand';

/**
 * Which terminals are busy right now — a shell running a command, a TUI
 * working — read from the only signal a plain shell gives: output that is
 * not the echo of what was just typed. A tab is busy from its first such
 * byte until 1.5 s of silence; the clock that ends busy periods runs only
 * while one is open. Not persisted: a fresh launch starts quiet.
 */
interface ActivityState {
  /** Busy tabs, by id: when the current period started. */
  busy: Record<string, number>;
  start: (id: string, at: number) => void;
  stop: (ids: string[]) => void;
}

export const useTerminalActivity = create<ActivityState>()((set) => ({
  busy: {},
  start: (id, at) => set((s) => (s.busy[id] ? s : { busy: { ...s.busy, [id]: at } })),
  stop: (ids) =>
    set((s) => {
      const busy = { ...s.busy };
      for (const id of ids) delete busy[id];
      return { busy };
    }),
}));

const QUIET_MS = 1500;
/** Output this soon after a key press is the shell echoing it, not work. */
const ECHO_MS = 150;

const lastInput = new Map<string, number>();
const lastOutput = new Map<string, number>();
let clock: number | null = null;

function tick() {
  const now = Date.now();
  const done = Object.keys(useTerminalActivity.getState().busy).filter((id) => now - (lastOutput.get(id) ?? 0) > QUIET_MS);
  if (done.length) useTerminalActivity.getState().stop(done);
  if (Object.keys(useTerminalActivity.getState().busy).length === 0 && clock !== null) {
    window.clearInterval(clock);
    clock = null;
  }
}

export function noteInput(id: string) {
  lastInput.set(id, Date.now());
}

export function noteOutput(id: string) {
  const now = Date.now();
  lastOutput.set(id, now);
  if (now - (lastInput.get(id) ?? 0) < ECHO_MS) return;
  const s = useTerminalActivity.getState();
  if (!s.busy[id]) s.start(id, now);
  clock ??= window.setInterval(tick, 500);
}

/** The tab is gone: nothing to end later. */
export function forgetActivity(id: string) {
  lastInput.delete(id);
  lastOutput.delete(id);
  if (useTerminalActivity.getState().busy[id]) useTerminalActivity.getState().stop([id]);
}

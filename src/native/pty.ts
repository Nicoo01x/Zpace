import { invoke, isTauri, listen } from './bridge';

/**
 * PTY bridge. The Rust side uses `portable-pty` (ConPTY on Windows, forkpty on
 * macOS/Linux) and streams raw bytes as base64 through the `pty://data` event.
 */

export interface PtySpawnOptions {
  shell: string;
  args?: string[];
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface PtyDataPayload {
  id: string;
  /** base64-encoded bytes */
  data: string;
}

export interface PtyExitPayload {
  id: string;
  code: number | null;
}

const dataHandlers = new Map<string, (data: Uint8Array) => void>();
const exitHandlers = new Map<string, (code: number | null) => void>();
/**
 * Everything a PTY has printed, per id, capped at ~1.5 MB (oldest chunks go
 * first). A terminal is a view: its pane can show something else for a while
 * and come back, so the process keeps running and the view replays this when
 * it attaches. It also covers the first attach — the reader thread starts
 * the moment the process does, and a TUI (Claude Code) paints its first
 * screen faster than `pty_spawn` resolves and the tab wires up.
 */
const history = new Map<string, { chunks: Uint8Array[]; bytes: number }>();
const HISTORY_BYTES = 1_500_000;
/** Ids whose process is still running (spawned, not exited, not killed). */
const alive = new Set<string>();
const pendingExit = new Map<string, number | null>();
let listening: Promise<void> | null = null;

function remember(id: string, bytes: Uint8Array) {
  const h = history.get(id) ?? { chunks: [], bytes: 0 };
  h.chunks.push(bytes);
  h.bytes += bytes.length;
  while (h.bytes > HISTORY_BYTES && h.chunks.length > 1) h.bytes -= h.chunks.shift()!.length;
  history.set(id, h);
}

function ensureListeners() {
  if (listening) return listening;
  listening = (async () => {
    await listen<PtyDataPayload>('pty://data', (p) => {
      const bytes = base64ToBytes(p.data);
      remember(p.id, bytes);
      dataHandlers.get(p.id)?.(bytes);
    });
    await listen<PtyExitPayload>('pty://exit', (p) => {
      alive.delete(p.id);
      const h = exitHandlers.get(p.id);
      if (h) h(p.code);
      else pendingExit.set(p.id, p.code);
      dataHandlers.delete(p.id);
      exitHandlers.delete(p.id);
      // Nobody attached and nobody comes back within a while: let the output go.
      window.setTimeout(() => {
        if (!dataHandlers.has(p.id)) {
          history.delete(p.id);
          pendingExit.delete(p.id);
        }
      }, 60_000);
    });
  })();
  return listening;
}

export async function ptySpawn(opts: PtySpawnOptions): Promise<string> {
  await ensureListeners();
  const id = await invoke<string>('pty_spawn', { opts });
  alive.add(id);
  return id;
}

/** Whether the process behind an id is still running (as far as this window knows). */
export const ptyAlive = (id: string) => alive.has(id);

export async function ptyWrite(id: string, data: string): Promise<void> {
  await invoke('pty_write', { id, data });
}

export async function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  await invoke('pty_resize', { id, cols, rows });
}

export async function ptyKill(id: string): Promise<void> {
  alive.delete(id);
  history.delete(id);
  pendingExit.delete(id);
  await invoke('pty_kill', { id });
}

/** Claude Code running inside this PTY — as the program itself or typed into its shell — with the arguments it was started with. */
export async function ptyAgent(id: string): Promise<{ args: string[]; startedAt: number } | null> {
  if (!isTauri || !alive.has(id)) return null;
  return invoke<{ args: string[]; startedAt: number } | null>('pty_agent', { id });
}

/** Attaches a view: everything printed so far is replayed first, then live data follows. Detaching keeps the history. */
export function onPtyData(id: string, handler: (data: Uint8Array) => void) {
  dataHandlers.set(id, handler);
  for (const chunk of history.get(id)?.chunks ?? []) handler(chunk);
  return () => {
    dataHandlers.delete(id);
  };
}

export function onPtyExit(id: string, handler: (code: number | null) => void) {
  exitHandlers.set(id, handler);
  if (pendingExit.has(id)) {
    const code = pendingExit.get(id) ?? null;
    pendingExit.delete(id);
    handler(code);
  }
  return () => {
    exitHandlers.delete(id);
  };
}

export const ptyAvailable = isTauri;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

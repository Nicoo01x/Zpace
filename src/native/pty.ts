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
 * Output that arrived before the terminal attached its handler. The reader
 * thread starts the moment the process does, and a TUI (Claude Code) paints
 * its first screen faster than `pty_spawn` resolves and the tab wires up —
 * dropping those bytes left the pane blank for good (a full-screen app only
 * repaints on input or resize). Held per id until the handler comes.
 */
const pendingData = new Map<string, Uint8Array[]>();
const pendingExit = new Map<string, number | null>();
let listening: Promise<void> | null = null;

function ensureListeners() {
  if (listening) return listening;
  listening = (async () => {
    await listen<PtyDataPayload>('pty://data', (p) => {
      const h = dataHandlers.get(p.id);
      const bytes = base64ToBytes(p.data);
      if (h) h(bytes);
      else pendingData.set(p.id, [...(pendingData.get(p.id) ?? []), bytes]);
    });
    await listen<PtyExitPayload>('pty://exit', (p) => {
      const h = exitHandlers.get(p.id);
      if (h) h(p.code);
      else pendingExit.set(p.id, p.code);
      dataHandlers.delete(p.id);
      exitHandlers.delete(p.id);
      // Nobody attached (the tab was disposed before the spawn resolved): let the held output go.
      window.setTimeout(() => {
        if (!dataHandlers.has(p.id)) {
          pendingData.delete(p.id);
          pendingExit.delete(p.id);
        }
      }, 10_000);
    });
  })();
  return listening;
}

export async function ptySpawn(opts: PtySpawnOptions): Promise<string> {
  await ensureListeners();
  return invoke<string>('pty_spawn', { opts });
}

export async function ptyWrite(id: string, data: string): Promise<void> {
  await invoke('pty_write', { id, data });
}

export async function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  await invoke('pty_resize', { id, cols, rows });
}

export async function ptyKill(id: string): Promise<void> {
  await invoke('pty_kill', { id });
}

export function onPtyData(id: string, handler: (data: Uint8Array) => void) {
  dataHandlers.set(id, handler);
  const held = pendingData.get(id);
  if (held) {
    pendingData.delete(id);
    for (const chunk of held) handler(chunk);
  }
  return () => {
    dataHandlers.delete(id);
    pendingData.delete(id);
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
    pendingExit.delete(id);
  };
}

export const ptyAvailable = isTauri;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

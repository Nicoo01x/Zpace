import { invoke, listen } from './bridge';

/**
 * Line-oriented child process bridge (non-PTY). Used for Claude Code's
 * `--output-format stream-json` mode where every stdout line is a JSON event.
 */

export interface ProcessSpawnOptions {
  program: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ProcessLinePayload {
  id: string;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface ProcessExitPayload {
  id: string;
  code: number | null;
}

const lineHandlers = new Map<string, (p: ProcessLinePayload) => void>();
const exitHandlers = new Map<string, (code: number | null) => void>();
let listening: Promise<void> | null = null;

function ensureListeners() {
  if (listening) return listening;
  listening = (async () => {
    await listen<ProcessLinePayload>('process://line', (p) => lineHandlers.get(p.id)?.(p));
    await listen<ProcessExitPayload>('process://exit', (p) => {
      exitHandlers.get(p.id)?.(p.code);
      lineHandlers.delete(p.id);
      exitHandlers.delete(p.id);
    });
  })();
  return listening;
}

export async function processSpawn(opts: ProcessSpawnOptions): Promise<string> {
  await ensureListeners();
  return invoke<string>('process_spawn', { opts });
}

export async function processWrite(id: string, data: string): Promise<void> {
  await invoke('process_write', { id, data });
}

export async function processKill(id: string): Promise<void> {
  await invoke('process_kill', { id });
}

export function onProcessLine(id: string, handler: (p: ProcessLinePayload) => void) {
  lineHandlers.set(id, handler);
  return () => lineHandlers.delete(id);
}

export function onProcessExit(id: string, handler: (code: number | null) => void) {
  exitHandlers.set(id, handler);
  return () => exitHandlers.delete(id);
}

import type { Terminal } from '@xterm/xterm';
import type { SearchAddon } from '@xterm/addon-search';

/** Live xterm instances by tab id — lets other features read terminal output (e.g. @terminal mentions, find, global search). */
const terminals = new Map<string, { term: Terminal; search: SearchAddon }>();

export function registerTerminal(id: string, term: Terminal, search: SearchAddon) {
  terminals.set(id, { term, search });
  return () => {
    if (terminals.get(id)?.term === term) terminals.delete(id);
  };
}

export function getTerminal(id: string): Terminal | undefined {
  return terminals.get(id)?.term;
}

export function getTerminalSearch(id: string): SearchAddon | undefined {
  return terminals.get(id)?.search;
}

/** Ids of terminals currently mounted (their buffers are readable). */
export function liveTerminalIds(): string[] {
  return Array.from(terminals.keys());
}

/** Buffer lines containing `needle` (case-insensitive), most recent first. */
export function terminalMatches(id: string, needle: string, max = 8): Array<{ line: number; text: string }> {
  const term = terminals.get(id)?.term;
  if (!term || !needle) return [];
  const buf = term.buffer.active;
  const n = needle.toLowerCase();
  const out: Array<{ line: number; text: string }> = [];
  for (let i = buf.length - 1; i >= 0 && out.length < max; i--) {
    const text = buf.getLine(i)?.translateToString(true) ?? '';
    if (text.toLowerCase().includes(n)) out.push({ line: i, text });
  }
  return out;
}

/** Last `lines` non-empty lines of the terminal buffer. */
export function terminalTail(id: string, lines = 40): string {
  const term = terminals.get(id)?.term;
  if (!term) return '';
  const buf = term.buffer.active;
  const out: string[] = [];
  for (let i = buf.length - 1; i >= 0 && out.length < lines; i--) {
    const line = buf.getLine(i)?.translateToString(true) ?? '';
    if (line.trim() || out.length) out.unshift(line);
  }
  return out.join('\n').trimEnd();
}

import { readTextFile, pathExists } from '@/native/system';
import { isTauri } from '@/lib/platform';

/**
 * The MCP servers Claude Code knows about, read from where it keeps them: the
 * user's (`~/.claude.json`), the ones set for a project locally (same file,
 * under `projects`) and the project's own `.mcp.json`. Settings › MCP shows
 * them; a custom agent picks the ones it may use.
 */
export type McpConfig = { command?: string; args?: string[]; env?: Record<string, string>; type?: string; url?: string; headers?: Record<string, string> };

export interface McpEntry {
  name: string;
  scope: 'user' | 'project' | 'local';
  config: McpConfig;
}

export async function homeDir(): Promise<string> {
  const { homeDir: h } = await import('@tauri-apps/api/path');
  return (await h()).replace(/[\\/]+$/, '');
}

export function transport(c: McpConfig): { kind: 'stdio' | 'http'; label: string } {
  if (c.url) return { kind: 'http', label: `${c.type ?? 'http'} · ${c.url}` };
  return { kind: 'stdio', label: [c.command, ...(c.args ?? [])].filter(Boolean).join(' ') };
}

export async function loadMcpEntries(projectPath?: string): Promise<McpEntry[]> {
  const out: McpEntry[] = [];
  if (!isTauri) return out;
  const home = await homeDir();
  const userFile = `${home}\\.claude.json`;
  if (await pathExists(userFile)) {
    try {
      const cfg = JSON.parse(await readTextFile(userFile)) as { mcpServers?: Record<string, McpConfig>; projects?: Record<string, { mcpServers?: Record<string, McpConfig> }> };
      for (const [name, config] of Object.entries(cfg.mcpServers ?? {})) out.push({ name, scope: 'user', config });
      if (projectPath) {
        const norm = (x: string) => x.replace(/\//g, '\\').replace(/[\\]+$/, '').toLowerCase();
        const local = Object.entries(cfg.projects ?? {}).find(([k]) => norm(k) === norm(projectPath))?.[1];
        for (const [name, config] of Object.entries(local?.mcpServers ?? {})) out.push({ name, scope: 'local', config });
      }
    } catch {
      /* unreadable */
    }
  }
  if (projectPath) {
    const file = `${projectPath.replace(/[\\/]+$/, '')}\\.mcp.json`;
    if (await pathExists(file)) {
      try {
        const cfg = JSON.parse(await readTextFile(file)) as { mcpServers?: Record<string, McpConfig> };
        for (const [name, config] of Object.entries(cfg.mcpServers ?? {})) out.push({ name, scope: 'project', config });
      } catch {
        /* unreadable */
      }
    }
  }
  return out;
}

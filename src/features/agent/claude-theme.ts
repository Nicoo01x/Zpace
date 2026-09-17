import { homeDir } from '@/features/mcp/mcp-config';
import { joinPath, pathExists, readTextFile, writeTextFile } from '@/native/system';

/**
 * Claude Code paints with its own theme, not the terminal's palette: its
 * "dark" theme draws what you typed as a dark bar, which on a light
 * terminal reads as a wall. Right before the TUI starts, its theme is set
 * to the side the terminal is on — in ~/.claude/settings.json, the user
 * settings `/theme` writes to and the one that wins over the older
 * ~/.claude.json — keeping a daltonized or ANSI variant the user chose.
 * The file is rewritten with everything else untouched, only when the
 * value differs; a file that fails to parse is left alone.
 */
export async function alignClaudeTheme(dark: boolean): Promise<void> {
  const dir = joinPath(await homeDir(), '.claude');
  const file = joinPath(dir, 'settings.json');
  const cfg = (await pathExists(file)) ? (JSON.parse(await readTextFile(file)) as Record<string, unknown>) : {};
  const current = typeof cfg.theme === 'string' ? cfg.theme : null;
  const base = dark ? 'dark' : 'light';
  const wanted = current?.includes('daltonized') ? `${base}-daltonized` : current?.includes('ansi') ? `${base}-ansi` : base;
  if (current === wanted) return;
  cfg.theme = wanted;
  await writeTextFile(file, JSON.stringify(cfg, null, 2) + '\n');
}

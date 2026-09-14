import type { Terminal } from '@xterm/xterm';
import type { TerminalTab } from '@/types/workspace';

/**
 * A tiny local-echo shell for the browser preview. Enough to evaluate the
 * terminal surface (prompt, colours, scrollback) without a PTY.
 */
export function createPreviewShell(term: Terminal, tab: TerminalTab) {
  const cwd = tab.cwd || 'C:\\Users\\dev\\projects\\melon-mind';
  let line = '';
  const prompt = () => term.write(`\r\n\x1b[2m${cwd}\x1b[0m\r\n\x1b[1m❯\x1b[0m `);

  term.write(`\x1b[2mConduit preview shell — no PTY in the browser. Run the desktop app for a real ${tab.shellId} session.\x1b[0m`);
  prompt();

  const run = (cmd: string) => {
    const [name, ...args] = cmd.trim().split(/\s+/);
    switch (name) {
      case '':
        break;
      case 'help':
        term.write('\r\nAvailable: help, ls, echo, clear, git status, npm run build');
        break;
      case 'ls':
        term.write('\r\n\x1b[34msrc\x1b[0m  \x1b[34mtests\x1b[0m  \x1b[34mpublic\x1b[0m  package.json  vite.config.ts  README.md');
        break;
      case 'echo':
        term.write('\r\n' + args.join(' '));
        break;
      case 'clear':
        term.clear();
        break;
      case 'git':
        term.write('\r\nOn branch \x1b[32mfeature/documents-table\x1b[0m\r\nChanges not staged for commit:\r\n  \x1b[31mmodified:   src/components/documents/DocumentsTable.vue\x1b[0m');
        break;
      case 'npm':
        term.write('\r\n> vite build\r\n\x1b[32m✓\x1b[0m 214 modules transformed.\r\n\x1b[2mdist/index.html  0.62 kB\x1b[0m\r\n\x1b[32m✓ built in 4.11s\x1b[0m');
        break;
      default:
        term.write(`\r\n\x1b[31m${name}\x1b[0m: command not found (preview shell)`);
    }
  };

  const d = term.onData((data) => {
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (ch === '\r') {
        run(line);
        line = '';
        prompt();
      } else if (code === 127) {
        if (line.length) {
          line = line.slice(0, -1);
          term.write('\b \b');
        }
      } else if (code === 3) {
        line = '';
        term.write('^C');
        prompt();
      } else if (code === 12) {
        term.clear();
      } else if (code >= 32) {
        line += ch;
        term.write(ch);
      }
    }
  });

  return { dispose: () => d.dispose() };
}

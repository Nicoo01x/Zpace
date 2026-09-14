/** The agent CLIs Zpace can open as a terminal TUI. */
export type AgentKind = 'claude' | 'codex' | 'gemini' | 'opencode';

/** Every agent, in the order menus list them. */
export const AGENT_KINDS: AgentKind[] = ['claude', 'codex', 'gemini', 'opencode'];

export const AGENT_LABEL: Record<AgentKind, string> = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', opencode: 'OpenCode' };

/** Binary name on PATH for each agent. */
export const AGENT_BINARY: Record<AgentKind, string> = { claude: 'claude', codex: 'codex', gemini: 'gemini', opencode: 'opencode' };

/** How each TUI takes a first prompt on its command line. */
export function agentPromptArgs(agent: AgentKind, prompt: string): string[] {
  switch (agent) {
    case 'gemini':
      return ['-i', prompt];
    case 'opencode':
      return ['--prompt', prompt];
    default:
      return [prompt];
  }
}

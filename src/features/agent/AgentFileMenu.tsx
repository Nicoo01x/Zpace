import type { ComponentType, ReactNode } from 'react';
import { useEnvironment } from '@/stores/environment';
import { useSettings } from '@/stores/settings';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from './BrandIcon';
import { AGENT_KINDS, type AgentKind } from './agents';
import { t } from '@/i18n';

interface ItemProps {
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

/**
 * The "bring this file to an agent" entries, rendered with whichever menu item
 * component the caller uses (context menu or dropdown). Chat starts with the
 * @mention typed; the TUIs start with the file as their first prompt.
 */
export function AgentFileItems({ Item, path, projectId }: { Item: ComponentType<ItemProps>; path: string; projectId?: string }) {
  const codex = useEnvironment((s) => s.report?.codex?.found ?? false);
  const gemini = useEnvironment((s) => s.report?.gemini?.found ?? false);
  const opencode = useEnvironment((s) => s.report?.opencode?.found ?? false);
  const defaultAgent = useSettings((s) => s.defaultAgent);
  const { askAgentAboutFile } = useWorkspaceActions();
  // Each entry carries its agent's own mark; the default agent's entries come first.
  const groups: Record<AgentKind, ReactNode> = {
    claude: (
      <>
        <Item icon={<ClaudeLogo />} onSelect={() => askAgentAboutFile('claude-chat', path, projectId)}>
          {t('Ask Claude (chat view)')}
        </Item>
        <Item icon={<ClaudeLogo />} onSelect={() => askAgentAboutFile('claude', path, projectId)}>
          {t('Open in Claude Code (terminal)')}
        </Item>
      </>
    ),
    codex: (
      <Item icon={<CodexLogo />} disabled={!codex} onSelect={() => askAgentAboutFile('codex', path, projectId)}>
        {t('Open in Codex')}
      </Item>
    ),
    gemini: (
      <Item icon={<GeminiLogo />} disabled={!gemini} onSelect={() => askAgentAboutFile('gemini', path, projectId)}>
        {t('Open in Gemini CLI')}
      </Item>
    ),
    opencode: (
      <Item icon={<OpenCodeLogo />} disabled={!opencode} onSelect={() => askAgentAboutFile('opencode', path, projectId)}>
        {t('Open in OpenCode')}
      </Item>
    ),
  };
  const order: AgentKind[] = [defaultAgent, ...AGENT_KINDS.filter((a) => a !== defaultAgent)];
  return (
    <>
      {order.map((a) => (
        <span key={a} className="contents">
          {groups[a]}
        </span>
      ))}
    </>
  );
}

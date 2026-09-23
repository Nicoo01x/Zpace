import type { ComponentType } from 'react';
import { BookOpen, Bot, LayoutDashboard, Plug, Sparkles, Terminal, Webhook } from 'lucide-react';
import { t } from '@/i18n';
import type { StudioKind } from '@/stores/studio';

/** One icon and one label per kind, shared by the rail, the overview and the stage. */
export const KIND_ICON: Record<StudioKind, ComponentType<{ className?: string }>> = { overview: LayoutDashboard, skills: Sparkles, agents: Bot, commands: Terminal, memory: BookOpen, mcp: Plug, hooks: Webhook };

export const KIND_LABEL: Record<StudioKind, () => string> = {
  overview: () => t('Overview'),
  skills: () => t('Skills'),
  agents: () => t('Subagents'),
  commands: () => t('Commands'),
  memory: () => t('Memory'),
  mcp: () => t('MCP servers'),
  hooks: () => t('Hooks'),
};

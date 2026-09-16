import type { ReactNode } from 'react';
import { Check, X, TriangleAlert, Info, GitCommit, ArrowUpFromLine, ArrowDownToLine, Terminal, NotebookPen, Globe, Loader2, ClipboardCheck } from 'lucide-react';
import type { NotificationMark, NotificationVariant } from '@/stores/notifications';
import { ClaudeLogo, CodexLogo, GeminiLogo, OpenCodeLogo } from '@/features/agent/BrandIcon';

/**
 * The marks a notification can carry in an island — the one in the title bar
 * and the one on the desktop draw the same glyphs. Kept apart from the stores
 * so the desktop island's bundle stays free of them.
 */
export const VARIANT_GLYPH: Record<NotificationVariant, { icon: ReactNode; color: string }> = {
  success: { icon: <Check className="size-[11px]" strokeWidth={3} />, color: '#3ddc84' },
  error: { icon: <X className="size-[11px]" strokeWidth={3} />, color: '#ff5f57' },
  warning: { icon: <TriangleAlert className="size-[11px]" strokeWidth={2.5} />, color: '#ffbd2e' },
  info: { icon: <Info className="size-[11px]" strokeWidth={2.5} />, color: '#5aa9ff' },
  neutral: { icon: <span className="block size-1.5 rounded-full bg-current" />, color: 'rgba(255,255,255,0.7)' },
  loading: { icon: <Loader2 className="size-[11px] animate-spin" strokeWidth={2.5} />, color: 'rgba(255,255,255,0.85)' },
};

export function markNode(mark: NotificationMark | undefined, size: number): ReactNode {
  switch (mark) {
    case 'claude':
      return <ClaudeLogo size={size} />;
    case 'codex':
      return <CodexLogo size={size} />;
    case 'gemini':
      return <GeminiLogo size={size} />;
    case 'opencode':
      return <OpenCodeLogo size={size} />;
    case 'commit':
      return <GitCommit size={size} />;
    case 'push':
      return <ArrowUpFromLine size={size} />;
    case 'pull':
      return <ArrowDownToLine size={size} />;
    case 'terminal':
      return <Terminal size={size} />;
    case 'note':
      return <NotebookPen size={size} />;
    case 'browser':
      return <Globe size={size} />;
    case 'clipboard':
      return <ClipboardCheck size={size} />;
    default:
      return null;
  }
}

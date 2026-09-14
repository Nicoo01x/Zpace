import { useUI, collectLeaves } from '@/stores/ui';

/** Opens the review pane beside the chat (or focuses the one already open). */
export function openReview(sessionId: string) {
  const ui = useUI.getState();
  const open = collectLeaves(ui.layout).find((l) => l.content.kind === 'review' && l.content.sessionId === sessionId);
  if (open) {
    ui.setActivePane(open.id);
    return;
  }
  const chat = collectLeaves(ui.layout).find((l) => l.content.kind === 'session' && l.content.sessionId === sessionId);
  ui.splitPane(chat?.id ?? ui.activePaneId, 'horizontal', { kind: 'review', sessionId });
}


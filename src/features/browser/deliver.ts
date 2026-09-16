import { toast } from '@/features/notifications/toast-store';
import { queueImage } from '@/features/agent/composer-drafts';
import { useSessions } from '@/stores/sessions';
import { useProjects } from '@/stores/projects';
import { useUI } from '@/stores/ui';
import { clipboardWritePng, writePng } from '@/native/browser';
import { t } from '@/i18n';

export type DeliverAction = 'copy' | 'save' | 'chat';

export interface DeliverContext {
  newSession: (projectId?: string) => { id: string } | undefined;
  currentProject: () => { id: string } | undefined;
  activeSessionId: string | null;
}

/**
 * Copy / save / attach a PNG (base64) — the three outcomes of a screenshot,
 * shared by the browser pane's full capture and crop and by a plugin's
 * device preview. "Attach" queues it in the active chat's composer, or in a
 * new chat opened beside the page.
 */
export async function deliverPng(action: DeliverAction, png: string, title: string, ctx: DeliverContext) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const fileName = `${(title || 'page').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40)}-${stamp}.png`;
  if (action === 'copy') {
    await clipboardWritePng(png);
    toast.success(t('Screenshot copied'), { description: t('Paste it anywhere — including a chat.') });
    return;
  }
  if (action === 'save') {
    const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
    const path = await saveDialog({ defaultPath: fileName, filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (!path) return;
    await writePng(path, png);
    toast.success(t('Screenshot saved'), { description: path });
    return;
  }
  const url = `data:image/png;base64,${png}`;
  let sessionId = ctx.activeSessionId;
  if (!sessionId || useSessions.getState().sessions[sessionId]?.archived) {
    const project = ctx.currentProject();
    if (!project) {
      toast.info(t('Open a project first'), { description: t('Chat sessions live inside a project.') });
      return;
    }
    // Open the chat beside the page, not over it.
    const ui = useUI.getState();
    ui.splitPane(ui.activePaneId, 'horizontal', { kind: 'empty' });
    const s = ctx.newSession(project.id);
    if (!s) return;
    sessionId = s.id;
  }
  queueImage(sessionId, { name: fileName, url, mime: 'image/png' });
  const sess = useSessions.getState().sessions[sessionId];
  const project = useProjects.getState().projects.find((p) => p.id === sess?.projectId);
  toast.success(t('Screenshot attached'), { description: `${sess?.title ?? 'Session'}${project ? ` · ${project.name}` : ''}` });
}

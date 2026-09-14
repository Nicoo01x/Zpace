import { t } from '@/i18n';
import { modelContext, modelLabel } from '@/stores/settings';
import { useSessions } from '@/stores/sessions';
import { runtime } from '@/providers/runtime';
import { toast } from '@/features/notifications/toast-store';
import type { Session } from '@/types/workspace';

/**
 * Switch a session's model: the known aliases with their context size, or any
 * model id typed by hand. The running process is dropped so the next message
 * restarts Claude Code with `--model` on the same conversation (`--resume`).
 */
export function setSessionModel(session: Session, id: string) {
  const model = id.trim();
  if (!model || model === session.model) return;
  useSessions.getState().updateSession(session.id, { model, modelLabel: modelLabel(model), usage: { ...session.usage, contextMax: modelContext(model) } });
  void runtime.dispose(session.id).catch(() => void 0);
  toast.success(t('Model: {model}', { model: modelLabel(model) }), { description: t('Applies from the next message, same conversation.'), origin: null });
}


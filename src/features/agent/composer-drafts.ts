/**
 * Text queued for a session's composer before it mounts — used when a session
 * is created *about* something (a file from the explorer, a selection), so the
 * composer opens with the mention already typed.
 */
const drafts = new Map<string, string>();

export function queueDraft(sessionId: string, text: string) {
  drafts.set(sessionId, text);
}

export function takeDraft(sessionId: string): string | undefined {
  const v = drafts.get(sessionId);
  drafts.delete(sessionId);
  return v;
}

export interface QueuedImage {
  name: string;
  /** data: URL */
  url: string;
  mime: string;
}
const images = new Map<string, QueuedImage[]>();

/** Queue an image for a session's composer; delivered on mount or, if mounted, via the event below. */
export function queueImage(sessionId: string, img: QueuedImage) {
  images.set(sessionId, [...(images.get(sessionId) ?? []), img]);
  window.dispatchEvent(new CustomEvent('conduit:composer-image', { detail: { sessionId } }));
}

export function takeImages(sessionId: string): QueuedImage[] {
  const v = images.get(sessionId) ?? [];
  images.delete(sessionId);
  return v;
}

/** Append text to a mounted composer (or queue it if the session is not open yet). */
export function insertIntoComposer(sessionId: string, text: string) {
  drafts.set(sessionId, (drafts.get(sessionId) ?? '') + text);
  window.dispatchEvent(new CustomEvent('conduit:composer-insert', { detail: { sessionId } }));
}

/** What the file pane shows for a path: the editor, or one of the media viewers. */
export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'text';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'apng']);
const VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv']);
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus']);

export function mediaKind(path: string): MediaKind {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (IMAGE.has(ext)) return 'image';
  if (VIDEO.has(ext)) return 'video';
  if (AUDIO.has(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  return 'text';
}

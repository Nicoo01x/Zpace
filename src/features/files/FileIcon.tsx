import { memo } from 'react';
import { Image, Film, Music, Archive, FileText, Type, KeyRound, Scale, Settings2, Database, Table, BookOpen, Lock, Terminal, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MacFolder } from '@/components/ui/MacFolder';
import { LANG_ICONS } from './lang-icons';
import { fileKind } from './file-kind';

/**
 * A file's mark: the language / tool logo in a small rounded tile when we have
 * one (TypeScript, Python, Rust, Docker…), a lucide glyph for media, archives,
 * fonts and the like, and a rounded badge with the extension for the rest.
 * Used by the explorer, quick open, search results and file panes.
 */



const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'heic', 'tiff']);
const VIDEO = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']);
const AUDIO = new Set(['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac']);
const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz']);
const FONT = new Set(['ttf', 'otf', 'woff', 'woff2', 'eot']);
const DOC = new Set(['pdf', 'doc', 'docx', 'rtf', 'odt']);
const SHEET = new Set(['csv', 'tsv', 'xls', 'xlsx', 'ods']);
const TEXT = new Set(['txt', 'log', 'ini', 'cfg', 'conf', 'properties']);

/** Colour for the extension badge: a stable hue from the letters. */
function hueOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export const FileIcon = memo(function FileIcon({ name, isDir, open, size = 16, className, color }: { name: string; isDir?: boolean; open?: boolean; size?: number; className?: string; /** Folder colour (the project's), when set. */ color?: string }) {
  if (isDir) return <MacFolder color={color} open={open} size={size} className={className} />;
  const lower = name.toLowerCase();
  const { slug, ext } = fileKind(name);
  const icon = slug ? LANG_ICONS[slug] : undefined;
  if (icon) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center rounded-[5px]', className)} style={{ width: size, height: size, background: `color-mix(in srgb, ${icon.color} 16%, transparent)` }}>
        <svg viewBox="0 0 24 24" width={size * 0.66} height={size * 0.66} fill={icon.color} aria-hidden="true">
          <path d={icon.d} />
        </svg>
      </span>
    );
  }
  const glyph = (Icon: typeof Image, color: string) => <Icon className={cn('shrink-0', className)} style={{ width: size, height: size, color }} strokeWidth={1.75} />;
  if (IMAGE.has(ext)) return glyph(Image, '#7c3aed');
  if (VIDEO.has(ext)) return glyph(Film, '#db2777');
  if (AUDIO.has(ext)) return glyph(Music, '#0891b2');
  if (ARCHIVE.has(ext)) return glyph(Archive, '#a16207');
  if (FONT.has(ext)) return glyph(Type, '#4b5563');
  if (SHEET.has(ext)) return glyph(Table, '#15803d');
  if (DOC.has(ext)) return glyph(BookOpen, '#b91c1c');
  if (lower === '.env' || lower.startsWith('.env.')) return glyph(KeyRound, '#ca8a04');
  if (lower.startsWith('license') || lower.startsWith('licence') || lower === 'copying') return glyph(Scale, '#6b7280');
  if (lower.endsWith('.lock') || lower === 'yarn.lock' || lower === 'pnpm-lock.yaml' || lower === 'bun.lockb') return glyph(Lock, '#6b7280');
  if (lower.endsWith('.ps1') || lower.endsWith('.bat') || lower.endsWith('.cmd')) return glyph(Terminal, '#1d4ed8');
  if (lower.endsWith('.xml') || lower.endsWith('.plist') || lower.endsWith('.svelte.config')) return glyph(FileCode2, '#ea580c');
  if (lower.endsWith('.sqlite3') || lower.endsWith('.mdb')) return glyph(Database, '#0f766e');
  if (ext && (lower.endsWith('rc') || lower.endsWith('.config'))) return glyph(Settings2, '#6b7280');
  if (TEXT.has(ext) || !ext) return glyph(FileText, 'var(--text-muted)');
  // Anything else: a rounded badge with the extension.
  const label = ext.slice(0, 4).toUpperCase();
  const hue = hueOf(ext);
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[5px] font-semibold tracking-tight', className)}
      style={{ width: size, height: size, fontSize: Math.max(6, Math.round(size * (label.length > 3 ? 0.34 : 0.42))), background: `hsl(${hue} 60% 50% / 0.16)`, color: `hsl(${hue} 55% 38%)` }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
});

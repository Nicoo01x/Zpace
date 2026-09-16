import type { NotificationMark, NotificationVariant } from '@/stores/notifications';
import { markNode, VARIANT_GLYPH } from './glyphs';

/** The glyph for a variant and mark: an image when there is one, the mark when it has one (a loading state keeps spinning), else the variant's check / cross / warning. */
export function NotificationGlyph({ variant, mark, image, size = 14 }: { variant: NotificationVariant; mark?: NotificationMark; image?: string; size?: number }) {
  if (image) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ width: size + 14, height: size + 14 }}>
        <img src={image} alt="" className="size-full object-cover" />
      </span>
    );
  }
  const node = variant === 'loading' ? null : markNode(mark, size);
  if (node) return <span className="inline-flex shrink-0 items-center justify-center text-white">{node}</span>;
  const v = VARIANT_GLYPH[variant];
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size + 6, height: size + 6, background: `color-mix(in srgb, ${v.color} 22%, transparent)`, color: v.color }}>
      {v.icon}
    </span>
  );
}

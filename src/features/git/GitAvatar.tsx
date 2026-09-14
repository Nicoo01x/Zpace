import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { avatarCandidates, remember } from './avatar-lookup';

/**
 * The author's face next to a commit. GitHub knows most of them: noreply
 * addresses carry the user id or login, other addresses go through the
 * users search (one request per address, cached), then Gravatar, then
 * initials in a colour derived from the name. Nothing but the e-mail leaves
 * the machine, and only to GitHub / Gravatar.
 */
const HUES = [12, 32, 52, 92, 152, 182, 212, 262, 292, 322];
function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function GitAvatar({ email, name, size = 18, className }: { email?: string; name: string; size?: number; className?: string }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void avatarCandidates(email ?? '').then((list) => {
      if (!cancelled) setUrls(list);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);
  const url = urls?.[idx];
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => remember((email ?? '').trim().toLowerCase(), url)}
        onError={() => {
          if (urls && idx + 1 < urls.length) setIdx(idx + 1);
          else {
            remember((email ?? '').trim().toLowerCase(), 'none');
            setUrls([]);
          }
        }}
        className={cn('shrink-0 rounded-full bg-surface-inset object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42), background: `oklch(0.62 0.13 ${hueOf(name || email || "?")})` }}
    >
      {initials(name)}
    </span>
  );
}

import { useId } from 'react';
import type { SearchEngine } from './engines';

/**
 * Search engines' marks as they really look: Google's four-colour G, Bing's
 * Fluent gradient swoosh (Microsoft, via Wikimedia Commons), DuckDuckGo's
 * white duck on its orange disc, and the others in their brand colour on a
 * white tile — the way browsers show them next to the address bar.
 */
export function EngineLogo({ engine, size = 18 }: { engine: SearchEngine; size?: number }) {
  const inner = size * 0.68;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Mark engine={engine} size={inner} />
    </span>
  );
}

function Mark({ engine, size }: { engine: SearchEngine; size: number }) {
  switch (engine.id) {
    case 'google':
      return <GoogleG size={size} />;
    case 'bing':
      return <BingMark size={size} />;
    case 'duckduckgo':
      return <DuckDuckGoMark size={size * 1.18} path={engine.path ?? ''} />;
    default:
      return engine.path ? (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={engine.color}>
          <path d={engine.path} />
        </svg>
      ) : (
        <span className="font-semibold" style={{ color: engine.color, fontSize: size * 0.8 }}>
          {engine.label[0]}
        </span>
      );
  }
}

/** The Google "G" (four brand colours). */
function GoogleG({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

/** Bing's Fluent mark (three gradient-filled shapes; viewBox from the official asset). */
function BingMark({ size }: { size: number }) {
  const id = useId();
  const g = (n: string) => `bing-${n}-${id}`;
  return (
    <svg viewBox="0 0 678 1024" width={size * 0.72} height={size} fill="none">
      <path fill={`url(#${g('a')})`} d="M0 778.3c14.6 123.8 223.8 143 236.8 79.9-.3-.4-.5-678.1-.5-678.1-3.6-46-26.2-72-61.6-96.5-33-22.7-74.4-50.4-96.9-66.4C14.2-28 .1 31.4 0 33.2c0 0 .3 746.4 0 745.1z" />
      <path fill={`url(#${g('b')})`} d="M236.8 832.8c-96.2 72.5-217 42.7-234.4-44-.8-4.2-2.4-10.4-2.4-10.4s.9 8.5 2 16.6c1.2 8.5 3.7 20.8 6.3 31.3 30 117.8 132.1 186 230.4 196.6C373.3 1034.8 497.4 931 599 855.8c6.3-6.2 15.4-16.2 18.1-20.1 66.2-95-13.6-197-72.5-193a59154 59154 0 0 0-307.7 190.1Z" />
      <path fill={`url(#${g('c')})`} fillRule="evenodd" clipRule="evenodd" d="M312.8 381c7.4 47 34.6 108.7 59.6 172.6 20.2 41.3 62 53.4 103 65.5 42.4 12.6 65.6 21 85.6 30.9 138.5 68.7 38.5 207.7 59.6 181.4 89-110.7 79.7-325.4-90-418.1-57.6-28.7-115.4-66.6-156.5-83.6-41-17-68.7 4.3-61.3 51.3z" />
      <defs>
        <radialGradient id={g('c')} cx="0" cy="0" r="1" gradientTransform="matrix(-347 -399.3 287.3 -249.8 655 722)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00CACC" />
          <stop offset="1" stopColor="#048FCE" />
        </radialGradient>
        <radialGradient id={g('b')} cx="0" cy="0" r="1" gradientTransform="matrix(526 -225.4 375.6 876.6 88.8 915.1)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00BBEC" />
          <stop offset="1" stopColor="#2756A9" />
        </radialGradient>
        <linearGradient id={g('a')} x1="118.4" x2="118.4" y1="0" y2="884.4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00BBEC" />
          <stop offset="1" stopColor="#2756A9" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** DuckDuckGo: the white duck (and its ring) on the orange disc. */
function DuckDuckGoMark({ size, path }: { size: number; path: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <circle cx="12" cy="12" r="12" fill="#DE5833" />
      <path d={path} fill="#ffffff" />
    </svg>
  );
}

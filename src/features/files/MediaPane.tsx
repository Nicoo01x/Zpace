import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Minus, Plus, Maximize2, FileAudio, Binary } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { springs } from '@/lib/motion';
import { fileSrc, readFileHead } from '@/native/system';
import { formatBytes, basename } from '@/lib/format';
import { Spinner } from '@/components/ui/Spinner';
import type { MediaKind } from './media-kind';

/**
 * Non-text files in the file pane: images on a checkerboard with zoom and
 * pan, video and audio with native controls, PDFs in the webview's reader,
 * and a hex dump of the first 4 KB for anything else. Files are served through
 * Tauri's asset protocol, so large videos stream and seek.
 */
/** Resolves the asset URL of a file once (Tauri only). */
function useFileSrc(path: string): string | null {
  const [src, setSrc] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fileSrc(path).then((url) => !cancelled && setSrc({ path, url }));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return src?.path === path ? src.url : null;
}

const CHECKER: React.CSSProperties = {
  backgroundImage: 'conic-gradient(from 90deg at 50% 50%, var(--surface-inset) 25%, transparent 0 50%, var(--surface-inset) 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
};

export function MediaView({ path, kind, onMeta }: { path: string; kind: Exclude<MediaKind, 'text'>; onMeta?: (meta: string) => void }) {
  const src = useFileSrc(path);
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (kind === 'image') return <ImageView src={src} onMeta={onMeta} />;
  if (kind === 'video') {
    return (
      <div className="flex h-full items-center justify-center bg-black/90 p-4">
        <video
          src={src}
          controls
          preload="metadata"
          className="max-h-full max-w-full rounded-md shadow-popover"
          onLoadedMetadata={(e) => onMeta?.(`${e.currentTarget.videoWidth} × ${e.currentTarget.videoHeight} · ${fmtTime(e.currentTarget.duration)}`)}
        />
      </div>
    );
  }
  if (kind === 'audio') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springs.pop} className="flex w-[420px] max-w-full flex-col items-center gap-4 rounded-2xl bg-surface-inset px-6 py-7">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <FileAudio className="size-7" strokeWidth={1.6} />
          </span>
          <div className="max-w-full truncate font-mono text-[12.5px] text-primary">{basename(path)}</div>
          <audio src={src} controls preload="metadata" className="w-full" onLoadedMetadata={(e) => onMeta?.(fmtTime(e.currentTarget.duration))} />
        </motion.div>
      </div>
    );
  }
  return <iframe src={src} title={basename(path)} className="h-full w-full border-0 bg-surface" />;
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function ImageView({ src, onMeta }: { src: string; onMeta?: (meta: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [fitScale, setFitScale] = useState(1);

  // Fit scale follows the pane size.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !nat) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      setFitScale(Math.min(1, (r.width - 32) / nat.w, (r.height - 32) / nat.h));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nat]);

  const scale = zoom === 'fit' ? fitScale : zoom;
  const step = (dir: 1 | -1) => {
    const cur = scale;
    const next = dir > 0 ? Math.min(16, cur * 1.25) : Math.max(0.05, cur / 1.25);
    setZoom(Number(next.toFixed(3)));
  };

  return (
    <div
      ref={hostRef}
      className={cn('relative h-full w-full overflow-hidden select-none', scale > fitScale ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}
      style={CHECKER}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        step(e.deltaY < 0 ? 1 : -1);
      }}
      onPointerDown={(e) => {
        if (scale <= fitScale) return;
        drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setOffset({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onDoubleClick={() => {
        setZoom((z) => (z === 'fit' ? 1 : 'fit'));
        setOffset({ x: 0, y: 0 });
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const w = e.currentTarget.naturalWidth;
            const h = e.currentTarget.naturalHeight;
            setNat({ w, h });
            onMeta?.(`${w} × ${h}`);
          }}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center', imageRendering: scale > 2 ? 'pixelated' : 'auto', opacity: nat ? 1 : 0 }}
          className="max-w-none shadow-popover transition-opacity duration-150"
        />
      </div>
      {nat ? (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface-raised/90 px-1 py-0.5 text-[11.5px] text-secondary shadow-popover backdrop-blur">
          <button type="button" aria-label={t('Zoom out')} onClick={() => step(-1)} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface-hover hover:text-primary">
            <Minus className="size-3.5" />
          </button>
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="min-w-[46px] rounded-full px-1.5 tabular hover:bg-surface-hover hover:text-primary">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" aria-label={t('Zoom in')} onClick={() => step(1)} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface-hover hover:text-primary">
            <Plus className="size-3.5" />
          </button>
          <span className="mx-0.5 h-3 w-px bg-[var(--border)]" />
          <button type="button" aria-label={t('Fit')} onClick={() => { setZoom('fit'); setOffset({ x: 0, y: 0 }); }} className={cn('inline-flex size-6 items-center justify-center rounded-full hover:bg-surface-hover hover:text-primary', zoom === 'fit' && 'text-primary')}>
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** First bytes of a file the editor cannot show, as offset · hex · ascii rows. */
export function HexView({ path }: { path: string }) {
  const [head, setHead] = useState<{ size: number; bytes: Uint8Array } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    readFileHead(path, 4096)
      .then((h) => {
        if (cancelled) return;
        const bin = atob(h.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        setHead({ size: h.size, bytes });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (error) return <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-muted">{error}</div>;
  if (!head) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const rows: Array<{ off: string; hex: string; ascii: string }> = [];
  for (let i = 0; i < head.bytes.length; i += 16) {
    const chunk = head.bytes.subarray(i, i + 16);
    rows.push({
      off: i.toString(16).padStart(8, '0'),
      hex: Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' '),
      ascii: Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join(''),
    });
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2 text-[12px] text-secondary hairline-b">
        <Binary className="size-3.5 text-muted" />
        {t('Binary file')} · {formatBytes(head.size)} · {t('first {n} bytes', { n: head.bytes.length })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-2 font-mono text-[12px] leading-[20px]">
        {rows.map((r) => (
          <div key={r.off} className="flex gap-4 whitespace-pre">
            <span className="text-muted">{r.off}</span>
            <span className="text-primary">{r.hex.padEnd(47, ' ')}</span>
            <span className="text-secondary">{r.ascii}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

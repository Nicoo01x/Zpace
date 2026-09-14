import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Clipboard, Save, MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/**
 * Crop a screenshot: the page is frozen as an image (the native webview is
 * hidden underneath), you drag a rectangle, and the crop is handed back as a
 * PNG data URL to copy, save or attach. Esc cancels; Enter confirms the last
 * action used (copy by default).
 */
export interface CropShot {
  /** data: URL of the full-pane capture */
  url: string;
  /** natural size of the capture (physical px) */
  width: number;
  height: number;
}

type Action = 'copy' | 'save' | 'chat';
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function CropOverlay({ shot, onDone, onCancel }: { shot: CropShot; onDone: (action: Action, pngBase64: string) => Promise<void> | void; onCancel: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const local = (e: ReactPointerEvent) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(0, e.clientX - r.left), r.width), y: Math.min(Math.max(0, e.clientY - r.top), r.height) };
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const p = local(e);
    drag.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const p = local(e);
    const s = drag.current;
    setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onUp = () => {
    drag.current = null;
    setSel((s) => (s && (s.w < 4 || s.h < 4) ? null : s));
  };

  const finish = async (action: Action) => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      const host = hostRef.current!.getBoundingClientRect();
      const kx = shot.width / host.width;
      const ky = shot.height / host.height;
      const img = new Image();
      img.src = shot.url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sel.w * kx));
      canvas.height = Math.max(1, Math.round(sel.h * ky));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sel.x * kx, sel.y * ky, sel.w * kx, sel.h * ky, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL('image/png').split(',')[1];
      await onDone(action, png);
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: Esc cancels, Enter copies the selection. Reads the latest handlers through a ref.
  const latest = useRef<{ finish: (a: Action) => Promise<void>; sel: Rect | null }>({ finish: async () => undefined, sel });
  useEffect(() => {
    latest.current = { finish, sel };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
      if (e.key === 'Enter' && latest.current.sel) {
        e.stopPropagation();
        void latest.current.finish('copy');
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onCancel]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 z-30 cursor-crosshair select-none overflow-hidden"
      style={{ backgroundImage: `url(${shot.url})`, backgroundSize: '100% 100%' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* dim everything except the selection */}
      <div
        className="pointer-events-none absolute inset-0 bg-black/45"
        style={sel ? { clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${sel.y}px, ${sel.x}px ${sel.y}px, ${sel.x}px ${sel.y + sel.h}px, ${sel.x + sel.w}px ${sel.y + sel.h}px, ${sel.x + sel.w}px ${sel.y}px, 0 ${sel.y}px)` } : undefined}
      />
      {sel ? (
        <>
          <div className="pointer-events-none absolute rounded-[3px] shadow-[0_0_0_1.5px_#fff,0_0_0_3px_rgba(0,0,0,0.35)]" style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }} />
          <div className="pointer-events-none absolute rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white" style={{ left: sel.x, top: Math.max(4, sel.y - 22) }}>
            {Math.round(sel.w)} × {Math.round(sel.h)}
          </div>
          <div
            className={cn('absolute flex items-center gap-1 rounded-lg bg-surface-raised p-1 shadow-popover', busy && 'opacity-60')}
            style={{ left: Math.max(0, Math.min(sel.x, size.w - 330)), top: Math.min(sel.y + sel.h + 8, Math.max(0, size.h - 40)) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Btn icon={<Clipboard />} label={t('Copy to clipboard')} onClick={() => void finish('copy')} />
            <Btn icon={<Save />} label={t('Save as PNG…')} onClick={() => void finish('save')} />
            <Btn icon={<MessageSquare />} label={t('Attach to chat')} onClick={() => void finish('chat')} />
            <Btn icon={<X />} label={t('Cancel')} onClick={onCancel} />
          </div>
        </>
      ) : (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-[12px] text-white">{t('Drag to select an area · Esc to cancel')}</div>
      )}
    </div>
  );
}

function Btn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12px] font-medium text-primary hover:bg-surface-hover [&>svg]:size-[14px]">
      {icon}
      {label}
    </button>
  );
}

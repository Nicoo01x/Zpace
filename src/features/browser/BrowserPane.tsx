import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, ExternalLink, Lock, Globe, X, Camera, Clipboard, Save, MessageSquare } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { toast } from '@/features/notifications/toast-store';
import { useWorkspaceActions } from '@/features/sessions/useWorkspaceActions';
import { cn } from '@/lib/cn';
import { useUI } from '@/stores/ui';
import { useStudio } from '@/stores/studio';
import { useSettings } from '@/stores/settings';
import { engineById } from './engines';
import { EngineLogo } from './EngineLogo';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePaneDrag } from '@/features/sessions/pane-drag';
import { IconButton } from '@/components/ui/IconButton';
import { Spinner } from '@/components/ui/Spinner';
import { browserAvailable, browserClose, browserEval, browserListen, browserNavigate, browserOpen, browserSetBounds, browserSetVisible, captureRegion, normalizeUrl } from '@/native/browser';
import { deliverPng } from './deliver';
import { watchOverlays } from './overlay-watch';
import { useBrowserMemory } from '@/stores/browser-memory';
import { CropOverlay, type CropShot } from './CropOverlay';
import { Crop } from 'lucide-react';
import { openUrl } from '@/native/system';
import { t } from '@/i18n';

/** Deferred closes: a pane that remounts immediately (StrictMode, layout moves) keeps its webview. */
const pendingClose = new Map<string, number>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Embedded browser. In the desktop shell a native child webview is placed
 * over the content area and kept in sync with it (resize / hide while a
 * dialog is open). The browser preview falls back to an <iframe>.
 */
export function BrowserPane({ browserId, url: initialUrl, projectId, focused }: { browserId: string; url: string; projectId?: string; focused: boolean }) {
  const label = `browser-${browserId}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState(initialUrl);
  const [current, setCurrent] = useState(initialUrl);
  const currentUrlRef = useRef(initialUrl);
  useEffect(() => {
    currentUrlRef.current = current;
  }, [current]);
  const [title, setTitle] = useState('');
  // A menu / popover / toast over the page: the native webview would paint above it, so it hides meanwhile.
  const [covered, setCovered] = useState(false);
  const [cropShot, setCropShot] = useState<CropShot | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Any overlay (palette, dialogs, sheets, lightbox, menus are fine) must hide the native webview.
  const dragging = usePaneDrag((s) => !!s.content);
  const studioOpen = useStudio((s) => s.open);
  const overlayOpen = useUI((s) => s.paletteOpen || s.spotlightOpen || s.stackOpen || s.welcomeOpen || s.settingsOpen || s.searchOpen || s.aboutOpen || s.cloneOpen || !!s.newProject || s.gitPanelOpen || !!s.lightbox || !!s.diffViewer || !!s.claudeLaunch) || studioOpen || dragging;

  useEffect(() => {
    if (!browserAvailable) return;
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let off: (() => void) | undefined;
    const pending = pendingClose.get(label);
    if (pending) {
      window.clearTimeout(pending);
      pendingClose.delete(label);
    }
    const bounds = () => {
      const r = host.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    };
    void (async () => {
      off = await browserListen(label, {
        onNavigated: (u) => {
          setCurrent(u);
          setAddress(u);
          if (projectId) useBrowserMemory.getState().remember(projectId, u);
        },
        onTitle: (tt) => {
          setTitle(tt);
          if (projectId) useBrowserMemory.getState().remember(projectId, currentUrlRef.current, tt);
        },
        onLoading: setLoading,
      });
      try {
        await browserOpen(label, initialUrl, bounds());
      } catch (e) {
        if (!String(e).includes('already exists')) throw e;
        await browserSetBounds(label, bounds()).catch(() => void 0);
      }
      if (disposed) return;
      setReady(true);
    })();
    const ro = new ResizeObserver(() => void browserSetBounds(label, bounds()).catch(() => void 0));
    ro.observe(host);
    const onScrollOrResize = () => void browserSetBounds(label, bounds()).catch(() => void 0);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener('resize', onScrollOrResize);
      off?.();
      pendingClose.set(
        label,
        window.setTimeout(() => {
          pendingClose.delete(label);
          void browserClose(label);
        }, 80),
      );
    };
    // The child webview lives for the pane's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  useEffect(() => {
    if (!browserAvailable || !ready) return;
    void browserSetVisible(label, !overlayOpen && !covered && !cropShot).catch(() => void 0);
  }, [overlayOpen, covered, cropShot, label, ready]);

  useEffect(() => {
    if (!browserAvailable) return;
    return watchOverlays(() => hostRef.current?.getBoundingClientRect() ?? null, setCovered);
  }, []);

  const { newSession, currentProject } = useWorkspaceActions();
  const activeSessionId = useUI((s) => s.activeSessionId);

  useEffect(() => {
    if (focused && !ready) inputRef.current?.focus();
  }, [focused, ready]);

  const go = (raw: string) => {
    const u = normalizeUrl(raw);
    setAddress(u);
    if (browserAvailable) void browserNavigate(label, u);
    else setCurrent(u);
  };

  const secure = current.startsWith('https://');
  const engine = engineById(useSettings((st) => st.browser.searchEngine));
  const hostName = hostOf(current);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 px-2 hairline-b">
        <IconButton label={t('Back')} size="sm" onClick={() => void browserEval(label, 'history.back()')} disabled={!browserAvailable}>
          <ArrowLeft />
        </IconButton>
        <IconButton label={t('Forward')} size="sm" onClick={() => void browserEval(label, 'history.forward()')} disabled={!browserAvailable}>
          <ArrowRight />
        </IconButton>
        <IconButton label={t('Reload')} size="sm" onClick={() => (browserAvailable ? void browserEval(label, 'location.reload()') : go(current))}>
          {loading ? <Spinner size={13} /> : <RotateCw />}
        </IconButton>
        <form
          className="mx-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface-inset px-2.5 text-ui transition-[box-shadow,background-color] duration-(--motion-fast) focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--border)]"
          onSubmit={(e) => {
            e.preventDefault();
            go(address);
            inputRef.current?.blur();
          }}
        >
          {secure ? <Lock className="size-[12px] shrink-0 text-success" /> : <Globe className="size-[12px] shrink-0 text-muted" />}
          {!address.trim() || !/[./]/.test(address.trim()) ? (
            <Tooltip content={t('Search with {engine}', { engine: engine.label })} side="bottom">
              <span className="inline-flex shrink-0 items-center">
                <EngineLogo engine={engine} size={16} />
              </span>
            </Tooltip>
          ) : null}
          <input
            ref={inputRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-label={t('Address')}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-primary outline-none placeholder:text-muted"
            placeholder={t('Search or enter address')}
          />
          {address ? (
            <button type="button" aria-label={t('Clear')} onClick={() => setAddress('')} className="text-muted hover:text-primary">
              <X className="size-3" />
            </button>
          ) : null}
        </form>
        <span className="hidden max-w-[220px] truncate text-[11.5px] text-muted lg:inline" title={title}>
          {title || hostName}
        </span>
        <ScreenshotMenu hostRef={hostRef} title={title || hostName} onCrop={(shot) => setCropShot(shot)} />
        <IconButton label={t('Open in system browser')} size="sm" onClick={() => void openUrl(current)}>
          <ExternalLink />
        </IconButton>
      </div>
      <div ref={hostRef} data-browser-host data-covered={covered ? 'true' : 'false'} className={cn('relative min-h-0 flex-1 bg-surface', browserAvailable && 'bg-[#fff]')}>
        {cropShot ? (
          <CropOverlay
            shot={cropShot}
            onCancel={() => setCropShot(null)}
            onDone={async (action, png) => {
              setCropShot(null);
              await deliverPng(action, png, title || hostName, { newSession, currentProject, activeSessionId });
            }}
          />
        ) : null}
        {browserAvailable ? (
          !ready ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : null
        ) : (
          <iframe title={t('Browser')} src={current} className="h-full w-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        )}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */

/**
 * Screenshot of the page: crop an area, copy to the clipboard, save as PNG, or
 * hand it to a Claude chat as an attachment. Captures the pane's screen region,
 * which is where the native webview draws — after this menu has closed and the
 * webview is painting again.
 */
function ScreenshotMenu({ hostRef, title, onCrop }: { hostRef: React.RefObject<HTMLDivElement | null>; title: string; onCrop: (shot: CropShot) => void }) {
  const { newSession, currentProject } = useWorkspaceActions();
  const activeSessionId = useUI((s) => s.activeSessionId);
  const rect = () => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };
  // The menu itself was covering the page (the webview hides while it is open): give it a moment
  // to close and the webview to paint again before grabbing the screen.
  const grab = async () => {
    await new Promise((r) => setTimeout(r, 320));
    return captureRegion(rect(), false);
  };
  const run = async (action: 'copy' | 'save' | 'chat' | 'crop') => {
    try {
      const shot = await grab();
      if (action === 'crop') onCrop({ url: `data:image/png;base64,${shot.png}`, width: shot.width, height: shot.height });
      else await deliverPng(action, shot.png, title, { newSession, currentProject, activeSessionId });
    } catch (e) {
      toast.error(t(action === 'save' ? 'Could not save' : 'Could not capture'), { description: String(e) });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={t('Screenshot')} tooltip={false} size="sm" disabled={!browserAvailable}>
          <Camera />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4}>
        <DropdownMenuLabel>{t('Screenshot of the page')}</DropdownMenuLabel>
        <DropdownMenuItem icon={<Crop />} onSelect={() => void run('crop')}>
          {t('Crop an area…')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Clipboard />} onSelect={() => void run('copy')}>
          {t('Copy to clipboard')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Save />} onSelect={() => void run('save')}>
          {t('Save as PNG…')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<MessageSquare />} onSelect={() => void run('chat')}>
          {activeSessionId ? t('Attach to the active chat') : t('Attach to a new Claude chat')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

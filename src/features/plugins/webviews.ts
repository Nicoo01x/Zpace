import { browserAvailable, browserCdp, browserClose, browserDevtools, browserEmulate, browserEval, browserListen, browserNavigate, browserOpen, browserSetBounds, browserSetShape, browserSetVisible, browserSnapshot, browserZoom, captureRegion, type Bounds, type Emulation, type ShapeHole } from '@/native/browser';
import { watchOverlays } from '@/features/browser/overlay-watch';
import { isWindows } from '@/lib/platform';
import { uid } from '@/lib/id';

/** A rectangle in the plugin page's own CSS px. */
export interface WebviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebviewShape {
  radius: number;
  holes?: ShapeHole[];
}

interface Item {
  id: string;
  label: string;
  rect: WebviewRect;
  /** The page's own wish. */
  wanted: boolean;
  /** A menu, popover or toast overlaps it. */
  covered: boolean;
  ready: boolean;
  shape: WebviewShape | null;
  bounds: Bounds | null;
  shown: boolean | null;
  off: Array<() => void>;
}

/**
 * The native webviews a plugin page opens with `zpace.webview.*`, owned by
 * the pane that hosts the page. Rects come in relative to the page; the
 * window position follows from where the page's frame is, so they travel
 * with a float and resize with a tile. A native webview paints above every
 * DOM element, so each one hides while a dialog, the palette or a menu is
 * over it, and they all close with the pane.
 */
export class PaneWebviews {
  private items = new Map<string, Item>();
  private hostHidden = false;
  private closing: number | null = null;
  private frameEl: HTMLIFrameElement | null = null;

  constructor(private pluginId: string) {}

  /** The page's frame, once it is in the DOM (and null when it leaves). */
  attach(el: HTMLIFrameElement | null) {
    this.frameEl = el;
  }

  private frame() {
    return this.frameEl;
  }

  private post(message: unknown) {
    this.frameEl?.contentWindow?.postMessage(message, '*');
  }

  /** What this platform can do, so a page can draw a flat screen where shapes are not available. */
  capabilities() {
    return { available: browserAvailable, shape: browserAvailable && isWindows, emulate: browserAvailable && isWindows, snapshot: browserAvailable };
  }

  private get(id: string): Item {
    const item = this.items.get(id);
    if (!item) throw new Error(`webview "${id}" is not open`);
    return item;
  }

  private bounds(item: Item): Bounds | null {
    const f = this.frame()?.getBoundingClientRect();
    if (!f) return null;
    return { x: Math.round(f.left + item.rect.x), y: Math.round(f.top + item.rect.y), width: Math.max(1, Math.round(item.rect.width)), height: Math.max(1, Math.round(item.rect.height)) };
  }

  private windowRect(item: Item): DOMRect | null {
    const b = item.bounds ?? this.bounds(item);
    return b ? new DOMRect(b.x, b.y, b.width, b.height) : null;
  }

  async open(opts: { id: string; url: string; rect: WebviewRect }): Promise<void> {
    if (!browserAvailable) throw new Error('native webviews only exist in the desktop app');
    const id = String(opts.id);
    if (this.items.has(id)) {
      await this.setRect(id, opts.rect);
      await this.navigate(id, opts.url);
      return;
    }
    const item: Item = { id, label: `plugin-${this.pluginId}-${uid('wv')}`, rect: opts.rect, wanted: true, covered: false, ready: false, shape: null, bounds: null, shown: null, off: [] };
    this.items.set(id, item);
    item.off.push(
      await browserListen(item.label, {
        onNavigated: (url) => this.post({ zpace: 'event', event: 'webview:navigated', payload: { id, url } }),
        onTitle: (title) => this.post({ zpace: 'event', event: 'webview:title', payload: { id, title } }),
        onLoading: (loading) => this.post({ zpace: 'event', event: 'webview:loading', payload: { id, loading } }),
      }),
    );
    item.off.push(
      watchOverlays(
        () => this.windowRect(item),
        (covered) => {
          item.covered = covered;
          void this.apply(item);
        },
      ),
    );
    const b = this.bounds(item);
    if (!b) throw new Error('the page is not on screen');
    try {
      await browserOpen(item.label, opts.url, b);
    } catch (e) {
      this.dispose(item);
      throw e;
    }
    item.bounds = b;
    item.ready = true;
    await this.apply(item);
  }

  async setRect(id: string, rect: WebviewRect): Promise<void> {
    const item = this.get(id);
    item.rect = rect;
    await this.place(item);
  }

  /** Re-place every webview from where the frame is now — after the float moved, the tile resized, the window changed. */
  sync(): void {
    for (const item of this.items.values()) void this.place(item);
  }

  private async place(item: Item): Promise<void> {
    if (!item.ready) return;
    const b = this.bounds(item);
    if (!b) return;
    const prev = item.bounds;
    if (prev && prev.x === b.x && prev.y === b.y && prev.width === b.width && prev.height === b.height) return;
    item.bounds = b;
    await browserSetBounds(item.label, b).catch(() => void 0);
    // a region is fixed to the window's own pixels: a new size needs it cut again
    if (item.shape && (!prev || prev.width !== b.width || prev.height !== b.height)) await this.cut(item);
  }

  async shape(id: string, shape: WebviewShape | null): Promise<boolean> {
    const item = this.get(id);
    item.shape = shape;
    return this.cut(item);
  }

  private async cut(item: Item): Promise<boolean> {
    if (!item.ready) return false;
    const b = item.bounds ?? this.bounds(item);
    if (!b) return false;
    const s = item.shape;
    return browserSetShape(item.label, b.width, b.height, s?.radius ?? 0, s?.holes ?? []).catch(() => false);
  }

  navigate(id: string, url: string): Promise<void> {
    return browserNavigate(this.get(id).label, url);
  }

  eval(id: string, js: string): Promise<void> {
    return browserEval(this.get(id).label, js);
  }

  zoom(id: string, factor: number): Promise<void> {
    return browserZoom(this.get(id).label, factor);
  }

  emulate(id: string, emulation: Emulation | null): Promise<boolean> {
    return browserEmulate(this.get(id).label, emulation);
  }

  devtools(id: string): Promise<void> {
    return browserDevtools(this.get(id).label);
  }

  cdp(id: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return browserCdp(this.get(id).label, method, params);
  }

  async setVisible(id: string, visible: boolean): Promise<void> {
    const item = this.get(id);
    item.wanted = visible;
    await this.apply(item);
  }

  /** A modal layer of the app is up (or down): every webview hides (or shows again). */
  setHostHidden(hidden: boolean): void {
    if (this.hostHidden === hidden) return;
    this.hostHidden = hidden;
    for (const item of this.items.values()) void this.apply(item);
  }

  private async apply(item: Item): Promise<void> {
    if (!item.ready) return;
    const visible = item.wanted && !this.hostHidden && !item.covered;
    if (visible === item.shown) return;
    item.shown = visible;
    await browserSetVisible(item.label, visible).catch(() => void 0);
  }

  /** A PNG data URL of what the webview shows — its own pixels where the platform gives them, a screen grab otherwise. */
  async snapshot(id: string): Promise<string> {
    const item = this.get(id);
    // a hidden webview paints nothing and its capture never completes
    if (item.shown === false) throw new Error('the webview is hidden');
    try {
      return `data:image/png;base64,${await browserSnapshot(item.label)}`;
    } catch {
      const b = item.bounds ?? this.bounds(item);
      if (!b) throw new Error('nothing to capture');
      const shot = await captureRegion(b, false);
      return `data:image/png;base64,${shot.png}`;
    }
  }

  /** The PNG (base64) for the host to copy, save or attach. */
  async png(id: string): Promise<string> {
    const url = await this.snapshot(id);
    return url.slice(url.indexOf(',') + 1);
  }

  async close(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;
    this.dispose(item);
    await browserClose(item.label).catch(() => void 0);
  }

  private dispose(item: Item) {
    this.items.delete(item.id);
    for (const off of item.off) off();
  }

  closeAll(): void {
    for (const item of [...this.items.values()]) void this.close(item.id);
  }

  /**
   * The pane's effect is going away — maybe for good, maybe to run again at
   * once (StrictMode, a layout move): the webviews get a moment before they
   * close, and `resume()` keeps them.
   */
  suspend(): void {
    this.closing = window.setTimeout(() => {
      this.closing = null;
      this.closeAll();
    }, 80);
  }

  resume(): void {
    if (this.closing !== null) window.clearTimeout(this.closing);
    this.closing = null;
  }
}

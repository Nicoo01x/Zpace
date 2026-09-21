import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

gsap.registerPlugin(Draggable, InertiaPlugin);

/**
 * The nico-mockup card physics for any floating element (the same numbers as
 * `Dialog.tsx`, which keeps its own copy because it also drives an overlay):
 * grab it anywhere and it follows the pointer 1:1, shrinking from the grab
 * point (0 → 1, 220 → .75, 350 → .5, 500 → .12); past 430 px, or thrown
 * (> 900 px/s past 260), it flies off and `onFly` runs; let go near and it
 * springs back (elastic.out(0.75, 0.55), .58). Do not re-tune the numbers.
 */
const SCALE_STOPS: ReadonlyArray<readonly [distance: number, scale: number]> = [
  [0, 1],
  [220, 0.75],
  [350, 0.5],
  [500, 0.12],
];

function mapDistanceToScale(distance: number): number {
  for (let i = 1; i < SCALE_STOPS.length; i++) {
    const [d0, s0] = SCALE_STOPS[i - 1];
    const [d1, s1] = SCALE_STOPS[i];
    if (distance <= d1) return gsap.utils.mapRange(d0, d1, s0, s1, distance);
  }
  return SCALE_STOPS[SCALE_STOPS.length - 1][1];
}

/** Where a drag must not start: controls (Draggable's own list) and anything the pointer selects or edits. */
const NOT_A_HANDLE = 'input, textarea, select, button, a, [contenteditable], .selectable, [data-no-drag]';

export function createDragToDismiss(card: HTMLElement, opts: { onFly: () => void; onPress?: () => void }): () => void {
  const origin = { x: 50, y: 50 };
  gsap.set(card, { x: 0, y: 0, transformOrigin: '50% 50%', filter: 'blur(0px)' });
  // Draggable has no getVelocity(): InertiaPlugin tracks x/y for it once registered, even with inertia off.
  const velocity = (axis: 'x' | 'y') => InertiaPlugin.getVelocity(card, axis);
  const [drag] = Draggable.create(card, {
    type: 'x,y',
    inertia: false,
    zIndexBoost: false,
    // gsap 3.15 only spares clickables when this is an explicit false — undefined drags them too
    dragClickables: false,
    cursor: 'grab',
    activeCursor: 'grabbing',
    clickableTest: (el: Element) => !!el.closest(NOT_A_HANDLE),

    onPress(this: Draggable, event: PointerEvent | TouchEvent) {
      gsap.killTweensOf(card);
      opts.onPress?.();
      // the transform-origin at the exact point under the pointer
      const rect = card.getBoundingClientRect();
      const clientX = 'clientX' in event ? event.clientX : this.pointerX - window.scrollX;
      const clientY = 'clientY' in event ? event.clientY : this.pointerY - window.scrollY;
      const ox = ((clientX - rect.left) / rect.width) * 100;
      const oy = ((clientY - rect.top) / rect.height) * 100;
      // grabbed mid-bounce (scale ≠ 1): moving the origin would make it jump, so x/y absorb the difference
      const scale = gsap.getProperty(card, 'scale') as number;
      const dx = ((ox - origin.x) / 100) * (rect.width / scale) * (1 - scale);
      const dy = ((oy - origin.y) / 100) * (rect.height / scale) * (1 - scale);
      origin.x = ox;
      origin.y = oy;
      gsap.set(card, { transformOrigin: `${ox}% ${oy}%`, x: this.x - dx, y: this.y - dy });
      this.update();
    },

    onDrag(this: Draggable) {
      const distance = Math.hypot(this.x, this.y);
      gsap.set(card, {
        x: this.x,
        y: this.y,
        scale: mapDistanceToScale(distance),
        opacity: gsap.utils.interpolate(1, 0.86, gsap.utils.clamp(0, 1, (distance - 350) / 180)),
        filter: `blur(${gsap.utils.interpolate(0, 3, gsap.utils.clamp(0, 1, (distance - 220) / 280))}px)`,
      });
    },

    onDragEnd(this: Draggable) {
      const distance = Math.hypot(this.x, this.y);
      const scale = mapDistanceToScale(distance);
      const vx = velocity('x');
      const vy = velocity('y');
      const speed = Math.hypot(vx, vy);
      if (scale <= 0.35 || distance > 430 || (speed > 900 && distance > 260)) {
        gsap.to(card, { x: this.x + vx * 0.12, y: this.y + vy * 0.12, scale: 0.08, opacity: 0, duration: 0.18, ease: 'power2.in', onComplete: opts.onFly });
        return;
      }
      gsap.to(card, { x: 0, y: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.58, ease: 'elastic.out(0.75, 0.55)' });
    },
  });
  return () => drag.kill();
}

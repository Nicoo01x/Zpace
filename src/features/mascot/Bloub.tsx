import { memo, useEffect, useId, useRef, useState } from 'react';
import { BotEngine, type BotFrame } from './bloub/engine';
import { NOTIF_BLUE } from './bloub/decor';
import { clamp, easings } from './bloub/math';
import { lookTarget, TURN_TIME } from './bloub/gaze';
import { EXPRESSION_BY_ID } from './bloub/expressions';
import { SHAPE_BY_ID, mixHex } from './bloub/skins';
import { DEMI_VIEWBOX, RAYON } from './bloub/repere';
import { STATE_BY_ID, type StateId } from './bloub/states';

/**
 * React renderer for the bloub avatar engine (MIT, © Jérémy Perret — see
 * ./bloub/LICENSE): one shape morphing through the engine's states, eyes cut
 * as holes in the body, gaze following the pointer. A port of BloubBot.vue:
 * the engine is a pure function of time, this only draws the sampled frame.
 */
export interface BloubProps {
  size?: number;
  /** shape id from ./bloub/skins (cercle, galet, squircle, capsule, triangle, hexagone, nuage, goutte) */
  shape?: string;
  /** body colour, any hex */
  color?: string;
  /** resting expression id from ./bloub/expressions */
  expression?: string;
  /** colour behind the avatar (the eye holes show it; particles fade into it) */
  paper?: string;
  state?: StateId;
  /** eyes follow the pointer */
  follow?: boolean;
  /** freeze at this time (seconds) — no animation loop, for previews */
  frozenAt?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Bloub = memo(function Bloub({ size = 96, shape = 'nuage', color = '#0a0a0c', expression = 'neutre', paper = '#ffffff', state = 'idle', follow = true, frozenAt, className, style }: BloubProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const maskId = `bloub-mask-${uid}`;
  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BotEngine(RAYON, state, SHAPE_BY_ID.get(shape)?.radii ?? null, EXPRESSION_BY_ID.get(expression) ?? null);
  }
  const engine = engineRef.current;
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(frozenAt ?? 0));
  const clock = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const aiming = useRef(false);
  const turnSince = useRef(0);

  // State / shape / expression changes morph on the engine's clock.
  useEffect(() => {
    if (engine.state !== state) engine.setState(state, clock.current);
  }, [engine, state]);
  useEffect(() => {
    engine.setShape(SHAPE_BY_ID.get(shape)?.radii ?? null, clock.current);
    if (frozenAt !== undefined) setFrame(engine.sample(frozenAt));
  }, [engine, shape, frozenAt]);
  useEffect(() => {
    engine.setExpression(EXPRESSION_BY_ID.get(expression) ?? null, clock.current);
    if (frozenAt !== undefined) setFrame(engine.sample(frozenAt));
  }, [engine, expression, frozenAt]);

  // Animation loop (skipped for frozen previews).
  useEffect(() => {
    if (frozenAt !== undefined) return;
    let raf = 0;
    let last = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      pointer.current = null;
    };
    if (follow) {
      window.addEventListener('pointermove', onMove);
      document.addEventListener('pointerleave', onLeave);
    }
    const release = () => {
      if (!aiming.current) return;
      engine.setLook(null, clock.current, TURN_TIME);
      aiming.current = false;
    };
    const aim = () => {
      // Only resting-face states take a gaze; elsewhere the pose is the animation.
      if (!STATE_BY_ID.get(engine.state)?.baseFace) {
        release();
        return;
      }
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;
      if (!aiming.current) turnSince.current = clock.current;
      const hw = Math.max(1, window.innerWidth / 2);
      const hh = Math.max(1, window.innerHeight / 2);
      const p = pointer.current;
      engine.setLook(
        lookTarget({
          nx: p ? clamp((p.x - (box.left + box.width / 2)) / hw, -1, 1) : 0,
          ny: p ? clamp((p.y - (box.top + box.height / 2)) / hh, -1, 1) : 0,
          tour: easings.easeOutQuint(clamp((clock.current - turnSince.current) / TURN_TIME)),
          pointer: p !== null,
        }),
        clock.current,
      );
      aiming.current = true;
    };
    // 30 fps is plenty for a face: half the renders of a 60 Hz loop, invisible on a 64 px creature.
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (last && ms - last < 31) return;
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clock.current += dt;
      if (follow) aim();
      else release();
      setFrame(engine.sample(clock.current));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [engine, follow, frozenAt]);

  const VB = DEMI_VIEWBOX;
  const dotAttrs = (dot: BotFrame['dots'][number]) => {
    const fill = dot.color ?? (dot.depth === undefined ? color : mixHex(paper, color, dot.depth));
    return dot.d
      ? { fill, opacity: dot.opacity, d: dot.d, transform: `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})` }
      : { fill, opacity: dot.opacity, cx: dot.x, cy: dot.y, r: dot.r };
  };
  const Dot = ({ dot, k }: { dot: BotFrame['dots'][number]; k: string }) => {
    const a = dotAttrs(dot);
    return 'd' in a ? <path key={k} {...a} /> : <circle key={k} {...a} />;
  };

  return (
    <svg ref={svgRef} width={size} height={size} viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`} role="img" aria-label="Zpace mascot" className={className} style={style}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch ? <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" /> : null}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient key={arc.id} id={`${uid}-${arc.id}`} gradientUnits="userSpaceOnUse" x1={arc.grad.x1} y1={arc.grad.y1} x2={arc.grad.x2} y2={arc.grad.y2}>
            {arc.grad.stops.map((c, i) => (
              <stop key={i} offset={i / (arc.grad.stops.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        ))}
      </defs>
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path key={`b${arc.id}`} d={arc.back} stroke={`url(#${uid}-${arc.id})`} strokeWidth={arc.width} opacity={arc.opacity} />
        ))}
      </g>
      {frame.dotsBehind ? <g>{frame.dots.map((dot, i) => <Dot key={`pb${i}`} dot={dot} k={`pb${i}`} />)}</g> : null}
      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={color} />
        </g>
      </g>
      {!frame.dotsBehind ? <g>{frame.dots.map((dot, i) => <Dot key={`pf${i}`} dot={dot} k={`pf${i}`} />)}</g> : null}
      {frame.notif ? <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} /> : null}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path key={`f${arc.id}`} d={arc.front} stroke={`url(#${uid}-${arc.id})`} strokeWidth={arc.width} opacity={arc.opacity} />
        ))}
      </g>
    </svg>
  );
});

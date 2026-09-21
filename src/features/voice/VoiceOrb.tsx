import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';
import type { VoicePhase } from './store';

/**
 * The glowing orb (a 21st.dev gradient-orb shader, run on raw WebGL rather
 * than three.js): three noise-mixed colours inside a breathing ring, rotated
 * in YIQ so the shader's blue lands on the app's accent. The phase sets how
 * it moves — wide and slow while it listens, quick while it thinks, pulsing
 * to the voice while it speaks, calm while it waits — and the parameters ease
 * between phases so a change never snaps. 30 fps, only while mounted.
 */
const VERT = `attribute vec2 position; varying vec2 vUv; void main(){ vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAG = `precision highp float;
uniform float iTime; uniform vec3 iResolution; uniform float hue; uniform float rot; uniform float noiseScale; uniform float innerRadius; uniform float pulseAmp; uniform float pulseHz;
varying vec2 vUv;
vec3 rgb2yiq(vec3 c){ return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 yiq2rgb(vec3 c){ return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }
vec3 adjustHue(vec3 color, float hueDeg){ float h = radians(hueDeg); vec3 yiq = rgb2yiq(color); float ca = cos(h); float sa = sin(h); yiq.yz = vec2(yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca); return yiq2rgb(yiq); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787)); p3 += dot(p3, p3.yxz + 19.19); return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx); }
float snoise3(vec3 p){ const float K1 = 0.333333333; const float K2 = 0.166666667; vec3 i = floor(p + (p.x + p.y + p.z) * K1); vec3 d0 = p - (i - (i.x + i.y + i.z) * K2); vec3 e = step(vec3(0.0), d0 - d0.yzx); vec3 i1 = e * (1.0 - e.zxy); vec3 i2 = 1.0 - e.zxy * (1.0 - e); vec3 d1 = d0 - (i1 - K2); vec3 d2 = d0 - (i2 - K1); vec3 d3 = d0 - 0.5; vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0); vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0))); return dot(vec4(31.316), n); }
vec4 extractAlpha(vec3 c){ float a = max(max(c.r, c.g), c.b); return vec4(c.rgb / (a + 1e-5), a); }
const vec3 baseColor0 = vec3(0.239, 0.353, 1.0);
const vec3 baseColor1 = vec3(0.616, 0.0, 1.0);
const vec3 baseColor2 = vec3(1.0, 0.373, 0.122);
const vec3 baseColor3 = vec3(0.0, 0.0, 0.0);
float light1(float intensity, float attenuation, float dist){ return intensity / (1.0 + dist * attenuation); }
float light2(float intensity, float attenuation, float dist){ return intensity / (1.0 + dist * dist * attenuation); }
vec4 draw(vec2 uv){
  vec3 color0 = adjustHue(baseColor0, hue); vec3 color1 = adjustHue(baseColor1, hue); vec3 color2 = adjustHue(baseColor2, hue); vec3 color3 = adjustHue(baseColor3, hue);
  float len = length(uv); float invLen = len > 0.0 ? 1.0 / len : 0.0;
  float pulse = sin(iTime * pulseHz) * pulseAmp;
  float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
  float r0 = mix(mix(innerRadius + pulse, 1.0, 0.4), mix(innerRadius + pulse, 1.0, 0.6), n0);
  float d0 = distance(uv, (r0 * invLen) * uv);
  float v0 = light1(1.0, 10.0, d0); v0 *= smoothstep(r0 * 1.05, r0, len);
  float cl = cos(atan(uv.y, uv.x) + iTime * 2.0) * 0.5 + 0.5;
  float a = iTime * -1.0; vec2 pos = vec2(cos(a), sin(a)) * r0; float d = distance(uv, pos);
  float v1 = light2(1.5, 5.0, d); v1 *= light1(1.0, 50.0, d0);
  float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
  float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);
  vec3 col = mix(color1, color2, cl); col = mix(col, color0, n0); col = mix(color3, col, v0); col = (col + v1) * v2 * v3; col = clamp(col, 0.0, 1.0);
  return extractAlpha(col);
}
void main(){
  vec2 center = iResolution.xy * 0.5; float size = min(iResolution.x, iResolution.y);
  vec2 uv = (vUv * iResolution.xy - center) / size * 2.0;
  float s = sin(rot); float c = cos(rot); uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  vec4 col = draw(uv);
  gl_FragColor = vec4(col.rgb * col.a, col.a);
}`;

interface Look {
  rotationSpeed: number;
  noiseScale: number;
  innerRadius: number;
  pulseAmp: number;
  pulseHz: number;
}

/** How each phase moves. */
const LOOKS: Record<VoicePhase, Look> = {
  off: { rotationSpeed: 0.3, noiseScale: 0.65, innerRadius: 0.1, pulseAmp: 0.02, pulseHz: 1.5 },
  setup: { rotationSpeed: 0.9, noiseScale: 0.75, innerRadius: 0.1, pulseAmp: 0.02, pulseHz: 2 },
  idle: { rotationSpeed: 0.25, noiseScale: 0.65, innerRadius: 0.1, pulseAmp: 0.02, pulseHz: 1.5 },
  listening: { rotationSpeed: 0.55, noiseScale: 0.5, innerRadius: 0.2, pulseAmp: 0.06, pulseHz: 2.2 },
  thinking: { rotationSpeed: 1.6, noiseScale: 0.9, innerRadius: 0.08, pulseAmp: 0.03, pulseHz: 4 },
  speaking: { rotationSpeed: 0.4, noiseScale: 0.6, innerRadius: 0.24, pulseAmp: 0.09, pulseHz: 7 },
};

/** The shader's blue is about 231°; the rotation that turns it into the app's accent. */
function accentHueOffset(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60 + 360) % 360) - 231;
}

const FPS = 30;

export function VoiceOrb({ phase, level = 0, size = 96, className }: { phase: VoicePhase; level?: number; size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const levelRef = useRef(level);
  const reduced = useReducedMotion();
  useEffect(() => {
    phaseRef.current = phase;
    levelRef.current = level;
  }, [phase, level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    // One triangle covers the canvas; the fragment shader does the rest.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    const uTime = u('iTime');
    const uRes = u('iResolution');
    const uHue = u('hue');
    const uRot = u('rot');
    const uNoise = u('noiseScale');
    const uInner = u('innerRadius');
    const uAmp = u('pulseAmp');
    const uHz = u('pulseHz');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const look: Look = { ...LOOKS[phaseRef.current] };
    let hue = accentHueOffset();
    let rot = 0;
    let time = 0;
    let last = performance.now();
    let lastFrame = 0;
    let frames = 0;
    let raf = 0;
    const still = !!reduced;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 1000 / FPS) return;
      lastFrame = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const base = LOOKS[phaseRef.current];
      // While it listens, the voice itself widens the ring and deepens the pulse.
      const voice = phaseRef.current === 'listening' ? levelRef.current : 0;
      const target: Look = { ...base, innerRadius: base.innerRadius + voice * 0.18, pulseAmp: base.pulseAmp + voice * 0.08 };
      // Ease toward the phase's look: a change of state is heard before it is seen, never a jump.
      const k = 1 - Math.exp(-dt * 4);
      look.rotationSpeed += (target.rotationSpeed - look.rotationSpeed) * k;
      look.noiseScale += (target.noiseScale - look.noiseScale) * k;
      look.innerRadius += (target.innerRadius - look.innerRadius) * k;
      look.pulseAmp += (target.pulseAmp - look.pulseAmp) * k;
      look.pulseHz += (target.pulseHz - look.pulseHz) * k;
      if (!still) {
        time += dt;
        rot += dt * look.rotationSpeed;
      }
      // The accent can change under the orb (a theme pack): re-read it every couple of seconds.
      if (++frames % 60 === 0) hue = accentHueOffset();
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, time);
      gl.uniform3f(uRes, canvas.width, canvas.height, 1);
      gl.uniform1f(uHue, hue);
      gl.uniform1f(uRot, rot);
      gl.uniform1f(uNoise, look.noiseScale);
      gl.uniform1f(uInner, look.innerRadius);
      gl.uniform1f(uAmp, still ? 0 : look.pulseAmp);
      gl.uniform1f(uHz, look.pulseHz);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    // The context is kept: a canvas hands out the same one again, and losing it on purpose leaves the next mount
    // (StrictMode's second pass, a re-open) with a dead context and a blank disc.
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [size, reduced]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className={cn('block', className)} aria-hidden />;
}

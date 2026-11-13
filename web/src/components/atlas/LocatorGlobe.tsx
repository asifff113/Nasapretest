// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The locator globe: a small orthographic Earth in SVG that turns to face the places on a page (the atlas
// "you are here" plate). It draws the bundled outlines, a graticule, each place's box with a pulse, and for two
// places the great-circle arc between them. Projection arithmetic is layout only; no value is computed.
// Offline (no outlines) it still draws the sphere, the graticule and the places.
import { useEffect, useId, useMemo, useState } from 'react';
import { loadOutlines, type Outlines } from '../../map/outlines';
import { cn } from '../../ui/common/utils';

export interface LocatorMark {
  /** Centre, degrees. */
  lon: number;
  lat: number;
  /** [west, south, east, north], degrees. */
  bbox?: [number, number, number, number] | null;
  /** Short text beside the mark (already formatted). */
  label?: string;
  tone?: 'accent' | 'teal' | 'link';
}

const D2R = Math.PI / 180;

/** Fixed plate colours (the globe is always the dark ocean plate, in both themes). */
const TONE = { accent: '#e9b44c', teal: '#4fcfa4', link: '#8cc4ef' } as const;
const LABEL = {
  accent: 'border-[#e9b44c]/60 bg-[#071a33]/80 text-[#fbe6b8]',
  teal: 'border-[#4fcfa4]/60 bg-[#071a33]/80 text-[#bff3e0]',
  link: 'border-[#8cc4ef]/60 bg-[#071a33]/80 text-[#d9ecfb]',
} as const;

type Vec = [number, number, number];

function toVec(lon: number, lat: number): Vec {
  const l = lon * D2R;
  const p = lat * D2R;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

function fromVec(v: Vec): [number, number] {
  return [Math.atan2(v[1], v[0]) / D2R, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R];
}

/** Rotate so that (lon0, lat0) faces the viewer; returns screen x, y (unit sphere) and depth. */
function rotate(lon: number, lat: number, lon0: number, lat0: number): Vec {
  const l = (lon - lon0) * D2R;
  const p = lat * D2R;
  const p0 = lat0 * D2R;
  const x1 = Math.cos(p) * Math.cos(l);
  const y1 = Math.cos(p) * Math.sin(l);
  const z1 = Math.sin(p);
  const x2 = x1 * Math.cos(p0) + z1 * Math.sin(p0);
  const z2 = -x1 * Math.sin(p0) + z1 * Math.cos(p0);
  return [y1, z2, x2];
}

interface Proj {
  lon0: number;
  lat0: number;
  cx: number;
  cy: number;
  r: number;
}

const fx = (n: number) => Math.round(n * 10) / 10;

/** An open line: broken where it goes behind the globe. */
function linePath(pts: [number, number][], pr: Proj): string {
  let d = '';
  let pen = false;
  for (const [lon, lat] of pts) {
    const [x, y, z] = rotate(lon, lat, pr.lon0, pr.lat0);
    if (z < 0) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${fx(pr.cx + pr.r * x)} ${fx(pr.cy - pr.r * y)}`;
    pen = true;
  }
  return d;
}

/** A filled shape: points behind the globe are pressed onto its rim, so the shape stops at the horizon. */
function areaPath(pts: [number, number][], pr: Proj): string {
  let d = '';
  let any = false;
  pts.forEach(([lon, lat], i) => {
    const r = rotate(lon, lat, pr.lon0, pr.lat0);
    let x = r[0];
    let y = r[1];
    if (r[2] < 0) {
      const n = Math.hypot(x, y) || 1;
      x /= n;
      y /= n;
    } else any = true;
    d += `${i === 0 ? 'M' : 'L'}${fx(pr.cx + pr.r * x)} ${fx(pr.cy - pr.r * y)}`;
  });
  return any ? `${d}Z` : '';
}

function bboxRing([w, s, e, n]: [number, number, number, number]): [number, number][] {
  const out: [number, number][] = [];
  const step = 0.5;
  for (let x = w; x < e; x += step) out.push([x, s]);
  for (let y = s; y < n; y += step) out.push([e, y]);
  for (let x = e; x > w; x -= step) out.push([x, n]);
  for (let y = n; y > s; y -= step) out.push([w, y]);
  return out;
}

function graticule(): [number, number][][] {
  const lines: [number, number][][] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    const l: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += 4) l.push([lon, lat]);
    lines.push(l);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const l: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 4) l.push([lon, lat]);
    lines.push(l);
  }
  return lines;
}
const GRATICULE = graticule();

/** The great circle between two points, lifted off the surface in the middle. */
function arcPoints(a: LocatorMark, b: LocatorMark, pr: Proj): string {
  const va = toVec(a.lon, a.lat);
  const vb = toVec(b.lon, b.lat);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  if (om < 1e-6) return '';
  let d = '';
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s1 = Math.sin((1 - t) * om) / Math.sin(om);
    const s2 = Math.sin(t * om) / Math.sin(om);
    const v: Vec = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
    const [lon, lat] = fromVec(v);
    const [x, y] = rotate(lon, lat, pr.lon0, pr.lat0);
    const lift = 1 + Math.min(0.22, om * 0.35) * Math.sin(Math.PI * t);
    d += `${i === 0 ? 'M' : 'L'}${fx(pr.cx + pr.r * x * lift)} ${fx(pr.cy - pr.r * y * lift)}`;
  }
  return d;
}

function centreOf(marks: LocatorMark[]): [number, number] {
  if (marks.length === 0) return [20, 15];
  const s: Vec = [0, 0, 0];
  for (const m of marks) {
    const v = toVec(m.lon, m.lat);
    s[0] += v[0];
    s[1] += v[1];
    s[2] += v[2];
  }
  const n = Math.hypot(...s) || 1;
  return fromVec([s[0] / n, s[1] / n, s[2] / n]);
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useOutlines(): Outlines | null {
  const [o, setO] = useState<Outlines | null>(null);
  useEffect(() => {
    let live = true;
    void loadOutlines().then((x) => {
      if (live) setO(x);
    });
    return () => {
      live = false;
    };
  }, []);
  return o;
}

/** Turns the globe towards the target once, on arrival (skipped for reduced motion). */
function useSpin(target: [number, number], still: boolean): [number, number] {
  const animate = !still && !reducedMotion();
  const [rot, setRot] = useState<[number, number]>(() => [target[0] - 70, target[1] * 0.4]);
  const key = `${target[0].toFixed(2)},${target[1].toFixed(2)}`;
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const from: [number, number] = [target[0] - 70, target[1] * 0.4];
    const t0 = performance.now();
    const dur = 1600;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setRot([from[0] + (target[0] - from[0]) * e, from[1] + (target[1] - from[1]) * e]);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, animate]);
  return animate ? rot : target;
}

export function LocatorGlobe({
  marks,
  label,
  size = 360,
  arc = false,
  className,
  testId,
  still = false,
  bare = false,
}: {
  marks: LocatorMark[];
  /** No turn on arrival (small cards). */
  still?: boolean;
  /** No orbit ring and no labels (small cards). */
  bare?: boolean;
  /** What the picture shows, for screen readers. */
  label: string;
  size?: number;
  arc?: boolean;
  className?: string;
  testId?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const outlines = useOutlines();
  const [clon, clat] = centreOf(marks);
  const [lon0, lat0] = useSpin([clon, Math.max(-50, Math.min(50, clat * 0.8))], still);
  const W = 400;
  const pr: Proj = { lon0, lat0, cx: W / 2, cy: W / 2, r: W * (bare ? 0.46 : 0.36) };

  const land = useMemo(() => (outlines ? outlines.land.map((ring) => areaPath(ring, pr)).join('') : ''), [outlines, lon0, lat0]); // eslint-disable-line react-hooks/exhaustive-deps
  const borders = useMemo(() => (outlines ? outlines.borders.map((l) => linePath(l, pr)).join('') : ''), [outlines, lon0, lat0]); // eslint-disable-line react-hooks/exhaustive-deps
  const grat = useMemo(() => GRATICULE.map((l) => linePath(l, pr)).join(''), [lon0, lat0]); // eslint-disable-line react-hooks/exhaustive-deps

  const placed = marks.map((m) => {
    const [x, y, z] = rotate(m.lon, m.lat, lon0, lat0);
    return { m, x: pr.cx + pr.r * x, y: pr.cy - pr.r * y, front: z >= 0, box: m.bbox ? areaPath(bboxRing(m.bbox), pr) : '' };
  });
  const arcD = arc && marks.length === 2 ? arcPoints(marks[0]!, marks[1]!, pr) : '';

  return (
    <figure className={cn('locator relative m-0', className)} style={{ width: '100%', maxWidth: size }} data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        <defs>
          <radialGradient id={`sea-${uid}`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#1d5d93" />
            <stop offset="55%" stopColor="#0d3157" />
            <stop offset="100%" stopColor="#061529" />
          </radialGradient>
          <radialGradient id={`air-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor="#8cc4ef" stopOpacity="0" />
            <stop offset="90%" stopColor="#8cc4ef" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8cc4ef" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`shade-${uid}`} cx="34%" cy="30%" r="80%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
          <clipPath id={`clip-${uid}`}>
            <circle cx={pr.cx} cy={pr.cy} r={pr.r} />
          </clipPath>
        </defs>
        {/* Orbit rings with ticks: the instrument around the plate. */}
        {bare ? null : (<g className="locator-orbit" style={{ transformOrigin: '200px 200px' }} aria-hidden="true">
          <circle cx={pr.cx} cy={pr.cy} r={pr.r + 30} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeDasharray="2 6" />
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2;
            const r1 = pr.r + 22;
            const r2 = pr.r + (i % 6 === 0 ? 14 : 18);
            return (
              <line
                key={i}
                x1={fx(pr.cx + r1 * Math.cos(a))}
                y1={fx(pr.cy + r1 * Math.sin(a))}
                x2={fx(pr.cx + r2 * Math.cos(a))}
                y2={fx(pr.cy + r2 * Math.sin(a))}
                stroke="currentColor"
                strokeOpacity={i % 6 === 0 ? 0.35 : 0.15}
              />
            );
          })}
        </g>)}
        <circle cx={pr.cx} cy={pr.cy} r={pr.r + 14} fill={`url(#air-${uid})`} aria-hidden="true" />
        <circle cx={pr.cx} cy={pr.cy} r={pr.r} fill={`url(#sea-${uid})`} />
        <g clipPath={`url(#clip-${uid})`} aria-hidden="true">
          <path d={grat} fill="none" stroke="#f4ecdc" strokeOpacity="0.1" strokeWidth="0.8" />
          {land ? <path d={land} fill="#e9dcc0" fillOpacity="0.16" stroke="#f4ecdc" strokeOpacity="0.55" strokeWidth="0.7" strokeLinejoin="round" /> : null}
          {borders ? <path d={borders} fill="none" stroke="#f4ecdc" strokeOpacity="0.22" strokeWidth="0.5" /> : null}
          {placed.map((p, i) =>
            p.box ? (
              <path
                key={i}
                d={p.box}
                fill={TONE[p.m.tone ?? 'accent']}
                fillOpacity="0.5"
                stroke={TONE[p.m.tone ?? 'accent']}
                strokeWidth="1.4"
              />
            ) : null,
          )}
          <circle cx={pr.cx} cy={pr.cy} r={pr.r} fill={`url(#shade-${uid})`} />
        </g>
        <circle cx={pr.cx} cy={pr.cy} r={pr.r} fill="none" stroke="#8cc4ef" strokeOpacity="0.45" strokeWidth="1" aria-hidden="true" />
        {arcD ? (
          <g aria-hidden="true">
            <path d={arcD} fill="none" stroke="#f4ecdc" strokeOpacity="0.25" strokeWidth="4" strokeLinecap="round" />
            <path d={arcD} fill="none" stroke="#f4ecdc" strokeWidth="1.4" strokeDasharray="4 5" className="locator-dash" />
          </g>
        ) : null}
        {placed.map((p, i) =>
          p.front ? (
            <g key={i} aria-hidden="true">
              <circle cx={fx(p.x)} cy={fx(p.y)} r="14" fill="none" stroke={TONE[p.m.tone ?? 'accent']} strokeWidth="1.5" className="locator-pulse" />
              <circle cx={fx(p.x)} cy={fx(p.y)} r="4.5" fill={TONE[p.m.tone ?? 'accent']} stroke="#071a33" strokeWidth="1.5" />
            </g>
          ) : null,
        )}
      </svg>
      {/* Labels as HTML, so Bangla shapes correctly and the text stays crisp. */}
      {placed.map((p, i) =>
        !bare && p.front && p.m.label ? (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-semibold shadow-card backdrop-blur-sm',
              LABEL[p.m.tone ?? 'accent'],
            )}
            style={{
              left: `${(p.x / W) * 100}%`,
              top: `${(p.y / W) * 100}%`,
              transform: i === 1 || p.x > pr.cx + pr.r * 0.35 ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)',
            }}
          >
            {p.m.label}
          </span>
        ) : null,
      )}
    </figure>
  );
}

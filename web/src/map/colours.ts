// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Diverging colour scales symmetric around zero (docs/04_UI.md §6.3), from the catalog's colormap.trend name,
// implemented with d3-scale-chromatic. Colour-blind-safe palettes; "_r" reverses a scale.
import {
  interpolateBlues,
  interpolateBrBG,
  interpolateCividis,
  interpolateGnBu,
  interpolateGreens,
  interpolateInferno,
  interpolateMagma,
  interpolatePlasma,
  interpolatePRGn,
  interpolatePuBu,
  interpolatePuOr,
  interpolateRdBu,
  interpolateRdYlBu,
  interpolateViridis,
  interpolateYlGnBu,
  interpolateYlOrRd,
} from 'd3-scale-chromatic';

const SCALES: Record<string, (t: number) => string> = {
  RdBu: interpolateRdBu,
  BrBG: interpolateBrBG,
  PuOr: interpolatePuOr,
  PRGn: interpolatePRGn,
  RdYlBu: interpolateRdYlBu,
};

export function diverging(name: string | undefined): (t: number) => string {
  const raw = name ?? 'RdBu_r';
  const reversed = raw.endsWith('_r');
  const base = SCALES[reversed ? raw.slice(0, -2) : raw] ?? interpolateRdBu;
  return reversed ? (t: number) => base(1 - t) : base;
}

/** Position of a rate on a scale symmetric around zero, clamped to [0, 1]. Layout only. */
export function scalePos(rate: number, limit: number): number {
  if (!Number.isFinite(rate) || !(limit > 0)) return 0.5;
  return Math.min(1, Math.max(0, 0.5 + rate / (2 * limit)));
}

/** Parses "rgb(r, g, b)" or "#rrggbb" to [r, g, b]. */
export function rgb(c: string): [number, number, number] {
  const m = c.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = c.replace('#', '');
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return [128, 128, 128];
}

const SEQUENTIAL: Record<string, (t: number) => string> = {
  inferno: interpolateInferno,
  magma: interpolateMagma,
  plasma: interpolatePlasma,
  viridis: interpolateViridis,
  cividis: interpolateCividis,
  Blues: interpolateBlues,
  Greens: interpolateGreens,
  YlGnBu: interpolateYlGnBu,
  GnBu: interpolateGnBu,
  PuBu: interpolatePuBu,
  YlOrRd: interpolateYlOrRd,
};

/** A sequential scale for values (not rates), from the catalog's colormap.value name; viridis when none is set. */
export function sequential(name: string | undefined): (t: number) => string {
  const raw = name ?? 'viridis';
  const reversed = raw.endsWith('_r');
  const base = SEQUENTIAL[reversed ? raw.slice(0, -2) : raw] ?? interpolateViridis;
  return reversed ? (t: number) => base(1 - t) : base;
}

/** Position of a value between the ends of a range, clamped to [0, 1]. Layout only. */
export function rangePos(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v) || !(hi > lo)) return 0.5;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

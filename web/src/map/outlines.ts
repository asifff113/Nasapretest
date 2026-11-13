// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The bundled Natural Earth outlines (web/public/outlines/world_110m.json; ADR-08). The site's own file,
// fetched from its own origin. The offline file draws no outlines, since it may make no request at all.
import { cached } from '../data/cache';
import { IS_OFFLINE_BUILD } from '../data/offline';
import type { Grid, Mask } from '../data/types';

export interface Outlines {
  land: [number, number][][];
  borders: [number, number][][];
}

export function loadOutlines(): Promise<Outlines | null> {
  if (IS_OFFLINE_BUILD) return Promise.resolve(null);
  return cached('outlines', async () => {
    try {
      const res = await fetch('./outlines/world_110m.json', { credentials: 'same-origin' });
      if (!res.ok) return null;
      return (await res.json()) as Outlines;
    } catch {
      return null;
    }
  });
}

/** Cell centre and size of a grid cell (lat0/lon0 are the centres of row 0 and column 0). */
export function cellRect(grid: Grid, row: number, col: number): { lat: number; lon: number; dlat: number; dlon: number } {
  return { lat: grid.lat0 + row * grid.dlat, lon: grid.lon0 + col * grid.dlon, dlat: Math.abs(grid.dlat), dlon: Math.abs(grid.dlon) };
}

/** The extent of a mask's cells, for framing a mini-map (layout only). */
export function maskExtent(grid: Grid, mask: Mask): [number, number, number, number] | null {
  if (mask.cells.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [row, col] of mask.cells) {
    const c = cellRect(grid, row, col);
    w = Math.min(w, c.lon - c.dlon / 2);
    e = Math.max(e, c.lon + c.dlon / 2);
    s = Math.min(s, c.lat - c.dlat / 2);
    n = Math.max(n, c.lat + c.dlat / 2);
  }
  return [w, s, e, n];
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Country focus on the explorer: which 1° squares of the map file lie in a country (square centre inside the
// Natural Earth 1:110m outline), and the country's frame for the camera. Geometry only: the squares keep the
// map file's own values; nothing is averaged or tested here (a country-wide answer needs its own result file).
import type { Grid } from '../data/types';
import type { CountryFeature } from '../data/places';

type Ring = [number, number][];

export function countryRings(f: CountryFeature): Ring[] {
  const g = f.geometry;
  if (g.type === 'Polygon') return g.coordinates as Ring[];
  if (g.type === 'MultiPolygon') return (g.coordinates as Ring[][]).flat();
  return [];
}

function inRing(ring: Ring, lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] ?? [0, 0];
    const [xj, yj] = ring[j] ?? [0, 0];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** [west, south, east, north] of a country's outline. */
export function countryBox(f: CountryFeature): [number, number, number, number] {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const ring of countryRings(f)) {
    for (const [x, y] of ring) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}

/** Indices (row · nlon + col) of the grid squares whose centre lies inside the country. */
export function cellsInCountry(f: CountryFeature, grid: Grid): number[] {
  const rings = countryRings(f);
  const [w, s, e, n] = countryBox(f);
  const out: number[] = [];
  for (let row = 0; row < grid.nlat; row++) {
    const lat = grid.lat0 + row * grid.dlat;
    if (lat < s || lat > n) continue;
    for (let col = 0; col < grid.nlon; col++) {
      const lon = grid.lon0 + col * grid.dlon;
      if (lon < w || lon > e) continue;
      if (rings.some((r) => inRing(r, lat, lon))) out.push(row * grid.nlon + col);
    }
  }
  return out;
}

/** A camera height that fits the country on screen (layout only). */
export function fitAltitude(f: CountryFeature): number {
  const [w, s, e, n] = countryBox(f);
  const span = Math.max(e - w, (n - s) * 1.4);
  return Math.max(0.35, Math.min(2.2, span / 38));
}

export function findCountry(countries: CountryFeature[], name: string | null | undefined): CountryFeature | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase();
  return countries.find((c) => c.properties.name.toLowerCase() === key);
}

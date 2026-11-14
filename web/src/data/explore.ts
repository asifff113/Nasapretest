// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Exploration files of a results build (schemas/map_years, explore_index, explore_region): the yearly map frames
// behind the globe's year slider, and one detail file per country or configured region with its yearly values and
// monthly climatology for every record. The reader decodes them (int16 × scale + offset, fill → missing) and never
// computes a statistic. All of it is exploration: no verdict, no trend.
import { cached } from './cache';
import { useAsync, useBuild, useResult, type Loaded } from './hooks';
import { fileId, loadBinary, loadJson } from './results';
import type { Grid, LangText } from './types';

export interface MapYearsMeta {
  schema: string;
  buildId: string;
  synthetic: boolean;
  variable: string;
  season: string;
  label: 'exploration';
  grid: Grid;
  units: string;
  rule: 'mean' | 'sum';
  years: number[];
  file: string;
  dtype: 'int16';
  byteOrder: 'little';
  layout: string;
  scale: number;
  offset: number;
  fill: number;
  range: [number, number] | null;
  source: string;
  /** Each year minus the cell's baseline mean (int8, clipped at ±clippedAt); absent in builds before r5. */
  anomaly?: { file: string; baseline: [number, number]; dtype: 'int8'; scale: number; fill: number; clippedAt: number; layout: string; range: number | null } | null;
  /** Three frames: the first ten years' mean, the last ten years' mean and their difference (int16). */
  decades?: { file: string; frames: ['early', 'late', 'change']; early: [number, number]; late: [number, number]; scale: number; layout: string; changeRange: number | null } | null;
}

export interface MapYears {
  meta: MapYearsMeta;
  /** The raw frames, [year][row][col]; decode one value with `yearValue`. */
  raw: Int16Array;
}

export const explorePaths = {
  years: (variable: string, season: string) => `maps/${variable}/${season}/years.json`,
  index: 'explore/index.json',
  region: (id: string) => `explore/regions/${fileId(id)}.json`,
  area: (id: string) => `explore/areas/${fileId(id)}.json`,
  trends: (variable: string) => `explore/trends/${variable}.json`,
  hovmoller: (variable: string) => `explore/hovmoller/${variable}.json`,
};

/** Loads the yearly frames of one record and season (about 3–4 MB gzipped; loaded only when asked for). */
export function loadMapYears(root: string, variable: string, season: string): Promise<MapYears> {
  return cached(`years:${root}|${variable}|${season}`, async () => {
    const metaPath = explorePaths.years(variable, season);
    const meta = await loadJson<MapYearsMeta>(root, metaPath);
    const dir = metaPath.slice(0, metaPath.lastIndexOf('/') + 1);
    const bytes = await loadBinary(root, dir + meta.file);
    const n = meta.grid.nlat * meta.grid.nlon * meta.years.length;
    // Copy into an aligned buffer (the file is little-endian, as every browser is).
    const raw = new Int16Array(n);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const avail = Math.min(n, Math.floor(bytes.byteLength / 2));
    for (let i = 0; i < avail; i++) raw[i] = view.getInt16(i * 2, true);
    for (let i = avail; i < n; i++) raw[i] = meta.fill;
    return { meta, raw };
  });
}

/** One square's value in one year frame, or NaN where the file holds its fill value. Decoding only. */
export function yearValue(y: MapYears, frame: number, cell: number): number {
  const g = y.meta.grid;
  const v = y.raw[frame * g.nlat * g.nlon + cell];
  if (v === undefined || v === y.meta.fill) return Number.NaN;
  return v * y.meta.scale + y.meta.offset;
}

/** What the globe's year view paints: each year's value, each year against the baseline, or the last ten years minus the first ten. */
export type FramesKind = 'values' | 'anomaly' | 'change';

/** Decoded frames for the globe painter: one value per square per frame (NaN where the file holds its fill). */
export interface Frames {
  kind: FramesKind;
  grid: Grid;
  /** The year of each frame ('change' has one frame, labelled by its two periods instead). */
  years: number[];
  value: (frame: number, cell: number) => number;
  /** The colour runs from lo to hi; 'anomaly' and 'change' are centred on zero. */
  lo: number;
  hi: number;
  units: string;
  baseline?: [number, number];
  early?: [number, number];
  late?: [number, number];
}

/** Loads the anomaly frames (int8) or the decades frames (int16) beside a record's yearly frames. */
export function loadFramesExtra(root: string, y: MapYears, kind: 'anomaly' | 'change'): Promise<Int8Array | Int16Array> {
  const m = y.meta;
  return cached(`frames:${root}|${m.variable}|${m.season}|${kind}`, async () => {
    const dir = explorePaths.years(m.variable, m.season).replace(/years\.json$/, '');
    const n = m.grid.nlat * m.grid.nlon;
    if (kind === 'anomaly') {
      const a = m.anomaly;
      if (!a) throw new Error('no anomaly frames');
      const bytes = await loadBinary(root, dir + a.file);
      const out = new Int8Array(n * m.years.length).fill(a.fill);
      out.set(new Int8Array(bytes.buffer, bytes.byteOffset, Math.min(out.length, bytes.byteLength)));
      return out;
    }
    const d = m.decades;
    if (!d) throw new Error('no decades frames');
    const bytes = await loadBinary(root, dir + d.file);
    const out = new Int16Array(n * 3).fill(m.fill);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const avail = Math.min(out.length, Math.floor(bytes.byteLength / 2));
    for (let i = 0; i < avail; i++) out[i] = view.getInt16(i * 2, true);
    return out;
  });
}

/** Wraps the decoded frames of one kind for the painter. Decoding only (scale and fill); no value is computed. */
export function framesOf(y: MapYears, kind: FramesKind, extra: Int8Array | Int16Array | undefined): Frames | null {
  const m = y.meta;
  const n = m.grid.nlat * m.grid.nlon;
  if (kind === 'values') {
    const [lo, hi] = m.range ?? [0, 1];
    return { kind, grid: m.grid, years: m.years, value: (f, c) => yearValue(y, f, c), lo, hi, units: m.units };
  }
  if (!extra) return null;
  if (kind === 'anomaly' && m.anomaly && extra instanceof Int8Array) {
    const a = m.anomaly;
    const r = a.range ?? a.clippedAt;
    return {
      kind,
      grid: m.grid,
      years: m.years,
      value: (f, c) => {
        const v = extra[f * n + c];
        return v === undefined || v === a.fill ? Number.NaN : v * a.scale;
      },
      lo: -r,
      hi: r,
      units: m.units,
      baseline: a.baseline,
    };
  }
  if (kind === 'change' && m.decades && extra instanceof Int16Array) {
    const d = m.decades;
    const r = d.changeRange ?? 1;
    return {
      kind,
      grid: m.grid,
      years: [d.late[1]],
      value: (_f, c) => {
        const v = extra[2 * n + c];
        return v === undefined || v === m.fill ? Number.NaN : v * d.scale;
      },
      lo: -r,
      hi: r,
      units: m.units,
      early: d.early,
      late: d.late,
    };
  }
  return null;
}

/** The exploration files are written by the data pipeline for real builds only; the synthetic examples have none. */
const NOT_IN_BUILD = { status: 'missing', data: undefined, error: undefined } as const;

export function useMapYears(variable: string | undefined, season: string, enabled: boolean): Loaded<MapYears> {
  const build = useBuild();
  const root = build.data?.root;
  const synthetic = build.data?.synthetic === true;
  const key = enabled && !synthetic && root !== undefined && variable ? `years|${root}|${variable}|${season}` : null;
  const res = useAsync<MapYears>(key, () => loadMapYears(root ?? '', variable ?? '', season));
  return synthetic && enabled ? (NOT_IN_BUILD as Loaded<MapYears>) : res;
}

function useExplore<T>(path: string | null): Loaded<T> {
  const build = useBuild();
  const synthetic = build.data?.synthetic === true;
  const res = useResult<T>(synthetic ? null : path);
  return synthetic && path ? (NOT_IN_BUILD as Loaded<T>) : res;
}

export type ExploreKind = 'country' | 'division' | 'comparison';

export interface ExploreRegionInfo {
  id: string;
  kind: ExploreKind;
  name: LangText;
  bbox: [number, number, number, number];
  centroid: [number, number];
  areaKm2: number;
  effectiveCells: number;
  spillShare: number;
  passesSupport: boolean;
  iso3: string | null;
  continent: string | null;
}

export interface ExploreIndex {
  schema: string;
  buildId: string;
  synthetic: boolean;
  label: 'exploration';
  grid: string;
  variables: { id: string; units: string; rule: 'mean' | 'sum'; first: number; last: number; trendTested?: number; trendStandsOut?: number }[];
  regions: (ExploreRegionInfo & { file: string })[];
  /** The world, the world's land and the continents (results r5 onwards). */
  areas?: (Omit<ExploreRegionInfo, 'kind'> & { kind: 'world' | 'continent'; file: string })[];
  trends?: string[];
  hovmoller?: string[];
}

/** The engine's trend statistics for one place (exploration: never a verdict). */
export interface ExploreTrend {
  testable: boolean;
  /** Why there is no test: descriptive (a storage record), too_short, missing_year, constant, not_finite, phi_out_of_range. */
  reason: string | null;
  exploratory: boolean;
  n: number;
  first: number | null;
  last: number | null;
  ratePerDecade: number | null;
  lowPerDecade: number | null;
  highPerDecade: number | null;
  p: number | null;
  /** Benjamini–Hochberg across all places (or the 12 months), at the screening map's q. */
  q: number | null;
  standsOut: boolean;
  phi: number | null;
  jumpYear: number | null;
}

export interface ExplorePeriod {
  from: number;
  to: number;
  mean: number | null;
  monthly: (number | null)[];
}

export interface ExploreVariable {
  unitsMonthly: string;
  units: string;
  rule: 'mean' | 'sum';
  years: number[];
  annual: (number | null)[];
  monthlyClimatology: (number | null)[];
  // Past against present (results r5 onwards; absent in older builds).
  baseline?: [number, number] | null;
  annualAnomaly?: (number | null)[] | null;
  /** [year][month], each month minus its own baseline mean: the seasonal cycle removed. */
  monthlyAnomaly?: (number | null)[][] | null;
  /** The mean of the ten years ending in each year. */
  rolling10?: (number | null)[];
  decades?: { early: ExplorePeriod; late: ExplorePeriod; change: number | null; changeMonthly: (number | null)[] } | null;
  trend?: ExploreTrend;
  monthTrends?: { testable: boolean; reason: string | null; ratePerDecade: number | null; p: number | null; q: number | null; standsOut: boolean }[];
}

export interface ExploreRegion {
  schema: string;
  buildId: string;
  synthetic: boolean;
  label: 'exploration';
  grid: string;
  region: ExploreRegionInfo;
  boundary: { source: string; licence: string };
  variables: Record<string, ExploreVariable>;
}

export type AreaKind = 'world' | 'continent';

export interface ExploreArea {
  schema: string;
  buildId: string;
  synthetic: boolean;
  label: 'exploration';
  grid: string;
  area: Omit<ExploreRegionInfo, 'kind'> & { kind: AreaKind };
  boundary: { source: string; licence: string };
  variables: Record<string, ExploreVariable>;
}

export interface ExploreTrendItem extends ExploreTrend {
  id: string;
  kind: ExploreKind | AreaKind;
  name: LangText;
  iso3: string | null;
  continent: string | null;
  passesSupport: boolean;
  anomalyLast: number | null;
  decadeChange: number | null;
}

export interface ExploreTrends {
  schema: string;
  buildId: string;
  label: 'exploration';
  variable: string;
  units: string;
  rule: 'mean' | 'sum';
  q: number;
  method: string;
  items: ExploreTrendItem[];
}

export interface ExploreHovmoller {
  schema: string;
  label: 'exploration';
  variable: string;
  units: string;
  baseline: [number, number];
  years: number[];
  /** Latitude of each row's centre, north to south. */
  lat: number[];
  cells: number[];
  /** [row][year]: the row's mean anomaly. */
  values: (number | null)[][];
  range: number | null;
  method: string;
}

export const useExploreIndex = () => useExplore<ExploreIndex>(explorePaths.index);
export const useExploreRegion = (id: string | null) => useExplore<ExploreRegion>(id ? explorePaths.region(id) : null);
export const useExploreArea = (id: string | null) => useExplore<ExploreArea>(id ? explorePaths.area(id) : null);
export const useExploreTrends = (variable: string | null | undefined) => useExplore<ExploreTrends>(variable ? explorePaths.trends(variable) : null);
export const useExploreHovmoller = (variable: string | null | undefined) =>
  useExplore<ExploreHovmoller>(variable ? explorePaths.hovmoller(variable) : null);

/** The area file id of a continent name as Natural Earth spells it ("South America" → "continent:south_america"). */
export function continentAreaId(name: string): string {
  return `continent:${name.toLowerCase().replace(/ /g, '_')}`;
}

/** Finds the detail entry for a country outline's name (the outlines carry names, not ISO codes). */
export function exploreForCountryName(index: ExploreIndex | undefined, name: string): ExploreRegionInfo | undefined {
  if (!index) return undefined;
  const k = name.trim().toLowerCase();
  return index.regions.find((r) => r.kind === 'country' && r.name.en.trim().toLowerCase() === k);
}

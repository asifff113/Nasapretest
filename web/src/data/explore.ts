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
  variables: { id: string; units: string; rule: 'mean' | 'sum'; first: number; last: number }[];
  regions: (ExploreRegionInfo & { file: string })[];
}

export interface ExploreVariable {
  unitsMonthly: string;
  units: string;
  rule: 'mean' | 'sum';
  years: number[];
  annual: (number | null)[];
  monthlyClimatology: (number | null)[];
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

export const useExploreIndex = () => useExplore<ExploreIndex>(explorePaths.index);
export const useExploreRegion = (id: string | null) => useExplore<ExploreRegion>(id ? explorePaths.region(id) : null);

/** Finds the detail entry for a country outline's name (the outlines carry names, not ISO codes). */
export function exploreForCountryName(index: ExploreIndex | undefined, name: string): ExploreRegionInfo | undefined {
  if (!index) return undefined;
  const k = name.trim().toLowerCase();
  return index.regions.find((r) => r.kind === 'country' && r.name.en.trim().toLowerCase() === k);
}

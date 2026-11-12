// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The result reader (docs/01_ARCHITECTURE.md §6.3). It reads files and decodes binary layers;
// it never computes a statistic. Decoding (raw × scale + offset, fill → missing, flag bits) is allowed.
import { cached } from './cache';
import { IS_OFFLINE_BUILD, offlineBinary, offlineCurrent, offlineJson } from './offline';
import type { CellTilesMeta, Current, MapMeta } from './types';

/** The file could not be found in this build (404). Panels show "not in this build"; never zeros. */
export class MissingFileError extends Error {
  constructor(public readonly path: string) {
    super(`not in this build: ${path}`);
    this.name = 'MissingFileError';
  }
}

/** The results host could not be reached at all (network failure). */
export class UnreachableError extends Error {
  constructor(public readonly path: string, cause?: unknown) {
    super(`results not reachable: ${path}`);
    this.name = 'UnreachableError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** The file exists but could not be read (bad JSON, bad gzip). */
export class BadFileError extends Error {
  constructor(public readonly path: string, detail: string) {
    super(`could not read ${path}: ${detail}`);
    this.name = 'BadFileError';
  }
}

export function resultsBase(): string {
  const base = import.meta.env.RESULTS_BASE ?? import.meta.env.VITE_RESULTS_BASE;
  return (base && base.length > 0 ? base : './results').replace(/\/+$/, '');
}

/** Region ids contain ":"; in file names ":" becomes "__" (docs/01_ARCHITECTURE.md §3). */
export function fileId(id: string): string {
  return id.replace(/:/g, '__');
}

export const paths = {
  verdict: (variable: string, region: string, season: string) => `verdicts/${variable}/${fileId(region)}/${season}.json`,
  contrast: (variable: string, pair: string, season: string) => `contrasts/${variable}/${pair}/${season}.json`,
  lineup: (region: string) => `lineups/${fileId(region)}.json`,
  series: (variable: string, region: string) => `series/${variable}/${fileId(region)}.json`,
  mapMeta: (variable: string, season: string) => `maps/${variable}/${season}/meta.json`,
  cellMeta: (variable: string) => `cells/${variable}/meta.json`,
  caseFile: (id: string) => `cases/${id}.json`,
};

function join(root: string, path: string): string {
  if (!root) return path;
  return `${root.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function fetchOrThrow(url: string, path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin' });
  } catch (err) {
    throw new UnreachableError(path, err);
  }
  if (res.status === 404) throw new MissingFileError(path);
  if (!res.ok) throw new UnreachableError(path, new Error(`HTTP ${res.status}`));
  return res;
}

export interface CurrentBuild {
  buildId: string;
  /** The folder the build's files live in, relative to the page (or "" in the offline file). */
  root: string;
  synthetic: boolean;
}

/**
 * Reads <base>/current.json; the build's files are in <base>/<buildId>/ (docs/01_ARCHITECTURE.md §7).
 * In development the examples folder is itself the build: the dev server serves it under its build id too.
 */
export function loadCurrent(base: string = resultsBase()): Promise<CurrentBuild> {
  return cached(`current:${base}`, async () => {
    if (IS_OFFLINE_BUILD) {
      const c = offlineCurrent();
      if (!c) throw new MissingFileError('current.json');
      return { buildId: c.buildId, root: '', synthetic: Boolean(c.synthetic) };
    }
    const res = await fetchOrThrow(join(base, 'current.json'), 'current.json');
    const current = (await res.json()) as Current;
    return { buildId: current.buildId, root: join(base, current.buildId), synthetic: Boolean(current.synthetic) };
  });
}

export function loadJson<T>(root: string, path: string): Promise<T> {
  return cached(`json:${root}|${path}`, async () => {
    if (IS_OFFLINE_BUILD) {
      const hit = offlineJson(path);
      if (hit === undefined) throw new MissingFileError(path);
      return hit as T;
    }
    const res = await fetchOrThrow(join(root, path), path);
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new BadFileError(path, err instanceof Error ? err.message : String(err));
    }
  });
}

/** Gunzips when the bytes are gzip (magic 1f 8b); a server that already decoded them is handled too. */
export async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { gunzipSync } = await import('fflate');
  return gunzipSync(bytes);
}

export function loadBinary(root: string, path: string): Promise<Uint8Array> {
  return cached(`bin:${root}|${path}`, async () => {
    let raw: Uint8Array;
    if (IS_OFFLINE_BUILD) {
      const hit = offlineBinary(path);
      if (hit === undefined) throw new MissingFileError(path);
      raw = hit;
    } else {
      const res = await fetchOrThrow(join(root, path), path);
      raw = new Uint8Array(await res.arrayBuffer());
    }
    try {
      return await gunzipIfNeeded(raw);
    } catch (err) {
      throw new BadFileError(path, err instanceof Error ? err.message : String(err));
    }
  });
}

// ---------------------------------------------------------------------------------------------
// The screening map layer (docs/02_DATA.md §6; schemas/map_meta.schema.json)

export interface MapLayer {
  meta: MapMeta;
  /** Decoded numeric fields, [nlat × nlon] row-major; NaN where the file holds its fill value. */
  fields: Record<string, Float32Array>;
  /** The flag bits per cell (uint8). */
  flags: Uint8Array;
}

const SIZES = { int16: 2, float32: 4, uint8: 1 } as const;

/** Splits a field-major buffer into its fields, as listed in meta.fields. Pure decoding. */
export function decodeMapLayer(meta: MapMeta, bytes: Uint8Array): MapLayer {
  const n = meta.grid.nlat * meta.grid.nlon;
  const little = meta.byteOrder !== 'big';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const expected = meta.fields.reduce((s, f) => s + SIZES[f.dtype] * n, 0);
  if (bytes.byteLength < expected) throw new BadFileError(meta.file, `expected ${expected} bytes, got ${bytes.byteLength}`);
  const fields: Record<string, Float32Array> = {};
  let flags = new Uint8Array(n);
  let at = 0;
  for (const f of meta.fields) {
    const size = SIZES[f.dtype];
    if (f.dtype === 'uint8') {
      const block = bytes.slice(at, at + n);
      if (f.name === 'flags') flags = block;
      else fields[f.name] = Float32Array.from(block);
    } else {
      const out = new Float32Array(n);
      const scale = f.scale ?? 1;
      const offset = f.offset ?? 0;
      const fill = f.fill ?? null;
      for (let i = 0; i < n; i++) {
        const raw = f.dtype === 'int16' ? view.getInt16(at + i * 2, little) : view.getFloat32(at + i * 4, little);
        out[i] = (fill !== null && raw === fill) || !Number.isFinite(raw) ? Number.NaN : raw * scale + offset;
      }
      fields[f.name] = out;
    }
    at += size * n;
  }
  return { meta, fields, flags };
}

export function loadMapLayer(root: string, variable: string, season: string): Promise<MapLayer> {
  return cached(`map:${root}|${variable}|${season}`, async () => {
    const metaPath = paths.mapMeta(variable, season);
    const meta = await loadJson<MapMeta>(root, metaPath);
    const dir = metaPath.slice(0, metaPath.lastIndexOf('/') + 1);
    const bytes = await loadBinary(root, dir + meta.file);
    return decodeMapLayer(meta, bytes);
  });
}

// ---------------------------------------------------------------------------------------------
// Cell tiles (schemas/cell_tiles.schema.json): one ~10 KB tile per picked cell, never loaded whole.

export interface CellSeries {
  row: number;
  col: number;
  season: string;
  years: number[];
  /** Yearly values; null where the tile holds its fill value. */
  values: (number | null)[];
  units: string;
  meta: CellTilesMeta;
}

export function tilePath(meta: CellTilesMeta, row: number, col: number): string {
  const tr = Math.floor(row / meta.tile.rows);
  const tc = Math.floor(col / meta.tile.cols);
  return meta.path.replace('<tr>', String(tr)).replace('<tc>', String(tc));
}

/** Reads one cell's yearly values from its tile. Layout [row][col][season][year], int16 × scale + offset. */
export function decodeCellTile(meta: CellTilesMeta, bytes: Uint8Array, row: number, col: number, season: string): CellSeries {
  const nYears = meta.years.last - meta.years.first + 1;
  const nSeasons = meta.seasons.length;
  const s = meta.seasons.indexOf(season);
  if (s < 0) throw new MissingFileError(`cells/${meta.variable} season ${season}`);
  const r = row % meta.tile.rows;
  const c = col % meta.tile.cols;
  const little = meta.byteOrder !== 'big';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = ((r * meta.tile.cols + c) * nSeasons + s) * nYears;
  const years: number[] = [];
  const values: (number | null)[] = [];
  for (let y = 0; y < nYears; y++) {
    const at = (base + y) * 2;
    years.push(meta.years.first + y);
    if (at + 2 > bytes.byteLength) {
      values.push(null);
      continue;
    }
    const raw = view.getInt16(at, little);
    values.push(raw === meta.fill ? null : raw * meta.scale + meta.offset);
  }
  return { row, col, season, years, values, units: meta.units, meta };
}

/** Resolves to null when the cell's tile is not in this build ("no data here"). */
export async function loadCellSeries(root: string, variable: string, row: number, col: number, season = 'ANN'): Promise<CellSeries | null> {
  const meta = await loadJson<CellTilesMeta>(root, paths.cellMeta(variable));
  const tr = Math.floor(row / meta.tile.rows);
  const tc = Math.floor(col / meta.tile.cols);
  const present = meta.tilesPresent.some(([a, b]) => a === tr && b === tc);
  if (!present) return null;
  const dir = paths.cellMeta(variable).replace('meta.json', '');
  try {
    const bytes = await loadBinary(root, dir + tilePath(meta, row, col));
    return decodeCellTile(meta, bytes, row, col, season);
  } catch (err) {
    if (err instanceof MissingFileError) return null;
    throw err;
  }
}

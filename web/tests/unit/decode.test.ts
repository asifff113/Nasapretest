// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Step 3C check: decoding the example map finds meta.nTestable testable and meta.nSignificant significant cells;
// the decoded cells agree with the engine's golden map cells; a cell tile decodes to its years.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeCellTile, decodeMapLayer, tilePath } from '../../src/data/results';
import { cellInfo } from '../../src/map/ScreeningMap';
import type { CellTilesMeta, MapMeta } from '../../src/data/types';
import { RESULTS, readResult } from './helpers';

const mapDirs = fs.existsSync(path.join(RESULTS, 'maps'))
  ? fs.readdirSync(path.join(RESULTS, 'maps')).flatMap((v) => fs.readdirSync(path.join(RESULTS, 'maps', v)).map((s) => `maps/${v}/${s}`))
  : [];

describe('screening map layers', () => {
  for (const dir of mapDirs) {
    it(`${dir}: counts match meta`, () => {
      const meta = readResult<MapMeta>(`${dir}/meta.json`);
      const bytes = gunzipSync(fs.readFileSync(path.join(RESULTS, dir, meta.file)));
      const layer = decodeMapLayer(meta, bytes);
      const tb = meta.flagBits.testable ?? 1;
      const sb = meta.flagBits.significant ?? 2;
      let testable = 0;
      let significant = 0;
      for (const f of layer.flags) {
        if ((f & tb) !== 0) testable++;
        if ((f & sb) !== 0) significant++;
      }
      expect(testable).toBe(meta.nTestable);
      expect(significant).toBe(meta.nSignificant);
    });
  }

  it('agrees with the golden map cells', () => {
    const goldenPath = path.join(RESULTS, 'golden', 'map_cells.json');
    if (!fs.existsSync(goldenPath)) return;
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as {
      meta: { map: string };
      cells: { row: number; col: number; flags: number; testable: boolean; significant: boolean; ratePerDecade: number | null }[];
    };
    const dir = golden.meta.map.replace(/^examples\//, '');
    const meta = readResult<MapMeta>(`${dir}/meta.json`);
    const layer = decodeMapLayer(meta, gunzipSync(fs.readFileSync(path.join(RESULTS, dir, meta.file))));
    for (const c of golden.cells) {
      const info = cellInfo(layer, c.row, c.col);
      expect(layer.flags[c.row * meta.grid.nlon + c.col]).toBe(c.flags);
      expect(info.testable).toBe(c.testable);
      expect(info.significant).toBe(c.significant);
      if (c.ratePerDecade === null) expect(info.rate).toBeNull();
      else expect(info.rate).toBeCloseTo(c.ratePerDecade, 2); // int16 × 0.001 storage
    }
  });
});

describe('cell tiles', () => {
  const metaPaths = fs.existsSync(path.join(RESULTS, 'cells')) ? fs.readdirSync(path.join(RESULTS, 'cells')).map((v) => `cells/${v}/meta.json`) : [];
  for (const mp of metaPaths) {
    it(`${mp}: every present tile decodes to its years`, () => {
      const meta = readResult<CellTilesMeta>(mp);
      for (const [tr, tc] of meta.tilesPresent) {
        const row = tr * meta.tile.rows;
        const col = tc * meta.tile.cols;
        const file = path.join(RESULTS, mp.replace('meta.json', ''), tilePath(meta, row, col));
        const series = decodeCellTile(meta, gunzipSync(fs.readFileSync(file)), row, col, meta.seasons[0] ?? 'ANN');
        expect(series.years[0]).toBe(meta.years.first);
        expect(series.years.at(-1)).toBe(meta.years.last);
        expect(series.values.length).toBe(meta.years.last - meta.years.first + 1);
      }
    });
  }
});

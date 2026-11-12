// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// One-off: writes public/outlines/world_110m.json from world-atlas (Natural Earth 1:110m, public domain;
// world-atlas is ISC). The output is committed, so the site bundles its map base and fetches nothing else.
// Format: { land: [[ring of [lon, lat]], ...], borders: [[line of [lon, lat]], ...] }, coordinates to 0.01°.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { feature, mesh } from 'topojson-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const countries = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const land = JSON.parse(fs.readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));

const r = (v) => Math.round(v * 100) / 100;
const line = (coords) => coords.map(([x, y]) => [r(x), r(y)]);

const landGeo = feature(land, land.objects.land);
const rings = [];
for (const f of landGeo.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) rings.push(line(ring));
}

const borderGeo = mesh(countries, countries.objects.countries, (a, b) => a !== b);
const borders = borderGeo.coordinates.map(line);

const out = { source: 'Natural Earth 1:110m via world-atlas 2.0.2 (public domain / ISC)', land: rings, borders };
const target = path.resolve(here, '..', 'public', 'outlines', 'world_110m.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out));
console.log(`outlines: ${rings.length} land rings, ${borders.length} border lines, ${fs.statSync(target).size} bytes`);

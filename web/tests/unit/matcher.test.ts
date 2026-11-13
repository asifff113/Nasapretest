// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The smart matcher: free text in English or Bangla → place, record, season and the screen that answers it.
// Ids are read from the build the tests run on, never written here.
import { describe, expect, it } from 'vitest';
import { cellId, matchSeason, matchVariable, route, understand, type MatchContext } from '../../src/data/matcher';
import { CITIES } from '../../src/data/places';
import { translate } from '../../src/i18n';
import type { Catalog, RegionIndex } from '../../src/data/types';
import { readResult } from './helpers';

const catalog = readResult<Catalog>('catalog.json');
const index = readResult<RegionIndex>('regions/index.json');
const grid = index.grids.find((g) => g.id === 'global_1deg');
const seasonIds = ['ANN', 'MAM', 'JJAS', 'ON', 'DJF'];
const seasons = (lang: 'en' | 'bn') =>
  seasonIds.map((id) => {
    const long = translate(lang, `season.${id}.long`);
    const nick = long.match(/\(([^)]+)\)/)?.[1];
    return { id, words: [long, translate(lang, `season.${id}.short`), ...(nick ? [nick] : [])] };
  });
const ctx = (lang: 'en' | 'bn' = 'en'): MatchContext => ({
  variables: catalog.variables,
  regions: index.regions,
  pairs: index.pairs,
  seasons: seasons(lang),
  cities: CITIES,
  countries: [{ name: 'Kenya', lat: 0.5, lon: 37.9 }],
  mapGrid: grid,
});
const analysedWith = (word: string) => catalog.variables.find((v) => v.status === 'analysed' && v.name.en.toLowerCase().includes(word));

describe('matcher', () => {
  it('maps everyday words to the analysed record first', () => {
    expect(matchVariable('Is Dhaka getting hotter?', catalog.variables)?.id).toBe(analysedWith('temperature')?.id);
    expect(matchVariable('Has the monsoon got wetter?', catalog.variables)?.id).toBe(analysedWith('rain')?.id);
    expect(matchVariable('ঢাকায় কি গরম বাড়ছে?', catalog.variables)?.id).toBe(analysedWith('temperature')?.id);
    expect(matchVariable('রাজশাহীতে বৃষ্টি কি বদলেছে?', catalog.variables)?.id).toBe(analysedWith('rain')?.id);
  });

  it('finds records that are not analysed yet', () => {
    const soil = matchVariable('Soil moisture in Kenya', catalog.variables);
    expect(soil?.name.en.toLowerCase()).toContain('moisture');
    expect(soil?.status).toBe('deferred');
  });

  it('reads seasons, and keeps pre-monsoon apart from monsoon', () => {
    expect(matchSeason('rain in the monsoon', seasons('en'))).toBe('JJAS');
    expect(matchSeason('pre-monsoon heat', seasons('en'))).toBe('MAM');
    expect(matchSeason('খুলনায় বর্ষার বৃষ্টি', seasons('bn'))).toBe('JJAS');
    expect(matchSeason('is it getting hotter', seasons('en'))).toBeUndefined();
  });

  it('opens any city as its 1° square on the map', () => {
    const u = understand('Has rain changed in Lagos?', ctx());
    const r = route(u, ctx());
    expect(r.kind).toBe('cell');
    if (r.kind === 'cell' && grid) {
      expect(r.view.screen).toBe('map');
      expect(r.cell).toBe(cellId(grid, 6.52, 3.38));
    }
  });

  it('opens a country by its centre, and reads Bangla city names', () => {
    expect(route(understand('Soil moisture in Kenya', ctx()), ctx()).kind).toBe('cell');
    const u = understand('ঢাকায় কি গরম বাড়ছে?', ctx('bn'));
    expect(u.places[0]?.kind).toBe('city');
  });

  it('opens a registered place as its case, and two registered places with a pair as the comparison', () => {
    const pair = index.pairs[0];
    if (!pair) return;
    const a = index.regions.find((r) => r.id === pair.a);
    const b = index.regions.find((r) => r.id === pair.b);
    const name = (n: string) => n.replace(' (example)', '');
    const one = route(understand(`Rain in ${name(a?.name.en ?? '')}`, ctx()), ctx());
    expect(one.kind).toBe('region');
    const two = route(understand(`Has rain changed differently in ${name(a?.name.en ?? '')} and ${name(b?.name.en ?? '')}?`, ctx()), ctx());
    expect(two.kind).toBe('compare');
    if (two.kind === 'compare') expect(two.view.pair).toBe(pair.id);
  });

  it('reads coordinates', () => {
    const u = understand('heat at 23.8, 90.4', ctx());
    expect(u.places[0]).toEqual({ kind: 'point', lat: 23.8, lon: 90.4 });
  });

  it('says it found no place when there is none', () => {
    expect(route(understand('is it getting hotter?', ctx()), ctx()).kind).toBe('none');
  });
});

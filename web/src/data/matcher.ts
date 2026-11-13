// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The ask box's "smart matcher". It reads a free-text question in English or Bangla and works out the place,
// the record and the season, then picks the screen that answers it. It uses no AI and writes no sentence:
// every answer it leads to is the engine's own. Names come from the result files (catalog, region index),
// the gazetteer and the country outlines; no variable, region or pair id is written here.
import type { CatalogVariable, Grid, Pair, Region } from './types';
import type { View } from '../state/view';
import type { City } from './places';

/** Everyday words → a word that appears in a catalog variable's English name. */
const EVERYDAY: [RegExp, string][] = [
  [/\b(hot|hotter|heat|heatwave|warm|warmer|warming|cold|colder|cool|temperature|temperatures)\b|গরম|ঠান্ডা|তাপ|উষ্ণ/i, 'temperature'],
  [/\b(rain|rains|rainfall|rainy|wet|wetter|dry|drier|drought|monsoon|flood|floods|precipitation|snow)\b|বৃষ্টি|বর্ষা|খরা|বন্যা/i, 'rain'],
  [/\b(satellite|satellites|imerg)\b|স্যাটেলাইট/i, 'satellites'],
  [/\b(humid|humidity|vapou?r|muggy)\b|আর্দ্র|জলীয়/i, 'vapour'],
  [/\b(soil|moisture)\b|মাটি/i, 'moisture'],
  [/\b(evaporation|evaporating|evapotranspiration)\b|বাষ্পীভবন/i, 'evaporating'],
  [/\b(runoff|river|rivers)\b|নদী/i, 'runoff'],
  [/\b(haze|smoke|smog|dust|aerosol|aerosols)\b|ধোঁয়া/i, 'haze'],
  [/\b(green|greenness|vegetation|plants|forest|forests|ndvi)\b|সবুজ|গাছ/i, 'greenness'],
  [/\b(groundwater|stored|storage)\b|ভূগর্ভ/i, 'stored'],
  [/\b(no2|pollution|polluted)\b|দূষণ/i, 'no₂'],
  [/\b(ozone)\b|ওজোন/i, 'ozone'],
  [/\b(pressure)\b|চাপ/i, 'pressure'],
  [/\b(high above|upper air|altitude)\b|উঁচু আকাশে/i, 'high above'],
  [/\b(jaxa|gsmap)\b/i, 'gsmap'],
];

const COMPARE = /\b(compare|compared|comparison|versus|vs\.?|differently|different|than|between)\b|তুলনা|ভিন্ন|পার্থক্য/i;
const SEASONS_ASKED = /\b(which season|seasons|each season)\b|কোন ঋতু|ঋতুগুলো/i;
const COORD = /(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([ns])?\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([ew])?/i;

const STATUS_RANK: Record<string, number> = { analysed: 0, sensitivity: 1, reference: 2, deferred: 3 };

export interface SeasonWords {
  id: string;
  /** Phrases that name the season, longest first matters: "pre-monsoon" before "monsoon". */
  words: string[];
}

export interface MatchContext {
  variables: CatalogVariable[];
  regions: Region[];
  pairs: Pair[];
  seasons: SeasonWords[];
  cities: City[];
  countries: { name: string; lat: number; lon: number }[];
  /** The 1° grid of the screening map (regions/index.json → grids). */
  mapGrid: Grid | undefined;
}

export type PlaceHit =
  | { kind: 'region'; region: Region }
  | { kind: 'city'; city: City }
  | { kind: 'country'; name: string; lat: number; lon: number }
  | { kind: 'point'; lat: number; lon: number };

export interface Understood {
  question: string;
  variable: CatalogVariable | undefined;
  season: string | undefined;
  places: PlaceHit[];
  compare: boolean;
  seasons: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize('NFC');

function nameWords(v: CatalogVariable): string {
  return norm([v.name.en, v.name_mid?.en ?? '', v.name.bn, v.id.replace(/_/g, ' ')].join(' | '));
}

/** Picks the catalog variable the question is about, preferring analysed records on a tie. */
export function matchVariable(q: string, variables: CatalogVariable[]): CatalogVariable | undefined {
  const s = norm(q);
  const wanted = EVERYDAY.filter(([re]) => re.test(s)).map(([, w]) => w);
  let best: { v: CatalogVariable; score: number } | undefined;
  for (const v of variables) {
    const names = nameWords(v);
    let score = 0;
    for (const w of wanted) if (names.includes(w)) score += 2;
    // Direct mention of the record's own name (English or Bangla) counts most.
    if (s.includes(norm(v.name.en)) || s.includes(norm(v.name.bn))) score += 4;
    if (score === 0) continue;
    const rank = STATUS_RANK[v.status] ?? 4;
    if (!best || score > best.score || (score === best.score && rank < (STATUS_RANK[best.v.status] ?? 4))) best = { v, score };
  }
  return best?.v;
}

export function matchSeason(q: string, seasons: SeasonWords[]): string | undefined {
  const s = norm(q);
  let hit: { id: string; len: number } | undefined;
  for (const season of seasons) {
    for (const w of season.words) {
      const ww = norm(w).trim();
      if (ww.length < 3) continue;
      const esc = ww.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Bangla adds endings to a word ("বর্ষার"), so a Bangla name may be followed by more letters.
      const tail = /[ঀ-৿]/.test(ww) ? '' : '($|[^\\p{L}-])';
      const re = new RegExp(`(^|[^\\p{L}\\p{M}-])${esc}${tail}`, 'u');
      if (re.test(s) && (!hit || ww.length > hit.len)) hit = { id: season.id, len: ww.length };
    }
  }
  return hit?.id;
}

/** Places named in the question, in the order they appear. Longer names win over names inside them. */
export function matchPlaces(q: string, ctx: Pick<MatchContext, 'regions' | 'cities' | 'countries'>): PlaceHit[] {
  const s = norm(q);
  const found: { at: number; len: number; hit: PlaceHit }[] = [];
  const add = (name: string | undefined, hit: PlaceHit) => {
    if (!name) return;
    const n = norm(name).replace(/\s*\((example|উদাহরণ)\)\s*/g, '').trim();
    if (n.length < 3) return;
    const at = s.indexOf(n);
    if (at >= 0) found.push({ at, len: n.length, hit });
  };
  for (const r of ctx.regions) {
    add(r.name.en, { kind: 'region', region: r });
    add(r.name.bn, { kind: 'region', region: r });
  }
  for (const c of ctx.cities) {
    add(c.name, { kind: 'city', city: c });
    add(c.bn, { kind: 'city', city: c });
  }
  for (const c of ctx.countries) add(c.name, { kind: 'country', name: c.name, lat: c.lat, lon: c.lon });
  const m = s.match(COORD);
  if (m) {
    let lat = Number(m[1]);
    let lon = Number(m[3]);
    if (m[2] && m[2].toLowerCase() === 's') lat = -Math.abs(lat);
    if (m[4] && m[4].toLowerCase() === 'w') lon = -Math.abs(lon);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) found.push({ at: m.index ?? 0, len: m[0].length, hit: { kind: 'point', lat, lon } });
  }
  // Drop a hit that sits inside a longer one ("Dhaka" inside "Dhaka division"), and repeats of one place.
  found.sort((a, b) => a.at - b.at || b.len - a.len);
  const out: PlaceHit[] = [];
  let end = -1;
  const seen = new Set<string>();
  for (const f of found) {
    if (f.at < end) continue;
    const key = f.hit.kind === 'region' ? f.hit.region.id : f.hit.kind === 'city' ? `${f.hit.city.lat},${f.hit.city.lon}` : f.hit.kind === 'country' ? f.hit.name : `${f.hit.lat},${f.hit.lon}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f.hit);
    end = f.at + f.len;
  }
  return out;
}

export function understand(q: string, ctx: MatchContext): Understood {
  return {
    question: q,
    variable: matchVariable(q, ctx.variables),
    season: matchSeason(q, ctx.seasons),
    places: matchPlaces(q, ctx),
    compare: COMPARE.test(norm(q)),
    seasons: SEASONS_ASKED.test(norm(q)),
  };
}

/** The 1° cell id of a point, on the screening map's grid (layout arithmetic only). */
export function cellId(grid: Grid, lat: number, lon: number): string {
  const row = Math.max(0, Math.min(grid.nlat - 1, Math.round((lat - grid.lat0) / grid.dlat)));
  const col = (((Math.round((lon - grid.lon0) / grid.dlon)) % grid.nlon) + grid.nlon) % grid.nlon;
  return `cell:${row}_${col}`;
}

export function pointOf(hit: PlaceHit): { lat: number; lon: number } {
  if (hit.kind === 'region') return { lat: hit.region.centroid[1], lon: hit.region.centroid[0] };
  if (hit.kind === 'city') return { lat: hit.city.lat, lon: hit.city.lon };
  return { lat: hit.lat, lon: hit.lon };
}

export type Route =
  | { kind: 'compare'; view: View; pair: Pair }
  | { kind: 'region'; view: View; region: Region }
  | { kind: 'cell'; view: View; cell: string; lat: number; lon: number; label: string }
  | { kind: 'none' };

/**
 * Which screen answers the question. Registered places open their case; two registered places with a pair open
 * the comparison; any other place opens its 1° square on the map (exploration).
 */
export function route(u: Understood, ctx: MatchContext): Route {
  const variable = u.variable && (u.variable.status === 'analysed' || u.variable.status === 'sensitivity') ? u.variable.id : u.variable?.id;
  const regions = u.places.filter((p): p is { kind: 'region'; region: Region } => p.kind === 'region').map((p) => p.region);
  if (regions.length >= 2 || (u.compare && regions.length >= 2)) {
    const [a, b] = regions;
    const pair = ctx.pairs.find((p) => (p.a === a?.id && p.b === b?.id) || (p.a === b?.id && p.b === a?.id));
    if (pair) return { kind: 'compare', pair, view: { screen: 'compare', pair: pair.id, variable, season: u.season } };
  }
  const first = u.places[0];
  if (!first) return { kind: 'none' };
  if (first.kind === 'region' && first.region.inSet) {
    return { kind: 'region', region: first.region, view: { screen: 'place', region: first.region.id, variable, season: u.season } };
  }
  if (!ctx.mapGrid) return { kind: 'none' };
  const { lat, lon } = pointOf(first);
  const label = first.kind === 'city' ? first.city.name : first.kind === 'country' ? first.name : first.kind === 'region' ? first.region.name.en : '';
  const cell = cellId(ctx.mapGrid, lat, lon);
  return { kind: 'cell', cell, lat, lon, label, view: { screen: 'map', region: cell, variable, season: u.season } };
}

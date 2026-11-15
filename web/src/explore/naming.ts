// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Readable names for 1° squares and for the countries of the bundled outlines. A square takes the name of the
// nearest gazetteer city of the same country (within 1.5°), else the part of its country it lies in; a country takes
// its Bangla name from the exploration index when the build has one. Layout arithmetic only: no value is computed.
import type { CountryFeature } from '../data/places';
import { CITIES } from '../data/places';
import type { ExploreIndex } from '../data/explore';
import { countryBox } from './country';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The middle and half-size of a country's outline box, for naming the part of the country a square lies in. */
export interface CountryFrame {
  lat: number;
  lon: number;
  dLat: number;
  dLon: number;
}

export function frameOf(f: CountryFeature): CountryFrame {
  const [w, s, e, n] = countryBox(f);
  return { lat: (n + s) / 2, lon: (w + e) / 2, dLat: (n - s) / 2, dLon: (e - w) / 2 };
}

/** The nearest gazetteer city of the same country within `within` degrees, in the reader's language. */
export function nearestCity(lat: number, lon: number, country: string | null, lang: 'en' | 'bn', within = 1.5): string | null {
  if (!country) return null;
  const k = Math.cos((lat * Math.PI) / 180);
  let best: { name: string; d: number } | undefined;
  for (const c of CITIES) {
    if (c.country.toLowerCase() !== country.toLowerCase()) continue; // a city across a border would mislead
    const d = Math.hypot((c.lon - lon) * k, c.lat - lat);
    if (d > within) continue;
    if (!best || d < best.d) best = { name: lang === 'bn' && c.bn ? c.bn : c.name, d };
  }
  return best?.name ?? null;
}

/** "Near Dhaka", or "Northern Brazil", or "Central Chad" (the part named from the square's place in the frame). */
export function squareName(t: T, lang: 'en' | 'bn', s: { lat: number; lon: number }, country: string, frame: CountryFrame | null, countryLabel = country): string {
  const city = nearestCity(s.lat, s.lon, country, lang);
  if (city) return t('site.squares.near', { city });
  if (!frame) return countryLabel;
  const x = frame.dLon > 0 ? (s.lon - frame.lon) / frame.dLon : 0;
  const y = frame.dLat > 0 ? (s.lat - frame.lat) / frame.dLat : 0;
  const ns = y > 0.33 ? 'n' : y < -0.33 ? 's' : '';
  const ew = x > 0.33 ? 'e' : x < -0.33 ? 'w' : '';
  const part = ns + ew || 'c';
  return t('site.squares.part', { part: t(`site.squares.part_${part}`), country: countryLabel });
}

/** A country's name in the reader's language: the exploration index's Bangla name when it has one. */
export function countryLabel(name: string, lang: 'en' | 'bn', index: ExploreIndex | undefined): string {
  if (lang !== 'bn' || !index) return name;
  const key = name.toLowerCase();
  const r = index.regions.find((x) => x.kind === 'country' && x.name.en.toLowerCase() === key);
  return r?.name.bn || name;
}

/** Where a country's name sits on the globe and how big the country is (for showing names by zoom). */
export interface CountryLabel {
  name: string;
  lat: number;
  lon: number;
  /** The larger side of the outline box, in degrees. */
  span: number;
}

export function countryLabels(countries: CountryFeature[]): CountryLabel[] {
  return countries.map((f) => {
    const [w, s, e, n] = countryBox(f);
    return { name: f.properties.name, lat: f.properties.lat, lon: f.properties.lon, span: Math.max(e - w, n - s) };
  });
}

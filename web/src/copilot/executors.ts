// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The copilot's tools, run in the browser against the build's own result files. Each tool returns data the model may
// quote (with "display" strings formatted here, so the model never rounds), the evidence class decided by code, the
// files it read, and the view it opens. No statistic is computed (AGENTS.md rule 4): values are copied from files.
import { translate } from '../i18n';
import { int, num, p as pFmt, rate as rateFmt } from '../i18n/format';
import { CITIES } from '../data/places';
import { matchPlaces } from '../data/matcher';
import { paths } from '../data/results';
import { explorePaths, type ExploreIndex, type ExploreRegion, type ExploreTrends } from '../data/explore';
import type { Catalog, Contrast, Lang, RegionIndex, Verdict } from '../data/types';
import type { View } from '../state/view';
import { challenge, classOfFamily, explorationFinding, otherDatasetFinding, type EvidenceClass, type Finding } from './evidence';
import { findingText } from './findingText';

export interface Store {
  buildId: string;
  catalog: Catalog;
  regionIndex: RegionIndex;
  exploreIndex: ExploreIndex | null;
  /** Reads a JSON file of this build; null when the build has no such file. */
  load: <T>(path: string) => Promise<T | null>;
}

export interface Evidence {
  cls: EvidenceClass;
  title: string;
  sources: string[];
}

export interface Outcome {
  /** What the model receives (JSON). */
  result: Record<string, unknown>;
  evidence?: Evidence;
  view?: View & { challenge?: boolean };
}

const SEASONS = ['ANN', 'DJF', 'MAM', 'JJAS', 'ON'];

function tr(lang: Lang) {
  return (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
}

function variableInfo(store: Store, id: string) {
  return store.catalog.variables.find((v) => v.id === id);
}

function placeName(store: Store, id: string, lang: Lang): string {
  const r = store.regionIndex.regions.find((x) => x.id === id) ?? store.exploreIndex?.regions.find((x) => x.id === id);
  return r ? (lang === 'bn' ? r.name.bn : r.name.en) || r.name.en : id;
}

function rateDisplay(rate: number | null, low: number | null, high: number | null, units: string, lang: Lang): string | null {
  if (rate === null) return null;
  const range = low !== null && high !== null ? ` (95% range ${rateFmt(low, lang)} to ${rateFmt(high, lang)})` : '';
  return `${rateFmt(rate, lang)} ${units} per decade${range}`;
}

function sentences(findings: Finding[], lang: Lang, units: string) {
  const t = tr(lang);
  return findings.map((f) => ({ id: f.id, kind: f.severity, text: findingText(t, lang, f, units).join(' '), source: f.source }));
}

function unavailable(reason: string, extra: Record<string, unknown> = {}): Outcome {
  return { result: { evidence_class: 'Unavailable', reason, ...extra }, evidence: { cls: 'unavailable', title: reason, sources: [] } };
}

const CLASS_LABEL: Record<EvidenceClass, string> = {
  preregistered: 'Pre-registered result',
  exploratory: 'Exploratory finding',
  descriptive: 'Descriptive observation',
  unavailable: 'Unavailable',
};

// ---------------------------------------------------------------------------------------------- the tools
function getCapabilities(store: Store): Outcome {
  const vars = store.catalog.variables.map((v) => ({
    id: v.id,
    name: v.name.en,
    kind: v.kind,
    years: v.record ? `${v.record.from ?? '?'}–${v.record.to ?? '?'}` : null,
    units: v.units?.aggregated ?? null,
    available: v.status === 'analysed' || v.status === 'sensitivity',
    pre_registered_tests: ['air_temp', 'rain'].includes(v.id) && v.status === 'analysed',
    role: v.status === 'sensitivity' ? 'sensitivity check (never graded)' : v.status,
    cannot_answer: v.record_card?.cannot_answer.en ?? null,
  }));
  const prereg = store.regionIndex.regions.filter((r) => r.inSet).map((r) => ({ id: r.id, name: r.name.en }));
  return {
    result: {
      build: store.buildId,
      records: vars,
      seasons: { ANN: 'whole year', DJF: 'Dec–Feb', MAM: 'Mar–May', JJAS: 'Jun–Sep', ON: 'Oct–Nov' },
      places_with_pre_registered_tests: prereg,
      tested_pairs: store.regionIndex.pairs.map((p) => ({ a: p.a, b: p.b })),
      exploration_reports: store.exploreIndex?.regions.length ?? 0,
      any_point_on_earth: 'a 1-degree grid square (about 110 km), descriptive values only',
      not_possible: ['forecasts or warnings', 'causes of a change', 'single towns or streets', 'daily weather', 'records not listed here'],
    },
  };
}

function resolvePlace(store: Store, name: string): Outcome {
  const regions = [...store.regionIndex.regions];
  const exploreRegions = store.exploreIndex?.regions ?? [];
  for (const e of exploreRegions) if (!regions.some((r) => r.id === e.id)) regions.push({ ...e, role: e.kind, in: e.name, boundary: { source: '', licence: '' }, inSet: false, support: {}, cells: {}, geom: null, pairs: [] });
  const hits = matchPlaces(name, { regions, cities: CITIES, countries: [] });
  const grid = store.regionIndex.grids.find((g) => g.id === 'global_1deg');
  const out = hits.slice(0, 5).map((h) => {
    if (h.kind === 'region') {
      const r = store.regionIndex.regions.find((x) => x.id === h.region.id);
      const report = exploreRegions.some((x) => x.id === h.region.id);
      return { id: h.region.id, name: h.region.name.en, kind: h.region.kind, holds: r?.inSet ? 'pre-registered tests and an exploration report' : report ? 'an exploration report (no pre-registered test)' : 'outline only' };
    }
    const { lat, lon } = h.kind === 'city' ? h.city : h.kind === 'point' ? h : { lat: h.lat, lon: h.lon };
    const label = h.kind === 'city' ? `${h.city.name} (${h.city.country})` : `${lat}, ${lon}`;
    if (!grid) return { id: null, name: label, kind: 'point', holds: 'nothing (no grid in this build)' };
    const row = Math.max(0, Math.min(grid.nlat - 1, Math.round((lat - grid.lat0) / grid.dlat)));
    const col = (((Math.round((lon - grid.lon0) / grid.dlon)) % grid.nlon) + grid.nlon) % grid.nlon;
    const country = h.kind === 'city' ? exploreRegions.find((r) => r.kind === 'country' && r.name.en.toLowerCase() === h.city.country.toLowerCase()) : undefined;
    return {
      id: `cell:${row}_${col}`,
      name: label,
      kind: '1-degree grid square',
      holds: 'descriptive yearly values of a ~110 km square; it is not a measurement of the city itself',
      country_report: country ? { id: country.id, name: country.name.en } : null,
    };
  });
  return { result: { query: name, candidates: out, note: out.length === 0 ? 'No place of that name in this build. Ask the user for a country, region, city or "lat, lon".' : null } };
}

async function verdictEvidence(store: Store, place: string, variable: string, season: string, lang: Lang): Promise<Outcome | null> {
  const path = paths.verdict(variable, place, season);
  const v = await store.load<Verdict>(path);
  if (!v) return null;
  const findings = challenge(v, path);
  const trendsPath = explorePaths.trends(variable);
  const trends = season === 'ANN' ? await store.load<ExploreTrends>(trendsPath) : null;
  const ex = explorationFinding(v, path, trends?.items.find((i) => i.id === place), trendsPath);
  if (ex) findings.push(ex);
  if (v.sensitivity) {
    const other = await store.load<Verdict>(v.sensitivity);
    const f = otherDatasetFinding(v, path, other ?? undefined, v.sensitivity);
    if (f) findings.push(f);
  }
  const cls = classOfFamily(v.family);
  const text = v.text[lang] ?? v.text.en;
  return {
    result: {
      evidence_class: CLASS_LABEL[cls],
      place: placeName(store, place, lang),
      record: variableInfo(store, variable)?.name.en ?? variable,
      season,
      years: `${int(v.window.first, lang)}–${int(v.window.last, lang)}`,
      engine_headline: text.headline,
      rate: { value: v.spine.ratePerDecade, low: v.spine.rateLowPerDecade, high: v.spine.rateHighPerDecade, units: v.spine.units, display: rateDisplay(v.spine.ratePerDecade, v.spine.rateLowPerDecade, v.spine.rateHighPerDecade, v.spine.units, lang) },
      deciding_test: v.status === 'verdict' && v.family !== 'sensitivity' ? { grade: v.grade, p_adjusted: v.multiplicity.pAdjusted, display: v.multiplicity.pAdjusted !== null ? `adjusted p = ${pFmt(v.multiplicity.pAdjusted, lang)}` : null, tests_registered: v.multiplicity.familySize } : null,
      findings: sentences(findings, lang, v.spine.units),
      source: path,
    },
    evidence: { cls, title: text.headline, sources: [path, ...findings.map((f) => f.source.split('#')[0]!)] },
    view: { screen: 'place', region: place, variable, season },
  };
}

async function exploreEvidence(store: Store, place: string, variable: string, lang: Lang): Promise<Outcome | null> {
  const info = store.exploreIndex?.regions.find((r) => r.id === place);
  if (!info) return null;
  const path = explorePaths.region(place);
  const file = await store.load<ExploreRegion>(path);
  const v = file?.variables[variable];
  if (!v) return unavailable(`This build has no ${variable} values for ${placeName(store, place, lang)} (for example, a land-only record over a mostly sea area).`, { source: path });
  const trend = v.trend;
  const cls: EvidenceClass = trend?.testable ? 'exploratory' : 'descriptive';
  const lastYear = v.years[v.years.length - 1];
  const lastValue = v.annual[v.annual.length - 1] ?? null;
  return {
    result: {
      evidence_class: CLASS_LABEL[cls],
      place: placeName(store, place, lang),
      record: variableInfo(store, variable)?.name.en ?? variable,
      years: `${int(v.years[0] ?? 0, lang)}–${int(lastYear ?? 0, lang)}`,
      units: v.units,
      latest: lastValue !== null && lastYear !== undefined ? { year: lastYear, value: lastValue, display: `${num(lastValue, lang)} ${v.units} in ${int(lastYear, lang)}` } : null,
      trend: trend && trend.testable
        ? {
            rate: { value: trend.ratePerDecade, low: trend.lowPerDecade, high: trend.highPerDecade, display: rateDisplay(trend.ratePerDecade, trend.lowPerDecade, trend.highPerDecade, v.units, lang) },
            stands_out_after_testing_all_places: trend.standsOut,
            q: trend.q,
            q_display: trend.q !== null ? `q = ${pFmt(trend.q, lang)}` : null,
            jump_year: trend.jumpYear,
            note: 'Exploration: compared across all places with a false-discovery correction; no test was registered in advance, so this is not a verdict.',
          }
        : { note: trend?.reason ? `No trend test here: ${trend.reason}.` : 'No trend test here.' },
      support: info.passesSupport ? 'enough data squares cover this place' : 'too few data squares, or too much of the average lies outside the border: read with care',
      cannot_answer: variableInfo(store, variable)?.record_card?.cannot_answer.en ?? null,
      source: path,
    },
    evidence: { cls, title: `${placeName(store, place, lang)} · ${variableInfo(store, variable)?.name.en ?? variable}`, sources: [path] },
    view: { screen: 'place', region: place, variable },
  };
}

async function getEvidence(store: Store, place: string, variable: string, season: string | null, lang: Lang): Promise<Outcome> {
  const v = variableInfo(store, variable);
  if (!v) return unavailable(`"${variable}" is not a record in this build. Call get_capabilities for the list.`);
  if (v.status !== 'analysed' && v.status !== 'sensitivity') return unavailable(`${v.name.en} is not analysed in this build.`, { cannot_answer: v.record_card?.cannot_answer.en ?? null });
  const s = season ?? 'ANN';
  if (!SEASONS.includes(s)) return unavailable(`Unknown season ${s}. Use ANN, DJF, MAM, JJAS or ON.`);
  if (place.startsWith('cell:')) {
    return {
      result: { evidence_class: CLASS_LABEL.descriptive, place: place, record: v.name.en, note: 'A 1-degree grid square (about 110 km across). The map shows its yearly values and screening rate; this is exploration, not a verdict, and not a measurement of a single town.' },
      evidence: { cls: 'descriptive', title: `${place} · ${v.name.en}`, sources: [paths.mapMeta(variable, 'ANN')] },
      view: { screen: 'map', variable, region: place },
    };
  }
  const graded = await verdictEvidence(store, place, variable, s, lang);
  if (graded) return graded;
  if (s !== 'ANN') return unavailable(`Seasons are tested only for places with pre-registered tests. For ${placeName(store, place, lang)} only the whole year (ANN) is available.`);
  return (await exploreEvidence(store, place, variable, lang)) ?? unavailable(`No result for ${place}. Call resolve_place first.`);
}

async function comparePlaces(store: Store, a: string, b: string, variable: string, season: string | null, lang: Lang): Promise<Outcome> {
  const s = season ?? 'ANN';
  const pair = store.regionIndex.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  if (pair) {
    const path = paths.contrast(variable, pair.id, s);
    const c = await store.load<Contrast>(path);
    if (c) {
      const findings = challenge(c, path);
      const cls = classOfFamily(c.family);
      const text = c.text[lang] ?? c.text.en;
      return {
        result: {
          evidence_class: CLASS_LABEL[cls],
          what_is_tested: `The trend in the difference ${placeName(store, c.pair.a, lang)} minus ${placeName(store, c.pair.b, lang)}, year by year.`,
          years: `${int(c.window.first, lang)}–${int(c.window.last, lang)}`,
          engine_headline: text.headline,
          difference_rate: { display: rateDisplay(c.spine.ratePerDecade, c.spine.rateLowPerDecade, c.spine.rateHighPerDecade, c.spine.units, lang) },
          deciding_test: c.status === 'verdict' ? { grade: c.grade, display: c.multiplicity.pAdjusted !== null ? `adjusted p = ${pFmt(c.multiplicity.pAdjusted, lang)}` : null } : null,
          each_place: [c.regions.a, c.regions.b].map((side) => ({ place: placeName(store, side.id, lang), rate: rateDisplay(side.ratePerDecade, side.rateLowPerDecade, side.rateHighPerDecade, c.spine.units, lang) })),
          findings: sentences(findings, lang, c.spine.units),
          source: path,
        },
        evidence: { cls, title: text.headline, sources: [path] },
        view: { screen: 'compare', pair: pair.id, variable, season: s },
      };
    }
  }
  const [ea, eb] = await Promise.all([getEvidence(store, a, variable, 'ANN', lang), getEvidence(store, b, variable, 'ANN', lang)]);
  const both = [ea, eb];
  const cls: EvidenceClass = both.some((x) => x.evidence?.cls === 'unavailable') ? 'unavailable' : both.every((x) => x.evidence?.cls === 'descriptive') ? 'descriptive' : 'exploratory';
  return {
    result: {
      evidence_class: CLASS_LABEL[cls],
      note: 'No test of the difference exists for this pair (it is not pre-registered). Each place\'s own exploratory rate is shown side by side; two separate results cannot show that the places changed differently.',
      a: ea.result,
      b: eb.result,
    },
    evidence: { cls, title: `${placeName(store, a, lang)} · ${placeName(store, b, lang)}`, sources: [...(ea.evidence?.sources ?? []), ...(eb.evidence?.sources ?? [])] },
    view: { screen: 'compare', a, b, variable },
  };
}

function showView(store: Store, input: { view: string; place_id: string | null; place_b: string | null; variable: string | null; season: string | null; challenge: boolean | null }): Outcome {
  const variable = input.variable && variableInfo(store, input.variable) ? input.variable : undefined;
  const season = input.season && SEASONS.includes(input.season) ? input.season : undefined;
  let view: View & { challenge?: boolean };
  if (input.view === 'compare' && input.place_id && input.place_b) {
    const pair = store.regionIndex.pairs.find((p) => (p.a === input.place_id && p.b === input.place_b) || (p.a === input.place_b && p.b === input.place_id));
    view = pair ? { screen: 'compare', pair: pair.id, variable, season } : { screen: 'compare', a: input.place_id, b: input.place_b, variable };
  } else if (input.view === 'place' && input.place_id) {
    view = input.place_id.startsWith('cell:') ? { screen: 'map', region: input.place_id, variable } : { screen: 'place', region: input.place_id, variable, season, challenge: input.challenge === true };
  } else if (input.view === 'map' || input.view === 'trends') {
    view = { screen: input.view, variable, ...(input.view === 'map' && input.place_id ? { region: input.place_id } : {}) };
  } else if (input.view === 'methods') {
    view = { screen: 'methods' };
  } else {
    return { result: { opened: false, reason: 'A place view needs place_id; a comparison needs place_id and place_b.' } };
  }
  return { result: { opened: true, screen: view.screen }, view };
}

function explainTerm(term: string, lang: Lang): Outcome {
  const key = `glossary.${term}`;
  const text = translate(lang, key);
  return text === key || text.startsWith('⟦') ? { result: { found: false } } : { result: { term, definition: text } };
}

/** Runs one tool call. Unknown tools and bad inputs return an error result instead of throwing. */
export async function runTool(name: string, input: Record<string, unknown>, store: Store, lang: Lang): Promise<Outcome> {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : null);
  try {
    switch (name) {
      case 'get_capabilities':
        return getCapabilities(store);
      case 'resolve_place':
        return resolvePlace(store, str('name') ?? '');
      case 'get_evidence':
        return await getEvidence(store, str('place_id') ?? '', str('variable') ?? '', str('season'), lang);
      case 'compare_places':
        return await comparePlaces(store, str('place_a') ?? '', str('place_b') ?? '', str('variable') ?? '', str('season'), lang);
      case 'show_view':
        return showView(store, { view: str('view') ?? '', place_id: str('place_id'), place_b: str('place_b'), variable: str('variable'), season: str('season'), challenge: input.challenge === true });
      case 'explain_term':
        return explainTerm(str('term') ?? '', (str('lang') === 'bn' ? 'bn' : 'en'));
      default:
        return { result: { error: `Unknown tool ${name}.` } };
    }
  } catch (err) {
    return { result: { error: `The tool could not read the result files: ${err instanceof Error ? err.message : String(err)}` } };
  }
}

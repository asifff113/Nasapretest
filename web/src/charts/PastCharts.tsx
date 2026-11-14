// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Charts that put the past beside the present, and the trend tests of many places side by side. Every number is
// read from the exploration files (anomalies, decade means, rolling means, trend rates and ranges, latitude rows);
// the charts only place and colour them. Nothing here computes a mean, a difference, a trend or a test.
import { useRef } from 'react';
import * as Plot from '@observablehq/plot';
import type { Lang } from '../data/types';
import type { ExploreTrendItem } from '../data/explore';
import type { CountryFeature } from '../data/places';
import { int, num, rate, tick, yearTick } from '../i18n/format';
import { diverging } from '../map/colours';
import { PlotFigure } from './PlotFigure';
import { useTokens } from './tokens';

/** A colour for a value on a scale symmetric around zero (layout only). */
function signColour(colormap: string | undefined, v: number, limit: number): string {
  const f = diverging(colormap);
  const t = limit > 0 ? Math.min(1, Math.max(0, 0.5 + v / (2 * limit))) : 0.5;
  return f(t);
}

function absMax(values: (number | null | undefined)[]): number {
  let m = 0;
  for (const v of values) if (v !== null && v !== undefined && Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  return m;
}

/** Each year's anomaly as a bar, above or below the baseline mean (the file's values). */
export function AnomalyBars({
  years,
  anomaly,
  baseline,
  units,
  colormap,
  lang,
  label,
  height = 280,
  testId = 'anomaly-bars',
}: {
  years: number[];
  anomaly: (number | null)[];
  baseline: [number, number];
  units: string;
  colormap: string | undefined;
  lang: Lang;
  label: string;
  height?: number;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const lim = absMax(anomaly);
  const bars = years.map((x, i) => ({ x, y: anomaly[i] ?? null })).filter((d) => d.y !== null) as { x: number; y: number }[];
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={height}
        deps={[years, anomaly, tokens, lang, colormap]}
        build={(width) => ({
          height,
          marginLeft: 52,
          marginBottom: 32,
          style: { background: 'transparent', color: tokens.ink, fontSize: '12px' },
          x: { label: null, tickFormat: yearTick(lang), ticks: width < 520 ? 5 : 10, domain: [years[0] - 0.6, years[years.length - 1] + 0.6] },
          y: { label: units, grid: true, tickFormat: (v: number) => tick(v, lang) },
          marks: [
            Plot.ruleY([0], { stroke: tokens.lineStrong }),
            Plot.rectY(bars, {
              x1: (d: { x: number }) => d.x - 0.4,
              x2: (d: { x: number }) => d.x + 0.4,
              y: 'y',
              fill: (d: { y: number }) => signColour(colormap, d.y, lim),
              title: (d: { x: number; y: number }) => `${int(d.x, lang)}: ${rate(d.y, lang)} ${units}`,
            }),
            Plot.text([{ x: years[0], y: 0 }], { x: 'x', y: 'y', text: () => `${int(baseline[0], lang)}–${int(baseline[1], lang)} = 0`, dy: -8, textAnchor: 'start', fill: tokens.muted }),
          ],
        })}
      />
    </div>
  );
}

/** Year × month: each month's anomaly with the seasonal cycle removed (the file's values), as coloured cells. */
export function MonthHeatmap({
  years,
  values,
  months,
  units,
  colormap,
  lang,
  label,
  testId = 'month-heatmap',
}: {
  years: number[];
  values: (number | null)[][];
  months: string[];
  units: string;
  colormap: string | undefined;
  lang: Lang;
  label: string;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const cells = years.flatMap((y, i) => (values[i] ?? []).map((v, m) => ({ y, m, v })).filter((d) => d.v !== null && Number.isFinite(d.v as number)));
  const lim = absMax(cells.map((d) => d.v));
  const height = Math.max(260, Math.min(620, years.length * 11 + 40));
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={height}
        deps={[years, values, tokens, lang, colormap]}
        build={() => ({
          height,
          marginLeft: 44,
          marginBottom: 28,
          padding: 0.04,
          style: { background: 'transparent', color: tokens.ink, fontSize: '11px' },
          x: { domain: months.map((_, i) => i), tickFormat: (i: number) => months[i] ?? '', label: null },
          y: { domain: years, tickFormat: yearTick(lang), label: null, ticks: years.filter((y) => y % 5 === 0) },
          marks: [
            Plot.cell(cells, {
              x: 'm',
              y: 'y',
              fill: (d: { v: number }) => signColour(colormap, d.v, lim),
              title: (d: { y: number; m: number; v: number }) => `${months[d.m]} ${int(d.y, lang)}: ${rate(d.v, lang)} ${units}`,
            }),
          ],
        })}
      />
    </div>
  );
}

/** Each month (and the year) in the first and the last ten years: two dots joined by a line. */
export function DecadeDumbbell({
  rows,
  early,
  late,
  units,
  lang,
  label,
  testId = 'decade-dumbbell',
}: {
  rows: { label: string; early: number | null; late: number | null }[];
  early: string;
  late: string;
  units: string;
  lang: Lang;
  label: string;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const data = rows.filter((r) => r.early !== null && r.late !== null) as { label: string; early: number; late: number }[];
  const height = data.length * 26 + 56;
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={height}
        deps={[rows, tokens, lang]}
        build={() => ({
          height,
          marginLeft: 92,
          marginBottom: 32,
          style: { background: 'transparent', color: tokens.ink, fontSize: '12px' },
          y: { domain: data.map((d) => d.label), label: null },
          x: { label: units, grid: true, tickFormat: (v: number) => tick(v, lang) },
          color: { domain: [early, late], range: [tokens.muted, tokens.accent], legend: true },
          marks: [
            Plot.link(data, { y1: 'label', y2: 'label', x1: 'early', x2: 'late', stroke: tokens.lineStrong, strokeWidth: 2 }),
            Plot.dot(data, { y: 'label', x: 'early', fill: () => early, r: 4.5, title: (d: { label: string; early: number }) => `${d.label}, ${early}: ${num(d.early, lang)} ${units}` }),
            Plot.dot(data, { y: 'label', x: 'late', fill: () => late, r: 5.5, title: (d: { label: string; late: number }) => `${d.label}, ${late}: ${num(d.late, lang)} ${units}` }),
          ],
        })}
      />
    </div>
  );
}

/** The engine's trend per calendar month: a bar per month; months that stand out after allowing for all 12 are solid. */
export function MonthTrendBars({
  months,
  rows,
  units,
  colormap,
  lang,
  label,
  testId = 'month-trends',
}: {
  months: string[];
  rows: { rate: number | null; standsOut: boolean }[];
  units: string;
  colormap: string | undefined;
  lang: Lang;
  label: string;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const data = rows.map((r, m) => ({ m, rate: r.rate, out: r.standsOut })).filter((d) => d.rate !== null) as { m: number; rate: number; out: boolean }[];
  const lim = absMax(data.map((d) => d.rate));
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={240}
        deps={[rows, tokens, lang, colormap]}
        build={() => ({
          height: 240,
          marginLeft: 52,
          marginBottom: 30,
          style: { background: 'transparent', color: tokens.ink, fontSize: '12px' },
          x: { domain: months.map((_, i) => i), tickFormat: (i: number) => months[i] ?? '', label: null, padding: 0.18 },
          y: { label: units, grid: true, tickFormat: (v: number) => tick(v, lang) },
          marks: [
            Plot.ruleY([0], { stroke: tokens.lineStrong }),
            Plot.barY(data, {
              x: 'm',
              y: 'rate',
              fill: (d: { rate: number }) => signColour(colormap, d.rate, lim),
              fillOpacity: (d: { out: boolean }) => (d.out ? 1 : 0.35),
              stroke: (d: { out: boolean }) => (d.out ? tokens.ink : 'none'),
              title: (d: { m: number; rate: number }) => `${months[d.m]}: ${rate(d.rate, lang)} ${units}`,
            }),
          ],
        })}
      />
    </div>
  );
}

/** Places ranked by their tested rate, each with its 95% range; places that stand out are solid. */
export function ForestPlot({
  items,
  names,
  units,
  colormap,
  lang,
  label,
  testId = 'forest-plot',
}: {
  items: ExploreTrendItem[];
  names: Map<string, string>;
  units: string;
  colormap: string | undefined;
  lang: Lang;
  label: string;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const data = items
    .filter((d) => d.ratePerDecade !== null)
    .map((d) => ({ id: d.id, name: names.get(d.id) ?? d.id, rate: d.ratePerDecade as number, lo: d.lowPerDecade ?? (d.ratePerDecade as number), hi: d.highPerDecade ?? (d.ratePerDecade as number), out: d.standsOut }));
  const lim = absMax(data.map((d) => d.rate));
  const height = data.length * 22 + 50;
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={height}
        deps={[items, tokens, lang, colormap]}
        build={() => ({
          height,
          marginLeft: 150,
          marginBottom: 34,
          style: { background: 'transparent', color: tokens.ink, fontSize: '12px' },
          y: { domain: data.map((d) => d.name), label: null },
          x: { label: `${units}`, grid: true, tickFormat: (v: number) => tick(v, lang) },
          marks: [
            Plot.ruleX([0], { stroke: tokens.lineStrong }),
            Plot.ruleY(data, { y: 'name', x1: 'lo', x2: 'hi', stroke: tokens.muted, strokeWidth: 1.5 }),
            Plot.dot(data, {
              y: 'name',
              x: 'rate',
              r: 5,
              fill: (d: { rate: number; out: boolean }) => (d.out ? signColour(colormap, d.rate, lim) : tokens.surface),
              stroke: (d: { rate: number }) => signColour(colormap, d.rate, lim),
              strokeWidth: 2,
              title: (d: { name: string; rate: number; lo: number; hi: number }) => `${d.name}: ${rate(d.rate, lang)} (${rate(d.lo, lang, d.rate)} … ${rate(d.hi, lang, d.rate)}) ${units}`,
            }),
          ],
        })}
      />
    </div>
  );
}

/** Countries coloured by their tested rate; countries that do not stand out are pale; no test is grey. */
export function TrendMap({
  countries,
  rateOf,
  units,
  colormap,
  lang,
  label,
  testId = 'trend-map',
}: {
  countries: CountryFeature[];
  /** The country's tested rate and whether it stands out, by outline name (null: no test there). */
  rateOf: (name: string) => { rate: number; standsOut: boolean } | null;
  units: string;
  colormap: string | undefined;
  lang: Lang;
  label: string;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const rated = countries.map((f) => ({ f, r: rateOf(f.properties.name) }));
  const lim = absMax(rated.map((d) => d.r?.rate ?? null));
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={300}
        deps={[countries, rateOf, tokens, lang, colormap]}
        build={(width) => ({
          height: Math.round(width * 0.5),
          projection: 'equal-earth',
          style: { background: 'transparent', color: tokens.ink },
          marks: [
            Plot.sphere({ stroke: tokens.line, fill: tokens.bg }),
            Plot.geo(
              rated.map((d) => d.f),
              {
                fill: (f: CountryFeature) => {
                  const r = rated.find((d) => d.f === f)?.r;
                  return r ? signColour(colormap, r.rate, lim) : tokens.line;
                },
                fillOpacity: (f: CountryFeature) => {
                  const r = rated.find((d) => d.f === f)?.r;
                  return r ? (r.standsOut ? 1 : 0.35) : 0.6;
                },
                stroke: tokens.bg,
                strokeWidth: 0.4,
                title: (f: CountryFeature) => {
                  const r = rated.find((d) => d.f === f)?.r;
                  return r ? `${f.properties.name}: ${rate(r.rate, lang)} ${units}` : f.properties.name;
                },
              },
            ),
          ],
        })}
      />
    </div>
  );
}

/** Latitude × year: each latitude row's anomaly (the file's values). */
export function Hovmoller({
  years,
  lat,
  values,
  units,
  colormap,
  lang,
  label,
  testId = 'hovmoller',
}: {
  years: number[];
  lat: number[];
  values: (number | null)[][];
  units: string;
  colormap: string | undefined;
  lang: Lang;
  label: string;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const cells = lat.flatMap((la, r) => years.map((y, i) => ({ y, la, v: values[r]?.[i] ?? null }))).filter((d) => d.v !== null) as { y: number; la: number; v: number }[];
  const lim = absMax(cells.map((d) => d.v));
  const latTick = (v: number) => (v === 0 ? '0°' : `${int(Math.abs(v), lang)}°${v > 0 ? 'N' : 'S'}`);
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={360}
        deps={[years, lat, values, tokens, lang, colormap]}
        build={(width) => ({
          height: 360,
          marginLeft: 48,
          marginBottom: 30,
          style: { background: 'transparent', color: tokens.ink, fontSize: '11px' },
          x: { label: null, tickFormat: yearTick(lang), ticks: width < 520 ? 5 : 10 },
          y: { label: null, domain: [-90, 90], tickFormat: latTick, ticks: [-60, -30, 0, 30, 60] },
          marks: [
            Plot.rect(cells, {
              x1: (d: { y: number }) => d.y - 0.5,
              x2: (d: { y: number }) => d.y + 0.5,
              y1: (d: { la: number }) => d.la - 0.5,
              y2: (d: { la: number }) => d.la + 0.5,
              fill: (d: { v: number }) => signColour(colormap, d.v, lim),
              title: (d: { y: number; la: number; v: number }) => `${int(d.y, lang)}, ${latTick(d.la)}: ${rate(d.v, lang)} ${units}`,
            }),
          ],
        })}
      />
    </div>
  );
}

/** A climograph for two periods: temperature as lines (top) and rain as bars (bottom), month by month. */
export function ClimographThenNow({
  months,
  temp,
  rain,
  early,
  late,
  tempUnits,
  rainUnits,
  lang,
  label,
  testId = 'climograph',
}: {
  months: string[];
  temp: { early: (number | null)[]; late: (number | null)[] };
  rain: { early: (number | null)[]; late: (number | null)[] };
  early: string;
  late: string;
  tempUnits: string;
  rainUnits: string;
  lang: Lang;
  label: string;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const series = (vals: { early: (number | null)[]; late: (number | null)[] }) =>
    (['early', 'late'] as const).flatMap((k) => vals[k].map((v, m) => ({ m, v, p: k === 'early' ? early : late })).filter((d) => d.v !== null)) as {
      m: number;
      v: number;
      p: string;
    }[];
  const t = series(temp);
  const r = series(rain);
  const x = { domain: months.map((_, i) => i), tickFormat: (i: number) => months[i] ?? '', label: null };
  const colour = { domain: [early, late], range: [tokens.muted, tokens.accent], legend: true };
  return (
    <div ref={scope} className="flex flex-col gap-1" data-testid={testId}>
      <PlotFigure
        label={label}
        minHeight={190}
        deps={[temp, tokens, lang]}
        build={() => ({
          height: 190,
          marginLeft: 52,
          style: { background: 'transparent', color: tokens.ink, fontSize: '12px' },
          x: { ...x, axis: null },
          y: { label: tempUnits, grid: true, tickFormat: (v: number) => tick(v, lang) },
          color: colour,
          marks: [Plot.line(t, { x: 'm', y: 'v', stroke: 'p', strokeWidth: 2.2 }), Plot.dot(t, { x: 'm', y: 'v', fill: 'p', r: 3, title: (d: { m: number; v: number; p: string }) => `${months[d.m]}, ${d.p}: ${num(d.v, lang)} ${tempUnits}` })],
        })}
      />
      <PlotFigure
        label={label}
        minHeight={170}
        deps={[rain, tokens, lang]}
        build={() => ({
          height: 170,
          marginLeft: 52,
          marginBottom: 30,
          style: { background: 'transparent', color: tokens.ink, fontSize: '12px' },
          x: { ...x, padding: 0.15 },
          fx: undefined,
          y: { label: rainUnits, grid: true, tickFormat: (v: number) => tick(v, lang) },
          color: { domain: [early, late], range: [tokens.muted, tokens.link] },
          marks: [
            Plot.rectY(r, {
              x1: (d: { m: number; p: string }) => d.m + (d.p === early ? -0.38 : 0.02),
              x2: (d: { m: number; p: string }) => d.m + (d.p === early ? -0.02 : 0.38),
              y: 'v',
              fill: 'p',
              title: (d: { m: number; v: number; p: string }) => `${months[d.m]}, ${d.p}: ${num(d.v, lang)} ${rainUnits}`,
            }),
          ],
        })}
      />
    </div>
  );
}

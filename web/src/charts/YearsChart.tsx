// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Yearly values of one or two places on one chart, as the result files hold them: dots joined by a line, gaps where
// a value is missing. No trend line and no difference: the chart only places the file's numbers. `upto` hides the
// years after it, so a "play" button can draw the record year by year. `marks` rings chosen years (for example the
// highest and the lowest, picked by sorting the values shown).
import { useRef } from 'react';
import * as Plot from '@observablehq/plot';
import type { Lang } from '../data/types';
import { int, num, tick, yearTick } from '../i18n/format';
import { PlotFigure } from './PlotFigure';
import { useTokens } from './tokens';

export interface YearsSeries {
  label: string;
  years: number[];
  values: (number | null)[];
  /** "a" draws in the accent colour, "b" in the link colour. */
  tone: 'a' | 'b';
}

export interface YearMark {
  year: number;
  value: number;
  text: string;
}

export function YearsChart({
  series,
  units,
  lang,
  label,
  upto,
  marks = [],
  height = 300,
  testId,
}: {
  series: YearsSeries[];
  units: string;
  lang: Lang;
  label: string;
  upto?: number;
  marks?: YearMark[];
  height?: number;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const rows = series.flatMap((s) => s.years.map((y, i) => ({ s: s.label, tone: s.tone, x: y, y: s.values[i] ?? null })));
  const shown = upto === undefined ? rows : rows.filter((r) => r.x <= upto);
  const all = rows.filter((r) => r.y !== null).map((r) => r.y as number);
  const xs = rows.map((r) => r.x);
  const colour = (tone: 'a' | 'b') => (tone === 'a' ? tokens.accent : tokens.link);
  const two = series.length > 1;
  const visibleMarks = upto === undefined ? marks : marks.filter((m) => m.year <= upto);
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={height}
        deps={[series, units, lang, tokens, upto, marks, height]}
        build={(width) => {
          const narrow = width < 520;
          return {
            height,
            marginLeft: narrow ? 48 : 60,
            marginRight: 18,
            marginTop: 28,
            marginBottom: 30,
            style: { color: tokens.ink, background: 'transparent', fontSize: '12px' },
            x: { tickFormat: yearTick(lang), ticks: narrow ? 4 : 9, label: null, domain: [Math.min(...xs), Math.max(...xs)] },
            y: {
              tickFormat: (v: number) => tick(v, lang),
              label: units,
              labelAnchor: 'top',
              labelArrow: 'none',
              grid: true,
              ticks: narrow ? 4 : 6,
              domain: all.length ? [Math.min(...all), Math.max(...all)] : undefined,
              nice: true,
            },
            marks: [
              Plot.gridY({ stroke: tokens.line, strokeOpacity: 1 }),
              ...series.map((s) =>
                Plot.line(
                  shown.filter((r) => r.s === s.label),
                  { x: 'x', y: 'y', stroke: colour(s.tone), strokeWidth: two ? 2 : 1.6, curve: 'monotone-x' },
                ),
              ),
              ...series.map((s) =>
                Plot.dot(
                  shown.filter((r) => r.s === s.label),
                  { x: 'x', y: 'y', r: two ? 2.4 : 3, fill: tokens.surface, stroke: colour(s.tone), strokeWidth: 1.4 },
                ),
              ),
              Plot.dot(visibleMarks, { x: 'year', y: 'value', r: 7, stroke: tokens.ink, strokeWidth: 1.5, fill: 'none' }),
              Plot.text(visibleMarks, { x: 'year', y: 'value', text: 'text', dy: -14, fill: tokens.ink, fontWeight: 600, fontSize: 11.5, stroke: tokens.surface, strokeWidth: 3, paintOrder: 'stroke' }),
              Plot.tip(
                shown,
                Plot.pointerX({
                  x: 'x',
                  y: 'y',
                  title: (d: { s: string; x: number; y: number | null }) => `${two ? `${d.s}\n` : ''}${int(d.x, lang)}: ${d.y === null ? '–' : `${num(d.y, lang, 2)} ${units}`}`,
                }),
              ),
            ],
          };
        }}
      />
    </div>
  );
}

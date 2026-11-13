// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// DifferenceChart (docs/04_UI.md §6.2). Top: A and B on one axis, each with its own Sen line from its verdict's
// "chart" block, labelled directly. Bottom: the difference A − B as departures from its window mean
// (the contrast's chart.values), with its Sen line, band and a zero line.
import * as Plot from '@observablehq/plot';
import type { Contrast, Lang, Verdict } from '../data/types';
import { num, tick, yearTick } from '../i18n/format';
import { PlotFigure } from './PlotFigure';
import { TrendChart } from './TrendChart';
import { useTokens } from './tokens';

export function PairChart({
  a,
  b,
  nameA,
  nameB,
  lang,
  label,
}: {
  a: Verdict;
  b: Verdict;
  nameA: string;
  nameB: string;
  lang: Lang;
  label: string;
}) {
  const tokens = useTokens();
  const series = (v: Verdict, who: 'A' | 'B') => v.series.years.map((x, i) => ({ x, y: v.chart?.values[i] ?? null, who }));
  const pts = [...series(a, 'A'), ...series(b, 'B')];
  const lines = [
    ...(a.chart?.line ?? []).map(([x, y]) => ({ x, y, who: 'A' })),
    ...(b.chart?.line ?? []).map(([x, y]) => ({ x, y, who: 'B' })),
  ];
  const ends = [
    { ...(series(a, 'A').filter((d) => d.y !== null).at(-1) ?? { x: 0, y: 0 }), name: nameA, who: 'A' },
    { ...(series(b, 'B').filter((d) => d.y !== null).at(-1) ?? { x: 0, y: 0 }), name: nameB, who: 'B' },
  ];
  const colour = (who: string) => (who === 'A' ? tokens.link : tokens.accent);
  return (
    <PlotFigure
      label={label}
      testId="pair-chart"
      minHeight={240}
      deps={[a, b, nameA, nameB, lang, tokens]}
      build={(width) => {
        const narrow = width < 560;
        return {
          height: narrow ? 230 : 270,
          marginLeft: narrow ? 44 : 56,
          marginRight: narrow ? 12 : 150,
          marginTop: 24,
          marginBottom: 28,
          style: { color: tokens.ink, background: 'transparent', fontSize: '12px' },
          x: { tickFormat: yearTick(lang), ticks: narrow ? 4 : 8, label: null, nice: false },
          y: { tickFormat: (v: number) => tick(v, lang), label: a.series.units, labelAnchor: 'top', labelArrow: 'none', grid: true, ticks: narrow ? 4 : 5 },
          marks: [
            Plot.gridY({ stroke: tokens.line, strokeOpacity: 1 }),
            Plot.line(pts, { x: 'x', y: 'y', z: 'who', stroke: (d: { who: string }) => colour(d.who), strokeWidth: 1.25, strokeOpacity: 0.55 }),
            Plot.dot(pts, { x: 'x', y: 'y', fill: (d: { who: string }) => colour(d.who), r: 2, fillOpacity: 0.85 }),
            ...(['A', 'B'] as const).map((who) => {
              const v = who === 'A' ? a : b;
              const solid = v.status === 'verdict' && v.grade !== 'cant_tell_yet';
              return Plot.line(
                lines.filter((d) => d.who === who),
                { x: 'x', y: 'y', stroke: colour(who), strokeWidth: 2.5, strokeDasharray: solid ? undefined : '7 5', strokeLinecap: 'round' },
              );
            }),
            narrow
              ? null
              : Plot.text(ends, {
                  x: 'x',
                  y: 'y',
                  text: 'name',
                  dx: 8,
                  textAnchor: 'start',
                  fill: (d: { who: string }) => colour(d.who),
                  fontWeight: 600,
                  lineWidth: 12,
                }),
            Plot.tip(
              pts,
              Plot.pointerX({
                x: 'x',
                y: 'y',
                stroke: (d: { who: string }) => colour(d.who),
                title: (d: { x: number; y: number | null; who: string }) =>
                  `${d.who === 'A' ? nameA : nameB}\n${yearTick(lang)(d.x)}: ${d.y === null ? '–' : `${num(d.y, lang, 2)} ${a.series.units}`}`,
              }),
            ),
          ],
        };
      }}
    />
  );
}

export function DifferenceChart({
  contrast,
  colour,
  lang,
  label,
  text,
}: {
  contrast: Contrast;
  colour: string;
  lang: Lang;
  label: string;
  text: { sen: string; band: string; dataChange: string; jump: string; units: string };
}) {
  if (!contrast.chart) return null;
  const solid = contrast.status === 'verdict' && contrast.grade !== 'cant_tell_yet';
  return (
    <TrendChart
      years={contrast.difference.years}
      chart={contrast.chart}
      solid={solid}
      colour={colour}
      units={text.units}
      breaks={contrast.robustness.breaks}
      pettittYear={contrast.robustness.pettitt?.flagged ? contrast.robustness.pettitt.year : null}
      label={label}
      lang={lang}
      text={text}
      zero
      testId="difference-chart"
      tour="difference-chart"
      height={undefined}
    />
  );
}

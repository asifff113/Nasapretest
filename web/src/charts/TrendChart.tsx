// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// TrendChart (docs/04_UI.md §6.1). It draws what the engine wrote in the result's "chart" block:
// display values, the Sen line as two end points, the 95% range as a bow-tie through the pivot.
// The only arithmetic is scaling to pixels.
import * as Plot from '@observablehq/plot';
import type { BreakItem, ChartBlock, Lang } from '../data/types';
import { num, tick, yearTick } from '../i18n/format';
import { PlotFigure } from './PlotFigure';
import { useTokens } from './tokens';

export interface TrendChartProps {
  years: number[];
  chart: ChartBlock;
  /** Solid for a verdict; dashed for can't tell yet, exploration and sensitivity results. */
  solid: boolean;
  colour: string;
  units: string;
  breaks?: BreakItem[];
  pettittYear?: number | null;
  label: string;
  lang: Lang;
  text: { sen: string; band: string; dataChange: string; jump: string; reviewed?: (b: BreakItem) => string };
  height?: number;
  testId?: string;
  tour?: string;
  /** Draw a zero line (the difference chart). */
  zero?: boolean;
}

/** The bow-tie: the area between the band's low and high lines, which cross at the pivot. */
export function bandArea(chart: ChartBlock): { x: number; y1: number; y2: number }[] {
  if (!chart.band || !chart.pivot) return [];
  const { low, high } = chart.band;
  return [
    { x: low[0][0], y1: low[0][1], y2: high[0][1] },
    { x: chart.pivot[0], y1: chart.pivot[1], y2: chart.pivot[1] },
    { x: low[1][0], y1: low[1][1], y2: high[1][1] },
  ];
}

export function TrendChart(p: TrendChartProps) {
  const tokens = useTokens();
  const points = p.years.map((x, i) => ({ x, y: p.chart.values[i] ?? null }));
  const line = p.chart.line ? p.chart.line.map(([x, y]) => ({ x, y })) : [];
  const band = bandArea(p.chart);
  const breaks = (p.breaks ?? []).filter((b) => b.year !== null);
  return (
    <PlotFigure
      label={p.label}
      testId={p.testId ?? 'trend-chart'}
      tour={p.tour ?? 'trend-chart'}
      minHeight={p.height ?? 300}
      deps={[p.chart, p.years, p.solid, p.colour, p.lang, tokens, p.units, breaks.length, p.pettittYear, p.text.sen, p.zero]}
      build={(width) => {
        const narrow = width < 520;
        const lastX = p.years[p.years.length - 1] ?? 0;
        return {
          height: p.height ?? (narrow ? 250 : 320),
          marginLeft: narrow ? 44 : 56,
          marginRight: narrow ? 12 : 84,
          marginTop: 26,
          marginBottom: 30,
          style: { color: tokens.ink, background: 'transparent', fontSize: '12px' },
          x: { tickFormat: yearTick(p.lang), ticks: narrow ? 4 : 8, label: null, line: false, nice: false },
          y: { tickFormat: (v: number) => tick(v, p.lang), label: p.units, labelAnchor: 'top', labelArrow: 'none', grid: true, nice: true, ticks: narrow ? 4 : 6 },
          marks: [
            Plot.gridY({ stroke: tokens.line, strokeOpacity: 1 }),
            p.zero ? Plot.ruleY([0], { stroke: tokens.ink, strokeOpacity: 0.55, strokeWidth: 1 }) : null,
            band.length ? Plot.areaY(band, { x: 'x', y1: 'y1', y2: 'y2', fill: p.colour, fillOpacity: tokens.dark ? 0.22 : 0.14, curve: 'linear' }) : null,
            ...breaks.map((b) =>
              Plot.ruleX([b.year], { stroke: tokens.muted, strokeDasharray: '4 4', strokeWidth: 1.25 }),
            ),
            breaks.length
              ? Plot.text(breaks, {
                  x: 'year',
                  frameAnchor: 'top',
                  dy: -14,
                  text: (b: BreakItem) => (p.text.reviewed ? p.text.reviewed(b) : p.text.dataChange),
                  fill: tokens.muted,
                  fontSize: 11,
                  textAnchor: 'middle',
                })
              : null,
            Plot.line(points, { x: 'x', y: 'y', stroke: tokens.muted, strokeWidth: 1.25, strokeOpacity: 0.8 }),
            Plot.dot(points, { x: 'x', y: 'y', r: narrow ? 2.4 : 2.8, fill: tokens.surface, stroke: tokens.ink, strokeWidth: 1.2 }),
            line.length
              ? Plot.line(line, { x: 'x', y: 'y', stroke: p.colour, strokeWidth: 2.75, strokeDasharray: p.solid ? undefined : '7 5', strokeLinecap: 'round' })
              : null,
            line.length && !narrow
              ? Plot.text([line[line.length - 1]], { x: 'x', y: 'y', text: () => p.text.sen, dx: 8, textAnchor: 'start', fill: p.colour, fontWeight: 600, fontSize: 12 })
              : null,
            band.length && !narrow
              ? Plot.text([{ x: lastX, y: band[2]?.y2 ?? 0 }], { x: 'x', y: 'y', text: () => p.text.band, dx: 8, textAnchor: 'start', fill: tokens.muted, fontSize: 11 })
              : null,
            p.pettittYear
              ? Plot.text([p.pettittYear], { x: (d: number) => d, frameAnchor: 'bottom', dy: -6, text: () => `▲ ${p.text.jump}`, fill: tokens.accent, fontSize: 11, fontWeight: 600 })
              : null,
            Plot.tip(points, Plot.pointerX({ x: 'x', y: 'y', title: (d: { x: number; y: number | null }) => `${yearTick(p.lang)(d.x)}: ${d.y === null ? '–' : `${num(d.y, p.lang, 2)} ${p.units}`}` })),
          ],
        };
      }}
    />
  );
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Two records of one place against each other: one dot per year, its x from one record's yearly value and its y
// from the other's, joined in time order and shaded from the first year (pale) to the last (dark). It places the
// file's numbers only: no fitted line, no correlation, and no claim that one record drives the other.
import { useRef } from 'react';
import * as Plot from '@observablehq/plot';
import type { Lang } from '../data/types';
import { int, num, tick } from '../i18n/format';
import { PlotFigure } from './PlotFigure';
import { useTokens } from './tokens';

export function RelationChart({
  years,
  x,
  y,
  xLabel,
  yLabel,
  lang,
  label,
  height = 340,
  testId = 'relation-chart',
}: {
  years: number[];
  x: (number | null)[];
  y: (number | null)[];
  xLabel: string;
  yLabel: string;
  lang: Lang;
  label: string;
  height?: number;
  testId?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const pts = years
    .map((yr, i) => ({ yr, x: x[i] ?? null, y: y[i] ?? null }))
    .filter((p): p is { yr: number; x: number; y: number } => p.x !== null && p.y !== null);
  const ends = pts.length ? [pts[0]!, pts[pts.length - 1]!] : [];
  return (
    <div ref={scope} className="contents">
      <PlotFigure
        label={label}
        testId={testId}
        minHeight={height}
        deps={[years, x, y, xLabel, yLabel, lang, tokens, height]}
        build={(width) => ({
          height,
          marginLeft: width < 520 ? 52 : 64,
          marginRight: 20,
          marginTop: 28,
          marginBottom: 42,
          style: { color: tokens.ink, background: 'transparent', fontSize: '12px' },
          x: { tickFormat: (v: number) => tick(v, lang), label: xLabel, labelAnchor: 'center', labelArrow: 'none', grid: true, nice: true, ticks: width < 520 ? 4 : 6 },
          y: { tickFormat: (v: number) => tick(v, lang), label: yLabel, labelAnchor: 'top', labelArrow: 'none', grid: true, nice: true, ticks: 6 },
          color: { type: 'sequential', scheme: tokens.dark ? 'YlOrRd' : 'YlGnBu', domain: [pts[0]?.yr ?? 0, pts[pts.length - 1]?.yr ?? 1] },
          marks: [
            Plot.line(pts, { x: 'x', y: 'y', stroke: tokens.lineStrong, strokeWidth: 1, strokeOpacity: 0.9, curve: 'catmull-rom' }),
            Plot.dot(pts, { x: 'x', y: 'y', fill: 'yr', r: 4.5, stroke: tokens.ink, strokeWidth: 0.6 }),
            Plot.text(ends, { x: 'x', y: 'y', text: (d: { yr: number }) => int(d.yr, lang), dy: -12, fontWeight: 600, fill: tokens.ink, stroke: tokens.surface, strokeWidth: 3, paintOrder: 'stroke' }),
            Plot.tip(
              pts,
              Plot.pointer({
                x: 'x',
                y: 'y',
                title: (d: { yr: number; x: number; y: number }) => `${int(d.yr, lang)}\n${xLabel}: ${num(d.x, lang, 2)}\n${yLabel}: ${num(d.y, lang, 2)}`,
              }),
            ),
          ],
        })}
      />
    </div>
  );
}

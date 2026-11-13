// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// A plain series: values as dots joined by a line, gaps where values are missing. No trend line:
// used for cell pages (the map file holds no line) and the "every month" view.
import { useRef } from 'react';
import * as Plot from '@observablehq/plot';
import type { Lang } from '../data/types';
import { num, tick, yearTick } from '../i18n/format';
import { PlotFigure } from './PlotFigure';
import { useTokens } from './tokens';

export function SeriesChart({
  x,
  y,
  units,
  lang,
  label,
  height = 240,
  dots = true,
  testId,
  xFormat,
}: {
  x: number[];
  y: (number | null)[];
  units: string;
  lang: Lang;
  label: string;
  height?: number;
  dots?: boolean;
  testId?: string;
  xFormat?: (v: number) => string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const pts = x.map((v, i) => ({ x: v, y: y[i] ?? null }));
  return (
    <div ref={scope} className="contents">
    <PlotFigure
      label={label}
      testId={testId}
      minHeight={height}
      deps={[x, y, units, lang, tokens, dots, height]}
      build={(width) => {
        const narrow = width < 520;
        return {
          height,
          marginLeft: narrow ? 44 : 56,
          marginRight: 16,
          marginTop: 24,
          marginBottom: 28,
          style: { color: tokens.ink, background: 'transparent', fontSize: '12px' },
          x: { tickFormat: xFormat ?? yearTick(lang), ticks: narrow ? 4 : 8, label: null, nice: false },
          y: { tickFormat: (v: number) => tick(v, lang), label: units, labelAnchor: 'top', labelArrow: 'none', grid: true, ticks: narrow ? 4 : 5 },
          marks: [
            Plot.gridY({ stroke: tokens.line, strokeOpacity: 1 }),
            Plot.line(pts, { x: 'x', y: 'y', stroke: dots ? tokens.muted : tokens.ink, strokeWidth: dots ? 1.25 : 1, strokeOpacity: dots ? 0.8 : 0.6 }),
            dots ? Plot.dot(pts, { x: 'x', y: 'y', r: 2.6, fill: tokens.surface, stroke: tokens.ink, strokeWidth: 1.2 }) : null,
            Plot.tip(pts, Plot.pointerX({ x: 'x', y: 'y', title: (d: { x: number; y: number | null }) => `${(xFormat ?? yearTick(lang))(d.x)}: ${d.y === null ? '–' : `${num(d.y, lang, 2)} ${units}`}` })),
          ],
        };
      }}
    />
    </div>
  );
}

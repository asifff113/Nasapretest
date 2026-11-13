// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// A small, light chart of a result's "chart" block in plain SVG (no chart library on the home screen).
// Values, the Sen line and the band are drawn as written; the only arithmetic is scaling to pixels.
import type { ChartBlock } from '../data/types';

export function Sparkline({
  years,
  chart,
  colour,
  solid,
  className,
  height = 96,
  zero = false,
}: {
  years: number[];
  chart: ChartBlock;
  colour: string;
  solid: boolean;
  className?: string;
  height?: number;
  zero?: boolean;
}) {
  const W = 320;
  const H = height;
  const pad = 6;
  const ys: number[] = [];
  chart.values.forEach((v) => {
    if (v !== null) ys.push(v);
  });
  chart.line?.forEach(([, y]) => ys.push(y));
  if (chart.band) [...chart.band.low, ...chart.band.high].forEach(([, y]) => ys.push(y));
  if (zero) ys.push(0);
  const x0 = years[0] ?? 0;
  const x1 = years[years.length - 1] ?? 1;
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - lo) / (hi - lo || 1)) * (H - 2 * pad);
  let d = '';
  let pen = false;
  years.forEach((x, i) => {
    const v = chart.values[i];
    if (v === null || v === undefined) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(v).toFixed(1)}`;
    pen = true;
  });
  const band =
    chart.band && chart.pivot
      ? `M${sx(chart.band.low[0][0])},${sy(chart.band.low[0][1])}L${sx(chart.pivot[0])},${sy(chart.pivot[1])}L${sx(chart.band.high[0][0])},${sy(chart.band.high[0][1])}Z` +
        `M${sx(chart.band.low[1][0])},${sy(chart.band.low[1][1])}L${sx(chart.pivot[0])},${sy(chart.pivot[1])}L${sx(chart.band.high[1][0])},${sy(chart.band.high[1][1])}Z`
      : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {zero ? <line x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" /> : null}
      {band ? <path d={band} fill={colour} fillOpacity="0.16" /> : null}
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth="1.25" strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />
      {chart.line ? (
        <line
          x1={sx(chart.line[0][0])}
          y1={sy(chart.line[0][1])}
          x2={sx(chart.line[1][0])}
          y2={sy(chart.line[1][1])}
          stroke={colour}
          strokeWidth="2.75"
          strokeDasharray={solid ? undefined : '7 5'}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

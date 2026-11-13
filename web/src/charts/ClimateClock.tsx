// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The year's rhythm as a clock: twelve wedges, January at the top, each as long as that month's value in the
// file's monthly climatology. The radius runs from the lowest to the highest value shown (like a chart axis), so
// the shape shows the seasons; two places share one clock, side by side in each month. Only positions and colours
// are worked out here. A list under the picture gives every value for screen readers.
import { useState } from 'react';
import type { Lang } from '../data/types';
import { useT } from '../i18n';
import { num } from '../i18n/format';
import { cn } from '../ui/common/utils';

export interface ClockSeries {
  label: string;
  values: (number | null)[];
  tone: 'a' | 'b';
}

const TONE = { a: 'var(--accent)', b: 'var(--link)' } as const;

function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
}

export function ClimateClock({
  series,
  units,
  lang,
  label,
  size = 340,
  className,
  testId = 'climate-clock',
}: {
  series: ClockSeries[];
  units: string;
  lang: Lang;
  label: string;
  size?: number;
  className?: string;
  testId?: string;
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const present = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (present.length === 0) return null;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const W = 400;
  const c = W / 2;
  const r0 = 58;
  const r1 = 168;
  const len = (v: number) => r0 + 6 + (hi > lo ? (v - lo) / (hi - lo) : 0.5) * (r1 - r0 - 6);
  const step = (2 * Math.PI) / 12;
  const gap = 0.05;
  const k = series.length;
  const months = Array.from({ length: 12 }, (_, i) => t(`site.month.${i + 1}`));
  return (
    <figure className={cn('m-0 flex flex-col items-center gap-3', className)} data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${W}`} width={size} height={size} className="max-w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        <circle cx={c} cy={c} r={r1} fill="none" stroke="var(--line)" />
        <circle cx={c} cy={c} r={(r0 + r1) / 2} fill="none" stroke="var(--line)" strokeDasharray="2 4" />
        <circle cx={c} cy={c} r={r0} fill="var(--surface-2)" stroke="var(--line-strong)" />
        {months.map((m, i) => {
          const a = i * step + step / 2;
          const x = c + (r1 + 18) * Math.sin(a);
          const y = c - (r1 + 18) * Math.cos(a);
          return (
            <text key={m} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-[var(--muted)] font-mono text-[11px]">
              {m}
            </text>
          );
        })}
        {Array.from({ length: 12 }, (_, i) => {
          const a0 = i * step + gap;
          const span = (step - 2 * gap) / k;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.45}>
              <path d={wedge(c, c, r0, r1, i * step, (i + 1) * step)} fill="transparent" />
              {series.map((s, j) => {
                const v = s.values[i];
                if (v === null || v === undefined || !Number.isFinite(v)) return null;
                return <path key={s.label} d={wedge(c, c, r0, len(v), a0 + j * span, a0 + (j + 1) * span)} fill={TONE[s.tone]} fillOpacity={0.88} stroke="var(--surface)" strokeWidth={1} />;
              })}
            </g>
          );
        })}
        <text x={c} y={c - 8} textAnchor="middle" className="fill-[var(--ink)] font-display text-[22px]">
          {hover !== null ? months[hover] : units}
        </text>
        <text x={c} y={c + 14} textAnchor="middle" className="fill-[var(--muted)] font-mono text-[10.5px]">
          {hover !== null
            ? series.map((s) => num(s.values[hover] ?? null, lang, 1)).join(' · ')
            : `${num(lo, lang, 1)}–${num(hi, lang, 1)}`}
        </text>
      </svg>
      {k > 1 ? (
        <figcaption className="flex flex-wrap justify-center gap-4 text-[13px]">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-[3px]" style={{ background: TONE[s.tone] }} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}
      <ul className="sr-only">
        {months.map((m, i) => (
          <li key={m}>
            {m}: {series.map((s) => `${s.label} ${num(s.values[i] ?? null, lang, 2)} ${units}`).join('; ')}
          </li>
        ))}
      </ul>
    </figure>
  );
}

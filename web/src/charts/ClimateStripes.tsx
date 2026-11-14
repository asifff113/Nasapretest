// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Climate stripes: one coloured stripe per year, from the yearly values the result file already holds. The colour
// scale runs from the lowest to the highest value shown (like a chart axis), with the record's own palette
// (temperature blue → red, rain brown → green). No mean or trend is computed: only positions and colours.
// A missing year is hatched. Hover or focus shows the year and its value.
import { useId, useState } from "react";
import type { Lang } from "../data/types";
import { useT } from "../i18n";
import { int, num } from "../i18n/format";
import { diverging } from "../map/colours";
import { cn } from "../ui/common/utils";

export function ClimateStripes({
  years,
  values,
  units,
  colormap,
  lang,
  label,
  height = 64,
  className,
  testId = "climate-stripes",
  showScale = true,
  bare = false,
}: {
  years: number[];
  values: (number | null)[];
  units: string;
  colormap: string | undefined;
  lang: Lang;
  /** What the stripes show, for screen readers. */
  label: string;
  height?: number;
  className?: string;
  testId?: string;
  showScale?: boolean;
  /** Stripes only, without the years and scale line (for a table row whose header explains them). */
  bare?: boolean;
}) {
  const t = useT();
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const present = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (years.length === 0 || present.length === 0) return null;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const interp = diverging(colormap);
  const pos = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
  const n = years.length;
  const h =
    hover !== null
      ? { year: years[hover], value: values[hover] ?? null }
      : null;
  const loColour = interp(0);
  const hiColour = interp(1);
  return (
    <figure className={cn("m-0", className)} data-testid={testId}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${n} 1`}
          preserveAspectRatio="none"
          className="block w-full overflow-hidden rounded-[6px]"
          style={{ height }}
          role="img"
          aria-label={label}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern
              id={`gap-${uid}`}
              width="0.5"
              height="0.2"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="0.5" height="0.2" fill="var(--surface-2)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="0.2"
                stroke="var(--muted)"
                strokeWidth="0.15"
                strokeOpacity="0.5"
              />
            </pattern>
          </defs>
          {years.map((y, i) => {
            const v = values[i];
            const ok = v !== null && v !== undefined && Number.isFinite(v);
            return (
              <rect
                key={y}
                x={i}
                y={0}
                width={1.02}
                height={1}
                fill={ok ? interp(pos(v)) : `url(#gap-${uid})`}
                onMouseEnter={() => setHover(i)}
                opacity={hover === null || hover === i ? 1 : 0.82}
              />
            );
          })}
        </svg>
        {h ? (
          <span
            className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[12px] font-semibold shadow-card tabular"
            style={{ left: `${((hover ?? 0) + 0.5) * (100 / n)}%` }}
            aria-hidden="true"
          >
            {h.year !== undefined ? int(h.year, lang) : ""}:{" "}
            {h.value === null ? "–" : `${num(h.value, lang, 2)} ${units}`}
          </span>
        ) : null}
      </div>
      {bare ? null : (
        <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-muted">
          <span className="font-mono tabular">{int(years[0] ?? 0, lang)}</span>
          {showScale ? (
            <span className="inline-flex items-center gap-2">
              <span className="tabular">{`${num(lo, lang, 2)} ${units}`}</span>
              <span
                className="inline-block h-2 w-16 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${loColour}, ${interp(0.5)}, ${hiColour})`,
                }}
                aria-hidden="true"
              />
              <span className="tabular">{`${num(hi, lang, 2)} ${units}`}</span>
            </span>
          ) : (
            <span>{t("site.stripes.note")}</span>
          )}
          <span className="font-mono tabular">
            {int(years[n - 1] ?? 0, lang)}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

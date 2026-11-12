// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// ContributingCells (docs/04_UI.md §4.3, §5): the data cells that cover a place, shaded by the fraction of each
// cell inside it (regions/cells/<grid>/<region>.json), over the bundled outlines. Positions are layout only.
import { useEffect, useMemo, useState } from 'react';
import type { Grid, Mask } from '../data/types';
import { cellRect, loadOutlines, maskExtent, type Outlines } from '../map/outlines';
import { useTokens } from '../charts/tokens';
import { cn } from '../ui/common/utils';

export interface MaskLayer {
  mask: Mask;
  colour: 'accent' | 'link';
  label: string;
  /** Simplified GeoJSON outline (regions/geom/<region>.json), when the build has one. */
  geom?: GeoJSON | null;
}

type Position = [number, number];
export interface GeoJSON {
  type: string;
  coordinates?: unknown;
  geometry?: GeoJSON;
  features?: GeoJSON[];
}

function ringsOf(g: GeoJSON | null | undefined): Position[][] {
  if (!g) return [];
  if (g.type === 'FeatureCollection') return (g.features ?? []).flatMap((f) => ringsOf(f));
  if (g.type === 'Feature') return ringsOf(g.geometry);
  if (g.type === 'Polygon') return g.coordinates as Position[][];
  if (g.type === 'MultiPolygon') return (g.coordinates as Position[][][]).flat();
  return [];
}

const path = (ring: Position[]) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(3)},${(-y).toFixed(3)}`).join('') + 'Z';
const linePath = (ring: Position[]) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(3)},${(-y).toFixed(3)}`).join('');

export function useOutlines(): Outlines | null {
  const [o, setO] = useState<Outlines | null>(null);
  useEffect(() => {
    let alive = true;
    void loadOutlines().then((v) => {
      if (alive) setO(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return o;
}

export function ContributingCells({
  grid,
  layers,
  label,
  className,
  tour = 'contributing-cells',
}: {
  grid: Grid;
  layers: MaskLayer[];
  label: string;
  className?: string;
  tour?: string;
}) {
  const tokens = useTokens();
  const outlines = useOutlines();
  const frame = useMemo(() => {
    const exts = layers.map((l) => maskExtent(grid, l.mask)).filter((e): e is [number, number, number, number] => e !== null);
    if (exts.length === 0) return null;
    const w = Math.min(...exts.map((e) => e[0]));
    const s = Math.min(...exts.map((e) => e[1]));
    const e = Math.max(...exts.map((x) => x[2]));
    const n = Math.max(...exts.map((x) => x[3]));
    const pad = Math.max(0.6, (e - w) * 0.12, (n - s) * 0.12);
    return { x: w - pad, y: -(n + pad), w: e - w + 2 * pad, h: n - s + 2 * pad };
  }, [grid, layers]);
  if (!frame) return null;
  const stroke = Math.max(frame.w, frame.h) / 400;
  const colourOf = (c: MaskLayer['colour']) => (c === 'accent' ? tokens.accent : tokens.link);
  return (
    <figure className={cn('m-0', className)} data-tour={tour} data-testid="contributing-cells">
      <svg
        viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
        className="block aspect-[4/3] w-full rounded-[10px] border border-line bg-surface-2"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
      >
        {outlines ? (
          <g>
            {outlines.land.map((ring, i) => (
              <path key={`l${i}`} d={path(ring)} fill={tokens.dark ? '#1d2633' : '#ebe6db'} stroke="none" />
            ))}
            {outlines.borders.map((ring, i) => (
              <path key={`b${i}`} d={linePath(ring)} fill="none" stroke={tokens.lineStrong} strokeWidth={stroke * 1.2} />
            ))}
          </g>
        ) : null}
        {layers.map((l, li) => (
          <g key={li} data-testid={`mask-${l.mask.region}`}>
            {l.mask.cells.map(([row, col, frac]) => {
              const c = cellRect(grid, row, col);
              return (
                <rect
                  key={`${row}_${col}`}
                  x={c.lon - c.dlon / 2}
                  y={-(c.lat + c.dlat / 2)}
                  width={c.dlon}
                  height={c.dlat}
                  fill={colourOf(l.colour)}
                  fillOpacity={0.12 + 0.68 * frac}
                  stroke={colourOf(l.colour)}
                  strokeOpacity={0.55}
                  strokeWidth={stroke * 0.8}
                />
              );
            })}
            {ringsOf(l.geom).map((ring, i) => (
              <path key={i} d={path(ring)} fill="none" stroke={tokens.ink} strokeWidth={stroke * 2} strokeLinejoin="round" />
            ))}
          </g>
        ))}
      </svg>
      {layers.length > 1 ? (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {layers.map((l) => (
            <span key={l.mask.region} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-[3px]" style={{ background: colourOf(l.colour) }} aria-hidden="true" />
              {l.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}

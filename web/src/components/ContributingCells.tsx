// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// ContributingCells (docs/04_UI.md §4.3, §5): the data cells that cover a place, shaded by the fraction of each
// cell inside it (regions/cells/<grid>/<region>.json), over the bundled outlines. Positions are layout only.
import { useEffect, useMemo, useState } from 'react';
import type { Grid, Mask } from '../data/types';
import { cellRect, loadOutlines, maskExtent, type Outlines } from '../map/outlines';
import { useTokens } from '../charts/tokens';
import { cn } from '../ui/common/utils';
import { useT } from '../i18n';
import { int } from '../i18n/format';
import { useLang } from '../state/prefs';

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
  detail = false,
}: {
  grid: Grid;
  layers: MaskLayer[];
  label: string;
  className?: string;
  tour?: string;
  /** Label each square with the share of it inside the place, and draw a scale bar. */
  detail?: boolean;
}) {
  const t = useT();
  const lang = useLang();
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
                <g key={`${row}_${col}`}>
                  <rect
                    x={c.lon - c.dlon / 2}
                    y={-(c.lat + c.dlat / 2)}
                    width={c.dlon}
                    height={c.dlat}
                    fill={colourOf(l.colour)}
                    fillOpacity={0.12 + 0.68 * frac}
                    stroke={colourOf(l.colour)}
                    strokeOpacity={0.55}
                    strokeWidth={stroke * 0.8}
                  >
                    {detail ? <title>{t('site.squares.cell_title', { pct: int(Math.round(frac * 100), lang), place: l.label })}</title> : null}
                  </rect>
                  {detail ? (
                    <text
                      x={c.lon}
                      y={-c.lat}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.min(c.dlat, c.dlon) * 0.26}
                      fontWeight={600}
                      fill={frac > 0.6 ? '#13283f' : tokens.ink}
                      fillOpacity={0.85}
                      style={{ fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}
                      aria-hidden="true"
                    >
                      {int(Math.round(frac * 100), lang)}%
                    </text>
                  ) : null}
                </g>
              );
            })}
            {ringsOf(l.geom).map((ring, i) => (
              <path key={i} d={path(ring)} fill="none" stroke={tokens.ink} strokeWidth={stroke * 2} strokeLinejoin="round" />
            ))}
          </g>
        ))}
        {detail ? <ScaleBar frame={frame} lat={-(frame.y + frame.h / 2)} stroke={stroke} ink={tokens.ink} fmt={(km) => t('site.squares.km', { n: int(km, lang) })} /> : null}
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

/** A 50 km bar (100 km when the frame is wide), placed bottom-left. Geometry only. */
function ScaleBar({ frame, lat, stroke, ink, fmt }: { frame: { x: number; y: number; w: number; h: number }; lat: number; stroke: number; ink: string; fmt: (km: number) => string }) {
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  const km = frame.w * kmPerDegLon > 600 ? 100 : 50;
  const len = km / kmPerDegLon;
  const x = frame.x + frame.w * 0.05;
  const y = frame.y + frame.h * 0.93;
  const fs = frame.h * 0.04;
  return (
    <g aria-hidden="true">
      <rect x={x - fs * 0.4} y={y - fs * 1.7} width={len + fs * 0.8} height={fs * 2.3} rx={fs * 0.3} fill="var(--surface)" fillOpacity="0.85" />
      <line x1={x} x2={x + len} y1={y} y2={y} stroke={ink} strokeWidth={stroke * 2.2} />
      <line x1={x} x2={x} y1={y - fs * 0.4} y2={y + fs * 0.2} stroke={ink} strokeWidth={stroke * 1.6} />
      <line x1={x + len} x2={x + len} y1={y - fs * 0.4} y2={y + fs * 0.2} stroke={ink} strokeWidth={stroke * 1.6} />
      <text x={x + len / 2} y={y - fs * 0.55} textAnchor="middle" fontSize={fs} fill={ink} style={{ fontFamily: 'var(--font-mono)' }}>
        {fmt(km)}
      </text>
    </g>
  );
}

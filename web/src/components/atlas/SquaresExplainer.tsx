// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// "What are these squares?" A three-step zoom that explains the contributing cells (docs/04_UI.md §4.3):
//   1. the planet, turned to the place;
//   2. the area, on NASA's Blue Marble image, with the data grid drawn over it (one square = one data pixel);
//   3. the squares that cover the place, each labelled with how much of it lies inside (from the mask file).
// Sizes in kilometres are geometry for the labels (1° of latitude ≈ 111 km); no statistic is computed.
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { pick, useT } from '../../i18n';
import { int, num } from '../../i18n/format';
import type { Grid, Mask, Region } from '../../data/types';
import { IS_OFFLINE_BUILD } from '../../data/offline';
import { useLang } from '../../state/prefs';
import { ContributingCells, type GeoJSON } from '../ContributingCells';
import { LocatorGlobe } from './LocatorGlobe';

const KM_PER_DEG = 111.32;

/** The size of one grid square at a latitude, in km (for the label). */
export function squareKm(grid: Grid, lat: number): { w: number; h: number } {
  return { w: Math.abs(grid.dlon) * KM_PER_DEG * Math.cos((lat * Math.PI) / 180), h: Math.abs(grid.dlat) * KM_PER_DEG };
}

function Step({ n, title, children, caption }: { n: number; title: string; children: ReactNode; caption: string }) {
  const lang = useLang();
  return (
    <figure className="m-0 flex min-w-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="inline-flex size-7 items-center justify-center rounded-full border border-accent/50 bg-accent/10 font-mono text-[12px] text-accent-ink" aria-hidden="true">
          {int(n, lang)}
        </span>
        <span className="text-[15px] font-semibold">{title}</span>
      </div>
      <div className="atlas-panel relative overflow-hidden rounded-card border border-line bg-surface p-2">{children}</div>
      <figcaption className="mt-2.5 text-[14px] leading-snug text-muted">{caption}</figcaption>
    </figure>
  );
}

/** The area around the place on the Blue Marble image, with the data grid drawn over it. */
function AreaView({ region, grid, label }: { region: Region; grid: Grid; label: string }) {
  const [w, s, e, n] = region.bbox;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const half = Math.max(5, (e - w) * 1.6, (n - s) * 1.6);
  const x0 = cx - half;
  const x1 = cx + half;
  const y0 = cy - half * 0.75;
  const y1 = cy + half * 0.75;
  // Grid edges inside the frame (cell centres are lon0 + col·dlon; edges half a step either side).
  const dlon = Math.abs(grid.dlon);
  const dlat = Math.abs(grid.dlat);
  const vx: number[] = [];
  for (let x = grid.lon0 - dlon / 2 + Math.ceil((x0 - (grid.lon0 - dlon / 2)) / dlon) * dlon; x <= x1; x += dlon) vx.push(x);
  const latStart = Math.min(grid.lat0, grid.lat0 + (grid.nlat - 1) * grid.dlat) - dlat / 2;
  const hy: number[] = [];
  for (let y = latStart + Math.ceil((y0 - latStart) / dlat) * dlat; y <= y1; y += dlat) hy.push(y);
  const sw = (x1 - x0) / 300;
  return (
    <svg viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`} className="block aspect-[4/3] w-full rounded-[6px] bg-[#0b2240]" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      {!IS_OFFLINE_BUILD ? <image href="./textures/earth-blue-marble.jpg" x={-180} y={-90} width={360} height={180} preserveAspectRatio="none" /> : null}
      <g stroke="#f4ecdc" strokeOpacity="0.32" strokeWidth={sw}>
        {vx.map((x) => (
          <line key={`v${x}`} x1={x} x2={x} y1={-y1} y2={-y0} />
        ))}
        {hy.map((y) => (
          <line key={`h${y}`} x1={x0} x2={x1} y1={-y} y2={-y} />
        ))}
      </g>
      <rect x={w} y={-n} width={e - w} height={n - s} fill="#e9b44c" fillOpacity="0.28" stroke="#e9b44c" strokeWidth={sw * 2.5} />
    </svg>
  );
}

export function SquaresExplainer({
  region,
  grid,
  mask,
  geom,
  minCells,
}: {
  region: Region;
  grid: Grid;
  mask: Mask;
  geom: GeoJSON | null;
  minCells: number | undefined;
}) {
  const t = useT();
  const lang = useLang();
  const name = pick(region.name, lang);
  const km = squareKm(grid, region.centroid[1]);
  const size = { w: int(Math.round(km.w), lang), h: int(Math.round(km.h), lang) };
  return (
    <div className="flex flex-col gap-6" data-testid="squares-explainer">
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1fr)_auto_minmax(0,1.35fr)]">
        <Step n={1} title={t('site.squares.step1')} caption={t('site.squares.step1_note', { place: name })}>
          <div className="flex aspect-[4/3] items-center justify-center rounded-[6px] bg-[#071a33]">
            <LocatorGlobe still size={210} marks={[{ lon: region.centroid[0], lat: region.centroid[1], bbox: region.bbox }]} label={t('site.place.locator_alt', { place: name })} />
          </div>
        </Step>
        <ArrowRight className="mt-24 hidden size-5 text-accent md:block" aria-hidden="true" />
        <Step n={2} title={t('site.squares.step2')} caption={t('site.squares.step2_note', { w: size.w, h: size.h })}>
          <AreaView region={region} grid={grid} label={t('site.squares.step2_alt', { place: name })} />
        </Step>
        <ArrowRight className="mt-24 hidden size-5 text-accent md:block" aria-hidden="true" />
        <Step n={3} title={t('site.squares.step3')} caption={t('site.squares.step3_note')}>
          <ContributingCells
            grid={grid}
            detail
            layers={[{ mask, colour: 'accent', label: name, geom }]}
            label={`${t('place.cells_shown')} ${t('place.support', { cells: num(mask.effectiveCells, lang, 1) })}`}
            className="[&_svg]:rounded-[6px] [&_svg]:border-0"
          />
        </Step>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('site.squares.key')}>
        <li className="rounded-card border border-line p-4">
          <span className="mb-2 block h-4 w-6 rounded-[2px] border border-[#f4ecdc]/50 bg-[#174c7c]" aria-hidden="true" />
          <span className="block text-[15px] font-semibold">{t('site.squares.k1_title')}</span>
          <span className="mt-1 block text-[14px] text-muted">{t('site.squares.k1_body', { w: size.w, h: size.h })}</span>
        </li>
        <li className="rounded-card border border-line p-4">
          <span className="mb-2 block h-4 w-6 rounded-[2px] bg-accent" aria-hidden="true" />
          <span className="block text-[15px] font-semibold">{t('site.squares.k2_title')}</span>
          <span className="mt-1 block text-[14px] text-muted">{t('site.squares.k2_body')}</span>
        </li>
        <li className="rounded-card border border-line p-4">
          <span className="mb-2 block h-4 w-6 rounded-[2px] bg-accent/35" aria-hidden="true" />
          <span className="block text-[15px] font-semibold">{t('site.squares.k3_title')}</span>
          <span className="mt-1 block text-[14px] text-muted">{t('site.squares.k3_body')}</span>
        </li>
        <li className="rounded-card border border-accent/50 bg-accent/[0.07] p-4">
          <span className="mb-1 block font-display text-[30px] leading-none tabular" data-testid="support-line-figure">
            {num(mask.effectiveCells, lang, 1)}
          </span>
          <span className="block text-[15px] font-semibold" data-testid="support-line">
            {t('place.support', { cells: num(mask.effectiveCells, lang, 1) })}
          </span>
          <span className="mt-1 block text-[14px] text-muted">
            {minCells ? t('site.squares.k4_body', { min: int(minCells, lang) }) : t('site.squares.k4_body_plain')}
          </span>
        </li>
      </ul>
    </div>
  );
}

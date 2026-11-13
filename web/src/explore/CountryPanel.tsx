// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The country view of the explorer: every 1° square of the map file that lies in a country, as a strip from the
// slowest to the fastest change, the squares rising and falling fastest, and simple counts of the squares by
// their flags. Every value is the map file's own; the squares are only sorted and counted, never averaged. A
// single answer for the whole country needs its own result file (exploration until it is pre-registered).
import { ArrowDownRight, ArrowUpRight, Compass, Info } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int, rate as fmtRate } from '../i18n/format';
import type { CatalogVariable } from '../data/types';
import type { MapLayer } from '../data/results';
import { useLang } from '../state/prefs';
import { cellInfo, latLon } from '../map/ScreeningMap';
import { diverging, scalePos } from '../map/colours';
import { Badge } from '../ui/common/badge';
import { cn } from '../ui/common/utils';
import type { Understood } from '../data/matcher';
import { UnderstoodChips } from './ExplorePanels';

interface Square {
  row: number;
  col: number;
  lat: number;
  lon: number;
  rate: number;
  significant: boolean;
}

export function CountryPanel({
  name,
  cells,
  layer,
  variable,
  onPickCell,
  understood,
}: {
  name: string;
  cells: number[];
  layer: MapLayer;
  variable: CatalogVariable;
  onPickCell: (row: number, col: number) => void;
  understood?: Understood;
}) {
  const t = useT();
  const lang = useLang();
  const g = layer.meta.grid;
  const units = layer.meta.units;
  const interp = diverging(variable.colormap?.trend);
  const squares: Square[] = [];
  let untestable = 0;
  for (const i of cells) {
    const row = Math.floor(i / g.nlon);
    const col = i % g.nlon;
    const info = cellInfo(layer, row, col);
    if (info.testable && info.rate !== null) squares.push({ row, col, lat: info.lat, lon: info.lon, rate: info.rate, significant: info.significant });
    else untestable++;
  }
  // Sorted for display only.
  const sorted = [...squares].sort((a, b) => a.rate - b.rate);
  const up = sorted.filter((s) => s.rate > 0).reverse().slice(0, 5);
  const down = sorted.filter((s) => s.rate < 0).slice(0, 5);
  const outUp = squares.filter((s) => s.significant && s.rate > 0).length;
  const outDown = squares.filter((s) => s.significant && s.rate < 0).length;
  const varName = pick(variable.name, lang);

  const item = (s: Square) => (
    <li key={`${s.row}_${s.col}`}>
      <button
        type="button"
        onClick={() => onPickCell(s.row, s.col)}
        className="flex min-h-10 w-full items-center gap-3 rounded-[6px] border border-line px-3 py-1.5 text-left hover:border-accent hover:bg-accent/[0.06]"
      >
        <span className="inline-block size-3.5 shrink-0 rounded-[3px]" style={{ background: interp(scalePos(s.rate, layer.meta.colourLimit)), opacity: s.significant ? 1 : 0.5 }} aria-hidden="true" />
        <span className="flex-1 font-mono text-[12.5px] text-muted">{latLon(s.lat, s.lon, lang)}</span>
        <span className="font-semibold tabular">
          {fmtRate(s.rate, lang)} {units}
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-5" data-testid="explore-country">
      {understood ? <UnderstoodChips u={understood} placeLabel={name} /> : null}
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {varName} · {t('site.country.eyebrow')}
      </p>
      <h2 className="text-[34px] leading-[1.05]">{name}</h2>
      <div className="flex flex-wrap gap-2">
        <Badge tone="exploration">
          <Compass aria-hidden="true" />
          {t('family.exploration')}
        </Badge>
      </div>
      {squares.length === 0 ? (
        <p className="text-[16px]">{t('site.country.none')}</p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-[6px] border border-line p-3">
              <dt className="text-xs text-muted">{t('site.country.tested')}</dt>
              <dd className="m-0 font-display text-[28px] leading-tight tabular">{int(squares.length, lang)}</dd>
            </div>
            <div className="rounded-[6px] border border-line p-3">
              <dt className="text-xs text-muted">{t('site.country.untestable')}</dt>
              <dd className="m-0 font-display text-[28px] leading-tight tabular">{int(untestable, lang)}</dd>
            </div>
            <div className="rounded-[6px] border border-line p-3">
              <dt className="inline-flex items-center gap-1 text-xs text-muted">
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                {t('site.country.out_up')}
              </dt>
              <dd className="m-0 font-display text-[28px] leading-tight tabular">{int(outUp, lang)}</dd>
            </div>
            <div className="rounded-[6px] border border-line p-3">
              <dt className="inline-flex items-center gap-1 text-xs text-muted">
                <ArrowDownRight className="size-3.5" aria-hidden="true" />
                {t('site.country.out_down')}
              </dt>
              <dd className="m-0 font-display text-[28px] leading-tight tabular">{int(outDown, lang)}</dd>
            </div>
          </dl>

          <section className="flex flex-col gap-2" aria-labelledby="country-strip">
            <h3 id="country-strip" className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              {t('site.country.strip_title')}
            </h3>
            <div className="flex h-11 w-full overflow-hidden rounded-[6px] border border-line" data-testid="country-strip">
              {sorted.map((s) => (
                <button
                  key={`${s.row}_${s.col}`}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => onPickCell(s.row, s.col)}
                  title={`${latLon(s.lat, s.lon, lang)}: ${fmtRate(s.rate, lang)} ${units}`}
                  className="h-full min-w-px flex-1 hover:brightness-125"
                  style={{ background: interp(scalePos(s.rate, layer.meta.colourLimit)), opacity: s.significant ? 1 : 0.45 }}
                />
              ))}
            </div>
            <div className="flex justify-between font-mono text-[11.5px] text-muted tabular">
              <span>
                {fmtRate(sorted[0]?.rate ?? 0, lang)} {units}
              </span>
              <span>
                {fmtRate(sorted[sorted.length - 1]?.rate ?? 0, lang)} {units}
              </span>
            </div>
            <p className="m-0 text-[13px] text-muted">{t('site.country.strip_note')}</p>
          </section>

          <div className={cn('grid gap-4', up.length && down.length ? 'sm:grid-cols-2 lg:grid-cols-1' : '')}>
            {up.length ? (
              <section aria-labelledby="country-up">
                <h3 id="country-up" className="mb-2 text-[15px] font-semibold">
                  {t('site.country.top_up')}
                </h3>
                <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{up.map(item)}</ol>
              </section>
            ) : null}
            {down.length ? (
              <section aria-labelledby="country-down">
                <h3 id="country-down" className="mb-2 text-[15px] font-semibold">
                  {t('site.country.top_down')}
                </h3>
                <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{down.map(item)}</ol>
              </section>
            ) : null}
          </div>
        </>
      )}
      <p className="flex gap-2 rounded-[6px] border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{t('site.country.whole_note')}</span>
      </p>
    </div>
  );
}

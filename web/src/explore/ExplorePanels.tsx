// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// What the globe's side panel shows: a 1° square (exploration), a registered place (graded verdicts), or a record
// that has no map in this build. Every number is read from a result file; the panel only lays it out.
import { ArrowRight, Compass, Map as MapIcon, MapPin } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import { int, p as fmtP, rate as fmtRate } from '../i18n/format';
import type { Catalog, CatalogVariable, Lineup, Region, RegionIndex } from '../data/types';
import { loadCellSeries, paths, type MapLayer } from '../data/results';
import { useAsync, useBuild, useResult } from '../data/hooks';
import type { Understood } from '../data/matcher';
import { useLang } from '../state/prefs';
import { href } from '../state/view';
import { cellInfo, latLon } from '../map/ScreeningMap';
import { SeriesChart } from '../charts/SeriesChart';
import { ClimateStripes } from '../charts/ClimateStripes';
import { RecordCard } from '../components/RecordCard';
import { FamilyBadge, StatusBadge } from '../components/StatusBadge';
import { Loading } from '../components/LoadState';
import { Badge } from '../ui/common/badge';
import { buttonVariants } from '../ui/common/button';
import { cn } from '../ui/common/utils';

export function UnderstoodChips({ u, placeLabel }: { u: Understood; placeLabel?: string }) {
  const t = useT();
  const lang = useLang();
  const tags = [
    placeLabel,
    u.variable ? pick(u.variable.name, lang) : undefined,
    u.season ? t(`season.${u.season}.long`) : undefined,
    u.compare ? t('site.explore.kind_compare') : undefined,
  ].filter(Boolean) as string[];
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="understood">
      <span className="font-mono uppercase tracking-[0.08em] text-muted">{t('site.explore.understood')}</span>
      {tags.map((x) => (
        <span key={x} className="rounded-full border border-line-strong px-2.5 py-0.5">
          {x}
        </span>
      ))}
    </div>
  );
}

/** A small range glyph: the 95% range as a bar, the rate as a dot, zero as a tick (layout only). */
export function RangeBar({ rate, lo, hi, lang }: { rate: number; lo: number; hi: number; lang: 'en' | 'bn' }) {
  const ext = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(rate)) * 1.25 || 1;
  const pos = (x: number) => 50 + (x / ext) * 48;
  return (
    <div className="relative h-12" aria-hidden="true">
      <div className="absolute inset-x-0 top-[18px] h-0.5 bg-line" />
      <div className="absolute top-[9px] h-5 w-px bg-muted" style={{ left: `${pos(0)}%` }} />
      <span className="absolute -top-1 -translate-x-1/2 font-mono text-[10.5px] text-muted" style={{ left: `${pos(0)}%` }}>
        0
      </span>
      <div className="absolute top-[14px] h-2.5 rounded-full bg-link/45" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
      <div className="absolute top-[12px] size-3.5 -translate-x-1/2 rounded-full bg-link ring-[3px] ring-surface" style={{ left: `${pos(rate)}%` }} />
      <span className="absolute top-[31px] -translate-x-1/2 font-mono text-[10.5px] text-muted" style={{ left: `${pos(lo)}%` }}>
        {fmtRate(lo, lang, rate)}
      </span>
      <span className="absolute top-[31px] -translate-x-1/2 font-mono text-[10.5px] text-muted" style={{ left: `${pos(hi)}%` }}>
        {fmtRate(hi, lang, rate)}
      </span>
    </div>
  );
}

export function CellPanel({
  layer,
  variable,
  row,
  col,
  label,
  country,
  understood,
  onCountry,
}: {
  layer: MapLayer;
  variable: CatalogVariable;
  row: number;
  col: number;
  label?: string;
  country: string | null;
  understood?: Understood;
  /** Opens the country view for the country that holds this square. */
  onCountry?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const build = useBuild();
  const root = build.data?.root;
  const info = cellInfo(layer, row, col);
  const i = row * layer.meta.grid.nlon + col;
  const lo = layer.fields.rate_low?.[i];
  const hi = layer.fields.rate_high?.[i];
  const pv = layer.fields.p?.[i];
  const qv = layer.fields.q?.[i];
  const series = useAsync(root !== undefined ? `cell|${root}|${variable.id}|${row}|${col}` : null, () => loadCellSeries(root ?? '', variable.id, row, col, layer.meta.season));
  const units = layer.meta.units;
  const where = [label, country ?? t('site.explore.ocean')].filter(Boolean).join(' · ');
  const varName = pick(variable.name, lang);
  const hasRange = lo !== undefined && hi !== undefined && Number.isFinite(lo) && Number.isFinite(hi) && info.rate !== null;
  return (
    <div className="flex flex-col gap-4" data-testid="explore-cell">
      {understood ? <UnderstoodChips u={understood} placeLabel={label} /> : null}
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {varName} · {t('site.explore.square')} · {latLon(info.lat, info.lon, lang)}
      </p>
      <h2 className="text-[30px] leading-[1.1]">{where}</h2>
      <div className="flex flex-wrap gap-2">
        <Badge tone="exploration">
          <Compass aria-hidden="true" />
          {t('family.exploration')}
        </Badge>
        <Badge tone={info.testable ? (info.significant ? 'strong' : 'canttell') : 'noverdict'} data-testid="explore-cell-status">
          {info.testable ? (info.significant ? t('site.map.status_stands_out') : t('site.map.status_tested')) : t('site.map.status_untestable')}
        </Badge>
      </div>
      {info.testable && info.rate !== null ? (
        <>
          <p className="m-0 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[54px] leading-none tabular">{fmtRate(info.rate, lang)}</span>
            <span className="text-sm text-muted">
              {units} {t('verdict.labels.rate_short')} · {int(layer.meta.window.first, lang)}–{int(layer.meta.window.last, lang)}
            </span>
          </p>
          {hasRange ? <RangeBar rate={info.rate} lo={lo} hi={hi} lang={lang} /> : null}
          <p className="text-[17px] leading-relaxed">
            {info.significant
              ? t('site.explore.cell_stands_out', { rate: `${fmtRate(info.rate, lang)} ${units}`, n: int(layer.meta.nTestable, lang) })
              : t('site.explore.cell_not_out', { rate: `${fmtRate(info.rate, lang)} ${units}`, n: int(layer.meta.nTestable, lang) })}
          </p>
          <dl className="m-0 grid grid-cols-2 gap-2 text-sm tabular">
            <div className="rounded-[6px] border border-line p-2.5">
              <dt className="text-xs text-muted">{t('verdict.labels.ci')}</dt>
              <dd className="m-0 font-semibold">{hasRange ? `${fmtRate(lo, lang, info.rate)} … ${fmtRate(hi, lang, info.rate)}` : '–'}</dd>
            </div>
            <div className="rounded-[6px] border border-line p-2.5">
              <dt className="text-xs text-muted">p · q</dt>
              <dd className="m-0 font-semibold">
                {pv !== undefined && Number.isFinite(pv) ? fmtP(pv, lang) : '–'} · {qv !== undefined && Number.isFinite(qv) ? fmtP(qv, lang) : '–'}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-[17px]" data-testid="explore-untestable">
          {t('site.explore.cell_untestable')} {info.reasons.map((r) => tOr(t, `site.map.flag_${r}`, r)).join('; ')}
        </p>
      )}
      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{t('site.explore.year_by_year')}</h3>
        {series.status === 'loading' ? (
          <Loading />
        ) : series.data ? (
          <>
            <ClimateStripes
              years={series.data.years}
              values={series.data.values}
              units={series.data.units}
              colormap={variable.colormap?.trend}
              lang={lang}
              height={46}
              label={t('site.stripes.alt', { place: where, from: int(series.data.years[0] ?? 0, lang), to: int(series.data.years[series.data.years.length - 1] ?? 0, lang) })}
            />
            <SeriesChart x={series.data.years} y={series.data.values} units={series.data.units} lang={lang} height={190} label={t('site.cell.chart_alt', { place: where })} testId="explore-cell-chart" />
            <p className="text-xs text-muted">{t('site.cell.no_line')}</p>
          </>
        ) : (
          <p className="text-sm text-muted">{t('site.explore.no_tile')}</p>
        )}
      </section>
      {onCountry && country ? (
        <button type="button" onClick={onCountry} className={cn(buttonVariants({ variant: 'accent', size: 'sm' }), 'self-start')} data-testid="explore-country-open">
          <MapIcon aria-hidden="true" />
          {t('site.country.open', { country })}
        </button>
      ) : null}
      <a
        href={href({ screen: 'place', region: `cell:${row}_${col}`, variable: variable.id, season: layer.meta.season })}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'self-start')}
        data-testid="explore-open-cell"
      >
        {t('site.explore.open_square')}
        <ArrowRight aria-hidden="true" />
      </a>
      <p className="text-xs leading-relaxed text-muted">{t('site.explore.square_note')}</p>
    </div>
  );
}

export function RegionPanel({ region, index, catalog, understood }: { region: Region; index: RegionIndex | undefined; catalog: Catalog | undefined; understood?: Understood }) {
  const t = useT();
  const lang = useLang();
  const varName = (id: string) => {
    const v = catalog?.variables.find((x) => x.id === id);
    return v ? pick(v.name, lang) : id;
  };
  const lineup = useResult<Lineup>(paths.lineup(region.id));
  const pairs = (index?.pairs ?? []).filter((p) => p.a === region.id || p.b === region.id);
  return (
    <div className="flex flex-col gap-4" data-testid="explore-region">
      {understood ? <UnderstoodChips u={understood} placeLabel={pick(region.name, lang)} /> : null}
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{t('site.explore.registered')}</p>
      <h2 className="text-[30px] leading-[1.1]">{pick(region.name, lang)}</h2>
      <p className="text-[15px] text-muted">{t('site.explore.registered_note')}</p>
      {lineup.status === 'loading' ? (
        <Loading />
      ) : lineup.data ? (
        <ul className="flex flex-col gap-1.5">
          {lineup.data.items.map((it) => (
            <li key={it.path}>
              <a
                href={href({ screen: 'place', region: region.id, variable: it.variable, season: it.season })}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-line px-3 py-2 text-ink no-underline hover:border-line-strong hover:no-underline"
              >
                <span className="text-sm font-medium">
                  {varName(it.variable)} · <span className="text-muted">{t(`season.${it.season}.long`)}</span>
                </span>
                <span className="flex items-center gap-2 text-sm tabular">
                  {it.ratePerDecade !== null ? fmtRate(it.ratePerDecade, lang) : '–'}
                  <StatusBadge status={it.status} grade={it.grade} reason={it.reason} family={it.family} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <a href={href({ screen: 'place', region: region.id })} className={buttonVariants({ variant: 'accent', size: 'sm' })} data-testid="explore-open-case">
          <MapPin aria-hidden="true" />
          {t('site.explore.open_case')}
        </a>
        {pairs.map((p) => (
          <a key={p.id} href={href({ screen: 'compare', pair: p.id })} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('site.explore.compare_with', { place: pick(index?.regions.find((r) => r.id === (p.a === region.id ? p.b : p.a))?.name, lang) })}
          </a>
        ))}
      </div>
      {pairs[0] ? <FamilyBadge family={pairs[0].preRegistered ? 'confirmatory' : 'exploration'} className="self-start" /> : null}
    </div>
  );
}

export function VariablePanel({ variable, hasMap, understood }: { variable: CatalogVariable; hasMap: boolean; understood?: Understood }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4" data-testid="explore-variable">
      {understood ? <UnderstoodChips u={understood} /> : null}
      <RecordCard variable={variable} />
      <p className="text-[15px] text-muted">
        {variable.status === 'deferred' ? t('site.explore.var_deferred') : hasMap ? t('site.explore.var_has_map') : t('site.explore.var_no_map')}
      </p>
    </div>
  );
}

export function NoPlacePanel({ understood }: { understood: Understood }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3" data-testid="explore-noplace">
      <UnderstoodChips u={understood} />
      <h2 className="text-[30px] leading-[1.1]">{t('site.explore.which_place')}</h2>
      <p className="text-[17px]">{t('site.explore.which_place_body')}</p>
    </div>
  );
}


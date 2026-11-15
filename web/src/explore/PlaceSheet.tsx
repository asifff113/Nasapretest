// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// A clicked 1° square on the globe, for every record or for the records the reader picks. With no record on the globe
// the sheet shows them all; with one on the globe it opens on that one, and the chips at the top switch between all,
// some and one. One record shows the full square (rate, 95% range, p and q, yearly stripes and chart); several show
// a card each. Every number is read from the map files and the square's tile; the sheet only lays them out.
import { ArrowRight, Map as MapIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AnswerKindBadge } from '../components/AnswerKind';
import { GroupIcon } from '../components/atlas/icons';
import { pick, tOr, useT } from '../i18n';
import { int, p as fmtP, rate as fmtRate } from '../i18n/format';
import type { CatalogVariable } from '../data/types';
import { loadCellSeries, loadMapLayer, type MapLayer } from '../data/results';
import { useAsync, useBuild, type Loaded } from '../data/hooks';
import type { Understood } from '../data/matcher';
import { useLang } from '../state/prefs';
import { href } from '../state/view';
import { cellInfo, latLon } from '../map/ScreeningMap';
import { diverging, scalePos } from '../map/colours';
import { SeriesChart } from '../charts/SeriesChart';
import { ClimateStripes } from '../charts/ClimateStripes';
import { Loading } from '../components/LoadState';
import { Badge } from '../ui/common/badge';
import { buttonVariants } from '../ui/common/button';
import { cn } from '../ui/common/utils';
import { RangeBar, UnderstoodChips } from './ExplorePanels';

/** One record's screening map, loaded on demand and shared through the cache. */
export function useLayer(variableId: string | undefined, season = 'ANN'): Loaded<MapLayer> {
  const build = useBuild();
  const root = build.data?.root;
  return useAsync<MapLayer>(root !== undefined && variableId ? `map|${root}|${variableId}|${season}` : null, () => loadMapLayer(root ?? '', variableId ?? '', season));
}

/** All, some or one record: the chips at the top of a place. */
export function ParamChips({ variables, selected, onChange, testPrefix = 'pick' }: { variables: CatalogVariable[]; selected: string[]; onChange: (ids: string[]) => void; testPrefix?: string }) {
  const t = useT();
  const lang = useLang();
  const all = selected.length === variables.length;
  return (
    <div className="flex flex-col gap-1.5" data-testid={`${testPrefix}-chips`}>
      <p className="m-0 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t('site.gx.show_params')}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('site.gx.show_params')}>
        <button
          type="button"
          aria-pressed={all}
          onClick={() => onChange(variables.map((v) => v.id))}
          className={cn('min-h-8 rounded-full border px-3 text-[12.5px] font-semibold transition-colors', all ? 'border-ink bg-ink text-surface' : 'border-line-strong hover:border-ink')}
          data-testid={`${testPrefix}-all`}
        >
          {t('site.gx.all_params', { n: int(variables.length, lang) })}
        </button>
        {variables.map((v) => {
          const on = selected.includes(v.id) && !all;

          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (all) return onChange([v.id]);
                const next = on ? selected.filter((x) => x !== v.id) : [...selected, v.id];
                onChange(next.length ? next : variables.map((x) => x.id));
              }}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors',
                on ? 'border-accent bg-accent/20 text-ink' : 'border-line hover:border-line-strong',
              )}
              data-testid={`${testPrefix}-${v.id}`}
            >
              <GroupIcon group={v.group} className="size-3.5" />
              {pick(v.name, lang)}
            </button>
          );
        })}
      </div>
      <p className="m-0 text-[11.5px] text-muted">{t('site.gx.chips_hint')}</p>
    </div>
  );
}

/** The full square for one record. */
function CellDetail({ variable, row, col, where }: { variable: CatalogVariable; row: number; col: number; where: string }) {
  const t = useT();
  const lang = useLang();
  const build = useBuild();
  const root = build.data?.root;
  const layerRes = useLayer(variable.id);
  const layer = layerRes.data;
  const series = useAsync(root !== undefined && layer ? `cell|${root}|${variable.id}|${row}|${col}` : null, () => loadCellSeries(root ?? '', variable.id, row, col, layer?.meta.season ?? 'ANN'));

  if (layerRes.status === 'loading') return <Loading />;
  if (!layer) return <p className="text-[15px] text-muted">{t('site.explore.var_no_map')}</p>;
  const info = cellInfo(layer, row, col);
  const i = row * layer.meta.grid.nlon + col;
  const lo = layer.fields.rate_low?.[i];
  const hi = layer.fields.rate_high?.[i];
  const pv = layer.fields.p?.[i];
  const qv = layer.fields.q?.[i];
  const units = layer.meta.units;
  const hasRange = lo !== undefined && hi !== undefined && Number.isFinite(lo) && Number.isFinite(hi) && info.rate !== null;
  return (
    <div className="flex flex-col gap-4" data-testid="explore-cell-detail">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
          <GroupIcon group={variable.group} className="size-4" />
          {pick(variable.name, lang)}
        </span>
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
          <p className="m-0 text-[16px] leading-relaxed">
            {info.significant
              ? t('site.explore.cell_stands_out', { rate: `${fmtRate(info.rate, lang)} ${units}`, n: int(layer.meta.nTestable, lang) })
              : t('site.explore.cell_not_out', { rate: `${fmtRate(info.rate, lang)} ${units}`, n: int(layer.meta.nTestable, lang) })}
          </p>
          <dl className="m-0 grid grid-cols-2 gap-2 text-sm tabular">
            <div className="rounded-[10px] border border-line p-2.5">
              <dt className="text-xs text-muted">{t('verdict.labels.ci')}</dt>
              <dd className="m-0 font-semibold">{hasRange ? `${fmtRate(lo, lang, info.rate)} … ${fmtRate(hi, lang, info.rate)}` : '–'}</dd>
            </div>
            <div className="rounded-[10px] border border-line p-2.5">
              <dt className="text-xs text-muted">p · q</dt>
              <dd className="m-0 font-semibold">
                {pv !== undefined && Number.isFinite(pv) ? fmtP(pv, lang) : '–'} · {qv !== undefined && Number.isFinite(qv) ? fmtP(qv, lang) : '–'}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="m-0 text-[16px]" data-testid="explore-untestable">
          {t('site.explore.cell_untestable')} {info.reasons.map((r) => tOr(t, `site.map.flag_${r}`, r)).join('; ')}
        </p>
      )}
      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{t('site.explore.year_by_year')}</h3>
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
            <p className="m-0 text-xs text-muted">{t('site.cell.no_line')}</p>
          </>
        ) : (
          <p className="m-0 text-sm text-muted">{t('site.explore.no_tile')}</p>
        )}
      </section>
    </div>
  );
}

/** One record's card in the all-records view: its rate, how it stands, and its yearly stripes. */
function CellCard({ variable, row, col, where, onOnly, i }: { variable: CatalogVariable; row: number; col: number; where: string; onOnly: () => void; i: number }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const build = useBuild();
  const root = build.data?.root;
  const layerRes = useLayer(variable.id);
  const layer = layerRes.data;
  const series = useAsync(root !== undefined && layer ? `cell|${root}|${variable.id}|${row}|${col}` : null, () => loadCellSeries(root ?? '', variable.id, row, col, layer?.meta.season ?? 'ANN'));

  const info = layer ? cellInfo(layer, row, col) : null;
  const tone = info?.testable && info.rate !== null && layer ? diverging(variable.colormap?.trend)(scalePos(info.rate, layer.meta.colourLimit)) : undefined;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : 0.035 * i, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative overflow-hidden rounded-[14px] border border-line bg-surface p-3 shadow-card"
      data-testid={`cell-card-${variable.id}`}
    >
      {tone ? <span className="absolute inset-y-0 left-0 w-1" style={{ background: tone, opacity: info?.significant ? 1 : 0.45 }} aria-hidden="true" /> : null}
      <div className="flex items-start gap-2 pl-1">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/[0.07]">
          <GroupIcon group={variable.group} className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px] font-semibold leading-tight">{pick(variable.name, lang)}</p>
          {layerRes.status === 'loading' ? (
            <p className="m-0 text-[12px] text-muted">{t('site.common.loading')}</p>
          ) : !layer || !info ? (
            <p className="m-0 text-[12px] text-muted">{t('site.explore.var_no_map')}</p>
          ) : info.testable && info.rate !== null ? (
            <p className="m-0 mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-[26px] leading-none tabular">{fmtRate(info.rate, lang)}</span>
              <span className="text-[11.5px] text-muted">
                {layer.meta.units} {t('verdict.labels.rate_short')}
              </span>
            </p>
          ) : (
            <p className="m-0 text-[12px] text-muted">{t('site.map.status_untestable')}</p>
          )}
        </div>
        {info ? (
          <Badge tone={info.testable ? (info.significant ? 'strong' : 'canttell') : 'noverdict'} className="shrink-0">
            {info.testable ? (info.significant ? t('site.map.status_stands_out') : t('site.map.status_tested')) : t('site.map.status_untestable')}
          </Badge>
        ) : null}
      </div>
      {series.data ? (
        <div className="mt-2 pl-1">
          <ClimateStripes
            years={series.data.years}
            values={series.data.values}
            units={series.data.units}
            colormap={variable.colormap?.trend}
            lang={lang}
            height={22}
            bare
            label={t('site.stripes.alt', { place: where, from: int(series.data.years[0] ?? 0, lang), to: int(series.data.years[series.data.years.length - 1] ?? 0, lang) })}
            testId={`cell-card-stripes-${variable.id}`}
          />
        </div>
      ) : null}
      <button type="button" onClick={onOnly} className="mt-2 inline-flex min-h-8 items-center gap-1 pl-1 text-[12.5px] font-semibold text-link hover:underline" data-testid={`cell-card-open-${variable.id}`}>
        {t('site.gx.only_this')}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
    </motion.li>
  );
}

export function PlaceSheet({
  variables,
  selected,
  onSelected,
  row,
  col,
  title,
  country,
  understood,
  onCountry,
  lat,
  lon,
}: {
  /** The records with a screening map in this build. */
  variables: CatalogVariable[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  row: number;
  col: number;
  /** "Near Dhaka", "Northern Brazil" or the asked place. */
  title: string;
  country: string | null;
  understood?: Understood;
  onCountry?: () => void;
  lat: number;
  lon: number;
}) {
  const t = useT();
  const lang = useLang();
  const shown = variables.filter((v) => selected.includes(v.id));
  const one = shown.length === 1 ? shown[0] : undefined;
  const where = [title, country ?? t('site.explore.ocean')].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');
  const pageVar = one ?? shown[0] ?? variables[0];
  return (
    <div className="flex flex-col gap-5" data-testid="explore-cell">
      {understood ? <UnderstoodChips u={understood} placeLabel={title} /> : null}
      <header className="flex flex-col gap-2">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          {t('site.explore.square')} · {latLon(lat, lon, lang)}
        </p>
        <h2 className="m-0 text-[32px] leading-[1.05]" data-testid="place-title">
          {title}
        </h2>
        {country && country !== title ? <p className="m-0 text-[15px] text-muted">{country}</p> : null}
        <div className="mt-1 flex flex-wrap gap-2">
          {pageVar ? (
            <a
              href={href({ screen: 'place', region: `cell:${row}_${col}`, variable: pageVar.id, season: 'ANN' })}
              className={cn(buttonVariants({ variant: 'accent', size: 'sm' }))}
              data-testid="explore-open-cell"
            >
              {t('site.explore.open_square')}
              <ArrowRight aria-hidden="true" />
            </a>
          ) : null}
          {onCountry && country ? (
            <button type="button" onClick={onCountry} className={buttonVariants({ variant: 'outline', size: 'sm' })} data-testid="explore-country-open">
              <MapIcon aria-hidden="true" />
              {t('site.country.open', { country })}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <AnswerKindBadge kind="exploratory" />
        </div>
      </header>
      <ParamChips variables={variables} selected={selected} onChange={onSelected} />
      {one ? (
        <CellDetail key={one.id} variable={one} row={row} col={col} where={where} />
      ) : (
        <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-1" data-testid="cell-cards">
          {shown.map((v, i) => (
            <CellCard key={v.id} variable={v} row={row} col={col} where={where} i={i} onOnly={() => onSelected([v.id])} />
          ))}
        </ul>
      )}
      <p className="m-0 text-xs leading-relaxed text-muted">{t('site.explore.square_note')}</p>
    </div>
  );
}

/** One record at a square, as a link: its rate and how it stands (the square's full page uses a row of these). */
function CellLinkCard({ variable, row, col, active, link }: { variable: CatalogVariable; row: number; col: number; active: boolean; link: string }) {
  const t = useT();
  const lang = useLang();
  const layer = useLayer(variable.id).data;
  const info = layer ? cellInfo(layer, row, col) : null;
  const tone = info?.testable && info.rate !== null && layer ? diverging(variable.colormap?.trend)(scalePos(info.rate, layer.meta.colourLimit)) : undefined;
  return (
    <li className="min-w-[200px] snap-start sm:min-w-0">
      <a
        href={link}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'relative flex h-full flex-col gap-1 overflow-hidden rounded-[14px] border bg-surface p-3 pl-4 text-ink no-underline transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:no-underline hover:shadow-lift',
          active ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line hover:border-accent/60',
        )}
        data-testid={`cell-param-${variable.id}`}
      >
        {tone ? <span className="absolute inset-y-0 left-0 w-1" style={{ background: tone, opacity: info?.significant ? 1 : 0.45 }} aria-hidden="true" /> : null}
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold leading-tight">
          <GroupIcon group={variable.group} className="size-3.5 shrink-0" />
          {pick(variable.name, lang)}
        </span>
        {info?.testable && info.rate !== null && layer ? (
          <span className="flex items-baseline gap-1">
            <span className="font-display text-[24px] leading-none tabular">{fmtRate(info.rate, lang)}</span>
            <span className="text-[11px] text-muted">
              {layer.meta.units} {t('verdict.labels.rate_short')}
            </span>
          </span>
        ) : (
          <span className="text-[12px] text-muted">{layer ? t('site.map.status_untestable') : t('site.common.loading')}</span>
        )}
        {info ? <span className="text-[11.5px] text-muted">{info.testable ? (info.significant ? t('site.map.status_stands_out') : t('site.map.status_tested')) : ''}</span> : null}
      </a>
    </li>
  );
}

/** Every record at one square, side by side; the one shown below is marked. */
export function CellParams({ variables, row, col, current, season }: { variables: CatalogVariable[]; row: number; col: number; current: string | undefined; season: string }) {
  const t = useT();
  return (
    <section className="mb-8" aria-labelledby="cell-params-title" data-testid="cell-params">
      <h2 id="cell-params-title" className="m-0 font-display text-[26px] font-normal">
        {t('site.gx.cell_all_title')}
      </h2>
      <p className="mb-3 mt-1 text-[14.5px] text-muted">{t('site.gx.cell_all_lead')}</p>
      <ul className="m-0 flex snap-x list-none gap-2.5 overflow-x-auto p-0 pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
        {variables.map((v) => (
          <CellLinkCard key={v.id} variable={v} row={row} col={col} active={v.id === current} link={href({ screen: 'place', region: `cell:${row}_${col}`, variable: v.id, season })} />
        ))}
      </ul>
    </section>
  );
}

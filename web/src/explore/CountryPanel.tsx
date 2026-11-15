// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The country view of the explorer, for every record or the ones the reader picks. Several records: one card each,
// with the engine's exploration trend for the whole country (its detail file), how many of the country's 1° squares
// stand out, and the country's yearly stripes. One record: every square of the map file that lies in the country, as
// a strip from the slowest to the fastest change, the named squares rising and falling fastest, and counts of the
// squares by their flags. Every value is a file's own; the squares are only sorted and counted, never averaged.
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AnswerKindBadge } from '../components/AnswerKind';
import { GroupIcon } from '../components/atlas/icons';
import { pick, useT } from '../i18n';
import { int, rate as fmtRate } from '../i18n/format';
import type { CatalogVariable } from '../data/types';
import type { MapLayer } from '../data/results';
import type { CountryFeature } from '../data/places';
import { useLang } from '../state/prefs';
import { cellInfo, latLon } from '../map/ScreeningMap';
import { diverging, scalePos } from '../map/colours';
import { cn } from '../ui/common/utils';
import type { Understood } from '../data/matcher';
import { UnderstoodChips } from './ExplorePanels';
import { useExploreRegion, type ExploreRegion } from '../data/explore';
import { YearsChart } from '../charts/YearsChart';
import { ClimateStripes } from '../charts/ClimateStripes';
import { Loading } from '../components/LoadState';
import { Badge } from '../ui/common/badge';
import { ParamChips, useLayer } from './PlaceSheet';
import { frameOf, squareName, type CountryFrame } from './naming';

/** The country's own yearly values of one record (its detail file), as a chart and stripes. */
function CountryGlance({ region, variableId, name, record, colormap }: { region: ExploreRegion | undefined; variableId: string; name: string; record: string; colormap: string | undefined }) {
  const t = useT();
  const lang = useLang();
  const v = region?.variables[variableId];
  if (!v) return <p className="m-0 text-[13px] text-muted">{t('site.countrypanel.no_file')}</p>;
  return (
    <section className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface p-3" data-testid="country-glance">
      <h3 className="m-0 text-[14px] font-semibold">{t('site.countrypanel.glance', { place: name })}</h3>
      <p className="m-0 text-[12px] text-muted">{t(v.rule === 'sum' ? 'site.years.legend_sum' : 'site.years.legend_mean', { units: v.units })}</p>
      <YearsChart series={[{ label: name, years: v.years, values: v.annual, tone: 'a' }]} units={v.units} lang={lang} label={t('site.report.chart_alt', { record, place: name })} testId="country-glance-chart" />
      <ClimateStripes years={v.years} values={v.annual} units={v.units} colormap={colormap} lang={lang} label={t('site.report.stripes_alt', { record })} height={28} testId="country-glance-stripes" />
    </section>
  );
}

interface Square {
  row: number;
  col: number;
  lat: number;
  lon: number;
  rate: number;
  significant: boolean;
}

/** The country's squares for one record, read from its map file (positions and flags; sorted and counted only). */
function squaresOf(layer: MapLayer, cells: number[]): { squares: Square[]; untestable: number } {
  const g = layer.meta.grid;
  const squares: Square[] = [];
  let untestable = 0;
  for (const i of cells) {
    const row = Math.floor(i / g.nlon);
    const col = i % g.nlon;
    const info = cellInfo(layer, row, col);
    if (info.testable && info.rate !== null) squares.push({ row, col, lat: info.lat, lon: info.lon, rate: info.rate, significant: info.significant });
    else untestable++;
  }
  return { squares, untestable };
}

/** One record for the whole country: every square, sorted, with the fastest named. */
function CountryDetail({
  name,
  label,
  frame,
  cells,
  variable,
  region,
  onPickCell,
}: {
  name: string;
  label: string;
  frame: CountryFrame | null;
  cells: number[];
  variable: CatalogVariable;
  region: ExploreRegion | undefined;
  onPickCell: (row: number, col: number) => void;
}) {
  const t = useT();
  const lang = useLang();
  const layerRes = useLayer(variable.id);
  const layer = layerRes.data;
  if (layerRes.status === 'loading') return <Loading />;
  const varName = pick(variable.name, lang);
  const glance = <CountryGlance region={region} variableId={variable.id} name={label} record={varName} colormap={variable.colormap?.trend} />;
  if (!layer) return glance;
  const units = layer.meta.units;
  const interp = diverging(variable.colormap?.trend);
  const { squares, untestable } = squaresOf(layer, cells);
  // Sorted for display only.
  const sorted = [...squares].sort((a, b) => a.rate - b.rate);
  const up = sorted.filter((s) => s.rate > 0).reverse().slice(0, 5);
  const down = sorted.filter((s) => s.rate < 0).slice(0, 5);
  const outUp = squares.filter((s) => s.significant && s.rate > 0).length;
  const outDown = squares.filter((s) => s.significant && s.rate < 0).length;
  const nameOf = (s: Square) => squareName(t, lang, s, name, frame, label);

  const item = (s: Square) => (
    <li key={`${s.row}_${s.col}`}>
      <button
        type="button"
        onClick={() => onPickCell(s.row, s.col)}
        className="flex min-h-10 w-full items-center gap-3 rounded-[10px] border border-line px-3 py-1.5 text-left transition-colors hover:border-accent hover:bg-accent/[0.06]"
      >
        <span className="inline-block size-3.5 shrink-0 rounded-[3px]" style={{ background: interp(scalePos(s.rate, layer.meta.colourLimit)), opacity: s.significant ? 1 : 0.5 }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{nameOf(s)}</span>
          <span className="block font-mono text-[11px] text-muted">{latLon(s.lat, s.lon, lang)}</span>
        </span>
        <span className="font-semibold tabular">
          {fmtRate(s.rate, lang)} {units}
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-5" data-testid="country-detail">
      {glance}
      {squares.length === 0 ? (
        <p className="text-[16px]">{t('site.country.none')}</p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-2 gap-2 text-sm">
            {[
              [t('site.country.tested'), squares.length, null],
              [t('site.country.untestable'), untestable, null],
              [t('site.country.out_up'), outUp, ArrowUpRight],
              [t('site.country.out_down'), outDown, ArrowDownRight],
            ].map(([k, n, Icon]) => {
              const I = Icon as typeof ArrowUpRight | null;
              return (
                <div key={String(k)} className="rounded-[10px] border border-line p-3">
                  <dt className="inline-flex items-center gap-1 text-xs text-muted">
                    {I ? <I className="size-3.5" aria-hidden="true" /> : null}
                    {String(k)}
                  </dt>
                  <dd className="m-0 font-display text-[28px] leading-tight tabular">{int(Number(n), lang)}</dd>
                </div>
              );
            })}
          </dl>

          <section className="flex flex-col gap-2" aria-labelledby="country-strip">
            <h3 id="country-strip" className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              {t('site.country.strip_title')}
            </h3>
            <div className="flex h-11 w-full overflow-hidden rounded-[8px] border border-line" data-testid="country-strip">
              {sorted.map((s) => (
                <button
                  key={`${s.row}_${s.col}`}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => onPickCell(s.row, s.col)}
                  title={`${nameOf(s)} (${latLon(s.lat, s.lon, lang)}): ${fmtRate(s.rate, lang)} ${units}`}
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
    </div>
  );
}

/** One record's card in the all-records country view. */
function CountryCard({ variable, region, cells, label, onOnly, i }: { variable: CatalogVariable; region: ExploreRegion | undefined; cells: number[]; label: string; onOnly: () => void; i: number }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const layer = useLayer(variable.id).data;
  const v = region?.variables[variable.id];
  const trend = v?.trend;

  const counts = layer ? squaresOf(layer, cells) : null;
  const out = counts ? counts.squares.filter((s) => s.significant).length : 0;
  const tone = trend?.testable && trend.ratePerDecade !== null && layer ? diverging(variable.colormap?.trend)(scalePos(trend.ratePerDecade, layer.meta.colourLimit)) : undefined;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : 0.035 * i, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative overflow-hidden rounded-[14px] border border-line bg-surface p-3 shadow-card"
      data-testid={`country-card-${variable.id}`}
    >
      {tone ? <span className="absolute inset-y-0 left-0 w-1" style={{ background: tone, opacity: trend?.standsOut ? 1 : 0.45 }} aria-hidden="true" /> : null}
      <div className="flex items-start gap-2 pl-1">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/[0.07]">
          <GroupIcon group={variable.group} className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px] font-semibold leading-tight">{pick(variable.name, lang)}</p>
          {trend?.testable && trend.ratePerDecade !== null ? (
            <p className="m-0 mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-[26px] leading-none tabular">{fmtRate(trend.ratePerDecade, lang)}</span>
              <span className="text-[11.5px] text-muted">
                {v?.units} {t('verdict.labels.rate_short')}
              </span>
            </p>
          ) : (
            <p className="m-0 text-[12px] text-muted">{v ? t('site.map.status_untestable') : t('site.countrypanel.no_file')}</p>
          )}
        </div>
        {trend ? (
          <Badge tone={trend.testable ? (trend.standsOut ? 'strong' : 'canttell') : 'noverdict'} className="shrink-0">
            {trend.testable ? (trend.standsOut ? t('site.map.status_stands_out') : t('site.map.status_tested')) : t('site.map.status_untestable')}
          </Badge>
        ) : null}
      </div>
      {counts ? (
        <p className="m-0 mt-1.5 pl-1 text-[12px] text-muted">{t('site.gx.squares_out', { out: int(out, lang), n: int(counts.squares.length, lang) })}</p>
      ) : null}
      {v ? (
        <div className="mt-2 pl-1">
          <ClimateStripes years={v.years} values={v.annual} units={v.units} colormap={variable.colormap?.trend} lang={lang} height={22} bare label={t('site.report.stripes_alt', { record: pick(variable.name, lang) })} testId={`country-card-stripes-${variable.id}`} />
        </div>
      ) : null}
      <button type="button" onClick={onOnly} className="mt-2 inline-flex min-h-8 items-center gap-1 pl-1 text-[12.5px] font-semibold text-link hover:underline">
        {t('site.gx.only_this_squares')}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
      <span className="sr-only">{label}</span>
    </motion.li>
  );
}

export function CountryPanel({
  feature,
  label,
  cells,
  variables,
  selected,
  onSelected,
  onPickCell,
  understood,
  reportHref,
  regionId,
}: {
  feature: CountryFeature;
  /** The country's name in the reader's language. */
  label: string;
  cells: number[];
  variables: CatalogVariable[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  onPickCell: (row: number, col: number) => void;
  understood?: Understood;
  /** The country's full report (yearly values of every record), when the build has one. */
  reportHref?: string;
  /** The country's detail file id. */
  regionId?: string;
}) {
  const t = useT();
  const lang = useLang();
  const name = feature.properties.name;
  const region = useExploreRegion(regionId ?? null);
  const frame = frameOf(feature);
  const shown = variables.filter((v) => selected.includes(v.id));
  const one = shown.length === 1 ? shown[0] : undefined;

  return (
    <div className="flex flex-col gap-5" data-testid="explore-country">
      {understood ? <UnderstoodChips u={understood} placeLabel={label} /> : null}
      <header className="flex flex-col gap-2">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          {t('site.country.eyebrow')} · {t('site.gx.n_squares', { n: int(cells.length, lang) })}
        </p>
        <h2 className="m-0 text-[36px] leading-[1.02]">{label}</h2>
        {reportHref ? (
          <a
            href={reportHref}
            className="group mt-1 flex items-center justify-between gap-3 rounded-[12px] border border-accent/60 bg-accent/10 px-4 py-3 text-[15px] font-semibold hover:bg-accent/20"
            data-testid="country-report-link"
          >
            <span>
              {t('site.report.open', { place: label })}
              <span className="block text-[13px] font-normal text-muted">{t('site.report.open_note')}</span>
            </span>
            <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <AnswerKindBadge kind="exploratory" />
        </div>
      </header>
      <ParamChips variables={variables} selected={selected} onChange={onSelected} testPrefix="country-pick" />
      {region.status === 'loading' && regionId ? (
        <Loading />
      ) : one ? (
        <CountryDetail key={one.id} name={name} label={label} frame={frame} cells={cells} variable={one} region={region.data} onPickCell={onPickCell} />
      ) : (
        <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-1" data-testid="country-cards">
          {shown.map((v, i) => (
            <CountryCard key={v.id} variable={v} region={region.data} cells={cells} label={label} i={i} onOnly={() => onSelected([v.id])} />
          ))}
        </ul>
      )}
      <p className="flex gap-2 rounded-[10px] border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{t('site.country.whole_note')}</span>
      </p>
    </div>
  );
}

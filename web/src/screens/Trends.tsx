// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Trends (exploration): how each record is changing across the world, a continent or a country, read from the
// engine's screening map. Each 1° square already has the engine's rate per decade and its flags (tested, stands
// out after allowing for all the tests). This screen only counts and sorts those squares: how many rise, how many
// fall, how many stand out, a histogram of their rates, and every country ranked by its squares. It computes no
// mean and runs no test; a single tested trend for a whole country or continent needs its own engine run.
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Compass, Info } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int, rate as fmtRate } from '../i18n/format';
import { loadMapLayer, type MapLayer } from '../data/results';
import { useAsync, useBuild, useCatalog } from '../data/hooks';
import { exploreForCountryName, useExploreArea, useExploreIndex, useExploreRegion, type ExploreIndex } from '../data/explore';
import { CountryTrendMap, LatitudeYears, ScopeTrend, TrendRanking } from '../report/TrendsMore';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { cellInfo } from '../map/ScreeningMap';
import { diverging, scalePos } from '../map/colours';
import { loadCountries } from '../explore/texture';
import { cellsInCountry } from '../explore/country';
import type { CountryFeature } from '../data/places';
import { Loading } from '../components/LoadState';
import { Body } from '../components/Page';
import { Hero } from '../components/atlas/Hero';
import { Badge } from '../ui/common/badge';
import { SegmentedControl } from '../ui/common/toggle-group';
import { continentName } from '../report/ReportBody';

interface Tally {
  tested: number;
  up: number;
  down: number;
  sigUp: number;
  sigDown: number;
  untestable: number;
  /** Counts per rate bin (BINS bins from −limit to +limit; outside values go to the end bins). */
  bins: number[];
}
const BINS = 21;

/** Counts the squares (all of them when `cells` is null). Counting only: no value is averaged. */
function tally(layer: MapLayer, cells: number[] | null): Tally {
  const g = layer.meta.grid;
  const lim = layer.meta.colourLimit || 1;
  const out: Tally = {
    tested: 0,
    up: 0,
    down: 0,
    sigUp: 0,
    sigDown: 0,
    untestable: 0,
    bins: new Array(BINS).fill(0),
  };
  const n = g.nlat * g.nlon;
  const each = (i: number) => {
    const info = cellInfo(layer, Math.floor(i / g.nlon), i % g.nlon);
    if (!info.testable || info.rate === null) {
      if (Number.isFinite(layer.fields.rate?.[i] ?? Number.NaN) || info.reasons.length) out.untestable++;
      return;
    }
    out.tested++;
    if (info.rate > 0) out.up++;
    else if (info.rate < 0) out.down++;
    if (info.significant && info.rate > 0) out.sigUp++;
    if (info.significant && info.rate < 0) out.sigDown++;
    const b = Math.min(BINS - 1, Math.max(0, Math.floor(((info.rate + lim) / (2 * lim)) * BINS)));
    out.bins[b] = (out.bins[b] ?? 0) + 1;
  };
  if (cells) cells.forEach(each);
  else for (let i = 0; i < n; i++) each(i);
  return out;
}

function Split({ t: x, testId }: { t: Tally; testId?: string }) {
  const total = Math.max(1, x.tested);
  const w = (k: number) => `${(k / total) * 100}%`;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink/10" data-testid={testId} aria-hidden="true">
      <span className="h-full bg-[#c0392b]" style={{ width: w(x.sigUp) }} />
      <span className="h-full bg-[#e6a093]" style={{ width: w(x.up - x.sigUp) }} />
      <span className="h-full bg-[#9cc0dd]" style={{ width: w(x.down - x.sigDown) }} />
      <span className="h-full bg-[#2e6fa8]" style={{ width: w(x.sigDown) }} />
    </div>
  );
}

function Histogram({ x, layer, colormap, units }: { x: Tally; layer: MapLayer; colormap: string | undefined; units: string }) {
  const t = useT();
  const lang = useLang();
  const interp = diverging(colormap);
  const lim = layer.meta.colourLimit || 1;
  const top = Math.max(1, ...x.bins);
  return (
    <figure className="m-0 flex flex-col gap-2" data-testid="trends-histogram">
      <div className="flex h-40 items-end gap-[3px]">
        {x.bins.map((c, i) => {
          const mid = -lim + ((i + 0.5) / BINS) * 2 * lim;
          return (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-t-[3px]"
              style={{
                height: `${Math.max(1, (c / top) * 100)}%`,
                background: interp(scalePos(mid, lim)),
              }}
              title={`${fmtRate(mid, lang)} ${units}: ${int(c, lang)}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted tabular">
        <span>
          ≤ {fmtRate(-lim, lang)} {units}
        </span>
        <span>0</span>
        <span>
          ≥ {fmtRate(lim, lang)} {units}
        </span>
      </div>
      <figcaption className="text-[13px] text-muted">{t('site.trends.histogram_note')}</figcaption>
    </figure>
  );
}

type Level = 'world' | 'continent' | 'country';

interface CountryRow {
  name: string;
  displayName: string;
  continent: string | null;
  regionId?: string;
  cells: number[];
}

function useCountryRows(layer: MapLayer | undefined, explore: ExploreIndex | undefined, lang: 'en' | 'bn', countries: { data?: CountryFeature[] }) {
  return useMemo(() => {
    if (!layer || !countries.data) return null;
    const grid = layer.meta.grid;
    return countries.data.map((f): CountryRow => {
      const info = exploreForCountryName(explore, f.properties.name);
      return {
        name: f.properties.name,
        displayName: info ? pick(info.name, lang) : f.properties.name,
        continent: info?.continent ?? null,
        regionId: info?.id,
        cells: cellsInCountry(f, grid),
      };
    });
  }, [layer, countries.data, explore, lang]);
}

export default function TrendsScreen() {
  const t = useT();
  const lang = useLang();
  const { view, patch } = useView();
  const catalog = useCatalog();
  const build = useBuild();
  const explore = useExploreIndex();
  const analysed = (catalog.data?.variables ?? []).filter((v) => v.status === 'analysed');
  const variable = analysed.find((v) => v.id === view.variable) ?? analysed[0];
  const root = build.data?.root;
  const layer = useAsync<MapLayer>(root !== undefined && variable ? `map|${root}|${variable.id}|ANN` : null, () => loadMapLayer(root ?? '', variable?.id ?? '', 'ANN'));
  const countries = useAsync<CountryFeature[]>('countries', loadCountries);
  const rows = useCountryRows(layer.data, explore.data, lang, countries);
  const [level, setLevel] = useState<Level>('world');
  const continents = useMemo(() => [...new Set((rows ?? []).map((r) => r.continent).filter((c): c is string => Boolean(c)))].sort(), [rows]);
  const [continent, setContinent] = useState('Asia');
  const [country, setCountry] = useState('Bangladesh');

  const scopeCells = useMemo(() => {
    if (!rows || level === 'world') return null;
    if (level === 'continent') return rows.filter((r) => r.continent === continent).flatMap((r) => r.cells);
    return rows.find((r) => r.name === country)?.cells ?? [];
  }, [rows, level, continent, country]);
  const total = useMemo(() => (layer.data ? tally(layer.data, scopeCells) : null), [layer.data, scopeCells]);
  const ranking = useMemo(() => {
    if (!layer.data || !rows) return [];
    const list = rows
      .filter((r) => level !== 'continent' || r.continent === continent)
      .map((r) => ({ r, x: tally(layer.data!, r.cells) }))
      .filter((o) => o.x.tested >= 3);
    return list.sort((a, b) => b.x.up / b.x.tested - a.x.up / a.x.tested || b.x.sigUp - a.x.sigUp);
  }, [layer.data, rows, level, continent]);

  const record = variable ? pick(variable.name_mid ?? variable.name, lang) : '';
  const units = layer.data?.meta.units ?? '';
  const areas = explore.data?.areas ?? [];
  const areaId =
    level === 'world' ? (areas.find((a) => a.kind === 'world')?.id ?? null) : level === 'continent' ? (areas.find((a) => a.kind === 'continent' && a.name.en === continent)?.id ?? null) : null;
  const regionId = level === 'country' ? (rows?.find((r) => r.name === country)?.regionId ?? null) : null;
  const area = useExploreArea(areaId);
  const region = useExploreRegion(regionId);
  const scopeData = level === 'country' ? region : area;
  const scopeVar = variable ? scopeData.data?.variables[variable.id] : undefined;
  const scopeName =
    level === 'world' ? t('site.trends.world') : level === 'continent' ? continentName(t, continent) : (rows?.find((r) => r.name === country)?.displayName ?? country);

  return (
    <>
      <Hero eyebrow={t('site.trends.eyebrow')} title={t('site.title.trends')} lead={t('site.trends.lead')} />
      <Body>
        <div className="flex flex-col gap-8" data-testid="trends">
          <div className="flex flex-wrap items-end gap-4">
            {analysed.length ? (
              <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
                <span>{t('site.report.pick_record')}</span>
                <select
                  value={variable?.id ?? ''}
                  onChange={(e) => patch({ variable: e.target.value }, { replace: true })}
                  className="min-h-10 rounded-[8px] border border-line-strong bg-surface px-3 text-[15px]"
                  data-testid="trends-variable"
                >
                  {analysed.map((v) => (
                    <option key={v.id} value={v.id}>
                      {pick(v.name, lang)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <SegmentedControl
              size="sm"
              label={t('site.trends.level')}
              value={level}
              onValueChange={(v) => setLevel(v as Level)}
              options={[
                {
                  value: 'world',
                  label: t('site.trends.world'),
                  testId: 'trends-level-world',
                },
                {
                  value: 'continent',
                  label: t('site.trends.continent'),
                  testId: 'trends-level-continent',
                },
                {
                  value: 'country',
                  label: t('site.trends.country'),
                  testId: 'trends-level-country',
                },
              ]}
            />
            {level === 'continent' ? (
              <select
                value={continent}
                onChange={(e) => setContinent(e.target.value)}
                className="min-h-10 rounded-[8px] border border-line-strong bg-surface px-3"
                aria-label={t('site.trends.continent')}
                data-testid="trends-continent"
              >
                {continents.map((c) => (
                  <option key={c} value={c}>
                    {continentName(t, c)}
                  </option>
                ))}
              </select>
            ) : null}
            {level === 'country' && rows ? (
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="min-h-10 rounded-[8px] border border-line-strong bg-surface px-3"
                aria-label={t('site.trends.country')}
                data-testid="trends-country"
              >
                {[...rows]
                  .sort((a, b) => a.displayName.localeCompare(b.displayName))
                  .map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.displayName}
                    </option>
                  ))}
              </select>
            ) : null}
          </div>

          <div>
            <Badge tone="exploration">
              <Compass aria-hidden="true" />
              {t('family.exploration')}
            </Badge>
          </div>

          {layer.status === 'loading' || !total ? (
            <Loading />
          ) : (
            <>
              <section className="atlas-panel flex flex-col gap-4 rounded-card border border-line bg-surface p-5" data-testid="trends-headline">
                <p className="m-0 font-display text-[28px] leading-tight sm:text-[34px]">
                  {t('site.trends.headline', {
                    scope: scopeName,
                    record,
                    up: int(total.up, lang),
                    down: int(total.down, lang),
                    tested: int(total.tested, lang),
                    since: int(layer.data?.meta.window.first ?? 0, lang),
                  })}
                </p>
                <Split t={total} testId="trends-split" />
                <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { k: 'tested', v: total.tested, icon: null },
                    {
                      k: 'sig_up',
                      v: total.sigUp,
                      icon: <ArrowUpRight className="size-3.5" aria-hidden="true" />,
                    },
                    {
                      k: 'sig_down',
                      v: total.sigDown,
                      icon: <ArrowDownRight className="size-3.5" aria-hidden="true" />,
                    },
                    { k: 'untestable', v: total.untestable, icon: null },
                  ].map((d) => (
                    <div key={d.k} className="rounded-[8px] border border-line p-3">
                      <dt className="inline-flex items-center gap-1 text-xs text-muted">
                        {d.icon}
                        {t(`site.trends.${d.k}`)}
                      </dt>
                      <dd className="m-0 font-display text-[28px] leading-tight tabular" data-testid={`trends-${d.k}`}>
                        {int(d.v, lang)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="m-0 text-[13px] text-muted">{t('site.trends.legend')}</p>
              </section>

              {layer.data ? <Histogram x={total} layer={layer.data} colormap={variable?.colormap?.trend} units={units} /> : null}

              {level !== 'country' ? (
                <section aria-labelledby="trends-rank">
                  <h2 id="trends-rank" className="mb-1 text-chapter">
                    {t('site.trends.rank_title')}
                  </h2>
                  <p className="mb-4 mt-1 max-w-[70ch] text-[14.5px] text-muted">{t('site.trends.rank_lead', { record })}</p>
                  {!rows ? (
                    <Loading />
                  ) : (
                    <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2" data-testid="trends-ranking">
                      {ranking.map(({ r, x }, i) => (
                        <li key={r.name}>
                          <a
                            href={
                              r.regionId
                                ? href({
                                    screen: 'place',
                                    region: r.regionId,
                                    variable: variable?.id,
                                  })
                                : href({
                                    screen: 'map',
                                    variable: variable?.id,
                                  })
                            }
                            className="flex flex-col gap-1.5 rounded-[8px] border border-line px-3 py-2 text-ink no-underline hover:border-accent hover:no-underline"
                          >
                            <span className="flex items-baseline gap-2">
                              <span className="w-8 font-mono text-[12px] text-muted tabular">{int(i + 1, lang)}</span>
                              <span className="flex-1 truncate font-medium">{r.displayName}</span>
                              <span className="font-mono text-[12px] text-muted tabular">
                                {t('site.trends.row', {
                                  up: int(x.up, lang),
                                  tested: int(x.tested, lang),
                                })}
                              </span>
                            </span>
                            <Split t={x} />
                          </a>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ) : null}
            </>
          )}

          {explore.data && variable && scopeData.status !== 'loading' ? <ScopeTrend v={scopeVar} scope={scopeName} variable={variable} /> : null}
          {explore.data && variable && level !== 'country' ? <TrendRanking variable={variable} continent={level === 'continent' ? continent : null} units={units} /> : null}
          {explore.data && variable ? <CountryTrendMap variable={variable} countries={countries.data} explore={explore.data} units={units} /> : null}
          {explore.data && variable ? <LatitudeYears variable={variable} /> : null}

          <div className="flex flex-col gap-2 rounded-[6px] border border-line bg-surface-2 p-4 text-[13.5px] leading-relaxed text-muted">
            <p className="m-0 flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('site.trends.note_squares')}
            </p>
            <p className="m-0 pl-6">{t('site.trends.note_tested')}</p>
            <p className="m-0 pl-6">{t('site.trends.note_missing')}</p>
          </div>
        </div>
      </Body>
    </>
  );
}

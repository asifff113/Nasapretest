// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The body of a region report (exploration): every record at a glance, one record year by year (with a "play"
// that draws it one year at a time), the year's rhythm as a clock, a comparison with any other place, and two
// records against each other. Every number is the detail file's own; the screen sorts and places them and never
// computes a mean, a trend or a difference. Region detail files are exploration, so no verdict words appear.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Compass, Info, Pause, Play, X } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import { int, num } from '../i18n/format';
import type { Catalog, CatalogVariable, Lang } from '../data/types';
import { useExploreRegion, type ExploreIndex, type ExploreRegion, type ExploreRegionInfo, type ExploreVariable } from '../data/explore';
import { useLang } from '../state/prefs';
import { ClimateStripes } from '../charts/ClimateStripes';
import { YearsChart, type YearMark } from '../charts/YearsChart';
import { ClimateClock } from '../charts/ClimateClock';
import { RelationChart } from '../charts/RelationChart';
import { LocatorGlobe } from '../components/atlas/LocatorGlobe';
import { GroupIcon } from '../components/atlas/icons';
import { WithData } from '../components/LoadState';
import { Badge } from '../ui/common/badge';
import { SegmentedControl } from '../ui/common/toggle-group';
import { cn } from '../ui/common/utils';

/** Decimals for showing a value of this size (formatting only). */
export function dp(v: number | null | undefined): number {
  const a = Math.abs(v ?? 0);
  return a >= 100 ? 0 : a >= 10 ? 1 : 2;
}

/** The last year that has a value. */
export function latest(v: ExploreVariable): { year: number; value: number } | null {
  for (let i = v.years.length - 1; i >= 0; i--) {
    const x = v.annual[i];
    if (x !== null && x !== undefined && Number.isFinite(x)) return { year: v.years[i] ?? 0, value: x };
  }
  return null;
}

/** The highest and the lowest year, by sorting the values shown. */
export function extremes(v: ExploreVariable): { high: { year: number; value: number }; low: { year: number; value: number } } | null {
  const pts = v.years.map((year, i) => ({ year, value: v.annual[i] ?? null })).filter((p): p is { year: number; value: number } => p.value !== null && Number.isFinite(p.value));
  if (pts.length === 0) return null;
  const sorted = [...pts].sort((a, b) => a.value - b.value);
  return { low: sorted[0]!, high: sorted[sorted.length - 1]! };
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function continentName(t: ReturnType<typeof useT>, c: string | null): string {
  return c ? tOr(t, `site.continent.${slug(c)}`, c) : t('site.report.no_continent');
}

function varName(catalog: Catalog | undefined, id: string, lang: Lang): string {
  const v = catalog?.variables.find((x) => x.id === id);
  return v ? pick(v.name, lang) : id;
}

function Chapter({ id, n, title, lead, children }: { id: string; n: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-28 first:mt-0" aria-labelledby={`${id}-h`}>
      <div className="mb-5 flex items-baseline gap-3 border-b border-line pb-3">
        <span className="font-mono text-[12px] text-accent-ink">{n}</span>
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="text-chapter">
            {title}
          </h2>
          {lead ? <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-muted">{lead}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Panel({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn('atlas-panel rounded-card border border-line bg-surface p-4 sm:p-5', className)} data-testid={testId}>
      {children}
    </div>
  );
}

/** One card per record: its latest value, its highest and lowest year, and its stripes. */
function Glance({ data, ids, catalog, value, onPick }: { data: ExploreRegion; ids: string[]; catalog: Catalog | undefined; value: string; onPick: (id: string) => void }) {
  const t = useT();
  const lang = useLang();
  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4" data-testid="report-glance">
      {ids.map((id) => {
        const v = data.variables[id];
        if (!v) return null;
        const cv = catalog?.variables.find((x) => x.id === id);
        const last = latest(v);
        const ex = extremes(v);
        const on = id === value;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onPick(id)}
              aria-pressed={on}
              className={cn(
                'flex h-full w-full flex-col gap-3 rounded-card border p-4 text-left transition-colors',
                on ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-accent/70',
              )}
              data-testid={`glance-${id}`}
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold">
                <span className={cn('grid size-7 place-items-center rounded-full', on ? 'bg-accent text-ocean' : 'bg-ink/10')}>
                  <GroupIcon group={cv?.group} className="size-3.5" />
                </span>
                {varName(catalog, id, lang)}
              </span>
              {last ? (
                <span>
                  <span className="font-display text-[34px] leading-none tabular">{num(last.value, lang, dp(last.value))}</span>
                  <span className="ml-1.5 text-[13px] text-muted">{v.units}</span>
                  <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {t(v.rule === 'sum' ? 'site.report.total_in' : 'site.report.average_in', { year: int(last.year, lang) })}
                  </span>
                </span>
              ) : null}
              <ClimateStripes
                years={v.years}
                values={v.annual}
                units={v.units}
                colormap={cv?.colormap?.trend}
                lang={lang}
                label={t('site.report.stripes_alt', { record: varName(catalog, id, lang) })}
                height={26}
                showScale={false}
                testId={`glance-stripes-${id}`}
              />
              {ex ? (
                <span className="grid grid-cols-2 gap-2 text-[12.5px]">
                  <span className="flex items-center gap-1">
                    <ArrowUp className="size-3.5 text-muted" aria-hidden="true" />
                    {t('site.report.highest_short', { year: int(ex.high.year, lang) })}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowDown className="size-3.5 text-muted" aria-hidden="true" />
                    {t('site.report.lowest_short', { year: int(ex.low.year, lang) })}
                  </span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Draws the record year by year when playing. */
function usePlayer(years: number[]) {
  const [upto, setUpto] = useState<number | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const last = years[years.length - 1];
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      if (upto === undefined || last === undefined || upto >= last) {
        setPlaying(false);
        setUpto(undefined);
      } else setUpto(upto + 1);
    }, 140);
    return () => window.clearTimeout(id);
  }, [playing, upto, last]);
  return {
    upto,
    playing,
    play: () => {
      setUpto(years[0]);
      setPlaying(true);
    },
    stop: () => {
      setPlaying(false);
      setUpto(undefined);
    },
  };
}

function YearByYear({ data, id, catalog, compare }: { data: ExploreRegion; id: string; catalog: Catalog | undefined; compare?: ExploreRegion }) {
  const t = useT();
  const lang = useLang();
  const v = data.variables[id];
  const cv: CatalogVariable | undefined = catalog?.variables.find((x) => x.id === id);
  const w = compare?.variables[id];
  const player = usePlayer(v?.years ?? []);
  if (!v) return null;
  const name = pick(data.region.name, lang);
  const ex = extremes(v);
  const marks: YearMark[] =
    ex && !w
      ? [
          { year: ex.high.year, value: ex.high.value, text: t('site.report.highest_mark', { year: int(ex.high.year, lang) }) },
          { year: ex.low.year, value: ex.low.value, text: t('site.report.lowest_mark', { year: int(ex.low.year, lang) }) },
        ]
      : [];
  const breaks = cv?.record_card?.known_breaks ?? [];
  const record = varName(catalog, id, lang);
  return (
    <div className="flex flex-col gap-4">
      <Panel testId="report-years">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="m-0 flex-1 text-[15px] font-semibold">
            {t(v.rule === 'sum' ? 'site.report.chart_title_sum' : 'site.report.chart_title_mean', { record, units: v.units })}
          </p>
          {player.upto !== undefined ? (
            <span className="font-display text-[28px] leading-none tabular" aria-live="polite" data-testid="report-play-year">
              {int(player.upto, lang)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => (player.playing ? player.stop() : player.play())}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-accent/70 px-4 text-[14px] font-semibold hover:bg-accent/15"
            data-testid="report-play"
          >
            {player.playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {player.playing ? t('site.report.stop') : t('site.report.play')}
          </button>
        </div>
        <YearsChart
          series={[
            { label: name, years: v.years, values: v.annual, tone: 'a' },
            ...(w && compare ? [{ label: pick(compare.region.name, lang), years: w.years, values: w.annual, tone: 'b' as const }] : []),
          ]}
          units={v.units}
          lang={lang}
          label={t('site.report.chart_alt', { record, place: name })}
          upto={player.upto}
          marks={marks}
          testId="report-years-chart"
        />
        {w && compare ? (
          <p className="mt-2 flex flex-wrap gap-4 text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded-full bg-accent" aria-hidden="true" />
              {name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded-full bg-link" aria-hidden="true" />
              {pick(compare.region.name, lang)}
            </span>
          </p>
        ) : null}
      </Panel>
      <Panel>
        <p className="mb-2 text-[14px] font-semibold">{t('site.stripes.title')}</p>
        <ClimateStripes years={v.years} values={v.annual} units={v.units} colormap={cv?.colormap?.trend} lang={lang} label={t('site.report.stripes_alt', { record })} height={72} testId="report-stripes" />
        {w && compare ? (
          <>
            <p className="mb-2 mt-4 text-[14px] font-semibold">{pick(compare.region.name, lang)}</p>
            <ClimateStripes years={w.years} values={w.annual} units={w.units} colormap={cv?.colormap?.trend} lang={lang} label={t('site.report.stripes_alt', { record })} height={72} testId="report-stripes-b" />
          </>
        ) : null}
      </Panel>
      <div className="flex gap-2.5 rounded-[6px] border border-line bg-surface-2 p-3.5 text-[13.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1.5">
          <p className="m-0">{t('site.report.values_note')}</p>
          {cv?.record_card ? <p className="m-0">{pick(cv.record_card.observation_or_model, lang)}</p> : null}
          {breaks.length ? (
            <>
              <p className="m-0 font-semibold text-ink">{t('site.report.breaks_title')}</p>
              <ul className="m-0 list-disc pl-5">
                {breaks.map((b) => (
                  <li key={b.id}>
                    {pick(b.label, lang)}
                    {b.date ? ` (${b.date})` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Rhythm({ data, id, catalog, compare }: { data: ExploreRegion; id: string; catalog: Catalog | undefined; compare?: ExploreRegion }) {
  const t = useT();
  const lang = useLang();
  const v = data.variables[id];
  const w = compare?.variables[id];
  if (!v) return null;
  const name = pick(data.region.name, lang);
  const record = varName(catalog, id, lang);
  const first = v.years[0] ?? 0;
  const last = v.years[v.years.length - 1] ?? 0;
  const months = Array.from({ length: 12 }, (_, i) => t(`site.month.${i + 1}`));
  const lo = v.monthlyClimatology.map((x, i) => ({ i, x })).filter((p): p is { i: number; x: number } => p.x !== null);
  const sorted = [...lo].sort((a, b) => a.x - b.x);
  const top = sorted[sorted.length - 1];
  const bottom = sorted[0];
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Panel className="flex justify-center">
        <ClimateClock
          series={[
            { label: name, values: v.monthlyClimatology, tone: 'a' },
            ...(w && compare ? [{ label: pick(compare.region.name, lang), values: w.monthlyClimatology, tone: 'b' as const }] : []),
          ]}
          units={v.unitsMonthly}
          lang={lang}
          label={t('site.report.clock_alt', { record, place: name })}
        />
      </Panel>
      <div className="flex flex-col gap-4">
        {top && bottom ? (
          <dl className="m-0 grid grid-cols-2 gap-3">
            <div className="rounded-card border border-line bg-surface p-4">
              <dt className="eyebrow">{t('site.report.peak_month')}</dt>
              <dd className="m-0 mt-1 font-display text-[30px] leading-tight">{months[top.i]}</dd>
              <dd className="m-0 font-mono text-[12px] text-muted tabular">
                {num(top.x, lang, dp(top.x))} {v.unitsMonthly}
              </dd>
            </div>
            <div className="rounded-card border border-line bg-surface p-4">
              <dt className="eyebrow">{t('site.report.low_month')}</dt>
              <dd className="m-0 mt-1 font-display text-[30px] leading-tight">{months[bottom.i]}</dd>
              <dd className="m-0 font-mono text-[12px] text-muted tabular">
                {num(bottom.x, lang, dp(bottom.x))} {v.unitsMonthly}
              </dd>
            </div>
          </dl>
        ) : null}
        <p className="m-0 text-[14.5px] leading-relaxed text-muted">{t('site.report.clock_note', { from: int(first, lang), to: int(last, lang), units: v.unitsMonthly })}</p>
      </div>
    </div>
  );
}

function nearby(index: ExploreIndex, here: ExploreRegionInfo, n: number): ExploreRegionInfo[] {
  const k = Math.cos((here.centroid[1] * Math.PI) / 180);
  return index.regions
    .filter((r) => r.id !== here.id)
    .map((r) => ({ r, d: Math.hypot((r.centroid[0] - here.centroid[0]) * k, r.centroid[1] - here.centroid[1]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.r);
}

export function RegionSelect({ index, value, exclude, onPick, label, testId }: { index: ExploreIndex; value: string; exclude?: string; onPick: (id: string) => void; label: string; testId?: string }) {
  const t = useT();
  const lang = useLang();
  const groups = useMemo(() => {
    const out = new Map<string, ExploreRegionInfo[]>();
    for (const r of index.regions) {
      if (r.id === exclude) continue;
      const g = r.kind === 'country' ? continentName(t, r.continent) : t(`site.report.kind_${r.kind}`);
      out.set(g, [...(out.get(g) ?? []), r]);
    }
    for (const list of out.values()) list.sort((a, b) => pick(a.name, lang).localeCompare(pick(b.name, lang)));
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [index, exclude, lang, t]);
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="min-h-11 rounded-[8px] border border-line-strong bg-surface px-3 text-[15px] focus:border-accent"
        data-testid={testId}
      >
        <option value="">{t('site.report.choose_place')}</option>
        {groups.map(([g, list]) => (
          <optgroup key={g} label={g}>
            {list.map((r) => (
              <option key={r.id} value={r.id}>
                {pick(r.name, lang)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function CompareGlance({ a, b, ids, catalog }: { a: ExploreRegion; b: ExploreRegion; ids: string[]; catalog: Catalog | undefined }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[480px] border-collapse text-[14px]" data-testid="compare-table">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              {t('site.report.record')}
            </th>
            <th scope="col" className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-accent" aria-hidden="true" />
                {pick(a.region.name, lang)}
              </span>
            </th>
            <th scope="col" className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-link" aria-hidden="true" />
                {pick(b.region.name, lang)}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const va = a.variables[id];
            const vb = b.variables[id];
            const la = va ? latest(va) : null;
            const lb = vb ? latest(vb) : null;
            return (
              <tr key={id} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  {varName(catalog, id, lang)}
                  <span className="block text-[12px] font-normal text-muted">{t(va?.rule === 'sum' ? 'site.report.total_in' : 'site.report.average_in', { year: int(la?.year ?? lb?.year ?? 0, lang) })}</span>
                </th>
                <td className="px-4 py-3 font-display text-[22px] tabular">
                  {la ? num(la.value, lang, dp(la.value)) : '–'} <span className="font-sans text-[12px] text-muted">{va?.units}</span>
                </td>
                <td className="px-4 py-3 font-display text-[22px] tabular">
                  {lb ? num(lb.value, lang, dp(lb.value)) : '–'} <span className="font-sans text-[12px] text-muted">{vb?.units}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Relations({ data, ids, catalog }: { data: ExploreRegion; ids: string[]; catalog: Catalog | undefined }) {
  const t = useT();
  const lang = useLang();
  const [xId, setX] = useState(ids[0] ?? '');
  const [yId, setY] = useState(ids[1] ?? ids[0] ?? '');
  const vx = data.variables[xId];
  const vy = data.variables[yId];
  const opts = ids.map((id) => ({ value: id, label: varName(catalog, id, lang) }));
  const name = pick(data.region.name, lang);
  return (
    <Panel testId="report-relations">
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          <span>{t('site.report.across')}</span>
          <select value={xId} onChange={(e) => setX(e.target.value)} className="min-h-11 rounded-[8px] border border-line-strong bg-surface px-3 text-[15px]" data-testid="relation-x">
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          <span>{t('site.report.up')}</span>
          <select value={yId} onChange={(e) => setY(e.target.value)} className="min-h-11 rounded-[8px] border border-line-strong bg-surface px-3 text-[15px]" data-testid="relation-y">
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {vx && vy ? (
        <RelationChart
          years={vx.years}
          x={vx.annual}
          y={vy.years.length === vx.years.length ? vy.annual : vx.years.map((yr) => vy.annual[vy.years.indexOf(yr)] ?? null)}
          xLabel={`${varName(catalog, xId, lang)} (${vx.units})`}
          yLabel={`${varName(catalog, yId, lang)} (${vy.units})`}
          lang={lang}
          label={t('site.report.relation_alt', { x: varName(catalog, xId, lang), y: varName(catalog, yId, lang), place: name })}
        />
      ) : null}
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{t('site.report.relation_note')}</p>
    </Panel>
  );
}

export function ReportBody({
  data,
  index,
  catalog,
  variable,
  onVariable,
  first = 1,
}: {
  data: ExploreRegion;
  index: ExploreIndex;
  catalog: Catalog | undefined;
  variable: string | undefined;
  onVariable: (id: string) => void;
  /** The number of the first chapter (a place page puts these after its own chapters). */
  first?: number;
}) {
  const t = useT();
  const lang = useLang();
  const ids = index.variables.map((v) => v.id).filter((id) => data.variables[id]);
  const id = variable && ids.includes(variable) ? variable : (ids[0] ?? '');
  const [compareId, setCompareId] = useState('');
  const compare = useExploreRegion(compareId || null);
  const other = compareId && compare.status === 'ok' ? compare.data : undefined;
  const name = pick(data.region.name, lang);
  const record = varName(catalog, id, lang);
  const near = nearby(index, data.region, 6);
  const n = (k: number) => String(first + k).padStart(2, '0');
  return (
    <div data-testid="region-report">
      <Chapter id="report-glance" n={n(0)} title={t('site.report.glance_title')} lead={t('site.report.glance_lead', { place: name })}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone="exploration">
            <Compass aria-hidden="true" />
            {t('family.exploration')}
          </Badge>
        </div>
        <Glance data={data} ids={ids} catalog={catalog} value={id} onPick={onVariable} />
      </Chapter>

      <Chapter id="report-years" n={n(1)} title={t('site.report.years_title', { record })} lead={t('site.report.years_lead')}>
        <div className="mb-4">
          <SegmentedControl size="sm" label={t('site.report.pick_record')} value={id} onValueChange={onVariable} options={ids.map((x) => ({ value: x, label: varName(catalog, x, lang), testId: `report-var-${x}` }))} />
        </div>
        <YearByYear key={`${id}_${other?.region.id ?? ''}`} data={data} id={id} catalog={catalog} compare={other} />
      </Chapter>

      <Chapter id="report-rhythm" n={n(2)} title={t('site.report.rhythm_title')} lead={t('site.report.rhythm_lead', { record })}>
        <Rhythm data={data} id={id} catalog={catalog} compare={other} />
      </Chapter>

      <Chapter id="report-compare" n={n(3)} title={t('site.report.compare_title')} lead={t('site.report.compare_lead', { place: name })}>
        <div className="flex flex-col gap-5">
          <div className="grid items-end gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
            <RegionSelect index={index} value={compareId} exclude={data.region.id} onPick={setCompareId} label={t('site.report.compare_with')} testId="compare-select" />
            <div className="flex flex-wrap gap-1.5" aria-label={t('site.report.nearby')}>
              <span className="mr-1 self-center font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{t('site.report.nearby')}</span>
              {near.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setCompareId(r.id)}
                  aria-pressed={compareId === r.id}
                  className={cn('min-h-9 rounded-full border px-3 text-[13px]', compareId === r.id ? 'border-link bg-link/10' : 'border-line-strong hover:border-link')}
                  data-testid={`nearby-${r.id}`}
                >
                  {pick(r.name, lang)}
                </button>
              ))}
              {compareId ? (
                <button type="button" onClick={() => setCompareId('')} className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[13px] text-muted hover:text-ink">
                  <X className="size-3.5" aria-hidden="true" />
                  {t('site.report.clear')}
                </button>
              ) : null}
            </div>
          </div>
          {compareId ? (
            <WithData res={compare}>
              {(b) => (
                <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="report-compare-ready">
                  <CompareGlance a={data} b={b} ids={ids} catalog={catalog} />
                  <div className="flex justify-center">
                    <LocatorGlobe
                      marks={[
                        { lon: data.region.centroid[0], lat: data.region.centroid[1], bbox: data.region.bbox, label: name, tone: 'accent' },
                        { lon: b.region.centroid[0], lat: b.region.centroid[1], bbox: b.region.bbox, label: pick(b.region.name, lang), tone: 'link' },
                      ]}
                      arc
                      size={300}
                      label={t('site.compare.locator_alt', { a: name, b: pick(b.region.name, lang) })}
                    />
                  </div>
                </div>
              )}
            </WithData>
          ) : (
            <p className="m-0 rounded-[6px] border border-dashed border-line-strong p-4 text-[14px] text-muted">{t('site.report.compare_empty')}</p>
          )}
          {other ? <p className="m-0 text-[13.5px] text-muted">{t('site.report.compare_note', { record })}</p> : null}
        </div>
      </Chapter>

      {ids.length > 1 ? (
        <Chapter id="report-relations" n={n(4)} title={t('site.report.relations_title')} lead={t('site.report.relations_lead')}>
          <Relations data={data} ids={ids} catalog={catalog} />
        </Chapter>
      ) : null}
    </div>
  );
}

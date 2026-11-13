// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Place (docs/04_UI.md §4.3–§4.5) in the atlas look (ADR-24): a head with the locator globe and the place's facts,
// then three chapters — the data cells behind the place, the line-up as an evidence board, and the evidence for
// one result (chart, and the verdict on an ivory answer sheet).
// A 1° cell (region=cell:<row>_<col>) opens the cell page instead (exploration only).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import { int, num } from '../i18n/format';
import type { Lineup, Mask, Region, RegionIndex, Verdict } from '../data/types';
import { paths } from '../data/results';
import { useCatalog, useRegionIndex, useResult } from '../data/hooks';
import { useLang } from '../state/prefs';
import { useView } from '../state/view';
import { latLon } from '../map/ScreeningMap';
import { BadLinkNotice, Loading, WithData } from '../components/LoadState';
import { Body, StepBar, StepHeading, goToStep, useStepObserver } from '../components/Page';
import { Facts, Hero } from '../components/atlas/Hero';
import { LocatorGlobe } from '../components/atlas/LocatorGlobe';
import { PlacePicker } from '../components/PlacePicker';
import type { GeoJSON } from '../components/ContributingCells';
import { SquaresExplainer } from '../components/atlas/SquaresExplainer';
import { LineupTable } from '../components/LineupTable';
import { VerdictView } from '../components/VerdictView';
import { SegmentedControl } from '../ui/common/toggle-group';
import { useExploreIndex, useExploreRegion, type ExploreIndex } from '../data/explore';
import { RegionReport } from '../report/RegionReport';
import { ReportBody, continentName } from '../report/ReportBody';
import { href } from '../state/view';

const CellPage = lazy(() => import('./CellPage'));

function CellsPanel({ region }: { region: Region }) {
  const t = useT();
  const index = useRegionIndex();
  const grids = Object.keys(region.cells);
  const [gridId, setGridId] = useState(grids[0] ?? 'merra2_native');
  const maskPath = region.cells[gridId] ?? null;
  const mask = useResult<Mask>(maskPath);
  const geom = useResult<GeoJSON>(region.geom);
  const grid = index.data?.grids.find((g) => g.id === gridId);
  return (
    <div className="flex flex-col gap-5">
      {grids.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow m-0">{t('site.place.grid_label')}</p>
          <SegmentedControl
            size="sm"
            label={t('site.place.grid_label')}
            value={gridId}
            onValueChange={setGridId}
            options={grids.map((g) => ({ value: g, label: tOr(t, `site.grid.${g}`, g) }))}
          />
        </div>
      ) : null}
      <WithData res={mask} path={maskPath ?? undefined}>
        {(m) =>
          grid ? (
            <SquaresExplainer region={region} grid={grid} mask={m} geom={geom.status === 'ok' ? (geom.data ?? null) : null} minCells={index.data?.minNativeCells} />
          ) : null
        }
      </WithData>
    </div>
  );
}

function placeMarks(regions: Region[], lang: 'en' | 'bn', labels = true) {
  return regions.map((r) => ({ lon: r.centroid[0], lat: r.centroid[1], bbox: r.bbox, label: labels ? pick(r.name, lang) : undefined }));
}

/** Every country and region with a detail file, grouped by continent, with a search box. */
function Directory({ index }: { index: ExploreIndex }) {
  const t = useT();
  const lang = useLang();
  const { view } = useView();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = new Map<string, ExploreIndex['regions']>();
    for (const r of index.regions) {
      if (needle && !pick(r.name, 'en').toLowerCase().includes(needle) && !pick(r.name, 'bn').includes(q.trim())) continue;
      const g = r.kind === 'country' ? continentName(t, r.continent) : t(`site.report.kind_${r.kind}`);
      out.set(g, [...(out.get(g) ?? []), r]);
    }
    for (const list of out.values()) list.sort((a, b) => pick(a.name, lang).localeCompare(pick(b.name, lang)));
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [index, q, lang, t]);
  const shown = groups.reduce((n, [, l]) => n + l.length, 0);
  return (
    <div className="flex flex-col gap-5" data-testid="place-directory">
      <label className="relative block max-w-[460px]">
        <span className="sr-only">{t('site.directory.search')}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('site.directory.search')}
          className="min-h-11 w-full rounded-[8px] border border-line-strong bg-surface pl-9 pr-3 text-[15px] focus:border-accent"
          data-testid="directory-search"
        />
      </label>
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{t('site.directory.count', { n: int(shown, lang) })}</p>
      {shown === 0 ? <p className="m-0 text-[15px] text-muted">{t('site.directory.none', { q })}</p> : null}
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map(([g, list]) => (
          <section key={g} aria-label={g}>
            <h3 className="mb-2 border-b border-line pb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-accent-ink">{g}</h3>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {list.map((r) => (
                <li key={r.id}>
                  <a
                    href={href({ screen: 'place', region: r.id, variable: view.variable })}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13.5px] hover:border-accent hover:bg-accent/10"
                    title={r.passesSupport ? undefined : t('site.directory.small')}
                  >
                    {pick(r.name, lang)}
                    {r.passesSupport ? null : <span className="size-1.5 rounded-full bg-muted/60" aria-hidden="true" />}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** No place chosen yet: the gallery of places. */
function Gallery({ badLink }: { badLink: boolean }) {
  const t = useT();
  const lang = useLang();
  const index = useRegionIndex();
  const { view } = useView();
  const inSet = index.data?.regions.filter((r) => r.inSet) ?? [];
  const explore = useExploreIndex();
  return (
    <>
      <Hero
        top={badLink ? <BadLinkNotice show={badLink} /> : undefined}
        eyebrow={t('site.place.eyebrow')}
        title={t('place.title')}
        lead={t('site.place.lead')}
        aside={inSet.length ? <LocatorGlobe marks={placeMarks(inSet, lang, false)} label={t('site.place.locator_all')} size={400} /> : undefined}
        facts={
          index.data ? (
            <Facts
              className="max-w-[560px]"
              items={[
                { label: t('site.place.fact_places'), value: int(inSet.length, lang) },
                { label: t('site.place.fact_pairs'), value: int(index.data.pairs.length, lang) },
                { label: t('site.place.fact_grid'), value: int(index.data.grids.length, lang) },
              ]}
            />
          ) : undefined
        }
      />
      <Body>
        <section id="step-place">
          <StepHeading n={1} title={t('place.region_set')} />
          <WithData res={index}>
            {(idx) => <PlacePicker index={idx} linkFor={(id) => ({ screen: 'place', region: id, variable: view.variable, season: view.season })} />}
          </WithData>
        </section>
        {explore.status === 'ok' && explore.data ? (
          <section id="step-directory" className="mt-16">
            <StepHeading n={2} title={t('site.directory.title')} lead={t('site.directory.lead', { n: int(explore.data.regions.length, lang) })} />
            <Directory index={explore.data} />
          </section>
        ) : null}
      </Body>
    </>
  );
}

function RegionHero({ region, index, lineup }: { region: Region; index: RegionIndex; lineup: Lineup | undefined }) {
  const t = useT();
  const lang = useLang();
  const { view } = useView();
  const name = pick(region.name, lang);
  const grid = index.grids.find((g) => g.id === 'merra2_native') ?? index.grids[0];
  const support = grid ? region.support[grid.id] : undefined;
  return (
    <Hero
      eyebrow={t('site.place.eyebrow')}
      title={t('site.place.title_region', { place: name })}
      lead={t('site.place.lead_region')}
      aside={<LocatorGlobe marks={placeMarks([region], lang)} label={t('site.place.locator_alt', { place: name })} size={420} testId="locator" />}
      facts={
        <Facts
          items={[
            ...(support ? [{ label: t('site.place.fact_cells'), value: num(support.effectiveCells, lang, 1) }] : []),
            ...(lineup ? [{ label: t('site.place.fact_tests'), value: int(lineup.nTests, lang) }] : []),
            ...(region.areaKm2 ? [{ label: t('site.place.fact_area'), value: int(Math.round(region.areaKm2), lang), note: t('site.place.km2') }] : []),
            { label: t('site.place.fact_centre'), value: <span className="font-mono text-[17px] leading-tight">{latLon(region.centroid[1], region.centroid[0], lang)}</span> },
          ]}
        />
      }
    >
      <p className="eyebrow mb-2.5">{t('site.place.other_places')}</p>
      <PlacePicker index={index} value={region.id} compact linkFor={(id) => ({ screen: 'place', region: id, variable: view.variable, season: view.season })} />
    </Hero>
  );
}

function RegionScreen() {
  const t = useT();
  const lang = useLang();
  const { view, badLink, flagBadLink } = useView();
  const index = useRegionIndex();
  const catalog = useCatalog();
  const explore = useExploreIndex();
  const [step, setStep] = useState(0);

  const region = view.region ? index.data?.regions.find((r) => r.id === view.region) : undefined;
  const validRegion = region && region.inSet ? region : undefined;
  const lineupPath = validRegion ? paths.lineup(validRegion.id) : null;
  const lineup = useResult<Lineup>(lineupPath);

  const items = lineup.data?.items ?? [];
  const asked = items.find((i) => i.variable === view.variable && i.season === view.season);
  const selected = asked ?? items[0];
  const verdict = useResult<Verdict>(selected ? selected.path : null);

  // Unknown ids fall back to defaults with a notice (errors.bad_view).
  const reportInfo = view.region && explore.status === 'ok' ? explore.data?.regions.find((r) => r.id === view.region) : undefined;
  useEffect(() => {
    if (index.status === 'ok' && explore.status !== 'loading' && view.region && !validRegion && !reportInfo) flagBadLink();
  }, [index.status, explore.status, view.region, validRegion, reportInfo, flagBadLink]);
  useEffect(() => {
    if (lineup.status === 'ok' && (view.variable || view.season) && !asked) flagBadLink();
  }, [lineup.status, view.variable, view.season, asked, flagBadLink]);

  const steps = [
    { id: 'step-place', label: t('site.place.step_place') },
    { id: 'step-lineup', label: t('site.place.step_lineup') },
    { id: 'step-verdict', label: t('site.place.step_verdict') },
  ];
  useStepObserver(
    steps.map((s) => s.id),
    setStep,
    Boolean(validRegion),
  );

  if (!validRegion || !index.data) {
    if (index.status === 'loading' || (view.region && explore.status === 'loading')) return <Loading className="mx-auto max-w-[1280px] px-4 py-8" />;
    if (reportInfo && explore.data) return <RegionReport id={reportInfo.id} index={explore.data} />;
    return <Gallery badLink={badLink} />;
  }
  const regionName = pick(validRegion.name, lang);

  return (
    <>
      {badLink ? (
        <div className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-6">
          <BadLinkNotice show={badLink} />
        </div>
      ) : null}
      <RegionHero region={validRegion} index={index.data} lineup={lineup.data} />
      <Body>
        <section id="step-place" className="scroll-mt-28">
          <StepHeading n={1} title={t('site.place.cells_title')} lead={t('site.squares.lead')} />
          <CellsPanel key={validRegion.id} region={validRegion} />
        </section>
        <section id="step-lineup" className="mt-16 scroll-mt-28">
          <StepHeading n={2} title={t('lineup.title')} />
          <WithData res={lineup} path={lineupPath ?? undefined}>
            {(l) => (
              <LineupTable
                lineup={l}
                catalog={catalog.data}
                selected={selected ? { variable: selected.variable, season: selected.season } : undefined}
                linkFor={(it) => ({ screen: 'place', region: validRegion.id, variable: it.variable, season: it.season })}
              />
            )}
          </WithData>
        </section>
        <section id="step-verdict" className="mt-16 scroll-mt-28">
          <StepHeading n={3} title={t('site.place.step_verdict_title')} />
          {selected ? (
            <WithData res={verdict} path={selected.path}>
              {(v) => <VerdictView key={selected.path} verdict={v} path={selected.path} catalog={catalog.data} regionName={regionName} />}
            </WithData>
          ) : lineup.status === 'loading' ? (
            <Loading />
          ) : null}
        </section>
        {reportInfo && explore.data ? (
          <section id="step-report" className="mt-16 scroll-mt-28">
            <RegionReportChapters id={reportInfo.id} index={explore.data} />
          </section>
        ) : null}
        <StepBar steps={steps} current={step} onGo={(i) => goToStep(steps[i]?.id ?? '')} />
      </Body>
    </>
  );
}

/** The report's chapters (every record year by year, the rhythm, comparisons) below a tested place's verdict. */
function RegionReportChapters({ id, index }: { id: string; index: ExploreIndex }) {
  const { view, patch } = useView();
  const catalog = useCatalog();
  const res = useExploreRegion(id);
  return (
    <WithData res={res}>
      {(data) => <ReportBody data={data} index={index} catalog={catalog.data} variable={view.variable} onVariable={(v) => patch({ variable: v }, { replace: true })} first={4} />}
    </WithData>
  );
}

export default function PlaceScreen() {
  const region = useView((s) => s.view.region);
  if (region?.startsWith('cell:')) {
    return (
      <Suspense fallback={<Loading className="mx-auto max-w-[1280px] px-4 py-8" />}>
        <CellPage />
      </Suspense>
    );
  }
  return <RegionScreen />;
}

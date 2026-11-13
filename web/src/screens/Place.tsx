// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Place (docs/04_UI.md §4.3–§4.5) in the atlas look (ADR-24): a head with the locator globe and the place's facts,
// then three chapters — the data cells behind the place, the line-up as an evidence board, and the evidence for
// one result (chart, and the verdict on an ivory answer sheet).
// A 1° cell (region=cell:<row>_<col>) opens the cell page instead (exploration only).
import { lazy, Suspense, useEffect, useState } from 'react';
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

/** No place chosen yet: the gallery of places. */
function Gallery({ badLink }: { badLink: boolean }) {
  const t = useT();
  const lang = useLang();
  const index = useRegionIndex();
  const { view } = useView();
  const inSet = index.data?.regions.filter((r) => r.inSet) ?? [];
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
  useEffect(() => {
    if (index.status === 'ok' && view.region && !validRegion) flagBadLink();
  }, [index.status, view.region, validRegion, flagBadLink]);
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
    if (index.status === 'loading') return <Loading className="mx-auto max-w-[1280px] px-4 py-8" />;
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
        <StepBar steps={steps} current={step} onGo={(i) => goToStep(steps[i]?.id ?? '')} />
      </Body>
    </>
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

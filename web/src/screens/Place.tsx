// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Place (docs/04_UI.md §4.3–§4.5): the picker with contributing cells, the line-up, then the verdict.
// A 1° cell (region=cell:<row>_<col>) opens the cell page instead (exploration only).
import { lazy, Suspense, useEffect, useState } from 'react';
import { pick, tOr, useT } from '../i18n';
import { num } from '../i18n/format';
import type { Lineup, Mask, Region, Verdict } from '../data/types';
import { paths } from '../data/results';
import { useCatalog, useRegionIndex, useResult } from '../data/hooks';
import { useLang } from '../state/prefs';
import { useView } from '../state/view';
import { BadLinkNotice, Loading, WithData } from '../components/LoadState';
import { Page, PageHeader, StepBar, StepHeading, goToStep, useStepObserver } from '../components/Page';
import { PlacePicker } from '../components/PlacePicker';
import { ContributingCells, type GeoJSON } from '../components/ContributingCells';
import { LineupTable } from '../components/LineupTable';
import { VerdictView } from '../components/VerdictView';
import { Card } from '../ui/common/card';
import { SegmentedControl } from '../ui/common/toggle-group';

const CellPage = lazy(() => import('./CellPage'));

function CellsPanel({ region }: { region: Region }) {
  const t = useT();
  const lang = useLang();
  const index = useRegionIndex();
  const grids = Object.keys(region.cells);
  const [gridId, setGridId] = useState(grids[0] ?? 'merra2_native');
  const maskPath = region.cells[gridId] ?? null;
  const mask = useResult<Mask>(maskPath);
  const geom = useResult<GeoJSON>(region.geom);
  const grid = index.data?.grids.find((g) => g.id === gridId);
  const support = region.support[gridId];
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">{pick(region.name, lang)}</p>
        {grids.length > 1 ? (
          <SegmentedControl
            size="sm"
            label={t('site.place.grid_label')}
            value={gridId}
            onValueChange={setGridId}
            options={grids.map((g) => ({ value: g, label: tOr(t, `site.grid.${g}`, g) }))}
          />
        ) : null}
      </div>
      <WithData res={mask} path={maskPath ?? undefined}>
        {(m) =>
          grid ? (
            <ContributingCells
              grid={grid}
              layers={[{ mask: m, colour: 'accent', label: pick(region.name, lang), geom: geom.status === 'ok' ? geom.data : null }]}
              label={`${t('place.cells_shown')} ${support ? t('place.support', { cells: num(support.effectiveCells, lang, 1) }) : ''}`}
            />
          ) : null
        }
      </WithData>
      <p className="mt-3 text-[15px]">{t('place.cells_shown')}</p>
      {support ? (
        <p className="mt-1 text-[15px] font-medium tabular" data-testid="support-line">
          {t('place.support', { cells: num(support.effectiveCells, lang, 1) })}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-muted">{t('site.place.shade_note')}</p>
    </Card>
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
  const regionName = validRegion ? pick(validRegion.name, lang) : '';

  return (
    <Page>
      <BadLinkNotice show={badLink} />
      <PageHeader
        eyebrow={t('site.place.eyebrow')}
        title={validRegion ? t('site.place.title_region', { place: regionName }) : t('place.title')}
        lead={validRegion ? t('site.place.lead_region') : t('site.place.lead')}
      />
      <section id="step-place" className="scroll-mt-28">
        <StepHeading n={1} title={t('place.region_set')} />
        <WithData res={index}>
          {(idx) => (
            <div className={validRegion ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]' : ''}>
              <PlacePicker
                index={idx}
                value={validRegion?.id}
                compact={Boolean(validRegion)}
                linkFor={(id) => ({ screen: 'place', region: id, variable: view.variable, season: view.season })}
              />
              {validRegion ? <CellsPanel key={validRegion.id} region={validRegion} /> : null}
            </div>
          )}
        </WithData>
      </section>
      {validRegion ? (
        <>
          <section id="step-lineup" className="mt-12 scroll-mt-28">
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
          <section id="step-verdict" className="mt-12 scroll-mt-28">
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
        </>
      ) : null}
    </Page>
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

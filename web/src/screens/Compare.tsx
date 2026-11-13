// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Compare two places (docs/04_UI.md §4.6): the pair picker (pre-registered pairs first, the lead pair marked;
// other pairs are exploration), the variable and season, then the comparison.
import { useEffect, useState } from 'react';
import { ArrowLeftRight, Star } from 'lucide-react';
import { pick, useT } from '../i18n';
import type { Contrast, Lang, Mask, Pair, Region, RegionIndex } from '../data/types';
import { paths } from '../data/results';
import { useCatalog, usePrereg, useRegionIndex, useResult, useResults } from '../data/hooks';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { AnyCompareScreen, CompareModes } from '../report/AnyCompare';
import { BadLinkNotice, WithData } from '../components/LoadState';
import { Body, StepBar, StepHeading, goToStep, useStepObserver } from '../components/Page';
import { Hero } from '../components/atlas/Hero';
import { LocatorGlobe, type LocatorMark } from '../components/atlas/LocatorGlobe';
import { CompareView } from '../components/CompareView';
import { ContributingCells } from '../components/ContributingCells';
import { FamilyBadge } from '../components/StatusBadge';
import { Card } from '../ui/common/card';
import { SegmentedControl } from '../ui/common/toggle-group';
import { cn } from '../ui/common/utils';

/** The two places of a pair as globe marks: A in blue, B in gold (the colours of the pair chart). */
export function pairMarks(index: RegionIndex, pair: Pair, lang: Lang, labels = true): LocatorMark[] {
  const r = (id: string) => index.regions.find((x) => x.id === id);
  return ([
    [r(pair.a), 'link'],
    [r(pair.b), 'accent'],
  ] as [Region | undefined, LocatorMark['tone']][])
    .filter((x): x is [Region, LocatorMark['tone']] => x[0] !== undefined)
    .map(([g, tone], i) => ({ lon: g.centroid[0], lat: g.centroid[1], bbox: g.bbox, tone, label: labels ? `${i === 0 ? 'A' : 'B'} · ${pick(g.name, lang)}` : undefined }));
}

function PairPicker({ index, value }: { index: RegionIndex; value?: string }) {
  const t = useT();
  const lang = useLang();
  const view = useView((s) => s.view);
  const name = (id: string) => {
    const r = index.regions.find((x) => x.id === id);
    return r ? pick(r.name, lang) : id;
  };
  const pre = index.pairs.filter((p) => p.preRegistered).sort((a, b) => Number(b.lead) - Number(a.lead));
  const other = index.pairs.filter((p) => !p.preRegistered);
  const item = (p: Pair) => {
    const selected = p.id === value;
    return (
      <li key={p.id}>
        <a
          href={href({ screen: 'compare', pair: p.id, variable: view.variable, season: view.season })}
          aria-current={selected ? 'true' : undefined}
          data-testid={`pair-${p.id}`}
          className={cn(
            'group flex h-full items-start gap-4 rounded-card border px-4 py-4 text-ink no-underline transition-[border-color,transform,box-shadow] hover:no-underline',
            selected
              ? 'border-accent bg-accent/[0.09] shadow-[0_0_0_1px_var(--accent),var(--shadow)]'
              : 'atlas-panel border-line bg-surface hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lift',
          )}
        >
          <LocatorGlobe still bare size={92} className="shrink-0" marks={pairMarks(index, p, lang, false)} arc label={`${name(p.a)} · ${name(p.b)}`} />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[22px] leading-tight">
              <span className="mr-1 font-mono text-[12px] text-link">A</span>
              {name(p.a)} <span className="text-muted">−</span> <span className="mr-1 font-mono text-[12px] text-accent-ink">B</span>
              {name(p.b)}
            </span>
            {p.lead ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-ink px-2 py-0.5 text-xs font-semibold text-white dark:text-bg">
                <Star className="size-3" aria-hidden="true" />
                {t('site.compare.lead')}
              </span>
            ) : null}
          </span>
          <span className="text-sm text-muted">{pick(p.question, lang)}</span>
          <span className="mt-1">
            <FamilyBadge family={p.preRegistered ? 'confirmatory' : 'exploration'} />
          </span>
          </span>
        </a>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-7" data-testid="pair-picker">
      {pre.length ? (
        <section>
          <h3 className="eyebrow mb-3">{t('site.compare.prereg_pairs')}</h3>
          <ul className={cn('grid gap-3', value ? 'grid-cols-1' : 'sm:grid-cols-2')}>{pre.map(item)}</ul>
        </section>
      ) : null}
      {other.length ? (
        <section>
          <h3 className="eyebrow mb-3">{t('site.compare.other_pairs')}</h3>
          <ul className={cn('grid gap-3', value ? 'grid-cols-1' : 'sm:grid-cols-2')}>{other.map(item)}</ul>
        </section>
      ) : null}
      <p className="text-sm text-muted">{t('site.compare.cells_cannot_pair')}</p>
    </div>
  );
}

function PairCells({ pair, index }: { pair: Pair; index: RegionIndex }) {
  const t = useT();
  const lang = useLang();
  const ra = index.regions.find((r) => r.id === pair.a);
  const rb = index.regions.find((r) => r.id === pair.b);
  const gridId = 'merra2_native' in (ra?.cells ?? {}) ? 'merra2_native' : Object.keys(ra?.cells ?? {})[0];
  const grid = index.grids.find((g) => g.id === gridId);
  const masks = useResults<Mask>(ra && rb && gridId ? [ra.cells[gridId] ?? '', rb.cells[gridId] ?? ''] : null);
  if (!ra || !rb || !grid) return null;
  return (
    <Card className="p-3 sm:p-4">
      <WithData res={masks}>
        {([ma, mb]) =>
          ma && mb ? (
            <ContributingCells
              grid={grid}
              label={`${pick(ra.name, lang)} · ${pick(rb.name, lang)}: ${t('place.cells_shown')}`}
              layers={[
                { mask: ma, colour: 'link', label: `A · ${pick(ra.name, lang)}` },
                { mask: mb, colour: 'accent', label: `B · ${pick(rb.name, lang)}` },
              ]}
            />
          ) : null
        }
      </WithData>
      <p className="mt-3 px-1 text-sm text-muted">{t('site.compare.cells_note')}</p>
    </Card>
  );
}

export default function CompareScreen() {
  const anyMode = useView((s) => Boolean(s.view.a || s.view.b));
  return anyMode ? <AnyCompareScreen /> : <TestedCompareScreen />;
}

function TestedCompareScreen() {
  const t = useT();
  const lang = useLang();
  const { view, badLink, flagBadLink, patch } = useView();
  const index = useRegionIndex();
  const catalog = useCatalog();
  const prereg = usePrereg();
  const [step, setStep] = useState(0);

  const pairs = index.data?.pairs ?? [];
  const asked = pairs.find((p) => p.id === view.pair);
  const pair = asked;
  const analysed = (catalog.data?.variables ?? []).filter((v) => v.status === 'analysed');
  const seasons = prereg.data ? [prereg.data.seasons.main, ...prereg.data.seasons.secondary] : ['ANN'];
  const headline = prereg.data?.headline_cases.find((h) => h.kind === 'contrast' && h.pair === pair?.id);
  const variable = analysed.find((v) => v.id === view.variable)?.id ?? headline?.variable ?? analysed[0]?.id;
  const season = view.season && seasons.includes(view.season) ? view.season : (headline?.season ?? 'ANN');
  const path = pair && variable ? paths.contrast(variable, pair.id, season) : null;
  const contrast = useResult<Contrast>(path);

  useEffect(() => {
    if (index.status === 'ok' && view.pair && !asked) flagBadLink();
  }, [index.status, view.pair, asked, flagBadLink]);
  useEffect(() => {
    if (catalog.status === 'ok' && view.variable && !analysed.some((v) => v.id === view.variable)) flagBadLink();
  }, [catalog.status, view.variable, analysed, flagBadLink]);

  const steps = [
    { id: 'step-pair', label: t('site.compare.step_pair') },
    { id: 'step-compare', label: t('site.compare.step_result') },
  ];
  useStepObserver(
    steps.map((s) => s.id),
    setStep,
    Boolean(pair),
  );

  return (
    <>
      <Hero
        top={
          <div className="flex flex-col gap-3">
            <CompareModes any={false} />
            {badLink ? <BadLinkNotice show={badLink} /> : null}
          </div>
        }
        eyebrow={t('site.compare.eyebrow')}
        title={pair && index.data ? <VersusTitle pair={pair} index={index.data} /> : t('contrast.title')}
        lead={t('site.compare.lead_text')}
        aside={
          index.data && (pair ?? pairs[0]) ? (
            <LocatorGlobe
              marks={pairMarks(index.data, (pair ?? pairs[0]) as Pair, lang, Boolean(pair))}
              arc
              size={420}
              label={t('site.compare.locator_alt')}
            />
          ) : undefined
        }
      />
      <Body>
      <section id="step-pair" className="scroll-mt-28">
        <StepHeading n={1} title={t('site.compare.pick_pair')} />
        <WithData res={index}>
          {(idx) => (
            <div className={pair ? 'grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]' : ''}>
              <PairPicker index={idx} value={pair?.id} />
              {pair ? <PairCells pair={pair} index={idx} /> : null}
            </div>
          )}
        </WithData>
      </section>
      {pair ? (
        <section id="step-compare" className="mt-16 scroll-mt-28">
          <StepHeading n={2} title={t('site.compare.step_result_title')} />
          <div className="mb-5 flex flex-wrap items-center gap-3">
            {analysed.length > 1 ? (
              <SegmentedControl
                label={t('site.common.variable')}
                value={variable ?? ''}
                onValueChange={(v) => patch({ variable: v })}
                options={analysed.map((v) => ({ value: v.id, label: pick(v.name, lang), testId: `variable-${v.id}` }))}
              />
            ) : null}
            <SegmentedControl
              label={t('site.common.season')}
              value={season}
              onValueChange={(s) => patch({ season: s })}
              options={seasons.map((s) => ({ value: s, label: t(`season.${s}.long`), testId: `season-${s}` }))}
            />
          </div>
          {index.data ? (
            <WithData res={contrast} path={path ?? undefined}>
              {(c) => (
                <CompareView
                  key={path}
                  contrast={c}
                  path={path ?? ''}
                  index={index.data as RegionIndex}
                  catalog={catalog.data}
                  sensitivityOn={view.sensitivity === 'imerg'}
                  onSensitivity={(on) => patch({ sensitivity: on ? 'imerg' : undefined }, { replace: true })}
                />
              )}
            </WithData>
          ) : null}
          <StepBar steps={steps} current={step} onGo={(i) => goToStep(steps[i]?.id ?? '')} />
        </section>
      ) : null}
      </Body>
    </>
  );
}

/** "A − B" as the page title, each place in its chart colour. */
function VersusTitle({ pair, index }: { pair: Pair; index: RegionIndex }) {
  const lang = useLang();
  const name = (id: string) => {
    const r = index.regions.find((x) => x.id === id);
    return r ? pick(r.name, lang) : id;
  };
  return (
    <span className="flex flex-col gap-1">
      <span>{name(pair.a)}</span>
      <span className="flex items-center gap-3 text-[0.55em] text-muted">
        <ArrowLeftRight className="size-[0.9em] text-accent" aria-hidden="true" />
      </span>
      <span>{name(pair.b)}</span>
    </span>
  );
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// CompareView (docs/04_UI.md §4.6): the trend in the difference A − B is the headline; each place's own rate
// is shown beside it, never subtracted from it. Labels only when true, each with its meaning.
// A comparison never shows two significance labels side by side as its answer.
import { ArrowLeftRight, FileSearch, Scale, Scissors } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import { int, num, rate } from '../i18n/format';
import type { Catalog, Contrast, ContrastSide, Lang, RegionIndex, Verdict } from '../data/types';
import { useResult, useResults } from '../data/hooks';
import { useLang } from '../state/prefs';
import { useSpineClaim } from '../state/spine';
import { useBuild } from '../data/hooks';
import { IS_OFFLINE_BUILD } from '../data/offline';
import { DifferenceChart, PairChart } from '../charts/DifferenceChart';
import { toneColour, useTokens } from '../charts/tokens';
import { Card } from '../ui/common/card';
import { Disclosure } from '../ui/common/collapsible';
import { Switch } from '../ui/common/switch';
import { CaseFolder, Section, SentenceList } from './CaseFolder';
import { ChecksList, OverturnList } from './ChecksList';
import { ExpertPanel } from './ExpertPanel';
import { ProvenancePanel } from './ProvenancePanel';
import { FamilyBadge, StatusBadge, statusInfo } from './StatusBadge';
import { RateFigure } from './VerdictCard';
import { ChartLegend, chartText } from './VerdictView';
import { Loading, WithData } from './LoadState';

/** The parameters of contrast.side: rate, lo and hi signed, with the rate's decimals, then the units (03 §12.2). */
function sideLine(lang: Lang, s: ContrastSide, name: string, units: string) {
  const u = (x: string) => (x === '–' ? x : `${x} ${units}`);
  return {
    name,
    rate: u(s.ratePerDecade === null ? '–' : rate(s.ratePerDecade, lang)),
    lo: u(s.rateLowPerDecade === null ? '–' : rate(s.rateLowPerDecade, lang, s.ratePerDecade)),
    hi: u(s.rateHighPerDecade === null ? '–' : rate(s.rateHighPerDecade, lang, s.ratePerDecade)),
  };
}

export function ContrastLabels({ c }: { c: Contrast }) {
  const t = useT();
  const items: { key: string; title: string; meaning: string }[] = [];
  if (c.labels.ratesDiffer) items.push({ key: 'rates', title: t('site.compare.label_rates_differ'), meaning: t('site.compare.label_rates_differ_meaning') });
  if (c.labels.supportedOppositeTrends) items.push({ key: 'opp', title: t('site.compare.label_supported_opposite'), meaning: t('contrast.supported_opposite') });
  if (c.labels.oppositeFittedDirections) items.push({ key: 'fit', title: t('site.compare.label_opposite_fitted'), meaning: t('contrast.opposite_fitted') });
  if (items.length === 0) return <p className="text-[15px] text-muted">{t('site.compare.no_labels')}</p>;
  return (
    <ul data-tour="contrast-labels" data-testid="contrast-labels" className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.key} className="rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5" data-testid={`label-${i.key}`}>
          <p className="text-[15px] font-semibold">{i.title}</p>
          <p className="mt-0.5 text-[15px] text-muted">{i.meaning}</p>
        </li>
      ))}
    </ul>
  );
}

function SensitivityBlock({ c, on, onToggle, nameA, nameB }: { c: Contrast; on: boolean; onToggle: (v: boolean) => void; nameA: string; nameB: string }) {
  const t = useT();
  const lang = useLang();
  const tokens = useTokens();
  const s = c.sensitivity;
  const res = useResult<Contrast>(on && s ? s.path : null);
  if (!s) return null;
  const sentence =
    s.sameSign === null || s.rateImergPerDecade === null || s.rateMerraPerDecade === null
      ? null
      : t(s.sameSign ? 'sensitivity.same' : 'sensitivity.other', {
          from: int(s.window.first, lang),
          to: int(s.window.last, lang),
          rate_i: `${rate(s.rateImergPerDecade, lang)} ${c.difference.units}`,
          rate_m: `${rate(s.rateMerraPerDecade, lang, s.rateImergPerDecade)} ${c.difference.units}`,
        });
  return (
    <Card className="p-4 sm:p-5" data-tour="sensitivity-toggle" data-testid="sensitivity-toggle">
      <Switch checked={on} onCheckedChange={onToggle} label={t('sensitivity.toggle')} icon={<Scale className="size-5 text-exploration" aria-hidden="true" />} testId="sensitivity-switch" />
      {on ? (
        <div className="mt-4 flex flex-col gap-3">
          <h3 className="text-h3">{t('sensitivity.title')}</h3>
          <p className="text-[15px] text-muted" data-testid="sensitivity-lineage">
            {t('sensitivity.lineage')}
          </p>
          {sentence ? (
            <p className="text-[15px]" data-testid="sensitivity-sign">
              {sentence}
            </p>
          ) : null}
          <WithData res={res} path={s.path}>
            {(imerg) => {
              const text = imerg.text[lang] ?? imerg.text.en;
              const info = statusInfo(t, imerg.status, imerg.grade, imerg.reason, imerg.family);
              return (
                <div className="flex flex-col gap-3">
                  <StatusBadge status={imerg.status} grade={imerg.grade} reason={imerg.reason} family={imerg.family} />
                  <p className="text-[16px] font-medium leading-snug">{text.headline}</p>
                  <DifferenceChart
                    contrast={imerg}
                    colour={toneColour(tokens, info.tone)}
                    lang={lang}
                    label={text.headline}
                    text={{ ...chartText(t, lang), units: imerg.difference.units }}
                  />
                  <p className="text-sm text-muted">{t('contrast.estimand', { A: nameA, B: nameB })}</p>
                </div>
              );
            }}
          </WithData>
        </div>
      ) : null}
    </Card>
  );
}

export function CompareView({
  contrast: c,
  path,
  index,
  catalog,
  sensitivityOn,
  onSensitivity,
}: {
  contrast: Contrast;
  path: string;
  index: RegionIndex;
  catalog: Catalog | undefined;
  sensitivityOn: boolean;
  onSensitivity: (on: boolean) => void;
}) {
  const t = useT();
  const lang = useLang();
  const tokens = useTokens();
  const build = useBuild();
  const regionName = (id: string) => {
    const r = index.regions.find((x) => x.id === id);
    return r ? pick(r.name, lang) : id;
  };
  const nameA = regionName(c.pair.a);
  const nameB = regionName(c.pair.b);
  const variable = catalog?.variables.find((v) => v.id === c.variable);
  const varName = variable ? pick(variable.name, lang) : c.variable;
  const text = c.text[lang] ?? c.text.en;
  const info = statusInfo(t, c.status, c.grade, c.reason, c.family);
  const estimand = t('contrast.estimand', { A: nameA, B: nameB });
  useSpineClaim({ spine: c.spine, about: `${varName} · ${estimand} · ${t(`season.${c.season}.long`)}`, anchor: 'compare-card' });
  const sides = useResults<Verdict>([c.regions.a.verdict, c.regions.b.verdict]);
  const a = sideLine(lang, c.regions.a, nameA, c.difference.units);
  const b = sideLine(lang, c.regions.b, nameB, c.difference.units);
  const resultHref = !IS_OFFLINE_BUILD && build.data ? `${build.data.root.replace(/\/+$/, '')}/${path}` : null;
  const solid = c.status === 'verdict' && c.grade !== 'cant_tell_yet';
  const split = c.split;
  const mapGrid = split ? Object.entries(split.grids)[0] : undefined;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]" data-tour="compare-view" data-testid="compare-view">
      <div className="flex flex-col gap-6">
        <Card className="p-4 sm:p-6">
          <p className="font-display text-[24px] leading-tight">{t('site.compare.each_series', { variable: varName })}</p>
          <p className="mb-3 mt-1 font-mono text-[12.5px] text-muted">
            {t(`season.${c.season}.long`)} · {int(c.window.first, lang)}–{int(c.window.last, lang)}
          </p>
          <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t('site.chart.legend')}>
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 rounded-full bg-link" aria-hidden="true" />A · {nameA}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 rounded-full bg-accent" aria-hidden="true" />B · {nameB}
            </li>
          </ul>
          <WithData res={sides} loading={<Loading done={sides.done} total={sides.total} />}>
            {([va, vb]) => (va && vb ? <PairChart a={va} b={vb} nameA={nameA} nameB={nameB} lang={lang} label={`${nameA} · ${nameB}: ${varName}`} /> : null)}
          </WithData>
        </Card>
        <Card className="p-4 sm:p-6">
          <h3 className="font-display text-[24px] font-normal leading-tight" data-testid="estimand-title">
            {estimand}
          </h3>
          <p className="mb-3 mt-1 text-sm text-muted">{t('site.compare.departure_note', { from: int(c.window.first, lang), to: int(c.window.last, lang) })}</p>
          <DifferenceChart contrast={c} colour={toneColour(tokens, info.tone)} lang={lang} label={text.headline} text={{ ...chartText(t, lang), units: c.difference.units }} />
          <ChartLegend solid={solid} hasBand={Boolean(c.chart?.band)} hasBreaks={c.robustness.breaks.length > 0} colour={toneColour(tokens, info.tone)} />
        </Card>
        <SensitivityBlock c={c} on={sensitivityOn} onToggle={onSensitivity} nameA={nameA} nameB={nameB} />
      </div>
      <CaseFolder caseId={c.id} tabLabel={t('site.verdict.case')} id="compare-card" testId="compare-card" tour="verdict-card" live className="paper text-ink">
        <div className="px-5 pb-5 pt-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} grade={c.grade} reason={c.reason} family={c.family} size="stamp" />
            <FamilyBadge family={c.family} />
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            {estimand}
          </p>
          <h2 className="mt-1 text-h2 leading-snug" data-testid="compare-headline">
            {text.headline}
          </h2>
          {c.stats.change ? (
            <div className="mt-4">
              <RateFigure
                ratePerDecade={c.stats.change.ratePerDecade}
                low={c.stats.change.rateLowPerDecade}
                high={c.stats.change.rateHighPerDecade}
                units={c.stats.change.units}
                first={c.window.first}
                last={c.window.last}
                inDomain={c.domain.inDomain}
              />
            </div>
          ) : null}
        </div>
        <Section title={t('site.compare.each_place')} testId="each-place">
          <p className="text-[15px]" data-testid="contrast-side">
            {t('contrast.side', { A: a.name, rate_a: a.rate, lo_a: a.lo, hi_a: a.hi, B: b.name, rate_b: b.rate, lo_b: b.lo, hi_b: b.hi })}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {(
              [
                ['A', c.regions.a, nameA],
                ['B', c.regions.b, nameB],
              ] as const
            ).map(([k, s, n]) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-line bg-surface-2 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-[15px] font-medium">
                  <span className={k === 'A' ? 'inline-block size-2.5 rounded-full bg-link' : 'inline-block size-2.5 rounded-full bg-accent'} aria-hidden="true" />
                  {k} · {n}
                </span>
                <span className="flex items-center gap-2 text-sm tabular">
                  <span>
                    {s.ratePerDecade === null ? '–' : `${rate(s.ratePerDecade, lang)} ${c.difference.units}`}
                  </span>
                  <StatusBadge status={s.status} grade={s.grade} reason={null} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">{t('contrast.not_subtracted')}</p>
        </Section>
        <Section title={t('site.compare.labels_title')}>
          <ContrastLabels c={c} />
        </Section>
        {split && mapGrid ? (
          <Section title={t('site.compare.split_title')}>
            <p className="flex items-start gap-2 text-[15px]" data-testid="split-note">
              <Scissors className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
              <span>
                {t('site.compare.split', {
                  shared: int(mapGrid[1].sharedCells, lang),
                  a: num(mapGrid[1].effectiveCellsA, lang, 1),
                  b: num(mapGrid[1].effectiveCellsB, lang, 1),
                  grid: tOr(t, `site.grid.${mapGrid[0]}`, mapGrid[0]),
                })}
              </span>
            </p>
          </Section>
        ) : null}
        {text.howSure.length ? (
          <Section title={t('verdict.labels.how_sure')}>
            <SentenceList items={text.howSure} />
          </Section>
        ) : null}
        <Section title={t('verdict.labels.checks')}>
          <ChecksList sentences={text.checks} robustness={c.robustness} windowsLabel />
        </Section>
        {text.practical.length ? (
          <Section title={t('verdict.labels.practical')}>
            <SentenceList items={text.practical} />
          </Section>
        ) : null}
        {c.status === 'verdict' && text.overturn.length ? (
          <Section title={t('verdict.labels.overturn')}>
            <OverturnList items={text.overturn} />
          </Section>
        ) : null}
        {text.notes.length ? (
          <Section title={t('verdict.labels.notes')}>
            <SentenceList items={text.notes} className="text-muted" />
          </Section>
        ) : null}
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-6">
          <Disclosure title={t('verdict.labels.provenance')} icon={<FileSearch className="size-5 text-muted" aria-hidden="true" />} testId="provenance-disclosure">
            <ProvenancePanel provenance={c.provenance} window={c.window} used={c.stats.n} missing={c.robustness.gaps.missingYears.length} resultPath={path} />
          </Disclosure>
          <ExpertPanel stats={c.stats} domain={c.domain.checks} units={c.difference.units} inDomain={c.domain.inDomain} resultHref={resultHref} />
        </div>
      </CaseFolder>
    </div>
  );
}

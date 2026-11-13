// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// VerdictCard (docs/04_UI.md §4.5). Top to bottom: status badge, headline, how much, how sure, can we break it,
// is it big enough to matter, what would overturn this claim (verdicts only), notes, provenance, for experts.
// Every sentence is the engine's, in the current language; the card computes nothing.
import { useT } from '../i18n';
import { int, rate } from '../i18n/format';
import type { Verdict } from '../data/types';
import { useLang } from '../state/prefs';
import { useBuild } from '../data/hooks';
import { IS_OFFLINE_BUILD } from '../data/offline';
import { Disclosure } from '../ui/common/collapsible';
import { CaseFolder, Section, SentenceList } from './CaseFolder';
import { ChecksList, OverturnList } from './ChecksList';
import { ExpertPanel } from './ExpertPanel';
import { ProvenancePanel } from './ProvenancePanel';
import { FamilyBadge, StatusBadge } from './StatusBadge';
import { FileSearch } from 'lucide-react';

/** The rate in tabular figures, with its 95% range (inside the validated domain only) and span. */
export function RateFigure({
  ratePerDecade,
  low,
  high,
  units,
  first,
  last,
  inDomain,
}: {
  ratePerDecade: number | null;
  low: number | null;
  high: number | null;
  units: string;
  first: number;
  last: number;
  inDomain: boolean;
}) {
  const t = useT();
  const lang = useLang();
  if (ratePerDecade === null) return null;
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-1" data-testid="rate-figure">
      <p className="m-0">
        <span className="font-display text-[46px] leading-none tabular">{rate(ratePerDecade, lang)}</span>{' '}
        <span className="ml-1 text-[15px] text-muted">
          {units} {t('verdict.labels.rate_short')}
        </span>
      </p>
      {inDomain && low !== null && high !== null ? (
        <p className="m-0 pb-0.5 text-[15px] text-muted tabular" data-testid="rate-range">
          {t('verdict.labels.ci')}: {rate(low, lang, ratePerDecade)} … {rate(high, lang, ratePerDecade)}
        </p>
      ) : null}
      <p className="m-0 pb-0.5 text-[15px] text-muted tabular">
        {int(first, lang)}–{int(last, lang)}
      </p>
    </div>
  );
}

export function VerdictCard({ verdict, path, about }: { verdict: Verdict; path: string; about: string }) {
  const t = useT();
  const lang = useLang();
  const build = useBuild();
  const text = verdict.text[lang] ?? verdict.text.en;
  const isVerdict = verdict.status === 'verdict';
  // Both counts are read from the file: n years used, and the list of missing years.
  const used = verdict.stats.n;
  const missing = verdict.robustness.gaps.missingYears.length;
  const resultHref = !IS_OFFLINE_BUILD && build.data ? `${build.data.root.replace(/\/+$/, '')}/${path}` : null;
  const change = verdict.stats.change;
  return (
    <CaseFolder caseId={verdict.id} tabLabel={t('site.verdict.case')} testId="verdict-card" tour="verdict-card" id="verdict-card" live className="paper text-ink">
      <div className="px-5 pb-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={verdict.status} grade={verdict.grade} reason={verdict.reason} family={verdict.family} size="stamp" />
          <FamilyBadge family={verdict.family} />
        </div>
        <p className="mt-3 text-sm text-muted">{about}</p>
        <h2 className="mt-1 text-h2 leading-snug" data-testid="verdict-headline">
          {text.headline}
        </h2>
        {change ? (
          <div className="mt-4">
            <RateFigure
              ratePerDecade={change.ratePerDecade}
              low={change.rateLowPerDecade}
              high={change.rateHighPerDecade}
              units={change.units}
              first={verdict.window.first}
              last={verdict.window.last}
              inDomain={verdict.domain.inDomain}
            />
          </div>
        ) : null}
      </div>
      {text.howMuch.length ? (
        <Section title={t('verdict.labels.how_much')} testId="how-much">
          <SentenceList items={text.howMuch} />
        </Section>
      ) : null}
      {text.howSure.length ? (
        <Section title={t('verdict.labels.how_sure')} testId="how-sure">
          <SentenceList items={text.howSure} />
        </Section>
      ) : null}
      <Section title={t('verdict.labels.checks')} testId="checks">
        <ChecksList sentences={text.checks} robustness={verdict.robustness} windowsLabel />
      </Section>
      {text.practical.length ? (
        <Section title={t('verdict.labels.practical')} testId="practical">
          <SentenceList items={text.practical} />
        </Section>
      ) : null}
      {isVerdict && text.overturn.length ? (
        <Section title={t('verdict.labels.overturn')} testId="overturn">
          <OverturnList items={text.overturn} />
        </Section>
      ) : null}
      {text.notes.length ? (
        <Section title={t('verdict.labels.notes')} testId="notes">
          <SentenceList items={text.notes} className="text-muted" />
        </Section>
      ) : null}
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-6">
        <Disclosure title={t('verdict.labels.provenance')} icon={<FileSearch className="size-5 text-muted" aria-hidden="true" />} testId="provenance-disclosure" defaultOpen={false}>
          <ProvenancePanel provenance={verdict.provenance} window={verdict.window} used={used} missing={missing} resultPath={path} />
        </Disclosure>
        <ExpertPanel stats={verdict.stats} domain={verdict.domain.checks} units={verdict.variable.units} inDomain={verdict.domain.inDomain} resultHref={resultHref} />
      </div>
    </CaseFolder>
  );
}

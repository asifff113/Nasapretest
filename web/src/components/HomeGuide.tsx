// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The parts that used to sit below the globe on the home page: the lead case, how a case works, and the words the
// verdicts use. The home page is now the globe alone; these live on the Watch and About pages.
import { CircleCheck, CircleHelp, Compass, MapPin, Play, ShieldCheck, Scale, ArrowLeftRight, HelpCircle } from 'lucide-react';
import { pick, useT } from '../i18n';
import type { CaseFile, Contrast, Lineup, Verdict } from '../data/types';
import { caseResultPath } from '../data/cases';
import { useResult } from '../data/hooks';
import { useLang } from '../state/prefs';
import { href } from '../state/view';
import { Sparkline } from '../charts/Sparkline';
import { toneColour, useTokens } from '../charts/tokens';
import { CaseFolder } from './CaseFolder';
import { StatusBadge, statusInfo } from './StatusBadge';
import { buttonVariants } from '../ui/common/button';
import { Skeleton } from '../ui/common/skeleton';
import { cn } from '../ui/common/utils';

export function LeadCase({ c }: { c: CaseFile }) {
  const t = useT();
  const lang = useLang();
  const tokens = useTokens();
  const path = caseResultPath(c);
  const res = useResult<Contrast | Verdict | Lineup>(path);
  const r = res.data && 'chart' in res.data ? (res.data as Contrast | Verdict) : null;
  const info = r ? statusInfo(t, r.status, r.grade, r.reason, r.family) : null;
  const years = r ? ('difference' in r ? r.difference.years : r.series.years) : [];
  return (
    <CaseFolder caseId={c.id} tabLabel={t('site.home.lead_case')} testId="lead-case">
      <div className="p-5 sm:p-6">
        {r && info ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} grade={r.grade} reason={r.reason} family={r.family} />
          </div>
        ) : null}
        <h2 className="text-h3 leading-snug">{pick(c.title, lang)}</h2>
        {c.summary ? <p className="mt-2 text-[15px] text-muted">{pick(c.summary, lang)}</p> : null}
        <div className="mt-4 rounded-[8px] border border-line bg-surface-2 p-2">
          {r && r.chart && info ? (
            <Sparkline years={years} chart={r.chart} colour={toneColour(tokens, info.tone)} solid={r.status === 'verdict' && r.grade !== 'cant_tell_yet'} zero={'difference' in r} className="h-24 w-full" />
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
          {r && 'difference' in r ? <p className="mt-1 px-1 text-xs text-muted">{t('site.home.spark_caption')}</p> : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={href({ screen: 'watch', case: c.id })} className={buttonVariants({ variant: 'accent' })} data-testid="lead-case-play">
            <Play aria-hidden="true" />
            {t('site.home.play_case')}
          </a>
          {c.uses.kind === 'contrast' ? (
            <a href={href({ screen: 'compare', pair: c.uses.pair, variable: c.uses.variable, season: c.uses.season })} className={buttonVariants({ variant: 'outline' })}>
              {t('site.home.open_evidence')}
            </a>
          ) : null}
        </div>
      </div>
    </CaseFolder>
  );
}

export function GradeLegend() {
  const t = useT();
  const rows = [
    { icon: ShieldCheck, tone: 'text-strong', name: t('grade.strong.name'), desc: t('grade.strong.desc') },
    { icon: CircleCheck, tone: 'text-supported', name: t('grade.supported.name'), desc: t('grade.supported.desc') },
    { icon: CircleHelp, tone: 'text-canttell', name: t('grade.cant_tell_yet.name'), desc: t('grade.cant_tell_yet.desc') },
    { icon: Compass, tone: 'text-exploration', name: t('family.exploration'), desc: t('glossary.exploration') },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.name} className="flex gap-3 rounded-[10px] border border-line bg-surface p-4">
          <r.icon className={cn('mt-0.5 size-5 shrink-0', r.tone)} aria-hidden="true" />
          <div>
            <p className="font-semibold">{r.name}</p>
            <p className="mt-0.5 text-[15px] text-muted">{r.desc}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const STEPS = [
  { icon: HelpCircle, key: 'question' },
  { icon: MapPin, key: 'place' },
  { icon: Scale, key: 'verdict' },
  { icon: ArrowLeftRight, key: 'compare' },
] as const;

/** How a case works, in four steps. */
export function HowItWorks() {
  const t = useT();
  return (
    <section aria-labelledby="how-title">
      <h2 id="how-title" className="text-h2">
        {t('site.home.how_title')}
      </h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.key} className="relative rounded-[10px] border border-line bg-surface p-5">
            <span className="font-mono text-[13px] font-medium text-accent-ink">{String(i + 1).padStart(2, '0')}</span>
            <s.icon className="mt-3 size-6 text-ink" aria-hidden="true" />
            <h3 className="mt-3 font-semibold">{t(`site.home.step_${s.key}_title`)}</h3>
            <p className="mt-1 text-[15px] text-muted">{t(`site.home.step_${s.key}_body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The words the verdicts use, beside their meaning. */
export function WordsWeUse() {
  const t = useT();
  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-labelledby="words-title">
      <div>
        <h2 id="words-title" className="text-h2">
          {t('site.home.words_title')}
        </h2>
        <p className="mt-2 max-w-[48ch] text-[17px] text-muted">{t('site.home.words_body')}</p>
      </div>
      <GradeLegend />
    </section>
  );
}

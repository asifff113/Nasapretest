// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Home (docs/04_UI.md §4.1): hero, learning goal, three buttons, the lead case card, and the way to the map.
// Everything ships with the build: no background video and no image from another site.
import { ArrowRight, CircleCheck, CircleHelp, Compass, MapPin, Play, ShieldCheck, Scale, ArrowLeftRight, HelpCircle } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { pick, useT } from '../i18n';
import type { CaseFile, Contrast, Lineup, Verdict } from '../data/types';
import { caseResultPath, pickLeadCase, useCases } from '../data/cases';
import { usePrereg, useResult } from '../data/hooks';
import { IS_OFFLINE_BUILD } from '../data/offline';
import { useLang } from '../state/prefs';
import { href } from '../state/view';
import { Sparkline } from '../charts/Sparkline';
import { toneColour, useTokens } from '../charts/tokens';
import { CaseFolder } from '../components/CaseFolder';
import { StatusBadge, statusInfo } from '../components/StatusBadge';
import { OfflineList } from './Offline';

const GlobeExplorer = lazy(() => import('../explore/GlobeExplorer').then((m) => ({ default: m.GlobeExplorer })));
import { buttonVariants } from '../ui/common/button';
import { Skeleton } from '../ui/common/skeleton';
import { cn } from '../ui/common/utils';

function LeadCase({ c }: { c: CaseFile }) {
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

function GradeLegend() {
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

export function Home() {
  const t = useT();
  const reduce = useReducedMotion();
  const { cases } = useCases();
  const prereg = usePrereg();
  const lead = cases.data ? pickLeadCase(cases.data, prereg.data) : undefined;
  const fade = (i: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: 0.06 * i, ease: [0.2, 0.8, 0.2, 1] as const } };
  const intro = (
    <div className="flex flex-col gap-3">
      <motion.p {...fade(0)} className="eyebrow">
        {t('app.tagline')}
      </motion.p>
      <motion.h1 {...fade(1)} className="text-[clamp(36px,3.2vw+12px,54px)] leading-[1.02]">
        {t('home.hero_title')}
      </motion.h1>
      <motion.p {...fade(2)} className="text-[16px] leading-relaxed text-muted">
        {t('site.home.globe_lead')}
      </motion.p>
      <motion.p {...fade(3)} className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
        <a href="#/compare" className="inline-flex min-h-9 items-center gap-1.5 font-medium" data-testid="cta-compare">
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          {t('home.cta_compare')}
        </a>
        <a href={lead ? href({ screen: 'watch', case: lead.id }) : '#/watch'} className="inline-flex min-h-9 items-center gap-1.5 font-medium" data-testid="cta-watch">
          <Play className="size-4" aria-hidden="true" />
          {t('home.cta_watch')}
        </a>
        <a href="#/question" className="inline-flex min-h-9 items-center gap-1.5 font-medium" data-testid="cta-start">
          {t('home.cta_start')}
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      </motion.p>
    </div>
  );
  return (
    <>
      {IS_OFFLINE_BUILD ? null : (
        <Suspense fallback={<div className="dark grid h-[620px] place-items-center bg-ocean font-mono text-xs uppercase tracking-[0.12em] text-muted">{t('site.explore.loading')}</div>}>
          <GlobeExplorer mode="home" intro={intro} />
        </Suspense>
      )}
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-10 sm:px-6">
      <section className="grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14" aria-labelledby="lead-title">
        <div>
          <p className="eyebrow mb-3">{t('site.home.lead_case')}</p>
          <h2 id="lead-title" className="text-h1 max-w-[18ch]">
            {IS_OFFLINE_BUILD ? t('home.hero_title') : t('site.home.lead_title')}
          </h2>
          <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted">{t('home.hero_body')}</p>
          <p className="mt-4 max-w-[56ch] border-l-2 border-accent pl-4 text-[16px] leading-relaxed">{t('home.learning_goal')}</p>
        </div>
        <motion.div {...fade(3)}>{lead ? <LeadCase c={lead} /> : <Skeleton className="h-[360px] w-full rounded-[10px]" />}</motion.div>
      </section>

      {IS_OFFLINE_BUILD ? (
        <section className="border-t border-line py-12">
          <h2 className="text-h2">{t('offline.title')}</h2>
          <p className="mb-5 mt-1 text-muted">{t('offline.intro')}</p>
          <OfflineList />
        </section>
      ) : null}

      <section className="border-t border-line py-12" aria-labelledby="how-title">
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

      <section className="grid gap-8 border-t border-line py-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-labelledby="words-title">
        <div>
          <h2 id="words-title" className="text-h2">
            {t('site.home.words_title')}
          </h2>
          <p className="mt-2 max-w-[48ch] text-[17px] text-muted">{t('site.home.words_body')}</p>
        </div>
        <GradeLegend />
      </section>

    </div>
    </>
  );
}

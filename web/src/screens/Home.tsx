// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Home (docs/04_UI.md §4.1): hero, learning goal, three buttons, the lead case card, and the way to the map.
// Everything ships with the build: no background video and no image from another site.
import { ArrowRight, CircleCheck, CircleHelp, Compass, Grid3x3, MapPin, Play, ShieldCheck, Scale, ArrowLeftRight, HelpCircle } from 'lucide-react';
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
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-10 sm:px-6">
      <section className="grid items-center gap-10 pb-12 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14 lg:pt-20">
        <div>
          <motion.p {...fade(0)} className="eyebrow mb-4">
            {t('app.tagline')}
          </motion.p>
          <motion.h1 {...fade(1)} className="max-w-[16ch] text-[clamp(34px,5vw+10px,60px)] font-bold leading-[1.02] tracking-[-0.03em]">
            {t('home.hero_title')}
          </motion.h1>
          <motion.p {...fade(2)} className="mt-5 max-w-[56ch] text-[18px] leading-relaxed text-muted">
            {t('home.hero_body')}
          </motion.p>
          <motion.p {...fade(3)} className="mt-4 max-w-[56ch] border-l-2 border-accent pl-4 text-[16px] leading-relaxed">
            {t('home.learning_goal')}
          </motion.p>
          <motion.div {...fade(4)} className="mt-7 flex flex-wrap gap-3">
            <a href="#/question" className={buttonVariants({ variant: 'primary', size: 'lg' })} data-testid="cta-start">
              {t('home.cta_start')}
              <ArrowRight aria-hidden="true" />
            </a>
            <a href="#/compare" className={buttonVariants({ variant: 'outline', size: 'lg' })} data-testid="cta-compare">
              <ArrowLeftRight aria-hidden="true" />
              {t('home.cta_compare')}
            </a>
            <a href={lead ? href({ screen: 'watch', case: lead.id }) : '#/watch'} className={buttonVariants({ variant: 'ghost', size: 'lg' })} data-testid="cta-watch">
              <Play aria-hidden="true" />
              {t('home.cta_watch')}
            </a>
          </motion.div>
        </div>
        <motion.div {...fade(3)} className="lg:pl-4">
          {lead ? <LeadCase c={lead} /> : <Skeleton className="h-[360px] w-full rounded-[10px]" />}
        </motion.div>
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

      {!IS_OFFLINE_BUILD ? (
        <section className="border-t border-line py-12">
          <a
            href="#/map"
            className="group grid items-center gap-6 overflow-hidden rounded-[14px] border border-line bg-surface p-6 text-ink no-underline shadow-card transition-shadow hover:no-underline hover:shadow-lift sm:grid-cols-[1fr_auto] sm:p-8"
            data-testid="home-map-link"
          >
            <div>
              <p className="eyebrow">{t('map.label')}</p>
              <h2 className="mt-2 text-h2">{t('site.home.where_title')}</h2>
              <p className="mt-2 max-w-[56ch] text-[16px] text-muted">{t('site.home.where_body')}</p>
              <span className="mt-4 inline-flex items-center gap-2 font-semibold text-link">
                <Grid3x3 className="size-5" aria-hidden="true" />
                {t('site.home.open_map')}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </div>
            <MapTeaser />
          </a>
        </section>
      ) : null}
    </div>
  );
}

/** A decorative grid in the map's own colours and hatching; it carries no data. */
function MapTeaser() {
  const cells = Array.from({ length: 8 * 14 }, (_, i) => i);
  return (
    <div className="hidden grid-cols-[repeat(14,14px)] gap-[2px] sm:grid" aria-hidden="true">
      {cells.map((i) => {
        const r = Math.floor(i / 14);
        const c = i % 14;
        const v = Math.sin(r * 0.9 + c * 0.45) + Math.cos(c * 0.3 - r * 0.6);
        const hatch = (r * 7 + c * 3) % 11 === 0;
        return (
          <span
            key={i}
            className={cn('size-[14px] rounded-[2px]', hatch && 'hatch')}
            style={hatch ? undefined : { background: v > 0 ? `color-mix(in srgb, var(--no-verdict) ${Math.min(85, 25 + v * 30)}%, var(--surface))` : `color-mix(in srgb, var(--link) ${Math.min(85, 25 - v * 30)}%, var(--surface))` }}
          />
        );
      })}
    </div>
  );
}

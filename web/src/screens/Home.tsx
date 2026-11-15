// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Home (docs/04_UI.md §4.1): the globe alone, full screen, with the site's question floating beside it and three
// ways in. The lead case, how a case works and the words we use live on their own pages (Watch, About), reached
// from the menu, so a phone opens straight onto the globe. The offline file has no globe: it keeps the lead case
// and the cases saved on this device.
import { ArrowLeftRight, ArrowRight, HelpCircle, Play } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useT } from '../i18n';
import { pickLeadCase, useCases } from '../data/cases';
import { usePrereg } from '../data/hooks';
import { IS_OFFLINE_BUILD } from '../data/offline';
import { href } from '../state/view';
import { HowItWorks, LeadCase, WordsWeUse } from '../components/HomeGuide';
import { OfflineList } from './Offline';
import { Skeleton } from '../ui/common/skeleton';
import { cn } from '../ui/common/utils';

const GlobeExplorer = lazy(() => import('../explore/GlobeExplorer').then((m) => ({ default: m.GlobeExplorer })));

const pill = 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/15 bg-[#0a1e38]/70 px-3.5 text-[13.5px] font-semibold text-ink no-underline backdrop-blur-xl hover:border-accent hover:no-underline';

export function Home() {
  const t = useT();
  const reduce = useReducedMotion();
  const { cases } = useCases();
  const prereg = usePrereg();
  const lead = cases.data ? pickLeadCase(cases.data, prereg.data) : undefined;
  const fade = (i: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.08 * i, ease: [0.2, 0.8, 0.2, 1] as const } };

  if (IS_OFFLINE_BUILD) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-10 sm:px-6">
        <section className="grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14" aria-labelledby="lead-title">
          <div>
            <p className="eyebrow mb-3">{t('site.home.lead_case')}</p>
            <h1 id="lead-title" className="text-h1 max-w-[18ch]">
              {t('home.hero_title')}
            </h1>
            <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted">{t('home.hero_body')}</p>
            <p className="mt-4 max-w-[56ch] border-l-2 border-accent pl-4 text-[16px] leading-relaxed">{t('home.learning_goal')}</p>
            <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
              <a href="#/question" className="inline-flex min-h-9 items-center gap-1.5 font-medium" data-testid="cta-start">
                {t('home.cta_start')}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </p>
          </div>
          <div>{lead ? <LeadCase c={lead} /> : <Skeleton className="h-[360px] w-full rounded-[10px]" />}</div>
        </section>
        <section className="border-t border-line py-12">
          <h2 className="text-h2">{t('offline.title')}</h2>
          <p className="mb-5 mt-1 text-muted">{t('offline.intro')}</p>
          <OfflineList />
        </section>
        <div className="border-t border-line py-12">
          <HowItWorks />
        </div>
        <div className="border-t border-line py-12">
          <WordsWeUse />
        </div>
      </div>
    );
  }

  const intro = (
    <div className="flex flex-col gap-3">
      <motion.p {...fade(0)} className="eyebrow m-0 hidden sm:block">
        {t('app.tagline')}
      </motion.p>
      <motion.h1 {...fade(1)} className="m-0 text-[clamp(26px,3.2vw+12px,56px)] leading-[1.02]">
        {t('home.hero_title')}
      </motion.h1>
      <motion.p {...fade(2)} className="m-0 hidden text-[16px] leading-relaxed text-ink/85 sm:block">
        {t('site.home.globe_lead')}
      </motion.p>
      <motion.p {...fade(3)} className="m-0 flex flex-wrap gap-2 pt-1">
        <a href="#/question" className={cn(pill, 'border-accent/70 bg-accent text-ocean hover:brightness-110')} data-testid="cta-start">
          <HelpCircle className="size-4" aria-hidden="true" />
          {t('home.cta_start')}
        </a>
        <a href={lead ? href({ screen: 'watch', case: lead.id }) : '#/watch'} className={pill} data-testid="cta-watch">
          <Play className="size-4" aria-hidden="true" />
          {t('home.cta_watch')}
        </a>
        <a href="#/compare" className={pill} data-testid="cta-compare">
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          {t('home.cta_compare')}
        </a>
      </motion.p>
    </div>
  );
  return (
    <Suspense fallback={<div className="dark grid h-[calc(100dvh-var(--header-h))] place-items-center bg-[#020812] font-mono text-xs uppercase tracking-[0.12em] text-muted">{t('site.explore.loading')}</div>}>
      <GlobeExplorer mode="home" intro={intro} />
    </Suspense>
  );
}

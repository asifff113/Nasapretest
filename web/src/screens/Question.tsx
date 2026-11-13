// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Question (docs/04_UI.md §4.2) in the atlas look: question tiles from the catalog, each with the icon of its
// first record and a small drawing of its flow (one place over time, or two places compared). A tile opens its
// shortlist: one record card per variable with why it fits. Deferred variables show their cards greyed.
import { useEffect } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import type { Catalog, CatalogQuestion } from '../data/types';
import { useCatalog } from '../data/hooks';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { BadLinkNotice, WithData } from '../components/LoadState';
import { Body, StepHeading } from '../components/Page';
import { Hero } from '../components/atlas/Hero';
import { GroupIcon } from '../components/atlas/icons';
import { RecordCard } from '../components/RecordCard';
import { buttonVariants } from '../ui/common/button';
import { cn } from '../ui/common/utils';

/** A small drawing of a flow: a line through time at one place, or two places joined by an arc. */
function FlowGlyph({ flow }: { flow: string }) {
  if (flow === 'compare') {
    return (
      <svg viewBox="0 0 64 28" className="h-7 w-16" aria-hidden="true">
        <path d="M10 20 Q32 -2 54 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
        <circle cx="10" cy="20" r="4" fill="var(--accent)" />
        <circle cx="54" cy="20" r="4" fill="var(--grade-strong)" />
      </svg>
    );
  }
  if (flow === 'place') {
    return (
      <svg viewBox="0 0 64 28" className="h-7 w-16" aria-hidden="true">
        <polyline points="4,22 14,19 22,21 30,15 38,16 46,10 54,11 60,6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="4" y1="23" x2="60" y2="7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 28" className="h-7 w-16" aria-hidden="true">
      <line x1="4" y1="14" x2="60" y2="14" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 4" />
    </svg>
  );
}

function QuestionCard({ q, n, catalog, selected }: { q: CatalogQuestion; n: number; catalog: Catalog; selected: boolean }) {
  const lang = useLang();
  const t = useT();
  const first = catalog.variables.find((v) => v.id === (q.shortlist[0]?.variable ?? q.also_deferred?.[0]));
  const later = q.flow === 'none';
  return (
    <a
      href={href({ screen: 'question', question: q.id })}
      aria-current={selected ? 'true' : undefined}
      data-tour={`question-card-${q.id}`}
      data-testid={`question-card-${q.id}`}
      className={cn(
        'group relative flex h-full min-h-[190px] flex-col rounded-card border p-5 text-ink no-underline transition-[border-color,transform,box-shadow] hover:no-underline',
        selected
          ? 'border-accent bg-accent/[0.09] shadow-[0_0_0_1px_var(--accent),var(--shadow-lg)]'
          : later
            ? 'border-dashed border-line-strong hover:border-accent/50'
            : 'atlas-panel border-line bg-surface hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lift',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'inline-flex size-11 items-center justify-center rounded-full border',
            selected ? 'border-accent bg-accent text-ocean' : 'border-accent/40 bg-accent/10 text-accent-ink',
          )}
        >
          {later ? <Lock className="size-5" aria-hidden="true" /> : <GroupIcon group={first?.group} className="size-5" />}
        </span>
        <span className="font-mono text-[12px] tracking-[0.12em] text-muted" aria-hidden="true">
          {int(n, lang).padStart(2, int(0, lang))}
        </span>
      </span>
      <span className="mt-4 block font-display text-[25px] leading-[1.12]">{pick(q.question, lang)}</span>
      <span className="mt-auto flex items-center justify-between gap-3 pt-4 text-muted">
        <span className="text-sm">{t(`site.question.flow_${q.flow}`)}</span>
        <FlowGlyph flow={q.flow} />
      </span>
    </a>
  );
}

function Shortlist({ q, catalog }: { q: CatalogQuestion; catalog: Catalog }) {
  const t = useT();
  const lang = useLang();
  const vars = q.shortlist.map((s) => ({ v: catalog.variables.find((x) => x.id === s.variable), why: s.why })).filter((x) => x.v);
  const deferred = (q.also_deferred ?? []).map((id) => catalog.variables.find((x) => x.id === id)).filter((v) => v !== undefined);
  useEffect(() => {
    const el = document.getElementById('shortlist-title');
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }, []);
  const first = q.shortlist[0]?.variable;
  const next =
    q.flow === 'place'
      ? { screen: 'place' as const, variable: first }
      : q.flow === 'compare'
        ? { screen: 'compare' as const, variable: first }
        : null;
  return (
    <section aria-labelledby="shortlist-title" className="mt-16 scroll-mt-28" data-testid="shortlist">
      <StepHeading n={2} title={<span id="shortlist-title">{t('question.shortlist')}</span>} />
      <blockquote className="m-0 mb-8 max-w-[40ch] border-l-2 border-accent pl-5 font-display text-[clamp(26px,2vw+16px,38px)] leading-[1.12]">
        {pick(q.question, lang)}
      </blockquote>
      {vars.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {vars.map(({ v, why }) => (v ? <RecordCard key={v.id} variable={v} why={pick(why, lang)} /> : null))}
        </div>
      ) : null}
      {next ? (
        <a href={href(next)} className={cn(buttonVariants({ variant: 'accent', size: 'lg' }), 'mt-8')} data-testid="question-next">
          {q.flow === 'compare' ? t('site.question.start_compare') : t('question.start')}
          <ArrowRight aria-hidden="true" />
        </a>
      ) : null}
      {deferred.length ? (
        <div className="mt-14">
          <h3 className="font-display text-[26px] font-normal">{t('question.deferred_title')}</h3>
          <p className="mb-5 mt-1 max-w-[70ch] text-[15px] text-muted">{t('site.question.deferred_note')}</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {deferred.map((v) => (v ? <RecordCard key={v.id} variable={v} /> : null))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** The route of a case, drawn beside the page head: ask, choose a place, read the verdict, compare. */
function Route() {
  const t = useT();
  const steps = ['question', 'place', 'verdict', 'compare'];
  return (
    <ol className="relative m-0 flex w-full max-w-[360px] list-none flex-col gap-0 p-0" aria-label={t('site.home.how_title')}>
      <span className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-accent via-line-strong to-transparent" aria-hidden="true" />
      {steps.map((s, i) => (
        <li key={s} className="relative flex gap-4 py-3">
          <span
            className={cn(
              'relative z-10 inline-flex size-10 shrink-0 items-center justify-center rounded-full border font-mono text-[12px]',
              i === 0 ? 'border-accent bg-accent text-ocean' : 'border-line-strong bg-bg text-muted',
            )}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <span className="pt-1">
            <span className="block font-semibold">{t(`site.home.step_${s}_title`)}</span>
            <span className="mt-0.5 block text-[14px] leading-snug text-muted">{t(`site.home.step_${s}_body`)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function QuestionScreen() {
  const t = useT();
  const { view, badLink, flagBadLink } = useView();
  const catalog = useCatalog();
  const selected = catalog.data?.questions.find((q) => q.id === view.question);
  useEffect(() => {
    if (catalog.status === 'ok' && view.question && !selected) flagBadLink();
  }, [catalog.status, view.question, selected, flagBadLink]);
  return (
    <>
      <Hero
        top={badLink ? <BadLinkNotice show={badLink} /> : undefined}
        eyebrow={t('site.question.eyebrow')}
        title={t('question.title')}
        lead={t('site.question.lead')}
        aside={<Route />}
      />
      <Body>
        <WithData res={catalog}>
          {(c) => (
            <>
              <section aria-labelledby="questions-title">
                <StepHeading n={1} title={<span id="questions-title">{t('question.pick')}</span>} />
                <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {c.questions.map((q, i) => (
                    <li key={q.id}>
                      <QuestionCard q={q} n={i + 1} catalog={c} selected={q.id === selected?.id} />
                    </li>
                  ))}
                </ul>
              </section>
              {selected ? <Shortlist key={selected.id} q={selected} catalog={c} /> : null}
            </>
          )}
        </WithData>
      </Body>
    </>
  );
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Question (docs/04_UI.md §4.2): question cards from the catalog. Each opens its shortlist: one row per variable
// with why it fits and its record card. Deferred variables show their cards greyed.
import { useEffect } from 'react';
import { ArrowRight, CircleHelp, FolderOpen } from 'lucide-react';
import { pick, useT } from '../i18n';
import type { Catalog, CatalogQuestion } from '../data/types';
import { useCatalog } from '../data/hooks';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { BadLinkNotice, WithData } from '../components/LoadState';
import { Page, PageHeader, StepHeading } from '../components/Page';
import { RecordCard } from '../components/RecordCard';
import { buttonVariants } from '../ui/common/button';
import { cn } from '../ui/common/utils';

function QuestionCard({ q, selected }: { q: CatalogQuestion; selected: boolean }) {
  const lang = useLang();
  const t = useT();
  return (
    <a
      href={href({ screen: 'question', question: q.id })}
      aria-current={selected ? 'true' : undefined}
      data-tour={`question-card-${q.id}`}
      data-testid={`question-card-${q.id}`}
      className={cn(
        'group relative flex h-full min-h-[92px] items-start gap-3 rounded-[10px] border px-4 py-4 text-ink no-underline transition-[border-color,background-color,box-shadow] hover:no-underline',
        selected ? 'border-accent bg-accent-soft shadow-card' : 'border-line bg-surface hover:border-line-strong hover:shadow-card',
      )}
    >
      <span className={cn('mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[8px]', selected ? 'bg-accent-ink text-white dark:text-bg' : 'bg-surface-2 text-accent-ink')}>
        {selected ? <FolderOpen className="size-5" aria-hidden="true" /> : <CircleHelp className="size-5" aria-hidden="true" />}
      </span>
      <span className="flex-1">
        <span className="block text-[17px] font-semibold leading-snug">{pick(q.question, lang)}</span>
        <span className="mt-1 block text-sm text-muted">{t(`site.question.flow_${q.flow}`)}</span>
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
    <section aria-labelledby="shortlist-title" className="mt-12" data-testid="shortlist">
      <StepHeading n={2} title={<span id="shortlist-title">{t('question.shortlist')}</span>} />
      <p className="-mt-2 mb-5 max-w-[68ch] text-[17px] font-medium">{pick(q.question, lang)}</p>
      {vars.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {vars.map(({ v, why }) => (v ? <RecordCard key={v.id} variable={v} why={pick(why, lang)} /> : null))}
        </div>
      ) : null}
      {next ? (
        <a href={href(next)} className={cn(buttonVariants({ variant: 'accent', size: 'lg' }), 'mt-6')} data-testid="question-next">
          {q.flow === 'compare' ? t('site.question.start_compare') : t('question.start')}
          <ArrowRight aria-hidden="true" />
        </a>
      ) : null}
      {deferred.length ? (
        <div className="mt-10">
          <h3 className="text-h3">{t('question.deferred_title')}</h3>
          <p className="mb-4 mt-1 text-[15px] text-muted">{t('site.question.deferred_note')}</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {deferred.map((v) => (v ? <RecordCard key={v.id} variable={v} /> : null))}
          </div>
        </div>
      ) : null}
    </section>
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
    <Page>
      <BadLinkNotice show={badLink} />
      <PageHeader eyebrow={t('site.question.eyebrow')} title={t('question.title')} lead={t('site.question.lead')} />
      <WithData res={catalog}>
        {(c) => (
          <>
            <section aria-labelledby="questions-title">
              <StepHeading n={1} title={<span id="questions-title">{t('question.pick')}</span>} />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {c.questions.map((q) => (
                  <li key={q.id}>
                    <QuestionCard q={q} selected={q.id === selected?.id} />
                  </li>
                ))}
              </ul>
            </section>
            {selected ? <Shortlist key={selected.id} q={selected} catalog={c} /> : null}
          </>
        )}
      </WithData>
    </Page>
  );
}

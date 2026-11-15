// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Question (docs/04_UI.md §4.2) in the atlas look: question tiles from the catalog, each with the icon of its
// first record and a small drawing of its flow (one place over time, or two places compared). A tile opens its
// shortlist: one record card per variable with why it fits. Deferred variables show their cards greyed.
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Lock } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int, rate as fmtRate } from '../i18n/format';
import type { Catalog, CatalogQuestion, CatalogVariable, Lineup, Region } from '../data/types';
import { useCatalog, usePrereg, useRegionIndex, useResult } from '../data/hooks';
import { paths } from '../data/results';
import { useExploreIndex } from '../data/explore';
import { StatusBadge } from '../components/StatusBadge';
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

/** A record this build has data for (tested, a cross-check, or an exploration layer); deferred records have none. */
function hasData(v: CatalogVariable): boolean {
  return v.status !== 'deferred' && v.status !== 'reference';
}

/** A question the data in this build can answer: at least one of its records has data. */
function answerable(q: CatalogQuestion): boolean {
  return q.flow !== 'none' && q.shortlist.length > 0;
}

function QuestionCard({ q, n, catalog, selected }: { q: CatalogQuestion; n: number; catalog: Catalog; selected: boolean }) {
  const lang = useLang();
  const t = useT();
  const first = catalog.variables.find((v) => v.id === (q.shortlist[0]?.variable ?? q.also_deferred?.[0]));
  const later = q.flow === 'none';
  // A question with no registered test can still have exploration data for some of its records.
  const explored = later && (q.also_deferred ?? []).some((id) => {
    const v = catalog.variables.find((x) => x.id === id);
    return v !== undefined && hasData(v);
  });
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
          {later && !explored ? <Lock className="size-5" aria-hidden="true" /> : <GroupIcon group={first?.group} className="size-5" />}
        </span>
        <span className="font-mono text-[12px] tracking-[0.12em] text-muted" aria-hidden="true">
          {int(n, lang).padStart(2, int(0, lang))}
        </span>
      </span>
      <span className="mt-4 block font-display text-[25px] leading-[1.12]">{pick(q.question, lang)}</span>
      <span className="mt-auto flex items-center justify-between gap-3 pt-4 text-muted">
        <span className="text-sm" data-testid="question-flow">{explored ? t('site.kind.explored_only') : t(`site.question.flow_${q.flow}`)}</span>
        <FlowGlyph flow={q.flow} />
      </span>
    </a>
  );
}

/** One registered place's row on the answer board: its graded result for each record of the question. */
function BoardRow({ region, vars, season, i }: { region: Region; vars: CatalogVariable[]; season: string; i: number }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const lineup = useResult<Lineup>(paths.lineup(region.id));
  return (
    <motion.tr
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: reduce ? 0 : 0.04 * i }}
      className="border-t border-line"
      data-testid={`board-row-${region.id}`}
    >
      <th scope="row" className="py-2.5 pr-3 text-left text-[14.5px] font-semibold">
        <a href={href({ screen: 'place', region: region.id })} className="text-ink">
          {pick(region.name, lang)}
        </a>
      </th>
      {vars.map((v) => {
        const item = lineup.data?.items.find((x) => x.variable === v.id && x.season === season) ?? lineup.data?.items.find((x) => x.variable === v.id);
        return (
          <td key={v.id} className="px-2 py-2.5 align-middle">
            {lineup.status === 'loading' ? (
              <span className="inline-block h-6 w-28 animate-pulse rounded-full bg-ink/10" aria-hidden="true" />
            ) : item ? (
              <a href={href({ screen: 'place', region: region.id, variable: item.variable, season: item.season })} className="inline-flex flex-wrap items-center gap-2 text-ink no-underline hover:no-underline">
                <StatusBadge status={item.status} grade={item.grade} reason={item.reason} family={item.family} />
                <span className="font-mono text-[12.5px] tabular text-muted">
                  {item.ratePerDecade !== null ? `${fmtRate(item.ratePerDecade, lang)} ${item.units} ${t('verdict.labels.rate_short')}` : ''}
                </span>
              </a>
            ) : (
              <span className="text-[13px] text-muted">{t('site.ask2.no_test')}</span>
            )}
          </td>
        );
      })}
    </motion.tr>
  );
}

/** The question answered for every registered place at once: one row per place, one column per record. Each cell is the
 * place's own registered result (its lineup file); the board only lays them side by side and links to each. */
function AnswerBoard({ q, catalog }: { q: CatalogQuestion; catalog: Catalog }) {
  const t = useT();
  const lang = useLang();
  const index = useRegionIndex();
  const prereg = usePrereg();
  const explore = useExploreIndex();
  const vars = q.shortlist.map((s) => catalog.variables.find((x) => x.id === s.variable)).filter((v): v is CatalogVariable => v !== undefined && hasData(v));
  const regions = (index.data?.regions ?? []).filter((r) => r.inSet);
  const season = prereg.data?.seasons.main ?? 'ANN';
  if (!vars.length || !regions.length) return null;
  return (
    <section className="mt-12 rounded-card border border-line bg-surface p-4 shadow-card sm:p-6" aria-labelledby="board-title" data-testid="answer-board">
      <h3 id="board-title" className="m-0 font-display text-[28px] font-normal leading-tight">
        {t('site.ask2.board_title')}
      </h3>
      <p className="mb-4 mt-1 max-w-[70ch] text-[15px] text-muted">{t('site.ask2.board_lead', { season: t(`season.${season}.long`) })}</p>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className="pb-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
                {t('site.ask2.place')}
              </th>
              {vars.map((v) => (
                <th key={v.id} scope="col" className="px-2 pb-2 text-left text-[13px] font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <GroupIcon group={v.group} className="size-4" />
                    {pick(v.name, lang)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((r, i) => (
              <BoardRow key={r.id} region={r} vars={vars} season={season} i={i} />
            ))}
          </tbody>
        </table>
      </div>
      {explore.data ? (
        <ul className="m-0 mt-5 flex list-none flex-col gap-1.5 border-t border-line p-0 pt-4" data-testid="board-world">
          {vars.map((v) => {
            const x = explore.data?.variables.find((e) => e.id === v.id);
            if (!x || x.trendTested === undefined || x.trendStandsOut === undefined) return null;
            return (
              <li key={v.id} className="text-[14px] text-muted">
                <span className="font-semibold text-ink">{pick(v.name, lang)}</span>
                {' · '}
                {t('site.ask2.world_line', { out: int(x.trendStandsOut, lang), n: int(x.trendTested, lang) })}
              </li>
            );
          })}
          <li>
            <a href={href({ screen: 'map', variable: vars[0]?.id })} className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-[14px] font-semibold">
              {t('site.ask2.on_globe')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </li>
        </ul>
      ) : null}
    </section>
  );
}

function Shortlist({ q, catalog }: { q: CatalogQuestion; catalog: Catalog }) {
  const t = useT();
  const lang = useLang();
  const vars = q.shortlist.map((s) => ({ v: catalog.variables.find((x) => x.id === s.variable), why: s.why })).filter((x) => x.v);
  // Only records with data in this build: a record the release does not analyse is never shown as if it were there.
  const also = (q.also_deferred ?? []).map((id) => catalog.variables.find((x) => x.id === id)).filter((v) => v !== undefined && hasData(v));
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
      <AnswerBoard q={q} catalog={catalog} />
      {next ? (
        <a href={href(next)} className={cn(buttonVariants({ variant: 'accent', size: 'lg' }), 'mt-8')} data-testid="question-next">
          {q.flow === 'compare' ? t('site.question.start_compare') : t('question.start')}
          <ArrowRight aria-hidden="true" />
        </a>
      ) : null}
      {also.length ? (
        <div className="mt-14" data-testid="question-also">
          <h3 className="font-display text-[26px] font-normal">{t('site.question.also_title')}</h3>
          <p className="mb-5 mt-1 max-w-[70ch] text-[15px] text-muted">{t('site.question.also_note')}</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {also.map((v) => (v ? <RecordCard key={v.id} variable={v} /> : null))}
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
  const selected = catalog.data?.questions.filter(answerable).find((q) => q.id === view.question);
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
                  {c.questions.filter(answerable).map((q, i) => (
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

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// LineupTable (docs/04_UI.md §4.4), drawn as an evidence board: one row per record, one tile per season. Each
// tile shows its status first, then the rate per decade with its 95% range, the family and the adjusted p.
// Every tile shows its status, so a "no verdict" tile is never mistaken for a weak verdict. Exploration tiles
// show "adjusted within this list of N". The tiles stay in the file's order in the document; the grid only
// places them (layout arithmetic).
import { ArrowUpRight } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int, p as fmtP, rate } from '../i18n/format';
import type { Catalog, Lineup, LineupItem } from '../data/types';
import { useLang } from '../state/prefs';
import { href, type View } from '../state/view';
import { cn } from '../ui/common/utils';
import { FamilyBadge, StatusBadge, statusInfo } from './StatusBadge';
import { groupIcon, kindLabel } from './atlas/icons';

const TONE_BAR: Record<string, string> = {
  strong: 'bg-strong',
  supported: 'bg-supported',
  canttell: 'bg-canttell',
  noverdict: 'bg-noverdict',
  exploration: 'bg-exploration',
};

/** The 95% range against zero, as a small bar (positions only). */
function MiniRange({ value, lo, hi, tone }: { value: number; lo: number | null; hi: number | null; tone: string }) {
  const ext = Math.max(Math.abs(lo ?? value), Math.abs(hi ?? value), Math.abs(value)) * 1.2 || 1;
  const pos = (x: number) => 50 + (x / ext) * 46;
  return (
    <div className="relative mt-3 h-4" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
      <div className="absolute top-0 h-4 w-px bg-muted/70" style={{ left: `${pos(0)}%` }} />
      {lo !== null && hi !== null ? (
        <div className={cn('absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-45', TONE_BAR[tone])} style={{ left: `${pos(lo)}%`, width: `${Math.max(1, pos(hi) - pos(lo))}%` }} />
      ) : null}
      <div className={cn('absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface', TONE_BAR[tone])} style={{ left: `${pos(value)}%` }} />
    </div>
  );
}

export function LineupTable({
  lineup,
  catalog,
  selected,
  linkFor,
}: {
  lineup: Lineup;
  catalog: Catalog | undefined;
  selected?: { variable: string; season: string };
  linkFor: (item: LineupItem) => View;
}) {
  const t = useT();
  const lang = useLang();
  const variable = (id: string) => catalog?.variables.find((x) => x.id === id);
  const varName = (id: string) => {
    const v = variable(id);
    return v ? pick(v.name, lang) : id;
  };
  const pText = (it: LineupItem) => {
    if (it.family === 'exploration' || it.family === 'sensitivity') {
      return it.qWithinLineup !== null ? fmtP(it.qWithinLineup, lang) : '–';
    }
    return it.pAdjusted !== null ? fmtP(it.pAdjusted, lang) : '–';
  };
  const within = (it: LineupItem) => (it.family === 'exploration' || it.family === 'sensitivity') && it.qWithinLineup !== null;

  // Rows (records) and columns (seasons) in the order they first appear in the file.
  const vars = [...new Set(lineup.items.map((i) => i.variable))];
  const seasons = [...new Set(lineup.items.map((i) => i.season))];

  const tile = (it: LineupItem, mobile: boolean) => {
    const isSel = selected?.variable === it.variable && selected?.season === it.season;
    const tone = statusInfo(t, it.status, it.grade, it.reason, it.family).tone;
    return (
      <a
        href={href(linkFor(it))}
        aria-current={isSel ? 'true' : undefined}
        className={cn(
          'group relative flex h-full flex-col overflow-hidden rounded-card border px-4 pb-3.5 pt-4 text-ink no-underline transition-[border-color,box-shadow,transform] hover:no-underline',
          'hover:-translate-y-px hover:border-line-strong hover:shadow-lift',
          isSel ? 'border-accent bg-accent/[0.08] shadow-[0_0_0_1px_var(--accent),var(--shadow)]' : 'atlas-panel border-line bg-surface',
        )}
      >
        <span className={cn('absolute inset-x-0 top-0 h-[3px]', TONE_BAR[tone])} aria-hidden="true" />
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            {mobile ? <span className="block text-[15px] font-semibold leading-snug">{varName(it.variable)}</span> : null}
            <span className="eyebrow block">{t(`season.${it.season}.long`)}</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-muted transition-colors group-hover:text-accent-ink" aria-hidden="true" />
        </span>
        <span className="mt-2.5 flex flex-wrap gap-1.5">
          <StatusBadge status={it.status} grade={it.grade} reason={it.reason} family={it.family} />
        </span>
        {it.ratePerDecade !== null ? (
          <>
            <span className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display text-[30px] leading-none tabular">{rate(it.ratePerDecade, lang)}</span>
              <span className="text-[13px] text-muted">
                {it.units} {t('verdict.labels.rate_short')}
              </span>
            </span>
            {it.rateLowPerDecade !== null && it.rateHighPerDecade !== null ? (
              <span className="mt-1 block font-mono text-[12px] text-muted tabular">
                [{rate(it.rateLowPerDecade, lang, it.ratePerDecade)}, {rate(it.rateHighPerDecade, lang, it.ratePerDecade)}]
              </span>
            ) : null}
            <MiniRange value={it.ratePerDecade} lo={it.rateLowPerDecade} hi={it.rateHighPerDecade} tone={tone} />
          </>
        ) : (
          <span className="mt-3 font-display text-[30px] leading-none text-muted">–</span>
        )}
        <span className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3.5">
          <FamilyBadge family={it.family} />
          <span className="text-right text-[13px] tabular">
            <span className="text-muted">{t('lineup.col_p')} </span>
            <span className="font-semibold">{pText(it)}</span>
            {within(it) ? <span className="block text-[11.5px] text-muted">{t('lineup.adjusted_within', { n_tests: lineup.nTests })}</span> : null}
          </span>
        </span>
      </a>
    );
  };

  return (
    <div data-tour="lineup" data-testid="lineup">
      <p className="mb-5 text-[16px] text-muted" data-testid="lineup-intro">
        {t('lineup.intro', { n_tests: lineup.nTests })}
      </p>
      {/* Wide screens: a board, records down, seasons across. Phones: one tile per test. Same data, same order. */}
      <div
        className="hidden gap-3 md:grid"
        style={{ gridTemplateColumns: `minmax(150px, 210px) repeat(${seasons.length}, minmax(0, 1fr))` }}
        role="list"
      >
        {vars.map((v, r) => {
          const cv = variable(v);
          const Icon = groupIcon(cv?.group);
          return (
            <div key={`h-${v}`} className="flex flex-col justify-center gap-2 pr-2" style={{ gridColumn: 1, gridRow: r + 1 }} aria-hidden="true">
              <span className="inline-flex size-10 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent-ink">
                <Icon className="size-5" />
              </span>
              <span className="text-[16px] font-semibold leading-snug">{varName(v)}</span>
              {cv ? (
                <span className="text-[13px] text-muted">
                  {kindLabel(t, cv.kind)}
                  {cv.record?.from ? ` · ${int(cv.record.from, lang)}–` : ''}
                </span>
              ) : null}
            </div>
          );
        })}
        {lineup.items.map((it) => (
          <div
            key={`${it.variable}-${it.season}`}
            role="listitem"
            data-testid="lineup-row"
            data-family={it.family}
            style={{ gridColumn: seasons.indexOf(it.season) + 2, gridRow: vars.indexOf(it.variable) + 1 }}
            aria-label={`${varName(it.variable)}, ${t(`season.${it.season}.long`)}`}
          >
            {tile(it, false)}
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {lineup.items.map((it) => (
          <li key={`${it.variable}-${it.season}`} data-testid="lineup-row-mobile" data-family={it.family}>
            {tile(it, true)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// LineupTable (docs/04_UI.md §4.4): one row per variable and season with its status, family, rate per decade
// with its 95% range, and the adjusted p. Every row shows its status, so a "no verdict" row is never mistaken
// for a weak verdict. Exploration rows show "adjusted within this list of N".
import { ChevronRight } from 'lucide-react';
import { pick, useT } from '../i18n';
import { p as fmtP, rate } from '../i18n/format';
import type { Catalog, Lineup, LineupItem } from '../data/types';
import { useLang } from '../state/prefs';
import { href, type View } from '../state/view';
import { cn } from '../ui/common/utils';
import { FamilyBadge, StatusBadge } from './StatusBadge';

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
  const varName = (id: string) => {
    const v = catalog?.variables.find((x) => x.id === id);
    return v ? pick(v.name, lang) : id;
  };
  const pCell = (it: LineupItem) => {
    if (it.family === 'exploration' || it.family === 'sensitivity') {
      return it.qWithinLineup !== null ? (
        <span>
          {fmtP(it.qWithinLineup, lang)}
          <span className="block text-xs text-muted">{t('lineup.adjusted_within', { n_tests: lineup.nTests })}</span>
        </span>
      ) : (
        '–'
      );
    }
    return it.pAdjusted !== null ? fmtP(it.pAdjusted, lang) : '–';
  };
  return (
    <div data-tour="lineup" data-testid="lineup">
      <p className="mb-3 text-[15px] text-muted" data-testid="lineup-intro">
        {t('lineup.intro', { n_tests: lineup.nTests })}
      </p>
      {/* Wide screens: a table. Phones: one card per row. Same data, same order. */}
      <div className="hidden overflow-hidden rounded-[10px] border border-line bg-surface md:block">
        <table className="w-full border-collapse text-[15px] tabular">
          <thead className="border-b border-line-strong bg-surface-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-[13px] font-semibold text-muted">
                {t('lineup.col_variable')}
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[13px] font-semibold text-muted">
                {t('lineup.col_season')}
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[13px] font-semibold text-muted">
                {t('site.lineup.col_status')}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[13px] font-semibold text-muted">
                {t('lineup.col_rate')}
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[13px] font-semibold text-muted">
                {t('lineup.col_family')}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[13px] font-semibold text-muted">
                {t('lineup.col_p')}
              </th>
              <th scope="col" className="w-10 px-2 py-2">
                <span className="sr-only">{t('lineup.open')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lineup.items.map((it) => {
              const isSel = selected?.variable === it.variable && selected?.season === it.season;
              return (
                <tr
                  key={`${it.variable}-${it.season}`}
                  data-testid="lineup-row"
                  data-family={it.family}
                  className={cn('border-b border-line last:border-0', isSel ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                >
                  <td className="px-3 py-2.5 font-medium">{varName(it.variable)}</td>
                  <td className="px-3 py-2.5">{t(`season.${it.season}.long`)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={it.status} grade={it.grade} reason={it.reason} family={it.family} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {it.ratePerDecade !== null ? (
                      <>
                        <span className="font-semibold">
                          {rate(it.ratePerDecade, lang)} {it.units}
                        </span>
                        {it.rateLowPerDecade !== null && it.rateHighPerDecade !== null ? (
                          <span className="block text-xs text-muted">
                            [{rate(it.rateLowPerDecade, lang, it.ratePerDecade)}, {rate(it.rateHighPerDecade, lang, it.ratePerDecade)}]
                          </span>
                        ) : null}
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <FamilyBadge family={it.family} />
                  </td>
                  <td className="px-3 py-2.5 text-right">{pCell(it)}</td>
                  <td className="px-2 py-2.5">
                    <a
                      href={href(linkFor(it))}
                      aria-current={isSel ? 'true' : undefined}
                      aria-label={`${t('lineup.open')}: ${varName(it.variable)}, ${t(`season.${it.season}.long`)}`}
                      className="inline-flex size-10 items-center justify-center rounded-[8px] text-ink hover:bg-ink/[0.06]"
                    >
                      <ChevronRight className="size-5" aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {lineup.items.map((it) => {
          const isSel = selected?.variable === it.variable && selected?.season === it.season;
          return (
            <li key={`${it.variable}-${it.season}`} data-testid="lineup-row-mobile" data-family={it.family}>
              <a
                href={href(linkFor(it))}
                aria-current={isSel ? 'true' : undefined}
                className={cn(
                  'flex items-start gap-3 rounded-[10px] border px-3.5 py-3 text-ink no-underline hover:no-underline',
                  isSel ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {varName(it.variable)} · {t(`season.${it.season}.long`)}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusBadge status={it.status} grade={it.grade} reason={it.reason} family={it.family} />
                    <FamilyBadge family={it.family} />
                  </span>
                  <span className="mt-1.5 block text-sm text-muted tabular">
                    {it.ratePerDecade !== null ? `${rate(it.ratePerDecade, lang)} ${it.units} ${t('verdict.labels.rate_short')}` : '–'}
                    {' · '}
                    {t('lineup.col_p')} {typeof pCell(it) === 'string' ? pCell(it) : it.qWithinLineup !== null ? fmtP(it.qWithinLineup, lang) : '–'}
                  </span>
                </span>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted" aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

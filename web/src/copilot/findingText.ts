// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The sentence for each finding of the evidence layer, from the string files, numbers formatted for the language.
// Shared by the challenge panel and the copilot's tools, so both say exactly the same thing.
import type { T } from '../i18n';
import { int, p as pFmt, rate as rateFmt } from '../i18n/format';
import type { Lang } from '../data/types';
import type { Finding } from './evidence';

/** The sentence for one finding, from the string files, with numbers formatted for the language. */
export function findingText(t: T, lang: Lang, f: Finding, units: string): string[] {
  const k = (id: string) => `site.copilot.challenge.findings.${id}`;
  const P = f.params;
  const year = (y: unknown) => (typeof y === 'number' ? int(y, lang) : t('site.copilot.challenge.unknown_year'));
  const review = (o: unknown) => (o === 'unreviewed' || o === null ? t('site.copilot.challenge.not_reviewed') : t(`site.chart.review_${String(o)}`));
  switch (f.id) {
    case 'test_supported':
    case 'test_cant_tell':
      return [t(k(f.id), { p: pFmt(P.pAdjusted as number, lang), alpha: pFmt(P.alpha as number, lang), n: int((P.familySize as number) ?? 0, lang) })];
    case 'no_verdict':
      return [t(k(f.id), { reason: t(`site.reason_short.${String(P.reason)}`) })];
    case 'windows_agree':
    case 'windows_disagree':
      return [t(k(f.id), { agree: int(P.agree as number, lang), ran: int(P.ran as number, lang) })];
    case 'loo_flip':
      return [t(k(f.id), { year: year(P.year) })];
    case 'jump_unreviewed':
      return [t(k(f.id), { year: year(P.year) })];
    case 'jump_reviewed':
      return [t(k(f.id), { year: year(P.year), review: review(P.review) })];
    case 'break_documented':
      return [t(k(f.id), { year: year(P.year), review: review(P.review) })];
    case 'gaps':
      return [t(k(f.id), { years: String(P.years) })];
    case 'practical':
      return [t(k(`practical_${String(P.position)}`), { threshold: int(P.threshold as number, lang), units: String(P.units) })];
    case 'exploration_differs':
      return [P.standsOut ? t(k('exploration_up'), { q: pFmt(P.q as number, lang) }) : t(k('exploration_down'))];
    case 'other_dataset': {
      const r = rateFmt(P.rate as number | null, lang);
      return [P.matched ? t(k('other_matched'), { rate: `${r} ${units}` }) : t(k('other_unmatched'), { first: int(P.first as number, lang), last: int(P.last as number, lang), mainFirst: int(P.mainFirst as number, lang), mainLast: int(P.mainLast as number, lang), rate: `${r} ${units}` })];
    }
    case 'contrast_labels': {
      const out = [t(k(P.ratesDiffer ? 'rates_differ' : 'rates_same'))];
      if (P.supportedOppositeTrends) out.push(t(k('opposite_supported')));
      else if (P.oppositeFittedDirections) out.push(t(k('opposite_fitted')));
      return out;
    }
    case 'contrast_split':
      return [t(k(P.passes ? 'split_ok' : 'split_fail'))];
    default:
      return [t(k(f.id))];
  }
}

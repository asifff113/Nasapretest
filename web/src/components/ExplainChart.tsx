// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// "Explain this chart" at three levels, under a verdict's or a comparison's chart:
//   Quick    one finding, one limit, one next step
//   Learn    the axes, the line and band, the pattern, the uncertainty and the dataset
//   Inspect  the method, the tests and where the data came from
// Every number and every finding sentence is the result file's own (the engine's text and statistics); the site
// picks which ones to show and formats them. It computes nothing and makes no AI call.
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import { digits, int, num, pExpr, rate, shortHash } from '../i18n/format';

const expr = (x: number | null | undefined, lang: Lang) => (x === null || x === undefined ? '–' : digits(pExpr(x), lang));
import { useCatalog } from '../data/hooks';
import type { Contrast, Lang, Verdict } from '../data/types';
import { useLang } from '../state/prefs';
import { SegmentedControl } from '../ui/common/toggle-group';
import { challengeMarks } from './ChallengePanel';
import { undatedBreaks } from './ChecksList';

export type Level = 'quick' | 'learn' | 'inspect';
const LEVELS: Level[] = ['quick', 'learn', 'inspect'];

/** The limit to name first: the first challenge the engine's statuses mark as weakening, or null. */
export function firstLimit(result: Verdict | Contrast, undated: number): string | null {
  const sens = result.sensitivity;
  const cross = sens === null || sens === undefined ? null : typeof sens === 'string' ? ('verdict' as const) : { sameSign: sens.sameSign };
  return challengeMarks(result.robustness, result.doubts, undated, cross).find((c) => c.mark === 'weakens')?.id ?? null;
}

function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-2.5 first:border-t-0 first:pt-0">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{k}</dt>
      <dd className="m-0 text-[14.5px] leading-relaxed">{children}</dd>
    </div>
  );
}

export function ExplainChart({ result, subject }: { result: Verdict | Contrast; subject: string }) {
  const t = useT();
  const lang = useLang();
  const catalog = useCatalog();
  const [level, setLevel] = useState<Level>('quick');
  const isContrast = typeof result.variable === 'string';
  const variableId = typeof result.variable === 'string' ? result.variable : result.variable.id;
  const cv = catalog.data?.variables.find((v) => v.id === variableId);
  const units = 'difference' in result ? result.difference.units : result.variable.units;
  const rule = typeof result.variable === 'string' ? (cv?.rule ?? null) : result.variable.rule;
  const text = result.text[lang] ?? result.text.en;
  const undated = undatedBreaks(catalog.data, variableId);
  const limit = firstLimit(result, undated.length);
  const rb = result.robustness;
  const s = result.stats;
  const m = result.multiplicity;
  const prov = result.provenance;
  const dChecks = result.domain.checks;
  const passed = dChecks.filter((c) => c.passed === true).length;
  const years = { from: int(result.window.first, lang), to: int(result.window.last, lang) };

  const quick = (
    <dl className="m-0 flex flex-col gap-2.5" data-testid="explain-quick">
      <Line k={t('site.explain.finding')}>{text.headline}</Line>
      <Line k={t('site.explain.limit')}>
        {result.status !== 'verdict' && result.reason
          ? t('site.explain.limit_reason', { reason: tOr(t, `site.reason_short.${result.reason}`, result.reason) })
          : limit
            ? t(`site.explain.limit_${limit}`)
            : cv?.record_card
              ? pick(cv.record_card.cannot_answer, lang)
              : t('site.explain.limit_none')}
      </Line>
      <Line k={t('site.explain.next')}>
        {limit ? t('site.explain.next_challenge') : result.sensitivity ? t('site.explain.next_cross') : t('site.explain.next_checks')}
      </Line>
    </dl>
  );

  const learn = (
    <dl className="m-0 flex flex-col gap-2.5" data-testid="explain-learn">
      <Line k={t('site.explain.axes')}>
        {t('site.explain.axis_x', { ...years, n: s ? int(s.n, lang) : '–' })}{' '}
        {isContrast
          ? t('site.explain.axis_y_diff', { subject, units })
          : t(rule === 'sum' ? 'site.explain.axis_y_sum' : 'site.explain.axis_y_mean', { subject, units })}
      </Line>
      <Line k={t('site.explain.marks')}>
        {t('site.explain.line_sen')}
        {result.chart?.band ? ` ${t('site.explain.band')}` : ''}
        {rb.pettitt?.flagged && rb.pettitt.year !== null ? ` ${t('site.explain.jump_mark', { year: int(rb.pettitt.year, lang) })}` : ''}
        {rb.breaks.length ? ` ${t('site.explain.break_mark')}` : ''}
      </Line>
      {isContrast && s?.change ? (
        <Line k={t('site.explain.pattern')}>
          <span className="tabular">
            {t('site.explain.pattern_diff', {
              rate: rate(s.change.ratePerDecade, lang),
              lo: rate(s.change.rateLowPerDecade, lang, s.change.ratePerDecade),
              hi: rate(s.change.rateHighPerDecade, lang, s.change.ratePerDecade),
              units,
            })}
          </span>
          {text.howMuch.length ? <span className="mt-1 block text-muted">{text.howMuch[0]}</span> : null}
        </Line>
      ) : text.howMuch.length ? (
        <Line k={t('site.explain.pattern')}>{text.howMuch[0]}</Line>
      ) : null}
      {text.howSure.length ? <Line k={t('site.explain.uncertainty')}>{text.howSure.join(' ')}</Line> : null}
      <Line k={t('site.explain.dataset')}>
        {prov.items.map((p) => p.product).join('; ')}
        {cv?.record_card ? <span className="mt-1 block text-muted">{pick(cv.record_card.observation_or_model, lang)}</span> : null}
      </Line>
    </dl>
  );

  const inspect = (
    <dl className="m-0 flex flex-col gap-2.5" data-testid="explain-inspect">
      <Line k={t('site.explain.method')}>
        {s ? (
          <span className="tabular">
            {t('site.explain.method_mk', {
              n: int(s.n, lang),
              p_raw: expr(s.mk?.p, lang),
              phi: num(s.ar1?.phi, lang, 2),
              p: expr(s.mkAr1?.p, lang),
            })}{' '}
            {t('site.explain.method_sen', {
              rate: rate(s.change?.ratePerDecade, lang),
              lo: rate(s.change?.rateLowPerDecade, lang, s.change?.ratePerDecade),
              hi: rate(s.change?.rateHighPerDecade, lang, s.change?.ratePerDecade),
              units,
            })}
          </span>
        ) : (
          t('site.explain.no_stats')
        )}
      </Line>
      <Line k={t('site.explain.tests')}>
        <span className="tabular">
          {m.familySize !== null && m.pAdjusted !== null && m.alpha !== null
            ? t('site.explain.family', {
                method: tOr(t, `site.explain.method_${m.method}`, m.method),
                size: int(m.familySize, lang),
                p_adj: expr(m.pAdjusted, lang),
                alpha: num(m.alpha, lang, 2),
              })
            : t('site.explain.family_none')}{' '}
          {t('site.explain.domain', { passed: int(passed, lang), all: int(dChecks.length, lang) })}
        </span>
      </Line>
      <Line k={t('site.explain.source')}>
        <ul className="m-0 list-disc pl-5">
          {prov.items.map((p) => (
            <li key={`${p.shortName}-${p.version}`}>
              <span className="font-mono text-[13px]">{`${p.shortName} ${p.version}`}</span>
              {p.doi ? <span className="text-muted">{` · DOI ${p.doi}`}</span> : null}
              {p.granules !== null && p.granules !== undefined ? (
                <span className="text-muted">{` · ${t('site.explain.granules', { n: int(p.granules, lang) })}`}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <span className="mt-1 block text-[13px] text-muted">
          {t('site.explain.build', { engine: prov.engine, build: prov.buildId, manifest: shortHash(prov.inputManifestSha256), prereg: shortHash(prov.preregSha256) })}
        </span>
      </Line>
      <p className="m-0 text-[13px] text-muted">{t('site.explain.more')}</p>
    </dl>
  );

  return (
    <section className="mt-5 rounded-[10px] border border-line bg-surface-2 p-4" data-testid="explain-chart" aria-labelledby="explain-chart-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 id="explain-chart-h" className="m-0 inline-flex items-center gap-2 text-[15px] font-semibold">
          <BookOpen className="size-4 text-accent-ink" aria-hidden="true" />
          {t('site.explain.title')}
        </h3>
        <SegmentedControl
          size="sm"
          label={t('site.explain.level')}
          value={level}
          onValueChange={(v) => setLevel(v as Level)}
          options={LEVELS.map((l) => ({ value: l, label: t(`site.explain.level_${l}`), testId: `explain-${l}-tab` }))}
        />
      </div>
      {level === 'quick' ? quick : level === 'learn' ? learn : inspect}
    </section>
  );
}

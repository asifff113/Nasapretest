// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// ExpertPanel (docs/04_UI.md §4.5 item 11): the engine's statistics as written in the result file.
// Collapsed by default. The t-test is labelled "shown for comparison; it does not decide"; the naive test is
// labelled "ignores year-to-year memory". Outside the domain the interval is marked "not calibrated here".
import { Microscope } from 'lucide-react';
import { tOr, useT } from '../i18n';
import { int, num, p as fmtP, rate } from '../i18n/format';
import type { DomainCheck, Stats } from '../data/types';
import { useLang } from '../state/prefs';
import { Disclosure } from '../ui/common/collapsible';
import { cn } from '../ui/common/utils';

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className={cn('m-0 text-right text-[14px] tabular', mono && 'font-mono text-[13px]')}>{v}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-2">
      <h4 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</h4>
      <dl className="m-0">{children}</dl>
    </section>
  );
}

function value(v: string | number | null, lang: 'en' | 'bn'): string {
  if (v === null) return '–';
  if (typeof v === 'number') return Number.isInteger(v) ? int(v, lang) : num(v, lang, 3);
  return v;
}

export function ExpertPanel({
  stats,
  domain,
  units,
  inDomain,
  resultHref,
}: {
  stats: Stats;
  domain: DomainCheck[];
  units: string;
  inDomain: boolean;
  resultHref?: string | null;
}) {
  const t = useT();
  const lang = useLang();
  const s = stats;
  const n3 = (x: number | null | undefined) => num(x, lang, 3);
  return (
    <Disclosure title={t('verdict.labels.for_experts')} icon={<Microscope className="size-5 text-muted" aria-hidden="true" />} testId="expert-panel">
      <Group title={t('site.experts.mk')}>
        <KV k="n" v={int(s.n, lang)} />
        {s.mk ? (
          <>
            <KV k="S" v={int(s.mk.S, lang)} />
            <KV k={t('site.experts.var_s')} v={num(s.mk.varS, lang, 1)} />
            <KV k="τ" v={n3(s.mk.tau)} />
            <KV k="Z" v={n3(s.mk.z)} />
            <KV k="p" v={`${fmtP(s.mk.p, lang)} (${s.mk.pKind})`} />
          </>
        ) : null}
      </Group>
      {s.ar1 ? (
        <Group title={t('verdict.labels.memory')}>
          <KV k="φ̂" v={n3(s.ar1.phiRaw)} />
          <KV k="φ̃" v={n3(s.ar1.phi)} />
          <KV k={t('site.experts.vif')} v={n3(s.ar1.vif)} />
          <KV k={t('site.experts.estimator')} v={s.ar1.estimator} mono />
        </Group>
      ) : null}
      {s.mkAr1 ? (
        <Group title={t('site.experts.mkar1')}>
          <KV k="Var*(S)" v={num(s.mkAr1.varSStar, lang, 1)} />
          <KV k="Z*" v={n3(s.mkAr1.z)} />
          <KV k="p*" v={fmtP(s.mkAr1.p, lang)} />
        </Group>
      ) : null}
      {s.sen ? (
        <Group title={t('site.experts.sen')}>
          <KV k={t('site.experts.slope_year')} v={`${rate(s.sen.slopePerYear, lang)} ${units}`} />
          <KV k={t('site.experts.intercept')} v={num(s.sen.intercept, lang, 3)} />
          <KV
            k={t('site.experts.widened', { m: num(s.sen.multiplier, lang, 2) })}
            v={
              s.sen.ciLowPerYear === null || s.sen.ciHighPerYear === null
                ? '–'
                : `${rate(s.sen.ciLowPerYear, lang, s.sen.slopePerYear)} … ${rate(s.sen.ciHighPerYear, lang, s.sen.slopePerYear)}${inDomain ? '' : ` (${t('site.experts.not_calibrated')})`}`
            }
          />
          <KV k={t('site.experts.pairs')} v={int(s.sen.nPairs, lang)} />
        </Group>
      ) : null}
      {s.ttest ? (
        <Group title={t('verdict.labels.ttest')}>
          {s.ttest.available ? (
            <>
              <KV k={t('site.experts.slope_year')} v={`${rate(s.ttest.slopePerYear ?? null, lang)} ${units}`} />
              <KV k={t('site.experts.n_eff')} v={n3(s.ttest.nEff ?? null)} />
              <KV k="t" v={n3(s.ttest.t ?? null)} />
              <KV k="p" v={fmtP(s.ttest.p ?? null, lang)} />
            </>
          ) : (
            <KV k="t" v={t('site.experts.unavailable')} />
          )}
        </Group>
      ) : null}
      {s.naive ? (
        <Group title={t('verdict.labels.naive')}>
          <KV k="Z" v={n3(s.naive.z)} />
          <KV k="p" v={fmtP(s.naive.p, lang)} />
        </Group>
      ) : null}
      {s.leftover ? (
        <Group title={t('site.experts.leftover')}>
          <KV k={t('site.experts.leftover_stat')} v={n3(s.leftover.stat)} />
          <KV k={t('site.experts.leftover_critical')} v={n3(s.leftover.critical)} />
          <KV k={t('site.experts.cells')} v={`${int(s.leftover.m, lang)} (m_eff ${num(s.leftover.mEff, lang, 2)})`} />
          <KV k={t('site.experts.leftover_passed')} v={s.leftover.passed === null ? '–' : s.leftover.passed ? t('site.common.yes') : t('site.common.no')} />
        </Group>
      ) : null}
      <Group title={t('site.experts.domain')}>
        {domain.map((c) => (
          <KV
            key={c.id}
            k={`${c.id} · ${tOr(t, `site.domain.${c.id}`, c.id)}`}
            v={
              <span className={c.passed === false ? 'text-noverdict' : undefined}>
                {c.passed === null ? '–' : c.passed ? '✓' : '✗'} {value(c.value, lang)}
                {c.limit !== null ? <span className="text-muted"> / {value(c.limit, lang)}</span> : null}
              </span>
            }
          />
        ))}
      </Group>
      {resultHref ? (
        <a href={resultHref} target="_blank" rel="noopener" className="mt-4 inline-flex min-h-11 items-center text-[15px] font-medium">
          {t('site.provenance.result_file')}
        </a>
      ) : null}
    </Disclosure>
  );
}

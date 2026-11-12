// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Methods (docs/04_UI.md §4.9; templates/METHODS_PAGE.md): one page. Each section has a plain version and a
// "For experts" version; every number comes from methods/tables.json, prereg.json, build.json and
// input_manifest.json. Rates are worded as a property of the method, never as the chance a verdict is wrong.
import { useState, type ReactNode } from 'react';
import { BookOpen, Fingerprint, ShieldCheck } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import { int, num, shortHash } from '../i18n/format';
import type { Build, Manifest, MethodsTables, Prereg } from '../data/types';
import { useCatalog, usePrereg, useResult } from '../data/hooks';
import { useLang } from '../state/prefs';
import { WithData } from '../components/LoadState';
import { Page, PageHeader } from '../components/Page';
import { PivotTable, SimpleTable } from '../components/PivotTable';
import { Disclosure } from '../ui/common/collapsible';
import { SegmentedControl } from '../ui/common/toggle-group';
import { Card } from '../ui/common/card';

const SECTIONS = ['data', 'seasons', 'how-much', 'significant', 'domain', 'family', 'compare', 'checks', 'grade', 'power', 'maps', 'tests', 'manifest', 'breaks', 'limits', 'reproduce', 'references'] as const;
type SectionId = (typeof SECTIONS)[number];

function Block({ id, title, children, tour }: { id: SectionId; title: string; children: ReactNode; tour?: string }) {
  return (
    <section id={`m-${id}`} tabIndex={-1} className="scroll-mt-28 border-t border-line py-10 outline-none first:border-t-0 first:pt-0" data-tour={tour} data-testid={`methods-${id}`}>
      <h2 className="text-h2">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Plain({ k }: { k: string }) {
  const t = useT();
  return <p className="max-w-[72ch] text-[17px] leading-relaxed">{t(k)}</p>;
}

function Experts({ k, children }: { k?: string; children?: ReactNode }) {
  const t = useT();
  return (
    <Disclosure title={t('verdict.labels.for_experts')} className="max-w-full">
      {k ? <p className="max-w-[80ch] text-[15px] leading-relaxed text-muted">{t(k)}</p> : null}
      {children ? <div className="mt-4 flex flex-col gap-4">{children}</div> : null}
    </Disclosure>
  );
}

function Hash({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-sm text-muted">{label}</span>
      <code className="break-all font-mono text-[13px]" data-testid="hash-value">
        {value ?? '–'}
      </code>
    </div>
  );
}

function Calibration({ tables }: { tables: MethodsTables }) {
  const t = useT();
  const lang = useLang();
  const [metric, setMetric] = useState<'falseAlarmPct' | 'passDomainPct' | 'falseAlarmAmongPassPct'>('falseAlarmPct');
  const maxN = Math.max(...tables.calibration.map((r) => r.n));
  const ref = tables.calibration.find((r) => r.n === maxN && r.phi === 0);
  return (
    <div className="flex flex-col gap-3" data-testid="table-calibration">
      {ref && ref.falseAlarmPct !== null ? (
        <p className="max-w-[72ch] rounded-[10px] border-l-2 border-accent bg-accent-soft/50 px-4 py-3 text-[15px]" data-testid="methods-property">
          {t('methods.property', { k: num(ref.falseAlarmPct, lang, 0) })}{' '}
          <span className="text-muted">{t('site.methods.property_row', { n: int(ref.n, lang), phi: num(ref.phi, lang, 1) })}</span>
        </p>
      ) : null}
      <SegmentedControl
        size="sm"
        label={t('site.methods.metric')}
        value={metric}
        onValueChange={(v) => setMetric(v as typeof metric)}
        options={[
          { value: 'falseAlarmPct', label: t('site.methods.false_alarm') },
          { value: 'passDomainPct', label: t('site.methods.pass_domain') },
          { value: 'falseAlarmAmongPassPct', label: t('site.methods.false_alarm_pass') },
        ]}
      />
      <PivotTable
        rows={tables.calibration}
        rowKey={(r) => r.n}
        colKey={(r) => r.phi}
        corner={t('site.methods.n_phi')}
        rowLabel={(n) => int(n, lang)}
        colLabel={(p) => `φ ${num(p, lang, 1)}`}
        value={(r) => (r[metric] === null ? '–' : `${num(r[metric] as number, lang, 1)}%`)}
        caption={t('site.methods.calibration_caption', { reps: int(tables.calibration[0]?.reps ?? 0, lang) })}
      />
      {tables.extraRows.length ? (
        <SimpleTable
          head={[t('site.methods.record_kind'), 'n', t('site.methods.false_alarm')]}
          rows={tables.extraRows.map((r) => [tOr(t, `site.methods.kind_${r.kind}`, r.kind), int(r.n, lang), r.falseAlarmPct === null ? '–' : `${num(r.falseAlarmPct, lang, 1)}%`])}
        />
      ) : null}
    </div>
  );
}

function ByTab<T>({ rows, tabKey, tabLabel, render }: { rows: T[]; tabKey: (r: T) => number; tabLabel: (k: number) => string; render: (rows: T[]) => ReactNode }) {
  const t = useT();
  const keys = [...new Set(rows.map(tabKey))].sort((a, b) => a - b);
  const [k, setK] = useState(keys[keys.length - 1] ?? 0);
  return (
    <div className="flex flex-col gap-3">
      {keys.length > 1 ? (
        <SegmentedControl size="sm" label={t('site.methods.choose_table')} value={String(k)} onValueChange={(v) => setK(Number(v))} options={keys.map((x) => ({ value: String(x), label: tabLabel(x) }))} />
      ) : null}
      {render(rows.filter((r) => tabKey(r) === k))}
    </div>
  );
}

function ManifestSummary({ manifest, build }: { manifest: Manifest; build: Build }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="flex flex-col gap-3" data-testid="manifest-summary">
      <Hash label={t('provenance.manifest')} value={build.inputManifest.sha256} />
      <SimpleTable
        head={[t('provenance.dataset'), t('provenance.version'), t('site.methods.months'), t('site.methods.granules'), t('site.methods.files')]}
        rows={manifest.products.map((p) => [
          <span key="n">
            <span className="font-medium">{p.shortName}</span>
            {p.doi ? <span className="block font-mono text-xs text-muted">{p.doi}</span> : null}
          </span>,
          p.version,
          `${p.firstMonth} – ${p.lastMonth}`,
          int(p.granuleCount, lang),
          int(p.files.length, lang),
        ])}
      />
      {manifest.checks.length ? (
        <ul className="text-sm text-muted">
          {manifest.checks.map((c) => (
            <li key={c.id}>
              <span className="font-mono">{c.id}</span>: {c.result} — {c.note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FamilyList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 font-semibold">{title}</p>
      <ol className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface p-3">
        {items.map((s, i) => (
          <li key={s} className="flex gap-3 font-mono text-[13px]">
            <span className="w-6 shrink-0 text-right text-muted">{i + 1}</span>
            <span className="break-all">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Toc() {
  const t = useT();
  return (
    <nav aria-label={t('site.methods.toc')} className="hidden lg:block">
      <ol className="sticky top-[calc(var(--header-h)+24px)] flex flex-col gap-0.5 border-l border-line text-sm">
        {SECTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`m-${s}`);
                el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                el?.focus({ preventScroll: true });
              }}
              className="-ml-px min-h-9 w-full border-l-2 border-transparent px-3 text-left text-muted hover:border-accent hover:text-ink"
            >
              {t(`site.methods.s_${s}`)}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function MethodsScreen() {
  const t = useT();
  const lang = useLang();
  const tables = useResult<MethodsTables>('methods/tables.json');
  const build = useResult<Build>('build.json');
  const manifest = useResult<Manifest>('input_manifest.json');
  const prereg = usePrereg();
  const catalog = useCatalog();
  return (
    <Page>
      <PageHeader eyebrow={<BookOpen className="inline size-4" aria-hidden="true" />} title={t('methods.title')} lead={t('methods.intro')} />
      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Toc />
        <div className="min-w-0">
          <WithData res={tables} path="methods/tables.json">
            {(tb) => (
              <>
                {tb.note ? <p className="mb-8 rounded-[10px] border border-dashed border-line-strong bg-surface-2 p-3 text-sm text-muted">{tb.note}</p> : null}
                <Block id="data" title={t('site.methods.s_data')}>
                  <Plain k="site.methods.data_plain" />
                  <Experts k="site.methods.data_experts">
                    {build.data ? <Hash label={t('provenance.build')} value={build.data.buildId} /> : null}
                  </Experts>
                </Block>
                <Block id="seasons" title={t('site.methods.s_seasons')}>
                  <Plain k="site.methods.seasons_plain" />
                  <Experts k="site.methods.seasons_experts" />
                </Block>
                <Block id="how-much" title={t('site.methods.s_how-much')}>
                  <Plain k="site.methods.howmuch_plain" />
                  <Experts k="site.methods.howmuch_experts">
                    <p className="font-semibold">{t('methods.coverage')}</p>
                    <ByTab
                      rows={tb.coverage}
                      tabKey={(r) => r.multiplier}
                      tabLabel={(m) => t('site.methods.multiplier', { m: num(m, lang, 2) })}
                      render={(rows) => (
                        <PivotTable
                          testId="table-coverage"
                          rows={rows}
                          rowKey={(r) => r.n}
                          colKey={(r) => r.phi}
                          corner={t('site.methods.n_phi')}
                          rowLabel={(n) => int(n, lang)}
                          colLabel={(p) => `φ ${num(p, lang, 1)}`}
                          value={(r) => (r.coveragePct === null ? '–' : `${num(r.coveragePct, lang, 1)}%`)}
                        />
                      )}
                    />
                  </Experts>
                </Block>
                <Block id="significant" title={t('site.methods.s_significant')}>
                  <Plain k="site.methods.significant_plain" />
                  <p className="font-semibold">{t('methods.calibration')}</p>
                  <Calibration tables={tb} />
                  <Experts k="site.methods.significant_experts" />
                </Block>
                <Block id="domain" title={t('methods.domain')} tour="methods-domain">
                  <Plain k="site.methods.domain_plain" />
                  <SimpleTable
                    testId="table-phimax"
                    head={[t('site.methods.record_years'), t('site.methods.phi_max')]}
                    rows={tb.phiMax.map((r) => [int(r.n, lang), r.phiMax === null ? '–' : num(r.phiMax, lang, 1)])}
                  />
                  <Experts k="site.methods.domain_experts">
                    <p className="font-semibold">{t('methods.stress')}</p>
                    <SimpleTable
                      testId="table-stress"
                      head={[t('site.methods.stress_family'), 'n', 'm_eff', t('site.methods.false_alarm'), t('site.methods.after_domain')]}
                      rows={tb.stress.map((r) => [
                        <span key="f" className="font-mono text-[13px]">
                          {r.family}
                        </span>,
                        int(r.n, lang),
                        int(r.mEff, lang),
                        r.falseAlarmPct === null ? '–' : `${num(r.falseAlarmPct, lang, 1)}%`,
                        r.falseAlarmAfterDomainPct === null ? '–' : `${num(r.falseAlarmAfterDomainPct, lang, 1)}%`,
                      ])}
                    />
                    <p className="font-semibold">{t('site.methods.leftover_title')}</p>
                    <ByTab
                      rows={tb.leftoverCritical}
                      tabKey={(r) => r.mEff}
                      tabLabel={(m) => `m_eff ${int(m, lang)}`}
                      render={(rows) => (
                        <PivotTable
                          testId="table-leftover"
                          rows={rows}
                          rowKey={(r) => r.n}
                          colKey={(r) => r.phi}
                          corner={t('site.methods.n_phi')}
                          rowLabel={(n) => int(n, lang)}
                          colLabel={(p) => `φ ${num(p, lang, 1)}`}
                          value={(r) => (r.critical === null ? '–' : num(r.critical, lang, 3))}
                        />
                      )}
                    />
                  </Experts>
                </Block>
                <Block id="family" title={t('methods.family')} tour="methods-family">
                  <Plain k="site.methods.family_plain" />
                  <Card className="flex flex-col gap-2 p-4" data-testid="prereg-hash">
                    <p className="inline-flex items-center gap-2 font-semibold">
                      <Fingerprint className="size-5 text-accent-ink" aria-hidden="true" />
                      {t('methods.prereg')}
                    </p>
                    <Hash label="SHA-256" value={tb.prereg.sha256} />
                    <Hash label={t('site.methods.commit')} value={tb.prereg.commit ?? t('site.methods.no_commit')} />
                    {prereg.data ? <PreregFacts prereg={prereg.data} /> : null}
                  </Card>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FamilyList title={t('site.methods.confirmatory', { n: int(tb.families.confirmatory.length, lang), alpha: num(tb.families.alpha, lang, 2) })} items={tb.families.confirmatory} />
                    <FamilyList title={t('site.methods.secondary', { n: int(tb.families.secondary.length, lang), q: num(tb.families.secondaryQ, lang, 2) })} items={tb.families.secondary} />
                  </div>
                  <Experts k="site.methods.family_experts" />
                </Block>
                <Block id="compare" title={t('site.methods.s_compare')}>
                  <Plain k="site.methods.compare_plain" />
                  <Experts k="site.methods.compare_experts">
                    <SimpleTable
                      testId="table-contrast"
                      head={[t('site.methods.contrast_case'), t('site.methods.rates_differ'), t('site.methods.supported_opposite')]}
                      rows={tb.contrast.map((r) => [
                        <span key="c" className="font-mono text-[13px]">
                          {r.case}
                        </span>,
                        r.ratesDifferPct === null ? '–' : `${num(r.ratesDifferPct, lang, 1)}%`,
                        r.supportedOppositePct === null ? '–' : `${num(r.supportedOppositePct, lang, 1)}%`,
                      ])}
                    />
                  </Experts>
                </Block>
                <Block id="checks" title={t('site.methods.s_checks')}>
                  <Plain k="site.methods.checks_plain" />
                  <Experts k="site.methods.checks_experts" />
                </Block>
                <Block id="grade" title={t('site.methods.s_grade')}>
                  <Plain k="site.methods.grade_plain" />
                </Block>
                <Block id="power" title={t('methods.power')}>
                  <Plain k="site.methods.power_plain" />
                  <ByTab
                    rows={tb.power}
                    tabKey={(r) => r.phi}
                    tabLabel={(p) => `φ ${num(p, lang, 1)}`}
                    render={(rows) => (
                      <PivotTable
                        testId="table-power"
                        rows={rows}
                        rowKey={(r) => r.n}
                        colKey={(r) => r.effectSdPerYear}
                        corner={t('site.methods.n_effect')}
                        rowLabel={(n) => int(n, lang)}
                        colLabel={(e) => num(e, lang, 2)}
                        value={(r) => (r.powerPct === null ? '–' : `${num(r.powerPct, lang, 0)}%`)}
                      />
                    )}
                  />
                  <Experts k="site.methods.power_experts" />
                </Block>
                <Block id="maps" title={t('site.methods.s_maps')}>
                  <Plain k="site.methods.maps_plain" />
                  <Experts k="site.methods.maps_experts">
                    {tb.mapNull.length === 0 ? <p className="text-sm text-muted">{t('site.methods.map_null_none')}</p> : null}
                  </Experts>
                </Block>
                <Block id="tests" title={t('methods.golden')}>
                  <p className="inline-flex items-center gap-2 text-[17px]" data-testid="golden-summary">
                    <ShieldCheck className="size-5 text-strong" aria-hidden="true" />
                    {t('site.methods.golden', { passed: int(tb.golden.passed, lang), total: int(tb.golden.total, lang) })}
                  </p>
                  <Plain k="site.methods.tests_plain" />
                </Block>
                <Block id="manifest" title={t('methods.manifest')}>
                  {manifest.status === 'ok' && build.data && manifest.data ? (
                    <ManifestSummary manifest={manifest.data} build={build.data} />
                  ) : (
                    <WithData res={manifest} path="input_manifest.json">
                      {() => null}
                    </WithData>
                  )}
                </Block>
                <Block id="breaks" title={t('site.methods.s_breaks')}>
                  <Plain k="site.methods.breaks_plain" />
                  {catalog.data ? (
                    <ul className="flex flex-col gap-2">
                      {catalog.data.variables
                        .filter((v) => v.status === 'analysed' || v.status === 'sensitivity')
                        .flatMap((v) => (v.record_card?.known_breaks ?? []).map((b) => ({ v, b })))
                        .map(({ v, b }) => (
                          <li key={`${v.id}-${b.id}`} className="rounded-[10px] border border-line bg-surface px-4 py-3 text-[15px]">
                            <span className="font-medium">{pick(v.name, lang)}</span>: {pick(b.label, lang)}{' '}
                            <span className="text-sm text-muted">({b.date ?? t('site.record.gradual')})</span>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </Block>
                <Block id="limits" title={t('site.methods.s_limits')}>
                  <Plain k="site.methods.limits_plain" />
                </Block>
                <Block id="reproduce" title={t('site.methods.s_reproduce')}>
                  <Plain k="site.methods.reproduce_plain" />
                  {build.data ? (
                    <div className="flex flex-col gap-1.5">
                      <Hash label={t('provenance.build')} value={build.data.buildId} />
                      <Hash label={t('provenance.engine')} value={`${build.data.engine.version} · ${build.data.engine.gitSha}`} />
                      {Object.entries(build.data.configHashes).map(([k, v]) => (
                        <Hash key={k} label={k} value={shortHash(v, 24)} />
                      ))}
                    </div>
                  ) : null}
                </Block>
                <Block id="references" title={t('site.methods.s_references')}>
                  <ol className="flex list-decimal flex-col gap-2 pl-6 text-[15px]">
                    {Array.from({ length: 15 }, (_, i) => (
                      <li key={i}>{t(`site.references.r${i + 1}`)}</li>
                    ))}
                  </ol>
                </Block>
              </>
            )}
          </WithData>
        </div>
      </div>
    </Page>
  );
}

function PreregFacts({ prereg }: { prereg: Prereg }) {
  const t = useT();
  const lang = useLang();
  return (
    <dl className="m-0 mt-1 grid gap-1 text-sm">
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted">{t('site.methods.prereg_status')}</dt>
        <dd className="m-0 font-medium">{prereg.status}</dd>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted">{t('site.methods.signed_by')}</dt>
        <dd className="m-0">{prereg.signed_by.join(', ')}</dd>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted">{t('site.methods.thresholds')}</dt>
        <dd className="m-0 tabular">
          {prereg.variables.map((v) => `${v.id}: ${num(v.practical_threshold.default, lang)} ${v.practical_threshold.units}`).join(' · ')}
        </dd>
      </div>
    </dl>
  );
}

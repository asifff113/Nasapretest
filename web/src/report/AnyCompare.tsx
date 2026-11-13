// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Compare any two places (exploration): any two countries or regions with a detail file, side by side — the
// latest yearly values, the year-by-year chart and stripes of both, and the year's rhythm of both. Nothing is
// subtracted and no test is run: a tested answer exists only for the pre-registered pairs (the "Tested pairs"
// mode of the same screen). URL: #/compare?a=<region>&b=<region>&variable=<id>.
import { ArrowLeftRight, Compass } from 'lucide-react';
import { pick, useT } from '../i18n';
import { useCatalog } from '../data/hooks';
import { useExploreIndex, useExploreRegion, type ExploreIndex } from '../data/explore';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { Loading, WithData } from '../components/LoadState';
import { Body } from '../components/Page';
import { Hero } from '../components/atlas/Hero';
import { LocatorGlobe } from '../components/atlas/LocatorGlobe';
import { Badge } from '../ui/common/badge';
import { SegmentedControl } from '../ui/common/toggle-group';
import { cn } from '../ui/common/utils';
import { CompareGlance, RegionSelect, Rhythm, YearByYear } from './ReportBody';

/** The two modes of the compare screen, as links (the URL decides the mode). */
export function CompareModes({ any }: { any: boolean }) {
  const t = useT();
  const view = useView((s) => s.view);
  const tab = (on: boolean) =>
    cn('inline-flex min-h-10 items-center rounded-full px-4 text-[14px] font-semibold', on ? 'bg-accent text-ocean' : 'border border-line-strong hover:border-accent');
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t('site.compare.eyebrow')} data-testid="compare-modes">
      <a href={href({ screen: 'compare', variable: view.variable })} className={tab(!any)} aria-current={!any ? 'page' : undefined}>
        {t('site.any.mode_tested')}
      </a>
      <a
        href={href({
          screen: 'compare',
          a: view.a ?? 'country:BGD',
          b: view.b ?? 'country:IND',
          variable: view.variable,
        })}
        className={tab(any)}
        aria-current={any ? 'page' : undefined}
        data-testid="compare-mode-any"
      >
        {t('site.any.mode_any')}
      </a>
    </nav>
  );
}

function Pickers({ index }: { index: ExploreIndex }) {
  const t = useT();
  const { view, patch } = useView();
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" data-testid="any-pickers">
      <RegionSelect
        index={index}
        value={view.a ?? ''}
        exclude={view.b}
        onPick={(id) => patch({ a: id || undefined }, { replace: true })}
        label={t('site.any.pick_a')}
        testId="any-a"
      />
      <button
        type="button"
        onClick={() => patch({ a: view.b, b: view.a }, { replace: true })}
        aria-label={t('site.any.swap')}
        title={t('site.any.swap')}
        className="grid size-11 place-items-center self-end justify-self-center rounded-full border border-line-strong hover:border-accent"
        data-testid="any-swap"
      >
        <ArrowLeftRight className="size-4" aria-hidden="true" />
      </button>
      <RegionSelect
        index={index}
        value={view.b ?? ''}
        exclude={view.a}
        onPick={(id) => patch({ b: id || undefined }, { replace: true })}
        label={t('site.any.pick_b')}
        testId="any-b"
      />
    </div>
  );
}

export function AnyCompareScreen() {
  const t = useT();
  const lang = useLang();
  const { view, patch } = useView();
  const catalog = useCatalog();
  const index = useExploreIndex();
  const a = useExploreRegion(view.a ?? null);
  const b = useExploreRegion(view.b ?? null);
  const infoA = index.data?.regions.find((r) => r.id === view.a);
  const infoB = index.data?.regions.find((r) => r.id === view.b);
  const nameA = infoA ? pick(infoA.name, lang) : '';
  const nameB = infoB ? pick(infoB.name, lang) : '';
  return (
    <>
      <Hero
        top={<CompareModes any />}
        eyebrow={t('site.compare.eyebrow')}
        title={infoA && infoB ? `${nameA} · ${nameB}` : t('site.any.title')}
        lead={t('site.any.lead')}
        aside={
          infoA && infoB ? (
            <LocatorGlobe
              marks={[
                {
                  lon: infoA.centroid[0],
                  lat: infoA.centroid[1],
                  bbox: infoA.bbox,
                  label: nameA,
                  tone: 'accent',
                },
                {
                  lon: infoB.centroid[0],
                  lat: infoB.centroid[1],
                  bbox: infoB.bbox,
                  label: nameB,
                  tone: 'link',
                },
              ]}
              arc
              size={420}
              label={t('site.compare.locator_alt', { a: nameA, b: nameB })}
              testId="any-locator"
            />
          ) : undefined
        }
      />
      <Body>
        <div className="flex flex-col gap-8" data-testid="any-compare">
          {index.status === 'loading' ? <Loading /> : null}
          {index.data ? <Pickers index={index.data} /> : null}
          <div>
            <Badge tone="exploration">
              <Compass aria-hidden="true" />
              {t('family.exploration')}
            </Badge>
          </div>
          {!view.a || !view.b ? (
            <p className="m-0 rounded-[6px] border border-dashed border-line-strong p-4 text-[14px] text-muted">{t('site.any.empty')}</p>
          ) : (
            <WithData res={a}>
              {(da) => (
                <WithData res={b}>
                  {(db) => {
                    const ids = (index.data?.variables ?? []).map((v) => v.id).filter((id) => da.variables[id] && db.variables[id]);
                    const id = view.variable && ids.includes(view.variable) ? view.variable : (ids[0] ?? '');
                    return (
                      <div className="flex flex-col gap-10">
                        <section aria-labelledby="any-table">
                          <h2 id="any-table" className="mb-3 text-chapter">
                            {t('site.any.table_title')}
                          </h2>
                          <CompareGlance a={da} b={db} ids={ids} catalog={catalog.data} />
                        </section>
                        <section aria-labelledby="any-years">
                          <h2 id="any-years" className="mb-3 text-chapter">
                            {t('site.any.years_title')}
                          </h2>
                          <div className="mb-4">
                            <SegmentedControl
                              size="sm"
                              label={t('site.report.pick_record')}
                              value={id}
                              onValueChange={(v) => patch({ variable: v }, { replace: true })}
                              options={ids.map((x) => ({
                                value: x,
                                label: pick(catalog.data?.variables.find((c) => c.id === x)?.name ?? { en: x, bn: x }, lang),
                                testId: `any-var-${x}`,
                              }))}
                            />
                          </div>
                          <YearByYear key={`${id}_${da.region.id}_${db.region.id}`} data={da} id={id} catalog={catalog.data} compare={db} />
                        </section>
                        <section aria-labelledby="any-clock">
                          <h2 id="any-clock" className="mb-3 text-chapter">
                            {t('site.any.clock_title')}
                          </h2>
                          <Rhythm data={da} id={id} catalog={catalog.data} compare={db} />
                        </section>
                        <p className="m-0 text-[13.5px] text-muted">
                          {t('site.report.compare_note', {
                            record: pick(catalog.data?.variables.find((c) => c.id === id)?.name ?? { en: id, bn: id }, lang),
                          })}
                        </p>
                      </div>
                    );
                  }}
                </WithData>
              )}
            </WithData>
          )}
        </div>
      </Body>
    </>
  );
}

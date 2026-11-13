// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// A region report (exploration) for any country or configured region with a detail file: the head with the
// locator globe and the file's facts, then the report body. Reached from the globe's country view, the country
// directory, the league, or a link (#/place?region=country:<ISO3>&variable=<id>).
import { pick, useT } from '../i18n';
import { int, num } from '../i18n/format';
import { useCatalog } from '../data/hooks';
import { useExploreRegion, type ExploreIndex } from '../data/explore';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { latLon } from '../map/ScreeningMap';
import { WithData } from '../components/LoadState';
import { Body } from '../components/Page';
import { Facts, Hero } from '../components/atlas/Hero';
import { LocatorGlobe } from '../components/atlas/LocatorGlobe';
import { continentName, ReportBody } from './ReportBody';

export function RegionReport({ id, index }: { id: string; index: ExploreIndex }) {
  const t = useT();
  const lang = useLang();
  const { view, patch } = useView();
  const catalog = useCatalog();
  const res = useExploreRegion(id);
  const info = index.regions.find((r) => r.id === id);
  const name = info ? pick(info.name, lang) : id;
  const range = index.variables[0];
  return (
    <>
      <Hero
        top={
          <a href={href({ screen: 'place' })} className="text-[14px] font-medium text-link hover:underline">
            ← {t('site.report.back')}
          </a>
        }
        eyebrow={`${t(`site.report.kind_${info?.kind ?? 'country'}`)} · ${t('site.report.eyebrow')}`}
        title={name}
        lead={t('site.report.lead', { place: name, from: int(range?.first ?? 0, lang), to: int(range?.last ?? 0, lang) })}
        aside={
          info ? (
            <LocatorGlobe marks={[{ lon: info.centroid[0], lat: info.centroid[1], bbox: info.bbox, label: name }]} label={t('site.place.locator_alt', { place: name })} size={400} testId="report-locator" />
          ) : undefined
        }
        facts={
          info ? (
            <Facts
              items={[
                { label: t('site.place.fact_area'), value: int(Math.round(info.areaKm2), lang), note: t('site.place.km2') },
                { label: t('site.report.fact_continent'), value: <span className="text-[20px] leading-tight">{continentName(t, info.continent)}</span> },
                { label: t('site.place.fact_cells'), value: num(info.effectiveCells, lang, 1), testId: 'report-cells' },
                { label: t('site.place.fact_centre'), value: <span className="font-mono text-[17px] leading-tight">{latLon(info.centroid[1], info.centroid[0], lang)}</span> },
              ]}
            />
          ) : undefined
        }
      >
        {info ? (
          <p className="m-0 max-w-[62ch] text-[14px] leading-relaxed text-muted" data-testid="report-support">
            {t(info.passesSupport ? 'site.report.support_yes' : 'site.report.support_no', { share: int(Math.round(info.spillShare * 100), lang) })}
          </p>
        ) : null}
      </Hero>
      <Body>
        <WithData res={res}>
          {(data) => (
            <>
              <ReportBody data={data} index={index} catalog={catalog.data} variable={view.variable} onVariable={(v) => patch({ variable: v }, { replace: true })} />
              <p className="mt-14 border-t border-line pt-4 text-[12.5px] leading-relaxed text-muted">
                {t('site.report.boundary', { source: data.boundary.source, licence: data.boundary.licence })}
              </p>
            </>
          )}
        </WithData>
      </Body>
    </>
  );
}

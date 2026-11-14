// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The Trends screen's tested views (exploration): the chosen area's own trend test and its years against the
// baseline, places ranked by their tested rate with their 95% ranges, a map of countries coloured by their tested
// rate, and latitude by year. Every number is read from the exploration files (the engine's trend statistics, the
// pipeline's anomalies and latitude rows); the screen sorts and colours them and computes nothing.
import { useMemo } from 'react';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import type { CatalogVariable } from '../data/types';
import type { CountryFeature } from '../data/places';
import { exploreForCountryName, useExploreHovmoller, useExploreTrends, type ExploreIndex, type ExploreTrendItem, type ExploreVariable } from '../data/explore';
import { useLang } from '../state/prefs';
import { AnomalyBars, ForestPlot, Hovmoller, TrendMap } from '../charts/PastCharts';
import { TrendLine } from './PastPresent';

function Section({ id, title, lead, children, testId }: { id: string; title: string; lead: string; children: React.ReactNode; testId?: string }) {
  return (
    <section aria-labelledby={id} className="atlas-panel flex flex-col gap-3 rounded-card border border-line bg-surface p-5" data-testid={testId}>
      <h2 id={id} className="m-0 text-chapter">
        {title}
      </h2>
      <p className="m-0 max-w-[75ch] text-[14.5px] leading-relaxed text-muted">{lead}</p>
      {children}
    </section>
  );
}

/** The chosen area's own tested trend, and each of its years against the baseline. */
export function ScopeTrend({ v, scope, variable }: { v: ExploreVariable | undefined; scope: string; variable: CatalogVariable }) {
  const t = useT();
  const lang = useLang();
  const record = pick(variable.name_mid ?? variable.name, lang);
  if (!v) {
    return (
      <Section id="trends-scope-h" title={t('site.trends.scope_title', { scope })} lead={t('site.trends.no_area', { record })} testId="trends-scope">
        {null}
      </Section>
    );
  }
  return (
    <Section id="trends-scope-h" title={t('site.trends.scope_title', { scope })} lead={t('site.past.trend_method')} testId="trends-scope">
      <TrendLine trend={v.trend} units={t('site.past.per_decade_units', { units: v.units })} />
      {v.baseline && v.annualAnomaly ? (
        <AnomalyBars
          years={v.years}
          anomaly={v.annualAnomaly}
          baseline={v.baseline}
          units={v.units}
          colormap={variable.colormap?.trend}
          lang={lang}
          label={t('site.past.anomaly_alt', { record, place: scope })}
          height={240}
          testId="trends-scope-anomaly"
        />
      ) : null}
    </Section>
  );
}

const TOP = 15;

/** Places ranked by their tested rate: the fastest rising and the fastest falling, each with its 95% range. */
export function TrendRanking({ variable, continent, units }: { variable: CatalogVariable; continent: string | null; units: string }) {
  const t = useT();
  const lang = useLang();
  const trends = useExploreTrends(variable.id);
  const record = pick(variable.name_mid ?? variable.name, lang);
  const picked = useMemo(() => {
    const items = (trends.data?.items ?? []).filter((d) => d.kind === 'country' && d.testable && d.ratePerDecade !== null && (!continent || d.continent === continent));
    const sorted = [...items].sort((a, b) => (b.ratePerDecade as number) - (a.ratePerDecade as number));
    const top = sorted.slice(0, TOP);
    const bottom = sorted.slice(Math.max(TOP, sorted.length - TOP));
    return { list: [...top, ...bottom], tested: items.length, out: items.filter((d) => d.standsOut).length };
  }, [trends.data, continent]);
  const names = useMemo(() => new Map(picked.list.map((d) => [d.id, pick(d.name, lang)])), [picked, lang]);
  if (trends.status !== 'ok' || !picked.list.length) return null;
  return (
    <Section
      id="trends-forest-h"
      title={t('site.trends.forest_title')}
      lead={t('site.trends.forest_lead', { record, n: int(TOP, lang), tested: int(picked.tested, lang), out: int(picked.out, lang) })}
      testId="trends-forest"
    >
      <ForestPlot
        items={picked.list}
        names={names}
        units={t('site.past.per_decade_units', { units })}
        colormap={variable.colormap?.trend}
        lang={lang}
        label={t('site.trends.forest_alt', { record })}
      />
    </Section>
  );
}

/** Countries coloured by their tested rate. */
export function CountryTrendMap({ variable, countries, explore, units }: { variable: CatalogVariable; countries: CountryFeature[] | undefined; explore: ExploreIndex | undefined; units: string }) {
  const t = useT();
  const lang = useLang();
  const trends = useExploreTrends(variable.id);
  const byId = useMemo(() => new Map<string, ExploreTrendItem>((trends.data?.items ?? []).map((d) => [d.id, d])), [trends.data]);
  const rateOf = useMemo(
    () => (name: string) => {
      const info = exploreForCountryName(explore, name);
      const it = info ? byId.get(info.id) : undefined;
      return it && it.testable && it.ratePerDecade !== null ? { rate: it.ratePerDecade, standsOut: it.standsOut } : null;
    },
    [explore, byId],
  );
  const record = pick(variable.name_mid ?? variable.name, lang);
  if (trends.status !== 'ok' || !countries) return null;
  return (
    <Section id="trends-map-h" title={t('site.trends.map_title')} lead={t('site.trends.map_lead', { record })} testId="trends-map">
      <TrendMap countries={countries} rateOf={rateOf} units={t('site.past.per_decade_units', { units })} colormap={variable.colormap?.trend} lang={lang} label={t('site.trends.map_alt', { record })} />
    </Section>
  );
}

/** Latitude by year: each latitude band's average against the baseline. */
export function LatitudeYears({ variable }: { variable: CatalogVariable }) {
  const t = useT();
  const lang = useLang();
  const h = useExploreHovmoller(variable.id);
  const record = pick(variable.name_mid ?? variable.name, lang);
  if (h.status !== 'ok' || !h.data) return null;
  const d = h.data;
  return (
    <Section id="trends-hov-h" title={t('site.trends.hov_title')} lead={t('site.trends.hov_lead', { record, from: int(d.baseline[0], lang), to: int(d.baseline[1], lang) })} testId="trends-hovmoller">
      <Hovmoller years={d.years} lat={d.lat} values={d.values} units={d.units} colormap={variable.colormap?.trend} lang={lang} label={t('site.trends.hov_alt', { record })} />
    </Section>
  );
}

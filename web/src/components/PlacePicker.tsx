// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// PlacePicker (docs/04_UI.md §4.3): three lists from regions/index.json. A division that failed the support
// rule is listed, greyed, with the reason. The map is the way to any 1° cell.
// Two looks: a gallery of place cards, each with a small globe (no place chosen yet), and a row of chips
// (a place is open, so the picker steps aside).
import { ArrowRight, Check, Globe2, MapPin } from 'lucide-react';
import { pick, useT } from '../i18n';
import { num } from '../i18n/format';
import type { Region, RegionIndex } from '../data/types';
import { useLang } from '../state/prefs';
import { href, type View } from '../state/view';
import { latLon } from '../map/ScreeningMap';
import { cn } from '../ui/common/utils';
import { LocatorGlobe } from './atlas/LocatorGlobe';

export function groupRegions(index: RegionIndex): { key: string; title: string; regions: Region[] }[] {
  const home = index.regions.filter((r) => r.role === 'home');
  const div = index.regions.filter((r) => r.role === 'division');
  const other = index.regions.filter((r) => r.role !== 'home' && r.role !== 'division');
  return [
    { key: 'home', title: 'place.home', regions: home },
    { key: 'divisions', title: 'place.divisions', regions: div },
    { key: 'comparison', title: 'place.comparison', regions: other },
  ].filter((g) => g.regions.length > 0);
}

export function PlacePicker({
  index,
  value,
  linkFor,
  compact = false,
  tested,
}: {
  index: RegionIndex;
  value?: string;
  linkFor: (regionId: string) => View;
  compact?: boolean;
  /** The pre-registration's region set: only these have tested results (line-ups and verdicts). Other regions
   * that pass the support rule open their report (exploration). Without it every region in the set counts. */
  tested?: ReadonlySet<string>;
}) {
  const t = useT();
  const lang = useLang();
  const groups = groupRegions(index);
  const mapGrid = index.grids.find((g) => g.id === 'merra2_native') ?? index.grids[0];
  const supportOf = (r: Region) => (mapGrid ? r.support[mapGrid.id] : undefined);
  const isTested = (r: Region) => r.inSet && (!tested || tested.has(r.id));

  if (compact) {
    const inSet = index.regions.filter(isTested);
    return (
      <nav aria-label={t('place.region_set')} data-tour="place-picker" data-testid="place-picker">
        <ul className="flex flex-wrap gap-2">
          {inSet.map((r) => {
            const selected = r.id === value;
            return (
              <li key={r.id}>
                <a
                  href={href(linkFor(r.id))}
                  aria-current={selected ? 'true' : undefined}
                  data-testid={`region-${r.id}`}
                  data-in-set="true"
                  className={cn(
                    'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium no-underline transition-colors hover:no-underline',
                    selected ? 'border-accent bg-accent text-ocean' : 'border-line-strong bg-surface/70 text-ink backdrop-blur-sm hover:border-accent/60',
                  )}
                >
                  {selected ? <Check className="size-4" aria-hidden="true" /> : <MapPin className="size-4 text-muted" aria-hidden="true" />}
                  {pick(r.name, lang)}
                </a>
              </li>
            );
          })}
          <li>
            <a href="#/map" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-dashed border-line-strong px-3.5 text-[14px] font-medium no-underline hover:no-underline">
              <Globe2 className="size-4" aria-hidden="true" />
              {t('place.pick_cell')}
            </a>
          </li>
        </ul>
      </nav>
    );
  }

  return (
    <div data-tour="place-picker" data-testid="place-picker" className="flex flex-col gap-9">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`pp-${g.key}`}>
          <h3 id={`pp-${g.key}`} className="eyebrow mb-3">
            {t(g.title)}
          </h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.regions.map((r) => {
              const support = supportOf(r);
              const globe = (
                <LocatorGlobe
                  still
                  bare
                  size={88}
                  className="shrink-0"
                  marks={[{ lon: r.centroid[0], lat: r.centroid[1], bbox: r.bbox }]}
                  label={pick(r.name, lang)}
                />
              );
              if (!r.inSet) {
                return (
                  <li key={r.id}>
                    <div
                      className="flex h-full items-start gap-4 rounded-card border border-dashed border-line-strong px-4 py-4 text-muted"
                      aria-disabled="true"
                      data-testid={`region-${r.id}`}
                      data-in-set="false"
                    >
                      <div className="opacity-50 grayscale">{globe}</div>
                      <span className="min-w-0">
                        <span className="block text-[17px] font-semibold text-ink/70">{pick(r.name, lang)}</span>
                        <span className="mt-1 block text-sm" data-testid="not-in-set">
                          {t('place.not_in_set')}
                        </span>
                        {support ? (
                          <span className="mt-1 block text-sm tabular">{t('place.support', { cells: num(support.effectiveCells, lang, 1) })}</span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={r.id}>
                  <a
                    href={href(linkFor(r.id))}
                    aria-current={r.id === value ? 'true' : undefined}
                    data-testid={`region-${r.id}`}
                    data-in-set="true"
                    data-tested={isTested(r) ? 'true' : 'false'}
                    className="atlas-panel group flex h-full items-start gap-4 rounded-card border border-line bg-surface px-4 py-4 text-ink no-underline transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-accent/60 hover:no-underline hover:shadow-lift"
                  >
                    {globe}
                    <span className="flex min-w-0 flex-1 flex-col self-stretch">
                      <span className="block font-display text-[24px] leading-tight">{pick(r.name, lang)}</span>
                      <span className="mt-1 block font-mono text-[12px] text-muted">{latLon(r.centroid[1], r.centroid[0], lang)}</span>
                      {support ? (
                        <span className="mt-1.5 block text-sm text-muted tabular">{t('place.support', { cells: num(support.effectiveCells, lang, 1) })}</span>
                      ) : null}
                      {isTested(r) ? null : <span className="mt-1.5 block text-sm text-muted">{t('site.place.not_tested')}</span>}
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[14px] font-semibold text-accent-ink">
                        {isTested(r) ? t('site.place.open_case') : t('site.place.open_report')}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <a href="#/map" className="inline-flex min-h-11 items-center gap-2 self-start font-medium">
        <Globe2 className="size-[18px]" aria-hidden="true" />
        {t('place.pick_cell')}
      </a>
    </div>
  );
}

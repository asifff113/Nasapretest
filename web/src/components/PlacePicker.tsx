// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// PlacePicker (docs/04_UI.md §4.3): three lists from regions/index.json. A division that failed the support
// rule is listed, greyed, with the reason. The map is the way to any 1° cell.
import { Check, Grid3x3, MapPin } from 'lucide-react';
import { pick, useT } from '../i18n';
import { num } from '../i18n/format';
import type { Region, RegionIndex } from '../data/types';
import { useLang } from '../state/prefs';
import { href, type View } from '../state/view';
import { cn } from '../ui/common/utils';

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
}: {
  index: RegionIndex;
  value?: string;
  linkFor: (regionId: string) => View;
  compact?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const groups = groupRegions(index);
  const mapGrid = index.grids.find((g) => g.id === 'merra2_native') ?? index.grids[0];
  return (
    <div data-tour="place-picker" data-testid="place-picker" className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`pp-${g.key}`}>
          <h3 id={`pp-${g.key}`} className="eyebrow mb-2">
            {t(g.title)}
          </h3>
          <ul className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
            {g.regions.map((r) => {
              const selected = r.id === value;
              const support = mapGrid ? r.support[mapGrid.id] : undefined;
              if (!r.inSet) {
                return (
                  <li key={r.id}>
                    <div
                      className="flex h-full min-h-14 items-start gap-3 rounded-[10px] border border-dashed border-line-strong bg-surface-2 px-3.5 py-2.5 text-muted"
                      aria-disabled="true"
                      data-testid={`region-${r.id}`}
                      data-in-set="false"
                    >
                      <MapPin className="mt-0.5 size-[18px] shrink-0 opacity-60" aria-hidden="true" />
                      <span>
                        <span className="block font-medium">{pick(r.name, lang)}</span>
                        <span className="mt-0.5 block text-sm" data-testid="not-in-set">
                          {t('place.not_in_set')}
                        </span>
                        {support ? (
                          <span className="mt-0.5 block text-sm tabular">{t('place.support', { cells: num(support.effectiveCells, lang, 1) })}</span>
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
                    aria-current={selected ? 'true' : undefined}
                    data-testid={`region-${r.id}`}
                    data-in-set="true"
                    className={cn(
                      'group flex h-full min-h-14 items-start gap-3 rounded-[10px] border px-3.5 py-2.5 text-ink no-underline transition-colors hover:no-underline',
                      selected ? 'border-accent bg-accent-soft shadow-card' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
                    )}
                  >
                    {selected ? (
                      <Check className="mt-0.5 size-[18px] shrink-0 text-accent-ink" aria-hidden="true" />
                    ) : (
                      <MapPin className="mt-0.5 size-[18px] shrink-0 text-muted group-hover:text-ink" aria-hidden="true" />
                    )}
                    <span>
                      <span className="block font-medium">{pick(r.name, lang)}</span>
                      {support ? (
                        <span className="mt-0.5 block text-sm text-muted tabular">{t('place.support', { cells: num(support.effectiveCells, lang, 1) })}</span>
                      ) : null}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <a href="#/map" className="inline-flex min-h-11 items-center gap-2 self-start font-medium">
        <Grid3x3 className="size-[18px]" aria-hidden="true" />
        {t('place.pick_cell')}
      </a>
    </div>
  );
}

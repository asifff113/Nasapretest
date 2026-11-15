// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// What the globe's side panel shows besides a square (PlaceSheet) and a country (CountryPanel): a registered place
// (graded verdicts), or a record that has no map in this build. Every number is read from a result file; the panel only lays it out.
import { MapPin } from 'lucide-react';
import { pick, useT } from '../i18n';
import { rate as fmtRate } from '../i18n/format';
import type { Catalog, CatalogVariable, Lineup, Region, RegionIndex } from '../data/types';
import { paths } from '../data/results';
import { useResult } from '../data/hooks';
import type { Understood } from '../data/matcher';
import { useLang } from '../state/prefs';
import { href } from '../state/view';
import { RecordCard } from '../components/RecordCard';
import { FamilyBadge, StatusBadge } from '../components/StatusBadge';
import { Loading } from '../components/LoadState';
import { buttonVariants } from '../ui/common/button';

export function UnderstoodChips({ u, placeLabel }: { u: Understood; placeLabel?: string }) {
  const t = useT();
  const lang = useLang();
  const tags = [
    placeLabel,
    u.variable ? pick(u.variable.name, lang) : undefined,
    u.season ? t(`season.${u.season}.long`) : undefined,
    u.compare ? t('site.explore.kind_compare') : undefined,
  ].filter(Boolean) as string[];
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="understood">
      <span className="font-mono uppercase tracking-[0.08em] text-muted">{t('site.explore.understood')}</span>
      {tags.map((x) => (
        <span key={x} className="rounded-full border border-line-strong px-2.5 py-0.5">
          {x}
        </span>
      ))}
    </div>
  );
}

/** A small range glyph: the 95% range as a bar, the rate as a dot, zero as a tick (layout only). */
export function RangeBar({ rate, lo, hi, lang }: { rate: number; lo: number; hi: number; lang: 'en' | 'bn' }) {
  const ext = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(rate)) * 1.25 || 1;
  const pos = (x: number) => 50 + (x / ext) * 48;
  return (
    <div className="relative h-12" aria-hidden="true">
      <div className="absolute inset-x-0 top-[18px] h-0.5 bg-line" />
      <div className="absolute top-[9px] h-5 w-px bg-muted" style={{ left: `${pos(0)}%` }} />
      <span className="absolute -top-1 -translate-x-1/2 font-mono text-[10.5px] text-muted" style={{ left: `${pos(0)}%` }}>
        0
      </span>
      <div className="absolute top-[14px] h-2.5 rounded-full bg-link/45" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
      <div className="absolute top-[12px] size-3.5 -translate-x-1/2 rounded-full bg-link ring-[3px] ring-surface" style={{ left: `${pos(rate)}%` }} />
      <span className="absolute top-[31px] -translate-x-1/2 font-mono text-[10.5px] text-muted" style={{ left: `${pos(lo)}%` }}>
        {fmtRate(lo, lang, rate)}
      </span>
      <span className="absolute top-[31px] -translate-x-1/2 font-mono text-[10.5px] text-muted" style={{ left: `${pos(hi)}%` }}>
        {fmtRate(hi, lang, rate)}
      </span>
    </div>
  );
}

export function RegionPanel({ region, index, catalog, understood }: { region: Region; index: RegionIndex | undefined; catalog: Catalog | undefined; understood?: Understood }) {
  const t = useT();
  const lang = useLang();
  const varName = (id: string) => {
    const v = catalog?.variables.find((x) => x.id === id);
    return v ? pick(v.name, lang) : id;
  };
  const lineup = useResult<Lineup>(paths.lineup(region.id));
  const pairs = (index?.pairs ?? []).filter((p) => p.a === region.id || p.b === region.id);
  return (
    <div className="flex flex-col gap-4" data-testid="explore-region">
      {understood ? <UnderstoodChips u={understood} placeLabel={pick(region.name, lang)} /> : null}
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{t('site.explore.registered')}</p>
      <h2 className="text-[30px] leading-[1.1]">{pick(region.name, lang)}</h2>
      <p className="text-[15px] text-muted">{t('site.explore.registered_note')}</p>
      {lineup.status === 'loading' ? (
        <Loading />
      ) : lineup.data ? (
        <ul className="flex flex-col gap-1.5">
          {lineup.data.items.map((it) => (
            <li key={it.path}>
              <a
                href={href({ screen: 'place', region: region.id, variable: it.variable, season: it.season })}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-line px-3 py-2 text-ink no-underline hover:border-line-strong hover:no-underline"
              >
                <span className="text-sm font-medium">
                  {varName(it.variable)} · <span className="text-muted">{t(`season.${it.season}.long`)}</span>
                </span>
                <span className="flex items-center gap-2 text-sm tabular">
                  {it.ratePerDecade !== null ? fmtRate(it.ratePerDecade, lang) : '–'}
                  <StatusBadge status={it.status} grade={it.grade} reason={it.reason} family={it.family} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <a href={href({ screen: 'place', region: region.id })} className={buttonVariants({ variant: 'accent', size: 'sm' })} data-testid="explore-open-case">
          <MapPin aria-hidden="true" />
          {t('site.explore.open_case')}
        </a>
        {pairs.map((p) => (
          <a key={p.id} href={href({ screen: 'compare', pair: p.id })} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('site.explore.compare_with', { place: pick(index?.regions.find((r) => r.id === (p.a === region.id ? p.b : p.a))?.name, lang) })}
          </a>
        ))}
      </div>
      {pairs[0] ? <FamilyBadge family={pairs[0].preRegistered ? 'confirmatory' : 'exploration'} className="self-start" /> : null}
    </div>
  );
}

export function VariablePanel({ variable, hasMap, understood }: { variable: CatalogVariable; hasMap: boolean; understood?: Understood }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4" data-testid="explore-variable">
      {understood ? <UnderstoodChips u={understood} /> : null}
      <RecordCard variable={variable} />
      <p className="text-[15px] text-muted">
        {variable.status === 'deferred' ? t('site.explore.var_deferred') : hasMap ? t('site.explore.var_has_map') : t('site.explore.var_no_map')}
      </p>
    </div>
  );
}

export function NoPlacePanel({ understood }: { understood: Understood }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3" data-testid="explore-noplace">
      <UnderstoodChips u={understood} />
      <h2 className="text-[30px] leading-[1.1]">{t('site.explore.which_place')}</h2>
      <p className="text-[17px]">{t('site.explore.which_place_body')}</p>
    </div>
  );
}


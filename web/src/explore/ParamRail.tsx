// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe's parameters, always in view: a rail of icons in the top-left corner (tablets and up) or a strip of
// chips under the top bar (phones). One click paints a record's map on the globe; "Just the Earth" takes it off.
// Hovering or focusing an icon shows its name; the chosen one is lit. The rail folds away with its top button.
import { useRef, useState } from 'react';
import { ChevronLeft, CloudFog, CloudRain, Droplets, Earth, Gauge, Layers, Leaf, Satellite, Snowflake, Sprout, Thermometer, Waves, Wind, type LucideIcon } from 'lucide-react';
import { groupIcon, kindLabel } from '../components/atlas/icons';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import type { CatalogVariable } from '../data/types';
import { useLang } from '../state/prefs';
import { cn } from '../ui/common/utils';

/** An icon per record, so records of one group (rain, vapour, runoff…) can be told apart. A record not listed
 * here (a new layer) falls back to its group's icon. */
const ICON: Record<string, LucideIcon> = {
  air_temp: Thermometer,
  rain: CloudRain,
  rain_imerg: Satellite,
  water_vapor: Droplets,
  pressure: Gauge,
  snowfall: Snowflake,
  wind_speed: Wind,
  soil_moisture: Sprout,
  evapotranspiration: CloudFog,
  runoff: Waves,
  greenness: Leaf,
};

export function paramIcon(v: CatalogVariable): LucideIcon {
  return ICON[v.id] ?? groupIcon(v.group);
}

const glass = 'border border-white/12 bg-[#0a1e38]/78 backdrop-blur-xl shadow-[0_12px_30px_-14px_rgb(0_0_0/0.9)]';

function sub(t: ReturnType<typeof useT>, lang: 'en' | 'bn', v: CatalogVariable): string {
  return `${kindLabel(t, v.kind)}${v.record?.from ? ` · ${int(v.record.from, lang)}–` : ''}`;
}

/** Records in order: the tested ones, then the checks (the second rain record). */
function ordered(variables: CatalogVariable[]): CatalogVariable[][] {
  return [variables.filter((v) => v.status === 'analysed'), variables.filter((v) => v.status === 'sensitivity')].filter((g) => g.length > 0);
}

/** Tablets and up: a vertical rail of icons, each with its name on hover or focus. */
export function ParamRail({ variables, value, onPick, open, onOpenChange }: { variables: CatalogVariable[]; value: string | undefined; onPick: (v: CatalogVariable | null) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const lang = useLang();
  const box = useRef<HTMLElement>(null);
  // The name label is drawn outside the scrolling list (which would clip it), beside the icon it belongs to.
  const [label, setLabel] = useState<{ v: CatalogVariable | null; top: number } | null>(null);
  const show = (v: CatalogVariable | null, el: HTMLElement) => {
    const b = box.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (b) setLabel({ v, top: r.top - b.top + r.height / 2 });
  };
  const hide = () => setLabel(null);
  const btn = (v: CatalogVariable | null) => {
    const on = v ? v.id === value : !value;
    const Icon = v ? paramIcon(v) : Earth;
    const name = v ? pick(v.name, lang) : t('site.gx.none');
    return (
      <li key={v?.id ?? 'none'}>
        <button
          type="button"
          onClick={() => onPick(v)}
          onMouseEnter={(e) => show(v, e.currentTarget)}
          onMouseLeave={hide}
          onFocus={(e) => show(v, e.currentTarget)}
          onBlur={hide}
          aria-pressed={on}
          aria-label={name}
          data-testid={v ? `rail-${v.id}` : 'rail-none'}
          className={cn(
            'grid size-10 place-items-center rounded-full transition-[background-color,color,transform] duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent',
            on ? 'bg-accent text-ocean shadow-[0_0_18px_-2px_var(--accent)]' : 'text-ink hover:bg-white/12',
          )}
        >
          <Icon className="size-[19px]" aria-hidden="true" />
        </button>
      </li>
    );
  };
  return (
    <nav ref={box} aria-label={t('site.explore.choose_record')} className={cn('pointer-events-auto relative flex w-14 flex-col items-center gap-1 rounded-[28px] p-2', glass)} data-testid="variable-rail-box">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={open ? t('site.gx.params_hide') : t('site.gx.params_show')}
        title={open ? t('site.gx.params_hide') : t('site.gx.params_show')}
        className="grid size-10 place-items-center rounded-full bg-accent/15 text-accent transition-colors hover:bg-accent/25"
        data-testid="params-toggle"
      >
        {open ? <ChevronLeft className="size-[18px] rotate-90" aria-hidden="true" /> : <Layers className="size-[18px]" aria-hidden="true" />}
      </button>
      {open && label ? (
        <span className={cn('pointer-events-none absolute left-[calc(100%+10px)] z-40 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1.5', glass)} style={{ top: label.top }} aria-hidden="true" data-testid="rail-label">
          <span className="block text-[13.5px] font-semibold leading-tight">{label.v ? pick(label.v.name, lang) : t('site.gx.none')}</span>
          <span className="block text-[11.5px] text-muted">{label.v ? sub(t, lang, label.v) : t('site.gx.none_note')}</span>
        </span>
      ) : null}
      {open ? (
        <ul className="m-0 flex max-h-[calc(100dvh-var(--header-h)-210px)] list-none flex-col items-center gap-1 overflow-y-auto p-0 [scrollbar-width:none]" onScroll={hide} data-testid="variable-rail">
          {btn(null)}
          {ordered(variables).map((group, gi) => (
            <li key={gi} className="contents">
              <span className="my-0.5 h-px w-7 shrink-0 bg-white/15" aria-hidden="true" />
              <ul className="m-0 flex list-none flex-col items-center gap-1 p-0">{group.map((v) => btn(v))}</ul>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}

/** Phones: the same records as a strip of chips under the top bar, scrolled sideways. */
export function ParamStrip({ variables, value, onPick }: { variables: CatalogVariable[]; value: string | undefined; onPick: (v: CatalogVariable | null) => void }) {
  const t = useT();
  const lang = useLang();
  const all: (CatalogVariable | null)[] = [null, ...ordered(variables).flat()];
  return (
    <nav aria-label={t('site.explore.choose_record')} className="pointer-events-auto -mx-3 w-[calc(100%+24px)] overflow-x-auto px-3 [scrollbar-width:none]" data-testid="variable-strip">
      <ul className="m-0 flex w-max list-none gap-1.5 p-0">
        {all.map((v) => {
          const on = v ? v.id === value : !value;
          const Icon = v ? paramIcon(v) : Earth;
          return (
            <li key={v?.id ?? 'none'}>
              <button
                type="button"
                onClick={() => onPick(v)}
                aria-pressed={on}
                data-testid={v ? `strip-${v.id}` : 'strip-none'}
                className={cn('inline-flex min-h-10 max-w-[170px] items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-[13px] font-semibold', on ? 'border border-accent bg-accent text-ocean' : glass)}
              >
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', on ? 'bg-ocean/15' : 'bg-white/10')}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="truncate">{v ? pick(v.name, lang) : t('site.gx.none')}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

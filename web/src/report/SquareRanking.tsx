// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Places ranked by their squares (Trends screen, exploration). A one-line takeaway, the five places with the most
// squares rising and the five with the most falling, then the full list on request, searchable and sortable. Each
// place has a centred bar: its falling squares to the left, its rising squares to the right, the squares that stand
// out after allowing for all the tests drawn darker at the outer ends. Counting and sorting only: no value is
// averaged and no test is run (the counts come from the engine's screening map, as on the rest of the screen).
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useT } from '../i18n';
import { int } from '../i18n/format';
import { useLang } from '../state/prefs';
import { SegmentedControl } from '../ui/common/toggle-group';
import { Button } from '../ui/common/button';

/** The same four colours as the screen's other bar (site.trends.legend). */
const COLOUR = { sigUp: '#c0392b', up: '#e6a093', down: '#9cc0dd', sigDown: '#2e6fa8' };

export interface Counts {
  tested: number;
  up: number;
  down: number;
  sigUp: number;
  sigDown: number;
}

export interface RankedPlace {
  key: string;
  name: string;
  href: string;
  x: Counts;
}

type Order = 'rising' | 'falling' | 'name';

const share = (k: number, n: number) => (n > 0 ? k / n : 0);

/** Most rising first: the share of squares rising, then the share standing out rising (a share, so a large country
 * does not win a tie by its size), then the number tested. */
function byRising(a: RankedPlace, b: RankedPlace): number {
  return share(b.x.up, b.x.tested) - share(a.x.up, a.x.tested) || share(b.x.sigUp, b.x.tested) - share(a.x.sigUp, a.x.tested) || b.x.tested - a.x.tested;
}

function byFalling(a: RankedPlace, b: RankedPlace): number {
  return share(b.x.down, b.x.tested) - share(a.x.down, a.x.tested) || share(b.x.sigDown, b.x.tested) - share(a.x.sigDown, a.x.tested) || b.x.tested - a.x.tested;
}

/** A centred bar: falling to the left of the middle line, rising to the right; each side is the share of the
 * place's tested squares (layout only). */
function CentredBar({ x }: { x: Counts }) {
  // Each half is half the bar; a side's parts are shares of the place's tested squares (layout only).
  const w = (k: number) => `${share(k, x.tested) * 100}%`;
  return (
    <div className="relative h-4 w-full rounded-full bg-ink/[0.07]" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 flex w-1/2 justify-end overflow-hidden rounded-l-full">
        <span className="h-full" style={{ width: w(x.sigDown), background: COLOUR.sigDown }} />
        <span className="h-full" style={{ width: w(x.down - x.sigDown), background: COLOUR.down }} />
      </div>
      <div className="absolute inset-y-0 right-0 flex w-1/2 overflow-hidden rounded-r-full">
        <span className="h-full" style={{ width: w(x.up - x.sigUp), background: COLOUR.up }} />
        <span className="h-full" style={{ width: w(x.sigUp), background: COLOUR.sigUp }} />
      </div>
      <span className="absolute -inset-y-1 left-1/2 w-px -translate-x-1/2 bg-ink/60" />
    </div>
  );
}

const GRID = 'grid grid-cols-[1.5rem_minmax(5.5rem,8.5rem)_1fr] items-center gap-x-2.5 sm:grid-cols-[2rem_minmax(9rem,13rem)_1fr] sm:gap-x-3';

function Row({ p, rank }: { p: RankedPlace; rank: number }) {
  const t = useT();
  const lang = useLang();
  return (
    <li>
      <a href={p.href} className={`${GRID} rounded-[8px] px-2 py-1.5 text-ink no-underline hover:bg-ink/[0.05] hover:no-underline`} data-testid="rank-row">
        <span className="font-mono text-[12px] text-muted tabular">{int(rank, lang)}</span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[14.5px] font-medium">{p.name}</span>
          <span className="font-mono text-[11px] text-muted tabular sm:truncate">
            {t('site.trends.rank_row', { up: int(p.x.up, lang), down: int(p.x.down, lang), tested: int(p.x.tested, lang) })}
          </span>
        </span>
        <CentredBar x={p.x} />
      </a>
    </li>
  );
}

function Axis() {
  const t = useT();
  return (
    <div className={`${GRID} !hidden px-2 text-[11.5px] text-muted sm:!grid`} aria-hidden="true">
      <span />
      <span />
      <span className="flex justify-between whitespace-nowrap">
        <span>{t('site.trends.axis_falling')}</span>
        <span>{t('site.trends.axis_rising')}</span>
      </span>
    </div>
  );
}

function Shortlist({ title, icon, places, testId }: { title: string; icon: React.ReactNode; places: RankedPlace[]; testId: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4" data-testid={testId}>
      <h3 className="m-0 inline-flex items-center gap-1.5 text-[15px] font-semibold">
        {icon}
        {title}
      </h3>
      <Axis />
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {places.map((p, i) => (
          <Row key={p.key} p={p} rank={i + 1} />
        ))}
      </ol>
    </div>
  );
}

export function SquareRanking({ places, record }: { places: RankedPlace[]; record: string }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<Order>('rising');
  const [query, setQuery] = useState('');
  const rising = useMemo(() => [...places].sort(byRising), [places]);
  const falling = useMemo(() => [...places].sort(byFalling), [places]);
  const majority = useMemo(() => places.filter((p) => p.x.up > p.x.down).length, [places]);
  const full = useMemo(() => {
    const list = order === 'rising' ? rising : order === 'falling' ? falling : [...places].sort((a, b) => a.name.localeCompare(b.name));
    const q = query.trim().toLowerCase();
    // The rank shown is the place in the chosen order, kept when a search narrows the list.
    return list.map((p, i) => ({ p, rank: i + 1 })).filter(({ p }) => !q || p.name.toLowerCase().includes(q));
  }, [order, rising, falling, places, query]);
  if (places.length === 0) return null;
  const n = Math.min(5, Math.floor(places.length / 2) || 1);

  return (
    <section aria-labelledby="trends-rank" className="flex flex-col gap-4" data-testid="trends-ranking">
      <div>
        <h2 id="trends-rank" className="mb-1 text-chapter">
          {t('site.trends.rank_title')}
        </h2>
        <p className="m-0 max-w-[70ch] text-[14.5px] text-muted">{t('site.trends.rank_lead', { record })}</p>
      </div>
      <p className="m-0 font-display text-[22px] leading-snug sm:text-[26px]" data-testid="rank-insight">
        {t('site.trends.rank_insight', { n: int(majority, lang), total: int(places.length, lang), record })}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Shortlist title={t('site.trends.top_title')} icon={<ArrowUpRight className="size-4" aria-hidden="true" />} places={rising.slice(0, n)} testId="rank-top" />
        <Shortlist title={t('site.trends.bottom_title')} icon={<ArrowDownRight className="size-4" aria-hidden="true" />} places={falling.slice(0, n)} testId="rank-bottom" />
      </div>
      <p className="m-0 text-[13px] text-muted">{t('site.trends.rank_legend')}</p>
      <div>
        <Button variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="rank-all" data-testid="rank-toggle">
          {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {open ? t('site.trends.show_less') : t('site.trends.show_all', { n: int(places.length, lang) })}
        </Button>
      </div>
      {open ? (
        <div id="rank-all" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4" data-testid="rank-all">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex min-w-0 flex-1 items-center sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('site.trends.search')}
                aria-label={t('site.trends.search')}
                className="min-h-10 w-full rounded-[8px] border border-line-strong bg-bg pl-9 pr-3 text-[15px]"
                data-testid="rank-search"
              />
            </label>
            <SegmentedControl
              size="sm"
              label={t('site.trends.order')}
              value={order}
              onValueChange={(v) => setOrder(v as Order)}
              options={[
                { value: 'rising', label: t('site.trends.order_rising'), testId: 'rank-order-rising' },
                { value: 'falling', label: t('site.trends.order_falling'), testId: 'rank-order-falling' },
                { value: 'name', label: t('site.trends.order_name'), testId: 'rank-order-name' },
              ]}
            />
          </div>
          <Axis />
          {full.length === 0 ? (
            <p className="m-0 text-[14px] text-muted">{t('site.trends.no_match')}</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
              {full.map(({ p, rank }) => (
                <Row key={p.key} p={p} rank={rank} />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}

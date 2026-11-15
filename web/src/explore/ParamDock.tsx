// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe's "Parameters" button (top left). It opens a staircase of the records this build has data for: each
// step slides out a little further right, so the list reads as a flight of stairs off the button. Picking a step
// paints that record's screening map on the globe; "Just the Earth" takes the layer off again.
import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Earth, Layers, X } from 'lucide-react';
import { GroupIcon, kindLabel } from '../components/atlas/icons';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import type { CatalogVariable } from '../data/types';
import { useLang } from '../state/prefs';
import { cn } from '../ui/common/utils';

export function ParamDock({
  variables,
  value,
  onPick,
  onOpenChange,
}: {
  variables: CatalogVariable[];
  value: string | undefined;
  /** Called with the record, or null for "just the Earth". */
  onPick: (v: CatalogVariable | null) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const [open, setOpenState] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const current = variables.find((v) => v.id === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('[data-testid="params-toggle"]')?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
    // setOpen is stable enough here (it only wraps state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups: [string, CatalogVariable[]][] = [
    ['site.explore.group_tested', variables.filter((v) => v.status === 'analysed')],
    ['site.explore.group_checks', variables.filter((v) => v.status === 'sensitivity')],
  ];
  let step = 0;
  const stair = (i: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: -28, y: -10, scale: 0.92 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -18, scale: 0.95, transition: { duration: 0.12, delay: 0 } },
    transition: { type: 'spring' as const, stiffness: 420, damping: 30, delay: reduce ? 0 : 0.03 * i },
  });
  // Each step sits a little further right than the one above it (a staircase); phones keep a straight column.
  const indent = (i: number) => ({ '--step': `${Math.min(i, 8) * 9}px` }) as React.CSSProperties;

  const item = (v: CatalogVariable | null) => {
    const i = step++;
    const on = v ? v.id === value : !value;
    return (
      <motion.li key={v?.id ?? 'none'} {...stair(i)} style={indent(i)} className="sm:pl-[var(--step)]">
        <button
          type="button"
          onClick={() => {
            onPick(v);
            setOpen(false);
          }}
          aria-pressed={on}
          data-testid={v ? `rail-${v.id}` : 'rail-none'}
          className={cn(
            'group flex min-h-11 w-full items-center gap-3 rounded-full border py-1.5 pl-1.5 pr-4 text-left shadow-[0_10px_30px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl transition-[background-color,border-color,transform] duration-150 hover:translate-x-1 sm:w-auto sm:min-w-[300px]',
            on ? 'border-accent bg-accent/25' : 'border-white/15 bg-[#0a1e38]/80 hover:border-accent/70 hover:bg-[#12325a]/90',
          )}
        >
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full transition-colors', on ? 'bg-accent text-ocean' : 'bg-white/10 text-ink group-hover:bg-accent/30')}>
            {v ? <GroupIcon group={v.group} className="size-4" /> : <Earth className="size-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold leading-tight">{v ? pick(v.name, lang) : t('site.gx.none')}</span>
            <span className="block truncate text-[11.5px] text-muted">
              {v ? `${kindLabel(t, v.kind)}${v.record?.from ? ` · ${int(v.record.from, lang)}–` : ''}` : t('site.gx.none_note')}
            </span>
          </span>
          {on ? <Check className="size-4 shrink-0 text-accent" aria-hidden="true" /> : null}
        </button>
      </motion.li>
    );
  };

  return (
    <div ref={root} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="params-toggle"
        className={cn(
          'params-orb group relative inline-flex min-h-12 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-[14px] font-semibold backdrop-blur-xl transition-colors',
          open ? 'border-accent bg-accent text-ocean' : 'border-accent/50 bg-[#0a1e38]/80 text-ink hover:border-accent',
        )}
      >
        <span className={cn('relative grid size-9 place-items-center rounded-full', open ? 'bg-ocean/15' : 'bg-accent text-ocean')}>
          {open ? <X className="size-[18px]" aria-hidden="true" /> : <Layers className="size-[18px]" aria-hidden="true" />}
          {!open && !current ? <span className="params-ping absolute inset-0 rounded-full" aria-hidden="true" /> : null}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span>{t('site.gx.params')}</span>
          <span className={cn('max-w-[84px] truncate text-[11.5px] font-medium sm:max-w-[180px]', open ? 'text-ocean/80' : 'text-muted')} data-testid="params-current">
            {current ? pick(current.name, lang) : t('site.gx.none')}
          </span>
        </span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.nav
            id={menuId}
            aria-label={t('site.explore.choose_record')}
            data-testid="variable-rail"
            className="absolute left-0 top-[calc(100%+10px)] z-30 w-[min(360px,calc(100vw-24px))] sm:w-auto"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
          >
            {/* The stair rail: a thin line the steps hang from. */}
            <span className="pointer-events-none absolute left-[22px] top-0 hidden h-full w-px bg-gradient-to-b from-accent/70 via-accent/25 to-transparent sm:block" aria-hidden="true" />
            <ul className="m-0 flex max-h-[calc(100dvh-var(--header-h)-120px)] list-none flex-col gap-1.5 overflow-y-auto p-0 pb-2 [scrollbar-width:none]">
              {item(null)}
              {groups.map(([title, list]) =>
                list.length ? (
                  <li key={title} className="contents">
                    <motion.p {...stair(step)} className="m-0 mt-1.5 pl-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-accent sm:pl-12">
                      {t(title)}
                    </motion.p>
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{list.map((v) => item(v))}</ul>
                  </li>
                ) : null,
              )}
            </ul>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

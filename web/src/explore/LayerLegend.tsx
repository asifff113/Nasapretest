// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe's colour key, folded to a small pill: the colour ramp with its two ends and the units. Unfolded it says
// in plain words what a square's colour means (its fitted change per decade), what bright, faded and hatched mean,
// and holds the "see the Earth through the colours" slider. Every number is the map file's own.
import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Eye, Info } from 'lucide-react';
import { useT } from '../i18n';
import { int, rate as fmtRate } from '../i18n/format';
import type { MapLayer } from '../data/results';
import { useLang } from '../state/prefs';
import { diverging } from '../map/colours';
import { cn } from '../ui/common/utils';

export function LayerLegend({
  layer,
  colormap,
  opacity,
  onOpacity,
  columns = false,
  defaultOpen = false,
  className,
}: {
  layer: MapLayer;
  colormap: string | undefined;
  opacity?: number;
  onOpacity?: (v: number) => void;
  columns?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const interp = diverging(colormap);
  const stops = Array.from({ length: 9 }, (_, i) => interp(i / 8)).join(', ');
  const lim = layer.meta.colourLimit;
  const units = t('map.legend_rate', { units: layer.meta.units });
  return (
    <div
      className={cn('pointer-events-auto w-[280px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[18px] border border-white/12 bg-[#0a1e38]/80 text-xs shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)] backdrop-blur-xl', className)}
      data-testid="map-legend"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.04]"
        data-testid="legend-toggle"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold">{units}</span>
          <span className="mt-1.5 block h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} aria-hidden="true" />
          <span className="mt-1 flex justify-between font-mono text-[10.5px] text-muted tabular">
            <span>{fmtRate(-lim, lang)}</span>
            <span>0</span>
            <span>{fmtRate(lim, lang)}</span>
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-accent">
            <Info className="size-3.5" aria-hidden="true" />
            {open ? t('site.gx.legend_less') : t('site.gx.legend_more')}
          </span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={bodyId}
            key="body"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="flex flex-col gap-2.5 border-t border-white/10 px-3.5 pb-3.5 pt-3">
              <p className="m-0 text-[12.5px] leading-snug text-ink">
                {t('site.gx.legend_what', { from: int(layer.meta.window.first, lang), to: int(layer.meta.window.last, lang) })}
              </p>
              <div className="flex justify-between text-[11px] text-muted">
                <span>← {t('site.gx.legend_down')}</span>
                <span>{t('site.gx.legend_up')} →</span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12px] leading-snug text-muted">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-3 w-4 shrink-0 rounded-[3px]" style={{ background: interp(0.88) }} aria-hidden="true" />
                  <span>{t('site.gx.key_bright')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-3 w-4 shrink-0 rounded-[3px] opacity-45" style={{ background: interp(0.88) }} aria-hidden="true" />
                  <span>{t('site.gx.key_faded', { n: int(layer.meta.nTestable, lang) })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="hatch mt-0.5 inline-block h-3 w-4 shrink-0 rounded-[3px] border border-line-strong" aria-hidden="true" />
                  <span>{t('map.legend_hatch')}</span>
                </li>
              </ul>
              {columns ? <p className="m-0 rounded-[8px] bg-accent/15 px-2 py-1.5 text-[12px] text-ink">{t('site.explore.columns_note')}</p> : null}
              {opacity !== undefined && onOpacity ? (
                <label className="flex flex-col gap-1 rounded-[10px] bg-white/[0.04] px-2.5 py-2" htmlFor="layer-strength">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                    <Eye className="size-3.5" aria-hidden="true" />
                    {t('site.explore.strength')}
                  </span>
                  <input
                    id="layer-strength"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(opacity * 100)}
                    onChange={(e) => onOpacity(Number(e.target.value) / 100)}
                    className="w-full accent-[var(--accent)]"
                  />
                  <span className="flex justify-between text-[10.5px] text-muted">
                    <span>{t('site.gx.strength_low')}</span>
                    <span>{t('site.gx.strength_high')}</span>
                  </span>
                </label>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* The key is always read out, folded or not. */}
      {open ? null : (
        <p className="sr-only">
          {t('site.gx.key_bright')} {t('map.legend_hatch')}
        </p>
      )}
    </div>
  );
}

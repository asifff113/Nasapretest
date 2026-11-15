// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe's year dock: a slim bar along the bottom edge, so the globe stays in view. It holds what the globe paints
// (each year against the baseline, each year's values, or the last ten years against the first ten), play and pause,
// one notch per year of the file, and the colour scale. Values are the frames' own; nothing is computed here.
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Pause, Play, X } from 'lucide-react';
import { useT } from '../i18n';
import { int, num, rate as fmtRate } from '../i18n/format';
import type { Frames, FramesKind } from '../data/explore';
import type { LoadStatus } from '../data/hooks';
import { useLang } from '../state/prefs';
import { diverging, sequential } from '../map/colours';
import { SegmentedControl } from '../ui/common/toggle-group';
import { cn } from '../ui/common/utils';

export function YearDock({
  status,
  frames,
  kind,
  kinds,
  onKind,
  frame,
  onFrame,
  playing,
  onPlay,
  colormap,
  trendColormap,
  rule,
  name,
  onClose,
}: {
  status: LoadStatus;
  frames: Frames | null;
  kind: FramesKind;
  kinds: FramesKind[];
  onKind: (k: FramesKind) => void;
  frame: number;
  onFrame: (i: number) => void;
  playing: boolean;
  onPlay: (on: boolean) => void;
  colormap: string | undefined;
  trendColormap: string | undefined;
  rule: 'mean' | 'sum';
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [note, setNote] = useState(false);
  const box =
    'pointer-events-auto flex w-[min(720px,calc(100vw-24px))] flex-col gap-2 rounded-[20px] border border-white/12 bg-[#0a1e38]/82 px-3 py-2.5 text-xs shadow-[0_24px_60px_-24px_rgb(0_0_0/0.95)] backdrop-blur-xl sm:px-4';
  const order: FramesKind[] = ['anomaly', 'values', 'change'];
  const picker =
    kinds.length > 1 ? (
      <SegmentedControl
        size="sm"
        label={t('site.years.kind')}
        value={kind}
        onValueChange={(v) => onKind(v as FramesKind)}
        options={order.filter((k) => kinds.includes(k)).map((k) => ({ value: k, label: t(`site.years.kind_${k}`), testId: `years-kind-${k}` }))}
        className="border-white/10 bg-white/[0.05] p-0.5"
      />
    ) : null;
  const close = (
    <button type="button" onClick={onClose} aria-label={t('site.gx.years_close')} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink" data-testid="years-close">
      <X className="size-4" aria-hidden="true" />
    </button>
  );
  if (!frames) {
    return (
      <div className={box} data-testid="years-panel">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{picker}</div>
          {close}
        </div>
        <p className="m-0 py-1">{status === 'loading' ? t('site.years.loading') : t('site.years.missing')}</p>
      </div>
    );
  }
  const ys = frames.years;
  const single = frames.kind === 'change';
  const interp = frames.kind === 'values' ? sequential(colormap) : diverging(trendColormap);
  const stops = Array.from({ length: 9 }, (_, i) => interp(i / 8)).join(', ');
  const year = ys[frame] ?? ys[ys.length - 1] ?? 0;
  const period = (p: [number, number] | undefined) => (p ? `${int(p[0], lang)}–${int(p[1], lang)}` : '');
  const legend =
    frames.kind === 'values'
      ? t(rule === 'sum' ? 'site.years.legend_sum' : 'site.years.legend_mean', { units: frames.units })
      : frames.kind === 'anomaly'
        ? t('site.years.legend_anomaly', { units: frames.units, base: period(frames.baseline) })
        : t('site.years.legend_change', { units: frames.units, early: period(frames.early), late: period(frames.late) });
  const step = (d: number) => {
    onPlay(false);
    onFrame(Math.max(0, Math.min(ys.length - 1, frame + d)));
  };
  return (
    <div className={box} data-testid="years-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {single ? (
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[11.5px] text-muted">{t('site.years.change_title', { record: name })}</p>
            <p className="m-0 font-display text-[22px] leading-tight tabular" data-testid="years-year">
              {t('site.years.change_periods', { early: period(frames.early), late: period(frames.late) })}
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onPlay(!playing)}
              aria-label={playing ? t('site.years.pause') : t('site.years.play')}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-ocean shadow-[0_0_0_6px_rgb(233_180_76/0.15)] hover:brightness-110"
              data-testid="years-play"
            >
              {playing ? <Pause className="size-[18px]" aria-hidden="true" /> : <Play className="size-[18px]" aria-hidden="true" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[11.5px] text-muted">{t(frames.kind === 'anomaly' ? 'site.years.anomaly_title' : 'site.years.title', { record: name })}</p>
              <p className="m-0 flex items-center gap-1 font-display text-[28px] leading-none tabular">
                <button type="button" onClick={() => step(-1)} disabled={frame <= 0} aria-label={t('site.years.prev')} className="grid size-7 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink disabled:opacity-30" data-testid="years-prev">
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <span aria-live="polite" data-testid="years-year">
                  {int(year, lang)}
                </span>
                <button type="button" onClick={() => step(1)} disabled={frame >= ys.length - 1} aria-label={t('site.years.next')} className="grid size-7 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink disabled:opacity-30" data-testid="years-next">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </p>
            </div>
          </>
        )}
        <div className="order-last w-full sm:order-none sm:w-auto">{picker}</div>
        {close}
      </div>
      {single ? null : (
        <div>
          <div role="group" aria-label={t('site.years.timeline')} className="flex h-7 items-end gap-[2px]" data-testid="years-timeline">
            {ys.map((y, i) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  onPlay(false);
                  onFrame(i);
                }}
                aria-label={int(y, lang)}
                aria-pressed={i === frame}
                title={int(y, lang)}
                className={cn(
                  'min-w-0 flex-1 rounded-[2px] transition-[height,background-color] duration-150',
                  i === frame ? 'h-7 bg-accent shadow-[0_0_10px_rgb(233_180_76/0.8)]' : i < frame ? 'h-2.5 bg-accent/50 hover:h-5 hover:bg-accent/80' : 'h-2.5 bg-white/20 hover:h-5 hover:bg-accent/70',
                )}
                data-testid={`years-year-${y}`}
              />
            ))}
          </div>
          <div className="relative mt-0.5 h-3.5 font-mono text-[10px] text-muted tabular" aria-hidden="true">
            {ys.map((y, i) =>
              y % 10 === 0 || i === 0 || i === ys.length - 1 ? (
                <span key={y} className="absolute -translate-x-1/2" style={{ left: `${((i + 0.5) / ys.length) * 100}%` }}>
                  {int(y, lang)}
                </span>
              ) : null,
            )}
          </div>
          <label className="sr-only" htmlFor="years-slider">
            {t('site.years.slider')}
          </label>
          <input
            id="years-slider"
            type="range"
            min={0}
            max={ys.length - 1}
            step={1}
            value={frame}
            onChange={(e) => {
              onPlay(false);
              onFrame(Number(e.target.value));
            }}
            aria-valuetext={int(year, lang)}
            className="sr-only"
            data-testid="years-slider"
          />
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 font-mono text-[10.5px] text-muted tabular">{frames.kind === 'values' ? num(frames.lo, lang) : `≤ ${fmtRate(frames.lo, lang)}`}</span>
        <span className="h-2 min-w-[60px] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} aria-hidden="true" />
        <span className="shrink-0 font-mono text-[10.5px] text-muted tabular">{frames.kind === 'values' ? num(frames.hi, lang) : `≥ ${fmtRate(frames.hi, lang)}`}</span>
        <button type="button" onClick={() => setNote(!note)} aria-expanded={note} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted hover:bg-white/10 hover:text-ink" data-testid="years-about">
          <Info className="size-3.5" aria-hidden="true" />
          {t('site.gx.years_about')}
        </button>
      </div>
      <p className="m-0 text-[11.5px] font-semibold" data-testid="years-legend">
        {legend}
      </p>
      {note ? <p className="m-0 text-[11.5px] leading-snug text-muted">{t(`site.years.note_${frames.kind}`)}</p> : null}
    </div>
  );
}

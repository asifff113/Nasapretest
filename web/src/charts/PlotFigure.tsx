// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Renders an Observable Plot chart into the page and redraws it when its width, theme or language changes.
import { useEffect, useRef, useState } from 'react';
import type { PlotOptions } from '@observablehq/plot';
import * as Plot from '@observablehq/plot';
import { cn } from '../ui/common/utils';

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (Math.abs(prev - w) > 2 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function PlotFigure({
  build,
  deps,
  className,
  label,
  testId,
  tour,
  minHeight = 240,
}: {
  /** Builds the plot options for a given pixel width. */
  build: (width: number) => PlotOptions;
  deps: unknown[];
  className?: string;
  /** Text alternative (docs/04_UI.md §6.1: the headline). */
  label: string;
  testId?: string;
  tour?: string;
  minHeight?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || width <= 0) return;
    const chart = Plot.plot({ ...build(width), width });
    chart.setAttribute('aria-hidden', 'true');
    el.replaceChildren(chart);
    return () => {
      chart.remove();
    };
    // `build` closes over `deps`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, ...deps]);
  return (
    <figure ref={ref} className={cn('cfe-plot m-0 w-full', className)} role="img" aria-label={label} data-testid={testId} data-tour={tour} style={{ minHeight }}>
      <div ref={host} />
    </figure>
  );
}

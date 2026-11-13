// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The atlas page head (ADR-24): a full-width plate with a faint graticule, the page's eyebrow, serif title and
// lead, an optional row of facts read from the result files, and an optional picture (a locator globe) at right.
// A coordinate ruler runs along the bottom edge.
import type { ReactNode } from 'react';
import { cn } from '../../ui/common/utils';

export function Hero({
  eyebrow,
  title,
  lead,
  facts,
  aside,
  children,
  top,
  className,
  wide = true,
}: {
  /** Narrow pages (text pages) line the head up with their 900 px column. */
  wide?: boolean;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  facts?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  /** Above the eyebrow (a back link or a notice). */
  top?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('atlas-hero relative overflow-hidden border-b border-line', className)}>
      <div className="atlas-hero-grid" aria-hidden="true" />
      <div
        className={cn(
          'relative mx-auto grid w-full items-center gap-8 px-4 pb-12 pt-8 sm:px-6 sm:pt-10 lg:pb-14',
          wide ? 'max-w-[1280px]' : 'max-w-[900px]',
          aside ? 'lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]' : '',
        )}
      >
        <div className="min-w-0">
          {top ? <div className="mb-5">{top}</div> : null}
          {eyebrow ? (
            <p className="eyebrow mb-3 inline-flex items-center gap-2 text-accent-ink">
              <span className="inline-block size-1.5 rotate-45 bg-accent" aria-hidden="true" />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-display max-w-[22ch]">{title}</h1>
          {lead ? <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-muted sm:text-[18px]">{lead}</p> : null}
          {children ? <div className="mt-6">{children}</div> : null}
          {facts ? <div className="mt-8">{facts}</div> : null}
        </div>
        {aside ? <div className="flex min-w-0 justify-center lg:justify-end">{aside}</div> : null}
      </div>
      <div className="atlas-ruler" aria-hidden="true" />
    </section>
  );
}

export interface Fact {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  testId?: string;
}

/** A row of facts: mono label over a large tabular value. */
export function Facts({ items, className }: { items: Fact[]; className?: string }) {
  return (
    <dl
      className={cn(
        'grid overflow-hidden rounded-card border border-line bg-line [gap:1px]',
        items.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : items.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2',
        className,
      )}
    >
      {items.map((f, i) => (
        <div key={i} className="min-w-0 bg-surface/90 px-4 py-3.5 backdrop-blur-sm" data-testid={f.testId}>
          <dt className="eyebrow truncate">{f.label}</dt>
          <dd className="m-0 mt-1 font-display text-[28px] leading-none tabular text-ink">{f.value}</dd>
          {f.note ? <dd className="m-0 mt-1.5 text-[13px] text-muted">{f.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

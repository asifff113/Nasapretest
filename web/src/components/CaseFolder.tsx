// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The case folder: an amber tab with the case id over a paper card (docs/05_BUILD_PLAN.md Part 3, design direction).
import { forwardRef, type ReactNode } from 'react';
import { cn } from '../ui/common/utils';

export const CaseFolder = forwardRef<
  HTMLElement,
  { caseId: string; tabLabel?: string; children: ReactNode; className?: string; testId?: string; tour?: string; id?: string; live?: boolean }
>(({ caseId, tabLabel, children, className, testId, tour, id, live }, ref) => (
  <article
    ref={ref}
    id={id}
    tabIndex={id ? -1 : undefined}
    data-testid={testId}
    data-tour={tour}
    aria-live={live ? 'polite' : undefined}
    className={cn('relative pt-[30px] outline-none', className)}
  >
    <div className="absolute left-0 top-0 flex h-[31px] max-w-[85%] items-center gap-2 rounded-t-[10px] bg-accent-ink px-3.5 text-white dark:text-bg">
      {tabLabel ? <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em]">{tabLabel}</span> : null}
      <span className="truncate font-mono text-[12px] font-medium tracking-wide" title={caseId}>
        {caseId}
      </span>
    </div>
    <div className="paper-edge relative rounded-[10px] rounded-tl-none border border-line bg-surface shadow-lift">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] rounded-tr-[10px] bg-accent-ink/80" aria-hidden="true" />
      {children}
    </div>
  </article>
));
CaseFolder.displayName = 'CaseFolder';

export function Section({ title, children, testId, className }: { title: string; children: ReactNode; testId?: string; className?: string }) {
  return (
    <section className={cn('border-t border-line px-5 py-4 sm:px-6', className)} data-testid={testId}>
      <h3 className="mb-2.5 text-[15px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function SentenceList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn('flex flex-col gap-1.5 text-[15px] leading-relaxed', className)}>
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../ui/common/utils';

export function Page({ children, className, wide = true }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 pb-10 pt-6 sm:px-6 sm:pt-8', wide ? 'max-w-[1280px]' : 'max-w-[860px]', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, lead, children }: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 sm:mb-8">
      {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
      <h1 className="text-h1 max-w-[28ch] sm:max-w-[36ch]">{title}</h1>
      {lead ? <p className="mt-3 max-w-[68ch] text-[17px] leading-relaxed text-muted">{lead}</p> : null}
      {children}
    </header>
  );
}

export function StepHeading({ n, title, id, children }: { n: number; title: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1" id={id}>
      <span className="font-mono text-[13px] font-medium text-accent-ink" aria-hidden="true">
        {String(n).padStart(2, '0')}
      </span>
      <h2 className="text-h2">{title}</h2>
      {children}
    </div>
  );
}

/**
 * Phones: a sticky bottom bar with Back · Next (44 px targets) that moves between the steps of a screen
 * (docs/04_UI.md §3). The confidence spine sits above it.
 */
export function StepBar({ steps, current, onGo }: { steps: { id: string; label: string }[]; current: number; onGo: (i: number) => void }) {
  const t = useT();
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const set = () => document.documentElement.style.setProperty('--bottombar', mq.matches ? '64px' : '0px');
    set();
    mq.addEventListener('change', set);
    return () => {
      mq.removeEventListener('change', set);
      document.documentElement.style.setProperty('--bottombar', '0px');
    };
  }, []);
  const prev = current > 0 ? steps[current - 1] : undefined;
  const next = current < steps.length - 1 ? steps[current + 1] : undefined;
  return (
    <nav aria-label={t('site.common.steps')} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
      <div className="flex h-16 items-center gap-2 px-3">
        <button
          type="button"
          disabled={!prev}
          onClick={() => onGo(current - 1)}
          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-[10px] px-3 font-medium text-ink hover:bg-ink/[0.06] disabled:opacity-35"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
          <span>{t('site.common.back')}</span>
        </button>
        <ol className="flex flex-1 items-center justify-center gap-1.5" aria-label={t('site.common.progress')}>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-current={i === current ? 'step' : undefined}
                aria-label={s.label}
                className="flex size-6 items-center justify-center"
              >
                <span className={cn('block h-2 rounded-full transition-all', i === current ? 'w-5 bg-accent' : 'w-2 bg-line-strong')} />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          disabled={!next}
          onClick={() => onGo(current + 1)}
          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-[10px] bg-ink px-3 font-medium text-bg disabled:opacity-35"
        >
          <span>{next ? next.label : t('site.common.next')}</span>
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/** Scrolls to a step by element id, respecting reduced motion. */
export function goToStep(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** Tracks which step section is on screen (for the step bar). */
export function useStepObserver(ids: string[], onChange: (i: number) => void, ready = true): void {
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0];
        if (top) onChange(ids.indexOf(top.target.id));
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|'), ready]);
}

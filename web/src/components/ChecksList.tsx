// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// ChecksList (docs/04_UI.md §5): one row per check, with ✓ passed, ! doubt, i note, – skipped.
// The sentences are the engine's (text.checks); the marks come from the same result's "robustness" block,
// in the order the engine writes the sentences: gaps, coverage (unless skipped), breaks, leave-one-out,
// windows, Pettitt.
import { Check, CircleAlert, Info, Minus } from 'lucide-react';
import { useT } from '../i18n';
import type { Robustness } from '../data/types';
import { cn } from '../ui/common/utils';

type Mark = 'pass' | 'doubt' | 'note' | 'skip';

export function checkMarks(r: Robustness): Mark[] {
  const out: Mark[] = [];
  out.push(r.gaps.missingYears.length === 0 ? 'pass' : 'doubt');
  if (r.coverage.status !== 'skip') out.push(r.coverage.status === 'pass' ? 'pass' : 'doubt');
  if (r.breaks.length === 0) out.push('pass');
  for (const b of r.breaks) {
    if (b.review?.outcome === 'no_step_seen') out.push('note');
    else if (b.status === 'step' || b.review?.outcome === 'step_seen') out.push('doubt');
    else out.push('doubt');
  }
  if (r.loo && r.loo.status !== 'skip') out.push(r.loo.status === 'pass' ? 'pass' : r.loo.status === 'note' ? 'note' : 'doubt');
  if (r.windows && r.windows.status !== 'skip') out.push(r.windows.status === 'pass' ? 'pass' : 'doubt');
  if (r.pettitt) out.push(r.pettitt.flagged ? 'note' : 'pass');
  return out;
}

const ICON = { pass: Check, doubt: CircleAlert, note: Info, skip: Minus } as const;
const COLOUR = { pass: 'text-strong', doubt: 'text-noverdict', note: 'text-accent-ink', skip: 'text-muted' } as const;

export function ChecksList({ sentences, robustness, windowsLabel }: { sentences: string[]; robustness: Robustness; windowsLabel?: boolean }) {
  const t = useT();
  if (sentences.length === 0) {
    return <p className="text-[15px] text-muted">{t('site.checks.none_ran')}</p>;
  }
  const marks = checkMarks(robustness);
  const aligned = marks.length === sentences.length;
  return (
    <ul data-tour="checks-list" data-testid="checks-list" className="flex flex-col gap-2">
      {sentences.map((s, i) => {
        const mark: Mark = aligned ? (marks[i] ?? 'note') : 'note';
        const Icon = ICON[mark];
        return (
          <li key={i} className="flex items-start gap-2.5 text-[15px]">
            <span className={cn('mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border', COLOUR[mark], 'border-current/40')}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span>
              <span className="sr-only">{t(`site.checks.mark_${mark}`)}: </span>
              {s}
            </span>
          </li>
        );
      })}
      {windowsLabel && robustness.windows && robustness.windows.status !== 'skip' ? (
        <li className="pl-7 text-sm text-muted">{t('checks.windows.label')}</li>
      ) : null}
    </ul>
  );
}

export function OverturnList({ items }: { items: string[] }) {
  const shown = items.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <ol data-tour="overturn-list" data-testid="overturn-list" className="flex flex-col gap-2">
      {shown.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[15px]">
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent-ink" aria-hidden="true">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

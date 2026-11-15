// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// ChecksList (docs/04_UI.md §5): one row per check, with ✓ passed, ! doubt, i note, – skipped.
// The sentences are the engine's (text.checks); the marks come from the same result's "robustness" block,
// in the order the engine writes the sentences: gaps, coverage (unless skipped), breaks, leave-one-out,
// windows, Pettitt.
// The engine checks only dated data changes (docs/03_SCIENCE.md §6.2); changes with no date are on the record
// card only. When the record card lists such changes, the breaks row is a note, not a pass, and the site adds a
// row naming them (and one after a Pettitt flag), so "no documented data change" is not read as "no data change".
import { Check, CircleAlert, Info, Minus } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import { useCatalog } from '../data/hooks';
import type { Catalog, LangText, Robustness } from '../data/types';
import { useLang } from '../state/prefs';
import { cn } from '../ui/common/utils';

type Mark = 'pass' | 'doubt' | 'note' | 'skip';

/** The record card's data changes that have no date, for one variable. */
export function undatedBreaks(catalog: Catalog | undefined, variable: string | undefined): { id: string; label: LangText }[] {
  if (!catalog || !variable) return [];
  const card = catalog.variables.find((v) => v.id === variable)?.record_card;
  return (card?.known_breaks ?? []).filter((b) => b.date === null).map((b) => ({ id: b.id, label: b.label }));
}

export function checkMarks(r: Robustness, hasUndated = false): Mark[] {
  const out: Mark[] = [];
  out.push(r.gaps.missingYears.length === 0 ? 'pass' : 'doubt');
  if (r.coverage.status !== 'skip') out.push(r.coverage.status === 'pass' ? 'pass' : 'doubt');
  if (r.breaks.length === 0) out.push(hasUndated ? 'note' : 'pass');
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

/** Index of the last breaks row among the engine's sentences (same order as checkMarks). */
export function lastBreakRow(r: Robustness): number {
  return (r.coverage.status !== 'skip' ? 1 : 0) + Math.max(1, r.breaks.length);
}

const ICON = { pass: Check, doubt: CircleAlert, note: Info, skip: Minus } as const;
const COLOUR = { pass: 'text-strong', doubt: 'text-noverdict', note: 'text-accent-ink', skip: 'text-muted' } as const;

type Row = { text: string; mark: Mark; sub?: string[]; testId?: string };

export function ChecksList({
  sentences,
  robustness,
  windowsLabel,
  variable,
}: {
  sentences: string[];
  robustness: Robustness;
  windowsLabel?: boolean;
  /** The record whose card lists the undated data changes (verdict.variable.id or contrast.variable). */
  variable?: string;
}) {
  const t = useT();
  const lang = useLang();
  const catalog = useCatalog();
  if (sentences.length === 0) {
    return <p className="text-[15px] text-muted">{t('site.checks.none_ran')}</p>;
  }
  const undated = undatedBreaks(catalog.data, variable);
  const marks = checkMarks(robustness, undated.length > 0);
  const aligned = marks.length === sentences.length;
  const rows: Row[] = sentences.map((s, i) => ({ text: s, mark: aligned ? (marks[i] ?? 'note') : 'note' }));
  if (undated.length) {
    const jump = robustness.pettitt?.flagged && robustness.pettitt.year !== null ? robustness.pettitt.year : null;
    const breaksRow: Row = {
      text: t('site.checks.undated_breaks'),
      mark: 'note',
      sub: undated.map((b) => pick(b.label, lang)),
      testId: 'undated-breaks',
    };
    const jumpRow: Row | null =
      jump !== null ? { text: t('site.checks.undated_jump', { year: int(jump, lang) }), mark: 'note', testId: 'undated-jump' } : null;
    if (aligned) {
      // The Pettitt sentence is the engine's last; the jump row follows it.
      if (jumpRow) rows.push(jumpRow);
      rows.splice(lastBreakRow(robustness) + 1, 0, breaksRow);
    } else {
      rows.push(breaksRow);
      if (jumpRow) rows.push(jumpRow);
    }
  }
  return (
    <ul data-tour="checks-list" data-testid="checks-list" className="flex flex-col gap-2">
      {rows.map((row, i) => {
        const Icon = ICON[row.mark];
        return (
          <li key={i} className="flex items-start gap-2.5 text-[15px]" data-testid={row.testId}>
            <span className={cn('mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border', COLOUR[row.mark], 'border-current/40')}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span>
              <span className="sr-only">{t(`site.checks.mark_${row.mark}`)}: </span>
              {row.text}
              {row.sub ? (
                <ul className="m-0 mt-1 list-disc pl-5 text-muted">
                  {row.sub.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              ) : null}
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

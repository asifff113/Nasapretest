// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Lays a long table out as rows × columns (for example record length × memory). Re-arranging cells is layout;
// every value is shown as written in the file, formatted through format.ts.
import type { ReactNode } from 'react';
import { cn } from '../ui/common/utils';

export function PivotTable<T>({
  rows,
  rowKey,
  colKey,
  value,
  rowLabel,
  colLabel,
  corner,
  caption,
  highlight,
  testId,
}: {
  rows: T[];
  rowKey: (r: T) => number;
  colKey: (r: T) => number;
  value: (r: T) => ReactNode;
  rowLabel: (k: number) => ReactNode;
  colLabel: (k: number) => ReactNode;
  corner: ReactNode;
  caption?: ReactNode;
  highlight?: (r: T) => boolean;
  testId?: string;
}) {
  const rk = [...new Set(rows.map(rowKey))].sort((a, b) => a - b);
  const ck = [...new Set(rows.map(colKey))].sort((a, b) => a - b);
  const cell = (r: number, c: number) => rows.find((x) => rowKey(x) === r && colKey(x) === c);
  return (
    <div className="w-full overflow-x-auto rounded-[10px] border border-line bg-surface" data-testid={testId}>
      <table className="w-full border-collapse text-[14px] tabular">
        {caption ? <caption className="px-3 pt-3 text-left text-sm text-muted">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line-strong bg-surface-2">
            <th scope="col" className="sticky left-0 bg-surface-2 px-3 py-2 text-left text-[13px] font-semibold text-muted">
              {corner}
            </th>
            {ck.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-right text-[13px] font-semibold text-muted">
                {colLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rk.map((r) => (
            <tr key={r} className="border-b border-line last:border-0">
              <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">
                {rowLabel(r)}
              </th>
              {ck.map((c) => {
                const x = cell(r, c);
                return (
                  <td key={c} className={cn('px-3 py-2 text-right', x && highlight?.(x) && 'bg-accent-soft font-semibold')}>
                    {x ? value(x) : '–'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SimpleTable({ head, rows, testId }: { head: ReactNode[]; rows: ReactNode[][]; testId?: string }) {
  return (
    <div className="w-full overflow-x-auto rounded-[10px] border border-line bg-surface" data-testid={testId}>
      <table className="w-full border-collapse text-[14px] tabular">
        <thead>
          <tr className="border-b border-line-strong bg-surface-2">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cn('px-3 py-2 text-[13px] font-semibold text-muted', i === 0 ? 'text-left' : 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn('px-3 py-2', j === 0 ? 'text-left' : 'text-right')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

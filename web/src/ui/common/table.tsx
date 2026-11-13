// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Table, re-themed. Numbers use tabular figures.
import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cn } from './utils';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="w-full overflow-x-auto">
    <table ref={ref} className={cn('w-full border-collapse text-[15px] tabular', className)} {...props} />
  </div>
));
Table.displayName = 'Table';

export const THead = (props: HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} className={cn('border-b border-line-strong', props.className)} />;
export const TBody = (props: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} className={cn('[&_tr:last-child]:border-0', props.className)} />;
export const Tr = (props: HTMLAttributes<HTMLTableRowElement>) => <tr {...props} className={cn('border-b border-line', props.className)} />;
export const Th = (props: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th {...props} className={cn('px-3 py-2 text-left align-bottom text-[13px] font-semibold text-muted', props.className)} />
);
export const Td = (props: TdHTMLAttributes<HTMLTableCellElement>) => <td {...props} className={cn('px-3 py-2.5 align-top', props.className)} />;

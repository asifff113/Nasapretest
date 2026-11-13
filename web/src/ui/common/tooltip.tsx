// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Tooltip (Radix). Used for glossary terms; the definition is also reachable by keyboard and touch
// through a Popover, since tooltips alone are not available on touch screens.
import type { ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { cn } from './utils';

export function Definition({ term, children, className }: { term: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn('cursor-help underline decoration-dotted decoration-muted underline-offset-4 hover:decoration-ink', className)}
        >
          {term}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[300px] rounded-[10px] border border-line-strong bg-surface p-3 text-sm leading-relaxed text-ink shadow-lift data-[state=open]:animate-in"
        >
          {children}
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

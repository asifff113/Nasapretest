// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Collapsible (Radix): "For experts" and other detail on demand.
import { useState, type ReactNode } from 'react';
import { Collapsible } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { cn } from './utils';

export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className,
  icon,
  testId,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  icon?: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={cn('rounded-[10px] border border-line bg-surface-2', className)} data-testid={testId}>
      <Collapsible.Trigger className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-4 py-2 text-left font-medium text-ink hover:bg-ink/[0.03]">
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn('size-5 text-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content className="px-4 pb-4">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

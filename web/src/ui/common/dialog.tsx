// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Dialog and Sheet (Radix). Esc closes; focus returns to the trigger.
import type { ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './utils';

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'right',
  closeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: 'right' | 'bottom';
  closeLabel: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border-line bg-surface text-ink shadow-lift outline-none',
            side === 'right' ? 'inset-y-0 right-0 w-full max-w-[560px] border-l' : 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[16px] border-t',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-h3">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="-mr-2 inline-flex size-11 items-center justify-center rounded-[10px] text-muted hover:bg-ink/[0.06] hover:text-ink" aria-label={closeLabel}>
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

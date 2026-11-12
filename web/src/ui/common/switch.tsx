// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Switch (Radix), with its label as part of the control.
import { useId, type ReactNode } from 'react';
import { Switch as S } from 'radix-ui';

export function Switch({ checked, onCheckedChange, label, icon, testId }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; icon?: ReactNode; testId?: string }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      {icon}
      <label htmlFor={id} className="flex-1 cursor-pointer text-[15px] font-medium">
        {label}
      </label>
      <S.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        data-testid={testId}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line-strong bg-ink/10 transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-accent-ink"
      >
        <S.Thumb className="block size-5 translate-x-1 rounded-full bg-surface shadow-card transition-transform duration-150 data-[state=checked]:translate-x-6" />
      </S.Root>
    </div>
  );
}

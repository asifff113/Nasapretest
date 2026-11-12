// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Toggle Group (Radix): language, theme, season and variable switches.
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { ToggleGroup as TG } from 'radix-ui';
import { cn } from './utils';

interface Option {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
}

export function SegmentedControl({
  value,
  onValueChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  label: string;
  className?: string;
  size?: 'sm' | 'md';
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'defaultValue' | 'dir'>) {
  // On phones, more than two long options become a native picker instead of a stack of buttons.
  const compact = options.length > 2;
  const group = (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v);
      }}
      aria-label={label}
      className={cn('inline-flex flex-wrap items-stretch gap-1 rounded-[12px] border border-line bg-surface-2 p-1', className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-label={o.ariaLabel}
          data-testid={o.testId}
          className={cn(
            'rounded-[8px] px-3 font-medium text-muted transition-colors duration-150 hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-card disabled:opacity-40',
            size === 'sm' ? 'min-h-9 text-sm' : 'min-h-10 text-[15px]',
          )}
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
  if (!compact) return group;
  return (
    <>
      <div className="hidden sm:block">{group}</div>
      <label className="relative block w-full sm:hidden">
        <span className="sr-only">{label}</span>
        <select
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="min-h-11 w-full appearance-none rounded-[10px] border border-line-strong bg-surface px-3 pr-9 text-[15px] font-medium text-ink"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {typeof o.label === 'string' ? o.label : o.value}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          ▾
        </span>
      </label>
    </>
  );
}

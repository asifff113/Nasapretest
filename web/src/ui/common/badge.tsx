// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Badge. Status is never shown by colour alone: callers pass an icon and words.
import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

export const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-medium leading-5 [&_svg]:size-3.5 [&_svg]:shrink-0', {
  variants: {
    tone: {
      neutral: 'border-line-strong bg-surface-2 text-ink',
      accent: 'border-accent/50 bg-accent-soft text-ink',
      strong: 'border-strong/60 text-ink [&_svg]:text-strong',
      supported: 'border-supported/60 text-ink [&_svg]:text-supported',
      canttell: 'border-canttell/60 text-ink [&_svg]:text-canttell',
      noverdict: 'border-noverdict/60 text-ink [&_svg]:text-noverdict',
      exploration: 'border-exploration/60 text-ink [&_svg]:text-exploration',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

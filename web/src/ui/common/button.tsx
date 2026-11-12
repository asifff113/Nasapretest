// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// shadcn/ui Button, re-themed to the case-file tokens.
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-normal text-center rounded-[10px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out disabled:opacity-50 active:translate-y-px [&_svg]:shrink-0 [&_svg]:size-[18px] no-underline hover:no-underline',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-bg hover:bg-ink/90 shadow-card',
        accent: 'bg-accent-ink text-white hover:brightness-110 shadow-card dark:text-bg',
        outline: 'border border-line-strong bg-surface text-ink hover:border-ink/40 hover:bg-surface-2',
        ghost: 'text-ink hover:bg-ink/[0.06]',
        link: 'text-link underline underline-offset-4 hover:decoration-2 px-0 min-h-0',
      },
      size: {
        sm: 'min-h-9 px-3 text-sm',
        md: 'min-h-11 px-4 text-[15px]',
        lg: 'min-h-12 px-5 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp ref={ref} type={asChild ? undefined : (type ?? 'button')} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

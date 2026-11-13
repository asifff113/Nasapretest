// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-ink/[0.07]', className)} {...props} />;
}

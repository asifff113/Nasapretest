// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Panel states (docs/04_UI.md §10): loading, not in this build, unreachable, error with an id.
// There is no "computing" state: nothing is computed in the browser.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CloudOff, Copy, FileQuestion } from 'lucide-react';
import { useT } from '../i18n';
import type { Loaded } from '../data/hooks';
import { Button } from '../ui/common/button';
import { Skeleton } from '../ui/common/skeleton';
import { cn } from '../ui/common/utils';

export function PageSkeleton() {
  const t = useT();
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6" aria-busy="true">
      <p className="sr-only" role="status">
        {t('site.common.loading')}
      </p>
      <Skeleton className="h-8 w-2/3 max-w-lg" />
      <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export function Loading({ done, total, className }: { done?: number; total?: number; className?: string }) {
  const t = useT();
  const label = total && total > 1 ? t('site.common.loading_n', { done: done ?? 0, total }) : t('site.common.loading');
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy="true">
      <p role="status" className="text-sm text-muted">
        {label}
      </p>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function MissingPanel({ className, path }: { className?: string; path?: string }) {
  const t = useT();
  return (
    <div role="status" data-testid="missing-file" className={cn('flex items-start gap-3 rounded-[10px] border border-dashed border-line-strong bg-surface-2 p-4 text-[15px]', className)}>
      <FileQuestion className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
      <div>
        <p>{t('errors.missing_file')}</p>
        {path ? <p className="mt-1 break-all font-mono text-xs text-muted">{path}</p> : null}
      </div>
    </div>
  );
}

export function UnreachablePanel({ className }: { className?: string }) {
  const t = useT();
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-[10px] border border-noverdict/40 bg-surface p-4 text-[15px]', className)}>
      <CloudOff className="mt-0.5 size-5 shrink-0 text-noverdict" aria-hidden="true" />
      <div>
        <p>{t('banner.results_unreachable')}</p>
        <a href="#/offline" className="mt-1 inline-block font-medium">
          {t('nav.offline')}
        </a>
      </div>
    </div>
  );
}

export function ErrorPanel({ error, errorId, className }: { error: Error; errorId?: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const id = errorId ?? 'CFE-UI';
  const details = `${id}\n${error.name}: ${error.message}\n${typeof location !== 'undefined' ? location.href : ''}\n${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`;
  return (
    <div role="alert" className={cn('rounded-[10px] border border-noverdict/40 bg-surface p-4 text-[15px]', className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-noverdict" aria-hidden="true" />
        <p>{t('errors.generic', { id })}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => {
          void navigator.clipboard?.writeText(details).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        <Copy aria-hidden="true" />
        {copied ? t('site.common.copied') : t('site.common.copy_details')}
      </Button>
    </div>
  );
}

/** Renders a Loaded<T>: children only when the file is there. */
export function WithData<T>({
  res,
  children,
  className,
  path,
  loading,
}: {
  res: Loaded<T> & { done?: number; total?: number };
  children: (data: T) => ReactNode;
  className?: string;
  path?: string;
  loading?: ReactNode;
}) {
  if (res.status === 'loading') return <>{loading ?? <Loading className={className} done={res.done} total={res.total} />}</>;
  if (res.status === 'missing') return <MissingPanel className={className} path={path} />;
  if (res.status === 'unreachable') return <UnreachablePanel className={className} />;
  if (res.status === 'error' || res.data === undefined) return <ErrorPanel className={className} error={res.error ?? new Error('no data')} errorId={res.errorId} />;
  return <>{children(res.data)}</>;
}

/** The notice for a link that was incomplete or invalid (errors.bad_view). */
export function BadLinkNotice({ show }: { show: boolean }) {
  const t = useT();
  if (!show) return null;
  return (
    <div role="status" data-testid="bad-link" className="mb-6 flex items-start gap-3 rounded-[10px] border border-accent/50 bg-accent-soft p-3 text-[15px]">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden="true" />
      <p>{t('errors.bad_view')}</p>
    </div>
  );
}

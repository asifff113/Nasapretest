// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Status before numbers (docs/04_UI.md §1.3, §4.5): icon plus words, never colour alone.
import { Ban, CircleCheck, CircleHelp, Compass, FlaskConical, Scale, ShieldCheck, type LucideIcon } from 'lucide-react';
import { tOr, useT, type T } from '../i18n';
import type { Family, Grade, Reason, Status } from '../data/types';
import { Badge } from '../ui/common/badge';
import { cn } from '../ui/common/utils';

export type Tone = 'strong' | 'supported' | 'canttell' | 'noverdict' | 'exploration';

export interface StatusInfo {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  /** The reason, in a few words, for "no verdict". */
  detail?: string;
  /** A one-line meaning, for tooltips and screen readers. */
  desc?: string;
}

export function statusInfo(t: T, status: Status, grade: Grade | null, reason: Reason | null, family?: Family | null): StatusInfo {
  if (status === 'verdict' && grade) {
    if (grade === 'strong') return { tone: 'strong', icon: ShieldCheck, label: t('grade.strong.name'), desc: t('grade.strong.desc') };
    if (grade === 'supported') return { tone: 'supported', icon: CircleCheck, label: t('grade.supported.name'), desc: t('grade.supported.desc') };
    return { tone: 'canttell', icon: CircleHelp, label: t('grade.cant_tell_yet.name'), desc: t('grade.cant_tell_yet.desc') };
  }
  if (reason === 'sensitivity' || (family === 'sensitivity' && (!reason || reason === 'exploration'))) {
    return { tone: 'exploration', icon: Scale, label: t('family.sensitivity'), desc: t('site.status.sensitivity_desc') };
  }
  if (reason === 'exploration' || (!reason && family === 'exploration')) {
    return { tone: 'exploration', icon: Compass, label: t('family.exploration'), desc: t('site.status.exploration_desc') };
  }
  return {
    tone: 'noverdict',
    icon: Ban,
    label: t('site.status.no_verdict'),
    detail: reason ? tOr(t, `site.reason_short.${reason}`, reason) : undefined,
    desc: reason ? tOr(t, `site.reason_short.${reason}`, reason) : undefined,
  };
}

export function StatusBadge({
  status,
  grade,
  reason,
  family,
  size = 'sm',
  className,
}: {
  status: Status;
  grade: Grade | null;
  reason: Reason | null;
  family?: Family | null;
  size?: 'sm' | 'stamp';
  className?: string;
}) {
  const t = useT();
  const info = statusInfo(t, status, grade, reason, family);
  const Icon = info.icon;
  if (size === 'stamp') {
    return (
      <span
        data-testid="status-badge"
        data-tone={info.tone}
        className={cn(
          'inline-flex max-w-full items-center gap-2 rounded-[6px] border-2 px-3 py-1.5 text-[15px] font-semibold tracking-wide',
          'shadow-[inset_0_0_0_2px_var(--surface),inset_0_0_0_3px_currentColor]',
          {
            strong: 'border-strong text-strong',
            supported: 'border-supported text-supported',
            canttell: 'border-canttell text-canttell',
            noverdict: 'border-noverdict text-noverdict',
            exploration: 'border-exploration text-exploration',
          }[info.tone],
          className,
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span className="text-ink">
          {info.label}
          {info.detail ? <span className="font-medium text-muted">{` · ${info.detail}`}</span> : null}
        </span>
      </span>
    );
  }
  return (
    <Badge tone={info.tone} data-testid="status-badge" data-tone={info.tone} className={className} title={info.desc}>
      <Icon aria-hidden="true" />
      <span>
        {info.label}
        {info.detail ? <span className="text-muted">{` · ${info.detail}`}</span> : null}
      </span>
    </Badge>
  );
}

export function FamilyBadge({ family, className }: { family: Family; className?: string }) {
  const t = useT();
  const Icon = family === 'confirmatory' ? ShieldCheck : family === 'secondary' ? CircleCheck : family === 'sensitivity' ? Scale : FlaskConical;
  return (
    <Badge tone={family === 'confirmatory' ? 'accent' : 'neutral'} className={className} data-testid="family-badge">
      <Icon aria-hidden="true" />
      {t(`family.${family}`)}
    </Badge>
  );
}

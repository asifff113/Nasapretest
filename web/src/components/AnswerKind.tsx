// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Answer kinds: every answer on the site says which kind it is, so a reader never mistakes an exploration or a
// plain value for a registered test (docs/03_SCIENCE.md §7.3, §12).
//   registered   a test fixed in config/preregistration.yaml before any trend was seen; only these get verdict words
//   exploratory  the engine's trend test run on a place or record that was not registered; no verdict
//   descriptive  values as recorded (yearly values, averages, differences); no test
//   unavailable  this release has no answer here
import { ArrowRight, Ban, Compass, ShieldCheck, Table2, type LucideIcon } from 'lucide-react';
import { useT } from '../i18n';
import type { CatalogVariable, Grade, LineupItem, Prereg, Status } from '../data/types';
import type { ExploreIndex } from '../data/explore';
import { href, type View } from '../state/view';
import { Badge } from '../ui/common/badge';
import { StatusBadge } from './StatusBadge';

export type AnswerKind = 'registered' | 'exploratory' | 'descriptive' | 'unavailable';

const ICON: Record<AnswerKind, LucideIcon> = { registered: ShieldCheck, exploratory: Compass, descriptive: Table2, unavailable: Ban };
const TONE = { registered: 'accent', exploratory: 'exploration', descriptive: 'neutral', unavailable: 'noverdict' } as const;

export function AnswerKindBadge({ kind, className, label, testId = 'answer-kind' }: { kind: AnswerKind; className?: string; label?: string; testId?: string }) {
  const t = useT();
  const Icon = ICON[kind];
  return (
    <Badge tone={TONE[kind]} className={className} title={t(`site.kind.${kind}.desc`)} data-testid={testId} data-kind={kind}>
      <Icon aria-hidden="true" />
      {label ?? t(`site.kind.${kind}.name`)}
    </Badge>
  );
}

/**
 * The kind of answer a record can give in this build, read from the files: registered when the pre-registration
 * grades it, exploratory when the exploration index holds it, unavailable when the record is deferred.
 * Cross-checks and references keep their own badge (null here).
 */
export function recordKind(v: CatalogVariable, prereg: Prereg | undefined, explore: ExploreIndex | undefined): AnswerKind | null {
  if (prereg?.variables.some((p) => p.id === v.id && p.role === 'analysed')) return 'registered';
  if (v.status === 'sensitivity' || v.status === 'reference') return null;
  if (explore?.variables.some((x) => x.id === v.id)) return 'exploratory';
  return v.status === 'deferred' ? 'unavailable' : null;
}

/** True when the exploration trend and the registered answer point different ways (one stands out, one not). */
export function kindsDisagree(standsOut: boolean, item: { status: Status; grade: Grade | null }): boolean {
  const registeredYes = item.status === 'verdict' && (item.grade === 'strong' || item.grade === 'supported');
  return standsOut !== registeredYes;
}

/** The registered main-season test of each record in a line-up (family confirmatory), by variable. */
export function registeredMain(items: LineupItem[] | undefined): Record<string, LineupItem> {
  const out: Record<string, LineupItem> = {};
  for (const it of items ?? []) if (it.family === 'confirmatory' && !out[it.variable]) out[it.variable] = it;
  return out;
}

/** Under an exploration trend: the registered answer for the same place and record, with a link to it. */
export function RegisteredAnswer({
  item,
  standsOut,
  link,
}: {
  item: LineupItem;
  standsOut: boolean | null;
  link: View;
}) {
  const t = useT();
  return (
    <span className="mt-1.5 flex flex-col gap-1 border-l-2 border-accent/50 pl-2.5 text-[13px]" data-testid="registered-answer">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <AnswerKindBadge kind="registered" />
        <span className="text-muted">{t(`season.${item.season}.long`)}:</span>
        <StatusBadge status={item.status} grade={item.grade} reason={item.reason} family={item.family} />
      </span>
      {standsOut !== null && kindsDisagree(standsOut, item) ? <span className="text-muted">{t('site.kind.disagree')}</span> : null}
      <a href={href(link)} className="inline-flex items-center gap-1 font-medium text-link hover:underline">
        {t('site.kind.see_registered')}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </a>
    </span>
  );
}


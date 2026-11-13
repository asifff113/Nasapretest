// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// RecordCard (docs/04_UI.md §4.2): record, gaps, known breaks (with date or "gradual"), observation or model,
// and what it cannot answer. Deferred variables are greyed and labelled "Not analysed in this release".
import { Database, Eye, Satellite, Scale, TriangleAlert } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import type { CatalogVariable } from '../data/types';
import { useLang } from '../state/prefs';
import { Badge } from '../ui/common/badge';
import { cn } from '../ui/common/utils';
import { GroupIcon } from './atlas/icons';

export function KindBadge({ v }: { v: CatalogVariable }) {
  const t = useT();
  if (v.status === 'sensitivity') {
    return (
      <Badge tone="exploration">
        <Scale aria-hidden="true" />
        {t('record_card.badge_sensitivity')}
      </Badge>
    );
  }
  const Icon = v.kind === 'satellite' ? Satellite : v.kind === 'observations' ? Eye : Database;
  const key = v.kind === 'satellite' ? 'badge_satellite' : v.kind === 'observations' ? 'badge_observations' : 'badge_model';
  return (
    <Badge tone="neutral">
      <Icon aria-hidden="true" />
      {t(`record_card.${key}`)}
    </Badge>
  );
}

export function RecordCard({ variable: v, why }: { variable: CatalogVariable; why?: string }) {
  const t = useT();
  const lang = useLang();
  const deferred = v.status === 'deferred';
  const rc = v.record_card;
  return (
    <article
      data-tour={`record-card-${v.id}`}
      data-testid={`record-card-${v.id}`}
      data-deferred={deferred ? 'true' : 'false'}
      aria-disabled={deferred ? 'true' : undefined}
      className={cn('flex h-full flex-col rounded-card border p-5 sm:p-6', deferred ? 'border-dashed border-line-strong text-muted' : 'atlas-panel border-line bg-surface')}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-full border',
            deferred ? 'border-line-strong text-muted' : 'border-accent/40 bg-accent/10 text-accent-ink',
          )}
          aria-hidden="true"
        >
          <GroupIcon group={v.group} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn('font-display text-[24px] font-normal leading-tight', deferred && 'text-muted')}>{pick(v.name, lang)}</h3>
          <div className="mt-1.5">
            <KindBadge v={v} />
          </div>
        </div>
      </div>
      {deferred ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold" data-testid="not-analysed">
          <TriangleAlert className="size-4" aria-hidden="true" />
          {t('record_card.not_analysed')}
        </p>
      ) : null}
      {why ? <p className="mt-4 border-l-2 border-accent/60 pl-3 text-[15px] font-medium">{why}</p> : null}
      <p className="mt-3 text-[15px] text-muted">{pick(v.definition, lang)}</p>
      <p className="mt-1 text-sm text-muted">{pick(v.how_measured, lang)}</p>
      <dl className="mt-4 grid gap-3 border-t border-line pt-3 text-[15px]">
        <div>
          <dt className="eyebrow">{t('record_card.title')}</dt>
          <dd className="m-0 mt-0.5 tabular">
            {v.record && v.record.from !== null
              ? t('record_card.record', { from: int(v.record.from, lang), to: v.record.to !== null ? int(v.record.to, lang) : '…' })
              : '–'}
          </dd>
        </div>
        {rc ? (
          <>
            <div>
              <dt className="eyebrow">{t('record_card.gaps')}</dt>
              <dd className="m-0 mt-0.5">{pick(rc.gaps, lang)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('record_card.known_breaks')}</dt>
              <dd className="m-0 mt-0.5">
                {rc.known_breaks.length === 0 ? (
                  '–'
                ) : (
                  <ul className="flex flex-col gap-1">
                    {rc.known_breaks.map((b) => (
                      <li key={b.id}>
                        {pick(b.label, lang)} <span className="text-sm text-muted">({b.date ? b.date : t('site.record.gradual')})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('record_card.observation_or_model')}</dt>
              <dd className="m-0 mt-0.5">{pick(rc.observation_or_model, lang)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('record_card.cannot_answer')}</dt>
              <dd className="m-0 mt-0.5">{pick(rc.cannot_answer, lang)}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </article>
  );
}

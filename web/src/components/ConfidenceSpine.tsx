// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The confidence spine (docs/04_UI.md §5, S5): a thin rail that shows the current claim and its 95% range,
// always visible while a result is on screen. All numbers come from the result's "spine" block.
import { useT } from '../i18n';
import { rate as fmtRate } from '../i18n/format';
import { useLang } from '../state/prefs';
import { useSpineStore } from '../state/spine';
import { statusInfo } from './StatusBadge';
import { cn } from '../ui/common/utils';

/** A small interval glyph: the range as a bar, the rate as a dot, zero as a tick. Layout arithmetic only. */
export function IntervalGlyph({ rate, lo, hi, tone, className }: { rate: number | null; lo: number | null; hi: number | null; tone: string; className?: string }) {
  if (rate === null || !Number.isFinite(rate)) return null;
  const ext = Math.max(Math.abs(lo ?? rate), Math.abs(hi ?? rate), Math.abs(rate)) || 1;
  const pos = (v: number) => 50 + (v / ext) * 44; // percent of the track
  return (
    <svg viewBox="0 0 100 12" preserveAspectRatio="none" className={cn('h-3 w-24 shrink-0', className)} aria-hidden="true" focusable="false">
      <line x1="2" x2="98" y1="6" y2="6" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="50" x2="50" y1="1" y2="11" stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {lo !== null && hi !== null ? (
        <line x1={pos(lo)} x2={pos(hi)} y1="6" y2="6" stroke={`var(--${tone})`} strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.55" />
      ) : null}
      <circle cx={pos(rate)} cy="6" r="3.2" fill={`var(--${tone})`} />
    </svg>
  );
}

const TONE_VAR: Record<string, string> = {
  strong: 'grade-strong',
  supported: 'grade-supported',
  canttell: 'grade-cant-tell',
  noverdict: 'no-verdict',
  exploration: 'exploration',
};

export function ConfidenceSpine() {
  const t = useT();
  const lang = useLang();
  const claim = useSpineStore((s) => s.claim);
  if (!claim) return null;
  const s = claim.spine;
  const info = statusInfo(t, s.status, s.grade, s.reason, s.family);
  const Icon = info.icon;
  const r = s.ratePerDecade;
  const text = t('spine.text', {
    status: info.detail ? `${info.label} · ${info.detail}` : info.label,
    rate: r === null ? '–' : `${fmtRate(r, lang)} ${s.units}`,
    lo: s.rateLowPerDecade === null ? '–' : fmtRate(s.rateLowPerDecade, lang, r),
    hi: s.rateHighPerDecade === null ? '–' : fmtRate(s.rateHighPerDecade, lang, r),
    family: t(`family.${s.family}`),
    n_tests: s.familySize ?? '–',
  });
  return (
    <aside
      data-tour="spine"
      data-testid="spine"
      aria-label={t('spine.label')}
      className={cn(
        'z-30 border-line bg-surface/95 backdrop-blur-md',
        'fixed inset-x-0 bottom-[var(--bottombar,0px)] border-t lg:sticky lg:top-[var(--header-h)] lg:bottom-auto lg:border-t-0 lg:border-b',
      )}
    >
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-1.5 sm:px-6">
        <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted sm:inline">{t('spine.label')}</span>
        <Icon className="size-4 shrink-0" style={{ color: `var(--${TONE_VAR[info.tone]})` }} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[13px] tabular sm:text-sm" title={`${claim.about} · ${text}`}>
          <span className="font-medium">{claim.about}</span>
          <span className="text-muted"> · </span>
          <span>{text}</span>
        </p>
        <IntervalGlyph rate={r} lo={s.inDomain ? s.rateLowPerDecade : null} hi={s.inDomain ? s.rateHighPerDecade : null} tone={TONE_VAR[info.tone] ?? 'muted'} className="hidden sm:block" />
        {claim.anchor ? (
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById(claim.anchor ?? '');
              el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
              el?.focus({ preventScroll: true });
            }}
            className="hidden min-h-9 shrink-0 rounded-md px-2 text-sm font-medium text-link hover:underline md:inline"
          >
            {t('site.spine.jump')}
          </button>
        ) : null}
      </div>
    </aside>
  );
}

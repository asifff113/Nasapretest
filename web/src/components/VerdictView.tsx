// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// A verdict on screen: the chart (left, flexible) and the verdict card (right, 420 px) on desktop; chart then card
// on tablets and phones (docs/04_UI.md §3). Sets the confidence spine while it is on screen.
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import type { BreakItem, Catalog, SeriesFile, Verdict } from '../data/types';
import { paths } from '../data/results';
import { useResult } from '../data/hooks';
import { useLang } from '../state/prefs';
import { useSpineClaim } from '../state/spine';
import { TrendChart } from '../charts/TrendChart';
import { SeriesChart } from '../charts/SeriesChart';
import { toneColour, useTokens } from '../charts/tokens';
import { Card } from '../ui/common/card';
import { Button } from '../ui/common/button';
import { int } from '../i18n/format';
import { statusInfo } from './StatusBadge';
import { VerdictCard } from './VerdictCard';
import { SensitivityPanel } from './SensitivityPanel';
import { WithData } from './LoadState';

export function chartText(t: ReturnType<typeof useT>, lang: 'en' | 'bn') {
  return {
    sen: t('site.chart.sen_line'),
    band: t('verdict.labels.ci'),
    dataChange: t('site.chart.data_change'),
    jump: t('site.chart.jump'),
    reviewed: (b: BreakItem) => (b.review ? `${t('site.chart.data_change')} · ${tOr(t, `site.chart.review_${b.review.outcome}`, b.review.outcome)}` : `${t('site.chart.data_change')} ${b.year ? int(b.year, lang) : ''}`),
  };
}

function MonthlyPanel({ verdict, regionName }: { verdict: Verdict; regionName: string }) {
  const t = useT();
  const lang = useLang();
  const res = useResult<SeriesFile>(paths.series(verdict.variable.id, verdict.region.id));
  return (
    <WithData res={res} path={paths.series(verdict.variable.id, verdict.region.id)}>
      {(s) => {
        const [y0, m0] = s.monthly.start.split('-').map(Number);
        // Positions on the time axis: year + (month − 1)/12. Layout only.
        const x = s.monthly.values.map((_, i) => (y0 ?? 0) + ((m0 ?? 1) - 1 + i) / 12);
        return (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-1 text-sm font-medium">{t('site.chart.every_month_title', { units: s.units.monthly })}</p>
            <p className="mb-2 text-sm text-muted">{t('site.chart.every_month_note')}</p>
            <SeriesChart
              x={x}
              y={s.monthly.values}
              units={s.units.monthly}
              lang={lang}
              dots={false}
              height={200}
              label={t('site.chart.every_month_alt', { place: regionName })}
              testId="monthly-chart"
              xFormat={(v) => int(Math.floor(v), lang)}
            />
          </div>
        );
      }}
    </WithData>
  );
}

export function VerdictView({ verdict, path, catalog, regionName }: { verdict: Verdict; path: string; catalog: Catalog | undefined; regionName: string }) {
  const t = useT();
  const lang = useLang();
  const tokens = useTokens();
  const [monthly, setMonthly] = useState(false);
  const info = statusInfo(t, verdict.status, verdict.grade, verdict.reason, verdict.family);
  const variable = catalog?.variables.find((v) => v.id === verdict.variable.id);
  const varName = variable ? pick(variable.name, lang) : verdict.variable.id;
  const about = `${varName} · ${regionName} · ${t(`season.${verdict.season}.long`)}`;
  useSpineClaim({ spine: verdict.spine, about, anchor: 'verdict-card' });
  const text = verdict.text[lang] ?? verdict.text.en;
  const solid = verdict.status === 'verdict' && verdict.grade !== 'cant_tell_yet';
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="p-4 sm:p-5 lg:sticky lg:top-[calc(var(--header-h)+56px)]">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[15px] font-semibold">{varName}</p>
            <p className="text-sm text-muted">
              {regionName} · {t(`season.${verdict.season}.long`)} · {int(verdict.window.first, lang)}–{int(verdict.window.last, lang)}
            </p>
          </div>
          <Button variant={monthly ? 'primary' : 'outline'} size="sm" aria-pressed={monthly} onClick={() => setMonthly((m) => !m)}>
            <CalendarDays aria-hidden="true" />
            {t('site.chart.every_month')}
          </Button>
        </div>
        {verdict.chart ? (
          <TrendChart
            years={verdict.series.years}
            chart={verdict.chart}
            solid={solid}
            colour={toneColour(tokens, info.tone)}
            units={verdict.series.units}
            breaks={verdict.robustness.breaks}
            pettittYear={verdict.robustness.pettitt?.flagged ? verdict.robustness.pettitt.year : null}
            label={text.headline}
            lang={lang}
            text={chartText(t, lang)}
          />
        ) : (
          <p className="text-muted">{t('site.chart.no_chart')}</p>
        )}
        <ChartLegend solid={solid} hasBand={Boolean(verdict.chart?.band)} hasBreaks={verdict.robustness.breaks.length > 0} colour={toneColour(tokens, info.tone)} />
        {monthly ? <MonthlyPanel verdict={verdict} regionName={regionName} /> : null}
      </Card>
      <div className="flex flex-col gap-4">
        <VerdictCard verdict={verdict} path={path} about={about} />
        {verdict.sensitivity ? <SensitivityPanel path={verdict.sensitivity} /> : null}
      </div>
    </div>
  );
}

export function ChartLegend({ solid, hasBand, hasBreaks, colour }: { solid: boolean; hasBand: boolean; hasBreaks: boolean; colour: string }) {
  const t = useT();
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted" aria-label={t('site.chart.legend')}>
      <li className="inline-flex items-center gap-2">
        <svg width="22" height="10" aria-hidden="true">
          <line x1="1" x2="21" y1="5" y2="5" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="11" cy="5" r="3" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.2" />
        </svg>
        {t('site.chart.yearly_values')}
      </li>
      <li className="inline-flex items-center gap-2">
        <svg width="22" height="10" aria-hidden="true">
          <line x1="1" x2="21" y1="5" y2="5" stroke={colour} strokeWidth="2.75" strokeDasharray={solid ? undefined : '5 4'} />
        </svg>
        {solid ? t('site.chart.sen_line') : t('site.chart.sen_line_dashed')}
      </li>
      {hasBand ? (
        <li className="inline-flex items-center gap-2">
          <svg width="22" height="12" aria-hidden="true">
            <path d="M1 1 L11 6 L1 11 Z M21 1 L11 6 L21 11 Z" fill={colour} fillOpacity="0.25" />
          </svg>
          {t('site.chart.band_legend')}
        </li>
      ) : null}
      {hasBreaks ? (
        <li className="inline-flex items-center gap-2">
          <svg width="10" height="14" aria-hidden="true">
            <line x1="5" x2="5" y1="0" y2="14" stroke="currentColor" strokeDasharray="3 3" />
          </svg>
          {t('site.chart.data_change')}
        </li>
      ) : null}
    </ul>
  );
}

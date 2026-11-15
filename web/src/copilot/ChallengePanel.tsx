// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// "Challenge this conclusion": everything in the result files that supports a result or qualifies it, grouped,
// each line naming its source, with the rate in every time window drawn as dots and ranges. It reads files and
// places their values; it computes no statistic (AGENTS.md rule 4) and needs no network beyond the site's own
// files, so it works in the offline file too.
import { useRef } from 'react';
import * as Plot from '@observablehq/plot';
import { ShieldQuestion, X } from 'lucide-react';
import { useT, type T } from '../i18n';
import { findingText } from './findingText';
import { int, rate as rateFmt, tick } from '../i18n/format';
import type { Contrast, Lang, Verdict } from '../data/types';
import { useResult } from '../data/hooks';
import { useExploreTrends } from '../data/explore';
import { useLang } from '../state/prefs';
import { PlotFigure } from '../charts/PlotFigure';
import { useTokens } from '../charts/tokens';
import { Button } from '../ui/common/button';
import { challenge, classOfFamily, explorationFinding, nextActions, otherDatasetFinding, windowPoints, type Finding, type NextAction, type Severity } from './evidence';

type Result = Verdict | Contrast;

const isContrast = (r: Result): r is Contrast => 'pair' in r;

function WindowChart({ result, units, lang, t }: { result: Result; units: string; lang: Lang; t: T }) {
  const scope = useRef<HTMLDivElement>(null);
  const tokens = useTokens(scope);
  const pts = windowPoints(result).map((w) => ({ ...w, label: `${int(w.first, lang)}–${int(w.last, lang)}${w.main ? ` · ${t('site.copilot.challenge.windows.main')}` : ''}` }));
  if (pts.length < 2) return null;
  const height = 34 * pts.length + 44;
  return (
    <div ref={scope} className="mt-4">
      <p className="text-sm font-semibold">{t('site.copilot.challenge.windows.title')}</p>
      <p className="mb-2 text-[13px] text-muted">{t('site.copilot.challenge.windows.note')}</p>
      <PlotFigure
        label={t('site.copilot.challenge.windows.alt', { n: int(pts.length - 1, lang) })}
        testId="challenge-windows"
        minHeight={height}
        deps={[result.id, lang, tokens, units]}
        build={(width) => ({
          width,
          height,
          marginLeft: width < 520 ? 118 : 150,
          marginRight: 16,
          marginTop: 8,
          marginBottom: 34,
          style: { color: tokens.ink, background: 'transparent', fontSize: '12px' },
          y: { domain: pts.map((d) => d.label), label: null },
          x: { label: t('site.copilot.challenge.windows.axis', { units }), labelAnchor: 'center', labelArrow: 'none', grid: true, tickFormat: (v: number) => tick(v, lang), ticks: width < 520 ? 4 : 6 },
          marks: [
            Plot.ruleX([0], { stroke: tokens.lineStrong }),
            Plot.ruleY(pts.filter((d) => d.low !== null && d.high !== null), { y: 'label', x1: 'low', x2: 'high', stroke: (d: { main: boolean }) => (d.main ? tokens.ink : tokens.muted), strokeWidth: (d: { main: boolean }) => (d.main ? 3 : 1.75) }),
            Plot.dot(pts, { y: 'label', x: 'rate', r: (d: { main: boolean }) => (d.main ? 5.5 : 4), fill: (d: { main: boolean }) => (d.main ? tokens.ink : tokens.surface), stroke: tokens.ink, strokeWidth: 1.4 }),
            Plot.tip(pts, Plot.pointerY({ y: 'label', x: 'rate', title: (d: (typeof pts)[number]) => `${d.label}: ${rateFmt(d.rate, lang)} ${units} (${d.low === null ? '–' : rateFmt(d.low, lang)} … ${d.high === null ? '–' : rateFmt(d.high, lang)})` })),
          ],
        })}
      />
    </div>
  );
}

const ORDER: Severity[] = ['qualify', 'support', 'note'];

export function ChallengePanel({ result, path, onAction, onClose }: { result: Result; path: string; onAction?: (a: NextAction) => void; onClose?: () => void }) {
  const t = useT();
  const lang = useLang();
  const variable = isContrast(result) ? result.variable : result.variable.id;
  const units = result.spine.units;
  const trends = useExploreTrends(variable);
  const sensPath = !isContrast(result) && result.sensitivity ? result.sensitivity : null;
  const sens = useResult<Verdict>(sensPath);
  const findings: Finding[] = challenge(result, path);
  if (!isContrast(result)) {
    const item = trends.status === 'ok' ? trends.data?.items.find((i) => i.id === result.region.id) : undefined;
    const ex = explorationFinding(result, path, item, `explore/trends/${variable}.json`);
    if (ex) findings.push(ex);
    const other = otherDatasetFinding(result, path, sens.status === 'ok' ? sens.data : undefined, sensPath ?? '');
    if (other) findings.push(other);
  }
  const cls = classOfFamily(result.family);
  const actions = nextActions(findings, result).filter((a) => onAction !== undefined && (a !== 'open_other_dataset' || sensPath));
  return (
    <section className="rounded-[10px] border border-line bg-surface p-4 sm:p-5" aria-labelledby="challenge-title" data-testid="challenge-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="challenge-title" className="flex items-center gap-2 text-[17px] font-semibold">
            <ShieldQuestion aria-hidden="true" className="size-5" />
            {t('site.copilot.challenge.title')}
          </h3>
          <p className="mt-1 text-[13.5px] text-muted">{t('site.copilot.challenge.intro')}</p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('site.copilot.challenge.close')}>
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <p className="mt-3 inline-flex flex-col rounded-md border border-line px-3 py-1.5 text-[13px]" data-testid="evidence-class" data-class={cls}>
        <span className="font-semibold">{t(`site.copilot.class.${cls}`)}</span>
        <span className="text-muted">{t(`site.copilot.class.${cls}_note`)}</span>
      </p>
      {ORDER.map((sev) => {
        const group = findings.filter((f) => f.severity === sev);
        if (group.length === 0) return null;
        return (
          <div key={sev} className="mt-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t(`site.copilot.challenge.groups.${sev}`)}</p>
            <ul className="mt-1.5 flex flex-col gap-2">
              {group.map((f, i) => (
                <li key={`${f.id}-${i}`} className="text-[14px] leading-snug" data-finding={f.id}>
                  {findingText(t, lang, f, units).map((s, j) => (
                    <span key={j} className="block">{s}</span>
                  ))}
                  <span className="block font-mono text-[11px] text-muted">{t('site.copilot.challenge.source', { source: f.source })}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <WindowChart result={result} units={units} lang={lang} t={t} />
      {actions.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t('site.copilot.challenge.next')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a} variant="outline" size="sm" onClick={() => onAction?.(a)} data-action={a}>
                {t(`site.copilot.challenge.actions.${a}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The story of any place (exploration): an auto-playing sequence built from a region detail file — the place on
// the globe, then each record's yearly values drawing themselves year by year with their stripes, the year's
// rhythm as a clock, and an ending that points to the full report. Captions are string templates filled with the
// file's own numbers (the latest value, the highest and lowest year found by sorting); nothing is computed and no
// test is run. URL: #/watch?region=<id>.
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int, num } from '../i18n/format';
import { useCatalog } from '../data/hooks';
import { useExploreIndex, useExploreRegion, type ExploreIndex, type ExploreRegion } from '../data/explore';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { WithData } from '../components/LoadState';
import { LocatorGlobe } from '../components/atlas/LocatorGlobe';
import { YearsChart } from '../charts/YearsChart';
import { ClimateStripes } from '../charts/ClimateStripes';
import { ClimateClock } from '../charts/ClimateClock';
import { continentName, dp, extremes, latest, RegionSelect } from './ReportBody';

type Beat = { kind: 'intro' } | { kind: 'years'; id: string } | { kind: 'rhythm'; id: string } | { kind: 'end' };
const BEAT_MS = 7000;

function beatsFor(data: ExploreRegion, index: ExploreIndex): Beat[] {
  const ids = index.variables.map((v) => v.id).filter((id) => data.variables[id]);
  const rhythm = ids.find((id) => data.variables[id]?.rule === 'sum') ?? ids[0];
  return [{ kind: 'intro' }, ...ids.map((id) => ({ kind: 'years' as const, id })), ...(rhythm ? [{ kind: 'rhythm' as const, id: rhythm }] : []), { kind: 'end' }];
}

function Story({ data, index }: { data: ExploreRegion; index: ExploreIndex }) {
  const t = useT();
  const lang = useLang();
  const catalog = useCatalog();
  const beats = useMemo(() => beatsFor(data, index), [data, index]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const beat = beats[at] ?? beats[0]!;
  const name = pick(data.region.name, lang);
  const record = (id: string) => {
    const v = catalog.data?.variables.find((x) => x.id === id);
    return v ? pick(v.name, lang) : id;
  };
  const colormap = (id: string) => catalog.data?.variables.find((x) => x.id === id)?.colormap?.trend;
  const go = (i: number) => {
    setAt(i);
    setStartedAt(Date.now());
    setNow(Date.now());
  };

  // A clock for the drawing; the beat advances from a timer callback while playing.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(beats.length - 1, at + 1);
      setAt(next);
      setStartedAt(Date.now());
      if (next >= beats.length - 1) setPlaying(false);
    }, BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [playing, at, beats.length]);

  // While a "years" beat plays, its chart draws one year at a time over most of the beat.
  let upto: number | undefined;
  if (beat.kind === 'years') {
    const v = data.variables[beat.id];
    const first = v?.years[0];
    const last = v?.years[v.years.length - 1];
    if (first !== undefined && last !== undefined) {
      const share = playing ? Math.min(1, (now - startedAt) / (BEAT_MS * 0.7)) : 1;
      upto = first + Math.round(share * (last - first));
    }
  }

  let caption: string;
  let scene: React.ReactNode;
  if (beat.kind === 'intro') {
    const first = index.variables[0];
    caption = t('site.story.intro', {
      place: name,
      continent: continentName(t, data.region.continent),
      from: int(first?.first ?? 0, lang),
      to: int(first?.last ?? 0, lang),
    });
    scene = (
      <div className="flex justify-center">
        <LocatorGlobe
          marks={[
            {
              lon: data.region.centroid[0],
              lat: data.region.centroid[1],
              bbox: data.region.bbox,
              label: name,
            },
          ]}
          size={360}
          label={t('site.place.locator_alt', { place: name })}
        />
      </div>
    );
  } else if (beat.kind === 'years') {
    const v = data.variables[beat.id]!;
    const last = latest(v);
    const ex = extremes(v);
    caption =
      last && ex
        ? t('site.story.years', {
            record: record(beat.id),
            latest: num(last.value, lang, dp(last.value)),
            units: v.units,
            year: int(last.year, lang),
            high: int(ex.high.year, lang),
            low: int(ex.low.year, lang),
          })
        : record(beat.id);
    scene = (
      <div className="flex flex-col gap-3">
        <YearsChart
          series={[{ label: name, years: v.years, values: v.annual, tone: 'a' }]}
          units={v.units}
          lang={lang}
          label={t('site.report.chart_alt', {
            record: record(beat.id),
            place: name,
          })}
          upto={upto}
          testId="story-chart"
        />
        <ClimateStripes
          years={v.years}
          values={v.annual}
          units={v.units}
          colormap={colormap(beat.id)}
          lang={lang}
          label={t('site.report.stripes_alt', { record: record(beat.id) })}
          height={40}
        />
      </div>
    );
  } else if (beat.kind === 'rhythm') {
    const v = data.variables[beat.id]!;
    const months = Array.from({ length: 12 }, (_, i) => t(`site.month.${i + 1}`));
    const pts = v.monthlyClimatology.map((x, i) => ({ x, i })).filter((p): p is { x: number; i: number } => p.x !== null);
    const sorted = [...pts].sort((a, b) => a.x - b.x);
    caption = sorted.length
      ? t('site.story.rhythm', {
          record: record(beat.id),
          peak: months[sorted[sorted.length - 1]!.i] ?? '',
          low: months[sorted[0]!.i] ?? '',
        })
      : record(beat.id);
    scene = (
      <div className="flex justify-center">
        <ClimateClock
          series={[{ label: name, values: v.monthlyClimatology, tone: 'a' }]}
          units={v.unitsMonthly}
          lang={lang}
          label={t('site.report.clock_alt', {
            record: record(beat.id),
            place: name,
          })}
        />
      </div>
    );
  } else {
    caption = t('site.story.end');
    scene = (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <a href={href({ screen: 'place', region: data.region.id })} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-semibold text-ocean no-underline">
          {t('site.story.open_report')}
        </a>
      </div>
    );
  }

  return (
    <div className="atlas-panel flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6" data-testid="story-player">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (at >= beats.length - 1) go(0);
            else setStartedAt(Date.now());
            setPlaying(!playing);
          }}
          aria-label={playing ? t('site.story.stop') : t('site.story.play')}
          className="grid size-11 place-items-center rounded-full bg-accent text-ocean"
          data-testid="story-play"
        >
          {playing ? (
            <Pause className="size-5" aria-hidden="true" />
          ) : at >= beats.length - 1 ? (
            <RotateCcw className="size-5" aria-hidden="true" />
          ) : (
            <Play className="size-5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            go(Math.max(0, at - 1));
          }}
          aria-label={t('site.story.prev')}
          className="grid size-9 place-items-center rounded-full border border-line-strong"
          disabled={at === 0}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            go(Math.min(beats.length - 1, at + 1));
          }}
          aria-label={t('site.story.next')}
          className="grid size-9 place-items-center rounded-full border border-line-strong"
          disabled={at >= beats.length - 1}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <span className="font-display text-[26px] leading-none">{name}</span>
        <span className="ml-auto font-mono text-[12px] text-muted tabular" data-testid="story-step">
          {t('site.story.step', {
            n: int(at + 1, lang),
            total: int(beats.length, lang),
          })}
        </span>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {beats.map((_, i) => (
          <span key={i} className={'h-1 flex-1 rounded-full ' + (i <= at ? 'bg-accent' : 'bg-ink/15')} />
        ))}
      </div>
      <div className="min-h-[320px]">{scene}</div>
      <p className="m-0 rounded-[8px] bg-surface-2 p-4 text-[16px] leading-relaxed" aria-live="polite" data-testid="story-caption">
        {caption}
      </p>
    </div>
  );
}

/** The story section of the Watch screen: pick any place, then the story plays. */
export function PlaceStory() {
  const t = useT();
  const { view, patch } = useView();
  const index = useExploreIndex();
  const region = useExploreRegion(view.region ?? null);
  return (
    <section className="flex flex-col gap-5" data-testid="place-story" aria-labelledby="story-h">
      <div>
        <h2 id="story-h" className="text-chapter">
          {t('site.story.title')}
        </h2>
        <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-muted">{t('site.story.lead')}</p>
      </div>
      {index.data ? (
        <div className="max-w-[420px]">
          <RegionSelect
            index={index.data}
            value={view.region ?? ''}
            onPick={(id) => patch({ region: id || undefined }, { replace: true })}
            label={t('site.story.pick')}
            testId="story-select"
          />
        </div>
      ) : null}
      {view.region && index.data ? <WithData res={region}>{(d) => <Story key={d.region.id} data={d} index={index.data!} />}</WithData> : null}
    </section>
  );
}

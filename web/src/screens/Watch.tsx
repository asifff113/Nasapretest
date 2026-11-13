// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Watch a case (docs/04_UI.md §4.11; schemas/casefile.schema.json). The WatchPlayer steps through the case's beats.
// Each beat sets the view, spotlights one element (dimmed backdrop, focus ring) and shows its caption, written by
// the engine. The case's "ending" picks the verdict beat. Default beat length 6 s; reduced motion turns off
// transitions and the steps still advance.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Fingerprint, Pause, Play, RotateCcw, Search } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int, shortHash } from '../i18n/format';
import type { CaseFile, Contrast, Lineup, Mask, RegionIndex, Verdict } from '../data/types';
import { caseResultPath, useCases } from '../data/cases';
import { paths } from '../data/results';
import { useCatalog, useRegionIndex, useResult, useResults } from '../data/hooks';
import { useLang } from '../state/prefs';
import { href, useView, type View } from '../state/view';
import { useSpineClaim } from '../state/spine';
import { toneColour, useTokens } from '../charts/tokens';
import { DifferenceChart, PairChart } from '../charts/DifferenceChart';
import { CaseFolder } from '../components/CaseFolder';
import { ChecksList } from '../components/ChecksList';
import { ContributingCells, type MaskLayer } from '../components/ContributingCells';
import { LineupTable } from '../components/LineupTable';
import { Loading, MissingPanel, WithData } from '../components/LoadState';
import { Body } from '../components/Page';
import { Hero } from '../components/atlas/Hero';
import { FamilyBadge, StatusBadge, statusInfo } from '../components/StatusBadge';
import { RateFigure } from '../components/VerdictCard';
import { chartText } from '../components/VerdictView';
import { Button, buttonVariants } from '../ui/common/button';
import { Card } from '../ui/common/card';
import { Sparkline } from '../charts/Sparkline';
import { cn } from '../ui/common/utils';

const BEAT_MS = 6000;

type Main = Contrast | Verdict | Lineup;

function isContrast(x: Main | undefined): x is Contrast {
  return Boolean(x && 'estimand' in x);
}
function isLineup(x: Main | undefined): x is Lineup {
  return Boolean(x && 'items' in x && 'nTests' in x);
}

/** The spotlight: a hole in a dimmed backdrop around the element with data-tour = `target`. Layout only. */
function Spotlight({ stage, target, beatKey }: { stage: React.RefObject<HTMLDivElement | null>; target: string | null; beatKey: string }) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const host = stage.current;
    if (!host || !target) return;
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = host.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (!el) {
        if (tries++ < 40) raf = requestAnimationFrame(measure);
        else setRect(null);
        return;
      }
      const a = host.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      setRect({ x: b.left - a.left - 8, y: b.top - a.top - 8, w: b.width + 16, h: b.height + 16 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stage, target, beatKey]);
  if (!rect || !target) return null;
  return (
    <motion.div
      aria-hidden="true"
      data-testid="spotlight"
      className="pointer-events-none absolute z-20 rounded-[14px] outline outline-3 outline-accent"
      initial={false}
      animate={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ boxShadow: '0 0 0 9999px color-mix(in srgb, var(--bg) 62%, transparent)' }}
    />
  );
}

function regionName(index: RegionIndex | undefined, id: string | undefined, lang: 'en' | 'bn'): string {
  const r = index?.regions.find((x) => x.id === id);
  return r ? pick(r.name, lang) : (id ?? '');
}

function PlaceScene({ c, index }: { c: CaseFile; index: RegionIndex }) {
  const t = useT();
  const lang = useLang();
  const pair = c.uses.pair ? index.pairs.find((p) => p.id === c.uses.pair) : undefined;
  const ids = pair ? [pair.a, pair.b] : c.uses.region ? [c.uses.region] : [];
  const regions = ids.map((id) => index.regions.find((r) => r.id === id)).filter((r) => r !== undefined);
  const gridId = regions[0] && 'merra2_native' in regions[0].cells ? 'merra2_native' : Object.keys(regions[0]?.cells ?? {})[0];
  const grid = index.grids.find((g) => g.id === gridId);
  const masks = useResults<Mask>(gridId && regions.length ? regions.map((r) => r.cells[gridId] ?? '') : null);
  return (
    <Card className="p-4 sm:p-6">
      <WithData res={masks}>
        {(ms) =>
          grid ? (
            <div className="mx-auto max-w-[560px]">
              <ContributingCells
                grid={grid}
                label={t('place.cells_shown')}
                layers={ms.map<MaskLayer>((m, i) => ({ mask: m, colour: i === 0 ? 'link' : 'accent', label: `${pair ? (i === 0 ? 'A · ' : 'B · ') : ''}${regionName(index, m.region, lang)}` }))}
              />
            </div>
          ) : null
        }
      </WithData>
    </Card>
  );
}

function VerdictScene({ c, main, verdicts }: { c: CaseFile; main: Main; verdicts: Verdict[] }) {
  const t = useT();
  const lang = useLang();
  const tokens = useTokens();
  // A line-up case shows a secondary (season) result at its verdict beat; otherwise the case's own result.
  const r: Contrast | Verdict | undefined = isLineup(main) ? (verdicts.find((v) => v.family === 'secondary') ?? verdicts[0]) : (main as Contrast | Verdict);
  if (!r) return <MissingPanel />;
  const text = r.text[lang] ?? r.text.en;
  const info = statusInfo(t, r.status, r.grade, r.reason, r.family);
  const years = 'difference' in r ? r.difference.years : r.series.years;
  return (
    <CaseFolder caseId={r.id} tabLabel={t('site.verdict.case')} tour="verdict-card" testId="watch-verdict">
      <div className="p-5 sm:p-6" data-ending={c.ending ?? 'none'} data-testid="watch-ending">
        <div className="flex flex-wrap items-center gap-2">
          {c.ending === 'cant_tell_yet' ? (
            <StatusBadge status="verdict" grade="cant_tell_yet" reason={null} size="stamp" />
          ) : (
            <StatusBadge status={r.status} grade={r.grade} reason={r.reason} family={r.family} size="stamp" />
          )}
          <FamilyBadge family={r.family} />
        </div>
        <h2 className="mt-3 text-h2 leading-snug">{text.headline}</h2>
        {c.ending === 'cant_tell_yet' ? <p className="mt-2 text-[15px] font-medium">{t('grade.cant_tell_yet.desc')}</p> : null}
        {r.stats.change ? (
          <div className="mt-4">
            <RateFigure
              ratePerDecade={r.stats.change.ratePerDecade}
              low={r.stats.change.rateLowPerDecade}
              high={r.stats.change.rateHighPerDecade}
              units={r.stats.change.units}
              first={r.window.first}
              last={r.window.last}
              inDomain={r.domain.inDomain}
            />
          </div>
        ) : null}
        {r.chart ? (
          <div className="mt-4 rounded-[8px] border border-line bg-surface-2 p-2">
            <Sparkline years={years} chart={r.chart} colour={toneColour(tokens, info.tone)} solid={r.status === 'verdict' && r.grade !== 'cant_tell_yet'} zero={'difference' in r} className="h-28 w-full" />
          </div>
        ) : null}
      </div>
    </CaseFolder>
  );
}

function MethodsScene({ main }: { main: Main }) {
  const t = useT();
  const lang = useLang();
  const prov = main.provenance;
  const m = 'multiplicity' in main ? main.multiplicity : null;
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6" data-tour="methods-family">
      <p className="inline-flex items-center gap-2 text-h3">
        <Fingerprint className="size-5 text-accent-ink" aria-hidden="true" />
        {t('methods.prereg')}
      </p>
      <p className="font-mono text-[13px] break-all">SHA-256 {prov.preregSha256}</p>
      {m?.familySize ? <p className="text-[15px]">{t('site.watch.family_size', { n: int(m.familySize, lang) })}</p> : null}
      <ul className="text-sm text-muted">
        {prov.items.map((it) => (
          <li key={it.shortName}>
            {it.product} · {it.shortName} {it.version} {it.doi ? `· DOI ${it.doi}` : ''}
          </li>
        ))}
        <li>
          {t('provenance.manifest')}: <span className="font-mono">{shortHash(prov.inputManifestSha256, 16)}</span>
        </li>
      </ul>
      <a href="#/methods" className="font-medium">
        {t('nav.methods')}
      </a>
    </Card>
  );
}

function Scene({ at, c, main, verdicts, index, lineupCatalog }: { at: string; c: CaseFile; main: Main; verdicts: Verdict[]; index: RegionIndex; lineupCatalog: ReturnType<typeof useCatalog>['data'] }) {
  const t = useT();
  const lang = useLang();
  const tokens = useTokens();
  const pair = c.uses.pair ? index.pairs.find((p) => p.id === c.uses.pair) : undefined;
  const nameA = regionName(index, pair?.a, lang);
  const nameB = regionName(index, pair?.b, lang);
  switch (at) {
    case 'question':
      return (
        <div data-tour="question-card-case" className="rounded-[14px] border border-line bg-surface p-8 text-center shadow-card sm:p-12">
          <p className="eyebrow">{t('site.watch.the_question')}</p>
          <p className="mx-auto mt-3 max-w-[24ch] font-display text-[clamp(30px,3vw+16px,52px)] leading-[1.08]">{pick(c.title, lang)}</p>
          {pair ? <p className="mt-4 text-muted">{pick(pair.question, lang)}</p> : null}
        </div>
      );
    case 'place':
      return <PlaceScene c={c} index={index} />;
    case 'lineup':
      return isLineup(main) ? (
        <Card className="p-4 sm:p-5">
          <LineupTable lineup={main} catalog={lineupCatalog} linkFor={(it) => ({ screen: 'place', region: main.region, variable: it.variable, season: it.season })} />
        </Card>
      ) : (
        <MissingPanel />
      );
    case 'series': {
      const va = verdicts.find((v) => v.region.id === pair?.a);
      const vb = verdicts.find((v) => v.region.id === pair?.b);
      return va && vb ? (
        <Card className="p-4 sm:p-5" data-tour="pair-chart">
          <PairChart a={va} b={vb} nameA={nameA} nameB={nameB} lang={lang} label={`${nameA} · ${nameB}`} />
        </Card>
      ) : (
        <MissingPanel />
      );
    }
    case 'difference':
      return isContrast(main) ? (
        <Card className="p-4 sm:p-5">
          <p className="mb-2 text-[15px] font-semibold">{t('contrast.estimand', { A: nameA, B: nameB })}</p>
          <DifferenceChart
            contrast={main}
            colour={toneColour(tokens, statusInfo(t, main.status, main.grade, main.reason, main.family).tone)}
            lang={lang}
            label={(main.text[lang] ?? main.text.en).headline}
            text={{ ...chartText(t, lang), units: main.difference.units }}
          />
        </Card>
      ) : (
        <MissingPanel />
      );
    case 'verdict':
      return <VerdictScene c={c} main={main} verdicts={verdicts} />;
    case 'robustness': {
      const r = isLineup(main) ? verdicts[0] : (main as Contrast | Verdict);
      if (!r) return <MissingPanel />;
      return (
        <Card className="p-5 sm:p-6">
          <p className="mb-3 text-h3">{t('verdict.labels.checks')}</p>
          <ChecksList sentences={(r.text[lang] ?? r.text.en).checks} robustness={r.robustness} windowsLabel />
        </Card>
      );
    }
    case 'methods':
      return <MethodsScene main={main} />;
    case 'takeaway':
    default:
      return (
        <div data-tour="takeaway" className="rounded-[14px] border border-line bg-surface p-8 text-center shadow-card sm:p-12" data-testid="watch-takeaway" data-ending={c.ending ?? 'none'}>
          <p className="eyebrow">{t('site.watch.takeaway')}</p>
          <p className="mx-auto mt-3 max-w-[40ch] font-display text-[clamp(24px,2vw+14px,36px)] leading-snug">
            {c.ending === 'cant_tell_yet' ? t('site.watch.ending_cant_tell') : c.ending === 'supported' ? t('site.watch.ending_supported') : t('site.watch.ending_none')}
          </p>
        </div>
      );
  }
}

/** Which element each beat spotlights. */
const SPOT: Record<string, string> = {
  question: 'question-card-case',
  place: 'contributing-cells',
  lineup: 'lineup',
  series: 'pair-chart',
  difference: 'difference-chart',
  verdict: 'verdict-card',
  robustness: 'checks-list',
  methods: 'methods-family',
  takeaway: 'takeaway',
};

function investigateView(c: CaseFile): View {
  if (c.uses.kind === 'contrast') return { screen: 'compare', pair: c.uses.pair, variable: c.uses.variable, season: c.uses.season };
  return { screen: 'place', region: c.uses.region, variable: c.uses.variable, season: c.uses.season };
}

function Player({ c }: { c: CaseFile }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const index = useRegionIndex();
  const catalog = useCatalog();
  const mainPath = caseResultPath(c);
  const main = useResult<Main>(mainPath);
  const verdictPaths = c.results.filter((p) => p.startsWith('verdicts/'));
  const verdicts = useResults<Verdict>(verdictPaths.length ? verdictPaths : null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const n = c.beats.length;
  const beat = c.beats[Math.min(i, n - 1)];
  const atEnd = i >= n - 1;

  const spineSource = main.data && !isLineup(main.data) ? (main.data as Contrast | Verdict) : undefined;
  useSpineClaim(spineSource ? { spine: spineSource.spine, about: pick(c.title, lang) } : null);

  const ready = main.status === 'ok' && index.status === 'ok' && (verdictPaths.length === 0 || verdicts.status === 'ok');
  // Playing stops by itself at the last beat.
  const isPlaying = playing && !atEnd;
  useEffect(() => {
    if (!isPlaying || !ready) return;
    const id = window.setTimeout(() => setI((x) => Math.min(n - 1, x + 1)), BEAT_MS);
    return () => window.clearTimeout(id);
  }, [isPlaying, ready, i, n]);

  const go = useCallback((x: number) => setI(Math.max(0, Math.min(n - 1, x))), [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, i]);

  if (!beat) return <MissingPanel />;
  const caption = pick(beat.caption, lang);
  let sceneEl: ReactNode;
  if (main.status === 'loading' || index.status === 'loading' || (verdictPaths.length > 0 && verdicts.status === 'loading')) sceneEl = <Loading done={verdicts.done} total={verdicts.total} />;
  else if (main.status !== 'ok' || !main.data || !index.data) sceneEl = <MissingPanel path={mainPath ?? undefined} />;
  else sceneEl = <Scene at={beat.at} c={c} main={main.data} verdicts={verdicts.data ?? []} index={index.data} lineupCatalog={catalog.data} />;

  return (
    <div data-testid="watch-player" data-beat={beat.at} data-beat-index={i} data-beats={n}>
      <div className="flex items-center justify-between gap-3 rounded-t-[16px] border border-b-0 border-line bg-surface px-4 py-2.5 font-mono text-[12px] text-muted">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className={cn('inline-block size-2 shrink-0 rounded-full', isPlaying ? 'animate-pulse bg-noverdict' : 'bg-line-strong')} aria-hidden="true" />
          <span className="truncate">{c.id}</span>
        </span>
        <span className="shrink-0 tabular">{t('site.watch.step', { n: int(i + 1, lang), total: int(n, lang) })}</span>
      </div>
      <div ref={stage} className="relative min-h-[420px] overflow-hidden rounded-b-[16px] border border-line bg-surface-2 p-3 sm:p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${i}-${beat.at}`}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {sceneEl}
          </motion.div>
        </AnimatePresence>
        {ready ? <Spotlight stage={stage} target={SPOT[beat.at] ?? null} beatKey={`${i}`} /> : null}
      </div>
      <div className="atlas-panel sticky bottom-[calc(var(--bottombar,0px)+48px)] z-30 mt-4 rounded-[14px] border border-line bg-surface/95 p-4 shadow-lift backdrop-blur-md sm:p-5 lg:static lg:bg-surface">
        <p className="min-h-[3em] font-display text-[22px] leading-snug sm:text-[26px]" aria-live="polite" data-testid="watch-caption">
          {caption}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => go(i - 1)} disabled={i === 0} aria-label={t('watch.prev')} data-testid="watch-prev">
            <ChevronLeft aria-hidden="true" />
          </Button>
          {atEnd ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setI(0);
                setPlaying(true);
              }}
              data-testid="watch-replay"
            >
              <RotateCcw aria-hidden="true" />
              {t('watch.replay')}
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={() => setPlaying(!isPlaying)} aria-pressed={isPlaying} data-testid="watch-playpause">
              {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {isPlaying ? t('watch.pause') : t('watch.play')}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => go(i + 1)} disabled={atEnd} aria-label={t('watch.next')} data-testid="watch-next">
            <ChevronRight aria-hidden="true" />
          </Button>
          <ol className="mx-2 flex flex-1 flex-wrap items-center gap-1.5" aria-label={t('site.common.progress')} data-testid="watch-progress">
            {c.beats.map((_, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => go(k)}
                  aria-current={k === i ? 'step' : undefined}
                  aria-label={t('site.watch.step', { n: int(k + 1, lang), total: int(n, lang) })}
                  className="flex size-6 items-center justify-center"
                >
                  <span className={cn('block h-2 rounded-full transition-all', k === i ? 'w-6 bg-accent' : k < i ? 'w-2 bg-ink/50' : 'w-2 bg-line-strong')} />
                </button>
              </li>
            ))}
          </ol>
          <a href={href(investigateView(c))} className={buttonVariants({ variant: 'outline', size: 'md' })} data-testid="watch-take-over">
            <Search aria-hidden="true" />
            {t('watch.take_over')}
          </a>
        </div>
      </div>
    </div>
  );
}

/** The case's result as a small preview on the card's screen (its sparkline), with the status. */
function CasePreview({ c }: { c: CaseFile }) {
  const t = useT();
  const tokens = useTokens();
  const res = useResult<Main>(caseResultPath(c));
  const r = res.data && 'chart' in res.data ? (res.data as Contrast | Verdict) : null;
  const info = r ? statusInfo(t, r.status, r.grade, r.reason, r.family) : null;
  const years = r ? ('difference' in r ? r.difference.years : r.series.years) : [];
  return (
    <span className="relative block">
      {r && r.chart && info ? (
        <Sparkline years={years} chart={r.chart} colour={toneColour(tokens, info.tone)} solid={r.status === 'verdict' && r.grade !== 'cant_tell_yet'} zero={'difference' in r} className="mt-8 h-24 w-full" />
      ) : (
        <span className="mt-8 flex h-24 items-end gap-1 px-2 pb-3" aria-hidden="true">
          {Array.from({ length: 18 }, (_, k) => (
            <span key={k} className="flex-1 rounded-sm bg-ink/10" style={{ height: `${20 + ((k * 37) % 60)}%` }} />
          ))}
        </span>
      )}
      {r ? (
        <span className="absolute left-0 top-0">
          <StatusBadge status={r.status} grade={r.grade} reason={r.reason} family={r.family} />
        </span>
      ) : null}
    </span>
  );
}

function CaseList() {
  const t = useT();
  const lang = useLang();
  const { cases } = useCases();
  return (
    <WithData res={cases}>
      {(list) => (
        <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 lg:grid-cols-3" data-testid="case-list">
          {list.map((c, k) => (
            <li key={c.id}>
              <a
                href={href({ screen: 'watch', case: c.id })}
                className="atlas-panel group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface text-ink no-underline transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-accent/60 hover:no-underline hover:shadow-lift"
                data-testid={`case-${c.id}`}
              >
                <span className="relative block border-b border-line bg-surface-2 px-4 pb-3 pt-4">
                  <span className="mb-2 flex items-center justify-between gap-2 font-mono text-[11.5px] text-muted">
                    <span className="truncate">{c.id}</span>
                    <span aria-hidden="true">{int(k + 1, lang).padStart(2, int(0, lang))}</span>
                  </span>
                  <CasePreview c={c} />
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">
                    <span className="inline-flex size-14 items-center justify-center rounded-full bg-accent text-ocean shadow-lift">
                      <Play className="ml-0.5 size-6" />
                    </span>
                  </span>
                  <span className="mt-3 flex gap-1" aria-hidden="true">
                    {c.beats.map((_, b) => (
                      <span key={b} className="h-1 flex-1 rounded-full bg-ink/20 transition-colors group-hover:bg-accent/60" />
                    ))}
                  </span>
                </span>
                <span className="flex flex-1 flex-col p-5">
                  <span className="font-display text-[24px] leading-[1.15]">{pick(c.title, lang)}</span>
                  {c.summary ? <span className="mt-2 text-[15px] text-muted">{pick(c.summary, lang)}</span> : null}
                  <span className="mt-auto inline-flex items-center gap-2 pt-5 font-semibold text-accent-ink">
                    <Play className="size-4" aria-hidden="true" />
                    {t('site.watch.play_case', { n: int(c.beats.length, lang) })}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WithData>
  );
}

export default function WatchScreen() {
  const t = useT();
  const lang = useLang();
  const caseId = useView((s) => s.view.case);
  const c = useResult<CaseFile>(caseId ? paths.caseFile(caseId) : null);
  if (!caseId) {
    return (
      <>
        <Hero eyebrow={t('site.watch.eyebrow')} title={t('nav.watch')} lead={t('site.watch.lead')} />
        <Body>
          <CaseList />
        </Body>
      </>
    );
  }
  const back = (
    <a href="#/watch" className="inline-flex min-h-11 items-center gap-1 font-medium">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {t('site.watch.all_cases')}
    </a>
  );
  return (
    <WithData res={c} path={paths.caseFile(caseId)}>
      {(cf) => (
        <>
          <Hero top={back} eyebrow={t('site.watch.eyebrow')} title={pick(cf.title, lang)} lead={cf.summary ? pick(cf.summary, lang) : undefined} />
          <Body className="pt-8 sm:pt-8">
            <Player key={cf.id} c={cf} />
          </Body>
        </>
      )}
    </WithData>
  );
}

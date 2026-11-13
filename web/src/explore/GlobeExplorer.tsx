// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe explorer (ADR-23): a realistic Earth (NASA Blue Marble, bundled) that any visitor can turn, zoom and
// click anywhere. The chosen record's screening map is draped over it; a click opens that 1° square (exploration),
// a pin opens a registered place (graded verdicts), and the ask box routes a free-text question with the smart
// matcher (no AI). The globe library loads only on this screen, so the first view of the site stays small.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Globe2, History, Minus, Pause, Play, Plus, Search, X } from 'lucide-react';
import { groupIcon } from '../components/atlas/icons';
import { pick, useT } from '../i18n';
import { int, num, rate as fmtRate } from '../i18n/format';
import type { CatalogVariable, Region } from '../data/types';
import { loadMapLayer, type MapLayer } from '../data/results';
import { useAsync, useBuild, useCatalog, usePrereg, useRegionIndex } from '../data/hooks';
import { CITIES } from '../data/places';
import { cellId, route, understand, type MatchContext, type Understood } from '../data/matcher';
import { IS_OFFLINE_BUILD } from '../data/offline';
import { useLang } from '../state/prefs';
import { href, toHash, useView } from '../state/view';
import { diverging, scalePos, sequential } from '../map/colours';
import { ScreeningMap } from '../map/ScreeningMap';
import { loadOutlines, type Outlines } from '../map/outlines';
import { composeTexture, countryAt, loadCountries, loadEarthImage, YearPainter } from './texture';
import { exploreForCountryName, useExploreIndex, useMapYears, type MapYears } from '../data/explore';
import type { LoadStatus } from '../data/hooks';
import { CellPanel, NoPlacePanel, RegionPanel, VariablePanel } from './ExplorePanels';
import { CountryPanel } from './CountryPanel';
import { cellsInCountry, findCountry, fitAltitude } from './country';
import type { CountryFeature } from '../data/places';
import { MissingPanel } from '../components/LoadState';
import { SegmentedControl } from '../ui/common/toggle-group';
import { cn } from '../ui/common/utils';

/** The parts of the globe.gl instance this screen uses (the library's own types take untyped accessors). */
interface GlobeLike {
  width(w: number): GlobeLike;
  height(h: number): GlobeLike;
  backgroundColor(c: string): GlobeLike;
  showAtmosphere(b: boolean): GlobeLike;
  atmosphereColor(c: string): GlobeLike;
  atmosphereAltitude(a: number): GlobeLike;
  globeImageUrl(u: string): GlobeLike;
  bumpImageUrl(u: string): GlobeLike;
  onGlobeClick(cb: (c: { lat: number; lng: number }) => void): GlobeLike;
  polygonsData(d: object[]): GlobeLike;
  polygonCapColor(f: () => string): GlobeLike;
  polygonSideColor(f: () => string): GlobeLike;
  polygonStrokeColor(f: () => string): GlobeLike;
  polygonAltitude(a: number): GlobeLike;
  onPolygonClick(cb: (p: object, e: MouseEvent, c: { lat: number; lng: number }) => void): GlobeLike;
  ringsData(d: object[]): GlobeLike;
  ringColor(f: () => (t: number) => string): GlobeLike;
  ringMaxRadius(r: number): GlobeLike;
  ringPropagationSpeed(s: number): GlobeLike;
  ringRepeatPeriod(ms: number): GlobeLike;
  htmlElementsData(d: object[]): GlobeLike;
  htmlLat(f: (d: object) => number): GlobeLike;
  htmlLng(f: (d: object) => number): GlobeLike;
  htmlAltitude(a: number): GlobeLike;
  htmlElement(f: (d: object) => HTMLElement): GlobeLike;
  onZoom(cb: (p: { lat: number; lng: number; altitude: number }) => void): GlobeLike;
  pointsData(d: object[]): GlobeLike;
  pointLat(f: (d: object) => number): GlobeLike;
  pointLng(f: (d: object) => number): GlobeLike;
  pointAltitude(f: (d: object) => number): GlobeLike;
  pointRadius(r: number): GlobeLike;
  pointColor(f: (d: object) => string): GlobeLike;
  pointResolution(n: number): GlobeLike;
  pointsMerge(b: boolean): GlobeLike;
  pointsTransitionDuration(ms: number): GlobeLike;
  onPointClick(cb: (p: object) => void): GlobeLike;
  pointOfView(p?: { lat: number; lng: number; altitude: number }, ms?: number): { lat: number; lng: number; altitude: number };
  controls(): { autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean };
  pauseAnimation(): GlobeLike;
  resumeAnimation(): GlobeLike;
  renderer(): { setPixelRatio(r: number): void };
  globeMaterial(): { map: { image: unknown; needsUpdate: boolean } | null };
  _destructor(): void;
}

type Selection =
  | { kind: 'cell'; row: number; col: number; label?: string; understood?: Understood; from?: { kind: 'country'; feature: CountryFeature; cells: number[] } }
  | { kind: 'region'; region: Region; understood?: Understood }
  | { kind: 'variable'; variable: CatalogVariable; understood?: Understood }
  | { kind: 'noplace'; understood: Understood }
  | { kind: 'country'; feature: CountryFeature; cells: number[]; understood?: Understood };

interface Marker {
  kind: 'pin' | 'city' | 'cluster';
  lat: number;
  lng: number;
  label: string;
  region?: Region;
  members?: Region[];
}

/** Groups pins that would overlap at this zoom into one marker (positions only). */
function clusterPins(pins: Marker[], altitude: number): Marker[] {
  const within = altitude >= 1.5 ? 9 : altitude >= 0.9 ? 3 : 0.8;
  const groups: Marker[][] = [];
  for (const p of pins) {
    const g = groups.find((x) => x.some((q) => Math.hypot(q.lat - p.lat, q.lng - p.lng) < within));
    if (g) g.push(p);
    else groups.push([p]);
  }
  return groups.map((g) => {
    if (g.length === 1) return g[0] as Marker;
    const lat = g.reduce((a, q) => a + q.lat, 0) / g.length;
    const lng = g.reduce((a, q) => a + q.lng, 0) / g.length;
    return { kind: 'cluster', lat, lng, label: g.map((q) => q.label).join(', '), members: g.map((q) => q.region).filter((r): r is Region => Boolean(r)) };
  });
}

const HOME_VIEW = { lat: 20, lng: 60, altitude: 2.25 };

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}


function VariableRail({ variables, value, onPick }: { variables: CatalogVariable[]; value: string | undefined; onPick: (v: CatalogVariable) => void }) {
  const t = useT();
  const lang = useLang();
  const groups: [string, (v: CatalogVariable) => boolean][] = [
    ['site.explore.group_tested', (v) => v.status === 'analysed'],
    ['site.explore.group_checks', (v) => v.status === 'sensitivity' || v.status === 'reference'],
    ['site.explore.group_later', (v) => v.status === 'deferred'],
  ];
  return (
    <nav aria-label={t('site.explore.choose_record')} className="flex flex-col gap-4" data-testid="variable-rail">
      {groups.map(([title, f]) => {
        const list = variables.filter(f);
        if (list.length === 0) return null;
        return (
          <section key={title}>
            <h3 className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{t(title)}</h3>
            <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {list.map((v) => {
                const Icon = groupIcon(v.group);
                const on = v.id === value;
                return (
                  <li key={v.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => onPick(v)}
                      aria-pressed={on}
                      data-testid={`rail-${v.id}`}
                      className={cn(
                        'grid min-h-11 w-full grid-cols-[30px_1fr] items-center gap-2.5 rounded-[6px] border px-2.5 py-1.5 text-left transition-colors',
                        on ? 'border-accent/60 bg-accent/15' : 'border-transparent hover:bg-ink/[0.06]',
                      )}
                    >
                      <span className={cn('grid size-[30px] place-items-center rounded-full', on ? 'bg-accent text-ocean' : 'bg-ink/10')}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 text-[14px] font-medium leading-tight">
                        {pick(v.name, lang)}
                        <span className="hidden text-xs font-normal text-muted lg:block">
                          {v.kind === 'model' ? t('record_card.badge_model') : v.kind === 'satellite' ? t('record_card.badge_satellite') : t('record_card.badge_observations')}
                          {v.record?.from ? ` · ${int(v.record.from, lang)}–` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

function Legend({ layer, colormap, opacity, onOpacity, columns = false }: { layer: MapLayer; colormap: string | undefined; opacity?: number; onOpacity?: (v: number) => void; columns?: boolean }) {
  const t = useT();
  const lang = useLang();
  const interp = diverging(colormap);
  const stops = Array.from({ length: 9 }, (_, i) => interp(i / 8)).join(', ');
  return (
    <div className="pointer-events-auto flex w-[280px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-[6px] border border-line bg-surface/90 p-3 text-xs backdrop-blur-md" data-testid="map-legend">
      <p className="text-[13px] font-semibold">{t('map.legend_rate', { units: layer.meta.units })}</p>
      <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} aria-hidden="true" />
      <div className="flex justify-between font-mono text-[11px] text-muted tabular">
        <span>{fmtRate(-layer.meta.colourLimit, lang)}</span>
        <span>0</span>
        <span>{fmtRate(layer.meta.colourLimit, lang)}</span>
      </div>
      {opacity !== undefined && onOpacity ? (
        <label className="flex items-center gap-2" htmlFor="layer-strength">
          <span className="shrink-0">{t('site.explore.strength')}</span>
          <input id="layer-strength" type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)} onChange={(e) => onOpacity(Number(e.target.value) / 100)} className="w-full accent-[var(--accent)]" />
        </label>
      ) : null}
      {columns ? <p className="m-0 rounded-[4px] bg-accent/15 px-2 py-1.5 text-[12px] text-ink">{t('site.explore.columns_note')}</p> : null}
      <ul className="flex flex-col gap-1 text-muted">
        <li className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-3.5 rounded-[2px]" style={{ background: interp(0.85) }} aria-hidden="true" />
          {t('site.explore.key_strong')}
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-3.5 rounded-[2px] opacity-45" style={{ background: interp(0.85) }} aria-hidden="true" />
          {t('site.map.lighter')}
        </li>
        <li className="flex items-center gap-2">
          <span className="hatch inline-block h-2.5 w-3.5 rounded-[2px] border border-line-strong" aria-hidden="true" />
          {t('map.legend_hatch')}
        </li>
      </ul>
    </div>
  );
}

/** The time-lapse panel: the year, play and pause, the slider, and the value scale of the yearly frames. */
function YearsPanel({
  status,
  years,
  frame,
  onFrame,
  playing,
  onPlay,
  colormap,
  name,
}: {
  status: LoadStatus;
  years: MapYears | undefined;
  frame: number;
  onFrame: (i: number) => void;
  playing: boolean;
  onPlay: (on: boolean) => void;
  colormap: string | undefined;
  name: string;
}) {
  const t = useT();
  const lang = useLang();
  const box = 'pointer-events-auto flex w-[min(560px,calc(100vw-88px))] flex-col gap-2.5 rounded-[6px] border border-line bg-surface/90 p-3 text-xs backdrop-blur-md';
  if (status === 'loading') return <p className={box}>{t('site.years.loading')}</p>;
  if (!years) return <p className={box}>{t('site.years.missing')}</p>;
  const m = years.meta;
  const ys = m.years;
  const interp = sequential(colormap);
  const stops = Array.from({ length: 9 }, (_, i) => interp(i / 8)).join(', ');
  const [lo, hi] = m.range ?? [Number.NaN, Number.NaN];
  const year = ys[frame] ?? ys[ys.length - 1] ?? 0;
  return (
    <div className={box} data-testid="years-panel">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onPlay(!playing)}
          aria-label={playing ? t('site.years.pause') : t('site.years.play')}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-ocean hover:brightness-110"
          data-testid="years-play"
        >
          {playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[12px] text-muted">{t('site.years.title', { record: name })}</p>
          <p className="m-0 font-display text-[34px] leading-none tabular" aria-live="polite" data-testid="years-year">
            {int(year, lang)}
          </p>
        </div>
      </div>
      <label className="flex flex-col gap-1" htmlFor="years-slider">
        <span className="sr-only">{t('site.years.slider')}</span>
        <input
          id="years-slider"
          type="range"
          min={0}
          max={ys.length - 1}
          step={1}
          value={frame}
          onChange={(e) => {
            onPlay(false);
            onFrame(Number(e.target.value));
          }}
          aria-valuetext={int(year, lang)}
          className="w-full accent-[var(--accent)]"
          data-testid="years-slider"
        />
        <span className="flex justify-between font-mono text-[11px] text-muted tabular" aria-hidden="true">
          <span>{int(ys[0] ?? 0, lang)}</span>
          <span>{int(ys[ys.length - 1] ?? 0, lang)}</span>
        </span>
      </label>
      <p className="m-0 text-[12.5px] font-semibold">{t(m.rule === 'sum' ? 'site.years.legend_sum' : 'site.years.legend_mean', { units: m.units })}</p>
      <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} aria-hidden="true" />
      <div className="flex justify-between font-mono text-[11px] text-muted tabular">
        <span>{num(lo, lang)}</span>
        <span>{num(hi, lang)}</span>
      </div>
      <p className="m-0 text-[12px] leading-snug text-muted">{t('site.years.note')}</p>
    </div>
  );
}

export function GlobeExplorer({ mode, intro }: { mode: 'home' | 'map'; intro?: ReactNode }) {
  const t = useT();
  const lang = useLang();
  const { view, navigate } = useView();
  const build = useBuild();
  const catalog = useCatalog();
  const index = useRegionIndex();
  const prereg = usePrereg();
  const reduce = reduceMotion();

  const variables = useMemo(() => catalog.data?.variables ?? [], [catalog.data]);
  const analysed = variables.filter((v) => v.status === 'analysed');
  const [localVar, setLocalVar] = useState<string | undefined>(undefined);
  const variableId = (mode === 'map' ? view.variable : localVar) ?? analysed[0]?.id;
  const variable = variables.find((v) => v.id === variableId);
  const seasons = prereg.data ? [prereg.data.seasons.main, ...prereg.data.seasons.secondary] : ['ANN'];
  const season = mode === 'map' && view.season && seasons.includes(view.season) ? view.season : 'ANN';
  const root = build.data?.root;
  const layerKey = root !== undefined && variable ? `map|${root}|${variable.id}|${season}` : null;
  const layer = useAsync<MapLayer>(layerKey, () => loadMapLayer(root ?? '', variable?.id ?? '', season));
  const activeLayer = layer.status === 'ok' ? (layer.data ?? null) : null;
  const countries = useAsync('countries', () => loadCountries());
  const exploreIndex = useExploreIndex();
  const [opacity, setOpacity] = useState(0.6);
  const [flat, setFlat] = useState(false);
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [altitude, setAltitude] = useState(HOME_VIEW.altitude);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [question, setQuestion] = useState('');
  const [columns, setColumns] = useState(false);
  const [yearsOn, setYearsOn] = useState(false);
  const [frame, setFrame] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const flatView = flat || failed || IS_OFFLINE_BUILD;
  const years = useMapYears(variable?.id, season, yearsOn && !flatView);
  const yearsData = years.status === 'ok' ? years.data : undefined;
  const yearsActive = yearsOn && !flatView && Boolean(yearsData);
  const nYears = yearsData?.meta.years.length ?? 0;
  const fi = frame === null ? Math.max(0, nYears - 1) : Math.min(frame, Math.max(0, nYears - 1));

  const host = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeLike | null>(null);
  const earthRef = useRef<HTMLImageElement | null>(null);
  const grid = index.data?.grids.find((g) => g.id === 'global_1deg') ?? activeLayer?.meta.grid;

  // ---- selection helpers -------------------------------------------------------------------
  const selectCell = useCallback(
    (lat: number, lng: number, label?: string, understood?: Understood) => {
      if (!grid) return;
      const id = cellId(grid, lat, lng);
      const [, rc] = id.split(':');
      const [row, col] = (rc ?? '0_0').split('_').map(Number);
      setSelection((prev) => ({ kind: 'cell', row: row ?? 0, col: col ?? 0, label, understood, from: prev?.kind === 'country' ? prev : prev?.kind === 'cell' ? prev.from : undefined }));
      const g = globeRef.current;
      if (g) {
        const cLat = grid.lat0 + (row ?? 0) * grid.dlat;
        const cLng = grid.lon0 + (col ?? 0) * grid.dlon;
        const half = Math.abs(grid.dlat) / 2;
        g.controls().autoRotate = false;
        g.polygonsData([
          {
            type: 'Feature',
            properties: {},
            // Clockwise ring: the square itself, not the rest of the sphere.
            geometry: { type: 'Polygon', coordinates: [[[cLng - half, cLat - half], [cLng - half, cLat + half], [cLng + half, cLat + half], [cLng + half, cLat - half], [cLng - half, cLat - half]]] },
          },
        ]);
        g.ringsData([{ lat: cLat, lng: cLng }]);
        const p = g.pointOfView();
        g.pointOfView({ lat: cLat, lng: cLng, altitude: Math.max(1.2, Math.min(p.altitude, 1.7)) }, reduce ? 0 : 1100);
      }
      if (mode === 'map') navigate({ screen: 'map', variable: variable?.id, season, region: id }, { replace: true });
    },
    [grid, mode, navigate, reduce, season, variable?.id],
  );

  const selectRegion = useCallback(
    (region: Region, understood?: Understood) => {
      setSelection({ kind: 'region', region, understood });
      const g = globeRef.current;
      if (g) {
        g.controls().autoRotate = false;
        g.polygonsData([]);
        g.ringsData([{ lat: region.centroid[1], lng: region.centroid[0] }]);
        g.pointOfView({ lat: region.centroid[1], lng: region.centroid[0], altitude: 1.1 }, reduce ? 0 : 1100);
      }
    },
    [reduce],
  );

  const focusCountry = useCallback(
    (feature: CountryFeature, understood?: Understood) => {
      if (!grid) return;
      setSelection({ kind: 'country', feature, cells: cellsInCountry(feature, grid), understood });
      const g = globeRef.current;
      if (g) {
        g.controls().autoRotate = false;
        g.polygonsData([]).ringsData([]);
        g.pointOfView({ lat: feature.properties.lat, lng: feature.properties.lon, altitude: fitAltitude(feature) }, reduce ? 0 : 1300);
      }
    },
    [grid, reduce],
  );

  const pickRef = useRef<(lat: number, lng: number) => void>(() => undefined);
  const regionRef = useRef<(r: Region) => void>(() => undefined);
  useEffect(() => {
    pickRef.current = (lat, lng) => selectCell(lat, lng);
    regionRef.current = (r) => selectRegion(r);
  }, [selectCell, selectRegion]);

  // ---- create the globe once -----------------------------------------------------------------
  useEffect(() => {
    if (flat || IS_OFFLINE_BUILD) return;
    const el = host.current;
    if (!el) return;
    let alive = true;
    let g: GlobeLike | null = null;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    (async () => {
      try {
        const [mod, earth] = await Promise.all([import('globe.gl'), loadEarthImage()]);
        if (!alive) return;
        earthRef.current = earth;
        const Ctor = mod.default as unknown as new (el: HTMLElement, opts: object) => GlobeLike;
        g = new Ctor(el, { animateIn: !reduce, rendererConfig: { antialias: true, alpha: true } });
        g.backgroundColor('rgba(0,0,0,0)')
          .showAtmosphere(true)
          .atmosphereColor('#8fc7ff')
          .atmosphereAltitude(0.17)
          .bumpImageUrl('./textures/earth-topology.png')
          .onGlobeClick(({ lat, lng }) => pickRef.current(lat, lng))
          .polygonsData([])
          .polygonCapColor(() => 'rgba(233,180,76,0.5)')
          .polygonSideColor(() => 'rgba(233,180,76,0.25)')
          .polygonStrokeColor(() => '#ffd27a')
          .polygonAltitude(0.008)
          .onPolygonClick((_p, _e, c) => pickRef.current(c.lat, c.lng))
          .ringsData([])
          .ringColor(() => (x: number) => `rgba(255,210,122,${1 - x})`)
          .ringMaxRadius(3.2)
          .ringPropagationSpeed(2.2)
          .ringRepeatPeriod(1200)
          .htmlLat((d) => (d as Marker).lat)
          .htmlLng((d) => (d as Marker).lng)
          .htmlAltitude(0.012)
          .onPointClick((p) => pickRef.current((p as { lat: number }).lat, (p as { lng: number }).lng))
          .onZoom((p) => setAltitude(p.altitude < 0.9 ? 0.8 : p.altitude < 1.5 ? 1.2 : 2.25));
        g.renderer().setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
        g.controls().autoRotate = !reduce;
        g.controls().autoRotateSpeed = 0.3;
        g.controls().enableDamping = true;
        g.pointOfView(HOME_VIEW, 0);
        const size = () => {
          const r = el.getBoundingClientRect();
          g?.width(Math.max(1, Math.round(r.width))).height(Math.max(1, Math.round(r.height)));
        };
        size();
        ro = new ResizeObserver(size);
        ro.observe(el);
        // Draw only while the globe is on screen.
        io = new IntersectionObserver(([entry]) => {
          if (!g) return;
          if (entry?.isIntersecting) g.resumeAnimation();
          else g.pauseAnimation();
        });
        io.observe(el);
        el.addEventListener('pointerdown', () => {
          if (g) g.controls().autoRotate = false;
        });
        globeRef.current = g;
        setReady(true);
      } catch (err) {
        console.warn('CaseFile Earth: the globe could not start; showing the flat map.', err);
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      ro?.disconnect();
      io?.disconnect();
      g?._destructor();
      globeRef.current = null;
      el.replaceChildren();
      setReady(false);
    };
    // the globe is created once per mount of the globe view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat]);

  // ---- the surface: Earth + layer + borders ----------------------------------------------------
  const focus = selection?.kind === 'country' ? selection : selection?.kind === 'cell' ? (selection.from ?? null) : null;
  const focusSet = useMemo(() => (focus ? { feature: focus.feature, cells: new Set(focus.cells) } : null), [focus]);
  useEffect(() => {
    const g = globeRef.current;
    const earth = earthRef.current;
    if (!ready || !g || !earth || yearsActive || layer.status === 'loading' || countries.status === 'loading') return;
    const id = window.setTimeout(() => {
      g.globeImageUrl(composeTexture(earth, activeLayer, variable?.colormap?.trend, columns ? opacity * 0.3 : opacity, countries.data ?? [], focusSet));
    }, 60);
    return () => window.clearTimeout(id);
  }, [ready, activeLayer, layer.status, countries.status, countries.data, opacity, variable?.colormap?.trend, focusSet, columns, yearsActive]);

  // ---- the time-lapse: each year's frame painted into the globe's own texture -------------------------
  const painterRef = useRef<{ years: MapYears; countries: unknown; focus: unknown; painter: YearPainter } | null>(null);
  const savedImage = useRef<unknown>(null);
  useEffect(() => {
    const g = globeRef.current;
    const earth = earthRef.current;
    if (!ready || !g || !earth || !yearsActive || !yearsData) return;
    let p = painterRef.current;
    if (!p || p.years !== yearsData || p.countries !== countries.data || p.focus !== focusSet) {
      p = { years: yearsData, countries: countries.data, focus: focusSet, painter: new YearPainter(earth, countries.data ?? [], focusSet, yearsData) };
      painterRef.current = p;
    }
    const cv = p.painter.paint(fi, sequential(variable?.colormap?.value), Math.min(0.95, opacity + 0.25));
    const mat = g.globeMaterial();
    if (mat.map) {
      if (savedImage.current === null) savedImage.current = mat.map.image;
      mat.map.image = cv;
      mat.map.needsUpdate = true;
    } else {
      g.globeImageUrl(cv.toDataURL('image/jpeg', 0.85));
    }
  }, [ready, yearsActive, yearsData, fi, countries.data, focusSet, opacity, variable?.colormap?.value]);
  // Leaving the time-lapse puts the trend surface back.
  useEffect(() => {
    if (!yearsActive) return;
    return () => {
      const mat = globeRef.current?.globeMaterial();
      if (mat?.map && savedImage.current !== null) {
        mat.map.image = savedImage.current;
        mat.map.needsUpdate = true;
      }
      savedImage.current = null;
    };
  }, [yearsActive]);
  useEffect(() => {
    if (!playing || !yearsActive) return;
    const end = fi >= nYears - 1;
    const id = window.setTimeout(
      () => {
        if (end) setPlaying(false);
        else setFrame(fi + 1);
      },
      end ? 0 : 650,
    );
    return () => window.clearTimeout(id);
  }, [playing, yearsActive, fi, nYears]);

  // ---- 3D columns: each square that stands out rises by how fast it changes (height from the map's rate) ----
  useEffect(() => {
    const g = globeRef.current;
    if (!ready || !g) return;
    if (!columns || !activeLayer || yearsOn) {
      g.pointsData([]);
      return;
    }
    const lay = activeLayer;
    const gr = lay.meta.grid;
    const interp = diverging(variable?.colormap?.trend);
    const tb = lay.meta.flagBits.testable ?? 1;
    const sb = lay.meta.flagBits.significant ?? 2;
    const rate = lay.fields.rate;
    const limit = lay.meta.colourLimit;
    const pts: { lat: number; lng: number; h: number; c: string }[] = [];
    const use = (i: number) => {
      const fl = lay.flags[i] ?? 0;
      const r = rate ? rate[i] : Number.NaN;
      if ((fl & tb) === 0 || r === undefined || !Number.isFinite(r)) return;
      if (!focusSet && (fl & sb) === 0) return;
      const row = Math.floor(i / gr.nlon);
      const col = i % gr.nlon;
      pts.push({ lat: gr.lat0 + row * gr.dlat, lng: gr.lon0 + col * gr.dlon, h: 0.003 + Math.min(1, Math.abs(r) / limit) * (focusSet ? 0.045 : 0.075), c: interp(scalePos(r, limit)) });
    };
    if (focusSet) focusSet.cells.forEach(use);
    else for (let i = 0; i < gr.nlat * gr.nlon; i++) use(i);
    g.pointsMerge(true)
      .pointsTransitionDuration(0)
      .pointResolution(4)
      .pointRadius(focusSet ? 0.42 : 0.5)
      .pointLat((d) => (d as { lat: number }).lat)
      .pointLng((d) => (d as { lng: number }).lng)
      .pointAltitude((d) => (d as { h: number }).h)
      .pointColor((d) => (d as { c: string }).c)
      .pointsData(pts);
    // The whole world as a skyline: step back far enough to see it.
    if (!focusSet) {
      const p = g.pointOfView();
      if (p.altitude < 1.9) g.pointOfView({ ...p, altitude: 2.1 }, reduce ? 0 : 900);
    }
  }, [ready, columns, activeLayer, variable?.colormap?.trend, focusSet, reduce, yearsOn]);

  // ---- pins for registered places, and city names ------------------------------------------------
  useEffect(() => {
    const g = globeRef.current;
    if (!ready || !g) return;
    const pins: Marker[] = (index.data?.regions ?? []).filter((r) => r.inSet).map((r) => ({ kind: 'pin', lat: r.centroid[1], lng: r.centroid[0], label: pick(r.name, lang), region: r }));
    const cities: Marker[] = CITIES.filter((c, i, all) => all.findIndex((x) => x.lat === c.lat && x.lon === c.lon) === i)
      .filter((c) => c.tier === 1 || altitude < 1.5)
      .map((c) => ({ kind: 'city', lat: c.lat, lng: c.lon, label: lang === 'bn' && c.bn ? c.bn : c.name }));
    g.htmlElementsData([...cities, ...clusterPins(pins, altitude)]).htmlElement((d) => {
      const m = d as Marker;
      if (m.kind === 'cluster') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'globe-pin';
        b.textContent = t('site.explore.cluster', { n: m.members?.length ?? 0 });
        b.setAttribute('aria-label', `${t('site.explore.cluster', { n: m.members?.length ?? 0 })}: ${m.label}`);
        b.dataset.testid = 'pin-cluster';
        b.onclick = (e) => {
          e.stopPropagation();
          const gl = globeRef.current;
          if (!gl) return;
          gl.controls().autoRotate = false;
          gl.pointOfView({ lat: m.lat, lng: m.lng, altitude: Math.max(0.55, gl.pointOfView().altitude * 0.4) }, reduceMotion() ? 0 : 1000);
        };
        return b;
      }
      if (m.kind === 'pin') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = altitude < 1.5 ? 'globe-pin' : 'globe-pin globe-pin--dot';
        b.textContent = altitude < 1.5 ? m.label : '';
        b.setAttribute('aria-label', m.label);
        b.title = t('site.explore.pin_title');
        b.dataset.testid = `pin-${m.region?.id ?? ''}`;
        b.onclick = (e) => {
          e.stopPropagation();
          if (m.region) regionRef.current(m.region);
        };
        return b;
      }
      const s = document.createElement('span');
      s.className = 'globe-city';
      s.textContent = m.label;
      return s;
    });
  }, [ready, index.data, lang, altitude, t]);

  // ---- open the square named in the URL (map screen) --------------------------------------------
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || mode !== 'map' || !grid) return;
    const m = view.region?.match(/^cell:(\d{1,3})_(\d{1,3})$/);
    if (!m) return;
    const g = globeRef.current;
    if (!g) return;
    restored.current = true;
    g.pointOfView({ lat: grid.lat0 + Number(m[1]) * grid.dlat, lng: grid.lon0 + Number(m[2]) * grid.dlon, altitude: 1.5 }, 0);
  }, [mode, grid, view.region, ready]);

  useEffect(() => {
    if (flat || failed || IS_OFFLINE_BUILD) loadOutlines().then(setOutlines, () => setOutlines(null));
  }, [flat, failed]);

  // ---- choosing a record ------------------------------------------------------------------------
  const chooseVariable = (v: CatalogVariable, understood?: Understood) => {
    if (mode === 'map') navigate({ screen: 'map', variable: v.id, season, region: view.region }, { replace: true });
    else setLocalVar(v.id);
    if (v.status !== 'analysed' && v.status !== 'sensitivity') setSelection({ kind: 'variable', variable: v, understood });
    else if (selection?.kind === 'variable') setSelection(null);
  };

  // ---- the ask box --------------------------------------------------------------------------------
  const ctx: MatchContext = {
    variables,
    regions: index.data?.regions ?? [],
    pairs: index.data?.pairs ?? [],
    seasons: seasons.map((id) => {
      const long = t(`season.${id}.long`);
      const nick = long.match(/\(([^)]+)\)/)?.[1];
      return { id, words: [long, t(`season.${id}.short`), ...(nick ? [nick] : [])] };
    }),
    cities: CITIES,
    countries: (countries.data ?? []).map((c) => ({ name: c.properties.name, lat: c.properties.lat, lon: c.properties.lon })),
    mapGrid: grid,
  };
  const ask = (q: string) => {
    const u = understand(q, ctx);
    const r = route(u, ctx);
    if (u.variable) {
      if (mode === 'map') navigate({ screen: 'map', variable: u.variable.id, season }, { replace: true });
      else setLocalVar(u.variable.id);
    }
    if (r.kind === 'compare') {
      window.location.hash = toHash(r.view);
      return;
    }
    if (r.kind === 'region') return selectRegion(r.region, u);
    const firstPlace = u.places[0];
    if (firstPlace?.kind === 'country') {
      const feature = findCountry(countries.data ?? [], firstPlace.name);
      if (feature) return focusCountry(feature, u);
    }
    if (r.kind === 'cell') return selectCell(r.lat, r.lon, r.label, u);
    if (u.variable && u.variable.status === 'deferred') return setSelection({ kind: 'variable', variable: u.variable, understood: u });
    setSelection({ kind: 'noplace', understood: u });
  };

  const urlCell = mode === 'map' ? view.region?.match(/^cell:(\d{1,3})_(\d{1,3})$/) : null;
  const current: Selection | null = selection ?? (urlCell ? { kind: 'cell', row: Number(urlCell[1]), col: Number(urlCell[2]) } : null);
  const tries = [t('site.explore.try_1'), t('site.explore.try_2'), t('site.explore.try_3'), t('site.explore.try_4')];
  const panelOpen = current !== null;
  const zoom = (k: number) => {
    const g = globeRef.current;
    if (!g) return;
    const p = g.pointOfView();
    g.pointOfView({ ...p, altitude: Math.max(0.15, Math.min(4, p.altitude * k)) }, 450);
  };

  let panel: ReactNode = null;
  const cellCountry =
    current?.kind === 'cell' ? countryAt(countries.data ?? [], (grid?.lat0 ?? 89.5) + current.row * (grid?.dlat ?? -1), (grid?.lon0 ?? -179.5) + current.col * (grid?.dlon ?? 1)) : null;
  if (current?.kind === 'country') {
    panel = activeLayer && variable ? (
      <CountryPanel
        key={`${current.feature.properties.name}_${variable.id}`}
        name={current.feature.properties.name}
        cells={current.cells}
        layer={activeLayer}
        variable={variable}
        understood={current.understood}
        reportHref={(() => {
          const r = exploreForCountryName(exploreIndex.data, current.feature.properties.name);
          return r ? href({ screen: 'place', region: r.id, variable: variable.id }) : undefined;
        })()}
        onPickCell={(row, col) => {
          if (!grid) return;
          selectCell(grid.lat0 + row * grid.dlat, grid.lon0 + col * grid.dlon);
        }}
      />
    ) : variable ? (
      <VariablePanel variable={variable} hasMap={false} understood={current.understood} />
    ) : null;
  } else if (current?.kind === 'cell') {
    panel = activeLayer && variable ? (
      <CellPanel
        key={`${current.row}_${current.col}_${variable.id}`}
        layer={activeLayer}
        variable={variable}
        row={current.row}
        col={current.col}
        label={current.label}
        country={cellCountry}
        understood={current.understood}
        onCountry={
          cellCountry && findCountry(countries.data ?? [], cellCountry)
            ? () => {
                const feature = findCountry(countries.data ?? [], cellCountry);
                if (feature) focusCountry(feature);
              }
            : undefined
        }
      />
    ) : variable ? (
      <VariablePanel variable={variable} hasMap={false} understood={current.understood} />
    ) : null;
  } else if (current?.kind === 'region') {
    panel = <RegionPanel region={current.region} index={index.data} catalog={catalog.data} understood={current.understood} />;
  } else if (current?.kind === 'variable') {
    panel = <VariablePanel variable={current.variable} hasMap={Boolean(activeLayer)} understood={current.understood} />;
  } else if (current?.kind === 'noplace') {
    panel = <NoPlacePanel understood={current.understood} />;
  }

  const showFlat = flatView;

  return (
    <section
      className={cn(
        'dark relative isolate overflow-hidden bg-ocean text-ink',
        mode === 'home' ? 'min-h-[620px] lg:h-[min(880px,calc(100dvh-var(--header-h)))]' : 'min-h-[680px] lg:h-[calc(100dvh-var(--header-h))]',
      )}
      aria-label={t('site.explore.region_label')}
      data-testid="globe-explorer"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(900px_700px_at_58%_50%,var(--ocean-2)_0%,transparent_70%)]" aria-hidden="true" />
      <div className={cn('grid h-full grid-cols-1', panelOpen ? 'lg:grid-cols-[320px_minmax(0,1fr)_440px]' : 'lg:grid-cols-[320px_minmax(0,1fr)]')}>
        {/* Left: question, ask box and the records */}
        <aside className="flex min-w-0 flex-col gap-5 overflow-y-auto border-line px-4 py-5 sm:px-6 lg:border-r lg:px-5">
          {intro}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = question.trim();
              if (q) ask(q);
            }}
            className="flex items-center gap-2 rounded-[8px] border border-line-strong bg-surface-2/80 p-1.5 pl-3 focus-within:border-accent"
          >
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
            <label htmlFor="ask-input" className="sr-only">
              {t('site.explore.ask_label')}
            </label>
            <input
              id="ask-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('site.explore.ask_placeholder')}
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-muted"
              data-testid="ask-input"
            />
            <button type="submit" className="min-h-10 rounded-[6px] bg-accent px-4 font-semibold text-ocean hover:brightness-110" data-testid="ask-submit">
              {t('site.explore.ask_button')}
            </button>
          </form>
          <div className="-mt-2 flex flex-wrap gap-1.5" aria-label={t('site.explore.tries')}>
            {tries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuestion(q);
                  ask(q);
                }}
                className="min-h-8 rounded-full border border-line-strong px-3 text-[13px] text-muted hover:border-accent hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
          {variables.length ? <VariableRail variables={variables} value={variable?.id} onPick={(v) => chooseVariable(v)} /> : null}
        </aside>

        {/* Centre: the globe (or the flat map) */}
        <div className="relative h-[62vh] min-h-[380px] min-w-0 lg:h-auto">
          {showFlat ? (
            <div key="flat" className="flex h-full flex-col gap-3 overflow-y-auto bg-bg p-3 pt-16 sm:p-4 sm:pt-16" data-testid="flat-map">
              {activeLayer ? <Legend layer={activeLayer} colormap={variable?.colormap?.trend} /> : null}
              {activeLayer ? (
                <ScreeningMap
                  layer={activeLayer}
                  colormap={variable?.colormap?.trend}
                  outlines={outlines}
                  lang={lang}
                  label={`${t('map.title')} ${t('map.label')}`}
                  onOpen={(row, col) => {
                    if (!grid) return;
                    selectCell(grid.lat0 + row * grid.dlat, grid.lon0 + col * grid.dlon);
                  }}
                />
              ) : layer.status === 'loading' ? null : (
                <MissingPanel />
              )}
            </div>
          ) : (
            <div key="globe" ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" role="group" aria-label={t('site.explore.globe_label')} data-testid="globe" />
          )}
          {!showFlat && !ready ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-xs uppercase tracking-[0.12em] text-muted">{t('site.explore.loading')}</p>
          ) : null}

          {/* Layer status and view switch */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 sm:inset-x-4 sm:top-4">
            <p className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface/85 px-3 py-1.5 text-[13px] backdrop-blur-md" data-testid="map-label">
              <span className={cn('size-2 rounded-full', activeLayer ? 'bg-strong' : 'bg-accent')} aria-hidden="true" />
              {variable ? <b className="font-semibold">{pick(variable.name, lang)}</b> : null}
              <span className="text-muted">
                {activeLayer
                  ? t('site.explore.layer_line', { from: int(activeLayer.meta.window.first, lang), to: int(activeLayer.meta.window.last, lang), n: int(activeLayer.meta.nTestable, lang) })
                  : layer.status === 'loading'
                    ? t('site.common.loading')
                    : variable?.status === 'deferred'
                      ? t('record_card.not_analysed')
                      : t('site.explore.no_map')}
              </span>
            </p>
            {activeLayer ? (
              <p className="pointer-events-auto rounded-full border border-line bg-surface/85 px-3 py-1.5 text-[13px] backdrop-blur-md" data-testid="map-tests">
                {t('map.label')}
              </p>
            ) : null}
            <div className="pointer-events-auto ml-auto flex items-center gap-2">
              {!showFlat && activeLayer ? (
                <button
                  type="button"
                  aria-pressed={yearsOn}
                  onClick={() => {
                    setYearsOn((y) => !y);
                    setPlaying(false);
                  }}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-2 rounded-[6px] border px-3 text-[13px] font-semibold backdrop-blur-md',
                    yearsOn ? 'border-accent bg-accent text-ocean' : 'border-line bg-surface/85 hover:border-accent',
                  )}
                  data-testid="view-years"
                >
                  <History className="size-4" aria-hidden="true" />
                  {t('site.years.toggle')}
                </button>
              ) : null}
              {!showFlat && activeLayer && !yearsOn ? (
                <button
                  type="button"
                  aria-pressed={columns}
                  onClick={() => setColumns((c) => !c)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-2 rounded-[6px] border px-3 text-[13px] font-semibold backdrop-blur-md',
                    columns ? 'border-accent bg-accent text-ocean' : 'border-line bg-surface/85 hover:border-accent',
                  )}
                  data-testid="view-columns"
                >
                  <BarChart3 className="size-4" aria-hidden="true" />
                  {t('site.explore.columns')}
                </button>
              ) : null}
              <SegmentedControl
                size="sm"
                label={t('site.explore.view_label')}
                value={showFlat ? 'flat' : 'globe'}
                onValueChange={(v) => setFlat(v === 'flat')}
                options={[
                  { value: 'globe', label: t('site.explore.view_globe'), disabled: IS_OFFLINE_BUILD || failed, testId: 'view-globe' },
                  { value: 'flat', label: t('site.explore.view_flat'), testId: 'view-flat' },
                ]}
                className="bg-surface/85 backdrop-blur-md"
              />
            </div>
          </div>

          {!showFlat ? (
            <>
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 sm:bottom-4 sm:left-4">
                {yearsOn ? (
                  <YearsPanel
                    status={years.status}
                    years={yearsData}
                    frame={fi}
                    onFrame={setFrame}
                    playing={playing}
                    onPlay={(on) => {
                      if (on && fi >= nYears - 1) setFrame(0);
                      setPlaying(on);
                    }}
                    colormap={variable?.colormap?.value}
                    name={variable ? pick(variable.name, lang) : ''}
                  />
                ) : activeLayer ? (
                  <Legend layer={activeLayer} colormap={variable?.colormap?.trend} opacity={opacity} onOpacity={setOpacity} columns={columns} />
                ) : null}
              </div>
              <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5 sm:bottom-4 sm:right-4">
                <button type="button" onClick={() => zoom(0.6)} aria-label={t('site.map.zoom_in')} className="grid size-10 place-items-center rounded-[6px] border border-line bg-surface/85 backdrop-blur-md hover:border-accent">
                  <Plus className="size-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => zoom(1 / 0.6)} aria-label={t('site.map.zoom_out')} className="grid size-10 place-items-center rounded-[6px] border border-line bg-surface/85 backdrop-blur-md hover:border-accent">
                  <Minus className="size-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => globeRef.current?.pointOfView(HOME_VIEW, reduce ? 0 : 900)}
                  aria-label={t('site.map.reset')}
                  className="grid size-10 place-items-center rounded-[6px] border border-line bg-surface/85 backdrop-blur-md hover:border-accent"
                >
                  <Globe2 className="size-5" aria-hidden="true" />
                </button>
              </div>
              {ready && !panelOpen && !yearsOn ? (
                <p className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/45 px-3 py-1.5 text-[13px] text-white md:block">
                  {t('site.explore.hint')}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Right: the answer, printed on the atlas's ivory sheet */}
        {panelOpen ? (
          <aside className="paper relative min-w-0 overflow-y-auto border-line bg-surface px-5 pb-6 pt-5 text-ink lg:border-l" aria-live="polite" data-testid="explore-panel">
            <button
              type="button"
              onClick={() => {
                setSelection(null);
                globeRef.current?.polygonsData([]).ringsData([]);
                if (mode === 'map') navigate({ screen: 'map', variable: variable?.id, season }, { replace: true });
              }}
              aria-label={t('site.common.close')}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink"
              data-testid="explore-close"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            {current?.kind === 'cell' && current.from ? (
              <button
                type="button"
                onClick={() => {
                  const from = current.from;
                  if (from) setSelection(from);
                  globeRef.current?.polygonsData([]).ringsData([]);
                }}
                className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-[14px] font-medium text-link hover:underline"
                data-testid="back-to-country"
              >
                ← {t('site.country.back', { country: current.from.feature.properties.name })}
              </button>
            ) : null}
            <div className="pr-8">{panel}</div>
          </aside>
        ) : null}
      </div>
      {showFlat ? null : (
        <p className="sr-only">
          {t('site.explore.keyboard_note')}{' '}
          <button type="button" onClick={() => setFlat(true)}>
            {t('site.explore.view_flat')}
          </button>
        </p>
      )}
    </section>
  );
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe explorer (ADR-23): a realistic Earth (NASA Blue Marble, bundled) alone in space, which any visitor can
// turn, zoom and click anywhere. It opens with no data layer: the "Parameters" button (top left) paints a record's
// screening map over it. Country borders are drawn as crisp lines with the countries' names; a hovered country
// lights up. A click opens that 1° square for every record (or the one on the globe), a country opens whole with its
// real outline, a pin opens a registered place (graded verdicts), and the search box routes a free-text question
// with the smart matcher (no AI). The globe library loads only on this screen, so the first view stays small.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, ChevronDown, ChevronUp, Globe2, History, Minus, Plus, Search, X } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import type { CatalogVariable, Region } from '../data/types';
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
import { exploreForCountryName, framesOf, loadFramesExtra, useExploreIndex, useMapYears, type Frames, type FramesKind } from '../data/explore';
import { NoPlacePanel, RegionPanel, VariablePanel } from './ExplorePanels';
import { CountryPanel } from './CountryPanel';
import { PlaceSheet, useLayer } from './PlaceSheet';
import { ParamDock } from './ParamDock';
import { LayerLegend } from './LayerLegend';
import { YearDock } from './YearDock';
import { cellsInCountry, findCountry, fitAltitude } from './country';
import { countryLabel, countryLabels, frameOf, squareName } from './naming';
import type { CountryFeature } from '../data/places';
import { MissingPanel } from '../components/LoadState';
import { SegmentedControl } from '../ui/common/toggle-group';
import { cn } from '../ui/common/utils';
import { COPILOT_HOSTED } from '../copilot/hosted';

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
  polygonGeoJsonGeometry(f: (d: object) => object): GlobeLike;
  polygonCapColor(f: (d: object) => string): GlobeLike;
  polygonSideColor(f: (d: object) => string): GlobeLike;
  polygonStrokeColor(f: (d: object) => string): GlobeLike;
  polygonAltitude(f: (d: object) => number): GlobeLike;
  polygonsTransitionDuration(ms: number): GlobeLike;
  polygonCapCurvatureResolution(f: (d: object) => number): GlobeLike;
  polygonLabel(f: (d: object) => string): GlobeLike;
  onPolygonClick(cb: (p: object, e: MouseEvent, c: { lat: number; lng: number }) => void): GlobeLike;
  onPolygonHover(cb: (p: object | null) => void): GlobeLike;
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

type CountryFrom = { kind: 'country'; feature: CountryFeature; cells: number[] };

type Selection =
  | { kind: 'cell'; row: number; col: number; label?: string; understood?: Understood; from?: CountryFrom }
  | { kind: 'region'; region: Region; understood?: Understood }
  | { kind: 'variable'; variable: CatalogVariable; understood?: Understood }
  | { kind: 'noplace'; understood: Understood }
  | { kind: 'country'; feature: CountryFeature; cells: number[]; understood?: Understood };

interface Marker {
  kind: 'pin' | 'city' | 'cluster' | 'country' | 'target';
  lat: number;
  lng: number;
  label: string;
  region?: Region;
  members?: Region[];
}

/** One polygon on the globe: a country's border, the chosen country, or the chosen square. */
interface Poly {
  kind: 'border' | 'country' | 'cell';
  name: string;
  geometry: object;
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

const HOME_VIEW = { lat: 20, lng: 60, altitude: 2.4 };

/** The opening view: a phone steps further back so the whole Earth fits its narrow screen. */
function homeView() {
  return typeof window !== 'undefined' && window.innerWidth < 640 ? { ...HOME_VIEW, altitude: 3.3 } : HOME_VIEW;
}

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Glass buttons over the globe. */
const glass = 'border border-white/12 bg-[#0a1e38]/78 backdrop-blur-xl shadow-[0_12px_30px_-14px_rgb(0_0_0/0.9)]';

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
  /** The records the Parameters button offers: tested ones and cross-checks. */
  const params = useMemo(() => variables.filter((v) => v.status === 'analysed' || v.status === 'sensitivity'), [variables]);
  const exploreIndex = useExploreIndex();
  /** The records with a screening map in this build (the exploration index lists them; else the tested ones). */
  const mapVars = useMemo(() => {
    const ids = exploreIndex.data?.variables.map((v) => v.id);
    return ids ? params.filter((v) => ids.includes(v.id)) : params.filter((v) => v.status === 'analysed');
  }, [params, exploreIndex.data]);
  const [localVar, setLocalVar] = useState<string | undefined>(undefined);
  // The globe opens with no layer: a record is painted only once the reader picks one.
  const variableId = mode === 'map' ? view.variable : localVar;
  const variable = variables.find((v) => v.id === variableId);
  const seasons = prereg.data ? [prereg.data.seasons.main, ...prereg.data.seasons.secondary] : ['ANN'];
  const season = mode === 'map' && view.season && seasons.includes(view.season) ? view.season : 'ANN';
  const root = build.data?.root;
  const layer = useLayer(variable?.id, season);
  const activeLayer = layer.status === 'ok' ? (layer.data ?? null) : null;
  const countries = useAsync('countries', () => loadCountries());
  const [opacity, setOpacity] = useState(0.62);
  const [flat, setFlat] = useState(false);
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [altitude, setAltitude] = useState(2.25);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [question, setQuestion] = useState('');
  const [askFocus, setAskFocus] = useState(false);
  const [columns, setColumns] = useState(false);
  const [yearsOn, setYearsOn] = useState(false);
  const [frame, setFrame] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetMin, setSheetMin] = useState(false);
  const flatView = flat || failed || IS_OFFLINE_BUILD;
  const [framesKind, setFramesKind] = useState<FramesKind | null>(null);
  const years = useMapYears(variable?.id, season, yearsOn && !flatView && Boolean(activeLayer));
  const yearsData = years.status === 'ok' ? years.data : undefined;
  const kinds = useMemo<FramesKind[]>(
    () => (yearsData ? ['values', ...(yearsData.meta.anomaly ? (['anomaly'] as const) : []), ...(yearsData.meta.decades ? (['change'] as const) : [])] : ['values']),
    [yearsData],
  );
  // Year by year opens on each year against the baseline (the Earth stays visible); values and then-and-now are a tap away.
  const wanted = framesKind ?? (kinds.includes('anomaly') ? 'anomaly' : 'values');
  const kind: FramesKind = kinds.includes(wanted) ? wanted : 'values';
  const extraKind = kind === 'values' ? null : kind;
  const extra = useAsync<Int8Array | Int16Array>(yearsData && extraKind && root !== undefined ? `frames|${root}|${yearsData.meta.variable}|${season}|${extraKind}` : null, () =>
    yearsData && extraKind ? loadFramesExtra(root ?? '', yearsData, extraKind) : Promise.reject(new Error('no frames')),
  );
  const frames = useMemo<Frames | null>(() => (yearsData ? framesOf(yearsData, kind, extra.data) : null), [yearsData, kind, extra.data]);
  const framesStatus = years.status !== 'ok' ? years.status : kind === 'values' ? 'ok' : extra.status;
  const yearsActive = yearsOn && !flatView && Boolean(frames);
  const nYears = frames?.years.length ?? 0;
  const fi = frame === null ? Math.max(0, nYears - 1) : Math.min(frame, Math.max(0, nYears - 1));

  const host = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeLike | null>(null);
  const earthRef = useRef<HTMLImageElement | null>(null);
  const grid = index.data?.grids.find((g) => g.id === 'global_1deg') ?? activeLayer?.meta.grid;
  const hoverRef = useRef<Poly | null>(null);
  const nameOfCountry = useCallback((n: string) => countryLabel(n, lang, exploreIndex.data), [lang, exploreIndex.data]);

  // ---- selection helpers -------------------------------------------------------------------
  const resetPicked = useCallback(() => setPicked(null), []);
  const selectCell = useCallback(
    (lat: number, lng: number, label?: string, understood?: Understood) => {
      if (!grid) return;
      const id = cellId(grid, lat, lng);
      const [, rc] = id.split(':');
      const [row, col] = (rc ?? '0_0').split('_').map(Number);
      setSelection((prev) => ({ kind: 'cell', row: row ?? 0, col: col ?? 0, label, understood, from: prev?.kind === 'country' ? prev : prev?.kind === 'cell' ? prev.from : undefined }));
      setSheetMin(false);
      const g = globeRef.current;
      if (g) {
        const cLat = grid.lat0 + (row ?? 0) * grid.dlat;
        const cLng = grid.lon0 + (col ?? 0) * grid.dlon;
        g.controls().autoRotate = false;
        g.ringsData([{ lat: cLat, lng: cLng }]);
        const p = g.pointOfView();
        g.pointOfView({ lat: cLat, lng: cLng, altitude: Math.max(0.75, Math.min(p.altitude, 1.05)) }, reduce ? 0 : 1100);
      }
      if (mode === 'map') navigate({ screen: 'map', variable: variable?.id, season, region: id }, { replace: true });
    },
    [grid, mode, navigate, reduce, season, variable?.id],
  );

  const selectRegion = useCallback(
    (region: Region, understood?: Understood) => {
      setSelection({ kind: 'region', region, understood });
      setSheetMin(false);
      const g = globeRef.current;
      if (g) {
        g.controls().autoRotate = false;
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
      setSheetMin(false);
      const g = globeRef.current;
      if (g) {
        g.controls().autoRotate = false;
        g.ringsData([]);
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
          .atmosphereColor('#7ab8ff')
          .atmosphereAltitude(0.2)
          .bumpImageUrl('./textures/earth-topology.png')
          .onGlobeClick(({ lat, lng }) => pickRef.current(lat, lng))
          .polygonsTransitionDuration(0)
          .onPolygonClick((_p, _e, c) => pickRef.current(c.lat, c.lng))
          .ringsData([])
          .ringColor(() => (x: number) => `rgba(255,210,122,${1 - x})`)
          .ringMaxRadius(2.6)
          .ringPropagationSpeed(2)
          .ringRepeatPeriod(1300)
          .htmlLat((d) => (d as Marker).lat)
          .htmlLng((d) => (d as Marker).lng)
          .htmlAltitude(0.012)
          .onPointClick((p) => pickRef.current((p as { lat: number }).lat, (p as { lng: number }).lng))
          .onZoom((p) => setAltitude(p.altitude < 0.9 ? 0.8 : p.altitude < 1.6 ? 1.2 : 2.25));
        g.renderer().setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
        g.controls().autoRotate = !reduce;
        g.controls().autoRotateSpeed = 0.28;
        g.controls().enableDamping = true;
        g.pointOfView(homeView(), 0);
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

  // ---- the surface: Earth + layer (borders are drawn as lines, below) ---------------------------
  const focus = selection?.kind === 'country' ? selection : selection?.kind === 'cell' ? (selection.from ?? null) : null;
  const focusSet = useMemo(() => (focus ? { feature: focus.feature, cells: new Set(focus.cells) } : null), [focus]);
  useEffect(() => {
    const g = globeRef.current;
    const earth = earthRef.current;
    if (!ready || !g || !earth || yearsActive || (variable && layer.status === 'loading')) return;
    const id = window.setTimeout(() => {
      g.globeImageUrl(composeTexture(earth, activeLayer, variable?.colormap?.trend, columns ? opacity * 0.3 : opacity, [], focusSet));
    }, 40);
    return () => window.clearTimeout(id);
  }, [ready, activeLayer, layer.status, variable, opacity, focusSet, columns, yearsActive]);

  // ---- borders, the chosen country's real outline, the chosen square ------------------------------
  const cellPoly = useMemo<Poly | null>(() => {
    const sel = selection;
    if (!grid || sel?.kind !== 'cell') return null;
    const cLat = grid.lat0 + sel.row * grid.dlat;
    const cLng = grid.lon0 + sel.col * grid.dlon;
    const h = Math.abs(grid.dlat) / 2;
    // Clockwise ring: the square itself, not the rest of the sphere.
    return { kind: 'cell', name: '', geometry: { type: 'Polygon', coordinates: [[[cLng - h, cLat - h], [cLng - h, cLat + h], [cLng + h, cLat + h], [cLng + h, cLat - h], [cLng - h, cLat - h]]] } };
  }, [grid, selection]);
  const borderPolys = useMemo<Poly[]>(() => (countries.data ?? []).map((f) => ({ kind: 'border', name: f.properties.name, geometry: f.geometry })), [countries.data]);
  useEffect(() => {
    const g = globeRef.current;
    if (!ready || !g) return;
    const chosen = focus ? ({ kind: 'country', name: focus.feature.properties.name, geometry: focus.feature.geometry } as Poly) : null;
    const data: Poly[] = [...borderPolys, ...(chosen ? [chosen] : []), ...(cellPoly ? [cellPoly] : [])];
    const cap = (d: object) => {
      const p = d as Poly;
      if (p.kind === 'cell') return 'rgba(255,214,120,0.62)';
      if (p.kind === 'country') return 'rgba(233,180,76,0.10)';
      return hoverRef.current && hoverRef.current.name === p.name && hoverRef.current.kind === 'border' ? 'rgba(160,210,255,0.16)' : 'rgba(0,0,0,0)';
    };
    g.polygonGeoJsonGeometry((d) => (d as Poly).geometry)
      .polygonCapColor(cap)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor((d) => {
        const p = d as Poly;
        if (p.kind === 'cell') return '#fff1c9';
        if (p.kind === 'country') return '#ffcf6b';
        return 'rgba(225,238,255,0.62)';
      })
      // A 1° square needs a fine cap mesh, or its cap folds away to nothing.
      .polygonCapCurvatureResolution((d) => ((d as Poly).kind === 'cell' ? 0.2 : 5))
      .polygonAltitude((d) => ((d as Poly).kind === 'cell' ? 0.012 : (d as Poly).kind === 'country' ? 0.008 : 0.004))
      .polygonLabel((d) => {
        const p = d as Poly;
        return p.kind === 'border' ? `<span class="globe-tip">${countryLabel(p.name, lang, exploreIndex.data)}</span>` : '';
      })
      .onPolygonHover((d) => {
        const p = (d as Poly | null) ?? null;
        if (p?.name === hoverRef.current?.name) return;
        hoverRef.current = p && p.kind === 'border' ? p : null;
        g.polygonCapColor((x) => cap(x));
        if (host.current) host.current.style.cursor = p ? 'pointer' : '';
      })
      .polygonsData(data);
  }, [ready, borderPolys, focus, cellPoly, lang, exploreIndex.data]);

  // ---- the time-lapse: each year's frame painted into the globe's own texture -------------------------
  const painterRef = useRef<{ frames: Frames; focus: unknown; painter: YearPainter } | null>(null);
  const savedImage = useRef<unknown>(null);
  useEffect(() => {
    const g = globeRef.current;
    const earth = earthRef.current;
    if (!ready || !g || !earth || !yearsActive || !frames) return;
    let p = painterRef.current;
    if (!p || p.frames !== frames || p.focus !== focusSet) {
      p = { frames, focus: focusSet, painter: new YearPainter(earth, [], focusSet, frames) };
      painterRef.current = p;
    }
    const interp = frames.kind === 'values' ? sequential(variable?.colormap?.value) : diverging(variable?.colormap?.trend);
    const cv = p.painter.paint(Math.min(fi, frames.years.length - 1), interp, Math.min(0.9, opacity + 0.12));
    const mat = g.globeMaterial();
    if (mat.map) {
      if (savedImage.current === null) savedImage.current = mat.map.image;
      mat.map.image = cv;
      mat.map.needsUpdate = true;
    } else {
      g.globeImageUrl(cv.toDataURL('image/jpeg', 0.85));
    }
  }, [ready, yearsActive, frames, fi, focusSet, opacity, variable?.colormap?.value, variable?.colormap?.trend]);
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

  // ---- names: countries (by size and zoom), cities, and pins for registered places ------------------------
  const labels = useMemo(() => countryLabels(countries.data ?? []), [countries.data]);
  const targetSel = selection?.kind === 'cell' ? selection : null;
  const targetAt = useMemo(
    () => (grid && targetSel ? { lat: grid.lat0 + targetSel.row * grid.dlat, lng: grid.lon0 + targetSel.col * grid.dlon } : null),
    [grid, targetSel],
  );
  useEffect(() => {
    const g = globeRef.current;
    if (!ready || !g) return;
    const minSpan = altitude >= 2 ? 16 : altitude >= 1 ? 6 : 1.5;
    const countryMarks: Marker[] = labels.filter((c) => c.span >= minSpan).map((c) => ({ kind: 'country', lat: c.lat, lng: c.lon, label: countryLabel(c.name, lang, exploreIndex.data) }));
    const pins: Marker[] = (index.data?.regions ?? []).filter((r) => r.inSet).map((r) => ({ kind: 'pin', lat: r.centroid[1], lng: r.centroid[0], label: pick(r.name, lang), region: r }));
    const cities: Marker[] =
      altitude >= 2
        ? []
        : CITIES.filter((c, i, all) => all.findIndex((x) => x.lat === c.lat && x.lon === c.lon) === i)
            .filter((c) => c.tier === 1 || altitude < 1)
            .map((c) => ({ kind: 'city', lat: c.lat, lng: c.lon, label: lang === 'bn' && c.bn ? c.bn : c.name }));
    const target: Marker[] = targetAt ? [{ kind: 'target', lat: targetAt.lat, lng: targetAt.lng, label: '' }] : [];
    g.htmlElementsData([...countryMarks, ...cities, ...clusterPins(pins, altitude), ...target]).htmlElement((d) => {
      const m = d as Marker;
      if (m.kind === 'target') {
        // A sighting reticle over the chosen square, so it is found at any zoom.
        const s = document.createElement('span');
        s.className = 'globe-target';
        s.dataset.testid = 'globe-target';
        return s;
      }
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
      s.className = m.kind === 'country' ? 'globe-country' : 'globe-city';
      s.textContent = m.label;
      return s;
    });
  }, [ready, index.data, lang, altitude, t, labels, exploreIndex.data, targetAt]);

  // ---- open the square named in the URL (map screen) --------------------------------------------
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || mode !== 'map' || !grid) return;
    const m = view.region?.match(/^cell:(\d{1,3})_(\d{1,3})$/);
    if (!m) return;
    const g = globeRef.current;
    if (!g) return;
    restored.current = true;
    g.controls().autoRotate = false;
    g.pointOfView({ lat: grid.lat0 + Number(m[1]) * grid.dlat, lng: grid.lon0 + Number(m[2]) * grid.dlon, altitude: 1.4 }, 0);
  }, [mode, grid, view.region, ready]);

  useEffect(() => {
    if (flat || failed || IS_OFFLINE_BUILD) loadOutlines().then(setOutlines, () => setOutlines(null));
  }, [flat, failed]);

  // ---- choosing a record ------------------------------------------------------------------------
  const chooseVariable = (v: CatalogVariable | null, understood?: Understood) => {
    if (mode === 'map') navigate({ screen: 'map', variable: v?.id, season: v ? season : undefined, region: view.region }, { replace: true });
    else setLocalVar(v?.id);
    if (!v) {
      setYearsOn(false);
      setColumns(false);
      setPlaying(false);
    }
    // The open place follows the globe: the new record alone, or every record when the layer comes off.
    setPicked(v && mapVars.some((x) => x.id === v.id) ? [v.id] : null);
    if (v && v.status !== 'analysed' && v.status !== 'sensitivity') setSelection({ kind: 'variable', variable: v, understood });
    else if (selection?.kind === 'variable') setSelection(null);
  };

  // ---- the search box --------------------------------------------------------------------------------
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
    setAskFocus(false);
    if (u.variable) {
      if (mode === 'map') navigate({ screen: 'map', variable: u.variable.id, season }, { replace: true });
      else setLocalVar(u.variable.id);
      setPicked(mapVars.some((x) => x.id === u.variable?.id) ? [u.variable.id] : null);
    } else resetPicked();
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
  const closePanel = useCallback(() => {
    setSelection(null);
    resetPicked();
    globeRef.current?.ringsData([]);
    if (mode === 'map') navigate({ screen: 'map', variable: variable?.id, season: variable ? season : undefined }, { replace: true });
  }, [mode, navigate, resetPicked, season, variable]);
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !menuOpen && !(e.target instanceof HTMLInputElement)) closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, menuOpen, closePanel]);

  // The records the open place shows: the one on the globe, else all of them; the chips change it.
  const sheetVars = mapVars;
  const defaultPicked = variable && sheetVars.some((v) => v.id === variable.id) ? [variable.id] : sheetVars.map((v) => v.id);
  const selected = picked ?? defaultPicked;

  let panel: ReactNode = null;
  const cellLatLon = current?.kind === 'cell' && grid ? { lat: grid.lat0 + current.row * grid.dlat, lon: grid.lon0 + current.col * grid.dlon } : null;
  const cellCountry = cellLatLon ? countryAt(countries.data ?? [], cellLatLon.lat, cellLatLon.lon) : null;
  const countryFeature = (name: string | null) => findCountry(countries.data ?? [], name);
  if (current?.kind === 'country') {
    const name = current.feature.properties.name;
    const r = exploreForCountryName(exploreIndex.data, name);
    const label = countryLabel(name, lang, exploreIndex.data);
    panel = (
      <CountryPanel
        key={name}
        feature={current.feature}
        label={label}
        cells={current.cells}
        variables={sheetVars}
        selected={selected}
        onSelected={setPicked}
        understood={current.understood}
        regionId={r?.id}
        reportHref={r ? href({ screen: 'place', region: r.id, variable: selected.length === 1 ? selected[0] : undefined }) : undefined}
        onPickCell={(row, col) => {
          if (!grid) return;
          selectCell(grid.lat0 + row * grid.dlat, grid.lon0 + col * grid.dlon);
        }}
      />
    );
  } else if (current?.kind === 'cell' && cellLatLon) {
    const feature = countryFeature(cellCountry);
    const cLabel = cellCountry ? countryLabel(cellCountry, lang, exploreIndex.data) : null;
    const named = current.label ?? (cellCountry ? squareName(t, lang, cellLatLon, cellCountry, feature ? frameOf(feature) : null, cLabel ?? cellCountry) : t('site.explore.ocean'));
    // A name that starts a heading starts with a capital ("Eastern Algeria"); Bangla has no case.
    const title = named.charAt(0).toUpperCase() + named.slice(1);
    panel = (
      <PlaceSheet
        key={`${current.row}_${current.col}`}
        variables={sheetVars}
        selected={selected}
        onSelected={setPicked}
        row={current.row}
        col={current.col}
        lat={cellLatLon.lat}
        lon={cellLatLon.lon}
        title={title}
        country={cLabel}
        understood={current.understood}
        onCountry={feature ? () => focusCountry(feature) : undefined}
      />
    );
  } else if (current?.kind === 'region') {
    panel = <RegionPanel region={current.region} index={index.data} catalog={catalog.data} understood={current.understood} />;
  } else if (current?.kind === 'variable') {
    panel = <VariablePanel variable={current.variable} hasMap={Boolean(activeLayer)} understood={current.understood} />;
  } else if (current?.kind === 'noplace') {
    panel = <NoPlacePanel understood={current.understood} />;
  }

  const showFlat = flatView;
  const showIntro = Boolean(intro) && !panelOpen && !menuOpen && !yearsOn && !activeLayer;

  const viewSwitch = (
    <SegmentedControl
      size="sm"
      label={t('site.explore.view_label')}
      value={showFlat ? 'flat' : 'globe'}
      onValueChange={(v) => setFlat(v === 'flat')}
      options={[
        { value: 'globe', label: t('site.explore.view_globe'), disabled: IS_OFFLINE_BUILD || failed, testId: 'view-globe' },
        { value: 'flat', label: t('site.explore.view_flat'), testId: 'view-flat' },
      ]}
      className="border-white/12 bg-[#0a1e38]/78 backdrop-blur-xl max-sm:[&_button]:px-2 max-sm:[&_button]:text-[12.5px]"
    />
  );

  return (
    <section
      className="dark relative isolate h-[calc(100dvh-var(--header-h))] min-h-[560px] overflow-hidden bg-[#020812] text-ink"
      aria-label={t('site.explore.region_label')}
      data-testid="globe-explorer"
    >
      {/* Space: a deep field of stars and a soft glow behind the Earth. */}
      <div className="starfield pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_52%,rgb(38_92_160/0.32)_0%,transparent_70%)]" aria-hidden="true" />

      {/* The globe (or the flat map) */}
      {showFlat ? (
        <div key="flat" className={cn('absolute inset-0 overflow-y-auto bg-bg px-3 pb-6 pt-[124px] transition-[right] duration-300 sm:px-5 sm:pt-[84px]', panelOpen && 'lg:right-[480px]')} data-testid="flat-map">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
            {activeLayer ? <LayerLegend layer={activeLayer} colormap={variable?.colormap?.trend} className="w-full max-w-[420px]" /> : null}
            {grid && (activeLayer || !variable) ? (
              <ScreeningMap
                layer={activeLayer}
                grid={grid}
                colormap={variable?.colormap?.trend}
                outlines={outlines}
                countries={countries.data ?? []}
                countryName={nameOfCountry}
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
        </div>
      ) : (
        <div
          key="globe"
          ref={host}
          className={cn('absolute inset-0 isolate z-0 cursor-grab transition-[right,bottom] duration-500 active:cursor-grabbing', panelOpen && 'lg:right-[460px]', panelOpen && !sheetMin && 'max-lg:bottom-[38%]')}
          role="group"
          aria-label={t('site.explore.globe_label')}
          data-testid="globe"
        />
      )}
      {!showFlat && !ready ? (
        <p className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-xs uppercase tracking-[0.12em] text-muted">{t('site.explore.loading')}</p>
      ) : null}

      {/* A dim veil behind the open Parameters staircase */}
      <AnimatePresence>
        {menuOpen ? (
          <motion.div key="veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 z-[15] bg-gradient-to-r from-[#020812]/85 via-[#020812]/45 to-transparent" aria-hidden="true" />
        ) : null}
      </AnimatePresence>

      {/* Top: Parameters, the search box, and the view switches */}
      <div className={cn('pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start gap-2 sm:inset-x-4', panelOpen && 'lg:right-[476px]')}>
        <ParamDock variables={params} value={variable?.id} onPick={(v) => chooseVariable(v)} onOpenChange={setMenuOpen} />
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = question.trim();
            if (q) ask(q);
          }}
          className="pointer-events-auto relative order-last w-full sm:order-none sm:w-auto sm:min-w-[180px] sm:max-w-[440px] sm:flex-1 sm:basis-[180px]"
        >
          <div className={cn('flex items-center gap-2 rounded-full p-1 pl-4 focus-within:border-accent/80', glass)}>
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
            <label htmlFor="ask-input" className="sr-only">
              {t('site.explore.ask_label')}
            </label>
            <input
              id="ask-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onFocus={() => setAskFocus(true)}
              onBlur={() => window.setTimeout(() => setAskFocus(false), 150)}
              placeholder={t('site.explore.ask_placeholder')}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent py-2 text-[14.5px] outline-none placeholder:text-muted"
              data-testid="ask-input"
            />
            <button type="submit" className="min-h-9 rounded-full bg-accent px-4 text-[14px] font-semibold text-ocean hover:brightness-110" data-testid="ask-submit">
              {t('site.explore.ask_button')}
            </button>
          </div>
          <AnimatePresence>
            {askFocus && !question ? (
              <motion.ul
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                className={cn('absolute inset-x-0 top-[calc(100%+6px)] z-30 m-0 flex list-none flex-col gap-0.5 rounded-[18px] p-1.5', glass)}
                aria-label={t('site.explore.tries')}
              >
                {tries.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuestion(q);
                        ask(q);
                      }}
                      className="flex min-h-9 w-full items-center gap-2 rounded-[12px] px-3 text-left text-[13.5px] text-muted hover:bg-white/10 hover:text-ink"
                    >
                      <Search className="size-3.5 shrink-0" aria-hidden="true" />
                      {q}
                    </button>
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </form>
        <div className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-2">
          {!showFlat && activeLayer ? (
            <button
              type="button"
              aria-pressed={yearsOn}
              onClick={() => {
                setYearsOn((y) => !y);
                setPlaying(false);
              }}
              className={cn('inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-full px-3.5 text-[13px] font-semibold max-sm:px-0', yearsOn ? 'border border-accent bg-accent text-ocean' : cn(glass, 'hover:border-accent'))}
              data-testid="view-years"
            >
              <History className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{t('site.years.toggle')}</span>
            </button>
          ) : null}
          {!showFlat && activeLayer && !yearsOn ? (
            <button
              type="button"
              aria-pressed={columns}
              onClick={() => setColumns((c) => !c)}
              className={cn('inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-full px-3.5 text-[13px] font-semibold max-sm:px-0', columns ? 'border border-accent bg-accent text-ocean' : cn(glass, 'hover:border-accent'))}
              data-testid="view-columns"
            >
              <BarChart3 className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{t('site.explore.columns')}</span>
            </button>
          ) : null}
          {viewSwitch}
        </div>
      </div>

      {/* The page's own words, floating in space until the reader starts exploring */}
      <AnimatePresence>
        {showIntro && !showFlat ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35 }}
            className={cn('globe-intro pointer-events-auto absolute bottom-4 left-3 right-3 z-10 max-w-[380px] sm:left-5 lg:bottom-auto lg:top-[22%]', mode === 'map' && 'max-lg:hidden')}
            data-testid="globe-intro"
          >
            {intro}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!showFlat ? (
        <>
          {/* Bottom left: what the globe shows, and its colour key */}
          <div className={cn('pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2 sm:bottom-4 sm:left-4', showIntro && mode === 'home' && 'max-lg:hidden', panelOpen && 'max-lg:hidden')}>
            <p className={cn('pointer-events-auto m-0 inline-flex max-w-[calc(100vw-90px)] items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px]', glass)} data-testid="map-label">
              <span className={cn('size-2 shrink-0 rounded-full', activeLayer ? 'bg-strong shadow-[0_0_8px_var(--grade-strong)]' : 'bg-accent')} aria-hidden="true" />
              {variable ? <b className="truncate font-semibold">{pick(variable.name, lang)}</b> : null}
              <span className="truncate text-muted">
                {activeLayer
                  ? t('site.explore.layer_line', { from: int(activeLayer.meta.window.first, lang), to: int(activeLayer.meta.window.last, lang), n: int(activeLayer.meta.nTestable, lang) })
                  : variable && layer.status === 'loading'
                    ? t('site.common.loading')
                    : variable?.status === 'deferred'
                      ? t('record_card.not_analysed')
                      : variable
                        ? t('site.explore.no_map')
                        : t('site.gx.no_layer')}
              </span>
            </p>
            {activeLayer ? (
              <p className={cn('pointer-events-auto m-0 rounded-full px-3 py-1 text-[11.5px] text-muted', glass)} data-testid="map-tests">
                {t('map.label')}
              </p>
            ) : null}
            {activeLayer && !yearsOn ? <LayerLegend layer={activeLayer} colormap={variable?.colormap?.trend} opacity={opacity} onOpacity={setOpacity} columns={columns} /> : null}
          </div>

          {/* Bottom centre: the year dock */}
          {yearsOn && activeLayer ? (
            <div className={cn('pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center sm:bottom-4', panelOpen && 'lg:right-[460px]', panelOpen && 'max-lg:hidden')}>
              <YearDock
                status={framesStatus}
                frames={frames}
                kind={kind}
                kinds={kinds}
                onKind={(k) => {
                  setPlaying(false);
                  setFramesKind(k);
                }}
                frame={fi}
                onFrame={setFrame}
                playing={playing}
                onPlay={(on) => {
                  if (on && fi >= nYears - 1) setFrame(0);
                  setPlaying(on);
                }}
                colormap={variable?.colormap?.value}
                trendColormap={variable?.colormap?.trend}
                rule={yearsData?.meta.rule ?? 'mean'}
                name={variable ? pick(variable.name, lang) : ''}
                onClose={() => {
                  setYearsOn(false);
                  setPlaying(false);
                }}
              />
            </div>
          ) : null}

          {/* Bottom right: zoom; where the copilot's floating button exists, the column sits above it. */}
          <div className={cn('absolute right-3 z-10 flex flex-col gap-1.5 sm:right-4', COPILOT_HOSTED ? 'bottom-20 lg:bottom-24' : 'bottom-3 sm:bottom-4', panelOpen && 'lg:right-[476px]', panelOpen && 'max-lg:hidden', showIntro && mode === 'home' && 'max-sm:hidden', yearsOn && 'max-sm:bottom-[220px]')}>
            {[
              { k: 0.6, label: t('site.map.zoom_in'), Icon: Plus },
              { k: 1 / 0.6, label: t('site.map.zoom_out'), Icon: Minus },
            ].map(({ k, label, Icon }) => (
              <button key={label} type="button" onClick={() => zoom(k)} aria-label={label} className={cn('grid size-10 place-items-center rounded-full hover:border-accent', glass)}>
                <Icon className="size-[18px]" aria-hidden="true" />
              </button>
            ))}
            <button type="button" onClick={() => globeRef.current?.pointOfView(homeView(), reduce ? 0 : 900)} aria-label={t('site.map.reset')} className={cn('grid size-10 place-items-center rounded-full hover:border-accent', glass)}>
              <Globe2 className="size-[18px]" aria-hidden="true" />
            </button>
          </div>
          {ready && !panelOpen && !yearsOn && !showIntro ? (
            <p className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/45 px-3 py-1.5 text-[12.5px] text-white/90 xl:block">{t('site.explore.hint')}</p>
          ) : null}
        </>
      ) : null}

      {/* The answer: a sheet on the right (a bottom sheet on phones), printed on the atlas's ivory paper */}
      <AnimatePresence>
        {panelOpen ? (
          <motion.aside
            key="sheet"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40, y: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className={cn(
              'paper absolute z-30 flex flex-col overflow-hidden bg-surface text-ink shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]',
              'inset-x-0 bottom-0 rounded-t-[24px] border-t border-line lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:w-[444px] lg:rounded-[24px] lg:border',
              sheetMin ? 'max-lg:h-[76px]' : 'max-lg:h-[62%]',
            )}
            aria-live="polite"
            data-testid="explore-panel"
          >
            <div className="flex shrink-0 items-center gap-1 border-b border-line/70 px-3 py-2">
              <button
                type="button"
                onClick={() => setSheetMin(!sheetMin)}
                aria-label={sheetMin ? t('site.gx.sheet_open') : t('site.gx.sheet_min')}
                aria-expanded={!sheetMin}
                className="grid size-10 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink lg:hidden"
              >
                {sheetMin ? <ChevronUp className="size-5" aria-hidden="true" /> : <ChevronDown className="size-5" aria-hidden="true" />}
              </button>
              {current?.kind === 'cell' && current.from ? (
                <button
                  type="button"
                  onClick={() => {
                    const from = current.from;
                    if (from) setSelection(from);
                    globeRef.current?.ringsData([]);
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-medium text-link hover:underline"
                  data-testid="back-to-country"
                >
                  ← {t('site.country.back', { country: countryLabel(current.from.feature.properties.name, lang, exploreIndex.data) })}
                </button>
              ) : (
                <span className="px-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">{t('site.gx.sheet_title')}</span>
              )}
              <button type="button" onClick={closePanel} aria-label={t('site.common.close')} className="ml-auto grid size-10 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink" data-testid="explore-close">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">{panel}</div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

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

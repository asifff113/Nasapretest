// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Types of the result files the site reads (schemas/*.schema.json). The site only reads them.

export type Lang = 'en' | 'bn';
export type LangText = Record<Lang, string>;
export type LangList = Record<Lang, string[]>;

export type Status = 'verdict' | 'no_verdict';
export type Grade = 'strong' | 'supported' | 'cant_tell_yet';
export type Family = 'confirmatory' | 'secondary' | 'exploration' | 'sensitivity';
export type Reason =
  | 'outside_domain'
  | 'short_record'
  | 'too_short'
  | 'missing_year'
  | 'not_testable'
  | 'break_review'
  | 'exploration'
  | 'sensitivity';

export interface Current {
  schema: string;
  buildId: string;
  path: string;
  previous: string[];
  synthetic?: boolean;
}

export interface ProvenanceItem {
  product: string;
  shortName: string;
  version: string;
  doi: string | null;
  route: string;
  granules: number | null;
  accessed: string | null;
  note?: string | null;
}

export interface Provenance {
  items: ProvenanceItem[];
  inputManifestSha256: string;
  preregSha256: string;
  configSha256: string;
  engine: string;
  buildId: string;
  created: string;
}

export interface Window {
  id: string;
  first: number;
  last: number;
}

export interface Multiplicity {
  method: string;
  familySize: number | null;
  pAdjusted: number | null;
  alpha: number | null;
}

export interface DomainCheck {
  id: string;
  passed: boolean | null;
  value: string | number | null;
  limit: string | number | null;
}

export interface Stats {
  n: number;
  mk: { S: number; varS: number; tau: number; z: number; p: number; pKind: string } | null;
  ar1: { phiRaw: number | null; phi: number | null; vif: number | null; estimator: string } | null;
  mkAr1: { varSStar: number; z: number; p: number; pKind: string } | null;
  sen: {
    slopePerYear: number;
    intercept: number;
    ciLowPerYear: number | null;
    ciHighPerYear: number | null;
    multiplier: number;
    nPairs: number;
  } | null;
  change: {
    ratePerDecade: number;
    rateLowPerDecade: number | null;
    rateHighPerDecade: number | null;
    total: number | null;
    totalLow: number | null;
    totalHigh: number | null;
    span: number;
    units: string;
    percent: number | null;
    baseline: number | null;
    residSd: number | null;
    snr: number | null;
  } | null;
  ttest: {
    available: boolean;
    slopePerYear?: number | null;
    se?: number | null;
    nEff?: number | null;
    t?: number | null;
    df?: number | null;
    p?: number | null;
    ciLowPerYear?: number | null;
    ciHighPerYear?: number | null;
    role: string;
  } | null;
  naive: { z: number; p: number; label: string } | null;
  leftover: {
    stat: number | null;
    m: number;
    mEff: number;
    rhoBar: number | null;
    phiCells: number | null;
    critical: number | null;
    passed: boolean | null;
    source: string;
  } | null;
}

export interface BreakItem {
  id: string;
  year: number | null;
  label: LangText;
  status: string;
  review: { outcome: string; reviewer: string; note: string } | null;
}

export interface WindowItem {
  id: string;
  first: number;
  last: number;
  ran: boolean;
  ratePerDecade: number | null;
  rateLowPerDecade: number | null;
  rateHighPerDecade: number | null;
  p: number | null;
  agrees: boolean | null;
}

export interface Robustness {
  gaps: { missingYears: number[] };
  coverage: { status: string; cmin: number | null; cmax: number | null; p: number | null };
  breaks: BreakItem[];
  loo: { status: string; year: number | null; pMax: number | null; pMin: number | null } | null;
  windows: { status: string; agree: number; ran: number; items: WindowItem[] } | null;
  pettitt: { flagged: boolean; year: number | null; U?: number | null; p?: number | null; method?: string } | null;
}

export type Point = [number, number];

export interface ChartBlock {
  values: (number | null)[];
  offset: number;
  pivot: Point | null;
  line: [Point, Point] | null;
  band: { low: [Point, Point]; high: [Point, Point] } | null;
}

export interface Spine {
  status: Status;
  grade: Grade | null;
  reason: Reason | null;
  ratePerDecade: number | null;
  rateLowPerDecade: number | null;
  rateHighPerDecade: number | null;
  units: string;
  family: Family;
  familySize: number | null;
  inDomain: boolean;
}

export interface ResultText {
  headline: string;
  howMuch: string[];
  howSure: string[];
  checks: string[];
  practical: string[];
  overturn: string[];
  notes: string[];
}

export interface Practical {
  threshold: number | null;
  units: string;
  position: 'exceeds' | 'overlaps' | 'smaller' | null;
}

export interface Verdict {
  schema: string;
  synthetic?: boolean;
  id: string;
  variable: { id: string; kind: string; source: string; units: string; rule: string; ratioScale: boolean };
  region: { id: string; kind: string; areaKm2: number | null };
  season: string;
  window: Window;
  family: Family;
  multiplicity: Multiplicity;
  status: Status;
  grade: Grade | null;
  reason: Reason | null;
  series: { years: number[]; values: (number | null)[]; units: string };
  domain: { inDomain: boolean; checks: DomainCheck[] };
  stats: Stats;
  robustness: Robustness;
  doubts: string[];
  practical: Practical | null;
  overturn: string[];
  /** The path of the IMERG sensitivity result for this verdict, when there is one. */
  sensitivity: string | null;
  spine: Spine;
  chart: ChartBlock | null;
  text: Record<Lang, ResultText>;
  provenance: Provenance;
}

export interface ContrastSide {
  id: string;
  verdict: string;
  ratePerDecade: number | null;
  rateLowPerDecade: number | null;
  rateHighPerDecade: number | null;
  pAdjusted: number | null;
  status: Status;
  grade: Grade | null;
  inDomain: boolean;
}

export interface SplitGrid {
  sharedCells: number;
  effectiveCellsA: number;
  effectiveCellsB: number;
  passes: boolean;
}

export interface Split {
  rule: string;
  grids: Record<string, SplitGrid>;
  passes: boolean;
}

export interface ContrastSensitivity {
  variable: string;
  path: string;
  window: Window;
  rateImergPerDecade: number | null;
  rateMerraPerDecade: number | null;
  sameSign: boolean | null;
  imergExcludesZero: boolean | null;
  merraExcludesZero: boolean | null;
}

export interface Contrast {
  schema: string;
  synthetic?: boolean;
  id: string;
  pair: { id: string; a: string; b: string; preRegistered: boolean; lead: boolean };
  variable: string;
  season: string;
  window: Window;
  family: Family;
  multiplicity: Multiplicity;
  status: Status;
  grade: Grade | null;
  reason: Reason | null;
  estimand: string;
  difference: { years: number[]; values: (number | null)[]; units: string };
  domain: { inDomain: boolean; checks: DomainCheck[] };
  stats: Stats;
  robustness: Robustness;
  doubts: string[];
  regions: { a: ContrastSide; b: ContrastSide };
  labels: { oppositeFittedDirections: boolean; supportedOppositeTrends: boolean; ratesDiffer: boolean };
  sensitivity: ContrastSensitivity | null;
  practical: Practical | null;
  spine: Spine;
  chart: ChartBlock | null;
  split: Split | null;
  overturn?: string[];
  text: Record<Lang, ResultText>;
  provenance: Provenance;
}

export interface LineupItem {
  variable: string;
  season: string;
  family: Family;
  status: Status;
  grade: Grade | null;
  reason: Reason | null;
  ratePerDecade: number | null;
  rateLowPerDecade: number | null;
  rateHighPerDecade: number | null;
  units: string;
  pAdjusted: number | null;
  qWithinLineup: number | null;
  path: string;
}

export interface Lineup {
  schema: string;
  synthetic?: boolean;
  region: string;
  nTests: number;
  familySizes: Record<string, number>;
  items: LineupItem[];
  provenance: Provenance;
}

export interface RecordCard {
  gaps: LangText;
  known_breaks: { id: string; label: LangText; date: string | null; verified: boolean }[];
  observation_or_model: LangText;
  cannot_answer: LangText;
}

export interface CatalogVariable {
  id: string;
  status: string;
  group: string;
  kind: string;
  source: string | null;
  variable?: string | null;
  conversion?: string | null;
  name: LangText;
  name_mid?: LangText;
  definition: LangText;
  how_measured: LangText;
  units: { monthly: string; aggregated: string } | null;
  rule?: string;
  ratio_scale?: boolean;
  record: { from: number | null; to: number | null } | null;
  record_card: RecordCard | null;
  sensitivity?: string;
  sensitivity_of?: string;
  colormap?: { trend: string; value: string };
  valid_range?: [number, number];
  tags?: string[];
}

export interface CatalogQuestion {
  id: string;
  flow: 'place' | 'compare' | 'none';
  question: LangText;
  shortlist: { variable: string; why: LangText }[];
  also_deferred?: string[];
}

export interface CatalogSource {
  id: string;
  status: string;
  name: string;
  short_name: string | null;
  version: string | null;
  kind: string;
  doi: string | null;
  doi_verified?: boolean;
  citation: string | null;
  reference?: string | null;
  licence?: string | null;
}

export interface Catalog {
  schema: string;
  buildId: string;
  created: string;
  synthetic?: boolean;
  variables: CatalogVariable[];
  questions: CatalogQuestion[];
  sources: CatalogSource[];
}

export interface Grid {
  id: string;
  lat0: number;
  dlat: number;
  nlat: number;
  lon0: number;
  dlon: number;
  nlon: number;
}

export interface Region {
  id: string;
  kind: string;
  role: 'home' | 'division' | 'comparison' | string;
  name: LangText;
  in: LangText;
  bbox: [number, number, number, number];
  centroid: [number, number];
  areaKm2: number;
  boundary: { source: string; licence: string };
  inSet: boolean;
  support: Record<string, { effectiveCells: number; spillShare: number; passes: boolean }>;
  cells: Record<string, string>;
  geom: string | null;
  pairs: string[];
}

export interface Pair {
  id: string;
  a: string;
  b: string;
  lead: boolean;
  preRegistered: boolean;
  question: LangText;
  split: Split;
}

export interface RegionIndex {
  schema: string;
  buildId: string;
  synthetic?: boolean;
  grids: Grid[];
  minNativeCells: number;
  maxSpillShare: number;
  cellIdPattern: string;
  regions: Region[];
  pairs: Pair[];
}

export interface Mask {
  schema: string;
  region: string;
  grid: string;
  cells: [number, number, number][];
  areaKm2: number;
  effectiveCells: number;
  synthetic?: boolean;
}

export interface SeriesFile {
  schema: string;
  synthetic?: boolean;
  variable: string;
  region: string;
  units: { monthly: string; aggregated: string };
  rule: string;
  monthly: { start: string; values: (number | null)[]; coverage: (number | null)[] | null };
  seasons: Record<string, { years: number[]; values: (number | null)[]; monthsUsed: number[]; coverage: unknown }>;
}

export interface CaseBeat {
  at: string;
  caption: LangText;
}

export interface CaseFile {
  schema: string;
  synthetic?: boolean;
  id: string;
  uses: { kind: 'contrast' | 'lineup' | 'verdict'; pair?: string; variable?: string; season?: string; region?: string };
  ending: 'supported' | 'cant_tell_yet' | null;
  title: LangText;
  summary?: LangText;
  results: string[];
  beats: CaseBeat[];
}

export interface OfflineSet {
  schema: string;
  buildId: string;
  synthetic?: boolean;
  cases: { id: string; title: LangText; files: string[] }[];
  files: { path: string; sha256: string; bytes: number }[];
  totalBytes: number;
}

export interface Build {
  schema: string;
  buildId: string;
  created: string;
  synthetic?: boolean;
  engine: { version: string; gitSha: string };
  inputManifest: { path: string; sha256: string };
  prereg: { path: string; sha256: string; commit: string | null; status: string };
  configHashes: Record<string, string>;
  goldenTests: { suite: string; total: number; passed: number };
  products: { source: string; shortName: string; version: string; granules: number }[];
  counts: Record<string, number>;
  files: { count: number; bytes: number };
}

export interface Prereg {
  schema: string;
  status: string;
  commit: string | null;
  signed_by: string[];
  hashes: Record<string, string>;
  alpha: { confirmatory: number; secondary_q: number; map_q: number };
  variables: {
    id: string;
    product: string;
    role: string;
    main_window: { first: number; last: number };
    practical_threshold: { units: string; default: number; by_season: Record<string, number>; reason: string };
  }[];
  seasons: { main: string; secondary: string[]; djf_starts_one_year_later?: boolean };
  regions: { set: { id: string; role: string }[] };
  pairs: { id: string; a: string; b: string; lead?: boolean; question?: LangText }[];
  headline_cases: { kind: string; pair?: string; region?: string; variable: string; season: string }[];
}

export interface Manifest {
  schema: string;
  manifestId: string;
  created: string;
  synthetic?: boolean;
  products: {
    source: string;
    shortName: string;
    version: string;
    doi: string | null;
    query: { provider: string; temporal: [string, string]; bbox: number[] | null };
    variables: string[];
    units: Record<string, string>;
    firstMonth: string;
    lastMonth: string;
    granuleCount: number;
    files: { name: string; month: string; sha256?: string; valuesSha256?: string; bytes: number }[];
  }[];
  checks: { id: string; result: string; note: string }[];
}

export interface MapField {
  name: string;
  dtype: 'int16' | 'float32' | 'uint8';
  scale?: number;
  offset?: number;
  fill?: number | null;
}

export interface MapMeta {
  schema: string;
  synthetic?: boolean;
  variable: string;
  season: string;
  grid: Grid;
  window: Window;
  label: string;
  units: string;
  nCells: number;
  nTestable: number;
  nSignificant: number;
  fdrQ: number;
  colourLimit: number;
  file: string;
  byteOrder: 'little' | 'big';
  layout: string;
  fields: MapField[];
  flagBits: Record<string, number>;
  provenance: Provenance;
}

export interface CellTilesMeta {
  schema: string;
  synthetic?: boolean;
  variable: string;
  grid: Grid;
  tile: { rows: number; cols: number };
  seasons: string[];
  years: { first: number; last: number };
  units: string;
  dtype: 'int16';
  byteOrder: 'little' | 'big';
  scale: number;
  offset: number;
  fill: number;
  layout: string;
  path: string;
  tilesPresent: [number, number][];
  provenance: Provenance;
}

export interface MethodsTables {
  schema: string;
  synthetic?: boolean;
  created: string;
  engine: string;
  seedRule?: string;
  note?: string;
  calibration: { n: number; phi: number; reps: number; falseAlarmPct: number | null; passDomainPct: number | null; falseAlarmAmongPassPct: number | null }[];
  extraRows: { kind: string; n: number; reps: number; falseAlarmPct: number | null }[];
  phiMax: { n: number; phiMax: number | null }[];
  stress: { family: string; n: number; mEff: number; reps: number; falseAlarmPct: number | null; falseAlarmAfterDomainPct: number | null }[];
  coverage: { n: number; phi: number; multiplier: number; reps: number; coveragePct: number | null }[];
  power: { n: number; phi: number; effectSdPerYear: number; reps: number; powerPct: number | null }[];
  leftoverCritical: { n: number; mEff: number; phi: number; critical: number | null; reps: number }[];
  contrast: { case: string; reps: number; ratesDifferPct: number | null; supportedOppositePct: number | null }[];
  mapNull: Record<string, unknown>[];
  golden: { suite: string; total: number; passed: number };
  families: { confirmatory: string[]; secondary: string[]; alpha: number; secondaryQ: number };
  prereg: { sha256: string; commit: string | null };
  inputManifest: { sha256: string };
}

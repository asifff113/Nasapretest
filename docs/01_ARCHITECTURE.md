# 01 — Architecture (final)

This is the architecture the product is built to. It replaces every earlier version. Where another document disagrees with this one about modules, commands, files or deployment, this one wins.

---

## 1. System at a glance

```
 NASA archives                ┌──────────── BUILD (a GitHub Codespace; Python only) ─────────────┐
 MERRA-2 monthly  ──CMR──────►│ PIPELINE  casefile_pipeline   (Part 2: you build it)             │
 IMERG V07 monthly ─CMR──────►│   fetch → units → region weights and support rule →             │
 boundaries (geoBoundaries,   │   monthly region means, cell values, 1° map field               │
 Natural Earth) ─────────────►│        │ writes the INPUT BUNDLE (§5): .npz arrays + 2 JSON      │
                              │        ▼                                                         │
                              │ ENGINE    casefile_engine     (provided, tested: do not change) │
                              │   pre-registration check → annual and season values →           │
                              │   MK-AR1, Sen slope, A − B contrasts, Holm / BH, domain and     │
                              │   robustness checks, map FDR, verdict text in EN and BN         │
                              │        │ writes results/<buildId>/  (JSON + small binaries, §7)  │
                              └────────┼─────────────────────────────────────────────────────────┘
                                       ▼ committed to the repository, served as static files
                              ┌──────────── BROWSER: static site (Part 3: you build it) ─────────┐
                              │ reads results/current.json and only the files a screen needs    │
                              │ displays; computes nothing · one-file offline build             │
                              └──────────────────────────────────────────────────────────────────┘
```

**Four rules hold the design together.**
1. **One engine, one truth.** Every statistic and every verdict sentence is computed once, by `casefile_engine`, in the results build. The pipeline prepares numbers; it tests nothing. The browser formats numbers; it computes nothing.
2. **The engine is provided and frozen.** `python/src/casefile_engine/` is finished, verified code (§4). Nobody edits it to make something pass. Its golden values are checked before every build.
3. **Pre-registration before real trends.** The results build refuses to run unless `config/preregistration.yaml` is filled, has `status: committed`, is committed in git and matches the bundle's hashes. Its SHA-256 goes into every result.
4. **Static and offline.** Everything is static files in one repository on GitHub Pages. The offline build is one HTML file with its cases inlined.

---

## 2. Parts and who does them

The work is split into parts that can be given to different people or agents (`docs/05_BUILD_PLAN.md`). Parts share only the contracts in this document, `schemas/` and `examples/`, so they can run in parallel.

| Part | What | Branch | Owns (may edit) | Needs first |
|---|---|---|---|---|
| 0 | Repository, Codespace, CI, Pages | `main` | `.github/`, `.devcontainer/`, repository settings | — |
| 1 | Engine check (it is provided) | — | nothing: runs tests only | Part 0 |
| 2 | Data pipeline → input bundle | `part-2-pipeline` | `python/src/casefile_pipeline/`, `python/tests/pipeline/` | Part 0 |
| 3 | The site, on the examples | `part-3-site` | `web/` | Part 0 |
| 4 | Pre-registration and the real results | `part-4-results` | `config/preregistration.yaml`, `config/break_review.yaml`, `results/` | Parts 1, 2 |
| 5 | The site on real results; deploy | `part-5-release` | `web/`, `.github/workflows/deploy.yml`, `results/current.json` | Parts 3, 4 |
| 6 | Polish and final checks | `part-6-polish` | `web/` (style and layout) | Part 5 |

No two parts that run at the same time own the same file, so their branches merge without conflicts; each part keeps its session log in its own file, `docs/ai_log/part-<n>.md`. Parts 2 and 3 are the long ones and run side by side. Older text in other documents names three people: **A** = whoever holds the science and Part 4, **B** = Part 2 and deploys, **C** = the site. One person can hold all three.

---

## 3. Repository layout

One public repository, `casefile-earth` (Apache-2.0):

```
casefile-earth/
├── AGENTS.md  CLAUDE.md  README.md
├── docs/  schemas/  config/  examples/  templates/  tools/
├── python/
│   ├── pyproject.toml                  uv project; scripts `casefile-engine`, `casefile-pipeline`
│   ├── src/casefile_engine/            PROVIDED. stats.py layer.py base.py build.py bundle.py mapbuild.py golden.py cli.py
│   │   └── data/sim_tables.json        the simulated methods tables (full size)
│   ├── src/casefile_pipeline/          Part 2 builds this (§6)
│   └── tests/                          test_engine_*.py (provided) · pipeline/ (Part 2)
├── web/                                Part 3 builds this (§6.3)
├── results/                            current.json and one folder per build id (§7); committed
├── .cache/                             downloads and bundles; git-ignored
└── .github/workflows/                  ci.yml  deploy.yml
```

Region ids contain `:`. In file names `:` becomes `__` (`country__BGD`).

---

## 4. The engine (`casefile_engine`): provided

The engine is the reference implementation that produced every golden value, packaged as the product's engine. It implements `docs/03_SCIENCE.md`. It was checked three ways: against the v2 golden series (12 §1), by the simulation studies that settled its methods (12 §8), and by the tests below.

| Module | Holds |
|---|---|
| `stats.py` | Mann–Kendall, Sen slope and interval, AR(1) estimate and correction, MK-AR1, the t-test cross-check, Holm, Benjamini–Hochberg, the leftover-memory statistic and critical values, number formatting, Bangla digits |
| `layer.py` | Annual and season values from monthly values, domain checks D1–D7, robustness checks, Pettitt flag, grades, practical position |
| `base.py` | Configuration loading, methods-table simulations, grids, `spill_share`, `pair_split`, the synthetic example data |
| `build.py` | The results build: families, verdicts, contrasts, line-ups, cases, catalog, offline set, `build.json`, every verdict sentence |
| `mapbuild.py` | The screening map and the cell tiles |
| `bundle.py` | Reading and checking the input bundle, the pre-registration check, `build_results`, `build_examples`, the golden self-check |
| `golden.py` | Rebuilds `examples/golden/` |

**Commands** (run in `python/`):

```bash
uv run casefile-engine selfcheck                     # golden values: 60 of 60 must match (1 second)
uv run casefile-engine synth-bundle <dir>            # the synthetic example as an input bundle: the format reference
uv run casefile-engine check-bundle <bundle>         # files, shapes, units, ranges; prints climatologies only
uv run casefile-engine prereg-check --bundle <b>     # hashes to paste, the families, and what still blocks the build
uv run casefile-engine results --bundle <b> --out ../results/<id> --build-id <id>
uv run casefile-engine examples                      # rebuild examples/ (about 4 minutes; only if the engine changed)
uv run casefile-engine methods-tables                # re-simulate the tables (about 40 minutes; only if analysis.yaml changed)
```

**Tests** (`python/tests/`): `uv run pytest -m "not slow"` runs the golden check, a mutation check (a 0.1% change in one formula must fail), the shipped tables and schema validation of `examples/`. The tables are tied to the simulation settings of `config/analysis.yaml` only, so adding a variable never invalidates them. One fast test adds a variable that exists only in the configuration, on a new grid id, and runs a full results build with it. `uv run pytest -m slow` rebuilds `examples/` and requires it byte-identical (G-12), then runs a whole results build through the real path (bundle on disk, YAML pre-registration, `results`) and requires the same numbers, a valid file set and the refusal without a committed pre-registration.

**What a results build does**, in order: check the bundle; check the pre-registration; run the golden self-check and stop on any mismatch; copy the manifest, region index and masks; compute annual and season values (03 §2.2) for each region series and each cell; run every test of the pre-registered families and the exploration tests; adjust p-values with the family sizes fixed by the pre-registration; run robustness checks; write verdicts, contrasts, line-ups, the map, cell tiles, cases, the catalog, `build.json` and the offline set.

**Rules for the engine.** Do not edit `src/casefile_engine/`. If a real build shows a defect, stop, write down the input that shows it, and let the person holding Part 4 decide. Any change must keep `selfcheck` at 60 of 60 and needs `casefile-engine examples` rerun and reviewed. Other code may import helpers from it (`casefile_engine.base`: the grid definitions `MERRA2`, `IMERG`, `ONE`, `edges`, `spill_share`, `pair_split`, `fpath`, `sha256_file`).

---

## 5. The input bundle: the contract between pipeline and engine

The pipeline writes one folder, the bundle. The engine reads nothing else from the pipeline. `uv run casefile-engine synth-bundle /tmp/b` writes a complete synthetic bundle to copy from, and `check-bundle` checks yours.

```
.cache/bundle/<bundle id>/
├── input_manifest.json                     schemas/input_manifest.schema.json
├── regions/index.json                      schemas/region_index.schema.json
├── regions/cells/<grid>/<region>.json      schemas/mask.schema.json        one per region and grid
├── regions/geom/<region>.json              simplified GeoJSON for the site (optional for the engine)
├── series/<variable>/<region>.npz          one per region and variable
├── pairs/<variable>/<pair id>.npz          one per pre-registered pair and variable
└── map/<variable>__ANN.npz                 air_temp and rain
```

**Variables and units.** Any variable id of `config/variables.yaml`, in that entry's monthly unit. First release: `air_temp` in °C (K − 273.15); `rain` in mm/day (kg m⁻² s⁻¹ × 86 400); `rain_imerg` in mm/day (mm/hr × 24). Missing or fill values are NaN, never zero. The bundle format is the same for every dataset: adding one changes the pipeline's reader and the configuration, nothing else (02 §14).

**`series/<variable>/<region>.npz`** (written with `numpy.savez_compressed`):

| Array | Shape and type | Meaning |
|---|---|---|
| `start` | string `"YYYY-01"` | First month; must be a January (pad with NaN if the record starts later in a year) |
| `monthly` | `[n_months]` float64 | The region's monthly mean: Σ wᵢ xᵢ / Σ wᵢ over the mask's cells with a finite value, with wᵢ = fraction of the cell inside the region × the cell's area (02 §7.2). NaN for a month in which cells holding more than 10% of Σ wᵢ are missing |
| `cells` | `[n_cells][n_months]` float64 | Each mask cell's own monthly values, in the order of the mask file. The engine uses them only for the leftover-memory check. If a region has more than 2 000 cells, keep every k-th |
| `area_km2` | float | Σ fraction × cell area |
| `effective_cells` | float | Σ fraction (the S1 number) |
| `grid` | string | The id of the grid the cells are on: `merra2_native` for `air_temp` and `rain`, `imerg_native` for `rain_imerg`, or a new dataset's grid id (the same id as in `regions/index.json`) |

Records: MERRA-2 from `1980-01` to the last complete year; IMERG from `1998-01` to the last available month (annual values end in 2024).

**`pairs/<variable>/<pair id>.npz`**: `start`, `a` `[n_months]`, `b` `[n_months]`: the monthly means of region A and region B computed with the pair's disjoint cells (02 §7.4: a cell both regions touch belongs to the region holding more of it; a tie drops it). The engine tests the difference of these two. Each region's own verdict still uses its full series. If a pair's regions share no cell, the file may be left out.

**`map/<variable>__ANN.npz`**: `years` `[n_years]` int, `values` `[180][360][n_years]` float: annual means (air_temp, °C) or annual totals (rain, mm) on the 1° grid, row 0 centred at 89.5° N going south, column 0 centred at 179.5° W going east. Regrid by area-weighted averaging from the native grid (02 §6). A cell-year with a missing month is NaN. Compute the annual value with `casefile_engine.layer.annual_values`, or with the same rules (03 §2.2).

**`regions/index.json`**: as `examples/regions/index.json`. For every region: weights on `merra2_native` and `imerg_native`, `support` with `effectiveCells`, `spillShare` and `passes` for each grid (`casefile_engine.base.spill_share`), `inSet`. For every pre-registered pair: `split` from `casefile_engine.base.pair_split`. Its `buildId` is the bundle id.

**`input_manifest.json`**: one entry per product with short name, version, DOI, the query, units as found in the files, first and last month, the granule count and, for each file, its name, month, size and SHA-256 (of the downloaded bytes, or of the extracted values as `valuesSha256` when only a subset was fetched). `"synthetic": false`.

The bundle holds no annual series and no trend. Building and checking it shows climatologies only, so it can be finished before the pre-registration.

---

## 6. What Parts 2 and 3 build

### 6.1 Pipeline (`casefile_pipeline`), suggested modules

| Module | Does |
|---|---|
| `sources/earthdata.py` | Generic for any product in NASA Earthdata: login, CMR search through `earthaccess`, fetching one variable per granule (route order in 02 §2), a file cache in `.cache/raw/` |
| `sources/merra2.py`, `sources/imerg.py`, … | One small reader per source, registered under its id in `config/sources.yaml`: variable path, units, fill, axis order, conversion to the monthly unit. Each returns the same thing: months, the grid's id and definition, and values `[n_months][n_lat][n_lon]`. A new dataset is one more reader (02 §14) |
| `boundaries.py` | Downloading and reading the boundary files (02 §7.1) |
| `regions.py` | Cell fractions for each region on each grid, masks, support rule S1–S2, pair splits S3, `regions/index.json` |
| `series.py` | Monthly region means and cell values; pair series |
| `mapfield.py` | The 1° annual field |
| `manifest.py` | `input_manifest.json` |
| `cli.py` | `casefile-pipeline access-check | fetch | regions | bundle` |

Module names are suggestions; the bundle format is not.

### 6.2 Pipeline tests (`python/tests/pipeline/`)

Unit conversions on a tiny synthetic file; fractions of a known box (compare with `casefile_engine.base.box_weights`); S1–S3 on the worked values of 02 §7.3–§7.4; a tiny end-to-end run on synthetic NetCDF files whose bundle passes `check-bundle`. No test needs the network.

### 6.3 Site (`web/`)

```ts
// web/src/data/results.ts — reads only; never computes
export async function loadCurrent(base: string): Promise<{ buildId: string; root: string }>;
export async function loadJson<T>(root: string, path: string): Promise<T>;
export async function loadMapLayer(root: string, variable: string, season: string): Promise<MapLayer>;
export async function loadCellSeries(root: string, variable: string, row: number, col: number): Promise<CellSeries>;
```

`RESULTS_BASE` (a Vite env value) is `./results` in the deployed site and the path of `examples/` in development; with `examples/` the reader uses the folder itself as the build (its `current.json` names `synthetic-v3`). `offline.ts` serves the same calls from the data inlined in the offline build.

View state lives in the URL hash, so every view can be shared:

```
#/place?region=country:BGD&variable=rain&season=JJAS
#/compare?pair=<pair id>&variable=rain&season=ANN&sensitivity=imerg
#/map?variable=air_temp&season=ANN
#/place?region=cell:66_270&variable=air_temp&season=ANN
#/methods  #/watch/<case>  #/offline  #/data  #/ai  #/about
```

Unknown parameters are ignored; invalid values fall back to defaults with a notice (`schemas/view.schema.json`). A 1° cell opened as a place shows its yearly values from the cell tile and its rate, range, p, q and flags from the map layer, labelled exploration; cells have no verdict file.

---

## 7. Results layout

```
results/current.json                                   { buildId, path } of the build the site shows
results/<buildId>/
├── build.json                                         schemas/build.schema.json
├── input_manifest.json   prereg.json   catalog.json
├── regions/index.json   regions/cells/<grid>/<region>.json   regions/geom/<region>.json
├── series/<variable>/<region>.json                    schemas/series.schema.json
├── verdicts/<variable>/<region>/<season>.json         schemas/verdict.schema.json
├── contrasts/<variable>/<pair>/<season>.json          schemas/contrast.schema.json
├── lineups/<region>.json                              schemas/lineup.schema.json
├── maps/<variable>/ANN/meta.json + cells.bin.gz       schemas/map_meta.schema.json
├── cells/<variable>/meta.json + t/<tr>_<tc>.bin.gz    schemas/cell_tiles.schema.json
├── methods/tables.json                                schemas/methods.schema.json
├── cases/<case>.json                                  schemas/casefile.schema.json
└── offline/set.json                                   schemas/offline_set.schema.json
```

`examples/` has the same layout with synthetic values, plus `verdicts/_states/` (one file for each no-verdict reason) and `golden/`. Earlier builds stay in place; pointing `current.json` at one of them rolls the site back.

**Flow.** `casefile-pipeline bundle` → `casefile-engine check-bundle` → fill and commit the pre-registration → `casefile-engine results` → `python tools/validate_results.py results/<id>` → commit `results/<id>/` and `results/current.json` → the deploy workflow publishes the site with the results.

---

## 8. Budgets

| Item | Budget |
|---|---|
| JS shipped (gzip), online build | ≤ 400 KB initial; the map loads lazily |
| First view on a 4G phone | ≤ 2.5 s to an interactive home screen |
| A place or compare screen | ≤ 300 KB of result files |
| Global screening map, one variable | ≤ 1 MB (gzip) |
| Cell tiles | one tile (about 10 KB) per picked cell; never loaded whole |
| Offline build (one HTML file with its case set) | ≤ 15 MB |
| One results build in the repository | ≤ 50 MB |

---

## 9. Errors, offline, security

| Failure | User sees | Fallback |
|---|---|---|
| Results host unreachable | "Results not reachable" banner | The offline case set; the mirror URL |
| A file missing (404) | That panel says "not in this build" | Never fill with zeros or guess |
| Synthetic data loaded | Yellow banner "Example data, not real measurements" | — |
| Offline | "Offline: showing the cases kept on this device" with the list | — |

- No secrets in the repositories or the bundle. EDL credentials live in Actions secrets or the developer's Codespace. A secret scan (gitleaks) runs in CI.
- The site fetches only its own build's files: Content Security Policy `default-src 'self'; connect-src 'self' <results origin>; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'`. The offline build makes no request.
- No analytics or tracking.

---

## 10. Deployment and CI

Everything is in one repository and one GitHub Pages site: the site at `/`, the results at `/results/`.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | every push and pull request | `uv sync`; `uv run pytest -m "not slow"`; `python tools/validate_pack.py`; in `web/`: `npm ci`, typecheck, lint, unit tests, Playwright on `examples/` |
| `deploy.yml` | push to `main` | Build the site with `RESULTS_BASE=./results`; copy `results/` into the build output; deploy to GitHub Pages |

The results build runs in the Codespace, in a background shell. Earthdata credentials are Codespaces secrets (`EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`); nothing secret is ever committed. A mirror on another static host is optional: the site uses only relative paths, so the built folder works anywhere.

**Reproducibility.** The input manifest pins every input by SHA-256. Seeds are fixed (03 §15). `build.json` records the engine version and git commit, package versions, the pre-registration's SHA-256 and commit, configuration hashes and the golden-test summary. The same bundle, pre-registration and commit give the same files apart from the build id and time.

---

## 11. Decision log

| ADR | Decision | Why | Revisit if |
|---|---|---|---|
| ADR-01 | One Python engine computes every statistic once, in the build; the static site only displays. Replaces v2's TypeScript engine in a Web Worker and its parity tests | Two implementations drift; agents are riskiest at statistics; the site still never sleeps and works offline (v3 D3) | — |
| ADR-02 | First release: air temperature (MERRA-2 T2M) and rain (MERRA-2 PRECTOTCORR), with IMERG V07 Final as a rain sensitivity check. Every other variable keeps its card, marked "not analysed in this release" | Two simple variables the statement names first; validity before breadth (v3 red team) | A deferred product returns one at a time, with its own domain check, after every MUST and SHOULD step is done |
| ADR-03 | Fixed region set (Bangladesh, its divisions that pass the support rule, the pre-registered comparison regions) plus any 1° cell of a precomputed global screening map. No districts or drawn boxes | Coarse grids cannot support small regions; a fixed set can be pre-registered (v3 D9) | — |
| ADR-04 | Region series come from native grids (MERRA-2 0.5° × 0.625°, IMERG 0.1°) with fractional weights; the 1° grid serves only the map and cell pages | Avoids a second smoothing step for the verdicts; contributing cells are shown | — |
| ADR-05 | Pre-registration committed before any real-data trend; its hash is in every result and on the Methods page | Answers "how many places did you look at?" (v3 6.3 r8) | — |
| ADR-06 | MK-AR1 as in 03 §4: φ̂ from the AR(1) regression with intercept and trend, bias-corrected (nφ̂ + 2)/(n − 4), clipped to [0, 0.95]; interval multiplier 2.25; verdicts inside the validated domain only; the t-test is display only | Of four variants that fit v3 rule 1, the largest validated domain and the lowest worst-case false alarms, at or below nominal when memory is absent (12_METHOD_COMPARISON §8.1) | The engine's own calibration table leaves the 5–8% band inside the domain |
| ADR-07 | Offline build = one HTML file with the offline case set inlined (vite-plugin-singlefile); no service worker needed | Opens on a clean laptop by double-click, with no warm cache and no server (v3 M10) | — |
| ADR-08 | Map drawn on a canvas in equirectangular projection with Natural Earth outlines bundled; no tile server | Works offline; nothing external to call | — |
| ADR-09 | GitHub Pages for the site and the results | Fewest accounts; judges see everything on GitHub (see ADR-20) | Results exceed 1 GB |
| ADR-10 | React + TypeScript + Vite; Observable Plot; Zustand | Best known to coding agents; light | — |
| ADR-11 | Bilingual from the start; verdict text from templates, filled by the engine | Bangla audience; no invented numbers | — |
| ADR-12 | Data access through earthaccess and CMR; no on-premises GES DISC URLs; MERRA-2 files found by query, never by name | GES DISC on-premises access is discontinued no earlier than 30 Sep 2026; MERRA-2 stream prefixes change (v3 6.2) | — |
| ADR-13 | NASA POWER is a second-route check of one pipeline series and a fallback data route, never a witness for MERRA-2 and never a live call from the site | POWER's weather is MERRA-2 (v3 #29b) | — |
| ADR-14 | Withdrawn. The plan has one build and no separate preview stage | — | — |
| ADR-15 | No AI in the product; AI is used only for development, logged in `docs/AI_USE.md` | Consensus row 11; the AI narrator is cut | — |
| ADR-16 | Support rule S1 (≥ 4 effective native cells), S2 (spill share ≤ 1/3), S3 (contrasts on disjoint cells, each side ≥ 4 after the split); the leftover-memory check matched on the cells' median φ̃, interpolated in φ, with m_eff from ρ̄² | Computed from the real boundary files and by simulation before any data (12_METHOD_COMPARISON §8.2–§8.3; 02 §7.3–§7.4) | A product with a finer grid becomes the analysed one |
| ADR-17 | UI toolkit: Tailwind CSS with the tokens of 04 §11, shadcn/ui components (Radix primitives, copied into the repository), Lucide icons, Motion for transitions, Observable Plot for charts; fonts and icons bundled | Accessible primitives, a consistent look that coding agents know well, and nothing fetched at run time, so the offline file still works (04 §11) | A component needs a library that cannot be bundled offline |
| ADR-18 | The reference implementation is the product engine, shipped in the package and frozen. It replaces the plan to re-implement the engine from the specification | The reference already produced every golden value and passed the method studies; re-implementing it would spend the available time on reproducing known numbers. What is lost is an independent second implementation | A second implementation is wanted as a cross-check |
| ADR-19 | The pipeline and the engine meet at one input bundle of arrays (§5). The engine owns annual and season aggregation; the pipeline owns only fetching, units, weights and monthly means | One narrow contract lets the two be built and tested apart; the whole real path is tested end to end on the synthetic bundle | — |
| ADR-20 | One repository and one GitHub Pages site hold the code, the results and the site. Replaces the separate data repository, the mirror requirement and the results workflow | Fewer moving parts and one deploy; relative paths keep the site portable | A results build outgrows the repository |
| ADR-21 | The methods tables are simulated once at full size and shipped with the engine, tied to the SHA-256 of `config/analysis.yaml` | They depend only on the configuration, never on data, and take about 40 minutes | `analysis.yaml` changes |
| ADR-22 | The pre-registration is enforced by the build itself: filled, `status: committed`, committed in git, and matching the bundle's hashes; the commit is read from git | One command decides whether real trends may be computed; no manual second commit | — |

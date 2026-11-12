# 05 — Build plan: seven independent parts, each with its prompt

This is the whole plan. Each part has a goal, what to read, what to build, the checks that prove it is done, and a prompt to paste into a coding agent. Parts share only the contracts (`docs/01_ARCHITECTURE.md`, `schemas/`, `examples/`), so different people or agents can take different parts.

```
Part 0  repository + CI ──┬── Part 1  engine check (provided) ──────────────┐
                          ├── Part 2  data pipeline → input bundle ─────────┼─► Part 4  pre-registration + real results ─┐
                          └── Part 3  the site, on the examples ────────────┴──────────────────────────────────────────┴─► Part 5  real site + deploy ─► Part 6  polish + final checks
```

- **Parts 2 and 3 are the long ones. Start both as soon as Part 0 is done**; they never touch the same files.
- Each part is split into steps (2A, 2B, …). Give one step to one agent session. A step's prompt is complete on its own.
- A step is done when its **checks** pass and their output is shown. Nothing else counts as done.
- The site is finished on `examples/` (synthetic data in the real format, with every state the screens must show). Real results then drop in without code changes.

## How the parts stay independent

Every part works on its own branch, owns its own folders and is tested on its own. Nothing a part needs comes from another part's unfinished work: it comes from the package.

| Part | Branch | Owns (nobody else edits these) | Works from | Hands over |
|---|---|---|---|---|
| 0 | `main` (first) | `.github/`, `.devcontainer/`, `.gitignore`, `LICENSE` | the package | green CI, a live Pages URL |
| 2 | `part-2-pipeline` | `python/src/casefile_pipeline/`, `python/tests/pipeline/`, `docs/ai_log/part-2.md` | the synthetic bundle (`casefile-engine synth-bundle`) as the format to match; NASA data | an input bundle in `.cache/bundle/` that `check-bundle` accepts |
| 3 | `part-3-site` | `web/`, `docs/ai_log/part-3.md` | `examples/` (static files; needs no Python and no NASA data) | a site that passes its tests on `examples/` |
| 4 | `part-4-results` | `config/preregistration.yaml`, `config/break_review.yaml`, `results/`, `docs/ai_log/part-4.md` | the bundle and the provided engine | `results/<id>/` and `results/current.json` |
| 5 | `part-5-release` | `web/` (after Part 3 is merged), `.github/workflows/deploy.yml` | the merged site and the results | the deployed site |
| 6 | `part-6-polish` | `web/` (style and layout) | the deployed site | the final site |

- **No shared files.** `python/pyproject.toml` already lists every dependency Parts 2 and 4 need; `schemas/`, `examples/`, `config/` and `python/src/casefile_engine/` are read-only, except for the files a step's prompt names (Part 4's two config files; step 2D's dataset entries). Site-only strings go in `web/src/i18n/`, not in `config/i18n/`. Each part writes its session log in its own file under `docs/ai_log/`.
- **Generic over data.** No code hard-codes a variable id, a region id, a pair id or a year. The pipeline takes them from `config/`, the site from `catalog.json`, `regions/index.json` and `prereg.json`, the tests from the files they run on. That is what lets the site built on `examples/` show the real results unchanged, and lets a new dataset be added without code changes outside its reader (02 §14).
- **Merging.** Merge a part into `main` when its checks pass. Parts 2 and 3 merge in either order and cannot conflict, because they share no file. Part 4 merges after Part 2. Part 5 starts from `main` once Parts 3 and 4 are in. After every merge run the **integration check**:

```bash
cd python && uv sync --extra pipeline && uv run casefile-engine selfcheck && uv run pytest -m "not slow"
cd .. && uv run --project python python tools/validate_pack.py
cd web && npm ci && npm run typecheck && npm test && npm run test:e2e      # once web/ exists
```

**Datasets can still change.** The official resource list may name more datasets. The first build uses MERRA-2 and IMERG; step 2D adds or swaps a dataset later, without touching the engine or the site. Whatever is used must be in place before the pre-registration is committed (Part 4), because the pre-registration names the variables and pins the input files.

**The one ordering rule.** No trend from real data is computed, printed or plotted before `config/preregistration.yaml` is committed (Part 4). The pipeline and its checks show climatologies only. The engine enforces this: `results` refuses to run otherwise.

**How to use a prompt.** Open the repository in the coding agent, start a fresh session on the part's branch, paste the prompt. The agent reads the files itself. Every prompt ends with the same closing block (§8), shown here as `[CLOSING]`. **The folder `prompts/` has each step's prompt as its own file with the closing block already filled in** (`prompts/part-2A.txt`, …): paste those, or hand one to a teammate.

---

## Part 0 — Repository, Codespace, CI

**Goal.** The package is a public GitHub repository with green CI and a live (empty) Pages site.

**You do, by hand:**
1. Create a public repository `casefile-earth`. Unzip this package into it, commit, push to `main`.
2. Each person who will run Part 2 or 4 needs a free NASA Earthdata Login account (`urs.earthdata.nasa.gov`). In the Earthdata profile, under Applications → Authorized Apps, approve **NASA GESDISC DATA ARCHIVE** (MERRA-2 and IMERG are served by GES DISC).
3. In the repository: Settings → Secrets and variables → Codespaces → add `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD`. Never put them in a file, a chat or a commit.
4. Settings → Pages → Source: **GitHub Actions**.
5. Open a Codespace on `main` (4 cores if offered).

**Prompt 0:**
```text
You are setting up the CaseFile Earth repository. Read AGENTS.md and docs/01_ARCHITECTURE.md §3 and §10.

Create:
1. .gitignore: .cache/, .venv/, node_modules/, dist/, __pycache__/, *.pyc, .pytest_cache/, playwright-report/, test-results/.
2. LICENSE: Apache-2.0.
3. .devcontainer/devcontainer.json: Python 3.12, Node 22, uv installed, post-create `cd python && uv sync --extra pipeline`.
4. .github/workflows/ci.yml, on every push and pull request:
   - job python: install uv; in python/: `uv sync`; `uv run casefile-engine selfcheck`; `uv run pytest -m "not slow"`;
     from the repository root: `uv run --project python python tools/validate_pack.py`.
   - job web: runs only if web/package.json exists: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`,
     `npx playwright install --with-deps chromium`, `npm run test:e2e`.
5. .github/workflows/deploy.yml, on push to main: if web/package.json exists, build the site in web/ with
   RESULTS_BASE=./results, copy the repository's results/ folder into the build output as results/, and deploy the
   output to GitHub Pages (actions/upload-pages-artifact + actions/deploy-pages). If web/ does not exist yet, deploy a
   one-line placeholder index.html so that the Pages URL is live.
6. results/.gitkeep.

Do not change anything under python/src/casefile_engine/, schemas/, config/ or examples/.

Checks (run and show the output):
- cd python && uv sync && uv run casefile-engine selfcheck        → "golden self-check: 60/60 cases match"
- uv run pytest -m "not slow"                                      → all pass
- cd .. && uv run --project python python tools/validate_pack.py  → "pack OK"
- after pushing: the ci workflow is green and the Pages URL opens.
[CLOSING]
```

---

## Part 1 — The engine (provided)

**Goal.** Know that the engine works on this machine. There is nothing to write.

**Checks:**
```bash
cd python && uv sync
uv run casefile-engine selfcheck          # golden self-check: 60/60 cases match
uv run pytest -m "not slow"               # passes in seconds
uv run pytest -m slow                     # optional, about 8 minutes: rebuilds examples/ byte-identical and
                                          # runs a complete results build through the real path
uv run casefile-engine synth-bundle /tmp/bundle && uv run casefile-engine check-bundle /tmp/bundle
```

The last line writes the synthetic input bundle and checks it. **That folder is the format Part 2 must produce.**

The engine is frozen (01 §4). If something looks wrong in it, do not edit it: write down the input and what you expected, and tell the person holding Part 4.

---

## Part 2 — Data pipeline → the input bundle

**Goal.** `casefile-pipeline bundle` writes `.cache/bundle/<id>/` in the format of 01 §5, from real NASA data, and `casefile-engine check-bundle` accepts it.

**Read:** 01 §5–§6.1; 02 §2–§4, §7, §9, §14.

**Facts checked against NASA's catalogue (CMR) on 11 Nov 2026:**

| Product | Short name, version | CMR concept id | Variable | One monthly file |
|---|---|---|---|---|
| MERRA-2 single-level | `M2TMNXSLV` `5.12.4` | `C1276812859-GES_DISC` | `T2M` (K) | 51.9 MB |
| MERRA-2 surface flux | `M2TMNXFLX` `5.12.4` | `C1276812868-GES_DISC` | `PRECTOTCORR` (kg m⁻² s⁻¹) | 73.6 MB |
| GPM IMERG Final monthly | `GPM_3IMERGM` `07` | `C2723754851-GES_DISC` | `/Grid/precipitation` (mm/hr) | 17.3 MB |

- Each granule's metadata lists a download URL on `data.gesdisc.earthdata.nasa.gov` and an OPeNDAP URL on `opendap.earthdata.nasa.gov/collections/<concept id>/granules/<granule name>` (related URL with subtype `OPENDAP DATA`).
- Whole files for 1980–2025 would be about 75 GB (552 + 552 + 333 files). **Fetch one variable per file instead**: about 1 MB per MERRA-2 month.
- MERRA-2 file names change their prefix over the record (`MERRA2_100…` in 1980, `MERRA2_400…` in 2024): always take files from the search result, never build names.
- `earthaccess` 0.19 provides `login`, `search_data`, `open`, `download` and `get_requests_https_session`.

### Step 2A — Access check and fetch

**Prompt 2A:**
```text
You are building the fetch stage of the CaseFile Earth pipeline. Read AGENTS.md, docs/01_ARCHITECTURE.md §5–§6.1,
docs/02_DATA.md §2–§3 and §9, and config/sources.yaml.

Build python/src/casefile_pipeline/sources/ and the commands `casefile-pipeline access-check` and
`casefile-pipeline fetch`. Structure it as one generic Earthdata fetcher plus one small reader per source
(docs/01_ARCHITECTURE.md §6.1): everything specific to a product (short name, version, variable path, units, fill,
axis order, conversion) comes from config/sources.yaml and config/variables.yaml or lives in that product's reader,
so that another dataset can be added later by writing one reader and no other code (python/src/casefile_pipeline/cli.py is a stub to replace). Install with
`cd python && uv sync --extra pipeline`.

Login: earthaccess.login(strategy="environment") using EARTHDATA_USERNAME / EARTHDATA_PASSWORD from the environment.
Never print, log or write a credential.

Search: earthaccess.search_data(short_name=..., version=..., temporal=(start, end)) for
  M2TMNXSLV 5.12.4 (T2M), M2TMNXFLX 5.12.4 (PRECTOTCORR), GPM_3IMERGM 07 (/Grid/precipitation).
MERRA-2: 1980-01 to the last month of the last complete year. IMERG: 1998-01 to the latest month available.
Take the month of each granule from its temporal metadata, not from its file name. Fail loudly if a month is
missing or doubled.

Fetch one variable per granule, trying these routes in order and using the first that works for the product:
  1. OPeNDAP subset: take the granule's related URL with Subtype "OPENDAP DATA" (granule["umm"]["RelatedUrls"]);
     GET  <that url>.dap.nc4?dap4.ce=<url-encoded constraint>  with earthaccess.get_requests_https_session().
     Constraint for MERRA-2: /T2M;/time;/lat;/lon (or /PRECTOTCORR;...). For IMERG: /Grid/precipitation;/Grid/lat;/Grid/lon;/Grid/time.
     Save the small NetCDF-4 response in .cache/raw/<short name>/ and open it with xarray (engine "h5netcdf").
  2. Remote read: earthaccess.open([granule]) and xarray.open_dataset(f, engine="h5netcdf", group=...)[variable].load().
  3. Whole file: earthaccess.download(granule, dir), read the variable, delete the file.
Use up to 8 parallel workers, retry with back-off, and skip months already in the cache so a stopped run resumes.

`access-check` does this for ONE granule of each product and prints: the route that worked, the variable's
dimensions and their order, units attribute, fill value, the coordinate ranges, and the min, max and mean of the
field. Expect: T2M in kelvin, dims (time, lat, lon), lat −90…90 (361), lon −180…179.375 (576); PRECTOTCORR in
kg m-2 s-1; IMERG precipitation in mm/hr with dims (time, lon, lat) — transpose to (lat, lon) — and a fill value
near −9999.9. If anything differs from this, stop and report; do not guess.

Convert on read: T2M − 273.15 → °C; PRECTOTCORR × 86400 → mm/day; IMERG × 24 → mm/day. Mask fill values and
non-finite values to NaN before any arithmetic. Store per product one array [n_months][n_lat][n_lon] (float32) with
its month list in .cache/monthly/<short name>.npz. IMERG: keep only the box that covers every region of
config/regions.yaml plus 1° (store the row and column offsets of the box in the same file).

Write the product entries of input_manifest.json (schemas/input_manifest.schema.json): query, variables, units as
found, fill as found, firstMonth, lastMonth, granuleCount, and per file: name, month, bytes and sha256 of the saved
response (plus valuesSha256 of the decoded array). "provider" records the route used. "synthetic": false.

The ordering rule: print climatologies, counts, units and ranges only. Never print or plot a yearly or seasonal
series, a difference between early and late years, or a slope.

Tests in python/tests/pipeline/ (no network): unit conversions; fill masking; the IMERG transpose; month
bookkeeping (a missing or doubled month raises), each on a tiny NetCDF file the test writes itself.

Checks:
- uv run casefile-pipeline access-check         → one granule per product read; the printed facts match the list above
- uv run casefile-pipeline fetch                → run it in a background shell; it resumes if stopped
- uv run pytest tests/pipeline                  → all pass
- .cache/monthly/ holds three files with 552, 552 and at least 333 months (or the counts the catalogue has today)
[CLOSING]
```

**If no route works for a product:** stop and tell the team. 02 §8 describes NASA POWER (no login, MERRA-2-based `T2M` and `PRECTOTCORR`) as a fallback; using it changes the data source named on every screen, so a person decides, not the agent.

### Step 2B — Regions, masks and the support rule

Can start at the same time as 2A: it needs only the boundary files.

**Prompt 2B:**
```text
You are building the regions stage of the CaseFile Earth pipeline. Read AGENTS.md, docs/01_ARCHITECTURE.md §5,
docs/02_DATA.md §4 and §7, config/regions.yaml, config/preregistration.yaml (the regions and pairs it names), and
tools/decide/support_cells.py, support_pairs.py and support_split.py.

Those three scripts already compute cell fractions, the support rule and the pair splits from the real boundary
files; tools/decide/support_out.json, support_pairs_out.json and support_split_out.json hold their results. Reuse
their download addresses and their method; your numbers must reproduce theirs.

Build python/src/casefile_pipeline/boundaries.py and regions.py and the command `casefile-pipeline regions`:
1. Download the boundary files of config/regions.yaml into .cache/boundaries/ (once), and record each licence text.
   Match Bangladesh's divisions on shapeISO (the file spells Rajshahi "Rajshani").
2. For each region and for both grids (casefile_engine.base.MERRA2 and IMERG): the fraction of every cell inside the
   region from 5 × 5 sample points per cell (02 §7.2). The Bay of Bengal is its box minus land.
3. Write regions/cells/<grid>/<region>.json (schemas/mask.schema.json): cells as [row, col, fraction] with
   fraction rounded to 4 decimals, areaKm2, effectiveCells.
4. Support: S1 effective cells ≥ 4 and S2 spill share ≤ 1/3 on each grid, with
   casefile_engine.base.spill_share(cells, grid). inSet = passes on both grids.
5. Pairs: every pair of config/preregistration.yaml (it ships with two recommended pairs; the team may have changed
   them). split = casefile_engine.base.pair_split(masks, a, b), where masks[(region id, grid id)] =
   (cells, areaKm2, effectiveCells). Compute masks for every region of config/regions.yaml, so that the team can
   still choose other pairs later by rerunning this command.
6. Write regions/index.json exactly in the shape of examples/regions/index.json (schemas/region_index.schema.json),
   with kind, role, name and "in" from config/regions.yaml, bbox, centroid, the boundary source and licence.
   Also write regions/geom/<region>.json: the outline simplified to about 0.02°, as GeoJSON, for the site.
Output folder: .cache/bundle/<bundle id>/regions/ (bundle id from --bundle-id, default "b1").

Tests (no network): fractions of a 1° × 1° box against casefile_engine.base.box_weights; spill share and pair split
on a hand-made pair of overlapping boxes; a polygon with a hole.

Checks:
- uv run casefile-pipeline regions                          → writes the index and one mask per region and grid
- The MERRA-2 effective cells and spill shares equal tools/decide/support_out.json within 0.15 cells and 0.02:
  Bangladesh, Dhaka, Khulna, Rajshahi and Rangpur and the six comparison regions pass; Chittagong fails S2;
  Sylhet and Mymensingh fail S1; Barisal fails both. Print the table side by side.
- uv run --project python python tools/validate_results.py .cache/bundle/<id>   → "results OK"
[CLOSING]
```

### Step 2C — Series, pair series, map field, the bundle

Needs 2A and 2B.

**Prompt 2C:**
```text
You are finishing the CaseFile Earth pipeline. Read AGENTS.md, docs/01_ARCHITECTURE.md §5 (the bundle is specified
there, array by array), docs/02_DATA.md §4, and run `uv run casefile-engine synth-bundle /tmp/b` to see a complete
example bundle (open its .npz files with numpy to copy the exact keys and shapes).

Build series.py, mapfield.py, manifest.py and the command `casefile-pipeline bundle --bundle-id <id>`, which reads
.cache/monthly/*.npz (step 2A) and .cache/bundle/<id>/regions/ (step 2B) and writes into .cache/bundle/<id>/:
1. series/<variable>/<region>.npz for every region with inSet = true and for air_temp, rain (MERRA-2 grid) and
   rain_imerg (IMERG grid): start, monthly, cells, area_km2, effective_cells, grid — exactly as 01 §5 defines them.
   monthly = Σ w x / Σ w over the mask's cells with a finite value, w = fraction × cell area (02 §4);
   NaN when cells holding more than 10% of Σ w are missing. cells = each mask cell's own values, in mask order;
   more than 2 000 cells → keep every k-th.
2. pairs/<variable>/<pair id>.npz for every pair of regions/index.json: start, a, b = the two monthly means on the
   pair's disjoint cells (a cell both regions touch belongs to the region with the larger fraction; a tie drops it).
3. map/air_temp__ANN.npz and map/rain__ANN.npz: regrid each month of the global MERRA-2 field to the 1° grid by the
   conservative rule of 02 §4, then casefile_engine.bundle.annual_field(variable, start, field, first, last) gives
   years and values [180][360][n_years].
4. input_manifest.json: the product entries from step 2A plus "checks".
Then run casefile-engine check-bundle on the result.

The ordering rule: this stage handles monthly values and writes annual map values to a file, but prints
climatologies only. Do not print, plot or summarise any yearly series, and do not open the map file to look at it.

Tests (no network): on a tiny synthetic global field and two box regions, the bundle passes check-bundle; the
region mean of a constant field is that constant; a pair with shared cells gets disjoint weights; the regridded
field keeps the area-weighted global mean to 1e-4.

Checks:
- uv run casefile-pipeline bundle --bundle-id b1
- uv run casefile-engine check-bundle ../.cache/bundle/b1     → "bundle OK"; read the table it prints: temperatures
  in °C and rain in mm/day, the wettest months in the monsoon, no unexpected missing months
- uv run pytest tests/pipeline                                → all pass
- uv run casefile-engine prereg-check --bundle ../.cache/bundle/b1   → prints the three hashes (it will also say the
  pre-registration is not filled yet: that is Part 4)
[CLOSING]
```

### Step 2D — Adding or swapping a dataset (when the official resources are known)

Use this when the official resource list names a dataset you want as a variable, or when a product must be replaced. 02 §14 lists the steps. Nothing changes in the engine or the site.

**Prompt 2D:**
```text
You are adding a dataset to the CaseFile Earth pipeline. Read AGENTS.md, docs/02_DATA.md §14, docs/01_ARCHITECTURE.md
§5–§6.1, config/variables.yaml, config/sources.yaml and the existing readers in python/src/casefile_pipeline/sources/.

The dataset: <name, where it is hosted, the variable, its units, its grid and time step — copied from its official
documentation page: <link>>. The variable id to use: <id; an existing "deferred" entry of config/variables.yaml or a new one>.

1. Run an access check on ONE file first and print the variable's dimensions and order, units, fill value, coordinate
   ranges and time step. Stop and report if anything differs from the documentation.
2. Write one reader in sources/ that returns monthly values on the dataset's own grid in the variable's monthly units
   (aggregate daily or sub-monthly data to months first; mask fills to NaN). Register it under the source id.
3. Give the grid an id and its definition (first latitude and longitude, steps, counts) so that `casefile-pipeline
   regions` writes masks and support for it too. A region that fails the support rule on this grid has no series
   for this variable.
4. In config/sources.yaml and config/variables.yaml: fill the entry (names in English and Bangla, units, rule mean or
   sum, valid_range, source, record card, status "analysed"). Never invent a DOI, a citation or a unit: copy them
   from the official page, or leave the field null and say so.
5. `casefile-pipeline bundle` then writes series/<variable id>/… for it. Run casefile-engine check-bundle.
6. Tell the team to add the variable to config/preregistration.yaml (variables: id, product, role, main_window,
   practical_threshold with a reason) — they choose those values, not you.
7. Run `uv run casefile-engine examples` and commit the regenerated examples/ (only hashes change), because the
   example build records the hash of the configuration files.
The ordering rule holds: climatologies, units and ranges only.

Checks:
- the access-check output for the new product
- uv run casefile-engine check-bundle <bundle>     → "bundle OK", with the new variable's rows in the table
- uv run pytest tests/pipeline && uv run pytest -m "not slow"
[CLOSING]
```

---

## Part 3 — The site, on the examples

**Goal.** Every screen of `docs/04_UI.md` works on `examples/`, in English and Bangla, on a phone and a desktop, and as one offline HTML file. The site computes nothing.

**Read:** 04 (all); 01 §6.3, §7–§9; `schemas/`; `examples/`; `config/i18n/`.

**Design direction (decided; do not explore alternatives):** a calm "case file". Paper background, ink text, one amber accent (04 §11). The verdict card is a folder: an amber tab with the case id, then the status as a quiet stamp-like badge before any number, then one plain sentence, then the numbers in tabular figures. Charts have direct labels, the 95% range as a soft band and actual years on the axis. The confidence spine is a thin rail that is always visible. Motion is small and stops under `prefers-reduced-motion`. No cartoon props, no NASA logos. Toolkit: 04 §12.

### Step 3A — Foundation: shell, data reader, languages, Question and Place

**Prompt 3A:**
```text
You are starting the CaseFile Earth site. Read AGENTS.md, docs/04_UI.md §1–§4.3, §8, §11–§12,
docs/01_ARCHITECTURE.md §6.3 and §7–§9, and look through examples/ and schemas/.

Create web/: Vite + React + TypeScript (strict), Tailwind CSS configured with the tokens of 04 §11 (light and dark),
shadcn/ui components copied into web/src/ui/common/, Lucide icons, Motion, Observable Plot, Zustand, Vitest,
Playwright, ESLint. Bundle Inter and Noto Sans Bengali as local font files; nothing is fetched from another origin
at run time.

Build:
1. scripts/compile-strings.mjs (prebuild): config/i18n/en.json and bn.json (read-only: the engine's sentences and
   the shared interface strings) merged with web/src/i18n/site.en.json and site.bn.json (strings you add) →
   src/generated/strings.json; the build fails if a key is missing in either language.
2. src/i18n/: t(key, params), language switch (EN/BN) kept in the URL and localStorage, format.ts for every number
   (Bangla digits in Bangla, the minus sign U+2212, units from the result file).
3. src/data/results.ts, cache.ts, offline.ts as in 01 §6.3. RESULTS_BASE is a Vite env value; in development it
   points at the repository's examples/ folder (serve it with a Vite middleware or copy it to public/ at dev start).
4. src/state/view.ts: view ⇄ URL hash, as in 01 §6.3.
5. The app shell (header, language switch, theme switch, the synthetic-data banner whenever a loaded file has
   "synthetic": true, the error states of 01 §9), the Home and Question screens (04 §4.1–§4.2) from catalog.json,
   with a record card for every variable, and the Place picker (04 §4.3) from regions/index.json, drawing each
   region's contributing cells.

Hard rule: the site computes no statistic. No mean, slope, difference, rounding of a statistic or p-value in web/.
Every displayed number and every verdict sentence comes from a result file; arithmetic is for layout only (scales,
positions). All user-visible text goes through t(); never edit config/i18n/.
Generic over data: no variable id, region id, pair id, season or year is written in the code or in a test. Lists
come from catalog.json, regions/index.json and prereg.json; tests read the ids from the folder they run on (an env
value chooses examples/ or results/<build id>). The same build must show any results folder with this layout.

Checks:
- npm run typecheck && npm run lint && npm test
- npm run test:e2e: W-01, W-02 and W-11 of docs/07_TESTS.md §8 on examples/, at 1280 px and 360 px, EN and BN
- npm run build succeeds; the built site makes no request to another origin (assert it in a Playwright test)
[CLOSING]
```

### Step 3B — Line-up, Verdict, Compare

**Prompt 3B:**
```text
You are building the core result screens of the CaseFile Earth site. Read AGENTS.md, docs/04_UI.md §4.4–§4.6, §4.10,
§5, §6, §9–§10 and §11–§12, and the files in examples/lineups/, examples/verdicts/ (including _states/) and
examples/contrasts/ with their schemas.

Build:
1. Line-up (04 §4.4): the table of tests for a place from lineups/<region>.json, with the number of tests on screen.
2. Verdict card (04 §4.5) from verdicts/<variable>/<region>/<season>.json: status badge first; the sentences of
   "text" in the current language; the chart drawn from the "chart" block only (display values, Sen line, range
   band — the engine computed them; draw, do not compute); rate per decade with its range; the domain checks; the
   robustness checks; "big enough to matter?" from "practical"; "what would overturn this claim" from "overturn";
   the IMERG sensitivity toggle when "sensitivity" is set; the provenance panel (04 §4.10) from "provenance".
3. Every state: verdict (each grade), can't tell yet, no verdict with each reason, exploration. examples/verdicts/
   _states/ has one file per no-verdict reason: render each of them in a test.
4. Compare (04 §4.6) from contrasts/…: the trend in the difference A − B as the headline, each place's own rate
   beside it from "regions", the labels of "labels", the split note from "split", the sensitivity block.
5. The confidence spine (04 §5) from "spine" on every result screen.
Use the design direction of docs/05_BUILD_PLAN.md Part 3.

Hard rule: no arithmetic on result values. "Can't tell yet" always carries its "not the same as no change" line.
A comparison never shows two significance labels side by side as its answer.

Checks:
- npm run typecheck && npm run lint && npm test
- npm run test:e2e: W-03, W-04, W-05, W-07, W-12 and W-13 of docs/07_TESTS.md §8, and one test per file of
  examples/verdicts/_states/, at 1280 and 360 px, EN and BN
- X-01 (axe: no serious or critical violation) and X-02 (keyboard only) on these screens
[CLOSING]
```

### Step 3C — Screening map and cell pages

**Prompt 3C:**
```text
You are building the screening map of the CaseFile Earth site. Read AGENTS.md, docs/04_UI.md §4.7, §4.8, §6.3 and §7,
docs/02_DATA.md §6, examples/maps/air_temp/ANN/meta.json, examples/cells/air_temp/meta.json and their schemas.

Build:
1. loadMapLayer: fetch cells.bin.gz, decompress it in the browser (DecompressionStream, with a small fallback), and
   split it into the fields listed in meta.json (field-major blocks of [180][360]; int16 values × scale; float32 p
   and q; uint8 flags with the bits of meta.flagBits).
2. The map (04 §4.7) on a canvas, equirectangular, with bundled Natural Earth outlines (web/public/outlines/):
   colour = rate per decade within ±meta.colourLimit; significant cells (flag bit 2) drawn solid, the others
   lighter; cells that are not testable hatched; a legend; the label "exploration" and the number of tests on screen.
   Load this screen lazily so that it stays out of the first bundle.
3. Picking a cell opens the cell page (04 §4.8), #/place?region=cell:<row>_<col>: its yearly values from the cell tile
   (cells/<variable>/t/<tr>_<tc>.bin.gz, layout in meta.json) and its rate, range, p, q and flags from the map
   layer, labelled exploration, with no verdict words. A missing tile means "no data here".
Decoding (raw × scale, fill handling, bit tests) is allowed; any statistic is not.

Checks:
- npm run test:e2e: W-06 and W-11 (map and cell views) of docs/07_TESTS.md §8; the tiles present in the example are listed in
  examples/cells/air_temp/meta.json ("tilesPresent")
- a unit test decodes examples/maps/air_temp/ANN/cells.bin.gz and finds meta.nTestable testable cells and
  meta.nSignificant significant cells
- the map chunk is not in the initial bundle (check the build output)
[CLOSING]
```

### Step 3D — Watch cases, Methods and the text pages

**Prompt 3D:**
```text
You are building the remaining pages of the CaseFile Earth site. Read AGENTS.md, docs/04_UI.md §4.9, §4.11 and §4.13,
templates/METHODS_PAGE.md, examples/cases/, examples/methods/tables.json, examples/prereg.json, examples/build.json,
examples/input_manifest.json and docs/AI_USE.md.

Build:
1. Watch cases (04 §4.11): a stepper over the beats of cases/<case>.json, each beat showing its caption (from the
   file) and the screen state its "at" names (question, place, lineup, series, difference, verdict, robustness, methods,
   takeaway). The last screen follows the file's "ending" (schemas/casefile.schema.json): the examples have
   "supported" and no ending; test the "cant_tell_yet" ending with a copy of a case file whose ending you change in
   the test.
2. Methods (04 §4.9; #/methods), one page, from methods/tables.json, prereg.json and build.json: the pre-registration's
   SHA-256 and commit, both families with their sizes, every table (calibration, φ limit, stress, coverage, power,
   leftover critical values, contrast), the golden summary, in the wording of templates/METHODS_PAGE.md. Put the
   template's text into web/src/i18n/site.en.json and site.bn.json as keys (both languages, same keys).
3. Data & credits (#/data) from catalog.json and input_manifest.json; AI use (#/ai) from docs/AI_USE.md's
   statement; About (#/about).

Checks:
- npm run test:e2e: W-08 and W-09 of docs/07_TESTS.md §8
- the string compile step passes (every key exists in both languages); config/i18n/ is unchanged
- X-03: every variable's record card and every page reads correctly in Bangla (no missing key, no English leak)
[CLOSING]
```

### Step 3E — The offline file

**Prompt 3E:**
```text
You are building the offline version of the CaseFile Earth site. Read AGENTS.md, docs/04_UI.md §2 and §4.12,
docs/01_ARCHITECTURE.md §8–§9, and examples/offline/set.json.

Build `npm run build:offline` (vite.offline.config.ts with vite-plugin-singlefile): one HTML file with the code,
styles, fonts and the files listed in offline/set.json inlined (src/data/offline.ts serves them to the same reader
calls). The offline page lists the cases kept on the device and opens each of them fully: line-up, verdicts,
contrasts, Methods. It makes no network request at all.

Checks:
- npm run build:offline → one .html file, at most 15 MB
- Playwright (W-10 of docs/07_TESTS.md §8 and I-04 of §7): open that file from file:// with the network blocked;
  every case plays; zero requests are attempted
[CLOSING]
```

---

## Part 4 — Pre-registration and the real results

Needs the bundle (Part 2) and the engine check (Part 1). This part is done by a person, with an agent only running commands.

### Step 4A — Fill and commit the pre-registration

Open `config/preregistration.yaml`. Every value is chosen **before** any real trend is seen. Recommended values (change any of them before committing; none was chosen by looking at a trend):

| Field | Recommended | Why |
|---|---|---|
| `main_window` (air_temp, rain) | `1980` to the last complete year in the bundle | The whole MERRA-2 record |
| Temperature threshold | `0.1` °C per decade | About half a degree over the record: the smallest shift we consider worth reporting to a general reader |
| Rain threshold | 2% of Bangladesh's mean yearly rain per decade, rounded to 5 mm (`check-bundle` prints the mean yearly total); `by_season: {}` | A change of about a tenth of the yearly total over the record |
| `rain_imerg` threshold | the same as rain | |
| `seasons.secondary` | `[MAM, JJAS, ON, DJF]` | Pre-monsoon, monsoon, post-monsoon, winter |
| Lead pair | Bangladesh and West Bengal: `pair_bgd_vs_wb` | The same delta on two sides of a border; both pass the support rule after the split (36.8 and 22.3 cells) |
| Second pair | Khulna and Rajshahi: `pair_khulna_vs_rajshahi` | The coastal south-west against the dry north-west (6.0 and 5.3 cells) |
| `regions.set` | Every region used by a pair (the build adds their effective cells from the bundle) | |
| `headline_cases` | The lead pair's rain and temperature contrasts | |

With two pairs and two variables there are 12 confirmatory tests (Holm) and 48 seasonal tests (Benjamini–Hochberg). Fewer pairs give each test more power. Valid pairs are listed in 02 §7.4; a division paired with Bangladesh is not valid.

Then:
```bash
cd python
uv run casefile-engine prereg-check --bundle ../.cache/bundle/b1     # prints the three hashes: paste them under hashes:
# fill signed_by, the two window years and the rain threshold; set status: committed; no "<fill" may remain
uv run casefile-engine prereg-check --bundle ../.cache/bundle/b1     # prints both families; everyone reads them
git add ../config/preregistration.yaml && git commit -m "Pre-registration committed" && git push
uv run casefile-engine prereg-check --bundle ../.cache/bundle/b1     # → "pre-registration OK: the results build may run"
```

From here on the file does not change. A later wish becomes a new test labelled exploration (03 §10), never an edit.

### Step 4B — The results build

```bash
cd python
uv run casefile-engine results --bundle ../.cache/bundle/b1 --out ../results/r1 --build-id r1
cd .. && uv run --project python python tools/validate_results.py results/r1        # → "results OK"
```

The build stops, without writing anything, if the bundle fails its check, the pre-registration is not committed or does not match the bundle, or a golden value does not match.

**Read the results once, as scientists** (this is the first time anyone sees a real trend):
1. `results/r1/contrasts/rain/<lead pair>/ANN.json` and the temperature one: the status, the sentence, the checks. Whatever they say is the headline: "supported" and "can't tell yet" are both good stories.
2. Every verdict with `status: no_verdict`: its `reason` must be one a user can understand (`missing_year`, `outside_domain`, …), not a symptom of bad input.
3. Plausibility against common knowledge, not against a wished-for result: temperatures rise in most regions; the IMERG sensitivity sign is shown beside MERRA-2 rain.

### Step 4C — Break review, then the final build

For each headline case, the engine lists the documented data changes inside its window (`robustness.breaks`, from `config/known_breaks.yaml`). A person looks at the series around each date and records the outcome in `config/break_review.yaml`:
```yaml
reviews:
  - case: { kind: contrast, pair: <pair id>, variable: rain, season: ANN }
    break: <break id>
    outcome: no_step_seen          # or step_seen, or unclear
    reviewer: "<name>"
    note: "<one line on what was looked at and seen>"
```
`no_step_seen` puts a note on the card. `step_seen` turns that result into "no verdict" with the reason `break_review`. `unclear`, or no entry at all, leaves the doubt `break_unreviewed`, which lowers the grade. Then build again with a new id and point the site at it:
```bash
uv run casefile-engine results --bundle ../.cache/bundle/b1 --out ../results/r2 --build-id r2 --set-current
git add ../results ../config/break_review.yaml && git commit -m "Results build r2" && git push
```

**Prompt 4 (for an agent that runs these steps for you):**
```text
You are running the CaseFile Earth results build. Read AGENTS.md and docs/05_BUILD_PLAN.md Part 4.
Run steps 4A's checks and 4B exactly as written, and show every command's output. You may not choose or change any
value in config/preregistration.yaml: the team fills it. If prereg-check or results reports a problem, show it
and stop. After the build, run tools/validate_results.py, then list for me: every headline case with its status,
grade and sentence in English; every verdict whose status is no_verdict with its reason; and the documented breaks
listed under robustness.breaks for the headline cases. Do not edit anything under python/src/casefile_engine/.
[CLOSING]
```

---

## Part 5 — The site on real results; deploy

Needs Parts 3 and 4.

**Prompt 5:**
```text
You are putting the CaseFile Earth site on its real results. Read AGENTS.md, docs/01_ARCHITECTURE.md §7 and §10,
and results/current.json.

1. Run the whole Playwright suite against results/<build id> (the env value that chooses the folder). If a test or a
   screen still depends on a synthetic id or name, make it read the id from the files instead.
2. The real build has no synthetic flag: the banner must be gone, and the provenance panel must show the build id,
   the products with their DOIs, the pre-registration's SHA-256 and commit.
3. Region outlines from regions/geom/<region>.json on the Place screen and on the map.
4. Fix whatever real data break in the layout: long Bangla names, many rows in a line-up, rare states.
5. `npm run build:offline` with the real offline set.
6. Check deploy.yml: the site at the Pages root, results under /results/, relative paths only. Push to main.
The site still computes nothing: if a screen needs a number the result files lack, stop and report it.

Checks:
- npm run test:e2e against results/<build id> → all pass, at 1280 and 360 px, EN and BN
- the deployed URL opens in a private window and on a phone; #/methods shows the pre-registration hash; the lead
  pair's Compare screen shows the sentence that is in the contrast file, word for word
- the offline file opens from file:// with the network off (W-10)
[CLOSING]
```

---

## Part 6 — Polish and final checks

**Prompt 6A (polish loop, 04 §12):**
```text
You are polishing the CaseFile Earth site. Read AGENTS.md, docs/04_UI.md §1, §8, §11 and §12, and
docs/05_BUILD_PLAN.md Part 3 (design direction).

1. Save Playwright screenshots of every screen at 360, 768 and 1280 px, light and dark, English and Bangla.
2. Look at every screenshot against the 04 §12 checklist and the design direction: one clear headline per screen;
   status badge before numbers; a 4 px spacing grid; no text under 14 px except axis labels; contrast at least
   4.5:1; nothing cut off in Bangla; charts readable at 360 px; the spine visible and quiet; hatching
   distinguishable without colour. List every problem with its screenshot.
3. Fix them in small commits. Layout and style only: never a number, a verdict word or an i18n string.
4. Measure the budgets of docs/01_ARCHITECTURE.md §8 on the built site and fix what exceeds them.
5. Keep the final screenshots as visual-regression baselines.

Checks:
- X-01…X-07 of docs/07_TESTS.md §9 pass; no screen logs a console error
- the budget numbers, measured, in a short table
- before and after screenshots of the three screens that changed most
[CLOSING]
```

**Final checklist (a person ticks it):**

| # | Check | How |
|---|---|---|
| 1 | The engine is untouched and right | `uv run casefile-engine selfcheck` → 60/60; `git diff --stat <first commit> -- python/src/casefile_engine` is empty |
| 2 | The results are the pre-registered ones | `#/methods` shows the SHA-256 that `prereg-check` prints; `results/<id>/build.json` has `goldenTests.passed = total` |
| 3 | Every file is valid | `python tools/validate_results.py results/<id>` → "results OK" |
| 4 | Words are careful | Search the built site for "caused by", "proves", "no change": none outside the "not the same as no change" line |
| 5 | Both languages | Click through every screen in Bangla with a native reader |
| 6 | Phone and offline | The deployed site on a phone; the offline file from `file://` with the network off |
| 7 | AI use is declared | `docs/AI_USE.md` is filled; the `#/ai` page shows it |

**If time remains,** the COULD list of `docs/00_BRIEF.md` §6 holds the next features. Each one is a new step with its own checks; none touches the pre-registered results.

---

## 8. The closing block (`[CLOSING]`)

Paste this after every step's prompt:

```text
Rules for this session:
- Follow AGENTS.md. docs/01_ARCHITECTURE.md is the authority on modules, files and commands.
- Start with a plan of at most 15 lines (files you will create, tests you will write), then build without waiting,
  unless something is ambiguous or contradicts the documents: then stop and ask.
- Work on this part's branch and change only the files this part owns (docs/05_BUILD_PLAN.md, "How the parts stay
  independent"). Never edit python/src/casefile_engine/, schemas/, examples/ or config/ (except where this prompt
  says so). Hard-code no variable, region or pair id.
- Never invent a dataset name, variable name, URL, API parameter or number. If the documents do not say, stop and ask.
- Write tests with the code. Never weaken or delete a test to get green.
- Before you say "done": run every check of this step, paste the real output, re-read your diff against this
  prompt's rules, and list anything unfinished or uncertain. "Done" without output is not done.
- After two failed attempts at the same error, stop and report the exact error, what you tried, and two options.
- End each commit message with: AI-assisted: <tool> (<model>). Add one row to this part's log, docs/ai_log/part-<n>.md
  (date, step, tool and model, what was built, what a person checked).
```

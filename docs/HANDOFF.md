# Hand-over: how to help on CaseFile Earth (read this first)

This file is for people and AI assistants joining the work. Paste the "Instructions to paste" block of your task
into your AI tool, together with this file and `AGENTS.md`.

## 1. What the project is

CaseFile Earth (NASA Space Apps 2026, "Be an Earth System Trend Detective!") lets anyone pick a place, mainly
Bangladesh and its neighbours, and see whether temperature or rain has changed, with an honest graded answer or
"can't tell yet", in English and Bangla. Three parts:

| Part | Folder | What it does |
|---|---|---|
| Engine (frozen) | `python/src/casefile_engine/` | Computes every statistic and every sentence. **Never edit it.** |
| Pipeline | `python/src/casefile_pipeline/` | Downloads NASA data (earthaccess + CMR), converts units, averages over regions, writes the input bundle |
| Site | `web/` (branch `part-3-site`) | Static React site that only displays the result files; works offline |

The authority documents: `AGENTS.md` (hard rules), `docs/01_ARCHITECTURE.md`, `docs/02_DATA.md`,
`docs/05_BUILD_PLAN.md`, `docs/03_SCIENCE.md`.

## 2. What is done (13 Nov 2026)

- **Pipeline** (`part-2-pipeline`, also in `part-4-results`): `casefile-pipeline access-check | fetch | regions |
  bundle`, 35 tests. Real data fetched: MERRA-2 T2M and PRECTOTCORR 1980-01..2025-12 (552 months each), GPM IMERG
  V07 Final 1998-01..2025-09 (333 months). Region masks reproduce the support-rule evidence exactly.
- **Checks on real data:** check-bundle "bundle OK"; D-01 global mean T2M 1991-2020 = 14.44 °C; D-02/D-05 monsoon
  months wettest in both rain records; D-06 our MERRA-2 values equal NASA POWER's at a Bangladesh cell (mean
  difference 0.021 °C, 0.06 mm/day).
- **Pre-registration** committed (`config/preregistration.yaml`, signed by asifff113, hirok121, Shakilkhan24):
  graded parameters are **temperature and rain only** (12 main tests, 48 seasonal tests); IMERG is the rain
  sensitivity check.
- **First real results** `results/r1/` (`part-4-results`): 60 verdicts, 30 contrasts, 4 line-ups, 3 cases;
  `tools/validate_results.py results/r1` → "results OK". Global temperature map: +0.165 °C per decade, 86% of
  squares warming.
- **Site** (`part-3-site`): every screen, the 3D globe, Bangla, offline file; built on the synthetic `examples/`.

**Open items for people:**
1. Break review (build plan step 4C): MERRA-2 rain over Bangladesh rises about 444 mm per decade with a jump
   around 1998, while IMERG points the other way. This is very likely MERRA-2's precipitation-correction change
   (`merra2_precip_correction_inputs` in `config/known_breaks.yaml`, date still empty), not the climate. A person
   looks at the series around the date and records the outcome in `config/break_review.yaml`, then rebuild as r2.
2. MERRA-2 temperature over Bangladesh cools slightly (−0.17 °C per decade). Plausible for a reanalysis next to the
   rain change above; it needs a person's reading before it is shown as a headline.
3. Adding a new product changes the bundle's input manifest, whose hash the pre-registration pins. When new
   parameters are merged, the person integrating them updates `hashes.input_manifest_sha256` (and
   `regions_support_sha256` if a new grid is added) and records it under `amendments` as "exploration inputs
   added; the MERRA-2 and IMERG files are unchanged" (their per-file SHA-256 in the manifest proves it).

## 3. Set-up for any helper

```bash
git clone https://github.com/asifff113/Nasapretest.git && cd Nasapretest
git switch part-4-results            # newest pipeline + real results + committed pre-registration
git switch -c part-2d-<your-product> # your own branch
cd python && uv sync --extra pipeline
uv run casefile-engine selfcheck     # 60/60
uv run pytest tests/pipeline         # 37 passed
```
NASA login: a free Earthdata account (urs.earthdata.nasa.gov) with the data centre's app approved in the profile
(Applications → Authorized Apps; GES DISC for GLDAS/OMI/AIRS, LP DAAC for MODIS greenness, LAADS for MODIS
aerosol). Put it in `~/.netrc` (Windows: `C:\Users\<you>\.netrc`), one line:
`machine urs.earthdata.nasa.gov login USER password PASS`. Never paste it into a chat or a file in the repo.
On Windows set `PYTHONIOENCODING=utf-8` before engine commands.

## 4. Rules every helper and every AI must follow

1. Read `AGENTS.md` first. Never edit `python/src/casefile_engine/`, `schemas/`, `examples/`.
2. **Never invent** a product name, version, variable name, unit, fill value, DOI or URL. Copy them from the
   product's official page or from CMR, or stop and ask.
3. Find files only through `earthaccess.search_data(short_name=…, version=…)`; never build file names or use
   `*.gesdisc.eosdis.nasa.gov` addresses.
4. **No AI as author or co-author** of any commit or pull request: no `Co-Authored-By:` line, no AI trailer.
5. Change only your reader, its tests, and your own product's entries in config/sources.yaml and config/variables.yaml.
6. Write tests with the code; never weaken a test to get green.
7. Do not push to `main`/`master`; push your own branch and say what you checked.

## 5. Parameter tasks (one per helper)

Each parameter becomes an **exploration layer** (globe map and cell values), not a graded verdict: the
pre-registration grades temperature and rain only. Products as found in NASA's catalogue (CMR) on 13 Nov 2026:

| Task | Parameter (variable id in `config/variables.yaml`) | Product, version, CMR concept id | Starts | Notes |
|---|---|---|---|---|
| A | water vapour (`water_vapor`, TQV), air pressure (`pressure`, SLP) | MERRA-2 M2TMNXSLV 5.12.4, C1276812859-GES_DISC (already used) | 1980-01 | Same files as T2M: extend the reader's variables; SLP Pa → hPa |
| B | evaporation (`evapotranspiration`), runoff (`runoff`) | GLDAS_NOAH10_M 2.1, C1288937542-GES_DISC, DOI 10.5067/LWTYSMP3VM5Z | 2000-01 | New 1° grid (land only); check units of Evap_tavg, Qs_acc, Qsb_acc in one file first |
| C | plant greenness (NDVI) | MOD13C2 061, C2565788914-LPCLOUD, DOI 10.5067/MODIS/MOD13C2.061 | 2000-02 | 0.05° global: regrid; config lists Earth Engine, switch to earthaccess is a team decision |
| D | haze (aerosol) | MYD08_M3 6.1, C1443775657-LAADS, DOI 10.5067/MODIS/MYD08_M3.061 | 2002-07 | The aerosol variable name must be confirmed in a file |
| E | ozone | OMTO3e 003, C1266136071-GES_DISC, DOI 10.5067/Aura/OMI/DATA3002 | 2004-10 | Daily files: average to months in the reader |
| F | temperature aloft | AIRS3STM 7.0, C1701805662-GES_DISC, DOI 10.5067/UBENJB9D3T2H | 2002-09 | A person must choose the pressure level first |

Descriptive only (no verdicts, per their record cards): soil moisture (GLDAS), water storage (GRACE,
TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4). NO₂ is skewed: map only. GSMaP is JAXA's (needs a JAXA or Google
Earth Engine account): later.

### Instructions to paste (fill in the task letter)

```text
You are adding one dataset to the CaseFile Earth data pipeline. Repository: github.com/asifff113/Nasapretest,
branch part-4-results; create your own branch part-2d-<product>. Read AGENTS.md, docs/HANDOFF.md,
docs/02_DATA.md §14, docs/01_ARCHITECTURE.md §5–§6.1, config/variables.yaml, config/sources.yaml and the existing
readers in python/src/casefile_pipeline/sources/ (merra2.py, imerg.py, __init__.py: the Reader class) before
writing code.

Your task: task <letter> of docs/HANDOFF.md §5 (<parameter>, product <short name> <version>).

1. Access check on ONE granule first: `uv run casefile-pipeline access-check --products <short name>` after
   registering a reader. Print dims and their order, units, fill value, coordinate ranges, time step. If anything
   differs from the product's documentation, stop and report; never guess a unit or a name.
2. Write one reader in python/src/casefile_pipeline/sources/<product>.py: register a Reader with the grid, group,
   dims, coordinate names and the units the file states. Add any unit conversion to
   python/src/casefile_pipeline/units.py (CONVERT table) only from the documentation. Daily data: average to months.
3. If the grid is new, add it to GRIDS in python/src/casefile_pipeline/grids.py (id, lat0, dlat, nlat, lon0, dlon,
   nlon, latitude increasing with the row). `casefile-pipeline regions` then writes masks and support for it
   automatically; it never changes which regions are in the set (MERRA-2 and IMERG decide that), and a region
   that fails on your grid simply gets no series for your variable.
4. Tests in python/tests/pipeline/test_<product>.py on a tiny NetCDF/HDF file the test writes itself (no network):
   units, fill → NaN, axis order, month bookkeeping.
5. Fetch a small window (`casefile-pipeline fetch --products <short name> --first 2020-01 --last 2021-12`), run
   `casefile-pipeline bundle --bundle-id test-<product>` and `casefile-engine check-bundle`. Print climatologies,
   units and ranges only: no trends, no yearly series.
6. In config/sources.yaml and config/variables.yaml edit ONLY your product's existing entries (copied from official
   pages, DOI from CMR): fill the VERIFY fields and set the variable's status to analysed so the pipeline fetches
   it. It still gets no verdict (the pre-registration grades temperature and rain only); it becomes a globe layer.
   Never touch config/preregistration.yaml or other products' entries.
7. Rules: never edit python/src/casefile_engine/, schemas/, examples/; never invent names, units, DOIs or URLs;
   no Co-Authored-By or any AI attribution in commits; run `uv run ruff check src/casefile_pipeline` and
   `uv run pytest tests/pipeline` before you hand in.
Hand in: your branch name, the access-check output, the test output, the check-bundle output, and the config lines.
```

### Site task (year slider, place pages, new charts)

Branch `part-3-site`. The site reads only result files; it computes nothing (AGENTS.md rule 4). Real results are in
`results/r1/` on `part-4-results`: run the site on them with `RESULTS_DIR=../results npm run dev` in `web/`.
A yearly map frame per year (`maps/<variable>/<season>/years.bin.gz`) is not written by the engine yet: see
`docs/proposals/site-data-requests.md` on `part-3-site`; the yearly values of every square already exist in the
input bundle's `map/<variable>__ANN.npz`. A small writer for those frames (outside the frozen engine) is a team decision.

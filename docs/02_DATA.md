# 02 — Data

Owner: B. Only fact-checked items are stated as facts. Everything marked **VERIFY (V-xx)** is checked in the access checks (§10, Part 2) before code relies on it. The fact-check claim numbers (#nn) are those of playbook v3.

The machine-readable truth is `config/sources.yaml` (products) and `config/variables.yaml` (variables and record cards). This file explains them.

---

## 1. What the first release uses

The first release analyses temperature and rain only (v3 6.1, red team). Every other variable keeps its question and record cards, marked "not analysed in this release".

| Variable id | Plain name | Product | Kind | Years used | Role |
|---|---|---|---|---|---|
| `air_temp` | Air temperature near the ground | MERRA-2 `M2TMNXSLV` 5.12.4, `T2M` | model | main window from the pre-registration (MERRA-2 starts 1980-01) | analysed |
| `rain` | Rain and snowfall | MERRA-2, `PRECTOTCORR`, in the collection named by V-03 | model, corrected with gauge and satellite estimates | as above | analysed |
| `rain_imerg` | Rain and snowfall (satellites and gauges) | GPM IMERG V07 Final monthly `GPM_3IMERGM`, `precipitation` | satellite | 1998–2024 | sensitivity check, never graded (03 §8.6) |
| `global_temp_gistemp` | Global surface temperature | NASA GISTEMP v4, global mean only | observations | as in the CSV | known-answer test (D-07) and a labelled reference line; never graded |

**Deferred** (cards only; each returns one product at a time, with its own domain check, after every MUST and SHOULD step): water vapour and pressure (MERRA-2), soil moisture, evaporation and runoff (GLDAS Noah 2.1), temperature by atmospheric level (AIRS), haze and greenness (MODIS 6.1), water stored on and under land (GRACE and GRACE-FO, descriptive only), NO₂ and ozone (OMI), and JAXA GSMaP rain. Storage variables such as groundwater and soil moisture stay descriptive even when they return.

---

## 2. Routes and access

| Route | Status | Use |
|---|---|---|
| earthaccess and CMR | The backbone | Find and download MERRA-2 and IMERG files |
| Earthdata Cloud HTTPS and Cloud OPeNDAP | Cloud routes and Earthdata Login app approvals are unconfirmed (#25, #26): V-01, V-02 | Whole files, or variable subsets |
| GES DISC on-premises servers (`*.gesdisc.eosdis.nasa.gov`) | "Discontinued no earlier than September 30, 2026" (#25) | Never. Do not build these URLs |
| NASA POWER API | No login | The one-cell cross-check (§8) and a fallback route |
| GISTEMP CSV | Public | The known-answer test |
| Google Earth Engine | Community tier: 150 EECU-hours a month, 40 concurrent requests, 100 MiB per result, 10 MB per request, about 2 batch tasks (#31) | Not needed until MODIS or GSMaP return. The app never calls it |
| Giovanni | Status unconfirmed (#28) | Not used |

**Where the pipeline runs:** a GitHub Codespace, with long downloads in a background shell.

**Authentication:** Earthdata Login. `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD` are Codespaces secrets; the pipeline calls `earthaccess.login(strategy="environment")`. In the Earthdata profile the application **NASA GESDISC DATA ARCHIVE** must be approved. Credentials never enter the repository, logs or results.

**Finding files:** always through CMR via earthaccess, never by building file names by hand. MERRA-2 file names carry a stream prefix that changes over the record (`MERRA2_100…` in 1980, `MERRA2_400…` in 2024; seen in CMR on 11 Nov 2026), so a hand-built name list leaves a silent gap.

```python
earthaccess.search_data(short_name="M2TMNXSLV", version="5.12.4", temporal=("1980-01-01", "<last complete month>"))
```

**What CMR lists for each granule** (checked 11 Nov 2026): a download URL on `data.gesdisc.earthdata.nasa.gov`, an S3 address for use inside the same cloud region, and an OPeNDAP URL of the form `https://opendap.earthdata.nasa.gov/collections/<concept id>/granules/<granule name>` (related URL with subtype `OPENDAP DATA`). Concept ids: `C1276812859-GES_DISC` (M2TMNXSLV), `C1276812868-GES_DISC` (M2TMNXFLX), `C2723754851-GES_DISC` (GPM_3IMERGM 07). One monthly file is 51.9 MB, 73.6 MB and 17.3 MB, so whole files for the full records come to about 75 GB.

**Fetch one variable per file, in this order of routes** (the access check tries them on one granule per product and records which works):
1. **OPeNDAP subset.** `GET <OPeNDAP URL>.dap.nc4?dap4.ce=<constraint>` with the session from `earthaccess.get_requests_https_session()`. The constraint names the variable and its coordinates, separated by `;` and URL-encoded: `/T2M;/time;/lat;/lon`, or for IMERG `/Grid/precipitation;/Grid/time;/Grid/lat;/Grid/lon`. The answer is a small NetCDF-4 file (about 1 MB for a global MERRA-2 month).
2. **Remote read.** `earthaccess.open([granule])` gives a file-like object; `xarray.open_dataset(f, engine="h5netcdf")[variable].load()` reads only that variable's chunks.
3. **Whole file.** `earthaccess.download(granule, folder)`, read the variable, delete the file.

IMERG files are HDF5 with a `Grid` group. If no route works for a product, stop: §8 describes the POWER fallback, which a person must decide on.

---

## 3. Per-source recipes

Every `fetch_monthly()` returns `xarray.DataArray(time, lat, lon)` in display units, on the native grid, with NaN for missing values and time set to the first day of each month. It records product, version, DOI, granule count and route for the provenance and the input manifest (§9).

### 3.1 MERRA-2 monthly (`air_temp`, `rain`)

| Item | Value |
|---|---|
| Collections | `M2TMNXSLV` 5.12.4 (single-level diagnostics; DOI 10.5067/AP1B0BA5PD2K, #14) for `T2M`. `M2TMNXFLX` 5.12.4 (`tavgM_2d_flx_Nx`, surface flux diagnostics; DOI 10.5067/0JRLVL8YV2Y4 per its data.nasa.gov entry, read 3 Nov 2026) for `PRECTOTCORR`, which the MERRA-2 flux collection lists as bias-corrected total precipitation in kg m⁻² s⁻¹ (Earth Engine catalog for the hourly flux collection). V-03 confirms the variable in one monthly granule |
| Grid | 0.625° longitude × 0.5° latitude, 576 × 361 points (GMAO system-characteristics page). Latitude centres −90…90 (polar rows are half cells); longitude centres −180…179.375 |
| Time | Monthly from 1980-01 (VERIFY V-03 for the start month and the latest complete month) |
| `T2M` | K → °C (− 273.15). Rule `mean` |
| `PRECTOTCORR` | Bias-corrected precipitation in kg m⁻² s⁻¹ (#14) × 86 400 → mm/day (1 kg m⁻² = 1 mm; never × 86 400 000). Rule `sum` |
| Fill | VERIFY V-03 (v2 notes: `_FillValue` 1e15; mask values above 1e14) |
| Format and size | netCDF-4 per month (VERIFY V-02). Read only the needed variable: with `earthaccess.open()` and xarray, or Cloud OPeNDAP, a global single-variable month is about 0.8 MB uncompressed (576 × 361 × 4 bytes), so 46 years of one variable is under 0.5 GB |
| Known issues | Model output. Observing-system changes shift reanalysis fields; the precipitation correction uses gauge and satellite inputs that changed over time. `config/known_breaks.yaml` lists the dated changes |

### 3.2 GPM IMERG V07 Final monthly (`rain_imerg`)

| Item | Value |
|---|---|
| Product | `GPM_3IMERGM` V07 Final, DOI 10.5067/GPM/IMERG/3B-MONTH/07 (#11c) |
| Record | Starts Jan 1998 (#11b). The Final record ends Sep 2025, and V08 Final is expected in fall 2026 (#11a; GPM data page). **Pin V07. Never append Late Run or V08. Annual trends end in 2024**, and the sensitivity check uses 1998–2024 for every season |
| Grid | 0.1°, 3600 × 1800; longitude centres −179.95…179.95, latitude −89.95…89.95. Arrays arrive as (time, lon, lat): transpose (P-07) |
| Variable | `precipitation`, mm/hr (#11c; an HDF Group sample of an IMERG monthly file shows mm/hr) × 24 → mm/day. Rule `sum`. V-04 confirms it in a V07 granule |
| Fill | −9999.9 in the same sample file; V-04 confirms it in a V07 granule |
| Subset | The region-set box in `config/sources.yaml` (`subset_bbox`). Extend it if a comparison region lies outside |
| Known issues | A rate, not a total. The TRMM era before mid-2014 and the GPM era after it (`known_breaks.yaml`, `imerg_trmm_to_gpm_2014`). It shares gauge and satellite inputs with MERRA-2's corrected precipitation, so it is a sensitivity check, never an independent confirmation (v3 D12) |

### 3.3 NASA GISTEMP v4 (`global_temp_gistemp`)

One CSV, `https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv`. v2 notes: line 1 is a title, line 2 the header `Year,Jan,…,Dec,J-D,D-N,DJF,MAM,JJA,SON`, missing values are `***`, and anomalies are in °C relative to 1951–1980 (VERIFY V-08, #22). Use the monthly columns and ignore the precomputed seasonal ones. Only the global series is used, for the known-answer test D-07 after the pre-registration and as a labelled reference line. Cite GISTEMP Team (year of access) and Lenssen et al. (2024), doi:10.1029/2023JD040179 (#22).

### 3.4 Deferred products

`config/sources.yaml` keeps their entries with `status: deferred`, so their record cards can name them. Nothing in the pipeline fetches them in this release. When one returns, it gets its own access check, its own known breaks and its own domain check before any verdict.

---

## 4. Grids and regridding

| Grid id | Use | Definition |
|---|---|---|
| `merra2_native` | Region series for `air_temp` and `rain` | lat0 −90, dlat 0.5, 361 rows; lon0 −180, dlon 0.625, 576 columns |
| `imerg_native` | Region series for `rain_imerg` | lat0 −89.95, dlat 0.1, 1800 rows; lon0 −179.95, dlon 0.1, 3600 columns |
| `global_1deg` | Screening map and cell pages | row 0 centred at 89.5° N, column 0 at 179.5° W; 180 × 360; edges at whole degrees |

Region series are built on each product's **native** grid with fractional cell weights (§7), so verdicts avoid a second smoothing step (ADR-04). The 1° grid serves only the map and the cell pages.

**Cell area** (km²) = R² × Δλ × (sin φ_north − sin φ_south), R = 6371.0088 km, Δλ in radians. Over the whole 1° grid the total is 4πR² = 510 065 881 km² (P-01).

**Conservative regridding to 1° (separable).** For rectilinear source grids:
1. Build source edges as midpoints between centres; clip latitude edges to ±90°.
2. `A_lat[i, j]` = overlap of destination row i and source row j measured in sin(latitude); `A_lon[k, l]` = overlap of destination column k and source column l in degrees, wrapping at ±180°.
3. With `M` the validity mask (1 = valid) and `X` the data with NaN set to 0, for each month: `num = A_lat @ (X * M) @ A_lon.T`, `den = A_lat @ M @ A_lon.T`, `full = A_lat @ 1 @ A_lon.T`. Result = `num / den` where `den / full ≥ 0.5`, else NaN.
4. IMERG nests 10 × 10 into 1° and gives exact block means; MERRA-2 does not nest and uses the same matrices. P-08 checks that the area-weighted global mean is preserved to 1e-4 relative.

---

## 5. From months to years

The pipeline hands over **monthly** region means and monthly cell values (01 §5). The engine turns them into one value per year for `ANN` and for each pre-registered season, with the rules of `03_SCIENCE.md` §2: day weights, completeness, the anomaly method for 10–11 months, `mean` or `sum`, and seasons dated by the year in which they end. **Average over space first, then aggregate in time.** Golden cases `examples/golden/aggregate_cases.json` (G-02) fix the expected values, including the warm-month case and the IMERG unit case.

The one place where the pipeline aggregates in time is the 1° map field, and there it calls the engine's own function (`casefile_engine.bundle.annual_field`).

Rain values are totals in mm for each season or year. Temperatures are means in °C.

---

## 6. Cell tiles and map inputs

The pipeline writes one annual value per year for every 1° cell into the bundle (`map/<variable>__ANN.npz`, 01 §5), for `air_temp` and `rain`. From it the engine writes two things:

- **The map** (`maps/<variable>/ANN/meta.json` and `cells.bin.gz`, `schemas/map_meta.schema.json`): per cell the rate and its range (int16; scale 0.001 per decade for temperature, 0.1 for rain), p and q (float32) and flags (uint8: testable 1, significant 2, short or missing 4, φ out of range 8, leftover memory 16, not finite 32). The file is field-major: each field is one `[180][360]` block, in the order `meta.json` lists.
- **The cell tiles** (`cells/<variable>/meta.json` and `t/<tr>_<tc>.bin.gz`, `schemas/cell_tiles.schema.json`): gzip of an int16 block `[row][col][season][year]` for the 10 × 10 cells of tile (tr, tc); global row `R = tr × 10 + r`, column `C = tc × 10 + c`; `value = raw × scale + offset` unless `raw == fill` (−32768); scale 0.01 for temperature and 1 for rain. Only `ANN` is written.

The site reads one map per variable and one tile per picked cell.

---

## 7. Regions

### 7.1 The fixed region set (`config/regions.yaml`)

| Kind | Ids | Boundary source |
|---|---|---|
| Home | `country:BGD` | Natural Earth 1:50m Admin 0, field `ADM0_A3` |
| Divisions | `bd_div:<name>` for the eight divisions, each only if it passes the support rule (§7.3) | geoBoundaries gbOpen BGD ADM1 (boundary year 2015, 8 units), licence **CC0 1.0 Universal** per its metadata file (V-06). Match on `shapeISO` (BD-A … BD-H), not on `shapeName`: the file spells Rajshahi "Rajshani" and uses the older "Chittagong" and "Barisal" |
| Comparison candidates | `cmp:west_bengal`, `cmp:assam`, `cmp:meghalaya` (Natural Earth 1:10m Admin 1), `cmp:myanmar`, `cmp:nepal` (Admin 0), `cmp:bay_of_bengal` (the box 80–95° E, 5–22° N minus Natural Earth land, so it is sea only) | as listed |
| Cells | `cell:<row>_<col>` on `global_1deg` | the grid itself (exploration only) |

The pre-registration picks the comparison regions and the pairs from these candidates. There are no districts, no drawn boxes and no free-form places (v3 D9, CUT).

**Non-NASA data** must be freely available or OSI-licensed, with the licence documented (#33). Record each boundary file's licence statement as shipped with the downloaded file (V-06).

### 7.2 Region weights and contributing cells

For each region and each native grid, `region_weights()` computes the fraction f of every cell inside the region from 5 × 5 sample points per cell (even–odd rule, holes respected; polygons crossing ±180° are split; a fixed box uses its exact overlap). The weight is `w = cell area × f`. The result is written as `regions/cells/<grid>/<region>.json` (`schemas/mask.schema.json`): `[[row, col, fraction], …]`, the area and the effective number of cells. The site draws these cells on every place (M2), so the user sees what the numbers average over.

**Monthly region mean.** `Σ w x / Σ w` over the mask's cells with a finite value in that month. If cells holding more than 10% of `Σ w` are missing, the month is NaN. The engine never fills a gap.

### 7.3 Support rule (S1, S2)

A region enters the set only if it passes both checks **on every first-release grid** (in practice MERRA-2, the coarsest):

- **S1, size:** effective native cells Σf ≥ 4 (`support.min_native_cells`): at least the area of a 2 × 2 block of MERRA-2 cells, about 14 000 km² at 23.5° N.
- **S2, spill:** spill share Σ a f (1 − f) / Σ a f ≤ 1/3 (`support.max_spill_share`), where a is the cell area. This is the part of the region mean that describes area outside the region: a cell 30% inside contributes data that are 70% about somewhere else. At most a third of what the number describes may lie outside the place.

Both are computed from boundaries alone, before any data are read, so they cannot be tuned to results. The pre-registration may tighten them, never loosen them. A region that fails is listed with its reason ("too small for the data grid" or "mostly outside its own boundary on the data grid") and is not analysed.

**What the rule gives for the candidates** (computed on 3 Nov 2026 from the boundary files above with the spec's 5 × 5 rule; `tools/decide/support_split.py`; Part 2 recomputes it in the pipeline):

| Region | Area (km²) | MERRA-2 effective cells | MERRA-2 spill share | IMERG effective cells | In the set? |
|---|---|---|---|---|---|
| Bangladesh | 135 650 | 38.0 | 0.20 | 1 199 | yes |
| Chittagong division (BD-B) | 30 580 | 8.5 | 0.45 | 268 | **no**: spill (coastal and island cells are mostly sea) |
| Khulna (BD-D) | 21 540 | 6.1 | 0.30 | 189 | yes |
| Dhaka (BD-C) | 20 970 | 6.0 | 0.31 | 186 | yes |
| Rajshahi (BD-E) | 18 560 | 5.4 | 0.25 | 165 | yes |
| Rangpur (BD-F) | 16 600 | 4.8 | 0.32 | 149 | yes |
| Sylhet (BD-G) | 12 250 | 3.6 | 0.33 | 109 | **no**: size |
| Mymensingh (BD-H) | 10 460 | 2.8 | 0.29 | 93 | **no**: size |
| Barisal (BD-A) | 9 580 | 2.6 | 0.48 | 84 | **no**: size and spill |
| West Bengal | 86 560 | 24.2 | 0.22 | 766 | yes |
| Assam | 79 680 | 23.0 | 0.21 | 720 | yes |
| Meghalaya | 23 170 | 6.7 | 0.30 | 208 | yes |
| Nepal | 147 200 | 43.2 | 0.14 | 1 352 | yes |
| Myanmar | 662 760 | 184.2 | 0.10 | 5 761 | yes |
| Bay of Bengal (sea only) | 2 540 600 | 670 | 0.04 | 21 112 | yes |

On IMERG's 0.1° grid every candidate passes easily (spill ≤ 0.13). MERRA-2 decides.

### 7.4 Pairs: disjoint cells (S3)

On a 0.5° × 0.625° grid, neighbouring regions share border cells: 35% of West Bengal's MERRA-2 weight and 21% of Bangladesh's come from the 20 cells the two share, and adjacent divisions share 10–65% of their weight. A trend in the difference built from overlapping means is partly a difference of the same data. So a contrast uses **disjoint cells**:

- a cell that both regions touch goes to the region holding the larger fraction of it; a tie drops it from both;
- after the split, each region must still have Σf ≥ 4 on every grid (S3). A pair that fails cannot be pre-registered;
- each region's own verdict keeps its full weights; only the difference series d(t) uses the split (03 §2.5). Each contrast file records the split it used (`split` in `schemas/contrast.schema.json`).

Nested pairs fail S3 by construction (a division keeps almost no cells against the whole country), which is intended: a difference between a place and a region that contains it is not a comparison of two places. For the candidates, after the split on MERRA-2: Bangladesh–West Bengal keeps 36.8 and 22.3 effective cells; Bangladesh–Assam 37.7 and 22.9; Bangladesh–Meghalaya 37.5 and 6.1; Bangladesh–Myanmar 37.4 and 183.9; Bangladesh–Nepal 37.9 and 43.2; Bangladesh–Bay of Bengal 37.3 and 669; Dhaka–Khulna 5.6 and 6.0; Dhaka–Rajshahi 5.9 and 5.0; Khulna–Rajshahi 6.0 and 5.3; Rajshahi–Rangpur 5.4 and 4.5. All of these pass; every division-versus-Bangladesh pair fails. `tools/decide/support_split_out.json` has every pair.

---

## 8. NASA POWER: one-cell cross-check and fallback route

**What POWER is** (#29): its weather parameters come from MERRA-2 since 1 Jan 1981, with a GEOS-IT tail that has about two days' latency and is later overwritten. It also serves `IMERG_PRECTOT` from 1 Jun 1998. Trends should end about 2 months (weather) and about 3.5 months (IMERG) before real time. Its daily T2M against GSOD stations: bias −0.53 °C, RMSE 2.10 °C, R² 0.97.

**The cross-check (D-06, Part 2).** Take one MERRA-2 native cell inside Bangladesh. Compare our pipeline's monthly T2M for that cell with POWER's monthly `T2M` at the cell centre over the same months. Because POWER's weather is MERRA-2, the two should agree closely (tolerance in D-06, VERIFY V-07); a disagreement points at our units, grid indexing or time stamps, not at the Earth. The check compares monthly values only. It computes no trend, so it may run before the pre-registration.

**Parsing (v2 notes; VERIFY V-07):** the monthly point response holds `properties.parameter.<NAME>` mapping `"YYYYMM"` to a value. Keys ending in `13` are annual values: drop them. Fill −999 → NaN. Units are in `parameters.<NAME>.units`. Fixture: `examples/power/monthly_point_SYNTHETIC.json` (P-13).

**Fallback route.** If the Earthdata route fails, POWER can supply MERRA-2-based `T2M` and `PRECTOTCORR`. Whether region means can be built from POWER requests is checked in V-07 before anyone relies on it; until then the fallback covers single cells only.

**Never a witness.** POWER's weather is MERRA-2, so it never confirms MERRA-2, and POWER's IMERG never confirms IMERG (ADR-13). The site never calls POWER.

---

## 9. Input manifest

`casefile-pipeline bundle` writes `input_manifest.json` (`schemas/input_manifest.schema.json`): for each product, the CMR query (the route used, temporal range, box), variables, units, fill, first and last month, granule count, and every file with its name, month, size and SHA-256. When only a subset was fetched, the SHA-256 is that of the saved response, and `valuesSha256` is the SHA-256 of the decoded array, which stays the same if the server later writes different header bytes.

- The manifest's own SHA-256 goes into the pre-registration (`hashes.input_manifest_sha256`), together with the SHA-256 of `regions/index.json`. The results build compares both and stops on any mismatch, so the data are frozen with the plan.
- Keep `.cache/` (the downloads and the bundle): rebuilding the results needs the bundle, not the network.

---

## 10. Access checks (Part 2)

`casefile-pipeline access-check` records the result of each row in `docs/10_FINDINGS.md` §6, with the date checked and who checked it. A row that fails blocks the steps that depend on it.

| V-id | Check | Expected | Blocks | Who |
|---|---|---|---|---|
| V-01 | Earthdata Login for all three members; the GES DISC application approval on each profile (#26) | Login succeeds; downloads allowed | Part 2 | all |
| V-02 | earthaccess search for `M2TMNXSLV` 5.12.4 returns monthly granules; one granule downloads through the cloud route; a Cloud OPeNDAP subset of `T2M` works (or note the fallback to whole files). Record the URL form; it must not be `*.gesdisc.eosdis.nasa.gov` (#25) | Files and URL form noted | Part 2 | B |
| V-03 | MERRA-2: which collection holds `PRECTOTCORR`, its short name, version and DOI; the start month and latest complete month; units of `T2M` and `PRECTOTCORR`; the fill value; whether file names carry changing stream prefixes (#14) | `config/sources.yaml` filled, `doi_verified` set | Part 2 | B |
| V-04 | IMERG V07 Final monthly: variable name, units (mm/hr), fill value, array order, first month (1998-01) and last month (2025-09); that no Late Run or V08 granule is returned by the query (#11) | Noted in `sources.yaml` | Part 2 | B |
| V-05 | IMERG Earth Engine id (#13). Needed only if Earth Engine is ever used for a deferred product | Noted, or marked not needed | — | B |
| V-06 | Boundary files: Natural Earth terms; the geoBoundaries BGD ADM1 licence for the chosen file (#33b); the spelling of division names and the Admin 1 field names. **Done while writing this pack:** gbOpen BGD ADM1 is CC0 1.0 (its metadata file); names include "Rajshani", so match on `shapeISO` | Licences recorded in `regions.yaml` | Part 2 | B |
| V-07 | NASA POWER: the monthly point endpoint and parameters (`T2M`, `PRECTOTCORR`), parameter start years, fill −999, the annual-value key, the licence, and whether region means are possible (#30). The documentation page for `/api/temporal/monthly/point` gives `start` and `end` as years and allows up to 20 parameters per point request, but regional requests only one parameter; it does not state the fill value or the annual key (read 3 Nov 2026) | Noted; D-06 tolerance set | Part 2 | B |
| V-08 | GISTEMP v4: CSV URL, header layout, missing-value marker, base period (#22) | Noted | Part 4 | A |
| V-09 | The challenge page's Resources tab: every dataset and tool it names | `00_BRIEF.md` §1.1 filled | Part 3 | B |
| V-10 | Hosting: GitHub Pages serves the site and a file under `/results/` over HTTPS | The URL works in a private window and on a phone | Part 5 | B |
| V-11 | pyhomogeneity 1.1 `pettitt_test(x, alpha, sim)`: `sim=None` gives the analytic p-value; the default `sim=20000` draws unseeded random numbers | Confirmed in the lock file's version | Part 3 | A |

---

## 11. Hosting and sizes

One repository and one GitHub Pages site hold the code, the site and the results (01 §10). GitHub Pages allows a 1 GB site and a soft 100 GB a month (#34); a results build is far below that (01 §8). The input bundle and the downloads stay in `.cache/` and are not committed.

---

## 12. Provenance and citations

Every result lists, for each product: name, short name, version, DOI, route, granule count and access date, plus the input-manifest SHA-256, the pre-registration SHA-256, the config hash and the build id (`schemas/provenance.schema.json`). The Data & credits page lists:

- MERRA-2: GMAO (2015), MERRA-2 tavgM_2d_slv_Nx, V5.12.4, GES DISC, doi:10.5067/AP1B0BA5PD2K; the collection holding `PRECTOTCORR` (V-03); Gelaro et al. (2017), *J. Climate*, 30, 5419–5454.
- GPM IMERG V07: Huffman et al. (2023), GPM IMERG Final Precipitation L3 1 month 0.1° V07, GES DISC, doi:10.5067/GPM/IMERG/3B-MONTH/07.
- GISTEMP v4: GISTEMP Team, NASA GISS; Lenssen et al. (2024), doi:10.1029/2023JD040179.
- NASA POWER: "These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program."
- Boundaries: Natural Earth; geoBoundaries (licence as recorded in V-06).
- Map outlines: Natural Earth, simplified and bundled (ADR-08).

---

## 13. Not used

- **Suomi NPP:** its data delivery ends on 2 Nov 2026 (#21).
- **SMAP, PACE and TEMPO:** records too short for trends.
- **GRACE gain factors:** unsuitable for trends (#18; JPL mascons page). GRACE is deferred and descriptive only, and its 2017–18 gap stays empty.
- **IMERG Late Run and V08:** never spliced onto V07 Final.

---

## 14. Adding or swapping a dataset

The design takes any gridded dataset with monthly (or finer) values. Only the pipeline's reader is new code; the engine and the site read what the configuration and the result files say.

**What the engine needs from a variable:** monthly values in one unit; a rule for turning months into a year (`mean` for states such as temperature, `sum` for amounts such as rain); a grid on which regions get fractional cell weights. Datasets with daily or sub-monthly steps are aggregated to months in the reader. A dataset with only yearly values, or one that is not on a regular latitude–longitude grid, needs regridding in its reader first.

| Step | Where | What |
|---|---|---|
| 1 | The dataset's official page | Short name, version, DOI, variable name, units, fill value, grid, time step, record length, licence. Copy them; never guess |
| 2 | `config/sources.yaml` | One entry for the source (many NASA products are already listed as deferred) |
| 3 | `config/variables.yaml` | One entry for the variable: `id`, `status: analysed` (or `sensitivity`), `source`, `variable`, `units.monthly` and `units.aggregated`, `rule`, `ratio_scale`, `valid_range`, names and record card in English and Bangla. To pair a second record of the same quantity as a sensitivity check, set `sensitivity: <its id>` on the analysed variable |
| 4 | `python/src/casefile_pipeline/sources/` | One reader: find the files (through `earthaccess` for anything in NASA Earthdata; a plain download otherwise), read the variable, convert to the monthly unit, mask fills. Register it under the source id (build plan, step 2D) |
| 5 | The pipeline's grid list | The dataset's grid (id, first latitude and longitude, steps, counts). `casefile-pipeline regions` then computes masks and the support rule for it; a region that fails on this grid gets no series for this variable |
| 6 | `casefile-pipeline bundle`, `casefile-engine check-bundle` | `series/<variable id>/<region>.npz` appear; units and ranges are checked against `valid_range` |
| 7 | `config/preregistration.yaml` (people, before the commit) | The variable with its role, window, practical threshold and reason |
| 8 | `casefile-engine examples`, commit | The example build records the configuration's hashes, so regenerate it once |

**What stays as it is:** the engine (a variable marked `analysed` or `sensitivity` in `variables.yaml` is accepted by domain check D1 without editing `config/analysis.yaml`; the methods tables do not depend on the variable); the schemas (variable and grid ids are free strings); the site (it lists what `catalog.json` holds).

**Limits of the first release:** the sensitivity sentences name IMERG, so a second sensitivity pairing needs new sentence templates. The screening map is drawn for the variables the bundle has a map field for. A dataset whose values need a different statistical treatment (counts, extremes, strongly skewed values) should be shown as exploration, not given verdicts, until someone has checked the method on it.

**Swapping a product** (for example another precipitation record instead of IMERG as the sensitivity check): steps 1–6 for the new one, set the old variable's status back to `deferred`, and name the new one in the pre-registration.


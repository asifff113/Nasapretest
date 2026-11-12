# 07 — Tests

Every test has an id that the build plan cites. Golden files in `examples/golden/` hold the expected values. **A golden mismatch stops every build.** Never edit a golden file, a tolerance or a test to get green.

The golden values and the examples are written by the engine itself (`uv run casefile-engine examples`), and its tests require that a rebuild reproduces them exactly. The engine reproduces every v2 golden value for the parts of the method that did not change (12_METHOD_COMPARISON §1).

---

## 1. Tolerances

| Kind | Tolerance |
|---|---|
| Integers (S, n, counts, years, flags, int16 fields) | exact |
| Deterministic arithmetic (slopes, intercepts, φ, VIF, variances, rates, totals) | \|a − b\| ≤ 1e-9 × max(1, \|b\|) |
| p-values | \|a − b\| ≤ 1e-9, or relative 1e-6 when p < 1e-6 |
| float32 fields in map files | relative 1e-6 |
| Statuses, reasons, grades, families, doubts, labels | exact |
| Text (headlines and sentences, English and Bangla) | exact, character for character |
| Simulation results (K-tests) | the bounds in §6, never exact values |

**Schema validation:** `python tools/validate_pack.py` (and the same check in `ci.yml`) loads every file in `schemas/` and validates every example by the schema its `"schema"` field names (`casefile/verdict@3` → `verdict.schema.json`; `casefile/map@3` → `map_meta.schema.json`). Results builds run the same validation on every file they write.

---

## 2. G — golden suites (assert; fail the build)

| Id | File | Checks |
|---|---|---|
| G-01 | `golden/engine_cases.json` | For each series: Mann–Kendall (S, tie-corrected Var(S), τ, Z, p with `pKind`), φ̂, φ̃, VIF, MK-AR1 (Var\*, Z\*, p\*), Sen slope, Conover intercept, widened interval (2.25) and SciPy interval (1.96), residSd, the t-test (display only), the naive test and the Pettitt flag (its p capped at 1: `flat_constant`). Includes v2's 19 series, `gap_decade_removed` (actual years, 0.1 a year; the index would give 0.1588), `gld01` (SciPy's exact Kendall p 0.000358 against the normal approximation), `syn06_outlier`, `syn07_many_ties`, `steady_rise` and `flat_constant` (zero residuals) and `line_float_noise` (floating-point noise counts as zero) |
| G-02 | `golden/aggregate_cases.json` | Mean and sum rules for ANN, DJF, MAM, JJA, JJAS and ON (v2 values unchanged); the anomaly method; `warm_months_dropped` (the yearly value stays flat, while a plain mean of the available months would fall); unit cases: PRECTOTCORR × 86 400, IMERG × 24, a constant 1 mm/h giving 8 784 mm in 2020 and 8 760 mm in 2021 |
| G-03 | `golden/families_cases.json` | Holm and Benjamini–Hochberg with the family size fixed in advance and missing tests at p = 1; Gemini's GLD-02 (BH rejects 5; naive p < 0.05 gives 6) |
| G-04 | `golden/domain_cases.json` | D1–D7 one at a time, and precedence (D3 before D5, D4 before D6), using `examples/methods/tables.json` |
| G-05 | `golden/map_cells.json` + `examples/maps/air_temp/ANN/` | Five cells of the synthetic map: flags, rate, p, q, pooled φ̃, leftover statistic and m_eff; the counts of testable and significant cells |
| G-06 | `golden/robustness_cases.json` | Leave-one-year-out, five windows (including skipped windows), coverage drift, documented breaks with and without a review |
| G-07 | `golden/contrast_cases.json` | Sen(A − B) against Sen(A) − Sen(B) for the playbook's seed-3 pair (0.053 against 0.063 a year); a missing year in B makes d missing |
| G-08 | `golden/leftover_cases.json` | The leftover statistic, m, m_eff (from ρ̄²), ρ̄ and the cells' median φ̃ for fixed cell arrays; critical-value lookups (n row, m_eff step, interpolation between φ steps) |
| G-09 | `golden/rasterize_cases.json` | Box weights on the 1° grid (v2 cases) and on the MERRA-2 native grid |
| G-10 | `golden/power_cases.json` | Weatherhead's formula (labelled fallback) and one seeded power simulation |
| G-11 | `golden/format_cases.json` | Number formatting and p-expressions in English and Bangla |
| G-12 | `examples/verdicts/`, `contrasts/`, `lineups/`, `cases/` | Rebuild each from `examples/series/`, `examples/prereg.json`, `examples/methods/tables.json` and `config/`: every field within tolerance, text exact in both languages (`provenance.created` excluded) |

---

## 3. E — engine (`python/tests/test_engine_*.py`, provided)

The engine is provided with its tests (01 §4); nobody writes engine tests.

| Test | Checks | Speed |
|---|---|---|
| `test_golden_values_match` | G-01…G-11: all 60 golden cases recomputed and equal within the tolerances of §1 | 1 s |
| `test_selfcheck_catches_a_changed_statistic` | A 0.1% change in the variance inflation fails the golden check | 1 s |
| `test_full_methods_tables_are_shipped_and_match_the_configuration` | The shipped tables have 2 000 series per row and carry the SHA-256 of the current `config/analysis.yaml` | fast |
| `test_examples_validate_against_their_schemas` | Every file of `examples/` validates | fast |
| `test_a_configured_variable_on_a_new_grid_builds` | A variable that is only configured (02 §14), on a grid id the engine has never seen, goes through a real results build: verdicts, contrasts and text in both languages, every file valid | 5 s |
| `test_examples_rebuild_byte_identical` | G-12: `examples/` rebuilt from the synthetic bundle, byte for byte | 4 min |
| `test_real_path_gives_the_same_numbers_as_the_examples` | A results build through the real path (bundle on disk, with disjoint-cell pair files, a YAML pre-registration, `results`) gives the same verdicts, contrasts, line-ups, series and cases | 4 min |
| `test_real_path_map_and_tiles`, `test_real_path_files_validate_and_are_labelled` | The map equals the example's; all 648 cell tiles exist; every file validates; `build.json` reports the golden check | (same run) |
| `test_results_refuses_without_a_committed_preregistration` | P-14: no committed pre-registration, no build, nothing written | fast |

The rules those tests cover are specified in 03; the golden files of §2 hold the expected values.

---

## 4. P — pipeline (`python/tests/pipeline/`, written in Part 2; none needs the network)

| Id | Checks |
|---|---|
| P-01 | Grids: MERRA-2 native (576 × 361), IMERG native (3600 × 1800), 1° (360 × 180), equal to `casefile_engine.base`; cell areas on the 1° grid sum to 510 065 881 km² (±1) |
| P-02 | Fractions of a box equal `casefile_engine.base.box_weights` (G-09) |
| P-03 | Polygon fractions (5 × 5 sample points): a polygon equal to a box is within 0.04 of the box rule; holes respected |
| P-04 | Support rule S1 and S2 for each grid; on the real boundary files the MERRA-2 values equal `tools/decide/support_out.json` (Dhaka, Khulna, Rajshahi and Rangpur pass; Chittagong, Sylhet, Mymensingh and Barisal fail) |
| P-05 | Units: T2M K → °C; PRECTOTCORR × 86 400 → mm/day (never × 86 400 000); IMERG mm/hr × 24 → mm/day; fill values become NaN |
| P-07 | IMERG arrives as (time, lon, lat): transposed before use |
| P-08 | Conservative regrid to 1°: the area-weighted global mean is kept to 1e-4 relative |
| P-10 | Month bookkeeping: a missing or doubled month raises; the manifest lists every file with its SHA-256 |
| P-11 | No hand-built addresses: a test fails on `gesdisc.eosdis.nasa.gov` or a hard-coded `MERRA2_[0-9]{3}` file name in `python/src/` |
| P-12 | IMERG: version 07 Final only; no Late Run or V08 granule in the manifest |
| P-18 | Pair split: a cell both regions touch goes to the one with the larger fraction, a tie drops it; the pair series use the split weights |
| P-19 | A tiny synthetic end-to-end run writes a bundle that `casefile-engine check-bundle` accepts; the region mean of a constant field is that constant |

P-14 (the build refuses without a committed pre-registration) is an engine test (§3).

---

## 5. D — checks on the real inputs and results

D-01…D-05 and D-09 look at no trend, so they run in Part 2. D-08 and D-10 run after the results build (Part 4). D-06 and D-07 are optional extras.

| Id | Check | Expected |
|---|---|---|
| D-01 | MERRA-2 T2M, area-weighted global mean of the 1991–2020 monthly values | about 14–15 °C |
| D-02 | Bangladesh rain climatology (MERRA-2 and IMERG) | the monsoon months are by far the wettest (`check-bundle` prints the monthly range) |
| D-03 | Monthly sequences complete, with no doubled month | — |
| D-04 | Monthly values inside the plausible range of each variable (`check-bundle`) | no problem reported |
| D-05 | Bangladesh monthly climatology, MERRA-2 rain against IMERG, 12 values | same wet season; record the two yearly totals |
| D-08 | `tools/validate_results.py results/<id>` passes; family sizes equal the pre-registration's; every result carries the pre-registration and manifest hashes | "results OK" |
| D-09 | Every region in the set passes S1 and S2 and every pre-registered pair passes S3 (`prereg-check`) | — |
| D-10 | Sizes within the budgets of 01 §8 | — |
| D-06 (optional) | POWER cross-check (02 §8): one MERRA-2 cell's monthly T2M against POWER at that cell | mean absolute difference ≤ 0.1 °C |
| D-07 (optional) | Known answer: the GISTEMP global annual series through `casefile_engine.stats.mk_ar1` | positive slope, p\* < 0.001 |

---

## 6. K — calibration (what the shipped tables show)

The tables are simulated once, at 2 000 series per row with fixed seeds, and shipped with the engine (01 §4; `casefile-engine methods-tables` re-simulates them in about 40 minutes if `config/analysis.yaml` ever changes). The Methods page publishes every row, whatever it shows. Values of the shipped tables:

| Id | Setting | Shipped tables |
|---|---|---|
| K-01 | No trend, n = 25, φ = 0.4 | 5.6% false alarms |
| K-02 | Interval coverage, multiplier 2.25, every n and φ of 03 §9.3 | 94.75–98.85% (target 95%) |
| K-03 | False alarms inside the validated domain | 3.1–7.9%. Among records that pass every domain check: 3.2–6.6% for n ≥ 25 and true φ ≤ 0.5; up to 9.1% at n = 20; 9–16% when the true φ is 0.6–0.8, because passing selects records whose memory was underestimated (03 §5.2) |
| K-04 | Stress families (03 §9.2) | The domain checks lower false alarms for both families at m_eff 5 and 20 (for example mixed memory, n = 46: 28% → 10% at m_eff 5 and 24% → 1% at m_eff 20); a single series (m_eff 1) is barely helped |
| K-05 | Leftover check on valid AR(1) regions (study in `tools/decide/`) | 1.0–4.6% false flags in all 60 settings |
| K-06 | Power | Rises with n and with effect size (0.05 SD per year, φ = 0.3: 15% at n = 20, 48% at n = 35) |
| K-08 | Contrast on synthetic pairs (03 §9.6) | Null pairs labelled "rates differ" in 5.4–6.0% of runs at every ρ; a 0.04 SD per year difference is found in 25% of runs at n = 30 and a 0.13 SD per year difference in 95% |
| K-09 | Tied values; growing spread, no trend | 4.6–5.3% and 3.1–3.5% |

K-07 (null maps) was not simulated: `mapNull` in the tables is empty, and the Methods page says the map is exploration with a false discovery rate of 10% and makes no claim about whole maps.

---

## 7. I — integration

| Id | Checks |
|---|---|
| I-01 | CI green: engine self-check, pytest, schema validation, typecheck, lint, unit tests, Playwright on `examples/` |
| I-02 | The site and the results are reachable over HTTPS from GitHub Pages, in a private window and on a phone |
| I-03 | The site requests only files from its own origin (Playwright request log) |
| I-04 | The offline build opens by double-click (`file://`) with the network disabled and plays every case in `offline/set.json` |

---

## 8. W — web end to end (Playwright, desktop and phone viewports)

| Id | Flow |
|---|---|
| W-01 | Home → question card → shortlist with record cards; deferred cards greyed and marked "not analysed in this release" |
| W-02 | Place picker: fixed set only; contributing cells drawn; a division that failed the support rule says why |
| W-03 | Line-up shows the number of tests and each row's family |
| W-04 | A verdict card for every status and reason in `examples/verdicts/` (including `_states/`): the headline equals the file's `text.en.headline`; in Bangla it equals `text.bn.headline`; outside the domain no interval is shown |
| W-05 | Compare screen: "Trend in the difference" with its interval; each region's own rate beside it; the labels; the IMERG toggle shows the lineage line |
| W-06 | Map: hatched cells, the "exploration" label, the number of tests; clicking a cell opens the cell page with no verdict words |
| W-07 | The provenance panel shows dataset, version, years, values used and missing, build id, pre-registration hash and manifest hash |
| W-08 | The Methods page renders every table in `methods/tables.json`, with rates worded as a property of the method |
| W-09 | Each watch case plays to the end with the ending its result chose |
| W-10 | The offline list shows the cases kept on the device |
| W-11 | Every view restores from its URL |
| W-12 | The confidence spine appears on every screen that shows a result |
| W-13 | "What would overturn this claim?" shows at most three items, only on verdicts |

---

## 9. X — accessibility and language

| Id | Checks |
|---|---|
| X-01 | axe-core on every screen: no serious or critical violations |
| X-02 | Keyboard only: choose a question, a place and a pair, open a verdict, the map and the Methods page |
| X-03 | Every catalog variable has English and Bangla name, definition, how-measured text and record card |
| X-04 | i18n key parity and identical placeholders (`tools/validate_pack.py`) |
| X-05 | Charts have text alternatives; status icons have text |
| X-06 | `prefers-reduced-motion` stops transitions; watch mode still advances |
| X-07 | Wording lint: the words barred by 03 §12 appear in no string file (`config/i18n/`, `web/src/i18n/`) |

---

## 10. U — usability (optional; protocol in `templates/USABILITY_TEST.md`)

Three students from outside the team, with no coaching. Each must (1) pick a suitable variable for a given question, (2) state a rate of change with its unit, (3) explain the uncertainty range without saying "95% chance it's true", and (4) read "can't tell yet" as not "no change". **Pass when at least two of the three manage each task.**

# 03 — Science rules

Owner: A. Every number the site shows follows these rules. `casefile_engine` implements them exactly. The tests in `07_TESTS.md` hold the expected values, thresholds live in `config/analysis.yaml`, and the choices the team fixes in advance live in `config/preregistration.yaml`.

**The recipe in one breath:** aggregate monthly values to one value per year or per pre-registered season → check that the record is inside the validated domain → Sen's slope with a widened 95% interval (multiplier 2.25) → Mann–Kendall with an AR(1) variance correction (MK-AR1) → adjust for the family the test belongs to (Holm for confirmatory tests, Benjamini–Hochberg for seasons) → robustness checks (documented breaks with manual review, coverage and gaps, leave-one-year-out, five alternative windows) → a grade, "can't tell yet", or "no verdict" with the reason. Two regions are compared by testing the trend in their difference.

---

## 1. Principles

1. **Test years, not months.** One value per year or per season removes the seasonal cycle and most month-to-month memory.
2. **Verdicts only where the method was tested.** MK-AR1 keeps false alarms near the nominal rate only when year-to-year memory behaves like AR(1) and the record is long and complete enough. Outside that domain the site shows the slope and says "no verdict".
3. **Compare by testing the difference.** "Significant here, not there" does not show that two trends differ. The estimand of a comparison is the trend in A − B.
4. **Decide the family before looking.** The pre-registration fixes the regions, pairs, seasons, thresholds and α before any real-data trend is computed. Only those tests get verdict words.
5. **"Can't tell yet" is an answer.** It is not "no change", and the card says so.
6. **Statistical and practical significance stay apart.** A practical threshold per variable is declared in advance and shown separately.
7. **No number without provenance.** Product, version, the input manifest, the pre-registration hash, the build id and the config hash travel with every result.

---

## 2. From monthly values to one value per year (engine, from the pipeline's monthly values)

### 2.1 Rules (by variable, `config/variables.yaml` → `rule`)

| Rule | Used for | Yearly or seasonal value | Units after aggregation |
|---|---|---|---|
| `mean` | air temperature | day-weighted mean of the monthly values | °C |
| `sum` | rain (MERRA-2 PRECTOTCORR, IMERG) | Σ (monthly mean rate in mm/day × days in the month) | mm |

Rates are converted first: PRECTOTCORR kg m⁻² s⁻¹ × 86 400 → mm/day (1 kg m⁻² = 1 mm; never × 1 000); IMERG mm/h × 24 → mm/day. Day weights use the real length of each month (28 or 29 days for February). A constant 1 mm/h gives 8 784 mm in 2020 and 8 760 mm in 2021, so the annual totals differ by design.

### 2.2 Seasons

`config/seasons.yaml`. `ANN` is January–December. A season that crosses the year end is **dated by the year in which it ends**: DJF 2001 = Dec 2000 + Jan 2001 + Feb 2001. Bangladesh's seasons are winter DJF, pre-monsoon MAM, monsoon JJAS and post-monsoon ON. The first release analyses `ANN` plus the seasons named in the pre-registration. When a record starts in January, its DJF window starts one year later.

### 2.3 Completeness

- `mean`, season `ANN`: needs at least 10 of 12 months (`aggregation.ann_min_months`). With 10–11 months, use the **anomaly method** so that missing months do not bias the value:
  `value = Σ_all d_m c_m / Σ_all d_m + Σ_valid d_m (x_m − c_m) / Σ_valid d_m`,
  where `c_m` is the climatology of calendar month m over the window and `d_m` the days in that month.
- Every other season, and every `sum` total, needs **all** its months.
- Missing years stay missing. Never interpolate. A missing year inside a window means no verdict for that window (§5.1, D4).
- **Warm-month test (v3 D7):** dropping the warmest months in later years of a series with no trend must not create a "cooling" trend. Golden case `G-02 warm_months_dropped` checks it.

### 2.4 Region means and coverage (native grids)

For month t, with cell weights `w_i` = cell area × fraction of the cell inside the region (02 §7), on the product's **native grid**:
`mean(t) = Σ w_i x_i(t) / Σ w_i` over cells valid in month t;
`coverage(t) = Σ w_i (valid at t) / Σ w_i (cells valid in at least one month of the record)`.
A month with coverage below 0.5 (`coverage.month_min`) is missing. A year's coverage is the mean coverage of the months used. **Average over space first, then aggregate in time.** The 1° cells for the screening map are made by conservative regridding (02 §4) and then aggregated the same way per cell.

### 2.5 The difference series (contrasts)

`d(t) = A(t) − B(t)` for the same variable, season and years, in the same units, from the annual or seasonal values above. For the contrast, A and B are built on **disjoint cells** (02 §7.4): a cell that both regions touch goes to the region holding the larger fraction of it, and a tie drops it from both, so the two means never share data. Each region's own verdict keeps its full weights. A year missing in A or in B is missing in d. A constant offset between regions does not change a trend, so no anomaly baseline is needed for the test. The chart shows d as departures from its window mean.

### 2.6 Units shown

Rain season and year values are totals (mm). Rates of change are per decade (slope per year × 10).

---

## 3. How much: Sen's slope and change

Let years `t_i` (integers) and finite values `x_i`, i = 1…n, be sorted by year.

- **Sen's slope** `b` = median of all pairwise slopes `(x_j − x_i)/(t_j − t_i)` for i < j, on **actual years**. Never use the index: with a decade removed, index spacing turns a true 0.100 a year into 0.1588 (recomputed, v3 6.3 r11).
- **Intercept** (Conover, as SciPy and pymannkendall): `a = median(x) − b · median(t)`.
- **Residuals** `r_i = x_i − (a + b t_i)`; `residSd` = their standard deviation (denominator n − 1).
- **Span** = last year used − first year used. **Total change** = `b × span`; its range = interval bounds × span.
- **Percent of the starting level** (rain only, `ratio_scale: true`): baseline = `a + b × first year`; percent = 100 × total / baseline when the baseline is above 0.
- **Signal-to-noise** = |total| / residSd: below 1 "smaller than the usual ups and downs", 1–2 "about as big", above 2 "bigger".

---

## 4. The verdict test: MK-AR1

MK-AR1 is Mann–Kendall with its variance inflated by a bias-corrected lag-1 coefficient. It is the only test that decides a verdict. Library Hamed–Rao, trend-free pre-whitening and default Yue–Wang tests are barred: at 45 years they gave 10–22%, up to 38% and 43–54% false alarms (v3 D1). Plain Mann–Kendall appears only in a "naive" comparison toggle in the expert panel.

### 4.1 Mann–Kendall S, variance and p

1. **S** = Σ_{i<j} sgn(x_j − x_i), with pairs ordered by year.
2. **Var(S)** = [n(n−1)(2n+5) − Σ_g t_g(t_g−1)(2t_g+5)] / 18, where t_g are the sizes of groups of tied values. **Always tie-corrected.**
3. **Z** = (S − 1)/√Var if S > 0, (S + 1)/√Var if S < 0, 0 if S = 0. **p** = 2(1 − Φ(|Z|)). This is the normal approximation with a continuity correction. Golden files label it `"pKind": "mk_normal_cc"`. SciPy's exact Kendall p is a different number: for Gemini's GLD-01 series it is 0.000358 against 0.00128 here (v3 6.3 r11). Golden files that quote SciPy label it `"kendall_exact"`.
4. Kendall's τ = S / (n(n−1)/2).

### 4.2 Memory: φ̂, φ̃ and the inflation factor

1. **φ̂** = the coefficient on x(t − 1) in the least-squares regression **x(t) = c + φ x(t − 1) + δ (t − t̄)**, fitted over the pairs of consecutive years that are both present, on actual years. φ̂ = 0 when there are fewer than 4 such pairs, when the regression is singular, or when the residuals are zero (§4.5).
2. **φ̃** = clip((n·φ̂ + 2)/(n − 4), 0, 0.95) for n ≥ 6, and clip(φ̂, 0, 0.95) below that, where n is the number of values. The correction inverts the small-sample bias of exactly this estimator: in a regression with an intercept and a trend, φ̂ ≈ φ − (2 + 4φ)/n (Shaman and Stine 1988; verify before citing). Negative values become 0, so the correction never makes the test less cautious than plain Mann–Kendall.
3. **VIF** = 1 + 2 Σ_{k=1}^{n−1} (1 − k/n) φ̃^k.
4. **Var\*(S)** = Var(S) × VIF; **Z\*** and **p\*** as in §4.1 with Var\* in place of Var.

**Why this variant.** Four variants fit playbook v3's description ("a bias-corrected lag-1 coefficient inflates the variance of the Mann–Kendall statistic"): two memory estimators (this regression, or the lag-1 autocorrelation of the Sen residuals used in v2) times two clipping rules (at 0, or allowing negative values as the recompute scripts do). On the full calibration grid (n 20–46, φ 0–0.8, 4 000 series per cell) this one gave the largest validated domain (50 of 54 grid cells at ≤ 8% false alarms, as D5 reads them), the lowest worst-case false-alarm rate inside it (7.75%), at most nominal false alarms when memory is absent (3.2–4.1%), and the best interval coverage (≥ 95.45%). The decision rule was fixed before the run; `12_METHOD_COMPARISON.md` §8.1 has the tables.

### 4.3 Requirements

MK-AR1 needs at least 4 finite values to compute. Below 20 complete years it never decides a verdict (§5).

### 4.4 The widened Sen interval (multiplier 2.25)

Sen's rank method, as `scipy.stats.theilslopes`, with the inflated variance and the multiplier **2.25 instead of 1.96** (v3 6.3 r4; `analysis.interval.multiplier`):
- N = number of pairwise slopes, sorted ascending; C = 2.25 × √Var\*(S).
- lower index = max(round((N − C)/2) − 1, 0); upper index = min(round((N + C)/2), N − 1) (0-based; round half to even).
- Interval = [slopes[lower], slopes[upper]] per year; × 10 per decade.

With VIF = 1 and the multiplier 1.96 this reproduces SciPy exactly (G-01). The Methods page reports the coverage this rule achieves (§9.3). It is called the "95% range", and the copy never calls it a 95% chance (§12).

### 4.5 Edge cases (all have golden cases)

- **Zero residuals.** Treat residuals as zero when residSd ≤ 1e-9 × max(1, |median(x)|). Floating-point noise from a perfect line must not produce φ̃ = 0.95. Then φ̂ = φ̃ = 0 and VIF = 1.
- **Constant series.** S = 0, Z = 0, p = 1, slope 0, interval [0, 0].
- **Non-finite p** (from any step): the result is "not testable" (§5.1, D7) and enters its family with p = 1.
- **Ties.** Always in Var(S), never ignored.

### 4.6 The t-test (display only)

The statement names the t-test, so the expert panel shows it. It never decides a verdict, alone or with MK-AR1 (v3 6.3 table).
1. Least-squares fit `x = α + β t` on actual years. `s² = Σ e² / (n − 2)`, `SE(β) = √(s² / Σ(t − t̄)²)`.
2. `r₁` = lag-1 autocorrelation of the least-squares residuals (consecutive-year pairs, as §4.2); φ_ols = the same bias correction and clipping as §4.2.
3. **Effective sample size** `n_eff = n (1 − φ_ols)/(1 + φ_ols)` (Santer et al. 2000). If n_eff ≤ 3 the t-test is **unavailable**.
4. `SE_adj = SE × √((n − 2)/(n_eff − 2))`; `t = β / SE_adj`; `df = n_eff − 2` (may be fractional); `p = 2(1 − T_df(|t|))`; interval = β ± t_{0.975, df} × SE_adj.
5. If SE_adj is zero (the same tolerance as §4.5): with β = 0, t is undefined and p = 1; otherwise t = ±∞ (null in JSON), p = 0 and the interval is [β, β].

This is the spec's version, with the bias correction. The "Santer-style" t-test in the recompute scripts has no bias correction and no clipping. It gave 7.5–8.8% false alarms at 45 years and 10.5–14.6% at 20; ours gave 3.0–7.4%, but was unavailable for up to 23% of records at 20 years with memory 0.6 (12_METHOD_COMPARISON §3).

### 4.7 The naive toggle

The expert panel can show plain Mann–Kendall (VIF = 1), labelled "naive: ignores year-to-year memory". It is there for teaching: at memory 0.6 and 45 years it raised false alarms in 30.6% of no-trend records (v3 6.3 table).

---

## 5. The validated domain

### 5.1 Checks, in order

A record gets a verdict only if it passes every check. Otherwise it shows its slope and the reason.

| Id | Check | Rule (`analysis.domain`) | Reason code if it fails | What the site shows |
|---|---|---|---|---|
| D1 | Variable | `air_temp`, `rain` or `rain_imerg` | `outside_domain` | Slope; "no verdict: outside the range this method was tested for" |
| D2 | Season | `ANN` or a pre-registered season | `outside_domain` | as D1 |
| D3 | Record length | at least 20 complete years; 15–19 is "exploratory"; below 15 is too short | `short_record` (15–19), `too_short` (< 15) | Slope with "exploratory: 15–19 years" or "too short to test" |
| D4 | Complete | no missing year in the window | `missing_year` | Slope; the missing years listed |
| D5 | Memory in range | φ̃ ≤ φ_max(n) from the calibration table (§5.2) | `outside_domain` | as D1 |
| D6 | No leftover memory | pooled leftover-memory statistic ≤ its critical value (§5.3) | `outside_domain` | as D1 |
| D7 | Testable | p\* finite | `not_testable` | Slope; "not testable" |

Two further reasons come from outside the domain checks: `break_review` (a manual review saw a step at a documented data change, §6.2) and `exploration` (the test is in no pre-registered family, §7.3). Precedence is D1, D2, D3, D4, D5, D6, D7, `break_review`, `exploration`. Outside the domain the interval is not calibrated either, so the card shows the slope alone. The expert panel shows the interval marked "not calibrated here".

### 5.2 φ_max(n)

φ_max(n) is the largest φ in the calibration table (§9.1) whose false-alarm rate is at most 8% (`analysis.domain.max_false_alarm_pct`) at the table's largest n not above the record's n. It is read from `methods/tables.json`; the table is simulated once at full size and shipped with the engine (`python/src/casefile_engine/data/sim_tables.json`, 01 §4). The calibration grid runs over φ = 0.0, 0.1, …, 0.8. For reference, our MK-AR1 gave 7.75% at n = 20 and φ = 0.6 and 8.8% at φ = 0.7, but 5.6% at n = 46 and φ = 0.6 (12_METHOD_COMPARISON §8.1), so φ_max depends on n: 0.6 at 20 years, 0.8 from 35 years.

**What the shipped table gives** (2 000 series per row). φ_max(n) = 0.7 at n = 20 and 25, 0.8 at n = 30, 35 and 40, and 0.7 at n = 46 (at n = 46 and φ = 0.8 the rate was 8.2%, just over the limit; cells at the edge can move by a step between simulations). Inside these limits the false-alarm rate is 3.1–7.9%. **Among the records that pass every domain check** it is 3.2–6.6% for n ≥ 25 and true memory up to 0.5, and up to 9.1% at n = 20. When the true memory is 0.6–0.8 it can reach 16% among the records that pass, because passing then selects the records whose memory was underestimated. The Methods page shows this column for every row and says so in words; no claim on the site depends on it being lower.

### 5.3 The pooled leftover-memory check (memory-matched)

A record can pass D5 and still have memory that AR(1) does not describe. At 25 years with no trend, MK-AR1 flagged 20% of records whose memory mixes a fast and a slow part and 41% of AR(2) records (v3 6.3 r2). A check on a single series catches only about 2% of the mixed records, so the check pools the region's cells.

1. **Cells.** The region's contributing native cells, using the same variable, season and window. Use at most 200 cells (every k-th in row-major order). On the screening map, a cell's 5 × 5 neighbourhood on the 1° grid, with longitude wrapping and latitude clamped.
2. **Per-cell statistic.** Detrend the cell's series by least squares on actual years; take the autocorrelations a₁…a₄ of the residuals (full-sample formula); `s_cell = mean_{k=2,3,4} (a_k − a₁^k)`. For a true AR(1) series this is near 0.
3. **Region statistic** `s = mean over cells of s_cell`.
4. **Memory to match:** **the median of the cells' own φ̃** (§4.2, each cell's series on its own), not the region series' φ̃. Pooled over many cells it is far less noisy, and the statistic is computed from the cells, so its null must match the cells' memory.
5. **Effective number of cells** `m_eff = m / (1 + (m − 1) ρ̄²)`, where ρ̄ is the mean pairwise correlation of the detrended cell series, clipped to [0, 1]. The per-cell statistic is a ratio of quadratic forms, so its correlation between two cells is close to the square of the cells' correlation (Bartlett-type result; verify before citing); the simulation confirms that this keeps false flags below 5%. Round m_eff **down** to the nearest table value {1, 2, 3, 5, 10, 20}.
6. **Critical value.** The 95th percentile of s for regions of m_eff independent AR(1) cells, from `methods/tables.json` (§9.5), at the largest tabulated n not above the record's n, **linearly interpolated in φ** between the table's 0.1 steps (φ capped at 0.8). D6 fails if s exceeds it.

**Why this construction.** The playbook's construction (`rt_pool.py`) takes one critical value from AR(1) 0.5 regions; it flagged 23–80% of memory-free AR(1) regions (5–20 independent cells, 25 years). Matching on the region series' φ̃, rounded to 0.1, still flagged up to 12.5–14.2% at 25 years with 20 cells. With the three changes above, false flags on valid AR(1) regions were 1.0–4.6% in all 60 tested settings (independent and correlated cells, φ on and off the grid), while power stayed the same or rose: mixed memory 8–99% and AR(2) 58–100%, and for moderately correlated cells (ρ = 0.3–0.5) power on mixed memory rose from 3–51% to 16–79%. `12_METHOD_COMPARISON.md` §8.2 has the tables.

For a contrast, A and B must each pass D1–D7, and the difference series d must pass D3, D4, D5 and D7.

---

## 6. Robustness checks (M5)

Each check returns `pass`, `doubt`, `note` or `skip`, with parameters for its message (`config/i18n/*.json` → `checks.*`). Doubts lower the grade (§8.2); notes never do.

### 6.1 Coverage and gaps

Gaps are any missing years in the window. Any gap means no verdict (D4), and the years are listed. Coverage drift is a doubt when the plain Mann–Kendall test of yearly coverage against year has p < α **and** coverage changes by at least 0.2 (max − min). MERRA-2 fields are complete, so this check normally passes. It matters for IMERG near coasts and high latitudes.

### 6.2 Documented breaks and manual review (MUST)

For each `type: data` break in `config/known_breaks.yaml` for this variable's sources, dated at least 2 years inside the window:
- The card names the break and draws it on the chart.
- `config/break_review.yaml` records a manual review for each headline case: who looked, what they saw (`no_step_seen`, `step_seen` or `unclear`) and a note. `no_step_seen` gives a note. `step_seen` gives no verdict (`break_review`). `unclear` or no review gives the doubt `break_unreviewed`.
- Every headline case must have a review before it is shown as a result (Part 4).
- Breaks with no date (gradual input changes) appear on the record card only.

The step-versus-trend comparison and `ruptures` are not part of this build.

### 6.3 Leave-one-year-out

For n ≥ 20, remove each year once and recompute p\*. If the main p\* < α and some removal gives p\* ≥ α, that is the doubt `loo_flip`, naming the year whose removal raises p\* most. If the main p\* ≥ α and some removal gives p\* < α, that is a note: one year matters. Removing a year leaves a gap, which the consecutive-pair rule in §4.2 handles.

### 6.4 Five alternative windows

The pre-registration lists five alternative windows. By default (`analysis.robustness.windows`) they are: start + 3 years, start + 6, end − 3, end − 6, and start + 3 with end − 3. A window runs only if it keeps at least 20 years inside the record; otherwise it is skipped and listed as skipped. A window agrees when its slope has the main slope's sign and its own p\* < α. If the main p\* < α and fewer than 4 of the windows that ran agree, that is the doubt `windows_disagree`. All five are shown, labelled "robustness checks, not new claims".

### 6.5 Pettitt flag (SHOULD, S4)

For headline cases and every confirmatory test, call `pyhomogeneity.pettitt_test(x, alpha=α, sim=None)` (pyhomogeneity 1.1; access check V-11). With `sim=None` it returns the analytic p-value 2·exp(−6U²/(n³ + n²)), which exceeds 1 when U is small (a constant series gives 2), so the engine caps it: p = min(1, that value). Never use the default `sim=20000`, which draws unseeded random numbers. The change year is `years[cp]`, the first year of the new level. The flag is raised when p < α and shows that year. **It never changes the status or the grade.** Neither `ruptures` nor pymannkendall 1.4.3 has a Pettitt test (checked in code, v3 3).

---

## 7. Many tests

### 7.1 Confirmatory family (Holm)

The confirmatory family is exactly the pre-registration's list. For each pre-registered pair (A, B) and each first-release analysed variable (`air_temp`, `rain`), on the main window with `ANN` values, it holds three tests: the trend in A, the trend in B and the trend in A − B. A test that appears in two pairs counts once. The family size m₁ is fixed by the pre-registration. Holm's step-down adjustment is applied at the pre-registered α: sort p ascending, then `p_adj(i) = max_{j ≤ i} min(1, (m₁ − j + 1) p(j))`. A test that cannot be computed, or falls outside the domain, enters with p = 1. It cannot be rejected, and it does not make the others less strict.

### 7.2 Secondary family (Benjamini–Hochberg)

The same three tests for each pre-registered season other than `ANN` form one secondary family of size m₂. Benjamini–Hochberg is applied at the pre-registered `q_secondary`: `q(i) = min_{j ≥ i} (m₂ p(j) / j)`, capped at 1, with the same p = 1 rule for missing tests. These results are worded "secondary".

### 7.3 Exploration and sensitivity

Everything else is exploration: other regions and pairs, 1° cells, the screening map, and alternative windows (which are robustness checks, not new claims). Exploration shows the slope and interval with no verdict words. The expert panel shows p\* labelled "uncorrected". IMERG results form the `sensitivity` family: shown beside MERRA-2, never graded (§8.6). FDR handles multiplicity; it cannot repair p-values from outside the domain.

### 7.4 The line-up (M3)

For one region, the line-up lists `air_temp` and `rain` for `ANN` and each pre-registered season. Each row shows the rate per decade, its interval, its family and its adjusted p (Holm or BH from §7.1–§7.2). Exploration rows show a BH q computed within the line-up, labelled "adjusted within this list of N". The line-up always prints the number of tests: N rows and the size of each family.

### 7.5 The global screening map (M8)

For each variable and season (`ANN` and the pre-registered seasons), on the 1° grid and the variable's main window:
1. A cell is **testable** if it has at least 20 complete years and no missing year, its pooled φ̃ (median of the per-cell φ̃ over the 5 × 5 neighbourhood, longitude wrapping, latitude clamped, ignoring cells without data) is ≤ φ_max(n), its pooled leftover-memory check (§5.3) passes, and p\* is finite. Pooling φ cut false dots on pure-noise maps from 52% to 0.8% in the v2 simulation; K-07 re-checks this.
2. For testable cells: Sen slope, widened interval and MK-AR1 p\* using the pooled φ̃.
3. Benjamini–Hochberg over the testable cells at **q = 0.10** within each map. Wilks (2016) supports this for moderately to strongly correlated fields (fact-check #36).
4. Untestable cells are hatched: "can't test here". The map is labelled "Screening map — exploration, not a verdict" and prints the number of tests (testable cells).

---

## 8. Verdicts

### 8.1 Status and reasons

`status` is `verdict` only for confirmatory and secondary tests that pass §5. Every other result has `status: no_verdict` and one reason: `outside_domain`, `short_record`, `too_short`, `missing_year`, `not_testable`, `break_review` or `exploration`. Sensitivity results have `status: no_verdict` and reason `exploration` with `family: sensitivity`.

### 8.2 Grades

| Grade | Rule (inside the domain; confirmatory or secondary) |
|---|---|
| `strong` — "Strong evidence" | p_adj < α/5 and no doubts |
| `supported` — "Supported trend" | p_adj < α and at most one doubt |
| `cant_tell_yet` — "Can't tell yet" | otherwise. The card always adds "which is not the same as no change" |

Doubts are `loo_flip`, `windows_disagree`, `coverage_drift` and `break_unreviewed`. Notes (model data, the Pettitt flag, "one year matters", reviewed breaks) never change the grade. **The card shows no "years needed" number.**

### 8.3 Practical threshold

The pre-registration declares a threshold T per variable, in units per decade, before any real trend is seen. The card answers "Is it big enough to matter?" separately from the grade:
- `exceeds` — the whole interval lies beyond +T, or beyond −T;
- `smaller` — the whole interval lies inside (−T, +T);
- `overlaps` — otherwise.

### 8.4 "What would overturn this claim?" (SHOULD, S1)

The engine picks up to three rules, in this order, from the result's own fields (`config/i18n` → `overturn.*`):

| Id | When | Says |
|---|---|---|
| O1 | A documented break lies inside the window | A step at that change would make this a data change, not an Earth change |
| O2 | Leave-one-out ran | The answer leans most on year Y: without it, p\* = … |
| O3 | Alternative windows ran | The weakest window and its rate |
| O5 | Rain, with an IMERG sensitivity result | Whether IMERG points the same way over its years |
| O4 | Always (inside the domain) | Memory stronger or slower than AR(1) would make the test too eager; what the leftover-memory check found |
| O6 | A practical threshold is declared | Whether the interval includes changes too small to matter |
| O7 | `cant_tell_yet` | A longer record or a larger region could change this answer (no number of years) |

### 8.5 Comparing two regions (M6)

- **Estimand:** the trend in d(t) = A(t) − B(t) (§2.5), with its own Sen slope, widened interval and MK-AR1 p\*, labelled "**trend in the difference**". It is not Sen(A) − Sen(B): for one recomputed pair, Sen(A − B) was 0.053 a year and Sen(A) − Sen(B) 0.063 (v3 6.3 r6). Each region's own slope is shown beside it and never subtracted.
- **Family:** a pre-registered pair is confirmatory (`ANN`) or secondary (seasons); any other pair is exploration.
- **Grade of the difference:** inside the domain, d is graded like any trend (§8.2), using its own family-adjusted p and the doubts from its own robustness checks. Outside the domain it gets `no_verdict` with the reason.
- **Labels**, all computed and shown together:
  - `oppositeFittedDirections`: the two Sen slopes have opposite signs (both non-zero). This is descriptive only.
  - `supportedOppositeTrends`: A and B are each graded `strong` or `supported` in their own family, with opposite signs.
  - `ratesDiffer`: d is graded `strong` or `supported`. A d with p_adj < α but two or more doubts is `cant_tell_yet`, and `ratesDiffer` is false.
- **Wording** follows the evidence: "opposite fitted directions", "supported opposite trends" or "rates differ" (v3 6.3 r6). There is no correlation gate: low or negative correlation between regions does not invalidate the contrast (v3 D5).
- The whole comparison output is tested on synthetic pairs with known answers (§9.6, K-08).

### 8.6 The rain sensitivity check (SHOULD, S3)

The same trends and the same contrast are computed on IMERG V07 Final over 1998–2024 and on MERRA-2 PRECTOTCORR over the same years, and shown side by side with a lineage line: "Both records use rain-gauge and satellite inputs, so this is a sensitivity check, not an independent confirmation." The result is `family: sensitivity` with no verdict words. It says whether the two records give the same sign for the trend in the difference and whether each interval excludes zero. Annual IMERG trends end in 2024. Never splice IMERG Late Run or V08 onto V07 (02 §3.2).

### 8.7 The confidence spine (SHOULD, S5)

Every result file carries a `spine` object: status, grade or reason, rate and interval per decade, family, family size and domain status. The site shows it on every screen that shows that result.

### 8.8 Chart geometry

Every verdict and contrast also carries a `chart` block, so the site draws without computing (04 §6): the display values (for a contrast, d minus its window mean, with that mean as `offset`); the pivot (median year used, median value); the Sen line at the first and last year used; and the band, two segments through the pivot with the interval's slopes. The band is written only where the interval is shown: for verdicts and exploration, never outside the domain.

---

## 9. Methods tables (built by the engine, on synthetic data)

`casefile-engine methods-tables` writes `methods/tables.json` (schema `methods.schema.json`) with the engine's own code and the seeds of §15. The Methods page shows these tables, not the numbers in this file. Every rate is worded as **a property of the method** ("with no trend, it flags about 6 in 100 such records"), never as the chance that a shown verdict is wrong (v3 6.3 r3).

| § | Table | Design |
|---|---|---|
| 9.1 | Calibration | No trend; n ∈ {15, 20, 25, 30, 35, 40, 46}; φ ∈ {0.0, 0.1, …, 0.8}; 2 000 series each. False-alarm % of MK-AR1, the share of records that pass the domain checks, and the false-alarm % among those that pass. Extra rows: tied values (rounded to 0.1 SD) and spread growing from 0.5 to 1.5 |
| 9.2 | Stress families | No trend; mixed memory (AR(1) 0.1 plus AR(1) 0.9) and AR(2) (0.15, 0.65); n ∈ {25, 46}; m_eff ∈ {1, 5, 20}. False-alarm % before and after the domain checks |
| 9.3 | Interval coverage | Trend 0.02 SD a year; n ∈ {20, 25, 30, 46}; φ ∈ {0, 0.3, 0.6}; multipliers 1.96 and 2.25. Achieved coverage of the true slope |
| 9.4 | Power | AR(1) noise with an injected trend equal to the declared practical threshold, in residual-SD units; n ∈ {20, 25, 30, 35, 40, 46}; φ ∈ {0, 0.3, 0.6}; effects {0.02, 0.05, 0.10} SD a year. The Methods page also gives, for each confirmatory test, a conditional sentence: "if year-to-year noise stays as it was, a change of the declared size would be caught in about N of 10 records this long". The target is the declared threshold, never the observed slope. Weatherhead's formula appears only as a labelled fallback: at its n\* our test caught 71.6–77.8% of trends, not 90% (§14) |
| 9.5 | Leftover-memory critical values | 95th percentile of s (§5.3) for n ∈ {20, 25, 30, 35, 40, 46}, m_eff ∈ {1, 2, 3, 5, 10, 20} and φ ∈ {0.0, …, 0.8}; 1 000 null regions of independent AR(1) cells each. Read by interpolation in φ (§5.3) |
| 9.6 | Contrast on synthetic pairs | Null pairs with noise correlation ρ ∈ {0, 0.5, 0.9}: share wrongly labelled "rates differ" (target about α); pairs with known trends (A +0.03, B −0.01 SD a year): share labelled "rates differ" and "supported opposite trends"; a shared stationary AR(1) driver with opposite ±0.03 trends: the difference is found while the individual slopes are noisy. This replaces Minimax's random-walk case, where both slopes were significant in only 0.1% of runs |
| 9.7 | Map null test | 50 × 60 cells, φ varying 0–0.6, pooled φ̃, BH q = 0.10: share of pure-noise maps with any false dot |

The calibration (§9.1) and interval (§9.3) tables must be in `methods/tables.json` before the first real results build (Part 1 before Part 4), because D5 reads φ_max(n) from them.

---

## 10. Pre-registration

`config/preregistration.yaml` (schema `prereg.schema.json`) fixes, before any real-data trend is computed:
- the variables (first release: `air_temp`, `rain`; `rain_imerg` as the sensitivity check) and their main windows;
- the region set, each region with its support-rule result (02 §7.3);
- the pairs, and which one leads (it must involve Bangladesh);
- the confirmatory family (generated from the pairs and variables and listed in the file for review);
- the secondary seasons;
- a practical threshold per variable, in units per decade;
- α for the confirmatory family and q for the secondary family (the map's q = 0.10 is fixed in `analysis.yaml`);
- the five alternative windows;
- the SHA-256 of `config/analysis.yaml`, so that the method cannot change silently.

**Process.** Fill in every `<fill>`, run `casefile-engine prereg-check` (validation plus the generated family list), have all three team members read it, set `status: committed`, commit, and record the commit hash in the file's `commit` field in a follow-up commit. That second commit changes nothing else, and the check confirms this. The results build refuses to run otherwise and writes the file's SHA-256 into every result.

**Amendments.** An amendment before any real trend has been computed replaces the file, with a reason, and gets a new hash. After that, an amendment can only add tests. Added tests are exploration and are listed as such on the Methods page.

---

## 11. Removed from v2

The v2 sections on the significance clock, the "Real or random?" visual line-up, Scan, the opposites finder and second witnesses are removed: they are CUT, or outside v3's MUST and SHOULD lists. The section number is kept so that references to §12–§16 stay valid. `CHANGES.md` records where each part went.

---

## 12. Wording and verdict text

### 12.1 Wording table

| Use | Never |
|---|---|
| "rose / fell by … per decade" for a supported trend | "proves", "confirms", "definitely" |
| "Supported trend", "Strong evidence" | "significant" for exploration or sensitivity results |
| "Can't tell yet, which is not the same as no change" | "no change", "no trend" for `cant_tell_yet` |
| "consistent with" a cited process | "caused by", "because", "due to", "driven by" |
| "the trend in the difference" (A − B) | two significance labels side by side as a comparison |
| "opposite fitted directions", "supported opposite trends", "rates differ" | "opposite trends" without the evidence word |
| "the model shows" (MERRA-2); "satellites and gauges measured" (IMERG) | "measured" for model output |
| "sensitivity check" (IMERG beside MERRA-2) | "independent confirmation", "second witness" |
| "95% range: ranges made this way catch the true rate about 95 times in 100" | "a 95% chance it is true" |
| "exploration: not one of our pre-registered tests" | verdict words on the map or on cells |
| "no verdict: outside the range this method was tested for" | a grade outside the domain |

### 12.2 Templates and parameters

Templates live in `config/i18n/en.json` and `bn.json` → `verdict.*`, `contrast.*`, `checks.*`, `overturn.*`, `reason.*`. The engine fills them and writes the text into each result. The site only displays it. Parameters: `Variable` and `variable` (catalog `name` and `name_mid`); `in_region` (the region's `in` text); `season_phrase` (" (" + season total + ")" for rain, including ANN as "yearly total"; "" for temperature with ANN; otherwise " (" + season short + ")"); `from` and `to` (first and last year used); `rate`, `lo`, `hi` (per decade, signed, all with the decimals chosen for `rate`, then a space and the units); `total` and `total_signed`; `pct`; `p_expr` ("p < 0.001" or "p = 0.034"); `n_tests`; `family_size`.

### 12.3 Number formatting

- decimals for x: if x = 0 or not finite → 0; else d = 2 − 1 − floor(log10 |x|), clamped to [0, 4].
- fixed: `Decimal(x).quantize(Decimal(10) ** -d, rounding=ROUND_HALF_UP)` on the exact binary value. Ties round away from zero (1234.5 → "1235", 0.125 → "0.13", 1.005 → "1.00", because the binary value of 1.005 is just below the tie). Python's `f"{x:.2f}"` rounds ties to even and must not be used. "-0", "-0.00" and so on become "0", "0.00". A leading "-" becomes "−" (U+2212).
- signed: prefix "+" when the fixed string is not zero and not negative.
- p: below 0.001 → "< 0.001"; below 0.1 → 3 decimals; otherwise 2 decimals.
- Bangla: after filling a sentence, map digits 0–9 to ০–৯, except inside words that contain Latin letters, so dataset names such as "MERRA-2" and "V07" keep their digits. Everything else is unchanged.

The engine is the formatting reference, and `examples/golden/format_cases.json` holds the cases. The site's `format.ts` formats only numbers the engine did not put into sentences (axis ticks, table cells), with the same rules.

---

## 13. Code rules checked in code (v3 6.3 r11)

| Rule | Test |
|---|---|
| Every slope uses actual years, never the index | G-01 `gap_decade_removed` |
| Mann–Kendall variance is tie-corrected | G-01 `pi_digits_ties` |
| Non-finite p → "not testable" | engine tests (07 §3) |
| Zero residuals and constant series follow §4.5 | G-01 `steady_rise`, `flat_constant` |
| Golden tests assert values, tolerances and verdicts, including gaps, ties, constant series and threshold cases, and fail the build | G-01…G-05; CI |
| Golden p-values say whether they are SciPy's exact Kendall p or the normal approximation | G-01 `pKind` fields |
| `seasonal_test(x, period=12, alpha=...)` is called with keywords if Seasonal Kendall is ever added, because its second positional argument is `period` | code review |
| Library Hamed–Rao, TFPW and Yue–Wang defaults are not imported by `casefile_engine` | engine tests (07 §3) |
| Pettitt is called with `sim=None` and its p is capped at 1 | G-01 `flat_constant` |

---

## 14. Reference values

From `12_METHOD_COMPARISON.md` §8 (the chosen variant, §4.2) and §2–§5 (the playbook's variant, on the recompute scripts' own series). These describe **this** MK-AR1; the Methods page shows the engine's own tables.

| Property | Our MK-AR1 (03 §4) | Playbook's recomputed variant |
|---|---|---|
| False alarms, no trend, n 20–46, φ 0–0.6 (4 000 series per cell) | 3.2–7.75% (46 years: 3.7–5.7%) | 4.95–7.9% (45 years: 5.3–6.9%) |
| Validated domain (cells of n 20–46 × φ 0–0.8 at ≤ 8%, from φ = 0) | 50 of 54; φ_max 0.6 (n 20), 0.7 (n 25–30), 0.8 (n ≥ 35) | 50 of 54 |
| Widened interval coverage, multiplier 2.25 | 94.6–99.3% | 95.2–97.35% |
| Widened interval coverage, multiplier 1.96 | 92.2–97.3% | 92.4–94.45% |
| Mixed memory (0.1 + 0.9), no trend, 25 / 45 years (4 000 / 2 000 series) | 18.9% / 24.1% | 20.2% / 24.3% |
| AR(2) (0.15, 0.65), no trend, 25 / 45 years | 31.4% / 39.4% | 41.4% / 40.2% |
| Growing spread (0.5 → 1.5), no trend, 25 / 46 years (4 000 series) | 3.1% / 3.8% | 6.6% / 6.6% |
| Power at Weatherhead's n\* (24, 29, 37 years; φ 0, 0.3, 0.6) | 77.8%, 77.7%, 71.6% | 80.2%, 76.5%, 71.8% |
| t-test with n_eff, no trend (display only) | 3.0–7.4%; unavailable up to 23% | 7.5–14.6% ("Santer-style", no bias correction) |

---

## 15. Seeds and determinism

All randomness uses `numpy.random.default_rng(seed)`. Seeds are derived as `int.from_bytes(sha256(text.encode()).digest()[:8], "little")`, where text is `"<table>|<n>|<phi>|<extra>"` for §9 tables. The Pettitt flag uses the analytic p (`sim=None`) and draws no random numbers. Nothing else draws random numbers. Results are byte-identical across reruns from the same inputs, pre-registration and commit.

---

## 16. References

- Mann, H. B. (1945), Nonparametric tests against trend, *Econometrica*, 13, 245–259. Kendall, M. G. (1975), *Rank Correlation Methods*.
- Theil, H. (1950); Sen, P. K. (1968), Estimates of the regression coefficient based on Kendall's tau, *JASA*, 63, 1379–1389.
- Hamed, K. H. (2009), Enhancing the effectiveness of prewhitening in trend analysis of hydrologic data, *J. Hydrol.*, 368, 143–155 (bias correction; verify before citing, fact-check #39).
- Shaman, P., & Stine, R. A. (1988), The bias of autoregressive coefficient estimators, *JASA*, 83, 842–848 (the bias of the AR(1) coefficient with intercept and trend; verify before citing).
- Bartlett, M. S. (1946), On the theoretical specification and sampling properties of autocorrelated time-series, *JRSS Supplement*, 8, 27–41 (sampling covariance of autocorrelations; verify before citing).
- Yue, S., & Wang, C. (2004), The Mann–Kendall test modified by effective sample size to detect trend in serially correlated hydrological series, *Water Resour. Manage.*, 18, 201–218.
- Hamed, K. H., & Rao, A. R. (1998), A modified Mann–Kendall trend test for autocorrelated data, *J. Hydrol.*, 204, 182–196 (barred as a default).
- Santer, B. D., et al. (2000), Statistical significance of trends and trend differences in layer-average atmospheric temperature time series, *JGR*, 105, 7337–7356.
- Pettitt, A. N. (1979), A non-parametric approach to the change-point problem, *Applied Statistics*, 28, 126–135.
- Holm, S. (1979), A simple sequentially rejective multiple test procedure, *Scand. J. Statist.*, 6, 65–70.
- Benjamini, Y., & Hochberg, Y. (1995), Controlling the false discovery rate, *JRSS B*, 57, 289–300.
- Wilks, D. S. (2016), "The stippling shows statistically significant grid points", *BAMS*, 97, 2263–2273.
- Weatherhead, E. C., et al. (1998), Factors affecting the detection of trends, *JGR*, 103, 17149–17161 (fallback only; verify before citing, fact-check #37).
- Hussain, M. M., & Mahmud, I. (2019), pyMannKendall, *JOSS*, 4(39), 1556.
- Lenssen, N., et al. (2024), A NASA GISTEMPv4 observational uncertainty ensemble, *JGR Atmospheres*, doi:10.1029/2023JD040179 (fact-check #22).

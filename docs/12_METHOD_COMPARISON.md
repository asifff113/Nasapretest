# 12 — MK-AR1 and the t-test: this spec against playbook v3 §6.3 and the recompute scripts

Owner: A. The playbook's numbers in §6.3 came from the recompute scripts (`trend-recompute-scripts.zip`), whose MK-AR1 "follows GPT-6 Astra's description" and was never checked against this spec (the playbook's own README says so). This file lists every difference between the two, measures what each difference does on identical simulated series (§2–§6), and then resolves the three decisions the comparison left open: the MK-AR1 variant, the leftover-memory check and the support rule (§8). The decisions in §8 are final in this pack; changing one needs new golden values, new Methods tables and a decision-log row.

**Evidence** (all in `tools/compare/`, run with Python 3.13, NumPy 2.5.3, SciPy 1.18.1, statsmodels 0.15.0, pymannkendall 1.4.3):
- `compare_mkar1_ttest.py` → `compare_out.json`, `compare_log.txt`: false alarms, interval coverage, stress families, growing spread, power and the two worked examples, for both variants, on the same series (the scripts' own generators and seeds).
- `leftover_memory_check.py` → `leftover_out.json`, `leftover_log.txt`: the pooled leftover-memory check, single null against memory-matched.
- `rt_pool_out.txt`: `rt_pool.py` re-run unchanged.
- `check_v2_goldens.py` → `check_v2_goldens_out.json`, `check_v2_goldens_log.txt`: the v3 reference against the v2 golden values.
- `recompute/`: the recompute scripts, copied unchanged.
- `tools/decide/`: the three decision studies of §8 (`decide_mkar1.py`, `v3_reference_values.py`, `decide_leftover.py`, `support_cells.py`, `support_pairs.py`, `support_split.py`) with their outputs. The boundary files they read are public downloads named in each script; they are not in the pack.

Because the comparison uses the scripts' own series and seeds, the script variant reproduces the playbook's numbers exactly (for example, 5.3–6.9% false alarms at 45 years; 7.45–14.55% for the t-test). Every difference below is therefore a difference of method, not of random draws.

---

## 1. Is the reference a faithful reading of the spec?

`python/src/casefile_engine/stats.py` implements 03 §3–§4 from the text. Before the §8.1 decision it reproduced every v2 golden value whose rule had not changed to a relative difference of at most 1e-9. After the decision (`check_v2_goldens_log.txt`), every field that does not depend on the memory estimate still matches v2 to 1e-9: Mann–Kendall S, Var(S), τ, Z and p; Sen slope, intercept and SciPy interval; residSd; the t-test; Pettitt. The memory-dependent fields change by design: φ̂ by up to 0.081, φ̃ by up to 0.063, and so VIF, Var\*, Z\* and p\* (largest change in p\*: 0.042, for `ar1_gaps_seed201`). One more value differs on purpose: for the constant series `flat_constant` the t statistic is now `null`, because 0/0 is undefined (p stays 1; v2 wrote 0). The widened interval changes everywhere because the multiplier changed (§2, item 10).

---

## 2. Every difference

**Read §2–§6 as history.** They compare the spec as v3 first wrote it (the Sen-residual estimator, V1 in §8.1) with the recompute scripts (V2). The pack now uses V3, the scripts' estimator with the spec's clip at 0 (§7, §8.1). Where §2–§6 say "this spec", read "v3 as first written"; V3's own values are in §8.1 and 03 §14.

| # | Item | v3 as first written (V1) | Recompute scripts | Playbook v3 §6.3 | Effect on identical series | Decision |
|---|---|---|---|---|---|---|
| 1 | Memory estimate φ̂ | Lag-1 autocorrelation of the **Sen residuals** (Conover intercept), consecutive-year pairs only, full-sample denominator | `vi_bc_gpt`: the coefficient on x₍t−1₎ in a **dynamic regression** of x₍t₎ on x₍t−1₎, a constant and t | "a bias-corrected lag-1 coefficient" (either fits) | Mean φ̃ with no memory: +0.06 to +0.10 (spec) against −0.003 to −0.007 (scripts) | Replaced: the regression estimator with the clip at 0 (V3; §8.1, ADR-06) |
| 2 | Clipping of φ̃ | [0, 0.95]: negative memory never makes the test less cautious than plain Mann–Kendall | [−0.95, 0.95] | — | This explains the difference at φ = 0: the scripts' estimator clipped at 0 gives 3.9% (n 20) against the spec's 3.85%; the spec's estimator allowed negative gives 6.9% against the scripts' 7.45% | Keep [0, 0.95] |
| 3 | Bias correction | (nφ̂ + 2)/(n − 4) for n ≥ 6; φ̂ below | (nr + 2)/(n − 4) | "bias-corrected" | Same formula | Same |
| 4 | Inflation factor | 1 + 2 Σ (1 − k/n) φ̃ᵏ | the same | — | Same | Same |
| 5 | Time axis | Actual years | The index 0…n−1 | Rule 11: actual years | None in the simulations (no gaps); with a decade removed, the index gives 0.1588 instead of 0.100 a year | Actual years (already in the spec) |
| 6 | Tie correction in Var(S) | Always | None | Rule 11: tie-corrected | None on continuous simulated data; real on rounded data (G-01 `pi_digits_ties`, `syn07_many_ties`) | Tie-corrected (already in the spec) |
| 7 | p-value | Normal approximation with continuity correction, labelled `mk_normal_cc` | The same formula, unlabelled | Rule 11: say which p | Same values; SciPy's exact Kendall p differs (0.000358 against 0.00128 for GLD-01) | Label every golden p (`pKind`) |
| 8 | Interval rank rule | SciPy's: integer ranks, round half to even | `sen_ci` interpolates between ranks | — | At most 0.15 percentage points of coverage | SciPy's rule (reproduces `theilslopes` exactly) |
| 9 | Variance in the interval | Tie-corrected Var(S) × VIF from this spec's φ̃ | Untied Var(S) × the scripts' factor | — | Different φ̃ gives different widths; see §4 | This spec's |
| 10 | Interval multiplier | 2.25 (v2 had 1.96) | 1.96 and 2.25 | Rule 4: 2.25 | §4 | 2.25 |
| 11 | Edge rules | Fewer than 4 values: no test; n < 6: no bias correction; zero residuals within 1e-9 × max(1, \|median\|): φ̃ = 0; constant series: p = 1, slope 0, interval [0, 0]; non-finite p: "not testable", p = 1 in its family | `var ≤ 0` → p = 1; nothing else | Rule 11: non-finite p "not testable" | Only on degenerate series; floating-point noise on a perfect line would otherwise give φ̃ = 0.95 (G-01 `line_float_noise`) | This spec's |
| 12 | t-test memory | r₁ of least-squares residuals, consecutive-year pairs, then the same bias correction and [0, 0.95] clip as φ̃ | `santer_t`: raw r₁, no bias correction, no clip (n_eff can exceed n) | Table: "Santer-style … display only" | §3 | Keep; display only |
| 13 | t-test availability | Unavailable when n_eff ≤ 3 | p = 1 when n_eff ≤ 2.5 | — | Spec unavailable in up to 23.35% of records (n 20, φ 0.6) | Keep; the card says "unavailable" |
| 14 | t-test time axis and edges | Actual years; SE_adj = 0 with β = 0 → t undefined, p = 1; with β ≠ 0 → p = 0 | Index; no edge rules | — | Degenerate series only | This spec's |
| 15 | Pettitt | `pyhomogeneity.pettitt_test(sim=None)`, analytic p capped at 1; a flag only | Not tested in the scripts | Rule 10: Pettitt only as a flag | The cap matters for near-constant series (uncapped, a constant series gives p = 2) | Flag only, capped |

---

## 3. False alarms with no trend (%)

2 000 series per cell, AR(1) noise, two-sided α = 0.05. "Unavailable" is the share of records where the spec's t-test is not shown.

| n | φ | Scripts' MK-AR1 | This spec's MK-AR1 | Scripts' t-test | This spec's t-test | Spec t-test unavailable | Plain MK |
|---|---|---|---|---|---|---|---|
| 20 | 0.0 | 7.45 | 3.85 | 10.65 | 3.75 | 0.15 | 5.40 |
| 20 | 0.3 | 6.50 | 5.70 | 10.50 | 6.00 | 3.10 | 12.65 |
| 20 | 0.6 | 7.90 | 8.30 | 14.55 | 7.35 | 23.35 | 27.95 |
| 25 | 0.0 | 5.50 | 3.10 | 7.65 | 2.95 | 0.00 | 4.10 |
| 25 | 0.3 | 4.95 | 4.20 | 8.50 | 4.90 | 1.00 | 11.65 |
| 25 | 0.6 | 6.60 | 7.15 | 10.90 | 6.65 | 14.95 | 28.55 |
| 30 | 0.0 | 7.15 | 3.90 | 8.95 | 4.30 | 0.00 | 5.25 |
| 30 | 0.3 | 6.15 | 6.10 | 9.45 | 5.90 | 0.10 | 13.45 |
| 30 | 0.6 | 6.35 | 7.05 | 11.30 | 6.95 | 8.10 | 30.40 |
| 45 | 0.0 | 6.90 | 4.80 | 8.30 | 5.10 | 0.00 | 5.80 |
| 45 | 0.3 | 5.65 | 5.55 | 7.45 | 5.35 | 0.00 | 13.40 |
| 45 | 0.6 | 5.30 | 5.80 | 8.75 | 5.55 | 0.85 | 30.55 |

**Hybrids** (`compare_log.txt`): the scripts' estimator clipped at 0 gives 3.1–7.7%, and the spec's estimator allowed negative gives 4.9–8.45%. The clip at 0, not the estimator, makes the spec conservative when memory is absent. The t-test's difference comes from the bias correction: the spec's t-test with raw r₁ reproduces the scripts' numbers exactly.

**Reading.** Both MK-AR1 variants stay within 3–8.3% on AR(1) noise at 20–45 years. V1 is conservative at φ = 0 (3.1–4.8%) and slightly more eager at φ = 0.6 and short records (8.3% at n = 20). The domain check D5 reads φ_max(n) from the engine's own calibration table at ≤ 8%, so a record like n = 20, φ = 0.6 can fall outside the domain. The scripts' t-test is too eager (up to 14.55%); the spec's is not, but is often unavailable when memory is strong.

---

## 4. Interval coverage (%)

True trend 0.02 SD a year, 2 000 series per cell.

| n | φ | Scripts, 1.96 | Scripts, 2.25 | This spec, 1.96 | This spec, 2.25 |
|---|---|---|---|---|---|
| 20 | 0.0 | 93.45 | 96.65 | 97.00 | 98.70 |
| 20 | 0.3 | 93.10 | 95.25 | 94.10 | 96.45 |
| 20 | 0.6 | 92.40 | 95.20 | 92.05 | 94.95 |
| 25 | 0.0 | 93.60 | 96.40 | 96.90 | 98.50 |
| 25 | 0.3 | 94.20 | 96.30 | 94.95 | 97.05 |
| 25 | 0.6 | 92.55 | 95.65 | 92.45 | 95.45 |
| 30 | 0.0 | 93.80 | 96.95 | 96.70 | 98.40 |
| 30 | 0.3 | 93.75 | 97.35 | 94.35 | 97.75 |
| 30 | 0.6 | 93.15 | 96.40 | 92.80 | 95.80 |
| 46 | 0.0 | 93.85 | 96.80 | 95.95 | 98.20 |
| 46 | 0.3 | 94.45 | 96.85 | 94.65 | 96.85 |
| 46 | 0.6 | 94.30 | 96.80 | 94.10 | 96.70 |

The playbook's "1.96 covers 92.4–94.4%; 2.25 covers 95.2–97.4%" is the scripts' column. With V1's φ̃, 2.25 covers 94.95–98.7%: it overcovers when memory is absent and just meets 95% at n = 20, φ = 0.6. With the chosen V3 it covers 94.6–99.3% (03 §14). The multiplier 2.25 is kept (v3 rule 4); the Methods page reports the engine's achieved coverage (03 §9.3), and K-02 requires at least 94%.

---

## 5. Stress families, growing spread and power (%)

| Setting (no trend unless stated) | Scripts' MK-AR1 | This spec's MK-AR1 | Scripts' t-test | This spec's t-test |
|---|---|---|---|---|
| AR(1) 0.6, n 25 (4 000 series) | 6.65 | 7.15 | 11.52 | 6.20 |
| Mixed memory, AR(1) 0.1 + 0.9, n 25 | 20.15 | 19.52 | 26.90 | 19.45 |
| AR(2) (0.15, 0.65), n 25 | 41.45 | 33.90 | 47.92 | 36.33 |
| AR(1) 0.6, n 45 (2 000 series) | 6.70 | 6.95 | 9.10 | 6.30 |
| Mixed memory, n 45 | 24.30 | 24.85 | 29.55 | 24.85 |
| AR(2), n 45 | 40.25 | 37.75 | 45.35 | 39.15 |
| Spread growing 0.5 → 1.5, n 25 (4 000) | 6.65 | 2.95 | — | — |
| Spread growing 0.5 → 1.5, n 46 (4 000) | 6.65 | 4.10 | — | — |
| Power at Weatherhead's n\* = 24, φ 0, trend 0.1 SD a year | 80.20 | 76.80 | 88.70 | 79.95 |
| Power at n\* = 29, φ 0.3 | 76.45 | 77.80 | 87.95 | 76.60 |
| Power at n\* = 37, φ 0.6 | 71.80 | 74.55 | 86.55 | 67.30 |

Both variants fail the same way on memory that AR(1) does not describe (about 20–25% for mixed memory, 34–41% for AR(2)). That is why the validated domain, not the choice of variant, protects the verdicts (03 §5).

**The two worked examples** (scripts' series): Sen(A − B) = 0.0530 a year against Sen(A) − Sen(B) = 0.0631 (seed 3); a decade removed from a perfect 0.1-a-year line gives 0.1588 on the index and 0.100 on actual years. Both are golden cases (G-07, G-01 `gap_decade_removed`).

---

## 6. The pooled leftover-memory check

`rt_pool.py` takes one 95th-percentile critical value from regions of AR(1) 0.5 cells and applies it to every region. Re-run unchanged, it reproduces the playbook: at 46 years, mixed memory is flagged in 75% (5 cells) and 99% (20 cells) of regions. But the statistic depends on the region's own memory, so a single null misjudges regions whose memory is not 0.5. `leftover_memory_check.py` compares it with a memory-matched critical value (the region's φ̃, in steps of 0.1), on 500 regions per cell.

| n | Cells | Construction | AR(1) 0.0 | AR(1) 0.3 | AR(1) 0.6 | Mixed 0.1 + 0.9 | AR(2) |
|---|---|---|---|---|---|---|---|
| 25 | 5 | single null (AR(1) 0.5) | 23.2 | 10.4 | 4.2 | 38.0 | 99.4 |
| 25 | 5 | memory-matched | 6.4 | 4.8 | 4.0 | 24.8 | 96.8 |
| 25 | 20 | single null | 79.6 | 18.2 | 1.6 | 88.2 | 100 |
| 25 | 20 | memory-matched | 14.2 | 9.4 | 3.8 | 59.2 | 100 |
| 46 | 5 | single null | 9.8 | 5.2 | 4.2 | 74.8 | 100 |
| 46 | 5 | memory-matched | 7.4 | 3.6 | 4.2 | 71.2 | 100 |
| 46 | 20 | single null | 34.8 | 10.0 | 2.6 | 99.8 | 100 |
| 46 | 20 | memory-matched | 6.8 | 5.6 | 5.2 | 99.6 | 100 |

The AR(1) columns are false flags (legitimate records sent to "no verdict"); the mixed and AR(2) columns are the check's power. Matching the memory cuts false flags on AR(1) regions from up to 79.6% to 3.6–14.2% and keeps most of the power. Matching on the region series' memory still flagged up to 14.2% of memory-free regions at 25 years with 20 cells. §8.2 finds the cause and the fix.

---

## 7. Decision

1. **MK-AR1:** the AR(1) regression estimator with the bias correction (nφ̂ + 2)/(n − 4), clipped to [0, 0.95], with the multiplier 2.25, inside the validated domain only (§8.1; 03 §4.2). This takes the scripts' estimator, which the correction was derived for, and keeps the spec's clip at 0, which keeps the test at or below nominal false alarms when memory is absent.
2. **t-test:** this spec's bias-corrected version, display only, "unavailable" when n_eff ≤ 3. The scripts' "Santer-style" version is too eager to show beside a verdict without a warning.
3. **Leftover-memory check:** matched on the cells' own memory (median of the cells' φ̃), the critical value interpolated in φ, and m_eff from ρ̄² (§8.2; 03 §5.3).
4. **Support rule:** S1 (≥ 4 effective native cells), S2 (spill share ≤ 1/3) and S3 (pairs on disjoint cells, each side ≥ 4 cells after the split) (§8.3; 02 §7.3–§7.4).
5. **Already in the spec, as v3 rule 11 asks:** actual years, tie-corrected variance, labelled p-values, the non-finite rule, asserted golden tests.
6. **The Methods page shows the engine's own tables**, not these numbers and not the playbook's (03 §9). The engine's tables must agree with §3–§8 within simulation noise (K-tests).

---

## 8. Resolving the three open decisions

Each study fixed its decision rule before it was run. All are synthetic or geometric: none reads climate data, so none looks at a real trend.

### 8.1 MK-AR1 variant (`tools/decide/decide_mkar1.py`, 4 000 series per cell)

Four variants fit v3 rule 1: the memory estimator (V1/V4: lag-1 autocorrelation of the Sen residuals, as v2; V2/V3: the AR(1) coefficient of x(t) = c + φ x(t − 1) + δ t, as the scripts) times the clip (V1/V3 at 0; V2/V4 allowing negative values). **Rule:** the largest validated domain (grid cells of n 20–46 × φ 0–0.8 with false alarms ≤ 8%, counted from φ = 0 as D5 reads them); then the lowest worst-case false-alarm rate inside it; then the higher power. Coverage of the 2.25 interval must stay at or above 94%.

| Variant | Domain cells (of 54) | φ_max at n 20 / 25 / 30 / 35 / 40 / 46 | Worst false alarms in the domain | False alarms at φ = 0 | Mean power in the domain | Lowest 2.25 coverage |
|---|---|---|---|---|---|---|
| V1 Sen residuals, clip 0 (spec so far) | 45 | 0.5 / 0.6 / 0.7 / 0.7 / 0.7 / 0.7 | 7.90% | 3.2–4.0% | 26.3% | 95.10% |
| V2 regression, negative allowed (scripts) | 50 | 0.6 / 0.7 / 0.7 / 0.8 / 0.8 / 0.8 | 7.88% | 5.6–6.6% | 26.4% | 95.30% |
| **V3 regression, clip 0 (chosen)** | **50** | **0.6 / 0.7 / 0.7 / 0.8 / 0.8 / 0.8** | **7.75%** | **3.2–4.1%** | 24.6% | **95.45%** |
| V4 Sen residuals, negative allowed | 44 | 0.4 / 0.6 / 0.7 / 0.7 / 0.7 / 0.7 | 7.65% | 5.6–6.3% | 28.0% | 95.00% |

V2 and V3 tie on the domain; V3 has the lower worst case, so the rule picks V3. The two differ only when memory is small: V2's negative φ̃ shrinks the variance below plain Mann–Kendall's, so it flags 5.6–6.6% of memory-free records, above the nominal 5%; its extra power comes from those excess false alarms. V3 also dominates the spec's previous V1: a larger domain (the Sen-residual estimate is biased low at high memory, so V1 is too eager there), a lower worst case, and the same behaviour when memory is absent. Theory agrees: (nφ̂ + 2)/(n − 4) inverts the bias φ − (2 + 4φ)/n of the AR(1) coefficient in a regression with intercept and trend, which is V2/V3's estimator, not V1's.

Further values for V3 (`v3_reference_values.py`): mixed memory 18.9% / 24.1% and AR(2) 31.4% / 39.4% false alarms at 25 / 45 years (both outside the domain by design); growing spread 3.1% / 3.8%; power at Weatherhead's n\* 77.8%, 77.7%, 71.6%; coverage 92.2–97.3% with 1.96 and 94.6–99.3% with 2.25 (03 §14).

### 8.2 Leftover-memory check (`tools/decide/decide_leftover.py`, 1 000 regions per setting)

**Cause of the 14% false flags.** The critical value depends on the cells' memory, but the old rule matched it to the region series' φ̃, a single noisy estimate (its standard deviation is about 0.2 at 25 years), rounded to the nearest 0.1. With 20 cells the null distribution is narrow, so a mismatched memory pushes the cut-off in the wrong place. **Rule:** false flags on valid AR(1) regions at or below the nominal 5% in every setting, then the most power on mixed memory and AR(2).

Settings: n 25 and 46; 5 independent cells, and 20 cells with correlation ρ 0, 0.3, 0.5, 0.65 and 0.8; AR(1) φ 0, 0.15, 0.3, 0.45, 0.6 (on and off the table's grid); mixed memory and AR(2). False flags are over the 60 AR(1) settings; power is over the 12 settings of each kind.

| Construction | False flags on AR(1) regions | Power: mixed memory | Power: AR(2) |
|---|---|---|---|
| M0: region series' φ̃ (Sen residuals), rounded | 0.0–12.5% | 3.2–99.2% | 56.4–100% |
| M1: region series' φ̃ (regression), rounded | 0.0–12.3% | — | — |
| M2: median of the cells' φ̃, interpolated | 0.0–4.4% | 2.5–98.8% | 55.8–100% |
| **M2 with m_eff from ρ̄² (chosen)** | **1.0–4.6%** | **8.4–98.8%** | **58.3–100%** |

The median of the cells' φ̃ fixes the mismatch (at 25 years and 20 cells, false flags fall from 12.5% to 3.6%). Using ρ̄² in m_eff fixes the opposite problem: with ρ̄, moderately correlated cells looked like one or two cells and the check almost never fired (false flags 0.0–0.8%, power on mixed memory 2.5–51%). The per-cell statistic is a ratio of quadratic forms, so its correlation between cells is about ρ²; with ρ̄² false flags stay at 1.0–4.6% and power on mixed memory rises, for example from 4.1% to 23.1% (25 years, ρ = 0.3) and from 21.5% to 56.6% (46 years, ρ = 0.5). When cells are almost identical (ρ = 0.8) the check is weak whichever rule is used (mixed memory 8–25%): the region then holds little more information than one series, which is why D5 and the stress tests still matter.

### 8.3 Support rule (`tools/decide/support_cells.py`, `support_pairs.py`, `support_split.py`)

**Inputs:** the boundary files of 02 §7.1 (geoBoundaries gbOpen BGD ADM1, Natural Earth 1:50m Admin 0 and 1:10m Admin 1), downloaded on 3 Nov 2026; fractions by the spec's 5 × 5 rule, checked against exact polygon overlaps (within 0.15 cells for every division and within 1.5% for the larger regions). **Rule for choosing:** each condition must protect against a named failure and be computable from geometry alone, before any data.

| Condition | Protects against | Value and why |
|---|---|---|
| S1: effective native cells ≥ 4 | A "region" that is one or two grid cells, which cannot be told apart from its neighbours | A 2 × 2 MERRA-2 block, about 14 000 km² at 23.5° N. Below it the divisions share most of their cells with a neighbour: Mymensingh 65% of its weight with Dhaka, Barisal 49% with Khulna, Sylhet 52% with Meghalaya |
| S2: spill share ≤ 1/3 | A region mean that mostly describes somewhere else, as when coastal cells are mostly sea | At least two thirds of what the number describes lies inside the place. Chittagong's coastal and island cells give it 0.45 |
| S3: disjoint cells for pairs, each side ≥ 4 after the split | Two "regional" means that are partly the same data: Bangladesh and West Bengal share 20 MERRA-2 cells, 35% of West Bengal's weight | The split keeps every natural neighbour pair valid and removes nested pairs |

**Result:** Bangladesh, Dhaka, Khulna, Rajshahi, Rangpur and all six comparison candidates pass; Chittagong fails S2, Sylhet and Mymensingh fail S1, Barisal fails both (table in 02 §7.3). On IMERG's 0.1° grid every candidate passes easily. The thresholds are fixed in `config/analysis.yaml`; the pre-registration may tighten them, never loosen them.

---

## 9. Reproduce

```bash
# from the pack root; the recompute scripts are in tools/compare/recompute/
python -I tools/compare/compare_mkar1_ttest.py tools/compare/recompute python/src/casefile_engine/data/v2_inputs/engine_cases.json /tmp/compare_out.json
python -I tools/compare/leftover_memory_check.py tools/compare/recompute tools/compare /tmp/leftover_out.json
python -I tools/compare/recompute/rt_pool.py tools/compare/recompute
python -I tools/compare/check_v2_goldens.py python/src/casefile_engine/data/v2_inputs/engine_cases.json examples/golden/engine_cases.json /tmp/check.json
python -I tools/decide/decide_mkar1.py /tmp/decide_mkar1_out.json 4000
python -I tools/decide/v3_reference_values.py tools/decide /tmp/v3_reference_values_out.json
python -I tools/decide/decide_leftover.py /tmp/decide_leftover_out.json 1000
# boundary files: see the URLs in support_cells.py's docstring and 02_DATA.md §7.1
python -I tools/decide/support_split.py <gb_bgd_adm1.geojson> <ne_50m_admin0.geojson> <ne_10m_admin1.geojson> /tmp/support_split_out.json tools/decide
```

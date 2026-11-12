# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Golden files for the asserted golden tests (docs/07_TESTS.md G-01…G-09). Reference only."""
from __future__ import annotations

import json
from pathlib import Path
import math

import numpy as np
from scipy import stats

from . import stats as R
from . import layer as L
from . import base as M

V2 = M.ROOT.parent / "_v2_golden"     # optional: v2 golden inputs are copied in by the packaging script


def _v2(name):
    p = Path(__file__).resolve().parent / "data/v2_inputs" / name
    return json.load(open(p, encoding="utf-8"))


def engine_expected(t, x):
    t = np.asarray(t, float); x = np.asarray(x, float)
    r = R.mk_ar1(t, x, M.MULT)
    tt = R.ttest_neff(t, x)
    try:
        pt = L.pettitt([int(v) for v in t], list(x), 0.05)
    except Exception:  # noqa: BLE001
        pt = None
    nz, np_ = R.p_from_var(r["mk"]["S"], r["mk"]["varS"])
    return {"mk": r["mk"], "ar1": {"phiRaw": r["phiRaw"], "phi": r["phi"], "vif": r["vif"]},
            "mkAr1": {"varSStar": r["varSStar"], "z": r["z"], "p": r["p"], "pKind": "mk_normal_cc"},
            "sen": {"slope": r["slope"], "intercept": r["intercept"], "ciLow": r["ciLow"], "ciHigh": r["ciHigh"], "multiplier": M.MULT,
                    "ciLowPlain": r["ciLowPlain"], "ciHighPlain": r["ciHighPlain"], "plainMultiplier": R.Z975, "nPairs": r["nPairs"]},
            "residSd": r["residSd"], "ttest": tt, "naive": {"z": nz, "p": np_}, "pettitt": pt}


def engine_cases():
    v2 = _v2("engine_cases.json")
    cases = []
    for c in v2["cases"]:
        yrs = c["years"]; vals = c["values"]
        keep = [k for k, v in enumerate(vals) if v is not None]
        if len(keep) < 4:
            cases.append({"id": c["id"], "years": yrs, "values": vals, "expected": None, "note": "fewer than 4 values: MK-AR1 not computed"})
            continue
        cases.append({"id": c["id"], "years": yrs, "values": vals,
                      "expected": engine_expected([yrs[k] for k in keep], [vals[k] for k in keep])})
    # new in v3
    t1 = list(range(1980, 1990)) + list(range(2000, 2010))
    cases.append({"id": "gap_decade_removed", "years": t1, "values": [round(0.1 * (y - 1980), 10) for y in t1],
                  "note": "actual years give 0.1 a year; index spacing would give 0.1588 (v3 6.3 r11)",
                  "expected": engine_expected(t1, [0.1 * (y - 1980) for y in t1])})
    g = [1.2, 1.5, 1.4, 2.1, 2.3, 2.0, 2.8, 3.1, 3.0, 3.5]
    e = engine_expected(list(range(2001, 2011)), g)
    e["kendallExactP"] = float(stats.kendalltau(np.arange(10), g).pvalue)
    e["kendallExactPKind"] = "kendall_exact"
    cases.append({"id": "gld01", "years": list(range(2001, 2011)), "values": g,
                  "note": "Gemini GLD-01: SciPy's exact Kendall p (kendall_exact) differs from the MK normal approximation (mk_normal_cc)", "expected": e})
    s6 = [1, 2, 3, 4, 5, 6, 7, 500, 9, 10.0]
    cases.append({"id": "syn06_outlier", "years": list(range(2001, 2011)), "values": s6, "expected": engine_expected(list(range(2001, 2011)), s6)})
    s7 = [0, 0, 0, 0, 0, 2, 0, 5, 8, 12.0]
    cases.append({"id": "syn07_many_ties", "years": list(range(2001, 2011)), "values": s7, "expected": engine_expected(list(range(2001, 2011)), s7)})
    lf = [0.1 * y + 3 for y in range(1990, 2015)]
    cases.append({"id": "line_float_noise", "years": list(range(1990, 2015)), "values": lf,
                  "note": "a perfect line with floating-point noise: residuals count as zero (03 §4.5)", "expected": engine_expected(list(range(1990, 2015)), lf)})
    return {"meta": {"generator": "casefile_engine.stats", "rules": "docs/03_SCIENCE.md §3–§4, §6.5",
                     "multiplier": M.MULT, "pKinds": {"mk_normal_cc": "Mann–Kendall normal approximation with continuity correction",
                                                       "kendall_exact": "scipy.stats.kendalltau exact p"},
                     "tolerances": "docs/07_TESTS.md §1"}, "cases": cases}


def aggregate_cases():
    v2 = _v2("aggregate_cases.json")
    keep = [c for c in v2["cases"] if c["rule"] in ("mean", "sum") and c["season"] in ("ANN", "DJF", "MAM", "JJA", "JJAS")]
    cases = []
    for c in keep:
        r = L.annual_values(c["start"], c["monthly"], c["season"], c["rule"], c["from"], c["to"])
        cases.append({**{k: c[k] for k in ("id", "start", "monthly", "season", "rule", "from", "to")}, "expected": r})
    base = keep[0]
    for rule in ("mean", "sum"):
        r = L.annual_values(base["start"], base["monthly"], "ON", rule, base["from"], base["to"])
        cases.append({"id": f"ON_{rule}", "start": base["start"], "monthly": base["monthly"], "season": "ON", "rule": rule,
                      "from": base["from"], "to": base["to"], "expected": r})
    # warm months dropped in later years: no cooling may appear (v3 D7)
    clim = [20.8, 21.6, 22.9, 25.2, 27.0, 28.3, 29.1, 28.4, 27.2, 25.0, 22.8, 21.6]
    monthly = []
    for y in range(2000, 2020):
        for m in range(12):
            v = clim[m]
            if y >= 2010 and m in (6, 7):            # July and August missing in the second decade
                v = None
            monthly.append(v)
    r = L.annual_values("2000-01", monthly, "ANN", "mean", 2000, 2019)
    vals = [v for v in r["values"] if v is not None]
    naive = []
    for k, y in enumerate(range(2000, 2020)):
        ms = [monthly[k * 12 + m] for m in range(12) if monthly[k * 12 + m] is not None]
        naive.append(float(np.mean(ms)))
    cases.append({"id": "warm_months_dropped", "start": "2000-01", "monthly": monthly, "season": "ANN", "rule": "mean", "from": 2000, "to": 2019,
                  "expected": {**r, "senSlopePerYear": R.sen_slope(np.arange(2000, 2020), np.array(vals))[0],
                               "naiveMonthMeanSlopePerYear": R.sen_slope(np.arange(2000, 2020), np.array(naive))[0]},
                  "note": "the anomaly method keeps the yearly value flat; a plain mean of the available months would fall"})
    units = [{"id": "prectotcorr_to_mm_per_day", "input": 1.0, "units": "kg m-2 s-1", "expected": 86400.0, "note": "× 86 400, never × 86 400 000"},
             {"id": "imerg_to_mm_per_day", "input": 1.0, "units": "mm/hr", "expected": 24.0},
             {"id": "uni01_2020_total", "input_mm_per_hr": 1.0, "year": 2020, "expected": 24.0 * sum(L.days_in(2020, m) for m in range(1, 13))},
             {"id": "uni01_2021_total", "input_mm_per_hr": 1.0, "year": 2021, "expected": 24.0 * sum(L.days_in(2021, m) for m in range(1, 13))}]
    return {"meta": {"generator": "casefile_engine.layer.annual_values", "rules": "docs/03_SCIENCE.md §2",
                     "note": "v2 cases for the mean and sum rules are kept unchanged; count, single-month and custom seasons are not in the first release"},
            "cases": cases, "units": units}


def families_cases():
    gld02 = list(np.r_[np.full(5, 0.0005), np.linspace(0.04, 0.99, 95)])
    out = []
    for name, p, m in (("holm_basic", [0.01, 0.04, 0.03, 0.005], 4), ("holm_m_larger", [0.01, 0.04, 0.03], 6),
                       ("holm_missing_as_one", [0.001, None, 0.02], 3)):
        out.append({"id": name, "method": "holm", "p": p, "m": m, "expected": R.holm(p, m).tolist()})
    for name, p, m in (("bh_basic", [0.01, 0.04, 0.03, 0.005, 0.2, None, 0.5], 7), ("bh_m_larger", [0.01, 0.02], 5)):
        out.append({"id": name, "method": "bh", "p": p, "m": m, "expected": R.benjamini_hochberg(p, m).tolist()})
    q = R.benjamini_hochberg(gld02, 100)
    out.append({"id": "gld02", "method": "bh", "p": gld02, "m": 100, "expected_rejections_q05": int((q < 0.05).sum()),
                "naive_rejections_p05": int((np.array(gld02) < 0.05).sum()), "note": "Gemini GLD-02: BH rejects 5; naive p < 0.05 gives 6"})
    return {"meta": {"rules": "docs/03_SCIENCE.md §7.1–§7.2", "missing": "missing tests enter with p = 1"}, "cases": out}


def domain_cases(tables):
    cal = tables["calibration"]
    pm = {n: L.phi_max_for(n, cal, M.CFG["domain"]["max_false_alarm_pct"]) for n in (20, 25, 46)}
    def checks(variable="air_temp", season="ANN", n=30, missing=0, phi=0.2, left=-0.1, crit=0.0, p=0.04):
        years = list(range(2026 - n - missing, 2026))
        vals = [1.0] * len(years)
        for k in range(missing):
            vals[k + 1] = None
        st = {"ar1": {"phi": phi}, "mkAr1": {"p": p}, "leftover": {"stat": left, "critical": crit, "passed": left <= crit}}
        cfg = {**M.CFG, "domain": {**M.CFG["domain"], "variables": M.BASE_VARIABLES}}   # independent of variables added later
        dom, reason, _ = L.domain_checks(variable, season, years, vals, st, cfg, tables, M.SECONDARY)
        return {"input": {"variable": variable, "season": season, "nComplete": n, "missingYears": missing, "phi": phi,
                          "leftoverStat": left, "leftoverCritical": crit, "p": p},
                "expected": {"inDomain": dom["inDomain"], "reason": reason, "failed": [c["id"] for c in dom["checks"] if not c["passed"]]}}
    cases = {"in_domain": checks(), "d1_variable": checks(variable="soil_moisture"), "d2_season": checks(season="SON"),
             "d3_short_record": checks(n=18), "d3_too_short": checks(n=12), "d4_missing_year": checks(n=29, missing=1),
             "d5_memory": checks(phi=0.95), "d6_leftover": checks(left=0.2, crit=0.0), "d7_not_finite": checks(p=float("nan")),
             "precedence_d3_before_d5": checks(n=18, phi=0.95), "precedence_d4_before_d6": checks(n=29, missing=1, left=0.2)}
    return {"meta": {"rules": "docs/03_SCIENCE.md §5.1", "phiMaxFromExampleTables": pm,
                     "note": "uses examples/methods/tables.json; with the engine's full tables, phi_max values change but the precedence does not"},
            "cases": cases}


def robustness_cases():
    rng = R.rng_for("robustness|||")
    years = list(range(1980, 2026))
    x = list(0.02 * (np.arange(46)) + 0.25 * R.ar1(rng, 46, 0.2))
    main = R.mk_ar1(np.array(years, float), np.array(x))
    loo = L.loo(years, x, 0.05, main["p"])
    w = L.alt_windows(years, x, 1980, 2025, M.CFG["robustness"]["windows"], 1980, 2025, main["slope"], main["p"], 0.05, 20)
    y2 = [0.0] * 30 + list(0.05 * np.arange(16))
    y2 = [v + 0.02 * e for v, e in zip(y2, R.ar1(rng, 46, 0.2))]
    m2 = R.mk_ar1(np.array(years, float), np.array(y2))
    w2 = L.alt_windows(years, y2, 1980, 2025, M.CFG["robustness"]["windows"], 1980, 2025, m2["slope"], m2["p"], 0.05, 20)
    cov = [1.0] * 20 + [0.95, 0.9, 0.85, 0.8, 0.78, 0.75, 0.72, 0.7, 0.7, 0.7]
    cc = L.coverage_check(list(range(1996, 2026)), cov, 0.05, 0.2)
    brk = L.break_notes("rain_imerg", 1998, 2024, M.BREAKS, [], "x", 2)
    brk2 = L.break_notes("rain_imerg", 1998, 2024, M.BREAKS, [{"case": "x", "break": "imerg_trmm_to_gpm_2014", "outcome": "step_seen", "reviewer": "A", "note": "n"}], "x", 2)
    return {"meta": {"rules": "docs/03_SCIENCE.md §6"},
            "cases": [{"id": "loo_and_windows_steady", "years": years, "values": x, "mainP": main["p"], "expected": {"loo": loo, "windows": w}},
                      {"id": "windows_late_trend", "years": years, "values": y2, "mainP": m2["p"], "expected": {"windows": w2}},
                      {"id": "coverage_drift", "years": list(range(1996, 2026)), "coverage": cov, "expected": cc},
                      {"id": "break_unreviewed", "variable": "rain_imerg", "window": [1998, 2024], "reviews": [], "expected": brk},
                      {"id": "break_step_seen", "variable": "rain_imerg", "window": [1998, 2024], "expected": brk2}]}


def contrast_cases():
    rng = np.random.default_rng(3)
    t = np.arange(30)
    a = 0.03 * t + R.ar1(rng, 30, 0.3)
    b = -0.01 * t + R.ar1(rng, 30, 0.3)
    sa, sb, sd = (float(stats.theilslopes(v, t).slope) for v in (a, b, a - b))
    yrs = list(range(1990, 2020))
    A = [1.0 + 0.02 * k for k in range(30)]
    B = [2.0 - 0.01 * k for k in range(30)]
    B[5] = None
    d = [None if (x is None or y is None) else x - y for x, y in zip(A, B)]
    return {"meta": {"rules": "docs/03_SCIENCE.md §2.5, §8.5"},
            "cases": [{"id": "sen_of_difference_is_not_difference_of_sens", "seed": 3, "generator": "numpy default_rng(3); AR(1) 0.3 as rt_check2.py",
                       "a": a.tolist(), "b": b.tolist(),
                       "expected": {"senA": sa, "senB": sb, "senA_minus_senB": sa - sb, "sen_of_A_minus_B": sd}},
                      {"id": "difference_missing_year", "years": yrs, "a": A, "b": B, "expected": {"difference": d, "missingYears": [1995]}}]}


def leftover_cases(tables):
    out = []
    for name, kind, m, n in (("ar1_0.3_m5", "ar1", 5, 30), ("ar2_m5", "ar2", 5, 30), ("single_series", "ar1", 1, 30)):
        rng = R.rng_for(f"leftover_golden|{name}||")
        cells = np.array([(R.ar1(rng, n, 0.3) if kind == "ar1" else R.ar2(rng, n, 0.15, 0.65)) for _ in range(m)])
        r = R.leftover_stat(np.arange(n, dtype=float), cells)
        out.append({"id": name, "years": list(range(1990, 1990 + n)), "cells": cells.tolist(), "expected": r})
    look = [{"n": 33, "mEff": 7.4, "phi": 0.27, "expected": {"nRow": 30, "mEffStep": 5, "phiBelow": 0.2, "phiAbove": 0.3, "weightAbove": 0.7,
             "critical": R.leftover_critical(33, 7.4, 0.27, tables["leftoverCritical"])}},
            {"n": 46, "mEff": 0.8, "phi": 0.93, "expected": {"nRow": 46, "mEffStep": 1, "phiBelow": 0.8, "phiAbove": 0.8, "weightAbove": 0.0,
             "critical": R.leftover_critical(46, 0.8, 0.93, tables["leftoverCritical"])}}]
    return {"meta": {"rules": "docs/03_SCIENCE.md §5.3", "criticalFrom": "examples/methods/tables.json (example repetitions)"},
            "cases": out, "lookups": look}


def rasterize_cases():
    v2 = _v2("rasterize_cases.json")
    native = []
    for bbox in ([88.0, 20.5, 92.7, 26.7], [1.0, 4.0, 4.0, 6.5]):
        cw, area = M.box_weights(bbox, M.MERRA2)
        native.append({"grid": "merra2_native", "bbox": bbox, "nCells": len(cw), "areaKm2": round(area, 3), "firstCells": cw[:4],
                       "lastCells": cw[-2:], "effectiveCells": round(sum(c[2] for c in cw), 4)})
    return {"meta": {"rule": "02_DATA §7.3 box rule (exact overlap in sin(lat) × lon); fractions rounded to 4 decimals",
                     "earth_area_km2": 510065881.0}, "cases": v2["cases"], "native": native}


def power_cases():
    def wh(slope, sd, phi):
        if slope == 0 or sd == 0:
            return None
        return (math.sqrt(12) * 3.3 * sd / abs(slope) * math.sqrt((1 + phi) / (1 - phi))) ** (2 / 3)
    rng = R.rng_for("power_golden|30|0.3|0.05")
    t = np.arange(30, dtype=float) + 1990
    hits = sum(R.mk_ar1(t, 0.05 * (t - t[0]) + R.ar1(rng, 30, 0.3))["p"] < 0.05 for _ in range(200))
    return {"meta": {"rules": "docs/03_SCIENCE.md §9.4; Weatherhead is a labelled fallback on the Methods page only"},
            "weatherhead": [{"slope": 0.02, "sd": 0.3, "phi": 0.2, "expected": wh(0.02, 0.3, 0.2)},
                            {"slope": 0.0, "sd": 0.3, "phi": 0.2, "expected": None},
                            {"slope": 0.01, "sd": 0.5, "phi": 0.0, "expected": wh(0.01, 0.5, 0.0)}],
            "simulated": [{"n": 30, "phi": 0.3, "effectSdPerYear": 0.05, "reps": 200, "seedText": "power_golden|30|0.3|0.05",
                           "expectedPowerPct": round(100 * hits / 200, 2)}]}


def build_all(tables):
    G = M.GOLD
    G.mkdir(parents=True, exist_ok=True)
    M.write_json("golden/engine_cases.json", engine_cases())
    M.write_json("golden/aggregate_cases.json", aggregate_cases())
    M.write_json("golden/families_cases.json", families_cases())
    M.write_json("golden/domain_cases.json", domain_cases(tables))
    M.write_json("golden/robustness_cases.json", robustness_cases())
    M.write_json("golden/contrast_cases.json", contrast_cases())
    M.write_json("golden/leftover_cases.json", leftover_cases(tables))
    M.write_json("golden/rasterize_cases.json", rasterize_cases())
    M.write_json("golden/power_cases.json", power_cases())
    fc = _v2("format_cases.json")
    fc["meta"] = {"reference": "the Python engine (03_SCIENCE §12.3): Decimal ROUND_HALF_UP on the exact binary value", "unchanged_from": "v2"}
    M.write_json("golden/format_cases.json", fc)

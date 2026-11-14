# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Past-against-present values and exploration trends for one region series (casefile-pipeline explore).

Everything here is labelled exploration and is never a verdict:
- anomalies against a baseline period (`baseline_years`): the yearly value, and each month with the seasonal cycle
  removed (the month's own baseline mean subtracted);
- the first and the last ten years of the record (`decade_years`) and their difference;
- a trailing 10-year mean;
- a trend test with the engine's own functions (casefile_engine.layer.core_stats: Mann–Kendall allowing for
  year-to-year memory, Sen slope and its 95% range), on the yearly values and on each calendar month, with the
  screening map's rules: at least `domain.min_years_exploratory` years, no missing year inside the window, memory φ
  within the validated range for that length (casefile_engine.layer.phi_max_for); a Pettitt jump is a flag only.
  The false-discovery adjustment across places (Benjamini–Hochberg at the map's q) is applied by the caller.
"""
from __future__ import annotations

import math

import numpy as np

from casefile_engine import layer as L
from casefile_engine import stats as R
from casefile_engine.base import CFG, VARS

STANDARD_NORMAL = (1991, 2020)      # the WMO climatological standard normal
LATE_NORMAL = (2001, 2020)          # for records that start in 2000 (GLDAS, MODIS)
DECADE = 10
MIN_YEARS = int(CFG["domain"]["min_years_exploratory"])
MAX_FALSE_ALARM = float(CFG["domain"]["max_false_alarm_pct"])
MAP_Q = float(CFG["map"]["fdr_q"])
PETTITT_ALPHA = float(CFG["robustness"]["pettitt_alpha"])
MIN_SHARE = 0.8                     # a period mean needs values in at least 80% of its years

_CAL = None


def calibration() -> list:
    """The engine's shipped methods tables (calibration rows), loaded once."""
    global _CAL
    if _CAL is None:
        from casefile_engine.bundle import sim_tables

        _CAL = sim_tables()["calibration"]
    return _CAL


def descriptive(variable: str) -> bool:
    """A storage variable stays descriptive (its record card): no trend test."""
    rc = VARS[variable].get("record_card", {})
    return "descriptive" in str(rc.get("observation_or_model", {}).get("en", "")).lower()


def baseline_years(first: int, last: int) -> tuple[int, int] | None:
    for a, b in (STANDARD_NORMAL, LATE_NORMAL):
        if first <= a and last >= b:
            return a, b
    return None


def decade_years(first: int, last: int) -> tuple[tuple[int, int], tuple[int, int]] | None:
    if last - first + 1 < 2 * DECADE:
        return None
    return (first, first + DECADE - 1), (last - DECADE + 1, last)


def digits(values) -> int:
    """Decimals that keep about five significant digits for the largest value."""
    x = np.asarray([v for v in np.ravel(values) if v is not None and np.isfinite(v)], dtype=float)
    top = float(np.max(np.abs(x))) if x.size else 1.0
    return int(min(6, max(1, 5 - math.ceil(math.log10(max(top, 1e-9))))))


def rnd(x, d: int):
    if x is None:
        return None
    x = float(x)
    return round(x, d) if math.isfinite(x) else None


def period_mean(years: np.ndarray, values: np.ndarray, a: int, b: int) -> float | None:
    sel = (years >= a) & (years <= b)
    v = values[sel]
    v = v[np.isfinite(v)]
    return float(v.mean()) if v.size >= MIN_SHARE * (b - a + 1) else None


def trend(years: np.ndarray, values: np.ndarray, variable: str) -> dict:
    """The engine's trend statistics for one yearly series, with the screening map's testability rules."""
    ok = np.isfinite(values)
    out = {"testable": False, "reason": None, "exploratory": False, "n": int(ok.sum()), "first": None, "last": None,
           "ratePerDecade": None, "lowPerDecade": None, "highPerDecade": None, "p": None, "q": None, "standsOut": False,
           "phi": None, "jumpYear": None}
    if descriptive(variable):
        out["reason"] = "descriptive"
        return out
    if ok.sum() < MIN_YEARS:
        out["reason"] = "too_short"
        return out
    idx = np.where(ok)[0]
    y0, y1 = int(years[idx[0]]), int(years[idx[-1]])
    out["first"], out["last"] = y0, y1
    if (~ok[idx[0]: idx[-1] + 1]).any():
        out["reason"] = "missing_year"
        return out
    t, x = years[ok].astype(float), values[ok]
    if float(np.ptp(x)) == 0.0:                       # the same value every year (no snow in the tropics): nothing to test
        out["reason"] = "constant"
        return out
    st = L.core_stats(t, list(x))
    phi = float(st["ar1"]["phi"])
    out["phi"] = round(phi, 3)
    p = st["mkAr1"]["p"]
    if p is None or not math.isfinite(p):
        out["reason"] = "not_finite"
        return out
    if phi > L.phi_max_for(len(x), calibration(), MAX_FALSE_ALARM) + 1e-12:
        out["reason"] = "phi_out_of_range"
        return out
    ch = st["change"]
    out.update(testable=True, reason="ok", exploratory=len(x) < int(CFG["domain"]["min_years_verdict"]),
               ratePerDecade=ch["ratePerDecade"], lowPerDecade=ch["rateLowPerDecade"], highPerDecade=ch["rateHighPerDecade"], p=float(p))
    pt = L.pettitt(list(t.astype(int)), list(x), PETTITT_ALPHA)
    if pt and pt.get("flagged"):
        out["jumpYear"] = int(pt["year"]) if pt.get("year") is not None else None
    return out


def series_payload(variable: str, start: str, first: int, last: int, monthly: np.ndarray, annual: list) -> dict:
    """The past-against-present block of one region and variable (monthly in the variable's monthly units)."""
    years = np.arange(first, last + 1)
    ann = np.array([np.nan if v is None else v for v in annual], dtype=float)
    mon = np.full((len(years), 12), np.nan)
    m = monthly[: len(years) * 12]
    mon.flat[: m.size] = m
    d = digits(ann)
    dm = digits(mon)
    out: dict = {"baseline": None, "annualAnomaly": None, "monthlyAnomaly": None, "rolling10": None, "decades": None}
    base = baseline_years(first, last)
    if base:
        b_ann = period_mean(years, ann, *base)
        sel = (years >= base[0]) & (years <= base[1])
        b_mon = [float(np.nanmean(mon[sel, k])) if np.isfinite(mon[sel, k]).sum() >= MIN_SHARE * sel.sum() else np.nan for k in range(12)]
        out["baseline"] = list(base)
        out["annualAnomaly"] = [rnd(v - b_ann, d) if (b_ann is not None and math.isfinite(v)) else None for v in ann]
        out["monthlyAnomaly"] = [[rnd(mon[i, k] - b_mon[k], dm) if math.isfinite(mon[i, k]) and math.isfinite(b_mon[k]) else None
                                  for k in range(12)] for i in range(len(years))]
    roll = []
    for i in range(len(years)):
        w = ann[max(0, i - DECADE + 1): i + 1]
        w = w[np.isfinite(w)]
        roll.append(rnd(w.mean(), d) if i >= DECADE - 1 and w.size >= MIN_SHARE * DECADE else None)
    out["rolling10"] = roll
    dec = decade_years(first, last)
    if dec:
        (a0, a1), (b0, b1) = dec
        e, late = period_mean(years, ann, a0, a1), period_mean(years, ann, b0, b1)
        em = [period_mean(years, mon[:, k], a0, a1) for k in range(12)]
        lm = [period_mean(years, mon[:, k], b0, b1) for k in range(12)]
        out["decades"] = {"early": {"from": a0, "to": a1, "mean": rnd(e, d), "monthly": [rnd(x, dm) for x in em]},
                          "late": {"from": b0, "to": b1, "mean": rnd(late, d), "monthly": [rnd(x, dm) for x in lm]},
                          "change": rnd(late - e, d) if e is not None and late is not None else None,
                          "changeMonthly": [rnd(y - x, dm) if x is not None and y is not None else None for x, y in zip(em, lm)]}
    tr = trend(years, ann, variable)
    out["trend"] = {k: (rnd(v, digits([abs(tr["ratePerDecade"] or 0), abs(tr["highPerDecade"] or 0)]) + 2)
                        if k in ("ratePerDecade", "lowPerDecade", "highPerDecade") else v) for k, v in tr.items()}
    if out["trend"]["p"] is not None:
        out["trend"]["p"] = float(f"{out['trend']['p']:.4g}")
    mt = []
    for k in range(12):
        t_k = trend(years, mon[:, k], variable)
        mt.append({"testable": t_k["testable"], "reason": t_k["reason"],
                   "ratePerDecade": rnd(t_k["ratePerDecade"], dm + 2) if t_k["ratePerDecade"] is not None else None,
                   "p": float(f"{t_k['p']:.4g}") if t_k["p"] is not None else None, "q": None, "standsOut": False})
    ps = [x["p"] for x in mt if x["testable"]]
    if ps:
        qs = iter(R.benjamini_hochberg(np.array(ps), len(ps)))
        for x in mt:
            if x["testable"]:
                x["q"] = float(f"{next(qs):.4g}")
                x["standsOut"] = bool(x["q"] < MAP_Q)
    out["monthTrends"] = mt
    return out


def adjust_across(payloads: list[dict]) -> int:
    """Benjamini–Hochberg across places for one variable (the screening map's q); returns how many stand out."""
    test = [p["trend"] for p in payloads if p.get("trend") and p["trend"]["testable"]]
    if not test:
        return 0
    qs = R.benjamini_hochberg(np.array([t["p"] for t in test]), len(test))
    n = 0
    for t, q in zip(test, qs):
        t["q"] = float(f"{q:.4g}")
        t["standsOut"] = bool(q < MAP_Q)
        n += t["standsOut"]
    return n

# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reference implementation of the verdict layer of docs/03_SCIENCE.md (§2, §5–§8, §12): aggregation,
domain checks, robustness, families, verdicts, contrasts, line-ups, the screening map and verdict text.
Evidence for the golden values and examples; not the product engine (never import it from python/src/)."""
from __future__ import annotations

import calendar
import math

import numpy as np
import pyhomogeneity
from scipy import stats

from . import stats as R

SEASON_MONTHS = {"ANN": list(range(1, 13)), "DJF": [12, 1, 2], "MAM": [3, 4, 5], "JJAS": [6, 7, 8, 9],
                 "ON": [10, 11], "JJA": [6, 7, 8], "SON": [9, 10, 11]}


# ============================================================================ §2 aggregation (pipeline rules)
def days_in(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def month_index(start: str, year: int, month: int) -> int:
    y0, m0 = int(start[:4]), int(start[5:7])
    return (year - y0) * 12 + (month - m0)


def annual_values(start: str, monthly, season: str, rule: str, first: int, last: int, ann_min_months: int = 10) -> dict:
    monthly = [None if v is None else float(v) for v in monthly]

    def get(y, m):
        k = month_index(start, y, m)
        if 0 <= k < len(monthly):
            v = monthly[k]
            return None if v is None or not math.isfinite(v) else v
        return None

    months = SEASON_MONTHS[season]
    wraps = season == "DJF"
    clim = {}
    if season == "ANN" and rule == "mean":
        for m in range(1, 13):
            vals = [get(y, m) for y in range(first, last + 1)]
            vals = [v for v in vals if v is not None]
            clim[m] = float(np.mean(vals)) if vals else None
    years, values, used = [], [], []
    for y in range(first, last + 1):
        ym = [((y - 1) if (wraps and m == 12) else y, m) for m in months]
        xs = [(yy, m, get(yy, m)) for yy, m in ym]
        valid = [(yy, m, v) for yy, m, v in xs if v is not None]
        years.append(y)
        used.append(len(valid))
        if rule == "sum":
            values.append(sum(v * days_in(yy, m) for yy, m, v in valid) if len(valid) == len(months) else None)
            continue
        if len(valid) == len(months):
            d = [days_in(yy, m) for yy, m, _ in valid]
            values.append(sum(di * v for di, (_, _, v) in zip(d, valid)) / sum(d))
        elif season == "ANN" and len(valid) >= ann_min_months and all(clim.get(m) is not None for m in range(1, 13)):
            d_all = [days_in(y, m) for m in range(1, 13)]
            base = sum(di * clim[m] for di, m in zip(d_all, range(1, 13))) / sum(d_all)
            dv = [days_in(yy, m) for yy, m, _ in valid]
            anom = sum(di * (v - clim[m]) for di, (_, m, v) in zip(dv, valid)) / sum(dv)
            values.append(base + anom)
        else:
            values.append(None)
    return {"years": years, "values": values, "monthsUsed": used}


# ============================================================================ §5 domain
def phi_max_for(n: int, calibration: list[dict], max_pct: float) -> float:
    ns = sorted({r["n"] for r in calibration})
    nn = max([v for v in ns if v <= n] or [ns[0]])
    rows = sorted([r for r in calibration if r["n"] == nn], key=lambda r: r["phi"])
    best = -1.0
    for r in rows:
        if r["falseAlarmPct"] <= max_pct:
            best = r["phi"]
        else:
            break
    return best


def core_stats(years, values, cells=None, cfg=None, tables=None, multiplier=R.MULTIPLIER) -> dict:
    """MK-AR1, Sen, change, t-test, naive and leftover for the finite values of a window."""
    years = np.asarray(years)
    vals = np.array([np.nan if v is None else v for v in values], dtype=float)
    ok = np.isfinite(vals)
    t, x = years[ok].astype(float), vals[ok]
    r = R.mk_ar1(t, x, multiplier)
    tt = R.ttest_neff(t, x)
    span = int(t.max() - t.min()) if len(t) else 0
    b = r["slope"]
    change = {"ratePerDecade": 10 * b, "rateLowPerDecade": 10 * r["ciLow"], "rateHighPerDecade": 10 * r["ciHigh"],
              "total": b * span, "totalLow": r["ciLow"] * span, "totalHigh": r["ciHigh"] * span, "span": span,
              "units": "", "percent": None, "baseline": None, "residSd": r["residSd"],
              "snr": (abs(b * span) / r["residSd"]) if r["residSd"] > 0 else None}
    naive_z, naive_p = R.p_from_var(r["mk"]["S"], r["mk"]["varS"])
    out = {"n": int(len(x)),
           "mk": {k: r["mk"][k] for k in ("S", "varS", "tau", "z", "p", "pKind")},
           "ar1": {"phiRaw": r["phiRaw"], "phi": r["phi"], "vif": r["vif"], "estimator": "ar1_regression_consecutive"},
           "mkAr1": {"varSStar": r["varSStar"], "z": r["z"], "p": r["p"] if math.isfinite(r["p"]) else None, "pKind": "mk_normal_cc"},
           "sen": {"slopePerYear": b, "intercept": r["intercept"], "ciLowPerYear": r["ciLow"], "ciHighPerYear": r["ciHigh"],
                   "multiplier": multiplier, "nPairs": r["nPairs"]},
           "change": change, "ttest": tt, "naive": {"z": naive_z, "p": naive_p, "label": "naive_ignores_memory"}, "leftover": None}
    if cells is not None and tables is not None:
        cells = np.asarray(cells, dtype=float)[:, ok]
        lo = R.leftover_stat(t, cells, lags=tuple(cfg["domain"]["leftover"]["lags"]), max_cells=cfg["domain"]["leftover"]["max_cells"])
        crit = R.leftover_critical(len(x), lo["mEff"], lo["phiCells"], tables["leftoverCritical"])
        out["leftover"] = {"stat": lo["stat"], "m": lo["m"], "mEff": lo["mEff"], "mEffStep": R.m_eff_step(lo["mEff"]),
                           "rhoBar": lo["rhoBar"], "phiCells": lo["phiCells"], "critical": crit, "passed": bool(lo["stat"] <= crit),
                           "source": "contributing_cells"}
    return out


def domain_checks(variable, season, years, values, st, cfg, tables, prereg_seasons, d6_override=None):
    dom = cfg["domain"]
    vals = [v for v in values]
    n_complete = sum(1 for v in vals if v is not None and math.isfinite(v))
    missing = [y for y, v in zip(years, vals) if v is None or not math.isfinite(v)]
    phi_max = phi_max_for(n_complete, tables["calibration"], dom["max_false_alarm_pct"])
    checks = [
        {"id": "D1", "passed": variable in dom["variables"], "value": variable, "limit": ", ".join(dom["variables"])},
        {"id": "D2", "passed": season == "ANN" or season in prereg_seasons, "value": season, "limit": "ANN or a pre-registered season"},
        {"id": "D3", "passed": n_complete >= dom["min_years_verdict"], "value": n_complete, "limit": dom["min_years_verdict"]},
        {"id": "D4", "passed": len(missing) == 0, "value": len(missing), "limit": 0},
        {"id": "D5", "passed": st["ar1"]["phi"] <= phi_max + 1e-12, "value": st["ar1"]["phi"], "limit": phi_max},
        {"id": "D6", "passed": True, "value": None, "limit": None},
        {"id": "D7", "passed": st["mkAr1"]["p"] is not None and math.isfinite(st["mkAr1"]["p"]), "value": None, "limit": None},
    ]
    if d6_override is not None:
        checks[5] = d6_override
    elif st.get("leftover") is not None:
        checks[5] = {"id": "D6", "passed": st["leftover"]["passed"], "value": st["leftover"]["stat"], "limit": st["leftover"]["critical"]}
    reason = None
    c = {k["id"]: k["passed"] for k in checks}
    if not c["D1"] or not c["D2"]:
        reason = "outside_domain"
    elif not c["D3"]:
        reason = "short_record" if n_complete >= dom["min_years_exploratory"] else "too_short"
    elif not c["D4"]:
        reason = "missing_year"
    elif not c["D5"] or not c["D6"]:
        reason = "outside_domain"
    elif not c["D7"]:
        reason = "not_testable"
    return {"inDomain": reason is None, "checks": checks}, reason, missing


# ============================================================================ §6 robustness
def loo(years, values, alpha, main_p) -> dict:
    t = np.asarray(years, dtype=float)
    x = np.asarray([np.nan if v is None else v for v in values], dtype=float)
    if np.sum(np.isfinite(x)) < 20 or main_p is None:
        return {"status": "skip", "year": None, "pMax": None, "pMin": None}
    ps = []
    for k in range(len(x)):
        if not np.isfinite(x[k]):
            continue
        keep = np.isfinite(x) & (np.arange(len(x)) != k)
        ps.append((int(t[k]), R.mk_ar1(t[keep], x[keep])["p"]))
    pmax = max(ps, key=lambda q: q[1])
    pmin = min(ps, key=lambda q: q[1])
    if main_p < alpha:
        if pmax[1] >= alpha:
            return {"status": "doubt", "year": pmax[0], "pMax": pmax[1], "pMin": pmin[1]}
        return {"status": "pass", "year": pmax[0], "pMax": pmax[1], "pMin": pmin[1]}
    if pmin[1] < alpha:
        return {"status": "note", "year": pmin[0], "pMax": pmax[1], "pMin": pmin[1]}
    return {"status": "pass", "year": pmin[0], "pMax": pmax[1], "pMin": pmin[1]}


def alt_windows(full_years, full_values, main_first, main_last, windows, rec_first, rec_last, main_slope, main_p, alpha, min_years):
    items = []
    lookup = dict(zip(full_years, full_values))
    for w in windows:
        f, l = main_first + w["start_shift"], main_last + w["end_shift"]
        ran = (l - f + 1) >= min_years and f >= rec_first and l <= rec_last
        item = {"id": w["id"], "first": f, "last": l, "ran": False, "ratePerDecade": None, "rateLowPerDecade": None,
                "rateHighPerDecade": None, "p": None, "agrees": None}
        if ran:
            ys = list(range(f, l + 1))
            vs = [lookup.get(y) for y in ys]
            if all(v is not None for v in vs):
                r = R.mk_ar1(np.array(ys, float), np.array(vs, float))
                agrees = bool(np.sign(r["slope"]) == np.sign(main_slope) and r["p"] < alpha)
                item.update({"ran": True, "ratePerDecade": 10 * r["slope"], "rateLowPerDecade": 10 * r["ciLow"],
                             "rateHighPerDecade": 10 * r["ciHigh"], "p": r["p"], "agrees": agrees})
        items.append(item)
    ran_items = [i for i in items if i["ran"]]
    agree = sum(1 for i in ran_items if i["agrees"])
    if not ran_items:
        status = "skip"
    elif main_p is not None and main_p < alpha and agree < 4:
        status = "doubt"
    else:
        status = "pass"
    return {"status": status, "agree": agree, "ran": len(ran_items), "items": items}


def coverage_check(years, coverage, alpha, min_range):
    if coverage is None:
        return {"status": "skip", "cmin": None, "cmax": None, "p": None}
    c = np.array([np.nan if v is None else v for v in coverage], float)
    ok = np.isfinite(c)
    if ok.sum() < 10:
        return {"status": "skip", "cmin": None, "cmax": None, "p": None}
    mk = R.mann_kendall(np.asarray(years)[ok], c[ok])
    cmin, cmax = float(np.nanmin(c)), float(np.nanmax(c))
    status = "doubt" if (mk["p"] < alpha and cmax - cmin >= min_range) else "pass"
    return {"status": status, "cmin": cmin, "cmax": cmax, "p": mk["p"]}


def break_notes(variable, first, last, breaks, reviews, case_key, margin):
    notes = []
    for b in breaks:
        if b["type"] != "data" or variable not in b.get("variables", []) or not b.get("date"):
            continue
        year = int(b["date"][:4])
        if not (first + margin <= year <= last - margin):
            continue
        rev = next((r for r in reviews if r["break"] == b["id"] and r["case"] == case_key), None)
        if rev is None or rev["outcome"] == "unclear":
            status = "unreviewed"
        elif rev["outcome"] == "step_seen":
            status = "step"
        else:
            status = "reviewed"
        notes.append({"id": b["id"], "year": year, "label": b["label"], "status": status,
                      "review": None if rev is None else {"outcome": rev["outcome"], "reviewer": rev["reviewer"], "note": rev["note"]}})
    return notes


def pettitt(years, values, alpha):
    x = np.asarray([v for v in values], dtype=float)
    res = pyhomogeneity.pettitt_test(x, alpha=alpha, sim=None)
    cp = int(res.cp)
    p = min(1.0, float(res.p))   # the analytic approximation 2·exp(−6U²/(n³+n²)) exceeds 1 when U is small (03 §6.5)
    return {"flagged": bool(p < alpha), "year": int(years[cp]) if 0 <= cp < len(years) else None,
            "U": float(res.U), "p": p, "method": "pyhomogeneity.pettitt_test(sim=None)"}


# ============================================================================ §8 grade, practical, overturn
def grade(p_adj, alpha, doubts, divisor=5, max_doubts=1):
    if p_adj is None:
        return "cant_tell_yet"
    if p_adj < alpha / divisor and not doubts:
        return "strong"
    if p_adj < alpha and len(doubts) <= max_doubts:
        return "supported"
    return "cant_tell_yet"


def practical_position(lo, hi, threshold):
    if threshold is None or lo is None or hi is None:
        return None
    if lo >= threshold or hi <= -threshold:
        return "exceeds"
    if lo > -threshold and hi < threshold:
        return "smaller"
    return "overlaps"


# ============================================================================ §12 text helpers
def season_phrase(rule, season, strings):
    s = strings["season"][season]
    if rule == "sum":
        return " (" + s["total"] + ")"
    if season == "ANN":
        return ""
    return " (" + s["short"] + ")"


def unit_text(units, strings):
    return strings["units"].get(units, units)


def num(x, d, units, strings, signed=True):
    s = R.signed(x, d) if signed else R.fixed(x, d)
    u = unit_text(units, strings)
    if not u:
        return s
    return s + ("" if u == "%" else " ") + u


def bn_if(lang, s):
    return R.to_bn(s) if lang == "bn" else s


def p_expr_lang(p, lang):
    return bn_if(lang, R.p_expr(p))

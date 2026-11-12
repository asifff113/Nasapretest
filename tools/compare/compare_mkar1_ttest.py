"""Compare the spec pack's MK-AR1, Sen interval and t-test (docs/03_SCIENCE.md v2 sections 4-6)
with the recompute scripts behind playbook v3 section 6.3 (sim_size.py, sim2.py, rt_check.py,
rt_check2.py), on exactly the same simulated series.

Usage:  python -I compare_mkar1_ttest.py <folder with the recompute scripts> <engine_cases.json> <out.json>

The recompute scripts generate each series from a seeded numpy Generator and never draw random
numbers inside a test, so every variant below sees the identical series the playbook used.
"""
import json
import sys
import time
from multiprocessing import Pool

import numpy as np
from scipy import stats

SCRIPTS = sys.argv[1]
sys.path.insert(0, SCRIPTS)
import sim_size as S          # noqa: E402  ar1, vi_bc_gpt, santer_t, mk_s_var, ar_factor, lag1
import rt_check as RT         # noqa: E402  gen (stress families)

Z975 = stats.norm.ppf(0.975)


# ----------------------------------------------------------------------------- spec pack v2 rules
def mk_s_var_ties(t, x):
    """S over pairs ordered by year; Var(S) with the tie correction (03_SCIENCE v2 section 4.1-4.2)."""
    o = np.argsort(t, kind="stable")
    x = np.asarray(x, float)[o]
    n = len(x)
    d = np.sign(x[None, :] - x[:, None])
    s = np.triu(d, 1).sum()
    _, counts = np.unique(x, return_counts=True)
    tie = np.sum(counts * (counts - 1) * (2 * counts + 5))
    return s, (n * (n - 1) * (2 * n + 5) - tie) / 18.0


def sen(t, x):
    t = np.asarray(t, float); x = np.asarray(x, float)
    i, j = np.triu_indices(len(x), 1)
    sl = np.sort((x[j] - x[i]) / (t[j] - t[i]))
    b = np.median(sl)
    a = np.median(x) - b * np.median(t)          # Conover intercept
    return b, a, sl


def lag1_pairs(t, r):
    """Lag-1 autocorrelation using only consecutive-year pairs (spec v2 section 4.3)."""
    t = np.asarray(t); r = np.asarray(r, float)
    n = len(r)
    rb = r.mean()
    den = np.sum((r - rb) ** 2)
    if den == 0:
        return 0.0
    pairs = np.where(np.diff(t) == 1)[0]
    if len(pairs) == 0:
        return 0.0
    num = np.sum((r[pairs] - rb) * (r[pairs + 1] - rb))
    phi = num / den
    if len(pairs) < n - 1:
        phi *= (n - 1) / len(pairs)
    return phi


def bias_correct(phi_hat, n, resid_var, lo=0.0, hi=0.95):
    if resid_var == 0:
        return 0.0
    if n >= 6:
        return float(np.clip((n * phi_hat + 2) / (n - 4), lo, hi))
    return float(np.clip(phi_hat, lo, hi))


def vif(n, phi):
    k = np.arange(1, n)
    return 1 + 2 * np.sum((1 - k / n) * phi ** k)


def p_cc(s, var):
    if var <= 0:
        return 1.0
    z = (s - np.sign(s)) / np.sqrt(var)
    return 2 * stats.norm.sf(abs(z))


def spec_phi_raw(t, x):
    b, a, _ = sen(t, x)
    r = np.asarray(x, float) - (a + b * np.asarray(t, float))
    return lag1_pairs(t, r), np.var(r, ddof=1) if len(r) > 1 else 0.0


def spec_mkar1(t, x, lo=0.0):
    n = len(x)
    s, var = mk_s_var_ties(t, x)
    ph, rv = spec_phi_raw(t, x)
    phi = bias_correct(ph, n, rv, lo=lo)
    f = vif(n, phi)
    return p_cc(s, var * f), phi, f


def script_phi(x):
    """GPT-6 Astra variant used by sim_size.vi_bc_gpt: dynamic OLS r, index time."""
    n = len(x); t = np.arange(n, dtype=float)
    X = np.column_stack([x[:-1], np.ones(n - 1), t[1:]])
    return np.linalg.lstsq(X, x[1:], rcond=None)[0][0]


def hybrid_script_phi_clip0(x):
    n = len(x)
    phi = float(np.clip((n * script_phi(x) + 2) / (n - 4), 0.0, 0.95))
    s, var = S.mk_s_var(x)
    return p_cc(s, var * vif(n, phi))


def spec_sen_ci(t, x, var_star, z):
    """Rank rule of scipy.stats.theilslopes with an inflated variance (spec v2 section 6)."""
    _, _, sl = sen(t, x)
    N = len(sl)
    C = z * np.sqrt(var_star)
    lo = max(int(np.round((N - C) / 2)) - 1, 0)
    hi = min(int(np.round((N + C) / 2)), N - 1)
    return sl[lo], sl[hi]


def script_sen_ci(x, var_star, z):
    """rt_check2.cover: linear interpolation at fractional ranks (N - C)/2 - 1 and (N + C)/2."""
    n = len(x); i, j = np.triu_indices(n, 1)
    sl = np.sort((x[j] - x[i]) / (j - i)); N = len(sl)
    C = z * np.sqrt(var_star)
    return np.interp((N - C) / 2 - 1, np.arange(N), sl), np.interp((N + C) / 2, np.arange(N), sl)


def spec_ttest(t, x):
    """OLS t-test with n_eff (spec v2 section 5): bias-corrected, clipped phi; unavailable if n_eff <= 3."""
    t = np.asarray(t, float); x = np.asarray(x, float); n = len(x)
    beta, alpha = np.polyfit(t, x, 1)
    e = x - (alpha + beta * t)
    sxx = np.sum((t - t.mean()) ** 2)
    s2 = np.sum(e ** 2) / (n - 2)
    se = np.sqrt(s2 / sxx)
    r1 = lag1_pairs(t, e)
    phi = bias_correct(r1, n, np.var(e, ddof=1))
    neff = n * (1 - phi) / (1 + phi)
    if neff <= 3:
        return None, phi, neff
    se_adj = se * np.sqrt((n - 2) / (neff - 2))
    if se_adj == 0:
        return 0.0, phi, neff
    tt = beta / se_adj
    return 2 * stats.t.sf(abs(tt), neff - 2), phi, neff


def ttest_raw_r1_unclipped_neff3(t, x):
    """Spec arithmetic but with the script's uncorrected, unclipped r1 (isolates the phi choice)."""
    t = np.asarray(t, float); x = np.asarray(x, float); n = len(x)
    beta, alpha = np.polyfit(t, x, 1); e = x - (alpha + beta * t)
    r1 = S.lag1(e)
    neff = n * (1 - r1) / (1 + r1)
    if neff <= 3:
        return None
    se = np.sqrt(np.sum(e ** 2) / (n - 2) / np.sum((t - t.mean()) ** 2)) * np.sqrt((n - 2) / (neff - 2))
    return 2 * stats.t.sf(abs(beta / se), neff - 2)


# ----------------------------------------------------------------------------- experiments
def size_job(args):
    n, phi, R, seed = args
    rng = np.random.default_rng(seed)       # identical stream to sim_size.run
    t = np.arange(n) + 1980
    c = dict(script_mkar1=0, spec_mkar1=0, script_phi_clip0=0, spec_phi_allow_negative=0,
             script_santer_t=0, spec_ttest=0, spec_ttest_unavailable=0, t_uncorrected_r1=0,
             mk_plain=0, phi_spec_mean=0.0, phi_script_mean=0.0)
    for _ in range(R):
        x = S.ar1(rng, n, phi)
        p_scr, f_scr = S.vi_bc_gpt(x)
        c["script_mkar1"] += p_scr < 0.05
        p_sp, ph_sp, _ = spec_mkar1(t, x)
        c["spec_mkar1"] += p_sp < 0.05
        c["phi_spec_mean"] += ph_sp
        c["phi_script_mean"] += float(np.clip((n * script_phi(x) + 2) / (n - 4), -0.95, 0.95))
        c["script_phi_clip0"] += hybrid_script_phi_clip0(x) < 0.05
        c["spec_phi_allow_negative"] += spec_mkar1(t, x, lo=-0.95)[0] < 0.05
        c["script_santer_t"] += S.santer_t(x) < 0.05
        pt, _, _ = spec_ttest(t, x)
        if pt is None:
            c["spec_ttest_unavailable"] += 1
        else:
            c["spec_ttest"] += pt < 0.05
        pu = ttest_raw_r1_unclipped_neff3(t, x)
        c["t_uncorrected_r1"] += (pu is not None and pu < 0.05)
        s, var = S.mk_s_var(x)
        c["mk_plain"] += p_cc(s, var) < 0.05
    out = {k: (round(100 * v / R, 2) if not k.startswith("phi_") else round(v / R, 4)) for k, v in c.items()}
    return {"n": n, "phi": phi, "R": R, "seed": seed, **out}


ZS = (1.96, 2.25)


def cover_job(args):
    n, phi, R, seed = args
    rng = np.random.default_rng(seed)       # identical stream to rt_check2.cover
    tt = np.arange(n); beta = 0.02; years = tt + 1980
    hits = {f"{m}_{z}": 0 for m in ("script", "spec", "spec_vif_interp") for z in ZS}
    for _ in range(R):
        x = beta * tt + S.ar1(rng, n, phi)
        _, f_scr = S.vi_bc_gpt(x)
        _, var_untied = S.mk_s_var(x)
        _, ph, f_sp = spec_mkar1(years, x)
        _, var_ties = mk_s_var_ties(years, x)
        for z in ZS:
            lo, hi = script_sen_ci(x, var_untied * f_scr, z); hits[f"script_{z}"] += lo <= beta <= hi
            lo, hi = spec_sen_ci(years, x, var_ties * f_sp, z); hits[f"spec_{z}"] += lo <= beta <= hi
            lo, hi = script_sen_ci(x, var_untied * f_sp, z); hits[f"spec_vif_interp_{z}"] += lo <= beta <= hi
    return {"n": n, "phi": phi, "R": R, "seed": seed, **{k: round(100 * v / R, 2) for k, v in hits.items()}}


def stress_job(args):
    kind, n, R, seed = args
    rng = np.random.default_rng(seed)       # identical stream to rt_check.run
    years = np.arange(n) + 1980
    c = dict(script_mkar1=0, spec_mkar1=0, script_santer_t=0, spec_ttest=0)
    for _ in range(R):
        x = RT.gen(kind, rng, n)
        c["script_mkar1"] += S.vi_bc_gpt(x)[0] < 0.05
        c["spec_mkar1"] += spec_mkar1(years, x)[0] < 0.05
        c["script_santer_t"] += S.santer_t(x) < 0.05
        pt = spec_ttest(years, x)[0]
        c["spec_ttest"] += (pt is not None and pt < 0.05)
    return {"kind": kind, "n": n, "R": R, "seed": seed, **{k: round(100 * v / R, 2) for k, v in c.items()}}


def hetero_job(args):
    n, R, seed = args
    rng = np.random.default_rng(seed)       # identical stream to rt_check2.hetero
    sd = np.linspace(0.5, 1.5, n); years = np.arange(n) + 1980
    a = b = 0
    for _ in range(R):
        x = sd * rng.normal(size=n)
        a += S.vi_bc_gpt(x)[0] < 0.05
        b += spec_mkar1(years, x)[0] < 0.05
    return {"n": n, "R": R, "seed": seed, "script_mkar1": round(100 * a / R, 2), "spec_mkar1": round(100 * b / R, 2)}


def power_job(args):
    n, phi, beta, R, seed = args
    rng = np.random.default_rng(seed)       # identical stream to sim2.power
    t = np.arange(n); years = t + 1980
    a = b = c = d = 0
    for _ in range(R):
        x = beta * t + S.ar1(rng, n, phi)
        a += S.vi_bc_gpt(x)[0] < 0.05
        b += spec_mkar1(years, x)[0] < 0.05
        c += S.santer_t(x) < 0.05
        pt = spec_ttest(years, x)[0]
        d += (pt is not None and pt < 0.05)
    return {"n": n, "phi": phi, "beta": beta, "R": R, "seed": seed,
            "script_mkar1": round(100 * a / R, 2), "spec_mkar1": round(100 * b / R, 2),
            "script_santer_t": round(100 * c / R, 2), "spec_ttest": round(100 * d / R, 2)}


def golden_check(path):
    """Does this reading of the spec reproduce the v2 golden values (engine_cases.json)?"""
    g = json.load(open(path))
    worst = {"mk_p": 0.0, "phi": 0.0, "vif": 0.0, "p_star": 0.0, "ci_inflated": 0.0, "ols_p": 0.0}
    rows = []
    for case in g["cases"]:
        yrs = np.array(case["years"]); vals = case["values"]
        keep = [k for k, v in enumerate(vals) if v is not None]
        t = yrs[keep]; x = np.array([vals[k] for k in keep], float)
        ex = case["expected"]
        if ex.get("mk") is None or len(x) < 4:
            continue
        s, var = mk_s_var_ties(t, x)
        ph, rv = spec_phi_raw(t, x)
        phi = bias_correct(ph, len(x), rv)
        f = vif(len(x), phi)
        p_star = p_cc(s, var * f)
        lo, hi = spec_sen_ci(t, x, var * f, Z975)
        d = {
            "mk_p": abs(p_cc(s, var) - ex["mk"]["p"]),
            "phi": abs(phi - ex["ar1"]["phi"]),
            "vif": abs(f - ex["ar1"]["vif"]),
            "p_star": abs(p_star - ex["mkAr1"]["p"]),
            "ci_inflated": max(abs(lo - ex["sen"]["ciLow"]), abs(hi - ex["sen"]["ciHigh"])),
        }
        if ex.get("ols", {}).get("available") and ex["ols"].get("p") is not None:
            pt = spec_ttest(t, x)[0]
            d["ols_p"] = abs((pt if pt is not None else np.nan) - ex["ols"]["p"])
        for k, v in d.items():
            worst[k] = max(worst[k], float(v) if np.isfinite(v) else 1.0)
        rows.append({"id": case["id"], "phi": phi, "p_star": p_star, "golden_p_star": ex["mkAr1"]["p"]})
    return {"cases_checked": len(rows), "max_abs_difference": worst}


if __name__ == "__main__":
    out = {"meta": {"scripts": "sim_size.py, sim2.py, rt_check.py, rt_check2.py (trend-recompute-scripts.zip)",
                    "numpy": np.__version__, "scipy": __import__("scipy").__version__}}
    t0 = time.time()
    out["golden_check_v2"] = golden_check(sys.argv[2])
    with Pool(2) as pool:
        out["false_alarms_no_trend_pct"] = pool.map(size_job, [(n, phi, 2000, 20261102 + n * 100 + int(phi * 10))
                                                                for n in (20, 25, 30, 45) for phi in (0.0, 0.3, 0.6)])
        out["sen_interval_coverage_pct"] = pool.map(cover_job, [(n, phi, 2000, 1000 + 10 * n + int(10 * phi))
                                                                 for n in (20, 25, 30, 46) for phi in (0.0, 0.3, 0.6)])
        kinds = [(k, n) for n in (25, 45) for k in ("AR1_0.6", "sum_AR1_0.1_0.9", "AR2_0.15_0.65")]
        out["stress_no_trend_pct"] = pool.map(stress_job, [(k, n, 4000 if n == 25 else 2000, 777 + i) for i, (k, n) in enumerate(kinds)])
        out["growing_spread_no_trend_pct"] = pool.map(hetero_job, [(25, 4000, 5), (46, 4000, 6)])
        out["power_at_weatherhead_nstar_pct"] = pool.map(power_job, [(24, 0.0, 0.1, 2000, 11), (29, 0.3, 0.1, 2000, 12), (37, 0.6, 0.1, 2000, 13)])
    # rt_check2: Sen of the difference against the difference of Sens (one pair)
    rng = np.random.default_rng(3); t = np.arange(30)
    a = 0.03 * t + S.ar1(rng, 30, 0.3); b = -0.01 * t + S.ar1(rng, 30, 0.3)
    sa, sb, sd = (stats.theilslopes(v, t).slope for v in (a, b, a - b))
    out["sen_difference_example"] = {"senA": sa, "senB": sb, "senA_minus_senB": sa - sb, "sen_of_A_minus_B": sd}
    # rt_check: index spacing against actual years with a decade removed
    yrs = np.r_[np.arange(10), np.arange(20, 30)]; y = 0.1 * yrs
    i, j = np.triu_indices(len(y), 1)
    out["date_compression_example"] = {"index_spacing": float(np.median((y[j] - y[i]) / (j - i))),
                                       "actual_years": float(stats.theilslopes(y, yrs).slope)}
    out["meta"]["seconds"] = round(time.time() - t0, 1)
    json.dump(out, open(sys.argv[3], "w"), indent=1)
    print(json.dumps(out["golden_check_v2"], indent=1))
    for k in ("false_alarms_no_trend_pct", "sen_interval_coverage_pct", "stress_no_trend_pct",
              "growing_spread_no_trend_pct", "power_at_weatherhead_nstar_pct"):
        print("==", k)
        for r in out[k]:
            print("  ", r)
    print("==", out["sen_difference_example"])
    print("==", out["date_compression_example"])
    print("seconds", out["meta"]["seconds"])

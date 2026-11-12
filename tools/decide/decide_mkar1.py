"""Choose the MK-AR1 variant on the full calibration grid (decision 1 of the team's three).

Variants (all are "a bias-corrected lag-1 coefficient inflates the variance of the Mann-Kendall statistic", v3 6.3 r1):
  V1 sen_clip0  lag-1 autocorrelation of the Sen residuals; (n*phi+2)/(n-4); clip [0, 0.95]   (spec pack v2/v3 so far)
  V2 dyn_neg    AR(1) coefficient of the regression x_t ~ 1 + x_{t-1} + t; same correction; clip [-0.95, 0.95] (recompute scripts)
  V3 dyn_clip0  as V2, clipped to [0, 0.95]
  V4 sen_neg    as V1, clipped to [-0.95, 0.95]
Decision rule, fixed before running: (1) the largest validated domain, i.e. the most (n, phi) cells with false alarms
<= 8% counted contiguously from phi = 0 as D5 reads them; (2) then the lowest worst-case false-alarm rate inside that
domain; (3) then the higher mean power inside it. Coverage of the 2.25 interval must stay >= 94% (K-02).

Usage: python -I decide_mkar1.py <out.json> [reps]
"""
import json
import sys
import time

import numpy as np
from scipy import stats

OUT = sys.argv[1]
REPS = int(sys.argv[2]) if len(sys.argv) > 2 else 4000
NS = [20, 25, 30, 35, 40, 46]
PHIS = [round(0.1 * k, 1) for k in range(9)]
VARIANTS = ["V1_sen_clip0", "V2_dyn_neg", "V3_dyn_clip0", "V4_sen_neg"]


def seed(*parts):
    import hashlib
    return int.from_bytes(hashlib.sha256("|".join(map(str, parts)).encode()).digest()[:8], "little")


def ar1_batch(rng, R, n, phi):
    e = rng.normal(size=(R, n))
    x = np.empty((R, n))
    x[:, 0] = e[:, 0]
    s = np.sqrt(1 - phi ** 2)
    for k in range(1, n):
        x[:, k] = phi * x[:, k - 1] + s * e[:, k]
    return x


def vif(n, phi):
    k = np.arange(1, n)
    w = (1 - k / n)
    return 1 + 2 * (np.power.outer(phi, k) * w).sum(axis=-1)


def analyse(x, t):
    """x: (R, n) series on years t (n,). Returns dict of p-values and VIFs for each variant, plus Sen pieces."""
    R, n = x.shape
    i, j = np.triu_indices(n, 1)
    d = x[:, j] - x[:, i]
    S = np.sign(d).sum(axis=1)
    varS = n * (n - 1) * (2 * n + 5) / 18.0            # continuous data: no ties
    slopes = d / (t[j] - t[i])
    b = np.median(slopes, axis=1)
    a = np.median(x, axis=1) - b * np.median(t)
    r = x - (a[:, None] + b[:, None] * t[None, :])
    rc = r - r.mean(axis=1, keepdims=True)
    phi_sen = (rc[:, 1:] * rc[:, :-1]).sum(axis=1) / (rc ** 2).sum(axis=1)
    # dynamic regression x_t = c + phi x_{t-1} + delta (t - tbar)
    y = x[:, 1:]; xl = x[:, :-1]; tt = (t[1:] - t.mean())
    X = np.stack([np.ones_like(xl), xl, np.broadcast_to(tt, xl.shape)], axis=2)       # (R, n-1, 3)
    XtX = np.einsum("rki,rkj->rij", X, X); Xty = np.einsum("rki,rk->ri", X, y)
    beta = np.linalg.solve(XtX, Xty[..., None])[..., 0]
    phi_dyn = beta[:, 1]
    corr = lambda p: (n * p + 2) / (n - 4)
    phis = {"V1_sen_clip0": np.clip(corr(phi_sen), 0, 0.95), "V2_dyn_neg": np.clip(corr(phi_dyn), -0.95, 0.95),
            "V3_dyn_clip0": np.clip(corr(phi_dyn), 0, 0.95), "V4_sen_neg": np.clip(corr(phi_sen), -0.95, 0.95)}
    out = {"S": S, "varS": varS, "slopes": slopes}
    for v, ph in phis.items():
        f = vif(n, ph)
        var = varS * f
        z = (S - np.sign(S)) / np.sqrt(var)
        out[v] = {"p": 2 * stats.norm.sf(np.abs(z)), "vif": f, "phi": ph}
    out["plain_p"] = 2 * stats.norm.sf(np.abs((S - np.sign(S)) / np.sqrt(varS)))
    return out


def interval_hit(slopes, var_star, beta, mult):
    N = slopes.shape[1]
    srt = np.sort(slopes, axis=1)
    C = mult * np.sqrt(var_star)
    lo = np.maximum(np.round((N - C) / 2) - 1, 0).astype(int)
    hi = np.minimum(np.round((N + C) / 2), N - 1).astype(int)
    rows = np.arange(len(srt))
    return (srt[rows, lo] <= beta) & (beta <= srt[rows, hi])


def main():
    t0 = time.time()
    res = {"design": {"reps": REPS, "ns": NS, "phis": PHIS, "variants": VARIANTS, "alpha": 0.05}, "falseAlarms": [], "power": [], "coverage": []}
    for n in NS:
        t = np.arange(1980, 1980 + n, dtype=float)
        for phi in PHIS:
            rng = np.random.default_rng(seed("decide_fa", n, phi))
            x = ar1_batch(rng, REPS, n, phi)
            o = analyse(x, t)
            row = {"n": n, "phi": phi, "plainMK": round(100 * float((o["plain_p"] < 0.05).mean()), 2)}
            for v in VARIANTS:
                row[v] = round(100 * float((o[v]["p"] < 0.05).mean()), 2)
                row[v + "_meanPhi"] = round(float(o[v]["phi"].mean()), 4)
            res["falseAlarms"].append(row)
        print(f"n={n} done {time.time()-t0:.0f}s", flush=True)
    for n in [20, 25, 30, 46]:
        t = np.arange(1980, 1980 + n, dtype=float)
        for phi in [0.0, 0.3, 0.6]:
            for beta in [0.02, 0.05]:
                rng = np.random.default_rng(seed("decide_pw", n, phi, beta))
                x = ar1_batch(rng, 2000, n, phi) + beta * (t - t[0])[None, :]
                o = analyse(x, t)
                row = {"n": n, "phi": phi, "beta": beta}
                for v in VARIANTS:
                    row[v] = round(100 * float((o[v]["p"] < 0.05).mean()), 2)
                res["power"].append(row)
            rng = np.random.default_rng(seed("decide_cov", n, phi))
            beta = 0.02
            x = ar1_batch(rng, 2000, n, phi) + beta * (t - t[0])[None, :]
            o = analyse(x, t)
            row = {"n": n, "phi": phi}
            for v in VARIANTS:
                row[v + "_2.25"] = round(100 * float(interval_hit(o["slopes"], o["varS"] * o[v]["vif"], beta, 2.25).mean()), 2)
            res["coverage"].append(row)
    # decision quantities
    summ = {}
    for v in VARIANTS:
        dom, worst, cells = 0, 0.0, []
        for n in NS:
            rows = [r for r in res["falseAlarms"] if r["n"] == n]
            for r in sorted(rows, key=lambda r: r["phi"]):
                if r[v] <= 8.0:
                    dom += 1; worst = max(worst, r[v]); cells.append((n, r["phi"]))
                else:
                    break
        inside = {(c[0], round(c[1], 1)) for c in cells}
        pw = [r[v] for r in res["power"] if (r["n"], round(r["phi"], 1)) in inside]
        allfa = [r[v] for r in res["falseAlarms"] if r["phi"] <= 0.6]
        summ[v] = {"domainCells": dom, "worstFalseAlarmInDomain": worst, "meanPowerInDomain": round(float(np.mean(pw)), 2) if pw else None,
                   "falseAlarmRange_phi_le_0.6": [min(allfa), max(allfa)],
                   "phiMaxByN": {n: max([c[1] for c in cells if c[0] == n], default=None) for n in NS},
                   "coverageMin_2.25": min(r[v + "_2.25"] for r in res["coverage"])}
    res["summary"] = summ
    res["seconds"] = round(time.time() - t0, 1)
    json.dump(res, open(OUT, "w"), indent=1)
    for v, s in summ.items():
        print(v, s)


if __name__ == "__main__":
    main()

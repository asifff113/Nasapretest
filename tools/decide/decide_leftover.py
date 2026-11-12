"""Leftover-memory check (D6): fix the 14% false flags (decision 2 of the team's three).

Statistic (unchanged, as rt_pool.py): per cell, OLS-detrend, then s_cell = mean_{k=2,3,4} (a_k - a_1^k); region s = mean of s_cell.
Critical values: 95th percentile of s for regions of m_eff independent AR(1) cells at memory phi (table over n, m_eff, phi).
Matching rules compared, all using the same table:
  M0  region-series phi~ of the spec so far (Sen-residual lag-1, clip 0), rounded to 0.1         (status quo)
  M1  region-series phi~ with the chosen MK-AR1 estimator (dynamic regression, clip 0), rounded to 0.1
  M2  median over the cells of each cell's phi~ (dynamic regression, clip 0), linear interpolation in phi
Tested on independent cells (m = 5, 20) and on correlated cells (rho = 0.5, 0.8; m = 20, so m_eff is small),
AR(1) with phi on and off the table's grid, mixed memory (AR(1) 0.1 + 0.9) and AR(2) (0.15, 0.65).

Usage: python -I decide_leftover.py <out.json> [regions per setting]
"""
import hashlib
import json
import sys
import time

import numpy as np

OUT = sys.argv[1]
REG = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
NS = [25, 46]
MSTEPS = [1, 2, 3, 5, 10, 20]
PHIS = [round(0.1 * k, 1) for k in range(9)]


def seed(*parts):
    return int.from_bytes(hashlib.sha256("|".join(map(str, parts)).encode()).digest()[:8], "little")


def ar1(rng, shape, n, phi):
    e = rng.normal(size=shape + (n,))
    x = np.empty_like(e)
    x[..., 0] = e[..., 0]
    s = np.sqrt(1 - phi ** 2)
    for k in range(1, n):
        x[..., k] = phi * x[..., k - 1] + s * e[..., k]
    return x


def ar2(rng, shape, n, p1, p2, burn=300):
    m = n + burn
    e = rng.normal(size=shape + (m,))
    x = np.zeros_like(e)
    for k in range(2, m):
        x[..., k] = p1 * x[..., k - 1] + p2 * x[..., k - 2] + e[..., k]
    return x[..., burn:]


def gen(rng, kind, R, m, n, phi=None, rho=0.0):
    def one(shape):
        if kind == "AR1":
            return ar1(rng, shape, n, phi)
        if kind == "mix":
            return (ar1(rng, shape, n, 0.1) + ar1(rng, shape, n, 0.9)) / np.sqrt(2)
        if kind == "AR2":
            return ar2(rng, shape, n, 0.15, 0.65)
        raise ValueError(kind)
    if rho > 0:
        z = one((R, 1)); e = one((R, m))
        return np.sqrt(rho) * z + np.sqrt(1 - rho) * e
    return one((R, m))


def detrend(x, t):
    tc = t - t.mean()
    b = (x * tc).sum(-1) / (tc ** 2).sum()
    return x - x.mean(-1, keepdims=True) - b[..., None] * tc


def acf(e, k):
    e = e - e.mean(-1, keepdims=True)
    return (e[..., k:] * e[..., :-k]).sum(-1) / (e * e).sum(-1)


def stat(cells, t):
    e = detrend(cells, t)
    a1 = acf(e, 1)
    s_cell = np.mean([acf(e, k) - a1 ** k for k in (2, 3, 4)], axis=0)
    return s_cell.mean(-1)


def phi_dyn(x, t):
    n = x.shape[-1]
    y = x[..., 1:]; xl = x[..., :-1]; tt = t[1:] - t.mean()
    X = np.stack([np.ones_like(xl), xl, np.broadcast_to(tt, xl.shape)], axis=-1)
    XtX = np.einsum("...ki,...kj->...ij", X, X); Xty = np.einsum("...ki,...k->...i", X, y)
    beta = np.linalg.solve(XtX, Xty[..., None])[..., 0]
    return np.clip((n * beta[..., 1] + 2) / (n - 4), 0, 0.95)


def phi_sen(x, t):
    n = x.shape[-1]
    i, j = np.triu_indices(n, 1)
    sl = (x[..., j] - x[..., i]) / (t[j] - t[i])
    b = np.median(sl, -1); a = np.median(x, -1) - b * np.median(t)
    r = x - (a[..., None] + b[..., None] * t)
    rc = r - r.mean(-1, keepdims=True)
    ph = (rc[..., 1:] * rc[..., :-1]).sum(-1) / (rc ** 2).sum(-1)
    return np.clip((n * ph + 2) / (n - 4), 0, 0.95)


def m_eff(cells, t, power=1):
    e = detrend(cells, t)
    m = e.shape[-2]
    if m == 1:
        return np.ones(e.shape[0])
    z = (e - e.mean(-1, keepdims=True)) / e.std(-1, keepdims=True)
    c = np.einsum("rik,rjk->rij", z, z) / e.shape[-1]
    rho = np.clip((c.sum((-1, -2)) - m) / (m * (m - 1)), 0, 1)
    return m / (1 + (m - 1) * rho ** power)


def step(me):
    out = np.ones_like(me, dtype=int)
    for s in MSTEPS:
        out = np.where(me + 1e-12 >= s, s, out)
    return out


def main():
    t0 = time.time()
    table = {}
    for n in NS:
        t = np.arange(n, dtype=float)
        for m in MSTEPS:
            for phi in PHIS:
                rng = np.random.default_rng(seed("decide_lo_table", n, m, phi))
                s = stat(gen(rng, "AR1", REG, m, n, phi), t)
                table[(n, m, phi)] = float(np.quantile(s, 0.95))
        print(f"table n={n} {time.time()-t0:.0f}s", flush=True)

    def crit(n, ms, ph, interp):
        ph = np.clip(ph, 0, 0.8)
        if not interp:
            pb = np.round(np.round(ph / 0.1) * 0.1, 1)
            return np.array([table[(n, int(a), float(b))] for a, b in zip(ms, pb)])
        lo = np.floor(ph / 0.1 + 1e-9) * 0.1; hi = np.minimum(lo + 0.1, 0.8); w = np.where(hi > lo, (ph - lo) / 0.1, 0.0)
        clo = np.array([table[(n, int(a), round(float(b), 1))] for a, b in zip(ms, lo)])
        chi = np.array([table[(n, int(a), round(float(b), 1))] for a, b in zip(ms, hi)])
        return (1 - w) * clo + w * chi

    settings = []
    for n in NS:
        for m, rho in [(5, 0.0), (20, 0.0), (20, 0.3), (20, 0.5), (20, 0.65), (20, 0.8)]:
            for kind, phi in [("AR1", 0.0), ("AR1", 0.15), ("AR1", 0.3), ("AR1", 0.45), ("AR1", 0.6), ("mix", None), ("AR2", None)]:
                settings.append((n, m, rho, kind, phi))
    rows = []
    for (n, m, rho, kind, phi) in settings:
        t = np.arange(n, dtype=float)
        rng = np.random.default_rng(seed("decide_lo_test", n, m, rho, kind, phi))
        cells = gen(rng, kind, REG, m, n, phi, rho)
        s = stat(cells, t)
        ms = step(m_eff(cells, t))
        ms2 = step(m_eff(cells, t, power=2))
        region = cells.mean(-2)
        ph_m0 = phi_sen(region, t); ph_m1 = phi_dyn(region, t)
        ph_m2 = np.median(phi_dyn(cells, t), axis=-1)
        res = {"n": n, "m": m, "rho": rho, "kind": kind, "phi": phi, "meanMeffStep": round(float(ms.mean()), 2)}
        for name, ph, interp, mm in [("M0", ph_m0, False, ms), ("M1", ph_m1, False, ms), ("M2", ph_m2, True, ms), ("M2rho2", ph_m2, True, ms2)]:
            res[name] = round(100 * float((s > crit(n, mm, ph, interp)).mean()), 2)
        res["meanMeffStepRho2"] = round(float(ms2.mean()), 2)
        rows.append(res)
        print(res, flush=True)
    json.dump({"design": {"regions": REG, "ns": NS, "msteps": MSTEPS, "phis": PHIS},
               "table": [{"n": k[0], "mEff": k[1], "phi": k[2], "critical": v} for k, v in table.items()],
               "rows": rows, "seconds": round(time.time() - t0, 1)}, open(OUT, "w"), indent=1)


if __name__ == "__main__":
    main()

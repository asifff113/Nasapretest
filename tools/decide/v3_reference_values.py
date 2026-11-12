"""Reference values for the chosen MK-AR1 variant (V3: AR(1) regression coefficient, bias-corrected, clipped at 0):
stress families, growing spread, power at Weatherhead's n*, and interval coverage at 1.96 and 2.25.
Usage: python -I v3_reference_values.py <this folder> <out.json>"""
import json
import sys

import numpy as np

sys.path.insert(0, sys.argv[1])
_argv = sys.argv
sys.argv = [_argv[0], "unused.json", "4000"]   # decide_mkar1 reads its own arguments at import
import decide_mkar1 as D  # noqa: E402
sys.argv = _argv

out = {}
V = "V3_dyn_clip0"


def ar2_batch(rng, R, n, p1, p2, burn=500):
    m = n + burn
    e = rng.normal(size=(R, m)); x = np.zeros((R, m))
    for k in range(2, m):
        x[:, k] = p1 * x[:, k - 1] + p2 * x[:, k - 2] + e[:, k]
    return x[:, burn:]


rows = []
for n, R in ((25, 4000), (45, 2000)):
    t = np.arange(1980, 1980 + n, dtype=float)
    for kind in ("AR1_0.6", "mixed_0.1_0.9", "AR2_0.15_0.65"):
        rng = np.random.default_rng(D.seed("v3_stress", kind, n))
        if kind == "AR1_0.6":
            x = D.ar1_batch(rng, R, n, 0.6)
        elif kind == "mixed_0.1_0.9":
            x = D.ar1_batch(rng, R, n, 0.1) + D.ar1_batch(rng, R, n, 0.9)
        else:
            x = ar2_batch(rng, R, n, 0.15, 0.65)
        o = D.analyse(x, t)
        rows.append({"kind": kind, "n": n, "reps": R, "falseAlarmPct": round(100 * float((o[V]["p"] < 0.05).mean()), 2)})
out["stress"] = rows
rows = []
for n in (25, 46):
    t = np.arange(1980, 1980 + n, dtype=float)
    rng = np.random.default_rng(D.seed("v3_spread", n))
    sd = np.linspace(0.5, 1.5, n)
    x = sd[None, :] * rng.normal(size=(4000, n))
    o = D.analyse(x, t)
    rows.append({"n": n, "reps": 4000, "falseAlarmPct": round(100 * float((o[V]["p"] < 0.05).mean()), 2)})
out["growingSpread"] = rows
rows = []
for n, phi in ((24, 0.0), (29, 0.3), (37, 0.6)):
    t = np.arange(1980, 1980 + n, dtype=float)
    rng = np.random.default_rng(D.seed("v3_power_nstar", n, phi))
    x = D.ar1_batch(rng, 2000, n, phi) + 0.1 * (t - t[0])[None, :]
    o = D.analyse(x, t)
    rows.append({"n": n, "phi": phi, "beta": 0.1, "reps": 2000, "powerPct": round(100 * float((o[V]["p"] < 0.05).mean()), 2)})
out["powerAtNstar"] = rows
rows = []
for n in (20, 25, 30, 46):
    t = np.arange(1980, 1980 + n, dtype=float)
    for phi in (0.0, 0.3, 0.6):
        rng = np.random.default_rng(D.seed("v3_cov", n, phi))
        x = D.ar1_batch(rng, 2000, n, phi) + 0.02 * (t - t[0])[None, :]
        o = D.analyse(x, t)
        rows.append({"n": n, "phi": phi, "cov1.96": round(100 * float(D.interval_hit(o["slopes"], o["varS"] * o[V]["vif"], 0.02, 1.959963984540054).mean()), 2),
                     "cov2.25": round(100 * float(D.interval_hit(o["slopes"], o["varS"] * o[V]["vif"], 0.02, 2.25).mean()), 2)})
out["coverage"] = rows
json.dump(out, open(sys.argv[2], "w"), indent=1)
for k, v in out.items():
    print(k)
    for r in v:
        print("  ", r)

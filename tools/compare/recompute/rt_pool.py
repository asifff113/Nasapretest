import numpy as np, sys
sys.path.insert(0, sys.argv[1])
from rt_check import ar1, ar2
def acf(e, k):
    e = e - e.mean(); return np.sum(e[k:] * e[:-k]) / np.sum(e * e)
def stat_cell(x):
    n = len(x); t = np.arange(n); b, a = np.polyfit(t, x, 1); e = x - (a + b * t)
    r1 = acf(e, 1); return np.mean([acf(e, k) - r1**k for k in (2, 3, 4)])
def region(rng, kind, n, m):
    if kind == "AR1_0.5": xs = [ar1(rng, n, 0.5) for _ in range(m)]
    elif kind == "AR1_0.3": xs = [ar1(rng, n, 0.3) for _ in range(m)]
    elif kind == "mix": xs = [ar1(rng, n, 0.1) + ar1(rng, n, 0.9) for _ in range(m)]
    else: xs = [ar2(rng, n, 0.15, 0.65) for _ in range(m)]
    return np.mean([stat_cell(x) for x in xs])
rng = np.random.default_rng(11)
for n in (25, 46):
    for m in (5, 20):
        null = np.array([region(rng, "AR1_0.5", n, m) for _ in range(1000)]); crit = np.quantile(null, 0.95)
        null3 = np.mean([region(rng, "AR1_0.3", n, m) > crit for _ in range(500)])
        pm = np.mean([region(rng, "mix", n, m) > crit for _ in range(500)])
        pa = np.mean([region(rng, "AR2", n, m) > crit for _ in range(500)])
        print(f"n={n} independent cells={m}: flags AR(1) 0.3 {100*null3:.0f}%, mixed memory {100*pm:.0f}%, AR(2) {100*pa:.0f}%")

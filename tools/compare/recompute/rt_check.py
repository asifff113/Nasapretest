import numpy as np, warnings, sys
from multiprocessing import Pool
from scipy import stats
sys.path.insert(0, sys.argv[1])
from sim_size import vi_bc_gpt, santer_t, mk_s_var, p_from, lag1
import pymannkendall as mk
from statsmodels.stats.diagnostic import acorr_ljungbox
warnings.filterwarnings("ignore")

def ar1(rng, n, phi, burn=0):
    x = np.empty(n); x[0] = rng.normal(); s = np.sqrt(1 - phi**2); e = rng.normal(size=n)
    for t in range(1, n): x[t] = phi * x[t-1] + s * e[t]
    return x
def ar2(rng, n, p1, p2, burn=500):
    m = n + burn; x = np.zeros(m); e = rng.normal(size=m)
    for t in range(2, m): x[t] = p1 * x[t-1] + p2 * x[t-2] + e[t]
    return x[burn:]
def gen(kind, rng, n):
    if kind == "AR1_0.6": return ar1(rng, n, 0.6)
    if kind == "sum_AR1_0.1_0.9": return ar1(rng, n, 0.1) + ar1(rng, n, 0.9)
    if kind == "AR2_0.15_0.65": return ar2(rng, n, 0.15, 0.65)

def gate(x):  # does an AR(1) fit leave structure? Ljung-Box on AR(1) innovations, lags 1-3
    n = len(x); t = np.arange(n); b, a = np.polyfit(t, x, 1); e = x - (a + b * t)
    r = lag1(e); u = e[1:] - r * e[:-1]
    return acorr_ljungbox(u, lags=[3], return_df=True)["lb_pvalue"].iloc[0] < 0.05

def run(args):
    kind, n, R, seed = args
    rng = np.random.default_rng(seed); c = dict(VI_BC=0, MK=0, PW=0, Santer=0, gate=0, VI_BC_after_gate=0, kept=0)
    for _ in range(R):
        x = gen(kind, rng, n)
        p = vi_bc_gpt(x)[0]; c["VI_BC"] += p < 0.05
        c["MK"] += mk.original_test(x).p < 0.05
        c["PW"] += mk.pre_whitening_modification_test(x).p < 0.05
        c["Santer"] += santer_t(x) < 0.05
        g = gate(x); c["gate"] += g
        if not g: c["kept"] += 1; c["VI_BC_after_gate"] += p < 0.05
    out = {k: round(100 * v / R, 1) for k, v in c.items() if k not in ("VI_BC_after_gate", "kept")}
    out["VI_BC_among_kept"] = round(100 * c["VI_BC_after_gate"] / max(c["kept"], 1), 1)
    return kind, n, out

if __name__ == "__main__":
    jobs = [(k, n, 4000 if n == 25 else 2000, 777 + i) for i, (k, n) in enumerate([(k, n) for n in (25, 45) for k in ("AR1_0.6", "sum_AR1_0.1_0.9", "AR2_0.15_0.65")])]
    with Pool(2) as pool:
        for kind, n, out in pool.map(run, jobs): print(f"n={n:<3d} {kind:<18s} {out}")
    # date compression example: 30 years, slope 0.1/yr, middle decade removed, no noise
    t = np.r_[np.arange(10), np.arange(20, 30)]; y = 0.1 * t
    i, j = np.triu_indices(len(y), 1)
    print("Sen slope using index spacing:", round(np.median((y[j] - y[i]) / (j - i)), 4), " using actual years:", round(stats.theilslopes(y, t).slope, 4))
    print("Cube: 10 vars x 540 months x 64,800 cells x 4 B =", round(10 * 540 * 64800 * 4 / 2**30, 3), "GiB; int16:", round(10 * 540 * 64800 * 2 / 2**30, 3), "GiB; 2 vars int16:", round(2 * 540 * 64800 * 2 / 2**20, 1), "MiB")

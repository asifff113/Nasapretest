import numpy as np, warnings, sys
from multiprocessing import Pool
from scipy import stats
import pymannkendall as mk
sys.path.insert(0, sys.argv[1])
from sim_size import ar1, mk_s_var, ar_factor, vi_bc_gpt, santer_t, lag1
warnings.filterwarnings("ignore")

def sen_ci(x, factor=1.0, alpha=0.05):
    n = len(x); i, j = np.triu_indices(n, 1)
    sl = np.sort((x[j] - x[i]) / (j - i)); N = len(sl)
    _, var = mk_s_var(x); C = stats.norm.ppf(1 - alpha / 2) * np.sqrt(var * factor)
    M1 = (N - C) / 2; M2 = (N + C) / 2
    lo = np.interp(M1 - 1, np.arange(N), sl); hi = np.interp(M2, np.arange(N), sl)
    return np.median(sl), lo, hi

def coverage(args):
    n, phi, beta, R, seed = args
    rng = np.random.default_rng(seed); t = np.arange(n)
    c0 = c1 = 0
    for _ in range(R):
        x = beta * t + ar1(rng, n, phi)
        _, f = vi_bc_gpt(x)
        _, lo, hi = sen_ci(x); c0 += lo <= beta <= hi
        _, lo, hi = sen_ci(x, f); c1 += lo <= beta <= hi
    return n, phi, c0 / R, c1 / R

def power(args):
    n, phi, beta, R, seed = args
    rng = np.random.default_rng(seed); t = np.arange(n); r = 0; rs = 0
    for _ in range(R):
        x = beta * t + ar1(rng, n, phi)
        r += vi_bc_gpt(x)[0] < 0.05; rs += santer_t(x) < 0.05
    return n, phi, beta, r / R, rs / R

if __name__ == "__main__":
    with Pool(2) as pool:
        cov = pool.map(coverage, [(45, p, 0.02, 2000, 7 + int(10 * p)) for p in (0.0, 0.3, 0.6)] + [(25, p, 0.02, 2000, 70 + int(10 * p)) for p in (0.0, 0.3, 0.6)])
        print("Sen 95% CI coverage: n, phi, unwidened, widened-by-VI-BC-factor")
        for c in cov: print("  ", c)
        # power at the Weatherhead annual n* (sigma=1 marginal, w=0.1/yr): 24, 29, 37
        pw = pool.map(power, [(24, 0.0, 0.1, 2000, 11), (29, 0.3, 0.1, 2000, 12), (37, 0.6, 0.1, 2000, 13)])
        print("Power at n* (alpha .05 two-sided): n, phi, beta, VI-BC MK, Santer t")
        for p in pw: print("  ", p)
    # GLM claim: Sen slope 'attenuated' under AR(1) (true 0.05, phi .6, n 30)
    rng = np.random.default_rng(5); t = np.arange(30)
    ss = [mk.sens_slope(0.05 * t + ar1(rng, 30, 0.6)).slope for _ in range(3000)]
    print("GLM check: mean Sen slope (true 0.05, phi .6, n 30, 3000 reps):", round(np.mean(ss), 4), " median:", round(np.median(ss), 4), " sd:", round(np.std(ss), 4))
    # Gemini SYN-02: y = 0.05 t + e, e_t = 0.6 e_{t-1} + N(0, 0.2^2), t = 0..39; spread of Sen slope across seeds
    sl = []
    for s in range(2000):
        r = np.random.default_rng(s); e = np.zeros(40)
        for k in range(1, 40): e[k] = 0.6 * e[k-1] + r.normal(0, 0.2)
        sl.append(stats.theilslopes(0.05 * np.arange(40) + e, np.arange(40)).slope)
    sl = np.array(sl); print("Gemini SYN-02: sd of Sen slope across seeds:", round(sl.std(), 4), " share outside 0.050 +/- 0.006:", round(np.mean(np.abs(sl - 0.05) > 0.006), 3))
    # Gemini SYN-01: HR default false-positive rate, N=240 months, phi .75, 500 reps
    rng = np.random.default_rng(42); rej = 0; fail = 0
    for _ in range(500):
        p = mk.hamed_rao_modification_test(ar1(rng, 240, 0.75)).p
        if not np.isfinite(p): fail += 1
        elif p < 0.05: rej += 1
    print("Gemini SYN-01: HR default rejection rate N=240 phi=.75:", rej / 500, " failures:", fail)

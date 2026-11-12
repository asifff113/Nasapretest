import numpy as np, warnings, sys
from multiprocessing import Pool
from scipy import stats
sys.path.insert(0, sys.argv[1])
from sim_size import ar1, mk_s_var, vi_bc_gpt, p_from
warnings.filterwarnings("ignore")
ZS = (1.96, 2.05, 2.15, 2.25, 2.35)

def cover(args):
    n, phi, R, seed = args
    rng = np.random.default_rng(seed); t = np.arange(n); beta = 0.02
    i, j = np.triu_indices(n, 1); hit = np.zeros(len(ZS))
    for _ in range(R):
        x = beta * t + ar1(rng, n, phi)
        p, f = vi_bc_gpt(x)
        sl = np.sort((x[j] - x[i]) / (j - i)); N = len(sl)
        _, var = mk_s_var(x)
        for k, z in enumerate(ZS):
            C = z * np.sqrt(var * f)
            lo = np.interp((N - C) / 2 - 1, np.arange(N), sl); hi = np.interp((N + C) / 2, np.arange(N), sl)
            hit[k] += lo <= beta <= hi
    return n, phi, np.round(100 * hit / R, 1)

def hetero(args):  # no trend, white noise whose spread grows from 0.5 to 1.5 over the record
    n, R, seed = args
    rng = np.random.default_rng(seed); sd = np.linspace(0.5, 1.5, n); r = 0
    for _ in range(R): r += vi_bc_gpt(sd * rng.normal(size=n))[0] < 0.05
    return n, round(100 * r / R, 1)

if __name__ == "__main__":
    jobs = [(n, phi, 2000, 1000 + 10 * n + int(10 * phi)) for n in (20, 25, 30, 46) for phi in (0.0, 0.3, 0.6)]
    with Pool(2) as pool:
        print("Widened Sen interval coverage (%), multipliers", ZS)
        for n, phi, c in pool.map(cover, jobs): print(f"  n={n:<3d} phi={phi:.1f}", c)
        print("MK-AR1 false alarms (%) with growing spread, no trend:")
        for n, r in pool.map(hetero, [(25, 4000, 5), (46, 4000, 6)]): print(f"  n={n}: {r}")
    # Sen of the difference vs difference of Sens, one illustrative pair
    rng = np.random.default_rng(3); t = np.arange(30)
    a = 0.03 * t + ar1(rng, 30, 0.3); b = -0.01 * t + ar1(rng, 30, 0.3)
    sa, sb, sd_ = (stats.theilslopes(v, t).slope for v in (a, b, a - b))
    print(f"Sen(A) {sa:.4f}  Sen(B) {sb:.4f}  Sen(A)-Sen(B) {sa - sb:.4f}  Sen(A-B) {sd_:.4f}")

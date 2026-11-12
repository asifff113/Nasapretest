import numpy as np, warnings, sys, json
from multiprocessing import Pool
from scipy import stats
import pymannkendall as mk
warnings.filterwarnings("ignore")

def ar1(rng, n, phi):
    x = np.empty(n); x[0] = rng.normal()
    s = np.sqrt(1 - phi**2)
    e = rng.normal(size=n)
    for t in range(1, n): x[t] = phi * x[t-1] + s * e[t]
    return x

def mk_s_var(x):
    n = len(x); d = np.sign(x[None, :] - x[:, None]); s = np.triu(d, 1).sum()
    var = n * (n - 1) * (2 * n + 5) / 18.0
    return s, var

def p_from(s, var):
    if var <= 0: return 1.0
    z = (s - np.sign(s)) / np.sqrt(var)
    return 2 * stats.norm.sf(abs(z))

def ar_factor(phi, n):
    k = np.arange(1, n); return 1 + 2 * np.sum((1 - k / n) * phi**k)

def vi_bc_gpt(x):  # GPT-6 Astra variant: dynamic OLS r, phi=(n r+2)/(n-4), full AR(1) factor
    n = len(x); t = np.arange(n, dtype=float)
    X = np.column_stack([x[:-1], np.ones(n-1), t[1:]])
    r = np.linalg.lstsq(X, x[1:], rcond=None)[0][0]
    phi = np.clip((n * r + 2) / (n - 4), -0.95, 0.95)
    s, var = mk_s_var(x); return p_from(s, var * ar_factor(phi, n)), ar_factor(phi, n)

def lag1(e):
    e = e - e.mean(); return np.sum(e[1:] * e[:-1]) / np.sum(e * e)

def bc_ess_glm(x):  # GLM variant: Sen-detrended lag-1, r*=(n r1+1)/(n-2), Var*n/n_eff
    n = len(x); t = np.arange(n); b = mk.sens_slope(x).slope
    r1 = lag1(x - b * t); rs = min((n * r1 + 1) / (n - 2), 0.95)
    neff = n * (1 - rs) / (1 + rs)
    s, var = mk_s_var(x); return p_from(s, var * n / neff)

def minimax_vif(x):  # Minimax: OLS-residual r1, r1c=r1(n+1)/(n-4), VIF=(1+r)/(1-r)
    n = len(x); t = np.arange(n); b, a = np.polyfit(t, x, 1)
    r1 = lag1(x - (a + b * t)); rc = np.clip(r1 * (n + 1) / (n - 4), -0.95, 0.95)
    s, var = mk_s_var(x); return p_from(s, var * (1 + rc) / (1 - rc))

def santer_t(x):  # OLS t-test, AdjSE + AdjDF with n_eff from residual lag-1
    n = len(x); t = np.arange(n, dtype=float); b, a = np.polyfit(t, x, 1)
    e = x - (a + b * t); r1 = lag1(e)
    neff = n * (1 - r1) / (1 + r1)
    if neff <= 2.5: return 1.0
    se = np.sqrt(np.sum(e**2) / (n - 2) / np.sum((t - t.mean())**2)) * np.sqrt((n - 2) / (neff - 2))
    return 2 * stats.t.sf(abs(b / se), neff - 2)

TESTS = ["MK_plain", "HR_all", "HR_lag1", "YW_all", "YW_lag1", "TFPW", "PW", "VI_BC_gpt6", "BC_ESS_glm", "VIF_minimax", "Santer_t"]

def run(args):
    n, phi, R, seed = args
    rng = np.random.default_rng(seed)
    rej = {k: 0 for k in TESTS}; fail = {k: 0 for k in TESTS}
    for _ in range(R):
        x = ar1(rng, n, phi)
        ps = {}
        ps["MK_plain"] = mk.original_test(x).p
        ps["HR_all"] = mk.hamed_rao_modification_test(x).p
        ps["HR_lag1"] = mk.hamed_rao_modification_test(x, lag=1).p
        ps["YW_all"] = mk.yue_wang_modification_test(x).p
        ps["YW_lag1"] = mk.yue_wang_modification_test(x, lag=1).p
        ps["TFPW"] = mk.trend_free_pre_whitening_modification_test(x).p
        ps["PW"] = mk.pre_whitening_modification_test(x).p
        ps["VI_BC_gpt6"] = vi_bc_gpt(x)[0]
        ps["BC_ESS_glm"] = bc_ess_glm(x)
        ps["VIF_minimax"] = minimax_vif(x)
        ps["Santer_t"] = santer_t(x)
        for k, p in ps.items():
            if not np.isfinite(p): fail[k] += 1
            elif p < 0.05: rej[k] += 1
    return dict(n=n, phi=phi, R=R, rej=rej, fail=fail)

if __name__ == "__main__":
    combos = []
    R = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    for n in (20, 25, 30, 45):
        for phi in (0.0, 0.3, 0.6):
            combos.append((n, phi, R, 20261102 + n * 100 + int(phi * 10)))
    with Pool(len(combos)) as pool:
        out = pool.map(run, combos)
    json.dump(out, open(sys.argv[2], "w"))
    hdr = "n   phi  " + " ".join(f"{k:>11s}" for k in TESTS); print(hdr)
    for o in out:
        print(f"{o['n']:<3d} {o['phi']:.1f}  " + " ".join(f"{100*o['rej'][k]/o['R']:10.1f}%" for k in TESTS))
    print("failures (non-finite p):", [(o['n'], o['phi'], {k: v for k, v in o['fail'].items() if v}) for o in out])

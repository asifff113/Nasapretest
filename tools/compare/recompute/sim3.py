import numpy as np, warnings, sys
from scipy import stats
sys.path.insert(0, sys.argv[1])
from sim_size import vi_bc_gpt, santer_t
warnings.filterwarnings("ignore")
# Minimax case 3: monthly seasonal cycle + trend; annual residual SD and MDT
sds = []
for seed in range(500):
    rng = np.random.default_rng(seed); nyr = 30; t = np.arange(nyr)
    seas = 8.0*np.sin(2*np.pi*(np.arange(nyr*12) % 12)/12)
    y = 0.02*t.repeat(12) + seas + rng.standard_normal(nyr*12) + np.repeat(rng.standard_normal(nyr), 12)
    ann = y.reshape(nyr, 12).mean(1); b, a = np.polyfit(t, ann, 1); sds.append(np.std(ann - (a + b*t), ddof=2))
n = 30; Sxx = n*(n**2-1)/12; tq = stats.t.ppf(0.975, 28) + stats.t.ppf(0.80, 28)
print("Minimax case 3: mean annual residual SD", round(np.mean(sds), 3), "(Minimax said ~2.3); MDT80 per yr", round(tq*np.mean(sds)/np.sqrt(Sxx), 4), "(Minimax said ~0.14)")
# Minimax case 5: random-walk shared driver, +/-0.03 trends, n=30
def ols_p(x):
    t = np.arange(len(x)); r = stats.linregress(t, x); return r.slope, r.pvalue
def case5(seed):
    rng = np.random.default_rng(seed); n = 30; t = np.arange(n)
    driver = np.cumsum(rng.standard_normal(n))
    x = 0.030*t + driver + rng.standard_normal(n); y = -0.030*t + driver + rng.standard_normal(n)
    return x, y
x, y = case5(5)
print("Minimax case 5, seed 5: slope x, p (OLS):", [round(v, 4) for v in ols_p(x)], " slope y, p:", [round(v, 4) for v in ols_p(y)], " diff slope, p:", [round(v, 4) for v in ols_p(x - y)], " corr:", round(np.corrcoef(x, y)[0, 1], 2))
both = diffsig = diffsig_vi = indiv_right = 0; N = 2000
for s in range(N):
    x, y = case5(1000 + s)
    bx, px = ols_p(x); by, py = ols_p(y); bd, pd = ols_p(x - y)
    both += (px < 0.05 and bx > 0) and (py < 0.05 and by < 0)
    diffsig += pd < 0.05 and bd > 0
    diffsig_vi += vi_bc_gpt(x - y)[0] < 0.05
print(f"Minimax case 5 over {N} seeds: both individual slopes significant with the right signs {both/N:.1%}; difference series significant (OLS) {diffsig/N:.1%}; difference significant (MK-AR1) {diffsig_vi/N:.1%}")

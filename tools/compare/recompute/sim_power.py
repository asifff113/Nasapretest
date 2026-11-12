import numpy as np, warnings, sys
sys.path.insert(0, sys.argv[1])
from sim_size import ar1, vi_bc_gpt, bc_ess_glm, santer_t
import pymannkendall as mk
warnings.filterwarnings("ignore")
# GLM's power claim: n=30, phi=0.4, true trend 1.5 sigma over the record
rng = np.random.default_rng(2026); n = 30; t = np.arange(n); beta = 1.5 / (n - 1); R = 1500
cnt = dict(MK=0, HR1=0, TFPW=0, PW=0, VI_BC=0, BC_ESS=0)
for _ in range(R):
    x = beta * t + ar1(rng, n, 0.4)
    cnt["MK"] += mk.original_test(x).p < 0.05
    p = mk.hamed_rao_modification_test(x, lag=1).p; cnt["HR1"] += (p < 0.05) if np.isfinite(p) else 0
    cnt["TFPW"] += mk.trend_free_pre_whitening_modification_test(x).p < 0.05
    cnt["PW"] += mk.pre_whitening_modification_test(x).p < 0.05
    cnt["VI_BC"] += vi_bc_gpt(x)[0] < 0.05
    cnt["BC_ESS"] += bc_ess_glm(x) < 0.05
print({k: round(v / R, 3) for k, v in cnt.items()}, "(GLM: MK .554, HR1 .476, TFPW-bc .572, BC-ESS .272, PW .162)")

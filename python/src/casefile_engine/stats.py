# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reference implementation of docs/03_SCIENCE.md (spec pack v3).

It produced the golden values in examples/golden/ and the synthetic examples in examples/. It is evidence,
not the product engine: never import it from python/src/ or web/. The engine must reproduce its numbers
from the spec, within the tolerances of docs/07_TESTS.md.
"""
from __future__ import annotations

import hashlib
import math
import re
from decimal import ROUND_HALF_UP, Decimal

import numpy as np
from scipy import stats

MULTIPLIER = 2.25
Z975 = 1.959963984540054
ZERO_TOL = 1e-9


# ============================================================================ seeds (03 §15)
def seed_for(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], "little")


def rng_for(text: str) -> np.random.Generator:
    return np.random.default_rng(seed_for(text))


# ============================================================================ §4.1 Mann–Kendall
def _sorted(t, x):
    t = np.asarray(t, dtype=float)
    x = np.asarray(x, dtype=float)
    o = np.argsort(t, kind="stable")
    return t[o], x[o]


def mann_kendall(t, x) -> dict:
    t, x = _sorted(t, x)
    n = len(x)
    d = np.sign(x[None, :] - x[:, None])
    S = int(np.triu(d, 1).sum())
    _, counts = np.unique(x, return_counts=True)
    var = (n * (n - 1) * (2 * n + 5) - float(np.sum(counts * (counts - 1) * (2 * counts + 5)))) / 18.0
    if S == 0 or var <= 0:
        z = 0.0
    else:
        z = (S - math.copysign(1, S)) / math.sqrt(var)
    p = float(2 * stats.norm.sf(abs(z))) if var > 0 else 1.0
    tau = S / (n * (n - 1) / 2) if n > 1 else float("nan")
    return {"n": n, "S": S, "varS": var, "tau": tau, "z": z, "p": p, "pKind": "mk_normal_cc"}


def p_from_var(S: int, var: float) -> tuple[float, float]:
    if S == 0 or var <= 0:
        return 0.0, 1.0
    z = (S - math.copysign(1, S)) / math.sqrt(var)
    return z, float(2 * stats.norm.sf(abs(z)))


# ============================================================================ §3 Sen
def pairwise_slopes(t, x):
    t, x = _sorted(t, x)
    i, j = np.triu_indices(len(x), 1)
    return np.sort((x[j] - x[i]) / (t[j] - t[i]))


def sen_slope(t, x) -> tuple[float, float]:
    t, x = _sorted(t, x)
    b = float(np.median(pairwise_slopes(t, x)))
    a = float(np.median(x) - b * np.median(t))
    return b, a


def sen_interval(t, x, var_star: float, multiplier: float) -> tuple[float, float]:
    sl = pairwise_slopes(t, x)
    N = len(sl)
    C = multiplier * math.sqrt(max(var_star, 0.0))
    lo = max(int(round((N - C) / 2)) - 1, 0)        # Python round(): half to even
    hi = min(int(round((N + C) / 2)), N - 1)
    return float(sl[lo]), float(sl[hi])


# ============================================================================ §4.2 memory
def zero_residuals(resid, x) -> bool:
    if len(resid) < 2:
        return True
    return float(np.std(resid, ddof=1)) <= ZERO_TOL * max(1.0, abs(float(np.median(x))))


def lag1_consecutive(t, r) -> float:
    t = np.asarray(t, dtype=float)
    r = np.asarray(r, dtype=float)
    n = len(r)
    rb = r.mean()
    den = float(np.sum((r - rb) ** 2))
    if den == 0:
        return 0.0
    pairs = np.where(np.diff(t) == 1)[0]
    if len(pairs) == 0:
        return 0.0
    num = float(np.sum((r[pairs] - rb) * (r[pairs + 1] - rb)))
    phi = num / den
    if len(pairs) < n - 1:
        phi *= (n - 1) / len(pairs)
    return phi


def ar1_coefficient(t, x) -> float:
    """phi-hat: the coefficient on x(t-1) in the least-squares regression x(t) = c + phi x(t-1) + delta (t - tbar),
    over consecutive-year pairs only (03 §4.2). The bias correction (n phi + 2)/(n - 4) inverts the small-sample bias
    phi - (2 + 4 phi)/n of exactly this estimator. Returns 0 when fewer than 4 pairs exist or the regression is singular."""
    t = np.asarray(t, dtype=float)
    x = np.asarray(x, dtype=float)
    k = np.where(np.diff(t) == 1)[0]
    if len(k) < 4:
        return 0.0
    y, xl, tt = x[k + 1], x[k], t[k + 1] - t.mean()
    X = np.column_stack([np.ones_like(xl), xl, tt])
    beta, _, rank, _ = np.linalg.lstsq(X, y, rcond=None)
    if rank < 3 or not np.all(np.isfinite(beta)):
        return 0.0
    return float(beta[1])


def correct_phi(phi_raw: float, n: int, is_zero: bool) -> float:
    if is_zero:
        return 0.0
    if n >= 6:
        return float(np.clip((n * phi_raw + 2) / (n - 4), 0.0, 0.95))
    return float(np.clip(phi_raw, 0.0, 0.95))


def inflation(n: int, phi: float) -> float:
    if phi == 0:
        return 1.0
    k = np.arange(1, n)
    return float(1 + 2 * np.sum((1 - k / n) * phi ** k))


def mk_ar1(t, x, multiplier: float = MULTIPLIER) -> dict:
    t, x = _sorted(t, x)
    n = len(x)
    mk = mann_kendall(t, x)
    b, a = sen_slope(t, x)
    resid = x - (a + b * t)
    is_zero = zero_residuals(resid, x)
    if is_zero:
        resid = np.zeros_like(resid)
    resid_sd = 0.0 if is_zero else float(np.std(resid, ddof=1))
    phi_raw = 0.0 if is_zero else ar1_coefficient(t, x)
    phi = correct_phi(phi_raw, n, is_zero)
    vif = inflation(n, phi)
    var_star = mk["varS"] * vif
    z, p = p_from_var(mk["S"], var_star)
    lo, hi = sen_interval(t, x, var_star, multiplier)
    lo_plain, hi_plain = sen_interval(t, x, mk["varS"], Z975)
    return {"mk": mk, "phiRaw": phi_raw, "phi": phi, "vif": vif, "varSStar": var_star, "z": z, "p": p,
            "slope": b, "intercept": a, "ciLow": lo, "ciHigh": hi, "ciLowPlain": lo_plain, "ciHighPlain": hi_plain,
            "nPairs": n * (n - 1) // 2, "residSd": resid_sd, "multiplier": multiplier}


# ============================================================================ §4.6 t-test (display only)
def ttest_neff(t, x) -> dict:
    t, x = _sorted(t, x)
    n = len(x)
    beta, alpha = np.polyfit(t, x, 1)
    e = x - (alpha + beta * t)
    is_zero = zero_residuals(e, x)
    if is_zero:
        e = np.zeros_like(e)
    sxx = float(np.sum((t - t.mean()) ** 2))
    se = 0.0 if is_zero else math.sqrt(float(np.sum(e ** 2)) / (n - 2) / sxx)
    r1 = 0.0 if is_zero else lag1_consecutive(t, e)
    phi = correct_phi(r1, n, is_zero)
    neff = n * (1 - phi) / (1 + phi)
    out = {"available": neff > 3, "slopePerYear": float(beta), "intercept": float(alpha), "se": se, "r1": r1,
           "phi": phi, "nEff": neff, "seAdj": None, "t": None, "df": None, "p": None,
           "ciLowPerYear": None, "ciHighPerYear": None, "role": "display_only"}
    if neff <= 3:
        return out
    se_adj = se * math.sqrt((n - 2) / (neff - 2))
    df = neff - 2
    out.update({"seAdj": se_adj, "df": df})
    if se_adj == 0:
        if abs(beta) <= ZERO_TOL * max(1.0, abs(float(np.median(x)))):
            out.update({"slopePerYear": 0.0, "t": None, "p": 1.0, "ciLowPerYear": 0.0, "ciHighPerYear": 0.0})
        else:
            out.update({"t": None, "p": 0.0, "ciLowPerYear": float(beta), "ciHighPerYear": float(beta)})
        return out
    tt = beta / se_adj
    q = float(stats.t.ppf(0.975, df))
    out.update({"t": float(tt), "p": float(2 * stats.t.sf(abs(tt), df)),
                "ciLowPerYear": float(beta - q * se_adj), "ciHighPerYear": float(beta + q * se_adj)})
    return out


# ============================================================================ §7 families
def holm(p, m: int | None = None) -> np.ndarray:
    p = np.array([1.0 if (v is None or not np.isfinite(v)) else v for v in p], dtype=float)
    m = len(p) if m is None else m
    assert m >= len(p)
    o = np.argsort(p, kind="stable")
    adj = np.empty_like(p)
    running = 0.0
    for rank, idx in enumerate(o):
        running = max(running, min(1.0, (m - rank) * p[idx]))
        adj[idx] = running
    return adj


def benjamini_hochberg(p, m: int | None = None) -> np.ndarray:
    p = np.array([1.0 if (v is None or not np.isfinite(v)) else v for v in p], dtype=float)
    m = len(p) if m is None else m
    assert m >= len(p)
    o = np.argsort(p, kind="stable")
    q = np.empty_like(p)
    running = 1.0
    for rank in range(len(p) - 1, -1, -1):
        idx = o[rank]
        running = min(running, m * p[idx] / (rank + 1))
        q[idx] = min(running, 1.0)
    return q


# ============================================================================ §5.3 leftover memory
def _acf(e, k):
    e = e - e.mean()
    den = float(np.sum(e * e))
    return float(np.sum(e[k:] * e[:-k]) / den) if den > 0 else 0.0


def cell_phi(t, x) -> float:
    """phi-tilde of one cell series, with the MK-AR1 estimator and correction (zero residuals give 0)."""
    t = np.asarray(t, dtype=float); x = np.asarray(x, dtype=float)
    b, a = sen_slope(t, x)
    is_zero = zero_residuals(x - (a + b * t), x)
    return correct_phi(0.0 if is_zero else ar1_coefficient(t, x), len(x), is_zero)


def leftover_stat(t, cells, lags=(2, 3, 4), max_cells=200, rho_power=2) -> dict:
    cells = np.asarray(cells, dtype=float)
    if cells.ndim == 1:
        cells = cells[None, :]
    m_all = cells.shape[0]
    if m_all > max_cells:
        k = math.ceil(m_all / max_cells)
        cells = cells[::k]
    t = np.asarray(t, dtype=float)
    resid = []
    s_cells = []
    for x in cells:
        b, a = np.polyfit(t, x, 1)
        e = x - (a + b * t)
        resid.append(e)
        a1 = _acf(e, 1)
        s_cells.append(np.mean([_acf(e, k) - a1 ** k for k in lags]))
    m = len(resid)
    if m > 1:
        c = np.corrcoef(np.array(resid))
        rho = float(np.clip((c.sum() - m) / (m * (m - 1)), 0.0, 1.0))
    else:
        rho = 1.0
    # the per-cell statistic is a ratio of quadratic forms, so its correlation between two cells is close to the square
    # of the cells' correlation: m_eff uses rho-bar squared (03 §5.3; tools/decide/decide_leftover.py)
    m_eff = m / (1 + (m - 1) * rho ** rho_power) if m > 1 else 1.0
    phi_cells = float(np.median([cell_phi(t, x) for x in cells]))
    return {"stat": float(np.mean(s_cells)), "m": m, "mEff": m_eff, "rhoBar": rho, "phiCells": phi_cells}


def m_eff_step(m_eff: float, steps=(1, 2, 3, 5, 10, 20)) -> int:
    best = steps[0]
    for s in steps:
        if m_eff + 1e-12 >= s:
            best = s
    return best


def phi_bin(phi: float, step=0.1, cap=0.8) -> float:
    return round(min(cap, max(0.0, round(phi / step) * step)), 1)


_CRIT_INDEX: dict = {}


def leftover_critical(n: int, m_eff: float, phi: float, table: list[dict]) -> float:
    """Critical value for the record's n (largest tabulated n not above it), the m_eff step (rounded down) and the
    cells' memory phi, linearly interpolated between the table's 0.1 steps and capped at 0.8 (03 §5.3)."""
    key = id(table)
    if key not in _CRIT_INDEX:
        _CRIT_INDEX[key] = ({(row["n"], row["mEff"], round(row["phi"], 1)): row["critical"] for row in table},
                            sorted({row["n"] for row in table}))
    index, ns = _CRIT_INDEX[key]
    nn = max([v for v in ns if v <= n] or [ns[0]])
    ms = m_eff_step(m_eff)
    ph = min(0.8, max(0.0, float(phi)))
    lo = math.floor(ph / 0.1 + 1e-9) / 10
    hi = min(0.8, round(lo + 0.1, 1))
    clo = index[(nn, ms, round(lo, 1))]
    if hi <= lo:
        return clo
    w = (ph - lo) / 0.1
    return (1 - w) * clo + w * index[(nn, ms, round(hi, 1))]


def simulate_leftover_table(ns, msteps, phis, reps, n_seed_text="leftoverCritical") -> list[dict]:
    rows = []
    for n in ns:
        t = np.arange(n, dtype=float)
        for m in msteps:
            for phi in phis:
                rng = rng_for(f"{n_seed_text}|{n}|{phi}|{m}")
                vals = []
                for _ in range(reps):
                    cells = np.array([ar1(rng, n, phi) for _ in range(m)])
                    vals.append(leftover_stat(t, cells)["stat"])
                rows.append({"n": n, "mEff": m, "phi": round(phi, 1), "critical": float(np.quantile(vals, 0.95)), "reps": reps})
    return rows


# ============================================================================ noise models
def ar1(rng, n, phi):
    x = np.empty(n)
    x[0] = rng.normal()
    s = math.sqrt(1 - phi ** 2)
    e = rng.normal(size=n)
    for k in range(1, n):
        x[k] = phi * x[k - 1] + s * e[k]
    return x


def ar2(rng, n, p1, p2, burn=500):
    m = n + burn
    x = np.zeros(m)
    e = rng.normal(size=m)
    for k in range(2, m):
        x[k] = p1 * x[k - 1] + p2 * x[k - 2] + e[k]
    return x[burn:]


# ============================================================================ §12 text
def decimals_for(x: float) -> int:
    if x == 0 or not math.isfinite(x):
        return 0
    d = 2 - 1 - math.floor(math.log10(abs(x)))
    return int(min(4, max(0, d)))


BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def fixed(x: float, d: int) -> str:
    q = Decimal(x).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)
    s = format(q, "f")
    if s.startswith("-") and set(s[1:]) <= set("0."):
        s = s[1:]
    return s.replace("-", "−")


def signed(x: float, d: int) -> str:
    s = fixed(x, d)
    if not s.startswith("−") and set(s) - set("0.") != set():
        return "+" + s
    return s


def p_expr(p: float) -> str:
    if p < 0.001:
        return "p < 0.001"
    if p < 0.1:
        return "p = " + fixed(p, 3)
    return "p = " + fixed(p, 2)


_LATIN_WORD = re.compile(r"[A-Za-z][A-Za-z0-9_\-]*")


def to_bn(s: str) -> str:
    """Bangla digits everywhere except inside words that contain Latin letters (dataset names such as MERRA-2)."""
    out, last = [], 0
    for m in _LATIN_WORD.finditer(s):
        out.append(s[last:m.start()].translate(BN_DIGITS))
        out.append(m.group(0))
        last = m.end()
    out.append(s[last:].translate(BN_DIGITS))
    return "".join(out)


def fill(template: str, params: dict) -> str:
    out = template
    for k, v in params.items():
        out = out.replace("{" + k + "}", str(v))
    if "{" in out and "}" in out:
        import re
        left = re.findall(r"\{[a-zA-Z_]+\}", out)
        if left:
            raise KeyError(f"unfilled placeholders {left} in {template!r}")
    return out

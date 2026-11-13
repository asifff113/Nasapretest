# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""The 1° annual map field (docs/02_DATA.md §4 and §6, docs/01_ARCHITECTURE.md §5).

Each month of a global native field is regridded to the 1° grid by separable conservative averaging:
A_lat[i, j] is the overlap of destination row i and source row j measured in sin(latitude); A_lon[k, l] the overlap
of destination column k and source column l in degrees, wrapping at ±180°. With M the validity mask and X the data
with NaN set to 0: num = A_lat (X·M) A_lonᵀ, den = A_lat M A_lonᵀ, full = A_lat 1 A_lonᵀ; the 1° value is num / den
where den / full ≥ 0.5, else NaN. The annual values then come from the engine's own function
(`casefile_engine.bundle.annual_field`), so the map uses the same day weights and completeness rules as verdicts.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from casefile_engine.base import ONE

from .grids import lat_bounds, lon_bounds

MIN_COVER = 0.5


def lat_matrix(src: dict, dst: dict = ONE) -> np.ndarray:
    """A_lat [dst rows][src rows]: overlap in sin(latitude)."""
    ss, sn = lat_bounds(src)
    ds, dn = lat_bounds(dst)
    lo = np.maximum(ds[:, None], ss[None, :])
    hi = np.minimum(dn[:, None], sn[None, :])
    return np.where(hi > lo, np.sin(np.radians(hi)) - np.sin(np.radians(lo)), 0.0)


def lon_matrix(src: dict, dst: dict = ONE) -> np.ndarray:
    """A_lon [dst cols][src cols]: overlap in degrees, wrapping at ±180° (source cells shifted by −360, 0, +360)."""
    sw, se = lon_bounds(src)
    dw, de = lon_bounds(dst)
    out = np.zeros((dw.size, sw.size))
    for shift in (-360.0, 0.0, 360.0):
        lo = np.maximum(dw[:, None], sw[None, :] + shift)
        hi = np.minimum(de[:, None], se[None, :] + shift)
        out += np.clip(hi - lo, 0.0, None)
    return out


def regrid_month(x: np.ndarray, a_lat: np.ndarray, a_lon: np.ndarray) -> np.ndarray:
    """One month [src rows][src cols] → [180][360] by the conservative rule (NaN where under half is covered)."""
    m = np.isfinite(x).astype(np.float64)
    xz = np.where(m > 0, x, 0.0)
    num = a_lat @ (xz * m) @ a_lon.T
    den = a_lat @ m @ a_lon.T
    full = a_lat @ np.ones_like(m) @ a_lon.T
    with np.errstate(invalid="ignore", divide="ignore"):
        v = num / den
    v[~(den >= MIN_COVER * full) | (full <= 0)] = np.nan
    return v


def regrid(values: np.ndarray, src: dict, dst: dict = ONE) -> np.ndarray:
    """[n_months][src rows][src cols] on `src` → [dst rows][dst cols][n_months] (float64)."""
    a_lat, a_lon = lat_matrix(src, dst), lon_matrix(src, dst)
    out = np.empty((dst["nlat"], dst["nlon"], values.shape[0]))
    for t in range(values.shape[0]):
        out[:, :, t] = regrid_month(np.asarray(values[t], dtype=np.float64), a_lat, a_lon)
    return out


def write_map(out: Path, variable: str, start: str, monthly_1deg: np.ndarray, first: int, last: int) -> Path:
    """map/<variable>__ANN.npz: years [n] and values [180][360][n] from the engine's annual rules."""
    from casefile_engine.bundle import annual_field

    years, vals = annual_field(variable, start, monthly_1deg, first, last)
    p = Path(out) / f"map/{variable}__ANN.npz"
    p.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(p, years=np.asarray(years, dtype=int), values=vals)
    return p

# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Synthetic global screening map (03_SCIENCE §7.5) and cell tiles for examples/ (reference only)."""
from __future__ import annotations

import math

import numpy as np
from scipy import stats

from . import stats as R
from . import layer as L
from . import base as M

NLAT, NLON = 180, 360
YEARS = np.arange(1980, 2026)
NY = len(YEARS)


def synthetic_field():
    rng = R.rng_for("map|air_temp|ANN|")
    lat = 89.5 - np.arange(NLAT)
    lon = -179.5 + np.arange(NLON)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    trend = 0.012 + 0.025 * (LAT / 90.0) ** 2
    trend += 0.045 * np.exp(-(((LAT - 59.5) / 4) ** 2 + ((LON - 90.5) / 6) ** 2))
    trend -= 0.050 * np.exp(-(((LAT - 51.5) / 4) ** 2 + ((LON + 34.5) / 6) ** 2))
    base = 27.0 - 0.45 * np.abs(LAT)
    phi = 0.3
    noise = np.zeros((NLAT, NLON, NY))
    prev = rng.normal(size=(NLAT, NLON))
    for k in range(NY):
        w = rng.normal(size=(NLAT, NLON))
        w = (w + np.roll(w, 1, 1) + np.roll(w, -1, 1) + np.roll(w, 1, 0) + np.roll(w, -1, 0)) / math.sqrt(5)
        prev = phi * prev + math.sqrt(1 - phi ** 2) * w if k else w
        noise[:, :, k] = prev
    V = base[:, :, None] + trend[:, :, None] * (YEARS - 1980)[None, None, :] + 0.3 * noise
    # mixed memory patch (should be hatched by the leftover-memory check): 20–35° S, 60–85° E
    patch = (LAT <= -20) & (LAT >= -35) & (LON >= 60) & (LON <= 85)
    idx = np.argwhere(patch)
    for r, c in idx:
        V[r, c, :] = base[r, c] + 0.6 * (R.ar1(rng, NY, 0.1) + R.ar1(rng, NY, 0.9))
    # missing years (hatched): south of 75° S, 1995–1997
    miss = LAT <= -75
    V[miss, 15:18] = np.nan
    return V, LAT, LON


def neighbourhood_sum(A, valid, radius=2):
    """Sum over a (2r+1)^2 window: longitude wraps, latitude clamps (no duplicate rows). A: (NLAT, NLON, ...)."""
    out = np.zeros_like(A)
    cnt = np.zeros((NLAT, NLON))
    for dr in range(-radius, radius + 1):
        rows_src = np.arange(NLAT) + dr
        ok_rows = (rows_src >= 0) & (rows_src < NLAT)
        for dc in range(-radius, radius + 1):
            shifted = np.roll(A, -dc, axis=1)
            vshift = np.roll(valid, -dc, axis=1)
            tgt = np.where(ok_rows)[0]
            src = rows_src[ok_rows]
            out[tgt] += np.where(vshift[src][..., None] if A.ndim == 3 else vshift[src], shifted[src], 0)
            cnt[tgt] += vshift[src]
    return out, cnt


def build_map(tables, prereg_sha, manifest_sha, variable="air_temp", season="ANN", years=None, field=None, golden=True):
    """The screening map of one variable and season on the 1° grid (03 §7.5). `field` is [180][360][n_years], rows from
    89.5° N to 89.5° S, columns from 179.5° W to 179.5° E; None builds the synthetic example field."""
    global YEARS, NY
    cfg = M.CFG
    if field is None:
        YEARS = np.arange(1980, 2026)
        NY = len(YEARS)
        V, LAT, LON = synthetic_field()
    else:
        YEARS = np.asarray(years, dtype=int)
        NY = len(YEARS)
        V = np.asarray(field, dtype=float)
        if V.shape != (NLAT, NLON, NY):
            raise ValueError(f"map field must be [{NLAT}][{NLON}][{NY}], got {V.shape}")
    units = M.VARS[variable]["units"]["aggregated"]
    t = YEARS.astype(float)
    complete = np.all(np.isfinite(V), axis=2)
    flat = V.reshape(-1, NY)
    ncell = flat.shape[0]
    i, j = np.triu_indices(NY, 1)
    dt = (t[j] - t[i])
    b = np.full(ncell, np.nan); a = np.full(ncell, np.nan); phi_cell = np.full(ncell, np.nan)
    S = np.zeros(ncell); s_cell = np.full(ncell, np.nan)
    z_ols = np.zeros((ncell, NY))
    comp = complete.reshape(-1)
    for start in range(0, ncell, 4000):
        sl = slice(start, min(ncell, start + 4000))
        X = flat[sl]
        ok = comp[sl]
        Xc = np.where(ok[:, None], X, 0.0)
        D = Xc[:, j] - Xc[:, i]
        S[sl] = np.where(ok, np.sign(D).sum(axis=1), 0)
        bb = np.median(D / dt, axis=1)
        aa = np.median(Xc, axis=1) - bb * np.median(t)
        resid = Xc - (aa[:, None] + bb[:, None] * t[None, :])
        # phi-hat: AR(1) coefficient of x(t) = c + phi x(t-1) + delta (t - tbar), batch least squares (03 §4.2)
        yy = Xc[:, 1:]; xl = Xc[:, :-1]; tt = t[1:] - t.mean()
        Xd = np.stack([np.ones_like(xl), xl, np.broadcast_to(tt, xl.shape)], axis=2)
        XtX = np.einsum("rki,rkj->rij", Xd, Xd); Xty = np.einsum("rki,rk->ri", Xd, yy)
        diag = XtX[:, 0, 0] * XtX[:, 1, 1] * XtX[:, 2, 2]
        rel = np.abs(np.linalg.det(XtX)) / np.where(diag > 0, diag, 1.0)
        good = ok & (rel > 1e-12)
        beta = np.linalg.solve(np.where(good[:, None, None], XtX, np.eye(3)[None]),
                               np.where(good[:, None], Xty, 0.0)[..., None])[..., 0]
        ph = np.where(good, beta[:, 1], 0.0)
        rsd = resid.std(axis=1, ddof=1)
        ph = np.where(rsd <= 1e-9 * np.maximum(1.0, np.abs(np.median(Xc, axis=1))), 0.0, ph)   # zero residuals (03 §4.5)
        ph = np.clip((NY * ph + 2) / (NY - 4), 0.0, 0.95)
        b[sl] = np.where(ok, bb, np.nan); a[sl] = aa; phi_cell[sl] = np.where(ok, ph, np.nan)
        # OLS residuals for the leftover statistic
        tm = t - t.mean()
        beta = (Xc * tm).sum(axis=1) / (tm ** 2).sum()
        alpha = Xc.mean(axis=1) - beta * t.mean()
        e = Xc - (alpha[:, None] + beta[:, None] * t[None, :])
        e = e - e.mean(axis=1, keepdims=True)
        ee = (e * e).sum(axis=1)
        acf = [np.where(ee > 0, (e[:, k:] * e[:, :-k]).sum(axis=1) / np.where(ee > 0, ee, 1), 0) for k in (1, 2, 3, 4)]
        s_cell[sl] = np.where(ok, np.mean([acf[k - 1] - acf[0] ** k for k in (2, 3, 4)], axis=0), np.nan)
        sd = np.sqrt(ee / NY)
        z_ols[sl] = np.where((ok & (sd > 0))[:, None], e / np.where(sd > 0, sd, 1)[:, None], 0.0)
    b = b.reshape(NLAT, NLON); phi_cell = phi_cell.reshape(NLAT, NLON); S = S.reshape(NLAT, NLON)
    s_cell = s_cell.reshape(NLAT, NLON); z_ols = z_ols.reshape(NLAT, NLON, NY)
    # pooled phi: median over the 5 x 5 neighbourhood
    pooled = np.full((NLAT, NLON), np.nan)
    pad = np.concatenate([phi_cell[:, -2:], phi_cell, phi_cell[:, :2]], axis=1)
    for r in range(NLAT):
        r0, r1 = max(0, r - 2), min(NLAT, r + 3)
        block = pad[r0:r1]
        for c in range(NLON):
            if complete[r, c]:
                vals = block[:, c:c + 5].ravel()
                vals = vals[np.isfinite(vals)]
                pooled[r, c] = np.median(vals) if vals.size else np.nan
    # leftover statistic pooled over the neighbourhood, with m_eff from the mean correlation
    s_sum, cnt = neighbourhood_sum(np.nan_to_num(s_cell), complete)
    zsum, _ = neighbourhood_sum(z_ols, complete)
    m = cnt
    rho = np.where(m > 1, ((zsum ** 2).sum(axis=2) / NY - m) / np.where(m > 1, m * (m - 1), 1), 1.0)
    rho = np.clip(rho, 0, 1)
    m_eff = np.where(m > 0, m / np.where(m > 0, 1 + (m - 1) * rho ** 2, 1), 1.0)   # rho-bar squared (03 §5.3)
    s_reg = np.where(m > 0, s_sum / np.where(m > 0, m, 1), np.nan)
    phimax = L.phi_max_for(NY, tables["calibration"], cfg["domain"]["max_false_alarm_pct"])
    var0 = NY * (NY - 1) * (2 * NY + 5) / 18.0
    flags = np.zeros((NLAT, NLON), dtype=np.uint8)
    p = np.full((NLAT, NLON), np.nan)
    lo = np.full((NLAT, NLON), np.nan); hi = np.full((NLAT, NLON), np.nan)
    for r in range(NLAT):
        for c in range(NLON):
            if not complete[r, c]:
                flags[r, c] |= 4
                continue
            ph = float(pooled[r, c])
            if ph > phimax + 1e-12:
                flags[r, c] |= 8
            crit = R.leftover_critical(NY, float(m_eff[r, c]), ph, tables["leftoverCritical"])
            if s_reg[r, c] > crit:
                flags[r, c] |= 16
            vif = R.inflation(NY, ph)
            z, pp = R.p_from_var(int(S[r, c]), var0 * vif)
            p[r, c] = pp
            if not math.isfinite(pp):
                flags[r, c] |= 32
            if flags[r, c] == 0:
                flags[r, c] |= 1
                x = V[r, c]
                l_, h_ = R.sen_interval(t, x, var0 * vif, M.MULT)
                lo[r, c], hi[r, c] = l_, h_
    test = (flags & 1) == 1
    q = np.full((NLAT, NLON), np.nan)
    q[test] = R.benjamini_hochberg(p[test], int(test.sum()))
    sig = test & (q < 0.10)
    flags[sig] |= 2
    rate = np.where(test, 10 * b, 0.0)
    colour = float(np.percentile(np.abs(rate[test]), 98))
    if units.startswith("°"):
        scale, tscale = 0.001, 0.01          # int16 holds ±32.7 °C per decade and ±327 °C
    elif units == "mm":
        scale, tscale = 0.1, 1.0             # ±3276 mm per decade and ±32767 mm
    else:                                    # any other variable: the smallest power of ten that fits its values
        top = float(np.nanmax(np.abs(V))) if np.isfinite(V).any() else 1.0
        tscale = 10.0 ** math.ceil(math.log10(max(top, 1e-12) / 30000.0))
        scale = tscale / 10.0

    def i16(x):
        return np.where(test, np.round(np.nan_to_num(x) / scale), -32768).astype("<i2")

    blob = b"".join([i16(rate).tobytes(), i16(10 * lo).tobytes(), i16(10 * hi).tobytes(),
                     np.where(test, p, np.nan).astype("<f4").tobytes(), np.where(test, q, np.nan).astype("<f4").tobytes(),
                     flags.astype("u1").tobytes()])
    out_dir = M.EX / f"maps/{variable}/{season}"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "cells.bin.gz").write_bytes(M.gz(blob))
    meta = {"schema": "casefile/map@3", "synthetic": M.SYNTH, "variable": variable, "season": season, "grid": M.ONE,
            "window": {"id": "main", "first": int(YEARS[0]), "last": int(YEARS[-1])}, "label": "exploration", "units": units,
            "nCells": int(NLAT * NLON), "nTestable": int(test.sum()), "nSignificant": int(sig.sum()), "fdrQ": 0.1, "colourLimit": colour,
            "file": "cells.bin.gz", "byteOrder": "little", "layout": "field-major: each field is a [nlat][nlon] block, in the order listed",
            "fields": [{"name": "rate", "dtype": "int16", "scale": scale, "offset": 0.0, "fill": -32768},
                       {"name": "rate_low", "dtype": "int16", "scale": scale, "offset": 0.0, "fill": -32768},
                       {"name": "rate_high", "dtype": "int16", "scale": scale, "offset": 0.0, "fill": -32768},
                       {"name": "p", "dtype": "float32", "scale": 1.0, "offset": 0.0, "fill": None},
                       {"name": "q", "dtype": "float32", "scale": 1.0, "offset": 0.0, "fill": None},
                       {"name": "flags", "dtype": "uint8", "scale": 1.0, "offset": 0.0, "fill": None}],
            "flagBits": {"testable": 1, "significant": 2, "short_or_missing": 4, "phi_out_of_range": 8, "leftover_memory": 16, "not_finite": 32},
            "provenance": M.provenance(variable, prereg_sha, manifest_sha)}
    M.write_json(f"maps/{variable}/{season}/meta.json", meta)
    # cell tiles (ANN only in the example): [row][col][season][year] int16, scale 0.01
    tiles = [(3, 27), (8, 17), (8, 18)] if field is None else [(tr, tc) for tr in range(NLAT // 10) for tc in range(NLON // 10)]
    tdir = M.EX / f"cells/{variable}/t"
    tdir.mkdir(parents=True, exist_ok=True)
    for tr, tc in tiles:
        blk = V[tr * 10:(tr + 1) * 10, tc * 10:(tc + 1) * 10, :]
        arr = np.where(np.isfinite(blk), np.round(blk / tscale), -32768).astype("<i2")[:, :, None, :]
        (tdir / f"{tr}_{tc}.bin.gz").write_bytes(M.gz(arr.tobytes()))
    M.write_json(f"cells/{variable}/meta.json", {"schema": "casefile/cell_tiles@3", "synthetic": M.SYNTH, "variable": variable, "grid": M.ONE,
                  "tile": {"rows": 10, "cols": 10}, "seasons": [season], "years": {"first": int(YEARS[0]), "last": int(YEARS[-1])}, "units": units,
                  "dtype": "int16", "byteOrder": "little", "scale": tscale, "offset": 0.0, "fill": -32768, "layout": "[row][col][season][year]",
                  "path": "t/<tr>_<tc>.bin.gz", "tilesPresent": [list(x) for x in tiles],
                  "provenance": M.provenance(variable, prereg_sha, manifest_sha)})
    if not golden:
        return meta
    # a few cells for the golden map test (G-05)
    cases = []
    for name, r, c in (("hot_spot", 30, 270), ("cold_spot", 38, 145), ("mixed_memory_patch", 117, 252), ("missing_years", 170, 10), ("ordinary", 85, 182)):
        cases.append({"name": name, "row": r, "col": c, "flags": int(flags[r, c]), "testable": bool(test[r, c]), "significant": bool(sig[r, c]),
                      "ratePerDecade": float(10 * b[r, c]) if test[r, c] else None, "p": float(p[r, c]) if test[r, c] else None,
                      "q": float(q[r, c]) if test[r, c] else None, "pooledPhi": float(pooled[r, c]) if complete[r, c] else None,
                      "leftoverStat": float(s_reg[r, c]) if complete[r, c] else None, "mEff": float(m_eff[r, c]) if complete[r, c] else None})
    M.write_json("golden/map_cells.json", {"meta": {"generator": "casefile_engine.mapbuild", "rules": "docs/03_SCIENCE.md §7.5",
                 "map": "examples/maps/air_temp/ANN", "nTestable": int(test.sum()), "nSignificant": int(sig.sum()),
                 "tolerances": "docs/07_TESTS.md §1"}, "cells": cases})
    return meta

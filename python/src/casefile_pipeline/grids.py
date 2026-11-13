# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""The pipeline's grid list (docs/02_DATA.md §4 and §14 step 5).

The definitions are the engine's own (`casefile_engine.base`), so the pipeline and the engine can never disagree
about a grid. A new dataset on a new grid adds one entry to `GRIDS`; `casefile-pipeline regions` then writes masks
and the support result for it as well.

A grid is a dict: id, lat0 and lon0 (degrees, centre of row 0 and column 0), dlat and dlon (degrees, signed),
nlat and nlon (counts).
"""
from __future__ import annotations

import numpy as np

from casefile_engine.base import IMERG, MERRA2, ONE, RE, edges

# GLDAS-2.1 Noah 1° (GLDAS_NOAH10_M 2.1): 360 × 150 cells, first centre 179.5° W 59.5° S, latitude increasing with the
# row (GLDAS-2 README, GES DISC, Table 1, revised 13 Aug 2025; read in one granule on 13 Nov 2026). Land only: sea
# cells hold the fill value.
GLDAS = {"id": "gldas_1deg", "lat0": -59.5, "dlat": 1.0, "nlat": 150, "lon0": -179.5, "dlon": 1.0, "nlon": 360}

# MODIS CMG at 0.5°: the 0.05° Climate Modeling Grid of MOD13C2 061 (3600 × 7200 cells, centres 89.975° N…89.975° S and
# 179.975° W…179.975° E, read in MOD13C2.A2020001.061 on 14 Nov 2026), averaged by the reader over blocks of 10 × 10
# cells (sources/modis.py). Latitude increasing with the row, like every native grid here.
MODIS05 = {"id": "modis_05deg", "lat0": -89.75, "dlat": 0.5, "nlat": 360, "lon0": -179.75, "dlon": 0.5, "nlon": 720}

GRIDS: dict[str, dict] = {g["id"]: g for g in (MERRA2, IMERG, ONE, GLDAS, MODIS05)}
NATIVE_GRIDS: tuple[str, ...] = (MERRA2["id"], IMERG["id"])     # first-release grids: they decide whether a region is in the set


def mask_grids() -> tuple[str, ...]:
    """Every grid that gets region masks: the first-release grids, then the grid of any other registered reader.
    A region that fails the support rule on an added grid simply gets no series for that grid's variables."""
    from .sources import READERS

    extra = sorted({r.grid_id for r in READERS.values()} - set(NATIVE_GRIDS))
    return NATIVE_GRIDS + tuple(extra)


def lat_centres(g: dict) -> np.ndarray:
    """Latitude of each row centre, degrees."""
    return g["lat0"] + g["dlat"] * np.arange(g["nlat"])


def lon_centres(g: dict) -> np.ndarray:
    """Longitude of each column centre, degrees."""
    return g["lon0"] + g["dlon"] * np.arange(g["nlon"])


def lat_bounds(g: dict) -> tuple[np.ndarray, np.ndarray]:
    """(south, north) edge of every row, degrees, clipped to ±90 (polar rows of MERRA-2 are half cells)."""
    a, b = edges(g, "lat")
    return np.minimum(a, b), np.maximum(a, b)


def lon_bounds(g: dict) -> tuple[np.ndarray, np.ndarray]:
    """(west, east) edge of every column, degrees (not wrapped)."""
    return edges(g, "lon")


def row_areas(g: dict) -> np.ndarray:
    """Area of one cell in each row, km²: R² × Δλ × (sin φ_north − sin φ_south), R = 6371.0088 km."""
    s, n = lat_bounds(g)
    return RE ** 2 * np.radians(abs(g["dlon"])) * (np.sin(np.radians(n)) - np.sin(np.radians(s)))


def index_box(g: dict, bbox: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    """Rows and columns of `g` whose cells overlap bbox (W, S, E, N): (row0, row1, col0, col1), end exclusive.

    Only for grids whose latitude increases with the row (the native grids). No wrap at ±180°."""
    w, s, e, n = bbox
    if g["dlat"] <= 0:
        raise ValueError("index_box expects latitude to increase with the row")
    sb, nb = lat_bounds(g)
    wb, eb = lon_bounds(g)
    eps = 1e-9                                         # edges are sums of floats: ignore slivers under a nanodegree
    rows = np.where((nb > s + eps) & (sb < n - eps))[0]
    cols = np.where((eb > w + eps) & (wb < e - eps))[0]
    return int(rows[0]), int(rows[-1]) + 1, int(cols[0]), int(cols[-1]) + 1

# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Monthly region means, cell values and pair series (docs/01_ARCHITECTURE.md §5, docs/02_DATA.md §7.2, §7.4).

Region mean of one month: Σ wᵢ xᵢ / Σ wᵢ over the mask's cells with a finite value, wᵢ = fraction × cell area
(km²). NaN when cells holding more than 10% of Σ wᵢ are missing that month. Space first, then time: these are
monthly values; the engine makes every annual and season value.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from casefile_engine.base import fpath

from .grids import GRIDS, row_areas

MAX_MISSING_WEIGHT = 0.10        # docs/01_ARCHITECTURE.md §5
MAX_CELLS = 2000                 # more cells than this: keep every k-th


@dataclass
class MonthlyField:
    """One variable's monthly values on a native grid, as stored by `casefile-pipeline fetch`."""
    months: list[str]            # 'YYYY-MM', consecutive
    values: np.ndarray           # [n_months][n_rows][n_cols] float32, monthly unit, NaN = missing
    grid_id: str
    row0: int = 0                # row and column of values[:, 0, 0] on the grid (IMERG keeps a box)
    col0: int = 0


def pad_to_january(months: list[str], values: np.ndarray) -> tuple[str, np.ndarray]:
    """(start 'YYYY-01', values) with NaN months added before the first month so the series starts in January."""
    lead = int(months[0][5:7]) - 1
    if lead:
        pad = np.full((lead,) + values.shape[1:], np.nan, dtype=values.dtype)
        values = np.concatenate([pad, values], axis=0)
    return f"{months[0][:4]}-01", values


def cell_matrix(field: MonthlyField, cells: list[list]) -> np.ndarray:
    """Each mask cell's monthly values [n_cells][n_months], in mask order (float64)."""
    v = field.values
    rows = np.array([r for r, _, _ in cells], dtype=int) - field.row0
    cols = np.array([c for _, c, _ in cells], dtype=int) - field.col0
    if rows.size and (rows.min() < 0 or cols.min() < 0 or rows.max() >= v.shape[1] or cols.max() >= v.shape[2]):
        raise ValueError(f"a mask cell lies outside the stored {field.grid_id} box: fetch with a box covering every region")
    return np.asarray(v[:, rows, cols], dtype=np.float64).T


def weights(cells: list[list], grid_id: str) -> np.ndarray:
    """w = fraction × cell area (km²) for each mask cell."""
    a = row_areas(GRIDS[grid_id])
    return np.array([f * a[r] for r, _, f in cells], dtype=np.float64)


def region_mean(x: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Monthly weighted mean of x [n_cells][n_months] with weights w; NaN where > 10% of Σw is missing."""
    fin = np.isfinite(x)
    wf = w[:, None] * fin
    num = np.where(fin, x, 0.0) * w[:, None]
    cover = wf.sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = num.sum(axis=0) / cover
    mean[cover < (1.0 - MAX_MISSING_WEIGHT) * w.sum() - 1e-9] = np.nan
    return mean


def thin(x: np.ndarray, limit: int = MAX_CELLS) -> np.ndarray:
    """Keep every k-th row when there are more than `limit` cells (k = ⌈n / limit⌉)."""
    if x.shape[0] <= limit:
        return x
    return x[:: int(np.ceil(x.shape[0] / limit))]


def write_series(out: Path, variable: str, region: str, field: MonthlyField, cells: list[list]) -> Path:
    """series/<variable>/<region>.npz with start, monthly, cells, area_km2, effective_cells, grid."""
    start, values = pad_to_january(field.months, field.values)
    f = MonthlyField(field.months, values, field.grid_id, field.row0, field.col0)
    x = cell_matrix(f, cells)
    w = weights(cells, field.grid_id)
    p = Path(out) / f"series/{variable}/{fpath(region)}.npz"
    p.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(p, start=start, monthly=region_mean(x, w), cells=thin(x), area_km2=float(w.sum()),
                        effective_cells=float(sum(c[2] for c in cells)), grid=field.grid_id)
    return p


def split_cells(cells_a: list[list], cells_b: list[list]) -> tuple[list[list], list[list]]:
    """Disjoint cells for a pair (02 §7.4): a cell both regions touch goes to the one holding the larger fraction;
    a tie drops it from both. Same rule as casefile_engine.base.pair_split."""
    fa = {(r, c): f for r, c, f in cells_a}
    fb = {(r, c): f for r, c, f in cells_b}
    keep_a = [[r, c, f] for r, c, f in cells_a if (r, c) not in fb or f > fb[(r, c)]]
    keep_b = [[r, c, f] for r, c, f in cells_b if (r, c) not in fa or f > fa[(r, c)]]
    return keep_a, keep_b


def write_pair(out: Path, variable: str, pair_id: str, field: MonthlyField, cells_a: list[list], cells_b: list[list]) -> Path:
    """pairs/<variable>/<pair id>.npz with start, a, b: the two monthly means on the pair's disjoint cells."""
    start, values = pad_to_january(field.months, field.values)
    f = MonthlyField(field.months, values, field.grid_id, field.row0, field.col0)
    ka, kb = split_cells(cells_a, cells_b)
    a = region_mean(cell_matrix(f, ka), weights(ka, field.grid_id))
    b = region_mean(cell_matrix(f, kb), weights(kb, field.grid_id))
    p = Path(out) / f"pairs/{variable}/{pair_id}.npz"
    p.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(p, start=start, a=a, b=b)
    return p

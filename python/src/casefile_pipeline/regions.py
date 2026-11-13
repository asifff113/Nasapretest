# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Region masks, the support rule and pair splits; writes regions/ of the bundle (docs/02_DATA.md §7.2–§7.4).

- Cell fractions: the share of 5 × 5 sample points per cell that fall inside the region (even–odd rule, holes
  respected, through shapely). A region that is exactly a box uses the engine's exact overlap (`box_weights`).
- Support: S1 effective cells Σf ≥ min_native_cells and S2 spill share ≤ max_spill_share on every native grid
  (`casefile_engine.base.spill_share`); inSet = passes on every grid. Thresholds from config/analysis.yaml.
- regions/index.json lists support and mask files for the first-release grids only: the engine copies every grid
  there into prereg.json as the region's effective native cells (schema minimum 4). An added grid (GLDAS) gets its
  mask files under regions/cells/<grid>/ all the same; `casefile_pipeline.stages.grid_passes` applies the support
  rule to them when the bundle is written.
- Pairs: every pair of config/preregistration.yaml, split with `casefile_engine.base.pair_split` (S3).
Everything here is computed from boundaries alone, before any data are read.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import shapely

from casefile_engine.base import CFG, box_weights, fpath, load_yaml, pair_split, spill_share

from .boundaries import RegionDef
from .grids import GRIDS, NATIVE_GRIDS, lat_bounds, lon_bounds, mask_grids, row_areas

SUBSAMPLE = 5


def polygon_fractions(geom, g: dict, n: int = SUBSAMPLE) -> list[list]:
    """[[row, col, fraction], …] for every cell of grid `g` with at least one of its n × n sample points inside
    `geom` (longitude-latitude degrees). Fractions are hits / n², rounded to 4 decimals."""
    minx, miny, maxx, maxy = geom.bounds
    sb, nb = lat_bounds(g)
    wb, eb = lon_bounds(g)
    rows = np.where((nb > miny) & (sb < maxy))[0]
    cols = np.where((eb > minx) & (wb < maxx))[0]
    if rows.size == 0 or cols.size == 0:
        return []
    k = (np.arange(n) + 0.5) / n
    ys = sb[rows, None] + k[None, :] * (nb - sb)[rows, None]            # [n_rows][n]
    xs = wb[cols, None] + k[None, :] * (eb - wb)[cols, None]            # [n_cols][n]
    xs = (xs + 180.0) % 360.0 - 180.0                                    # wrap sample points to −180…180
    Y = np.broadcast_to(ys[:, None, :, None], (rows.size, cols.size, n, n))
    X = np.broadcast_to(xs[None, :, None, :], (rows.size, cols.size, n, n))
    shapely.prepare(geom)
    inside = shapely.contains_xy(geom, X.ravel(), Y.ravel()).reshape(rows.size, cols.size, n * n)
    hits = inside.sum(axis=2)
    out = []
    for i, j in zip(*np.nonzero(hits)):
        out.append([int(rows[i]), int(cols[j]), round(float(hits[i, j]) / (n * n), 4)])
    return out


def region_cells(d: RegionDef, g: dict) -> list[list]:
    """The mask of one region on one grid: exact overlap for a plain box, 5 × 5 sampling otherwise."""
    if d.box is not None:
        cells, _ = box_weights(d.box, g)
        return cells
    return polygon_fractions(d.geometry, g)


def mask_summary(cells: list[list], g: dict) -> tuple[float, float]:
    """(area km² = Σ fraction × cell area, effective cells = Σ fraction)."""
    a = row_areas(g)
    return float(sum(f * a[r] for r, _, f in cells)), round(float(sum(f for _, _, f in cells)), 4)


def support_for(cells: list[list], g: dict, eff: float) -> dict:
    s = CFG["support"]
    spill = spill_share(cells, g)
    return {"effectiveCells": eff, "spillShare": spill,
            "passes": bool(eff >= s["min_native_cells"] and spill <= s["max_spill_share"])}


def build_regions(defs: list[RegionDef], out: Path, bundle_id: str, prereg: dict | None = None,
                  grid_ids: tuple[str, ...] | None = None, log=print) -> tuple[dict, dict]:
    """Write regions/cells/<grid>/<region>.json and regions/index.json under `out` (the bundle folder).

    Returns (index, masks) with masks[(region id, grid id)] = (cells, area_km2, effective_cells)."""
    prereg = prereg if prereg is not None else load_yaml("config/preregistration.yaml")
    out = Path(out)
    grid_ids = grid_ids or mask_grids()
    grids = [GRIDS[i] for i in grid_ids]
    core = [g for g in grids if g["id"] in NATIVE_GRIDS] or grids     # the grids that decide inSet and S3
    pairs_cfg = prereg.get("pairs") or []
    ids = {d.id for d in defs}
    for p in pairs_cfg:
        for side in ("a", "b"):
            if p[side] not in ids:
                raise ValueError(f"pair {p['id']}: region {p[side]} is not in config/regions.yaml")
    masks, entries = {}, []
    for d in defs:
        support, cells_ref, logged = {}, {}, {}
        core_ids = {c["id"] for c in core}
        for g in grids:
            cells = region_cells(d, g)
            area, eff = mask_summary(cells, g)
            masks[(d.id, g["id"])] = (cells, area, eff)
            logged[g["id"]] = support_for(cells, g, eff) if cells else {"effectiveCells": 0.0, "spillShare": 1.0, "passes": False}
            rel = f"regions/cells/{g['id']}/{fpath(d.id)}.json"
            if g["id"] in core_ids:
                support[g["id"]] = logged[g["id"]]
                cells_ref[g["id"]] = rel
            p = out / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes((json.dumps({"schema": "casefile/mask@3", "region": d.id, "grid": g["id"], "cells": cells,
                                     "areaKm2": round(area, 1), "effectiveCells": eff, "synthetic": False})).encode("utf-8"))
        in_set = all(support[g["id"]]["passes"] for g in core)
        b = d.geometry.bounds
        c = d.geometry.centroid
        entries.append({"id": d.id, "kind": d.kind, "role": d.role, "name": d.name, "in": d.in_,
                        "bbox": [round(b[0], 4), round(b[1], 4), round(b[2], 4), round(b[3], 4)],
                        "centroid": [round(c.x, 4), round(c.y, 4)], "areaKm2": round(masks[(d.id, grids[0]["id"])][1], 1),
                        "boundary": {"source": d.source, "licence": d.licence}, "inSet": in_set, "support": support,
                        "cells": cells_ref if in_set else {}, "geom": None,
                        "pairs": [p["id"] for p in pairs_cfg if d.id in (p["a"], p["b"])]})
        log(f"  {d.id:22s} " + "  ".join(f"{gid}: eff {s['effectiveCells']:8.2f} spill {s['spillShare']:.3f} {'pass' if s['passes'] else 'FAIL'}"
                                          for gid, s in logged.items()))
    pairs = []
    for p in pairs_cfg:
        pairs.append({"id": p["id"], "a": p["a"], "b": p["b"], "lead": bool(p.get("lead", False)), "preRegistered": True,
                      "question": p["question"], "split": pair_split(masks, p["a"], p["b"], core)})
    s = CFG["support"]
    index = {"schema": "casefile/region_index@3", "buildId": bundle_id, "synthetic": False, "grids": list(GRIDS.values()),
             "minNativeCells": s["min_native_cells"], "maxSpillShare": s["max_spill_share"], "cellIdPattern": "cell:<row>_<col>",
             "regions": entries, "pairs": pairs}
    (out / "regions").mkdir(parents=True, exist_ok=True)
    (out / "regions/index.json").write_bytes((json.dumps(index, ensure_ascii=False, indent=1)).encode("utf-8"))
    return index, masks


def load_masks(bundle: Path) -> tuple[dict, dict]:
    """(index, masks) read back from a bundle's regions/ folder."""
    bundle = Path(bundle)
    index = json.loads((bundle / "regions/index.json").read_text(encoding="utf-8"))
    masks = {}
    for f in sorted((bundle / "regions/cells").glob("*/*.json")):
        m = json.loads(f.read_text(encoding="utf-8"))
        masks[(m["region"], m["grid"])] = (m["cells"], m["areaKm2"], m["effectiveCells"])
    return index, masks

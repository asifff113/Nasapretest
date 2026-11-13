# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Exploration files for the site, written beside a results build (after the pre-registration is committed).

The site computes nothing (AGENTS.md rule 4), so everything it shows must be in a file. This stage adds:

1. Yearly map frames: maps/<variable>/ANN/years.bin.gz + years.json. One [180][360] int16 frame per year, year-major,
   from the bundle's map/<variable>__ANN.npz, whose annual values the engine's own rules made
   (casefile_engine.bundle.annual_field). value = raw × scale + offset unless raw == fill. For the globe's year slider.
2. Region detail files: explore/regions/<region>.json for every country of Natural Earth Admin 0 and every region of
   config/regions.yaml: the region's monthly mean on its variable's native grid (Σ w x / Σ w, the same rule as the
   bundle, so NaN in a month when cells holding more than 10% of Σ w have no value), its yearly values by
   casefile_engine.layer.annual_values (the engine's rules), and its monthly climatology over the years with
   values. explore/index.json lists them. No test, no trend: each value is labelled exploration.
   The region's facts (area, cells, support) and the file's `grid` are those of the MERRA-2 grid, which covers the
   whole globe. A variable on another grid (GLDAS, land only) is averaged over the region's cells on that grid and
   left out of a region where no year has a value there (the sea, small islands).

Verdicts, contrasts and the screening map's rates stay the engine's alone.
"""
from __future__ import annotations

import gzip
import io
import json
import math
from pathlib import Path

import numpy as np

from casefile_engine import layer as L
from casefile_engine.base import CFG, VARS, fpath, spill_share

from . import boundaries, regions, series
from .grids import GRIDS
from .series import MonthlyField

LABEL = "exploration"
GRID_ID = "merra2_native"       # the global grid of the region detail files (MERRA-2 variables cover the whole globe)


def _gz(b: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as f:
        f.write(b)
    return buf.getvalue()


def _dump(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))


def frame_scale(values: np.ndarray) -> float:
    """The smallest power of ten that keeps every value inside int16 (|raw| ≤ 30 000)."""
    top = float(np.nanmax(np.abs(values))) if np.isfinite(values).any() else 1.0
    return 10.0 ** math.ceil(math.log10(max(top, 1e-12) / 30000.0))


# ============================================================================ 1. yearly map frames
def write_year_frames(bundle: Path, results: Path, build_id: str, log=print) -> list[str]:
    """maps/<variable>/<season>/years.bin.gz and years.json for every map field of the bundle."""
    done = []
    for f in sorted((Path(bundle) / "map").glob("*.npz")):
        var, season = f.stem.split("__")
        with np.load(f, allow_pickle=False) as z:
            years, v = np.asarray(z["years"], dtype=int), np.asarray(z["values"], dtype=float)
        scale = frame_scale(v)
        raw = np.where(np.isfinite(v), np.round(v / scale), -32768).astype("<i2")      # [180][360][n]
        blob = np.ascontiguousarray(np.moveaxis(raw, 2, 0)).tobytes()                  # [n][180][360]
        out = Path(results) / f"maps/{var}/{season}"
        out.mkdir(parents=True, exist_ok=True)
        (out / "years.bin.gz").write_bytes(_gz(blob))
        fin = v[np.isfinite(v)]
        _dump(out / "years.json", {
            "schema": "casefile/map_years@3", "buildId": build_id, "synthetic": False, "variable": var, "season": season,
            "label": LABEL, "grid": GRIDS["global_1deg"], "units": VARS[var]["units"]["aggregated"], "rule": VARS[var]["rule"],
            "years": [int(y) for y in years], "file": "years.bin.gz", "dtype": "int16", "byteOrder": "little",
            "layout": "[year][row][col]", "scale": scale, "offset": 0.0, "fill": -32768,
            "range": [float(np.percentile(fin, 2)), float(np.percentile(fin, 98))] if fin.size else None,
            "source": f"input bundle map/{f.name}: annual values by the engine's rules (03 §2.2)"})
        log(f"  {var} {season}: {len(years)} yearly frames ({years[0]}-{years[-1]}), scale {scale}, "
            f"{(out / 'years.bin.gz').stat().st_size / 1e6:.1f} MB")
        done.append(var)
    return done


# ============================================================================ 2. region detail files
def country_defs(folder: Path = boundaries.BOUNDARY_DIR) -> list[boundaries.RegionDef]:
    """Every Natural Earth 1:50m Admin 0 country as a region `country:<ADM0_A3>` (names from its NAME and NAME_BN)."""
    from shapely.geometry import shape

    from .sources import boundary_files

    meta = json.loads((folder / "sources.json").read_text(encoding="utf-8"))
    src = f"Natural Earth 1:50m Admin 0 – Countries ({meta['natural_earth_admin0']['file']}, {meta['natural_earth_admin0']['version']})"
    lic = meta["natural_earth_admin0"]["licence"]
    out, seen = [], set()
    for f in json.loads((folder / boundary_files.FILES["natural_earth_admin0"]["file"]).read_text(encoding="utf-8"))["features"]:
        p = f["properties"]
        iso = str(p.get("ADM0_A3") or "")
        if len(iso) != 3 or not iso.isalpha() or not iso.isupper() or iso in seen:
            continue
        seen.add(iso)
        en = str(p.get("NAME") or p.get("ADMIN") or iso)
        bn = str(p.get("NAME_BN") or en)
        d = boundaries.RegionDef(f"country:{iso}", "country", "country", {"en": en, "bn": bn}, {"en": f"in {en}", "bn": f"{bn}-এ"},
                                 shape(f["geometry"]).buffer(0), src, lic)
        d.extra = {"iso3": iso, "continent": p.get("CONTINENT"), "subregion": p.get("SUBREGION")}
        out.append(d)
    return out


def all_region_defs() -> list[boundaries.RegionDef]:
    """The configured regions (their names win), then every other country."""
    cfg = boundaries.region_defs()
    ids = {d.id for d in cfg}
    return cfg + [d for d in country_defs() if d.id not in ids]


def _climatology(monthly: np.ndarray) -> list:
    out = []
    for k in range(12):
        x = monthly[k::12]
        x = x[np.isfinite(x)]
        out.append(round(float(x.mean()), 4) if x.size else None)
    return out


def region_masks(log=print) -> list[tuple[boundaries.RegionDef, list]]:
    """(region, MERRA-2 cells) for every region with at least one cell (tiny islands may have none)."""
    grid = GRIDS[GRID_ID]
    out = []
    for d in all_region_defs():
        cells = regions.region_cells(d, grid)
        if cells:
            out.append((d, cells))
    log(f"  masks on {grid['id']}: {len(out)} regions with data squares")
    return out


def write_region_files(results: Path, build_id: str, load_fields, log=print) -> int:
    """explore/regions/<region>.json for every region with at least one MERRA-2 cell, and explore/index.json.

    `load_fields` yields (variable id, MonthlyField) one at a time, so only one global field is in memory."""
    grid = GRIDS[GRID_ID]
    s = CFG["support"]
    masks = region_masks(log)
    by_grid = {GRID_ID: ([cells for _, cells in masks], [series.weights(cells, grid["id"]) for _, cells in masks])}
    per_region: list[dict] = [{} for _ in masks]
    var_info = []
    for vid, fld in load_fields():
        if fld.row0 or fld.col0:
            raise ValueError(f"{vid}: region detail files need a field on the whole {fld.grid_id} grid, not a box")
        if fld.grid_id not in by_grid:
            g = GRIDS[fld.grid_id]
            cells_g = [regions.region_cells(d, g) for d, _ in masks]
            by_grid[fld.grid_id] = (cells_g, [series.weights(c, g["id"]) for c in cells_g])
            log(f"  masks on {g['id']}: {sum(1 for c in cells_g if c)} of {len(masks)} regions have cells")
        cells_v, weights_v = by_grid[fld.grid_id]
        start, vals = series.pad_to_january(fld.months, fld.values)
        full = MonthlyField(fld.months, vals, fld.grid_id)
        first, last = int(start[:4]), int(fld.months[-1][:4]) - (fld.months[-1][5:7] != "12")
        var_info.append({"id": vid, "units": VARS[vid]["units"]["aggregated"], "rule": VARS[vid]["rule"], "first": first, "last": last})
        left_out = 0
        for k in range(len(masks)):
            if not cells_v[k]:
                left_out += 1
                continue
            monthly = series.region_mean(series.cell_matrix(full, cells_v[k]), weights_v[k])
            a = L.annual_values(start, [None if not np.isfinite(x) else float(x) for x in monthly], "ANN", VARS[vid]["rule"], first, last)
            if all(v is None for v in a["values"]):
                left_out += 1
                continue
            per_region[k][vid] = {"unitsMonthly": VARS[vid]["units"]["monthly"], "units": VARS[vid]["units"]["aggregated"],
                                  "rule": VARS[vid]["rule"], "years": list(range(first, last + 1)),
                                  "annual": [None if v is None else round(float(v), 4) for v in a["values"]],
                                  "monthlyClimatology": _climatology(monthly[: (last - first + 1) * 12])}
        log(f"  {vid}: yearly values and monthly climatology for {len(masks) - left_out} regions"
            + (f" ({left_out} without a value on {fld.grid_id}: left out)" if left_out else ""))
        del full, vals
    entries = []
    for (d, cells), variables in zip(masks, per_region):
        area, eff = regions.mask_summary(cells, grid)
        spill = spill_share(cells, grid)
        b, c = d.geometry.bounds, d.geometry.representative_point()
        info = {"id": d.id, "kind": d.kind, "name": d.name, "bbox": [round(x, 3) for x in b], "centroid": [round(c.x, 3), round(c.y, 3)],
                "areaKm2": round(area, 1), "effectiveCells": eff, "spillShare": spill,
                "passesSupport": bool(eff >= s["min_native_cells"] and spill <= s["max_spill_share"]),
                "iso3": d.extra.get("iso3") or (d.id[8:] if d.id.startswith("country:") else None), "continent": d.extra.get("continent"), "file": f"explore/regions/{fpath(d.id)}.json"}
        _dump(Path(results) / info["file"], {"schema": "casefile/explore_region@3", "buildId": build_id, "synthetic": False,
                                             "label": LABEL, "grid": grid["id"], "region": {k: v for k, v in info.items() if k != "file"},
                                             "boundary": {"source": d.source, "licence": d.licence}, "variables": variables})
        entries.append(info)
    _dump(Path(results) / "explore/index.json", {"schema": "casefile/explore_index@3", "buildId": build_id, "synthetic": False,
                                                 "label": LABEL, "grid": grid["id"], "variables": var_info, "regions": entries})
    log(f"  {len(entries)} region detail files ({sum(e['kind'] == 'country' for e in entries)} countries), "
        f"{sum(e['passesSupport'] for e in entries)} pass the support rule")
    return len(entries)

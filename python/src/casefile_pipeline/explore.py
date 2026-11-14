# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Exploration files for the site, written beside a results build (after the pre-registration is committed).

The site computes nothing (AGENTS.md rule 4), so everything it shows must be in a file. This stage adds:

1. Yearly map frames: maps/<variable>/ANN/years.bin.gz + years.json. One [180][360] int16 frame per year, year-major,
   from the bundle's map/<variable>__ANN.npz, whose annual values the engine's own rules made
   (casefile_engine.bundle.annual_field). value = raw × scale + offset unless raw == fill. For the globe's year slider.
   Beside them: anomaly.bin.gz (each year minus the cell's baseline mean, same layout) and decades.bin.gz (three
   frames: the first ten years' mean, the last ten years' mean, and their difference), described in years.json.
2. Region detail files: explore/regions/<region>.json for every country of Natural Earth Admin 0 and every region of
   config/regions.yaml, and explore/areas/<area>.json for the world, the world's land and each continent: the
   monthly mean on the variable's native grid (Σ w x / Σ w, the same rule as the bundle, so NaN in a month when
   cells holding more than 10% of Σ w have no value), yearly values by casefile_engine.layer.annual_values (the
   engine's rules), the monthly climatology, and the past-against-present block of casefile_pipeline.explore_stats
   (anomalies, decades, a 10-year mean and an exploration trend test with the engine's functions).
   explore/index.json lists them.
3. explore/trends/<variable>.json: every place's exploration trend for one variable, with the false-discovery
   adjustment across places (Benjamini–Hochberg at the screening map's q), for rankings and the forest plot.
4. explore/hovmoller/<variable>.json: the mean anomaly of each 1° latitude row in each year (latitude × year).

Verdicts and contrasts stay the engine's alone; everything here is labelled exploration.
"""
from __future__ import annotations

import gzip
import io
import json
import math
import warnings
from pathlib import Path

import numpy as np

from casefile_engine import layer as L
from casefile_engine.base import CFG, VARS, fpath, spill_share

from . import boundaries, explore_stats, regions, series
from .grids import GRIDS
from .series import MonthlyField

LABEL = "exploration"
GRID_ID = "merra2_native"       # the global grid of the region detail files (MERRA-2 variables cover the whole globe)
FILL = -32768


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


def _i16(v: np.ndarray, scale: float) -> np.ndarray:
    return np.where(np.isfinite(v), np.round(v / scale), FILL).astype("<i2")


def nice_step(x: float) -> float:
    """The smallest 1, 2, 2.5 or 5 × 10^k that is at least x."""
    if not x > 0:
        return 1.0
    k = math.floor(math.log10(x))
    for m in (1, 2, 2.5, 5, 10):
        if m * 10 ** k >= x - 1e-15:
            return float(m * 10 ** k)
    return float(10 ** (k + 1))


def _i8(v: np.ndarray, scale: float) -> np.ndarray:
    """int8 for a colour layer: ±127 steps of `scale`, values beyond clipped to the ends, −128 = no value."""
    return np.where(np.isfinite(v), np.clip(np.round(v / scale), -127, 127), -128).astype("i1")


def _period(years: np.ndarray, v: np.ndarray, a: int, b: int) -> np.ndarray:
    """Per-cell mean over years a..b ([180][360]), NaN where fewer than 80% of those years have a value."""
    sel = (years >= a) & (years <= b)
    block = v[:, :, sel]
    n = np.isfinite(block).sum(axis=2)
    with warnings.catch_warnings():                       # cells with no value at all (the sea in a land model)
        warnings.simplefilter("ignore", RuntimeWarning)
        m = np.nanmean(np.where(np.isfinite(block), block, np.nan), axis=2) if block.size else np.full(v.shape[:2], np.nan)
    m[n < explore_stats.MIN_SHARE * sel.sum()] = np.nan
    return m


# ============================================================================ 1. yearly map frames, anomalies, decades
def write_year_frames(bundle: Path, results: Path, build_id: str, log=print) -> list[str]:
    """maps/<variable>/<season>/years.bin.gz, anomaly.bin.gz, decades.bin.gz and years.json for every map field."""
    done = []
    for f in sorted((Path(bundle) / "map").glob("*.npz")):
        var, season = f.stem.split("__")
        with np.load(f, allow_pickle=False) as z:
            years, v = np.asarray(z["years"], dtype=int), np.asarray(z["values"], dtype=float)
        scale = frame_scale(v)
        out = Path(results) / f"maps/{var}/{season}"
        out.mkdir(parents=True, exist_ok=True)
        (out / "years.bin.gz").write_bytes(_gz(np.ascontiguousarray(np.moveaxis(_i16(v, scale), 2, 0)).tobytes()))
        fin = v[np.isfinite(v)]
        meta = {"schema": "casefile/map_years@3", "buildId": build_id, "synthetic": False, "variable": var, "season": season,
                "label": LABEL, "grid": GRIDS["global_1deg"], "units": VARS[var]["units"]["aggregated"], "rule": VARS[var]["rule"],
                "years": [int(y) for y in years], "file": "years.bin.gz", "dtype": "int16", "byteOrder": "little",
                "layout": "[year][row][col]", "scale": scale, "offset": 0.0, "fill": FILL,
                "range": [float(np.percentile(fin, 2)), float(np.percentile(fin, 98))] if fin.size else None,
                "source": f"input bundle map/{f.name}: annual values by the engine's rules (03 §2.2)",
                "anomaly": None, "decades": None}
        base = explore_stats.baseline_years(int(years[0]), int(years[-1]))
        if base:
            anom = v - _period(years, v, *base)[:, :, None]
            af = np.abs(anom[np.isfinite(anom)])
            top = float(np.percentile(af, 99.9)) if af.size else 1.0
            a_scale = nice_step(top / 127.0)
            (out / "anomaly.bin.gz").write_bytes(_gz(np.ascontiguousarray(np.moveaxis(_i8(anom, a_scale), 2, 0)).tobytes()))
            meta["anomaly"] = {"file": "anomaly.bin.gz", "baseline": list(base), "dtype": "int8", "scale": a_scale, "fill": -128,
                               "clippedAt": round(127 * a_scale, 10), "layout": "[year][row][col]",
                               "range": float(np.percentile(af, 98)) if af.size else None}
        dec = explore_stats.decade_years(int(years[0]), int(years[-1]))
        if dec:
            early, late = _period(years, v, *dec[0]), _period(years, v, *dec[1])
            frames = np.stack([early, late, late - early])
            d_scale = frame_scale(frames)
            (out / "decades.bin.gz").write_bytes(_gz(np.ascontiguousarray(_i16(frames, d_scale)).tobytes()))
            ch = np.abs(frames[2][np.isfinite(frames[2])])
            meta["decades"] = {"file": "decades.bin.gz", "frames": ["early", "late", "change"], "early": list(dec[0]), "late": list(dec[1]),
                               "scale": d_scale, "layout": "[frame][row][col]", "changeRange": float(np.percentile(ch, 98)) if ch.size else None}
        _dump(out / "years.json", meta)
        write_hovmoller(results, build_id, var, years, v, base, log)
        log(f"  {var} {season}: {len(years)} yearly frames ({years[0]}-{years[-1]}), anomalies vs {base}, decades {dec}")
        done.append(var)
    return done


def write_hovmoller(results: Path, build_id: str, var: str, years: np.ndarray, v: np.ndarray, base, log=print) -> None:
    """explore/hovmoller/<variable>.json: each 1° latitude row's mean anomaly per year (cells of a row share one area)."""
    if not base:
        return
    anom = v - _period(years, v, *base)[:, :, None]
    n = np.isfinite(anom).sum(axis=1)
    with np.errstate(invalid="ignore"):
        rows = np.where(n > 0, np.nansum(np.where(np.isfinite(anom), anom, 0.0), axis=1) / np.maximum(n, 1), np.nan)   # [180][n_years]
    d = explore_stats.digits(rows[np.isfinite(rows)]) if np.isfinite(rows).any() else 2
    lats = [round(89.5 - r, 1) for r in range(180)]
    keep = [r for r in range(180) if np.isfinite(rows[r]).any()]
    fin = np.abs(rows[np.isfinite(rows)])
    _dump(Path(results) / f"explore/hovmoller/{var}.json", {
        "schema": "casefile/explore_hovmoller@3", "buildId": build_id, "synthetic": False, "label": LABEL, "variable": var,
        "units": VARS[var]["units"]["aggregated"], "baseline": list(base), "years": [int(y) for y in years],
        "lat": [lats[r] for r in keep], "cells": [int(n[r].max()) for r in keep],
        "values": [[explore_stats.rnd(x, d) for x in rows[r]] for r in keep],
        "range": float(np.percentile(fin, 98)) if fin.size else None,
        "method": "mean over the 1° cells of each latitude row with a value that year, minus the same mean over the baseline years"})


# ============================================================================ 2. regions and areas
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
    countries = {d.id: d for d in country_defs()}
    for d in cfg:                      # a configured country keeps its own name and outline, and gains its continent
        if d.id in countries and not getattr(d, "extra", None):
            d.extra = dict(countries[d.id].extra)
    ids = {d.id for d in cfg}
    return cfg + [d for d in countries.values() if d.id not in ids]


# Bangla names of Natural Earth's continents and of the two world areas.
AREA_NAMES = {
    "world": ("The whole world (land and sea)", "সমগ্র পৃথিবী (স্থল ও সাগর)"),
    "world:land": ("All land", "সমগ্র স্থলভাগ"),
    "Africa": ("Africa", "আফ্রিকা"), "Antarctica": ("Antarctica", "অ্যান্টার্কটিকা"), "Asia": ("Asia", "এশিয়া"),
    "Europe": ("Europe", "ইউরোপ"), "North America": ("North America", "উত্তর আমেরিকা"), "Oceania": ("Oceania", "ওশেনিয়া"),
    "South America": ("South America", "দক্ষিণ আমেরিকা"),
}


def area_defs() -> list[boundaries.RegionDef]:
    """The world (an exact box), the world's land (all countries) and each continent (its countries together)."""
    from shapely.geometry import box
    from shapely.ops import unary_union

    countries = country_defs()
    src = countries[0].source if countries else "Natural Earth"
    lic = countries[0].licence if countries else ""
    out = [boundaries.RegionDef("world", "world", "world", {"en": AREA_NAMES["world"][0], "bn": AREA_NAMES["world"][1]},
                                {"en": "", "bn": ""}, box(-180, -90, 180, 90), "the whole globe", "not applicable", (-180.0, -90.0, 180.0, 90.0)),
           boundaries.RegionDef("world:land", "world", "world", {"en": AREA_NAMES["world:land"][0], "bn": AREA_NAMES["world:land"][1]},
                                {"en": "", "bn": ""}, unary_union([c.geometry for c in countries]), f"all countries of {src}", lic)]
    for cont in sorted({c.extra.get("continent") for c in countries if c.extra.get("continent") in AREA_NAMES}):
        geom = unary_union([c.geometry for c in countries if c.extra.get("continent") == cont])
        out.append(boundaries.RegionDef(f"continent:{cont.lower().replace(' ', '_')}", "continent", "continent",
                                        {"en": AREA_NAMES[cont][0], "bn": AREA_NAMES[cont][1]}, {"en": "", "bn": ""}, geom,
                                        f"the countries of {cont} in {src}", lic))
    return out


def _climatology(monthly: np.ndarray) -> list:
    out = []
    for k in range(12):
        x = monthly[k::12]
        x = x[np.isfinite(x)]
        out.append(round(float(x.mean()), 4) if x.size else None)
    return out


def region_masks(defs, log=print) -> list[tuple[boundaries.RegionDef, list]]:
    """(region, MERRA-2 cells) for every region with at least one cell (tiny islands may have none)."""
    grid = GRIDS[GRID_ID]
    out = [(d, regions.region_cells(d, grid)) for d in defs]
    out = [(d, c) for d, c in out if c]
    log(f"  masks on {grid['id']}: {len(out)} places with data squares")
    return out


def monthly_mean(full: MonthlyField, cells: list, w: np.ndarray, chunk: int = 2000) -> np.ndarray:
    """series.region_mean computed in blocks of cells, so the whole world fits in memory."""
    if len(cells) <= chunk:
        return series.region_mean(series.cell_matrix(full, cells), w)
    n_m = full.values.shape[0]
    num, cover = np.zeros(n_m), np.zeros(n_m)
    for i in range(0, len(cells), chunk):
        x = series.cell_matrix(full, cells[i:i + chunk])
        ww = w[i:i + chunk]
        fin = np.isfinite(x)
        num += (np.where(fin, x, 0.0) * ww[:, None]).sum(axis=0)
        cover += (ww[:, None] * fin).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = num / cover
    mean[cover < (1.0 - series.MAX_MISSING_WEIGHT) * w.sum() - 1e-9] = np.nan
    return mean


def _info(d, cells, grid, s) -> dict:
    area, eff = regions.mask_summary(cells, grid)
    spill = spill_share(cells, grid)
    b, c = d.geometry.bounds, d.geometry.representative_point()
    folder = "regions" if d.kind in ("country", "division", "comparison") else "areas"
    return {"id": d.id, "kind": d.kind, "name": d.name, "bbox": [round(x, 3) for x in b], "centroid": [round(c.x, 3), round(c.y, 3)],
            "areaKm2": round(area, 1), "effectiveCells": eff, "spillShare": spill,
            "passesSupport": bool(eff >= s["min_native_cells"] and spill <= s["max_spill_share"]),
            "iso3": d.extra.get("iso3") or (d.id[8:] if d.id.startswith("country:") else None), "continent": d.extra.get("continent"),
            "file": f"explore/{folder}/{fpath(d.id)}.json"}


def write_region_files(results: Path, build_id: str, load_fields, log=print) -> int:
    """explore/regions/*.json, explore/areas/*.json, explore/trends/*.json and explore/index.json.

    `load_fields` yields (variable id, MonthlyField) one at a time, so only one global field is in memory."""
    grid = GRIDS[GRID_ID]
    s = CFG["support"]
    masks = region_masks(all_region_defs() + area_defs(), log)
    by_grid = {GRID_ID: ([cells for _, cells in masks], [series.weights(cells, grid["id"]) for _, cells in masks])}
    per_region: list[dict] = [{} for _ in masks]
    infos = [_info(d, cells, grid, s) for d, cells in masks]
    var_info = []
    for vid, fld in load_fields():
        if fld.row0 or fld.col0:
            raise ValueError(f"{vid}: region detail files need a field on the whole {fld.grid_id} grid, not a box")
        if fld.grid_id not in by_grid:
            g = GRIDS[fld.grid_id]
            cells_g = [regions.region_cells(d, g) for d, _ in masks]
            by_grid[fld.grid_id] = (cells_g, [series.weights(c, g["id"]) for c in cells_g])
            log(f"  masks on {g['id']}: {sum(1 for c in cells_g if c)} of {len(masks)} places have cells")
        cells_v, weights_v = by_grid[fld.grid_id]
        start, vals = series.pad_to_january(fld.months, fld.values)
        full = MonthlyField(fld.months, vals, fld.grid_id)
        first, last = int(start[:4]), int(fld.months[-1][:4]) - (fld.months[-1][5:7] != "12")
        left_out, payloads = 0, []
        for k in range(len(masks)):
            if not cells_v[k]:
                left_out += 1
                continue
            monthly = monthly_mean(full, cells_v[k], weights_v[k])
            a = L.annual_values(start, [None if not np.isfinite(x) else float(x) for x in monthly], "ANN", VARS[vid]["rule"], first, last)
            if all(v is None for v in a["values"]):
                left_out += 1
                continue
            block = {"unitsMonthly": VARS[vid]["units"]["monthly"], "units": VARS[vid]["units"]["aggregated"],
                     "rule": VARS[vid]["rule"], "years": list(range(first, last + 1)),
                     "annual": [None if v is None else round(float(v), 4) for v in a["values"]],
                     "monthlyClimatology": _climatology(monthly[: (last - first + 1) * 12])}
            block.update(explore_stats.series_payload(vid, start, first, last, monthly, a["values"]))
            per_region[k][vid] = block
            payloads.append((k, block))
        n_out = explore_stats.adjust_across([b for _, b in payloads])
        n_test = sum(1 for _, b in payloads if b["trend"]["testable"])
        var_info.append({"id": vid, "units": VARS[vid]["units"]["aggregated"], "rule": VARS[vid]["rule"], "first": first, "last": last,
                         "trendTested": n_test, "trendStandsOut": n_out})
        _dump(Path(results) / f"explore/trends/{vid}.json", {
            "schema": "casefile/explore_trends@3", "buildId": build_id, "synthetic": False, "label": LABEL, "variable": vid,
            "units": VARS[vid]["units"]["aggregated"], "rule": VARS[vid]["rule"], "q": explore_stats.MAP_Q,
            "method": "casefile_engine.layer.core_stats on each place's yearly values (Mann-Kendall allowing for memory, Sen slope, 95% range); "
                      "testable with at least domain.min_years_exploratory years, no missing year and memory within the validated range; "
                      "Benjamini-Hochberg across the testable places of this file",
            "items": [{"id": infos[k]["id"], "kind": infos[k]["kind"], "name": infos[k]["name"], "iso3": infos[k]["iso3"],
                       "continent": infos[k]["continent"], "passesSupport": infos[k]["passesSupport"],
                       "anomalyLast": (b["annualAnomaly"] or [None])[-1] if b.get("annualAnomaly") else None,
                       "decadeChange": b["decades"]["change"] if b.get("decades") else None, **b["trend"]} for k, b in payloads]})
        log(f"  {vid}: {len(payloads)} places ({left_out} without a value on {fld.grid_id}); "
            f"trend tested in {n_test}, {n_out} stand out after allowing for all of them (q < {explore_stats.MAP_Q})")
        del full, vals
    entries, areas = [], []
    for (d, _), variables, info in zip(masks, per_region, infos):
        is_area = info["file"].startswith("explore/areas/")
        _dump(Path(results) / info["file"], {"schema": "casefile/explore_area@3" if is_area else "casefile/explore_region@3",
                                             "buildId": build_id, "synthetic": False, "label": LABEL, "grid": grid["id"],
                                             ("area" if is_area else "region"): {k: v for k, v in info.items() if k != "file"},
                                             "boundary": {"source": d.source, "licence": d.licence}, "variables": variables})
        (areas if is_area else entries).append(info)
    _dump(Path(results) / "explore/index.json", {"schema": "casefile/explore_index@3", "buildId": build_id, "synthetic": False,
                                                 "label": LABEL, "grid": grid["id"], "variables": var_info, "regions": entries, "areas": areas,
                                                 "trends": [f"explore/trends/{v['id']}.json" for v in var_info],
                                                 "hovmoller": sorted(f"explore/hovmoller/{p.stem}.json" for p in (Path(results) / "explore/hovmoller").glob("*.json"))})
    log(f"  {len(entries)} region detail files ({sum(e['kind'] == 'country' for e in entries)} countries) and {len(areas)} areas, "
        f"{sum(e['passesSupport'] for e in entries)} regions pass the support rule")
    return len(entries)

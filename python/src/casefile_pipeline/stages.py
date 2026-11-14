# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""The four pipeline stages: access check, fetch, regions, bundle (docs/05_BUILD_PLAN.md, Part 2).

Ordering rule (AGENTS.md rule 5): every stage prints counts, units, ranges and climatologies only. Nothing here
computes, prints or plots a trend, a yearly series or an early-against-late comparison.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import numpy as np

from casefile_engine.base import ROOT, VARS

from . import boundaries, manifest, mapfield, regions, series
from .grids import GRIDS, NATIVE_GRIDS, index_box, lat_bounds, lon_bounds, row_areas
from .series import MonthlyField
from .sources import Reader, parts, used_readers

CACHE = ROOT / ".cache"


def _now() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def pick_readers(products: list[str] | None) -> list[Reader]:
    """Readers to run: all used ones, or those named by source id or short name."""
    rs = used_readers()
    if not products:
        return rs
    out = [r for r in rs if r.source_id in products or r.short_name in products]
    unknown = set(products) - {r.source_id for r in out} - {r.short_name for r in out}
    if unknown:
        raise SystemExit(f"unknown product(s) {sorted(unknown)}; known: {[r.short_name for r in rs]}")
    return out


def subset_box(reader: Reader, log=print) -> tuple[tuple[int, int, int, int], tuple[float, float, float, float]] | tuple[None, None]:
    """For a reader that keeps only the region box: (row0, row1, col0, col1) on its grid and the box edges."""
    if not reader.subset_to_regions:
        return None, None
    from .sources import boundary_files

    meta = boundary_files.ensure(boundaries.BOUNDARY_DIR, log=log)
    defs = boundaries.region_defs(meta=meta)
    g = reader.grid
    r0, r1, c0, c1 = index_box(g, boundaries.union_bbox(defs, pad=1.0))
    sb, nb = lat_bounds(g)
    wb, eb = lon_bounds(g)
    return (r0, r1, c0, c1), (float(wb[c0]), float(sb[r0]), float(eb[c1 - 1]), float(nb[r1 - 1]))


def _window(reader: Reader, first: str | None, last: str | None) -> tuple[str, str]:
    from .sources.earthdata import default_window

    f0, l0 = default_window(reader)
    f, la = max(first or f0, f0), min(last or l0, l0)
    if f > la:
        raise SystemExit(f"{reader.short_name}: the window {first}..{last} lies outside its record {f0}..{l0}")
    return f, la


# ============================================================================ access-check
def access_check(products: list[str] | None = None, log=print) -> dict:
    """One granule per product: the route that works and the facts as found (docs/02_DATA.md §10, V-01–V-04)."""
    from .sources import earthdata as ed

    ed.login()
    log("Earthdata login: OK (credentials not shown)")
    result = {"checked": _now(), "products": {}}
    root = CACHE / "access_check"
    for reader in pick_readers(products):
        first, last = ed.default_window(reader)
        log(f"\n{reader.short_name} {reader.version} ({reader.source_id}), record {first}..{last} per config/sources.yaml")
        found = ed.search(reader, first, last)
        months = sorted(ed.granule_month(g["umm"]) for g in found)
        doubled = sorted({m for m in months if months.count(m) > 1})
        try:
            ed.month_table(found, first, months[-1] if months else last)
            gaps = "none"
        except ed.MonthError as e:
            gaps = str(e)
        log(f"  CMR: {len(found)} granules, {months[0] if months else '-'}..{months[-1] if months else '-'}; doubled {doubled or 'none'}; gaps: {gaps}")
        g = found[0]
        url = ed.opendap_url(g["umm"])
        log(f"  first granule: {ed.granule_name(g['umm'])}; OPeNDAP url host: {url.split('/')[2] if url else 'none'}")
        facts, route, failed = {}, None, {}
        for var in reader.file_variables():
            rec = ed.probe_routes(reader, ed.granule_month(g["umm"]), g, var, None, log=log, root=root)
            log(f"  {var}: route that worked: {rec['route']}  ({rec['bytes']} bytes saved)")
            facts.update(rec["facts"])
            route, failed = route or rec["route"], failed or rec.get("routesTried", {})
        for v, f in facts.items():
            log(f"  {v}: dims {tuple(f['dims'])}, units '{f['units']}', fill {f['fill']}, "
                f"lat {f['lat'][0]:.3f}..{f['lat'][1]:.3f} ({f['lat'][2]}), lon {f['lon'][0]:.3f}..{f['lon'][1]:.3f} ({f['lon'][2]})")
            log(f"     one month in {f['monthlyUnit']}: min {f['min']:.3f}, max {f['max']:.3f}, mean {f['mean']:.3f} "
                f"(unweighted over grid points); missing points {f['missing']}")
        result["products"][reader.source_id] = {"shortName": reader.short_name, "version": reader.version, "granules": len(found),
                                                "firstMonth": months[0] if months else None, "lastMonth": months[-1] if months else None,
                                                "doubled": doubled, "gaps": gaps, "route": route,
                                                "routesFailed": failed, "facts": facts,
                                                "opendapHost": url.split("/")[2] if url else None}
    CACHE.mkdir(exist_ok=True)
    (CACHE / "access_check.json").write_bytes((json.dumps(result, indent=1)).encode("utf-8"))
    log(f"\nwritten: {CACHE / 'access_check.json'}")
    return result


# ============================================================================ fetch
def monthly_path(reader: Reader, cache: Path = CACHE) -> Path:
    return cache / "monthly" / f"{reader.short_name}.npz"


def store_monthly(reader: Reader, fields: dict[str, list], months: list[str], box, bbox, records: list[dict], route: str,
                  cache: Path = CACHE, log=print) -> None:
    """.cache/monthly/<short name>.npz (months, grid, row0, col0, values__<variable> [n_months][n_lat][n_lon] float32)
    and <short name>.product.json (its manifest entry and the fetch time)."""
    (cache / "monthly").mkdir(parents=True, exist_ok=True)
    arrays = {f"values__{v}": np.stack(x).astype(np.float32) for v, x in fields.items()}
    np.savez(monthly_path(reader, cache), months=np.array(months), grid=reader.grid_id, row0=box[0] if box else 0,
             col0=box[2] if box else 0, **arrays)
    entry = manifest.product_entry(reader.source_id, records, months[0], months[-1], bbox, "earthaccess")
    meta = {"fetched": _now(), "route": route, "entry": entry}
    (cache / "monthly" / f"{reader.short_name}.product.json").write_bytes((json.dumps(meta, indent=1)).encode("utf-8"))
    for v, a in arrays.items():
        fin = np.isfinite(a)
        log(f"  stored {monthly_path(reader, cache).name} {v[8:]}: {a.shape[0]} months x {a.shape[1]} x {a.shape[2]}, "
            f"missing points {int((~fin).sum())}, range {np.nanmin(a):.3f}..{np.nanmax(a):.3f}")


def fetch(products: list[str] | None = None, first: str | None = None, last: str | None = None, workers: int = 8, log=print) -> None:
    """Fetch every month of each product and store .cache/monthly/<short name>.npz plus its manifest entry."""
    from .sources import earthdata as ed

    ed.login()
    log("Earthdata login: OK (credentials not shown)")
    for reader in pick_readers(products):
        f, la = _window(reader, first, last)
        box, bbox = subset_box(reader, log=log)
        log(f"\n{reader.short_name} {reader.version}: months {f}..{la}" + (f", box rows {box[0]}:{box[1]} cols {box[2]}:{box[3]} = {bbox}" if box else ", global"))
        table = ed.month_table(ed.search(reader, f, la), f, la)
        fields, records, routes = {}, [], []
        for var in reader.file_variables():
            route = ed.cached_route(reader, table, var, box)
            if route is None:
                m0 = next(iter(table))
                route = ed.probe_routes(reader, m0, table[m0], var, box, log=log)["route"]
            routes.append(f"{var}: {route}")
            records += ed.fetch_product(reader, table, route, var, box, workers=workers, log=log)
            fields[var] = [ed.load_month(reader, m, var, box)[0] for m in table]
        store_monthly(reader, fields, list(table), box, bbox, records, ", ".join(routes), log=log)


def load_field(reader: Reader, file_variable: str, cache: Path = CACHE) -> MonthlyField | None:
    """The stored monthly field of a config variable. A sum "A + B" (GLDAS runoff) is added month by month from its
    parts, each already in the monthly unit; a cell is NaN in a month when any part is NaN there."""
    p = monthly_path(reader, cache)
    if not p.exists():
        return None
    with np.load(p, allow_pickle=False) as z:
        keys = [f"values__{n}" for n in parts(file_variable)]
        if any(k not in z.files for k in keys):
            return None                   # this variable was added after the product was fetched: fetch again
        values = z[keys[0]]
        for k in keys[1:]:
            values = values + z[k]
        return MonthlyField([str(m) for m in z["months"]], values, str(z["grid"]), int(z["row0"]), int(z["col0"]))


# ============================================================================ regions
def regions_stage(bundle_id: str = "b1", boundary_dir: Path | None = None, log=print) -> dict:
    """Boundary files → masks, support and pair splits → .cache/bundle/<id>/regions/."""
    from .sources import boundary_files

    folder = boundary_dir or boundaries.BOUNDARY_DIR
    meta = boundary_files.ensure(folder, log=log) if boundary_dir is None else json.loads((folder / "sources.json").read_text(encoding="utf-8"))
    defs = boundaries.region_defs(folder=folder, meta=meta)
    out = CACHE / "bundle" / bundle_id
    index, _ = regions.build_regions(defs, out, bundle_id, log=log)
    log(f"written: {out / 'regions/index.json'} ({len(index['regions'])} regions, {len(index['pairs'])} pairs)")
    return index


# ============================================================================ bundle
def explore_stage(bundle_id: str, results: Path, cache: Path = CACHE, log=print) -> None:
    """Yearly map frames and region detail files beside a results build (casefile_pipeline.explore)."""
    from . import explore

    out, results = cache / "bundle" / bundle_id, Path(results)
    build_id = json.loads((results / "build.json").read_text(encoding="utf-8"))["buildId"]
    log("yearly map frames:")
    explore.write_year_frames(out, results, build_id, log)

    def load_fields():
        for reader in used_readers():
            for var in reader.variables():
                if VARS[var["id"]]["status"] == "analysed":
                    f = load_field(reader, str(var["variable"]), cache)
                    if f is not None:
                        yield var["id"], f

    log("region detail files:")
    explore.write_region_files(results, build_id, load_fields, log)


def index_support(index: dict, region_id: str, grid_id: str) -> bool:
    """True if the region passes the support rule on this first-release grid, as regions/index.json records it."""
    r = next(x for x in index["regions"] if x["id"] == region_id)
    return bool(r["support"].get(grid_id, {}).get("passes"))


def grid_passes(index: dict, masks: dict, region_id: str, grid_id: str) -> bool:
    """True if the region passes the support rule on this grid (02 §14 step 5: otherwise no series there). A
    first-release grid is read from regions/index.json; an added grid (not listed there, see casefile_pipeline.regions)
    from the region's mask on that grid, by the same rule and thresholds."""
    if grid_id in NATIVE_GRIDS:
        return index_support(index, region_id, grid_id)
    cells, _, eff = masks.get((region_id, grid_id), ([], 0.0, 0.0))
    return bool(cells) and regions.support_for(cells, GRIDS[grid_id], eff)["passes"]


def _last_complete_year(months: list[str]) -> int:
    y, m = int(months[-1][:4]), int(months[-1][5:7])
    return y if m == 12 else y - 1


def _d01(reader: Reader, field: MonthlyField) -> dict:
    """D-01: area-weighted global mean of the 1991–2020 monthly MERRA-2 T2M values: about 14–15 °C (a climatology)."""
    idx = [i for i, m in enumerate(field.months) if "1991-01" <= m <= "2020-12"]
    if len(idx) < 360 or field.values.shape[1:] != (reader.grid["nlat"], reader.grid["nlon"]):
        return {"id": "D-01", "result": "skip", "note": "the fetched months do not cover 1991-2020 on the whole grid"}
    w = row_areas(reader.grid)[:, None] * np.ones((1, reader.grid["nlon"]))
    clim = np.nanmean(field.values[idx], axis=0)
    v = float(np.nansum(clim * w) / np.sum(w * np.isfinite(clim)))
    return {"id": "D-01", "result": "pass" if 14.0 <= v <= 15.0 else "fail",
            "note": f"area-weighted global mean of the 1991-2020 monthly T2M: {v:.2f} °C (expected about 14-15 °C)"}


def preregistered_variables() -> set[str]:
    """The variables of config/preregistration.yaml: the only ones whose region and pair series the engine reads."""
    from casefile_engine.base import load_yaml

    return {v["id"] for v in load_yaml("config/preregistration.yaml").get("variables", [])}


def bundle(bundle_id: str = "b1", cache: Path = CACHE, log=print, series_for: set[str] | None = None) -> Path:
    """.cache/monthly/ + .cache/bundle/<id>/regions/ → series, pairs, map fields and input_manifest.json.

    Region and pair series are written for the pre-registered variables only (`series_for`, default from
    config/preregistration.yaml): the engine reads no other. Exploration variables get their map field; their place
    values come from `casefile-pipeline explore`."""
    series_for = preregistered_variables() if series_for is None else series_for
    out = cache / "bundle" / bundle_id
    if not (out / "regions/index.json").exists():
        raise SystemExit(f"{out / 'regions/index.json'} is missing: run `casefile-pipeline regions --bundle-id {bundle_id}` first")
    index, masks = regions.load_masks(out)
    for sub in ("series", "pairs", "map"):
        for f in (out / sub).glob("*/*.npz") if sub != "map" else (out / sub).glob("*.npz"):
            f.unlink()
    products, fetched, checks, routes = [], [], [], []
    in_set = [r["id"] for r in index["regions"] if r["inSet"]]
    for reader in used_readers():
        pj = cache / "monthly" / f"{reader.short_name}.product.json"
        if not monthly_path(reader, cache).exists() or not pj.exists():
            log(f"  {reader.short_name}: not fetched, skipped")
            continue
        meta = json.loads(pj.read_text(encoding="utf-8"))
        products.append(meta["entry"])
        fetched.append(meta["fetched"])
        routes.append(f"{reader.short_name}: {meta['route']}")
        for var in reader.variables():
            vid = var["id"]
            field = load_field(reader, str(var["variable"]), cache)
            if field is None:
                log(f"  {vid}: not in {monthly_path(reader, cache).name} yet (run fetch), skipped")
                continue
            n, empty = 0, []
            ok = [rid for rid in in_set if grid_passes(index, masks, rid, reader.grid_id)] if vid in series_for else []
            for rid in ok:
                if series.write_series(out, vid, rid, field, masks[(rid, reader.grid_id)][0]) is None:
                    empty.append(rid)
                else:
                    n += 1
            if empty:
                log(f"  {vid}: no series for {empty}: no month has a value there on {reader.grid_id} (a land-only product over the sea)")
            for p in index["pairs"] if reader.grid_id in NATIVE_GRIDS and vid in series_for else []:
                series.write_pair(out, vid, p["id"], field, masks[(p["a"], reader.grid_id)][0], masks[(p["b"], reader.grid_id)][0])
            log(f"  {vid}: {n} region series, {len(index['pairs']) if vid in series_for else 0} pair series, {field.months[0]}..{field.months[-1]} on {reader.grid_id}"
                + ("" if vid in series_for else " (exploration: map field only)"))
            g = GRIDS[reader.grid_id]
            if VARS[vid]["status"] == "analysed" and field.values.shape[1:] == (g["nlat"], g["nlon"]):
                start, vals = series.pad_to_january(field.months, field.values)
                first, last = int(start[:4]), _last_complete_year(field.months)
                if last >= first:
                    log(f"  {vid}: regridding {vals.shape[0]} months to 1 degree and making the annual map field ({first}-{last})")
                    mapfield.write_map(out, vid, start, mapfield.regrid(vals, g), first, last)
                else:
                    log(f"  {vid}: no complete year, no map field")
            if str(var["variable"]) == "T2M":
                checks.append(_d01(reader, field))
    if not products:
        raise SystemExit("nothing fetched: run `casefile-pipeline fetch` first")
    checks.insert(0, {"id": "fetch_route", "result": "pass", "note": "one variable per granule through earthaccess and CMR; route per product: " + "; ".join(routes)})
    checks.insert(1, {"id": "D-03", "result": "pass", "note": "every product's months are complete and none is doubled (checked by fetch)"})
    checks.append({"id": "D-06", "result": "skip", "note": "optional POWER cross-check: not run"})
    manifest.write_manifest(out, bundle_id, max(fetched), products, checks)
    log(f"written: {out}")
    return out


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
from .sources import Reader, used_readers

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
        rec = ed.probe_routes(reader, ed.granule_month(g["umm"]), g, None, log=log, root=root)
        log(f"  route that worked: {rec['route']}  ({rec['bytes']} bytes saved)")
        for v, f in rec["facts"].items():
            log(f"  {v}: dims {tuple(f['dims'])}, units '{f['units']}', fill {f['fill']}, "
                f"lat {f['lat'][0]:.3f}..{f['lat'][1]:.3f} ({f['lat'][2]}), lon {f['lon'][0]:.3f}..{f['lon'][1]:.3f} ({f['lon'][2]})")
            log(f"     one month in {f['monthlyUnit']}: min {f['min']:.3f}, max {f['max']:.3f}, mean {f['mean']:.3f} "
                f"(unweighted over grid points); missing points {f['missing']}")
        result["products"][reader.source_id] = {"shortName": reader.short_name, "version": reader.version, "granules": len(found),
                                                "firstMonth": months[0] if months else None, "lastMonth": months[-1] if months else None,
                                                "doubled": doubled, "gaps": gaps, "route": rec["route"],
                                                "routesFailed": rec.get("routesTried", {}), "facts": rec["facts"],
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
        recs = [json.loads(ed.record_path(reader, m).read_text(encoding="utf-8")) for m in table if ed.record_path(reader, m).exists()]
        routes = {r["route"] for r in recs if r.get("box") == (list(box) if box else None)}
        if len(routes) == 1:
            route = routes.pop()
        else:
            m0 = next(iter(table))
            route = ed.probe_routes(reader, m0, table[m0], box, log=log)["route"]
        log(f"  route: {route}")
        records = ed.fetch_product(reader, table, route, box, workers=workers, log=log)
        fields = {v: [] for v in reader.file_variables()}
        for m in table:
            got, _ = ed.load_month(reader, m, box)
            for v, xs in fields.items():
                xs.append(got[v])
        store_monthly(reader, fields, list(table), box, bbox, records, route, log=log)


def load_field(reader: Reader, file_variable: str, cache: Path = CACHE) -> MonthlyField | None:
    p = monthly_path(reader, cache)
    if not p.exists():
        return None
    with np.load(p, allow_pickle=False) as z:
        return MonthlyField([str(m) for m in z["months"]], z[f"values__{file_variable}"], str(z["grid"]), int(z["row0"]), int(z["col0"]))


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
def index_support(index: dict, region_id: str, grid_id: str) -> bool:
    """True if the region passes the support rule on this grid (02 §14 step 5: otherwise no series there)."""
    r = next(x for x in index["regions"] if x["id"] == region_id)
    return bool(r["support"].get(grid_id, {}).get("passes"))


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


def bundle(bundle_id: str = "b1", cache: Path = CACHE, log=print) -> Path:
    """.cache/monthly/ + .cache/bundle/<id>/regions/ → series, pairs, map fields and input_manifest.json."""
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
            n = 0
            ok = [rid for rid in in_set if index_support(index, rid, reader.grid_id)]
            for rid in ok:
                series.write_series(out, vid, rid, field, masks[(rid, reader.grid_id)][0])
                n += 1
            for p in index["pairs"] if reader.grid_id in NATIVE_GRIDS else []:
                series.write_pair(out, vid, p["id"], field, masks[(p["a"], reader.grid_id)][0], masks[(p["b"], reader.grid_id)][0])
            log(f"  {vid}: {n} region series, {len(index['pairs'])} pair series, {field.months[0]}..{field.months[-1]} on {reader.grid_id}")
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


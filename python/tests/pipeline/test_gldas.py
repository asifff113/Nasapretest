# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""GLDAS_NOAH10_M 2.1 (evaporation, runoff) without the network: the 1° land grid, units as the GLDAS-2 README gives
them (Evap_tavg kg m-2 s-1 × 86 400; Qs_acc and Qsb_acc kg m-2 per 3 hours × 8), fill → NaN, axis order, runoff as
the sum of its two parts, no series for a sea region, the map field and the region detail files."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import box

from casefile_engine import base as M
from casefile_engine.bundle import check_bundle
from casefile_pipeline import explore, regions, series, stages, units
from casefile_pipeline.boundaries import RegionDef
from casefile_pipeline.grids import GRIDS, NATIVE_GRIDS, lat_centres, lon_centres, mask_grids, row_areas
from casefile_pipeline.series import MonthlyField
from casefile_pipeline.sources import READERS, AccessMismatch, parts
from casefile_pipeline.sources import earthdata as ed

from .helpers import gldas_file

ROOT = Path(__file__).resolve().parents[3]
G = GRIDS["gldas_1deg"]
R = READERS["gldas_noah10_m"]


def _entry(vid):
    return M.VARS[vid]


def _region(rid, b):
    return RegionDef(rid, "comparison", "comparison", {"en": rid, "bn": rid}, {"en": rid, "bn": rid}, box(*b), "test box", "test", tuple(b))


def _land(lon_w=80.0, lon_e=92.0, lat_s=10.0, lat_n=30.0) -> np.ndarray:
    """True on the GLDAS cells whose centre lies in the box: the 'land' of these tests; everything else is sea."""
    la, lo = lat_centres(G), lon_centres(G)
    return ((la >= lat_s) & (la <= lat_n))[:, None] & ((lo >= lon_w) & (lo <= lon_e))[None, :]


# ----------------------------------------------------------------------------------------------- grid and config
def test_gldas_grid_is_the_documented_land_grid():
    assert (G["nlat"], G["nlon"], G["dlat"], G["dlon"]) == (150, 360, 1.0, 1.0)
    assert lat_centres(G)[[0, -1]].tolist() == [-59.5, 89.5] and lon_centres(G)[[0, -1]].tolist() == [-179.5, 179.5]
    assert row_areas(G)[0] == pytest.approx(row_areas(GRIDS["global_1deg"])[149])   # same 1° row at 59.5° S
    assert mask_grids()[:2] == NATIVE_GRIDS and "gldas_1deg" in mask_grids()


def test_gldas_reader_is_registered_with_its_parts():
    assert R.short_name == "GLDAS_NOAH10_M" and R.version == "2.1" and R.grid_id == "gldas_1deg"
    assert {v["id"] for v in R.variables()} == {"evapotranspiration", "runoff", "soil_moisture"}
    assert R.file_variables() == ["SoilMoi0_10cm_inst", "Evap_tavg", "Qs_acc", "Qsb_acc"]
    assert parts("Qs_acc + Qsb_acc") == ["Qs_acc", "Qsb_acc"] and parts("T2M") == ["T2M"]
    assert R.entry_for("Qsb_acc")["id"] == "runoff" and R.entry_for("Evap_tavg")["id"] == "evapotranspiration"
    assert R.entry_for("SoilMoi0_10cm_inst")["id"] == "soil_moisture"
    assert units.convert(np.array([31.5]), "kg m-2", "mm")[0] == pytest.approx(31.5)             # 1 kg m-2 of water = 1 mm
    assert M.SOURCES["gldas_noah10_m"]["doi"] == "10.5067/LWTYSMP3VM5Z"


def test_gldas_unit_conversions():
    assert units.convert(np.array([2.5e-5]), "kg m-2 s-1", "mm/day")[0] == pytest.approx(2.16)
    assert units.convert(np.array([0.1]), "kg m-2 3hr-1", "mm/day")[0] == pytest.approx(0.8)     # 8 three-hour steps a day
    with pytest.raises(ValueError):
        units.convert(np.array([0.1]), "kg m-2", "mm/day")       # the file's bare attribute alone is never converted


# ----------------------------------------------------------------------------------------------- decoding
def test_gldas_file_decodes_to_mm_per_day_with_fill_as_nan(tmp_path):
    land = _land()
    ev = np.where(land, 2.5e-5, np.nan)
    qs = np.where(land, 0.1, np.nan)
    qs[np.argwhere(land)[0][0], np.argwhere(land)[0][1]] = 0.25
    p = gldas_file(tmp_path / "g.nc4", {"Evap_tavg": ("kg m-2 s-1", ev), "Qs_acc": ("kg m-2", qs), "Qsb_acc": ("kg m-2", qs)})
    with ed.open_saved(p, R) as ds:
        e, fe = R.decode(ds, _entry("evapotranspiration"))
        s, fs = R.decode(ds, _entry("runoff"), name="Qs_acc")
    assert e.shape == (150, 360) and e.dtype == np.float32
    assert np.isfinite(e).sum() == land.sum() and np.isnan(e[~land]).all()
    assert float(np.nanmax(e)) == pytest.approx(2.16, rel=1e-5)
    assert float(np.nanmin(s)) == pytest.approx(0.8, rel=1e-5) and float(np.nanmax(s)) == pytest.approx(2.0, rel=1e-5)
    r0, c0 = np.argwhere(land)[0]
    assert float(s[r0, c0]) == pytest.approx(2.0, rel=1e-5)          # row = latitude, column = longitude: no transpose
    assert fe["units"] == "kg m-2 s-1" and fe["fill"] == pytest.approx(-9999.0) and fe["dims"] == ["time", "lat", "lon"]
    assert fs["units"] == "kg m-2" and fs["documentedUnits"] == "kg m-2 3hr-1"
    with pytest.raises(KeyError):
        R.decode(ds, _entry("evapotranspiration"), name="Qs_acc")      # not a part of evapotranspiration


def test_gldas_units_or_grid_that_differ_from_the_documentation_stop(tmp_path):
    x = np.where(_land(), 0.1, np.nan)
    p = gldas_file(tmp_path / "u.nc4", {"Qs_acc": ("kg m-2 s-1", x)})
    with ed.open_saved(p, R) as ds, pytest.raises(AccessMismatch):
        R.decode(ds, _entry("runoff"), name="Qs_acc")
    p = gldas_file(tmp_path / "l.nc4", {"Evap_tavg": ("kg m-2 s-1", x)}, lat0=-60.0)
    with ed.open_saved(p, R) as ds, pytest.raises(AccessMismatch):
        R.decode(ds, _entry("evapotranspiration"))


# ----------------------------------------------------------------------------------------------- bundle
def _store(cache: Path, months: list[str], land: np.ndarray, qs_nan_month: int | None = None) -> None:
    """Store a GLDAS monthly file as fetch does: Evap 2 mm/day, Qs 0.4 and Qsb 0.8 mm/day on land, NaN at sea."""
    n = len(months)
    ev = np.where(land, 2.0, np.nan)[None].repeat(n, 0).astype(np.float32)
    qs = np.where(land, 0.4, np.nan)[None].repeat(n, 0).astype(np.float32)
    qsb = np.where(land, 0.8, np.nan)[None].repeat(n, 0).astype(np.float32)
    if qs_nan_month is not None:
        qs[qs_nan_month] = np.nan
    recs = [{"month": m, "name": f"GLDAS_NOAH10_M.A{m[:4]}{m[5:]}.021.nc4", "sha256": "0" * 64, "bytes": 1, "valuesSha256": "1" * 64,
             "facts": {"Evap_tavg": {"units": "kg m-2 s-1", "fill": -9999.0}, "Qs_acc": {"units": "kg m-2", "fill": -9999.0},
                       "Qsb_acc": {"units": "kg m-2", "fill": -9999.0}}} for m in months]
    stages.store_monthly(R, {"Evap_tavg": list(ev), "Qs_acc": list(qs), "Qsb_acc": list(qsb)}, months, None, None, recs,
                         "opendap_subset", cache=cache, log=lambda *_: None)


def test_runoff_is_the_sum_of_its_parts_and_nan_if_a_part_is(tmp_path):
    months = ed.month_range("2001-01", "2001-12")
    _store(tmp_path, months, _land(), qs_nan_month=3)
    f = stages.load_field(R, "Qs_acc + Qsb_acc", tmp_path)
    r0, c0 = np.argwhere(_land())[0]
    assert f.grid_id == "gldas_1deg" and f.values.shape == (12, 150, 360)
    assert float(f.values[0, r0, c0]) == pytest.approx(1.2) and np.isnan(f.values[3, r0, c0]) and np.isnan(f.values[0, 0, 0])
    assert float(stages.load_field(R, "Evap_tavg", tmp_path).values[0, r0, c0]) == pytest.approx(2.0)
    assert stages.load_field(R, "Qs_acc + Qsb_acc + Qsm_acc", tmp_path) is None          # a part not fetched: fetch again


def test_a_sea_region_gets_no_series_and_the_bundle_passes_check_bundle(tmp_path):
    cache = tmp_path / "cache"
    months = ed.month_range("2001-01", "2002-12")
    _store(cache, months, _land())
    defs = [_region("cmp:test_land", (84.0, 18.0, 90.0, 24.0)), _region("cmp:test_sea", (60.0, -20.0, 70.0, -10.0))]
    out = cache / "bundle" / "g1"
    index, _ = regions.build_regions(defs, out, "g1", prereg={"pairs": []}, log=lambda *_: None)
    grid_ids = [g["id"] for g in index["grids"]]
    assert grid_ids[:2] == list(NATIVE_GRIDS) and "gldas_1deg" in grid_ids[2:]    # extra grids follow the native ones
    assert all(r["inSet"] for r in index["regions"])                    # decided by the MERRA-2 and IMERG grids only
    assert all(set(r["support"]) == set(NATIVE_GRIDS) for r in index["regions"])     # what prereg.json receives
    _, masks = regions.load_masks(out)
    assert all(stages.grid_passes(index, masks, r["id"], "gldas_1deg") for r in index["regions"])
    logged = []
    stages.bundle("g1", cache=cache, log=logged.append)
    assert check_bundle(out) == []
    z = np.load(out / "series/runoff/cmp__test_land.npz")
    assert np.allclose(z["monthly"], 1.2) and str(z["grid"]) == "gldas_1deg" and str(z["start"]) == "2001-01"
    assert np.allclose(np.load(out / "series/evapotranspiration/cmp__test_land.npz")["monthly"], 2.0)
    assert not (out / "series/runoff/cmp__test_sea.npz").exists() and not (out / "series/evapotranspiration/cmp__test_sea.npz").exists()
    assert any("no series for ['cmp:test_sea']" in s for s in logged)
    mp = np.load(out / "map/runoff__ANN.npz")
    assert mp["values"].shape == (180, 360, 2) and mp["years"].tolist() == [2001, 2002]
    one = GRIDS["global_1deg"]
    row = round((one["lat0"] - 20.5) / -one["dlat"])
    col = round((87.5 - one["lon0"]) / one["dlon"])
    assert mp["values"][row, col, 0] == pytest.approx(1.2 * 365)          # mm/day × days (rule: sum)
    assert np.isnan(mp["values"][179, col, 0])                            # south of 60° S: outside the GLDAS grid
    man = json.loads((out / "input_manifest.json").read_text(encoding="utf-8"))
    (p,) = man["products"]
    assert p["shortName"] == "GLDAS_NOAH10_M" and p["variables"] == ["Evap_tavg", "Qs_acc", "Qsb_acc"]
    assert p["doi"] == "10.5067/LWTYSMP3VM5Z" and p["granuleCount"] == 24


# ----------------------------------------------------------------------------------------------- region detail files
def test_region_files_take_a_land_field_on_its_own_grid(tmp_path, monkeypatch):
    defs = [_region("cmp:test_land", (84.0, 18.0, 90.0, 24.0)), _region("cmp:test_sea", (60.0, -20.0, 70.0, -10.0))]
    monkeypatch.setattr(explore, "all_region_defs", lambda: defs)
    months = ed.month_range("2001-01", "2002-12")
    land = _land()

    def fields():
        yield "air_temp", MonthlyField(months, np.full((24, M.MERRA2["nlat"], M.MERRA2["nlon"]), 7.25, dtype=np.float32), "merra2_native")
        yield "runoff", MonthlyField(months, np.where(land, 1.2, np.nan)[None].repeat(24, 0).astype(np.float32), "gldas_1deg")

    assert explore.write_region_files(tmp_path, "t1", fields, log=lambda *_: None) == 2
    d = json.loads((tmp_path / "explore/regions/cmp__test_land.json").read_text(encoding="utf-8"))
    assert d["variables"]["runoff"]["annual"] == [pytest.approx(438.0), pytest.approx(438.0)]       # 1.2 mm/day × 365
    assert d["variables"]["runoff"]["monthlyClimatology"] == [pytest.approx(1.2)] * 12
    assert d["grid"] == "merra2_native" and d["variables"]["air_temp"]["annual"] == [7.25, 7.25]
    sea = json.loads((tmp_path / "explore/regions/cmp__test_sea.json").read_text(encoding="utf-8"))
    assert "runoff" not in sea["variables"] and "air_temp" in sea["variables"]     # land model: nothing over the sea
    idx = json.loads((tmp_path / "explore/index.json").read_text(encoding="utf-8"))
    assert [v["id"] for v in idx["variables"]] == ["air_temp", "runoff"]
    sys.path.insert(0, str(ROOT / "tools"))
    from validate_results import validate
    assert validate(tmp_path) == []


def test_series_writer_skips_a_region_without_any_value(tmp_path):
    months = ed.month_range("2001-01", "2001-12")
    f = MonthlyField(months, np.full((12, 150, 360), np.nan, dtype=np.float32), "gldas_1deg")
    assert series.write_series(tmp_path, "runoff", "cmp:test_sea", f, [[10, 10, 1.0]]) is None
    assert not (tmp_path / "series").exists()

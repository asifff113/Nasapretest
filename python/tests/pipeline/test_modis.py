# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""MOD13C2 061 (plant greenness, NDVI) without the network: the file layout the cloud OPeNDAP server returns (two
HDF-EOS groups, no time dimension, latitude north to south), the documented scale 0.0001 against the file's MODIS
scale_factor 10000, fill and out-of-range values → NaN, the area-weighted 10 × 10 block mean onto the 0.5° grid with
its half-area rule, files that differ from the documentation stopping, and a bundle that passes check-bundle."""
from __future__ import annotations

import json
from pathlib import Path

import h5netcdf
import numpy as np
import pytest
from shapely.geometry import box

from casefile_engine import base as M
from casefile_engine.bundle import check_bundle
from casefile_pipeline import regions, stages, units
from casefile_pipeline.boundaries import RegionDef
from casefile_pipeline.grids import GRIDS, NATIVE_GRIDS, lat_centres, lon_centres, mask_grids
from casefile_pipeline.sources import READERS, AccessMismatch
from casefile_pipeline.sources import earthdata as ed
from casefile_pipeline.sources.modis import NDVI, block_mean

G = GRIDS["modis_05deg"]
R = READERS["modis_vegetation"]
Y, X = "YDim_MOD_Grid_monthly_CMG_VI", "XDim_MOD_Grid_monthly_CMG_VI"
FILL = -3000


def _entry():
    return M.VARS["greenness"]


def _fine_land(lat_s=40.0, lat_n=50.0, lon_w=10.0, lon_e=20.0) -> np.ndarray:
    """True on the 0.05° cells (rows north to south, as stored) whose centre lies in the box."""
    lat = 90.0 - 0.025 - 0.05 * np.arange(3600)
    lon = -180.0 + 0.025 + 0.05 * np.arange(7200)
    return ((lat > lat_s) & (lat < lat_n))[:, None] & ((lon > lon_w) & (lon < lon_e))[None, :]


def mod13c2_file(path: Path, stored: np.ndarray, *, scale_factor: float = 10000.0, units_attr: str = "NDVI",
                 south_first: bool = False) -> Path:
    """A MOD13C2-like OPeNDAP response: dims at the root, Latitude/Longitude in MOD_Grid_monthly_CMG_VI, the int16 NDVI
    (rows north to south) in MOD_Grid_monthly_CMG_VI/Data_Fields with the attributes the real file carries."""
    lat = 90.0 - 0.025 - 0.05 * np.arange(3600)
    if south_first:
        lat = lat[::-1]
    with h5netcdf.File(path, "w") as f:
        f.dimensions = {Y: 3600, X: 7200}
        g = f.create_group("MOD_Grid_monthly_CMG_VI")
        g.create_variable("Latitude", (Y,), "f8", data=lat)
        g.create_variable("Longitude", (X,), "f8", data=-180.0 + 0.025 + 0.05 * np.arange(7200))
        v = g.create_group("Data_Fields").create_variable(NDVI, (Y, X), "i2", data=stored.astype(np.int16),
                                                          compression="gzip", fillvalue=np.int16(FILL))
        v.attrs.update({"long_name": "CMG 0.05 Deg Monthly NDVI", "units": units_attr, "scale_factor": scale_factor,
                        "add_offset": 0.0, "valid_range": np.array([-2000, 10000], dtype=np.int16)})
    return path


# ----------------------------------------------------------------------------------------------- grid and config
def test_modis_grid_is_half_a_degree_and_gets_masks():
    assert (G["nlat"], G["nlon"], G["dlat"], G["dlon"]) == (360, 720, 0.5, 0.5)
    assert lat_centres(G)[[0, -1]].tolist() == [-89.75, 89.75] and lon_centres(G)[[0, -1]].tolist() == [-179.75, 179.75]
    assert mask_grids()[:2] == NATIVE_GRIDS and "modis_05deg" in mask_grids()


def test_modis_reader_is_registered_with_the_documented_facts():
    assert R.short_name == "MOD13C2" and R.version == "061" and R.grid_id == "modis_05deg"
    assert [v["id"] for v in R.variables()] == ["greenness"] and R.file_variables() == [NDVI]
    assert M.SOURCES["modis_vegetation"]["doi"] == "10.5067/MODIS/MOD13C2.061"
    assert R.constraint(NDVI) == ("/MOD_Grid_monthly_CMG_VI/Data_Fields/CMG_0_05_Deg_Monthly_NDVI;"
                                  "/MOD_Grid_monthly_CMG_VI/Latitude;/MOD_Grid_monthly_CMG_VI/Longitude")
    assert units.convert(np.array([0.42]), "NDVI", "")[0] == pytest.approx(0.42)
    with pytest.raises(AccessMismatch):
        R.name_check(["MOD13C2.A2020001.006.2020001.hdf"])                 # an older collection
    R.name_check(["MOD13C2.A2020001.061.2020328142931.hdf"])


# ----------------------------------------------------------------------------------------------- block mean
def test_block_mean_weights_rows_by_area_and_keeps_half_area_blocks():
    step, block = 10.0, 3                                   # an 18 × 36 global grid in 3 × 3 blocks of 30°
    x = np.full((18, 36), np.nan)
    x[0:3, 0:3] = np.array([[0.0], [1.0], [1.0]])           # 90° S–60° S: the polar row is the smallest
    s = np.radians([-90.0, -80.0, -70.0])
    w = np.sin(s + np.radians(step)) - np.sin(s)
    out = block_mean(x, block, step)
    assert out.shape == (6, 12)
    assert out[0, 0] == pytest.approx((w[1] + w[2]) / w.sum())             # not 2/3: rows weigh by their area
    y = np.full((18, 36), np.nan)
    y[3:6, 3:6] = 0.5
    y[3, 3:6] = np.nan                                       # the southern row of the block missing: most area stays valid
    y[6:9, 6:9] = 0.5
    y[7:9, 6:9] = np.nan                                     # two of three rows missing: under half the area
    out = block_mean(y, block, step)
    assert out[1, 1] == pytest.approx(0.5) and np.isnan(out[2, 2]) and np.isnan(out[0, 0])
    with pytest.raises(ValueError):
        block_mean(np.zeros((17, 36)), block, step)


# ----------------------------------------------------------------------------------------------- decoding
def test_mod13c2_decodes_to_ndvi_on_the_half_degree_grid(tmp_path):
    land = _fine_land()
    stored = np.where(land, 5000, FILL)
    r, c = np.argwhere(land)[0]
    stored[r, c] = 9000                                      # one bright cell
    stored[r, c + 1] = -2500                                 # below the valid range: left out, not a value
    p = mod13c2_file(tmp_path / "m.dap.nc4", stored)
    with ed.open_saved(p, R) as ds:
        v, f = R.decode(ds, _entry())
    assert v.shape == (360, 720) and v.dtype == np.float32
    la, lo = lat_centres(G), lon_centres(G)
    inside = ((la > 40) & (la < 50))[:, None] & ((lo > 10) & (lo < 20))[None, :]
    assert np.isfinite(v[inside]).all() and np.isnan(v[~inside]).all()      # north stays north: rows flipped once
    assert np.nanmin(v) == pytest.approx(0.5, abs=1e-6)                     # 5000 × 0.0001, never × 10000
    corner = (np.abs(la - 49.75).argmin(), np.abs(lo - 10.25).argmin())     # the block holding the bright cell
    assert v[corner] > 0.5 and v[corner] < 0.55
    assert f["units"] == "NDVI" and f["fill"] == FILL and f["scaleFactorInFile"] == 10000.0 and f["documentedScale"] == 0.0001
    assert f["dims"] == [Y, X] and f["lat"][2] == 3600 and f["lon"][2] == 7200 and f["monthlyUnit"] == ""
    assert f["finite"] == int(inside.sum()) and f["fineValid"] == int(land.sum()) - 1


def test_files_that_differ_from_the_documentation_stop(tmp_path):
    stored = np.where(_fine_land(), 5000, FILL)
    for name, kw in [("cf.nc4", {"scale_factor": 0.0001}), ("u.nc4", {"units_attr": "1"}), ("s.nc4", {"south_first": True})]:
        p = mod13c2_file(tmp_path / name, stored, **kw)
        with ed.open_saved(p, R) as ds, pytest.raises(AccessMismatch):
            R.decode(ds, _entry())


# ----------------------------------------------------------------------------------------------- bundle
def _region(rid, b):
    return RegionDef(rid, "comparison", "comparison", {"en": rid, "bn": rid}, {"en": rid, "bn": rid}, box(*b), "test box", "test", tuple(b))


def test_a_land_region_gets_a_greenness_series_and_the_bundle_passes(tmp_path):
    cache = tmp_path / "cache"
    months = ed.month_range("2001-01", "2002-12")
    la, lo = lat_centres(G), lon_centres(G)
    land = ((la > 40) & (la < 50))[:, None] & ((lo > 10) & (lo < 20))[None, :]
    vals = np.where(land, 0.6, np.nan)[None].repeat(len(months), 0).astype(np.float32)
    recs = [{"month": m, "name": f"MOD13C2.A{m[:4]}001.061.x.hdf", "sha256": "0" * 64, "bytes": 1, "valuesSha256": "1" * 64,
             "facts": {NDVI: {"units": "NDVI", "fill": float(FILL)}}} for m in months]
    stages.store_monthly(R, {NDVI: list(vals)}, months, None, None, recs, "opendap_subset", cache=cache, log=lambda *_: None)
    defs = [_region("cmp:test_land", (12.0, 42.0, 18.0, 48.0)), _region("cmp:test_sea", (-40.0, -20.0, -30.0, -10.0))]
    out = cache / "bundle" / "m1"
    index, _ = regions.build_regions(defs, out, "m1", prereg={"pairs": []}, log=lambda *_: None)
    assert "modis_05deg" in [g["id"] for g in index["grids"]]
    assert all(set(r["support"]) == set(NATIVE_GRIDS) for r in index["regions"])     # the region set is not changed
    stages.bundle("m1", cache=cache, log=lambda *_: None)
    assert check_bundle(out) == []
    z = np.load(out / "series/greenness/cmp__test_land.npz")
    assert np.allclose(z["monthly"], 0.6) and str(z["grid"]) == "modis_05deg"
    assert not (out / "series/greenness/cmp__test_sea.npz").exists()
    mp = np.load(out / "map/greenness__ANN.npz")
    one = GRIDS["global_1deg"]
    row, col = round((one["lat0"] - 45.5) / -one["dlat"]), round((15.5 - one["lon0"]) / one["dlon"])
    assert mp["values"][row, col, 0] == pytest.approx(0.6)                  # rule: mean of the months
    man = json.loads((out / "input_manifest.json").read_text(encoding="utf-8"))
    (p,) = man["products"]
    assert p["shortName"] == "MOD13C2" and p["version"] == "061" and p["variables"] == [NDVI] and p["granuleCount"] == 24

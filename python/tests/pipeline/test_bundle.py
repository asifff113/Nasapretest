# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Bundle stage: region means (P-19), pair series on split weights (P-18), the conservative regrid (P-08), and a tiny
synthetic end-to-end run whose bundle `casefile-engine check-bundle` accepts (P-19)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import box

from casefile_engine import base as M
from casefile_engine.bundle import check_bundle
from casefile_pipeline import mapfield, regions, series, stages
from casefile_pipeline.boundaries import RegionDef
from casefile_pipeline.grids import row_areas
from casefile_pipeline.series import MonthlyField
from casefile_pipeline.sources import READERS
from casefile_pipeline.sources import earthdata as ed

from .helpers import merra2_file

ROOT = Path(__file__).resolve().parents[3]


def _region(rid, b):
    return RegionDef(rid, "comparison", "comparison", {"en": rid, "bn": rid}, {"en": rid, "bn": rid}, box(*b), "test box", "test", tuple(b))


# ----------------------------------------------------------------------------------------------- region means
def test_p19_region_mean_of_a_constant_field_is_that_constant():
    cells, _ = M.box_weights((88.3, 21.2, 92.7, 26.1), M.MERRA2)
    f = MonthlyField(["2001-01", "2001-02"], np.full((2, 361, 576), 7.25, dtype=np.float32), "merra2_native")
    x = series.cell_matrix(f, cells)
    assert series.region_mean(x, series.weights(cells, "merra2_native")) == pytest.approx([7.25, 7.25])


def test_region_mean_is_nan_when_over_10_percent_of_the_weight_is_missing():
    x = np.array([[1.0, 1.0], [3.0, np.nan], [5.0, 5.0]])
    w = np.array([1.0, 0.05, 1.0])                       # the missing cell holds under 10%: mean of the others
    assert series.region_mean(x, w)[1] == pytest.approx(3.0)
    w = np.array([1.0, 0.5, 1.0])                        # 20% missing: NaN, never a filled value
    assert np.isnan(series.region_mean(x, w)[1])
    assert series.region_mean(x, w)[0] == pytest.approx((1 + 1.5 + 5) / 2.5)


def test_series_start_is_padded_to_january():
    start, v = series.pad_to_january(["2001-03", "2001-04"], np.ones((2, 1, 1)))
    assert start == "2001-01" and v.shape[0] == 4 and np.isnan(v[:2]).all()


def test_more_than_2000_cells_are_thinned():
    assert series.thin(np.zeros((4500, 3))).shape[0] <= 2000
    assert series.thin(np.zeros((1999, 3))).shape[0] == 1999


# ----------------------------------------------------------------------------------------------- P-18 pair series
def test_p18_pair_series_use_the_split_weights(tmp_path):
    g = M.MERRA2
    v = np.zeros((1, 361, 576), dtype=np.float32)
    a = [[200, 400, 1.0], [200, 401, 0.6]]
    b = [[200, 401, 0.4], [200, 402, 1.0]]
    v[0, 200, 400], v[0, 200, 401], v[0, 200, 402] = 1.0, 100.0, 2.0      # the shared cell belongs to A only
    f = MonthlyField(["2001-01"], v, g["id"])
    p = series.write_pair(tmp_path, "rain", "pair_t", f, a, b)
    z = np.load(p)
    ar = row_areas(g)[200]
    assert z["a"][0] == pytest.approx((1.0 * ar + 100.0 * 0.6 * ar) / (1.6 * ar))
    assert z["b"][0] == pytest.approx(2.0)
    assert str(z["start"]) == "2001-01"


# ----------------------------------------------------------------------------------------------- P-08
def test_p08_regrid_keeps_the_area_weighted_global_mean():
    g = M.MERRA2
    rng = np.random.default_rng(3)
    x = (rng.normal(15, 10, (g["nlat"], g["nlon"])) + 20 * np.cos(np.radians(np.linspace(-90, 90, g["nlat"])))[:, None])
    one = mapfield.regrid(x[None], g)[:, :, 0]
    src = np.sum(x * row_areas(g)[:, None]) / (row_areas(g).sum() * g["nlon"])
    dst = np.sum(one * row_areas(M.ONE)[:, None]) / (row_areas(M.ONE).sum() * 360)
    assert abs(dst - src) / abs(src) < 1e-4
    assert one.shape == (180, 360) and np.isfinite(one).all()


def test_regrid_masks_cells_under_half_covered_and_orients_north_up():
    g = M.MERRA2
    x = np.full((g["nlat"], g["nlon"]), np.nan)
    x[g["nlat"] // 2 + 2:, :] = 1.0                      # only the north is valid
    one = mapfield.regrid(x[None], g)[:, :, 0]
    assert np.isfinite(one[0]).all() and np.isnan(one[-1]).all()   # row 0 is 89.5° N


# ----------------------------------------------------------------------------------------------- P-19 end to end
def test_p19_tiny_end_to_end_bundle_passes_check_bundle(tmp_path):
    cache = tmp_path / "cache"
    months = ed.month_range("2001-01", "2002-12")
    lat = M.MERRA2["lat0"] + 0.5 * np.arange(361)
    raw = tmp_path / "raw"
    raw.mkdir()
    for reader, name, unit, make in (
        (READERS["merra2_slv"], "T2M", "K", lambda k: 273.15 + 30 * np.cos(np.radians(lat))[:, None] + 2 * np.sin(k / 12 * 2 * np.pi) + np.zeros((1, 576))),
        (READERS["merra2_precip"], "PRECTOTCORR", "kg m-2 s-1", lambda k: (1 + np.sin(k / 12 * 2 * np.pi)) * 5e-5 + np.zeros((361, 576))),
    ):
        fields, recs = {name: []}, []
        for k, m in enumerate(months):
            p = merra2_file(raw / f"{name}_{m}.nc4", name, unit, make(k))
            with ed.open_saved(p, reader) as ds:
                v, facts = reader.decode(ds, reader.variables()[0])
            fields[name].append(v)
            recs.append({"month": m, "name": p.name, "sha256": ed.sha256_path(p), "bytes": p.stat().st_size,
                         "valuesSha256": ed.values_sha256(v), "facts": {name: facts}})
        stages.store_monthly(reader, fields, months, None, None, recs, "opendap_subset", cache=cache, log=lambda *_: None)
    # IMERG: a stored box only (as fetch keeps it), constant 0.1 mm/hr → 2.4 mm/day
    im = READERS["imerg_v07_final_monthly"]
    r0, c0 = 1000, 2600
    vals = np.full((len(months), 120, 150), 2.4, dtype=np.float32)
    recs = [{"month": m, "name": f"3B-MO.MS.MRG.3IMERG.{m}.V07B.HDF5", "sha256": "0" * 64, "bytes": 1, "valuesSha256": "1" * 64,
             "facts": {"precipitation": {"units": "mm/hr", "fill": -9999.9}}} for m in months]
    stages.store_monthly(im, {"precipitation": list(vals)}, months, (r0, r0 + 120, c0, c0 + 150), (80.0, 10.0, 95.0, 22.0), recs,
                         "opendap_subset", cache=cache, log=lambda *_: None)
    # two overlapping box regions inside the IMERG box, and one pair
    defs = [_region("cmp:test_a", (82.0, 12.0, 86.0, 16.0)), _region("cmp:test_b", (85.5, 12.0, 89.0, 16.0))]
    prereg = {"pairs": [{"id": "pair_test_ab", "a": "cmp:test_a", "b": "cmp:test_b", "lead": True,
                         "question": {"en": "Test?", "bn": "পরীক্ষা?"}}]}
    out = cache / "bundle" / "t1"
    index, masks = regions.build_regions(defs, out, "t1", prereg=prereg, log=lambda *_: None)
    assert all(r["inSet"] for r in index["regions"]) and index["pairs"][0]["split"]["grids"]["merra2_native"]["sharedCells"] > 0
    stages.bundle("t1", cache=cache, log=lambda *_: None)

    assert check_bundle(out) == []
    z = np.load(out / "series/rain_imerg/cmp__test_a.npz")
    assert np.allclose(z["monthly"], 2.4) and str(z["grid"]) == "imerg_native" and str(z["start"]) == "2001-01"
    z = np.load(out / "series/air_temp/cmp__test_a.npz")
    assert z["cells"].shape == (len(masks[("cmp:test_a", "merra2_native")][0]), 24)
    assert z["effective_cells"] == pytest.approx(masks[("cmp:test_a", "merra2_native")][2])
    assert np.load(out / "pairs/rain/pair_test_ab.npz")["a"].shape == (24,)
    mp = np.load(out / "map/air_temp__ANN.npz")
    assert mp["values"].shape == (180, 360, 2) and mp["years"].tolist() == [2001, 2002]
    assert (out / "map/rain__ANN.npz").exists() and not (out / "map/rain_imerg__ANN.npz").exists()
    for f in (out / "input_manifest.json", out / "regions/index.json", *sorted((out / "regions/cells").glob("*/*.json"))):
        assert b"\r\n" not in f.read_bytes(), f          # LF on every OS: the pre-registration pins these hashes
    man = json.loads((out / "input_manifest.json").read_text(encoding="utf-8"))
    assert man["synthetic"] is False and len(man["products"]) == 3
    assert {p["query"]["provider"] for p in man["products"]} == {"earthaccess"}      # the provenance schema's route names
    assert man["checks"][0]["id"] == "fetch_route" and "opendap_subset" in man["checks"][0]["note"]
    assert {p["shortName"] for p in man["products"]} == {"M2TMNXSLV", "M2TMNXFLX", "GPM_3IMERGM"}
    assert all(p["granuleCount"] == 24 for p in man["products"])

    import sys
    sys.path.insert(0, str(ROOT / "tools"))
    from validate_results import validate
    assert validate(out) == []

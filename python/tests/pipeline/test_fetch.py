# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Fetch stage without the network: grids (P-01), units and fills (P-05), the IMERG transpose (P-07), month
bookkeeping (P-10), no hand-built addresses (P-11), IMERG V07 Final only (P-12)."""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pytest

from casefile_engine import base as M
from casefile_pipeline import units
from casefile_pipeline.grids import GRIDS, index_box, row_areas
from casefile_pipeline.sources import READERS, AccessMismatch, Reader, used_readers
from casefile_pipeline.sources import earthdata as ed
from casefile_pipeline.sources.imerg import check_granule_names

from .helpers import granule, imerg_file, merra2_file

SRC = Path(__file__).resolve().parents[2] / "src"


def _open(path, reader):
    return ed.open_saved(path, reader)


def _var(source_id):
    return READERS[source_id].variables()[0]


# ----------------------------------------------------------------------------------------------- P-01
def test_p01_grids_equal_the_engine_and_the_1deg_areas_sum_to_the_sphere():
    assert GRIDS["merra2_native"] == M.MERRA2 and (M.MERRA2["nlat"], M.MERRA2["nlon"]) == (361, 576)
    assert GRIDS["imerg_native"] == M.IMERG and (M.IMERG["nlat"], M.IMERG["nlon"]) == (1800, 3600)
    assert GRIDS["global_1deg"] == M.ONE and (M.ONE["nlat"], M.ONE["nlon"]) == (180, 360)
    total = float(row_areas(M.ONE).sum() * 360)
    assert abs(total - 510_065_881) <= 1
    assert abs(float(row_areas(M.MERRA2).sum() * 576) - 510_065_881) <= 1     # half polar rows included


def test_readers_cover_the_used_variables_from_config():
    got = {v["id"] for r in used_readers() for v in r.variables()}
    want = {v for v, d in M.VARS.items() if d.get("status") in ("analysed", "sensitivity") and d["source"] in READERS}
    assert got == want and got                     # every analysed or sensitivity variable has a reader


# ----------------------------------------------------------------------------------------------- P-05
def test_p05_unit_conversions():
    assert units.convert(np.array([273.15, 300.0]), "K", "°C").tolist() == pytest.approx([0.0, 26.85])
    assert units.convert(np.array([1e-4]), "kg m-2 s-1", "mm/day")[0] == pytest.approx(8.64)   # never × 86 400 000
    assert units.convert(np.array([0.5]), "mm/hr", "mm/day")[0] == pytest.approx(12.0)
    with pytest.raises(ValueError):
        units.convert(np.array([1.0]), "kg m-2", "mm/day")


def test_p05_merra2_t2m_file_decodes_to_celsius_with_fill_as_nan(tmp_path):
    g = GRIDS["merra2_native"]
    x = np.full((g["nlat"], g["nlon"]), 288.15, dtype=np.float32)
    x[10, 20] = 1e15
    r = READERS["merra2_slv"]
    with _open(merra2_file(tmp_path / "t.nc4", "T2M", "K", x), r) as ds:
        v, facts = r.decode(ds, _var("merra2_slv"))
    assert v.shape == (361, 576) and v.dtype == np.float32
    assert np.isnan(v[10, 20]) and np.isfinite(v).sum() == v.size - 1
    assert float(np.nanmax(v)) == pytest.approx(15.0, abs=1e-4)
    assert facts["units"] == "K" and facts["fill"] == pytest.approx(1e15) and facts["dims"] == ["time", "lat", "lon"]


def test_p05_merra2_precip_file_decodes_to_mm_per_day(tmp_path):
    g = GRIDS["merra2_native"]
    x = np.full((g["nlat"], g["nlon"]), 5e-5, dtype=np.float32)
    r = READERS["merra2_precip"]
    with _open(merra2_file(tmp_path / "p.nc4", "PRECTOTCORR", "kg m-2 s-1", x), r) as ds:
        v, _ = r.decode(ds, _var("merra2_precip"))
    assert float(v[0, 0]) == pytest.approx(4.32, rel=1e-5)


def test_units_that_differ_from_the_documentation_stop(tmp_path):
    g = GRIDS["merra2_native"]
    r = READERS["merra2_slv"]
    with _open(merra2_file(tmp_path / "t.nc4", "T2M", "degC", np.zeros((g["nlat"], g["nlon"]))), r) as ds, pytest.raises(AccessMismatch):
        r.decode(ds, _var("merra2_slv"))


# ----------------------------------------------------------------------------------------------- P-07
def test_p07_imerg_arrives_lon_lat_and_is_transposed(tmp_path):
    g = GRIDS["imerg_native"]
    x = np.zeros((g["nlat"], g["nlon"]), dtype=np.float32)
    x[1000, 2600] = 0.25                                                # one wet point at (10.05° N, 80.05° E)
    x[5, 7] = -9999.9
    r = READERS["imerg_v07_final_monthly"]
    with _open(imerg_file(tmp_path / "i.HDF5", x), r) as ds:
        assert ds["precipitation"].dims == ("time", "lon", "lat")
        v, facts = r.decode(ds, _var("imerg_v07_final_monthly"))
        sub, _ = r.decode(ds, _var("imerg_v07_final_monthly"), box=(990, 1010, 2590, 2610))
    assert v.shape == (1800, 3600)
    assert float(v[1000, 2600]) == pytest.approx(6.0)                   # mm/hr × 24
    assert np.isnan(v[5, 7]) and facts["fill"] == pytest.approx(-9999.9, rel=1e-6)
    assert sub.shape == (20, 20) and float(sub[10, 10]) == pytest.approx(6.0)


def test_index_box_covers_the_box():
    r0, r1, c0, c1 = index_box(GRIDS["imerg_native"], (80.0, 5.0, 95.0, 22.0))
    assert (r0, r1, c0, c1) == (950, 1120, 2600, 2750)


# ----------------------------------------------------------------------------------------------- P-10
def test_p10_months_from_temporal_metadata_and_complete():
    items = [granule(m) for m in ed.month_range("1999-11", "2000-03")]
    table = ed.month_table(items, "1999-11", "2000-03")
    assert list(table) == ["1999-11", "1999-12", "2000-01", "2000-02", "2000-03"]


def test_p10_a_missing_month_raises():
    items = [granule(m) for m in ed.month_range("2000-01", "2000-06") if m != "2000-04"]
    with pytest.raises(ed.MonthError, match="missing"):
        ed.month_table(items, "2000-01", "2000-06")


def test_p10_a_doubled_month_raises():
    items = [granule(m) for m in ed.month_range("2000-01", "2000-03")] + [granule("2000-02", "other")]
    with pytest.raises(ed.MonthError, match="doubled"):
        ed.month_table(items, "2000-01", "2000-03")


def test_p10_a_granule_that_is_not_one_month_raises():
    g = granule("2000-01")
    g["umm"]["TemporalExtent"]["RangeDateTime"]["EndingDateTime"] = "2000-02-15T00:00:00Z"
    with pytest.raises(ed.MonthError):
        ed.granule_month(g["umm"])


def test_p10_manifest_lists_every_file_with_its_sha256():
    from casefile_pipeline.manifest import product_entry

    recs = [{"month": m, "name": f"f{m}.nc4", "sha256": "a" * 64, "bytes": 10, "valuesSha256": "b" * 64,
             "facts": {"T2M": {"units": "K", "fill": 1e15}}} for m in ed.month_range("2000-01", "2000-03")]
    e = product_entry("merra2_slv", recs, "2000-01", "2000-03", None, "earthaccess")
    assert e["granuleCount"] == 3 and [f["month"] for f in e["files"]] == ["2000-01", "2000-02", "2000-03"]
    assert all(len(f["sha256"]) == 64 and f["valuesSha256"] for f in e["files"])
    assert e["shortName"] == "M2TMNXSLV" and e["units"] == {"T2M": "K"}


def test_default_windows_follow_config():
    first, last = ed.default_window(READERS["merra2_slv"])
    assert first == "1980-01" and last.endswith("-12")
    assert ed.default_window(READERS["imerg_v07_final_monthly"]) == ("1998-01", "2025-09")


# ----------------------------------------------------------------------------------------------- P-11
def test_p11_no_hand_built_addresses_in_src():
    bad = re.compile(r"gesdisc\.eosdis\.nasa\.gov|MERRA2_[0-9]{3}")
    hits = [f"{p}:{i}" for p in SRC.rglob("*.py") for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1) if bad.search(line)]
    assert hits == []


def test_p11_on_premises_addresses_are_refused():
    with pytest.raises(ValueError):
        ed.check_address("https://goldsmr4." + "gesdisc.eosdis.nasa.gov/opendap/x.nc4")
    assert ed.check_address("https://opendap.earthdata.nasa.gov/collections/C1/granules/g")
    umm = {"RelatedUrls": [{"Type": "GET DATA", "URL": "https://data.gesdisc.earthdata.nasa.gov/data/x.nc4"},
                           {"Type": "USE SERVICE API", "Subtype": "OPENDAP DATA", "URL": "https://opendap.earthdata.nasa.gov/collections/C1/granules/g"}]}
    assert ed.opendap_url(umm) == "https://opendap.earthdata.nasa.gov/collections/C1/granules/g"


def test_constraints_name_variable_and_coordinates():
    assert READERS["merra2_slv"].constraint() == "/T2M;/time;/lat;/lon"
    assert READERS["imerg_v07_final_monthly"].constraint() == "/Grid/precipitation;/Grid/time;/Grid/lat;/Grid/lon"


# ----------------------------------------------------------------------------------------------- P-12
def test_p12_imerg_v07_final_only():
    check_granule_names(["3B-MO.MS.MRG.3IMERG.20250801-S000000-E235959.08.V07B.HDF5"])
    for bad in ("3B-MO.MS.MRG.3IMERG.20250801-S000000-E235959.08.V08A.HDF5", "3B-HHR-L.MS.MRG.3IMERG.20250801.V07B.RT-H5"):
        with pytest.raises(ValueError):
            check_granule_names([bad])
    assert READERS["imerg_v07_final_monthly"].version == "07"


def test_a_new_reader_registers_under_its_source_id():
    r = Reader(source_id="merra2_slv", grid_id="merra2_native", group=None, dims=("time", "lat", "lon"), time="time",
               lat="lat", lon="lon", units={"T2M": "K"})
    assert r.short_name == "M2TMNXSLV" and r.file_variables() == ["T2M"]

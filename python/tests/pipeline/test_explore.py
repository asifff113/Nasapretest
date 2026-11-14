# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Exploration files: yearly map frames and region detail files (no network)."""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import box

from casefile_engine import base as M
from casefile_pipeline import explore
from casefile_pipeline.boundaries import RegionDef
from casefile_pipeline.series import MonthlyField

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))
from validate_results import validate


def test_frame_scale_keeps_values_inside_int16():
    assert explore.frame_scale(np.array([35.0, -20.0])) == pytest.approx(0.01)
    assert explore.frame_scale(np.array([3000.0])) == pytest.approx(0.1)
    assert explore.frame_scale(np.array([1030.0])) == pytest.approx(0.1)
    for top in (0.5, 35.0, 999.0, 12345.0):
        assert top / explore.frame_scale(np.array([top])) <= 30000


def test_year_frames_round_trip(tmp_path):
    bundle, results = tmp_path / "b", tmp_path / "r"
    (bundle / "map").mkdir(parents=True)
    rng = np.random.default_rng(1)
    v = rng.normal(15, 10, (180, 360, 3))
    v[0, 0, 1] = np.nan
    np.savez_compressed(bundle / "map/air_temp__ANN.npz", years=np.array([2001, 2002, 2003]), values=v)
    assert explore.write_year_frames(bundle, results, "t1", log=lambda *_: None) == ["air_temp"]
    meta = json.loads((results / "maps/air_temp/ANN/years.json").read_text(encoding="utf-8"))
    raw = np.frombuffer(gzip.decompress((results / "maps/air_temp/ANN/years.bin.gz").read_bytes()), dtype="<i2").reshape(3, 180, 360)
    back = np.where(raw == meta["fill"], np.nan, raw * meta["scale"] + meta["offset"])
    assert meta["years"] == [2001, 2002, 2003] and meta["layout"] == "[year][row][col]"
    assert np.isnan(back[1, 0, 0]) and np.nanmax(np.abs(back - np.moveaxis(v, 2, 0))) <= meta["scale"] / 2 + 1e-12
    assert validate(results) == []


def _region(rid, b):
    return RegionDef(rid, "comparison", "comparison", {"en": rid, "bn": rid}, {"en": rid, "bn": rid}, box(*b), "test box", "test", tuple(b))


def test_region_files_give_engine_annual_values_and_validate(tmp_path, monkeypatch):
    defs = [_region("cmp:test_a", (88.0, 22.0, 91.0, 25.0)), _region("cmp:test_b", (10.0, 40.0, 10.3, 40.3))]
    monkeypatch.setattr(explore, "all_region_defs", lambda: defs)
    world = RegionDef("world", "world", "world", {"en": "World", "bn": "পৃথিবী"}, {"en": "", "bn": ""}, box(-180, -90, 180, 90),
                      "the whole globe", "not applicable", (-180.0, -90.0, 180.0, 90.0))
    monkeypatch.setattr(explore, "area_defs", lambda: [world])
    months = [f"{y}-{m:02d}" for y in (2001, 2002) for m in range(1, 13)]
    g = M.MERRA2

    def fields():
        yield "air_temp", MonthlyField(months, np.full((24, g["nlat"], g["nlon"]), 7.25, dtype=np.float32), g["id"])
        yield "rain", MonthlyField(months, np.full((24, g["nlat"], g["nlon"]), 2.0, dtype=np.float32), g["id"])

    n = explore.write_region_files(tmp_path, "t1", fields, log=lambda *_: None)
    assert n == 2
    d = json.loads((tmp_path / "explore/regions/cmp__test_a.json").read_text(encoding="utf-8"))
    assert d["variables"]["air_temp"]["annual"] == [7.25, 7.25] and d["variables"]["air_temp"]["years"] == [2001, 2002]
    assert d["variables"]["rain"]["annual"] == [730.0, 730.0]          # 2 mm/day over 365 days (rule: sum)
    assert d["variables"]["rain"]["monthlyClimatology"] == [2.0] * 12
    assert d["region"]["passesSupport"] is True
    small = json.loads((tmp_path / "explore/regions/cmp__test_b.json").read_text(encoding="utf-8"))
    assert small["region"]["passesSupport"] is False                   # a 0.3° box is far below 4 MERRA-2 cells
    idx = json.loads((tmp_path / "explore/index.json").read_text(encoding="utf-8"))
    assert [r["id"] for r in idx["regions"]] == ["cmp:test_a", "cmp:test_b"] and [v["id"] for v in idx["variables"]] == ["air_temp", "rain"]
    w = json.loads((tmp_path / "explore/areas/world.json").read_text(encoding="utf-8"))
    assert w["schema"] == "casefile/explore_area@3" and w["variables"]["air_temp"]["annual"] == [7.25, 7.25]   # chunked world mean
    assert [a["id"] for a in idx["areas"]] == ["world"] and idx["trends"] == ["explore/trends/air_temp.json", "explore/trends/rain.json"]
    tr = json.loads((tmp_path / "explore/trends/air_temp.json").read_text(encoding="utf-8"))
    assert {i["id"] for i in tr["items"]} == {"cmp:test_a", "cmp:test_b", "world"} and all(i["reason"] == "too_short" for i in tr["items"])
    assert validate(tmp_path) == []

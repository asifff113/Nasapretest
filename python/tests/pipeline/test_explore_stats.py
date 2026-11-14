# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Past against present and exploration trends (casefile_pipeline.explore_stats): no network."""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import numpy as np
import pytest

from casefile_engine import layer as L
from casefile_pipeline import explore
from casefile_pipeline import explore_stats as X

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))
from validate_results import validate


def _monthly(first, last, slope_per_year, seed=4, base=25.0, season=3.0, noise=0.4):
    rng = np.random.default_rng(seed)
    years = np.arange(first, last + 1)
    m = np.array([base + season * np.sin(2 * np.pi * k / 12) + slope_per_year * (y - first) + rng.normal(0, noise)
                  for y in years for k in range(12)])
    return years, m


def _annual(first, last, m, rule="mean"):
    return L.annual_values(f"{first}-01", list(m), "ANN", rule, first, last)["values"]


def test_periods_follow_the_record():
    assert X.baseline_years(1980, 2025) == (1991, 2020) and X.baseline_years(2000, 2025) == (2001, 2020)
    assert X.baseline_years(2010, 2025) is None
    assert X.decade_years(1980, 2025) == ((1980, 1989), (2016, 2025)) and X.decade_years(2010, 2025) is None


def test_payload_anomalies_decades_and_engine_trend():
    years, m = _monthly(1980, 2025, 0.03)
    ann = _annual(1980, 2025, m)
    p = X.series_payload("air_temp", "1980-01", 1980, 2025, m, ann)
    a = np.array(ann, dtype=float)
    assert p["baseline"] == [1991, 2020]
    anom = np.array(p["annualAnomaly"], dtype=float)
    assert abs(np.mean(anom[(years >= 1991) & (years <= 2020)])) < 0.01               # zero on average over the baseline
    assert len(p["monthlyAnomaly"]) == 46 and len(p["monthlyAnomaly"][0]) == 12
    assert abs(np.nanmean(np.array(p["monthlyAnomaly"], dtype=float)[11:41])) < 0.02  # the seasonal cycle is removed
    d = p["decades"]
    assert (d["early"]["from"], d["early"]["to"], d["late"]["from"], d["late"]["to"]) == (1980, 1989, 2016, 2025)
    assert d["change"] == pytest.approx(a[-10:].mean() - a[:10].mean(), abs=1e-3)
    assert p["rolling10"][8] is None and p["rolling10"][9] == pytest.approx(a[:10].mean(), abs=1e-3)
    st = L.core_stats(years, list(a))                                                  # the engine's own statistics
    t = p["trend"]
    assert t["testable"] and t["reason"] == "ok" and not t["exploratory"] and t["n"] == 46
    assert t["ratePerDecade"] == pytest.approx(st["change"]["ratePerDecade"], rel=1e-3)
    assert t["ratePerDecade"] == pytest.approx(0.3, abs=0.05)
    assert t["p"] == pytest.approx(st["mkAr1"]["p"], rel=1e-3) and t["lowPerDecade"] < t["ratePerDecade"] < t["highPerDecade"]
    assert len(p["monthTrends"]) == 12 and all(mt["testable"] for mt in p["monthTrends"])
    assert all(mt["q"] is not None for mt in p["monthTrends"])


def test_descriptive_short_and_missing_records_get_no_test():
    _, m = _monthly(2000, 2025, 0.0)
    assert X.series_payload("soil_moisture", "2000-01", 2000, 2025, m, _annual(2000, 2025, m))["trend"]["reason"] == "descriptive"
    years, m = _monthly(2012, 2025, 0.0)
    assert X.trend(years, np.array(_annual(2012, 2025, m), dtype=float), "air_temp")["reason"] == "too_short"
    years, m = _monthly(1980, 2025, 0.0)
    a = np.array(_annual(1980, 2025, m), dtype=float)
    a[20] = np.nan
    assert X.trend(years, a, "air_temp")["reason"] == "missing_year"
    assert X.trend(years, np.zeros(46), "snowfall")["reason"] == "constant"           # no snow at all: nothing to test


def test_adjustment_across_places():
    years = np.arange(1980, 2026)
    blocks = []
    for k, slope in enumerate((0.05, 0.0, 0.0, 0.0)):
        _, m = _monthly(1980, 2025, slope, seed=k)
        blocks.append({"trend": X.trend(years, np.array(_annual(1980, 2025, m), dtype=float), "air_temp")})
    n = X.adjust_across(blocks)
    assert all(b["trend"]["q"] is not None for b in blocks)
    assert blocks[0]["trend"]["standsOut"] and n >= 1
    assert all(b["trend"]["q"] >= b["trend"]["p"] - 1e-12 for b in blocks)


def test_anomaly_decade_maps_and_hovmoller(tmp_path):
    bundle, results = tmp_path / "b", tmp_path / "r"
    (bundle / "map").mkdir(parents=True)
    years = np.arange(1980, 2026)
    v = np.zeros((180, 360, years.size)) + 0.02 * (years - 1980)[None, None, :]
    v[0, :, :] = np.nan                                                                # an empty latitude row
    np.savez_compressed(bundle / "map/air_temp__ANN.npz", years=years, values=v)
    explore.write_year_frames(bundle, results, "t1", log=lambda *_: None)
    meta = json.loads((results / "maps/air_temp/ANN/years.json").read_text(encoding="utf-8"))
    assert meta["anomaly"]["baseline"] == [1991, 2020] and meta["decades"]["early"] == [1980, 1989]
    an = np.frombuffer(gzip.decompress((results / "maps/air_temp/ANN/anomaly.bin.gz").read_bytes()), dtype="i1").reshape(46, 180, 360)
    assert meta["anomaly"]["dtype"] == "int8" and meta["anomaly"]["fill"] == -128 and an[0, 0, 0] == -128   # the empty row
    assert an[0, 90, 0] * meta["anomaly"]["scale"] == pytest.approx(-0.02 * (2005.5 - 1980), abs=meta["anomaly"]["scale"])
    dec = np.frombuffer(gzip.decompress((results / "maps/air_temp/ANN/decades.bin.gz").read_bytes()), dtype="<i2").reshape(3, 180, 360)
    assert dec[2, 90, 0] * meta["decades"]["scale"] == pytest.approx(0.02 * 36, abs=meta["decades"]["scale"])
    h = json.loads((results / "explore/hovmoller/air_temp.json").read_text(encoding="utf-8"))
    assert len(h["lat"]) == 179 and h["lat"][0] == 88.5 and h["values"][0][0] == pytest.approx(-0.51, abs=1e-3)
    assert validate(results) == []

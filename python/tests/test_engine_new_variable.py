# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""A dataset added later (docs/02_DATA.md §14) needs no change in the engine: a variable that is only configured,
on a grid the engine has never seen, goes through a real results build (a few seconds: no map)."""
import json

import numpy as np
import pytest
import yaml

from casefile_engine import base as M
from casefile_engine import build as B
from casefile_engine import bundle as U

NEW = "soil_moisture"          # catalogued in config/variables.yaml as deferred


def test_a_configured_variable_on_a_new_grid_builds(tmp_path, monkeypatch):
    bundle = U.write_synthetic_bundle(tmp_path / "bundle")
    for f in (bundle / "map").glob("*.npz"):
        f.unlink()                                        # no map: keeps the test short
    for f in (bundle / "series/rain_imerg").glob("*.npz"):
        f.unlink()
    # the new variable: the air_temp arrays rescaled into its valid range, labelled with a new grid id
    lo, hi = M.VARS[NEW].get("valid_range") or (0.0, 1.0)
    (bundle / f"series/{NEW}").mkdir(parents=True)
    for f in sorted((bundle / "series/air_temp").glob("*.npz")):
        z = dict(np.load(f))
        def scale(a):
            a = np.asarray(a, dtype=float)
            return lo + (hi - lo) * (0.5 + 0.004 * (a - np.nanmean(z["monthly"])))
        np.savez_compressed(bundle / f"series/{NEW}/{f.name}", start=str(z["start"]), monthly=scale(z["monthly"]), cells=scale(z["cells"]),
                            area_km2=float(z["area_km2"]), effective_cells=float(z["effective_cells"]), grid="newdata_quarter_degree")
    monkeypatch.setitem(M.VARS[NEW], "status", "analysed")
    monkeypatch.setattr(M, "SENS", {})
    monkeypatch.setitem(M.CFG["domain"], "variables", M.CFG["domain"]["variables"] + [NEW])
    assert U.check_bundle(bundle) == []

    index = json.loads((bundle / "regions/index.json").read_text(encoding="utf-8"))
    h = U.bundle_hashes(bundle)
    pr = B.build_prereg(index, h["input_manifest_sha256"], h["regions_support_sha256"])
    for k in ("sha256", "synthetic"):
        pr.pop(k)
    units = M.VARS[NEW]["units"]["aggregated"]
    pr["variables"] = [v for v in pr["variables"] if v["id"] == "air_temp"] + [
        {"id": NEW, "product": "a dataset added later", "role": "analysed", "main_window": {"first": 1980, "last": 2025},
         "practical_threshold": {"units": f"{units} per decade", "default": 0.01, "by_season": {}, "reason": "Test value."}}]
    pr["headline_cases"] = [{"kind": "contrast", "pair": M.LEAD_PAIR, "variable": NEW, "season": "ANN"}]
    (tmp_path / "prereg.yaml").write_text(yaml.safe_dump(pr, allow_unicode=True, sort_keys=False), encoding="utf-8")
    ex_tables = json.loads((M.ROOT / "examples/methods/tables.json").read_text(encoding="utf-8"))
    monkeypatch.setattr(U, "sim_tables", lambda: {**ex_tables, "simKey": M.SIM_KEY})
    keep = (M.EX, M.BUILD_ID, M.CREATED, M.SYNTH, M.ENGINE, M.MANIFEST)
    try:
        U.build_results(bundle, tmp_path / "out", "new-variable", "2026-11-02T00:00:00Z", tmp_path / "prereg.yaml")
    finally:
        M.EX, M.BUILD_ID, M.CREATED, M.SYNTH, M.ENGINE, M.MANIFEST = keep
        M.GOLD = M.EX / "golden"
    out = tmp_path / "out"
    v = json.loads((out / f"verdicts/{NEW}/synthetic__north_plain/ANN.json").read_text(encoding="utf-8"))
    assert v["variable"]["id"] == NEW and v["family"] == "confirmatory"
    assert next(c for c in v["domain"]["checks"] if c["id"] == "D1")["passed"]
    assert v["text"]["en"]["headline"] and v["text"]["bn"]["headline"]
    s = json.loads((out / f"series/{NEW}/synthetic__north_plain.json").read_text(encoding="utf-8"))
    assert "newdata_quarter_degree" in s["effectiveCells"]
    assert (out / f"contrasts/{NEW}/{M.LEAD_PAIR}/ANN.json").exists()
    from validate_results import validate
    assert validate(out) == []

# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""G-12 and the real build path (slow: about 8 minutes together). Run with: uv run pytest -m slow"""
import filecmp
import json
from pathlib import Path

import numpy as np
import pytest
import yaml

from casefile_engine import base as M
from casefile_engine import build as B
from casefile_engine import bundle as U

pytestmark = pytest.mark.slow
EX = M.ROOT / "examples"


def _strip(o):
    """Provenance, hashes and labels differ between the example build and a build from a YAML pre-registration."""
    if isinstance(o, dict):
        return {k: _strip(v) for k, v in o.items() if k not in ("provenance", "created", "engine")}
    if isinstance(o, list):
        return [_strip(v) for v in o]
    return o


def test_examples_rebuild_byte_identical(tmp_path):
    """G-12: the committed examples are exactly what the engine builds from the synthetic bundle."""
    U.build_examples(tmp_path / "examples")
    cmp = filecmp.dircmp(EX, tmp_path / "examples", ignore=["power"])

    def differing(c, pre=""):
        out = [pre + f for f in c.diff_files + c.left_only + c.right_only]
        for name, sub in c.subdirs.items():
            out += differing(sub, pre + name + "/")
        return out

    assert differing(cmp) == []


@pytest.fixture(scope="module")
def real_build(tmp_path_factory):
    """A results build through the real path: bundle on disk, YAML pre-registration, `results`."""
    tmp = tmp_path_factory.mktemp("real")
    bundle = U.write_synthetic_bundle(tmp / "bundle")
    # a second copy of the lead pair's series as "disjoint-cell" series: the contrast must not change
    for var in ("air_temp", "rain"):
        a = np.load(bundle / f"series/{var}/synthetic__north_plain.npz")
        b = np.load(bundle / f"series/{var}/synthetic__south_delta.npz")
        (bundle / f"pairs/{var}").mkdir(parents=True)
        np.savez_compressed(bundle / f"pairs/{var}/pair_north_vs_delta.npz", start=str(a["start"]), a=a["monthly"], b=b["monthly"])
    index = json.loads((bundle / "regions/index.json").read_text(encoding="utf-8"))
    h = U.bundle_hashes(bundle)
    pr = B.build_prereg(index, h["input_manifest_sha256"], h["regions_support_sha256"])
    for k in ("sha256", "synthetic"):
        pr.pop(k)
    pr["regions"]["support_rule"]["max_spill_share"] = M.CFG["support"]["max_spill_share"]
    (tmp / "prereg.yaml").write_text(yaml.safe_dump(pr, allow_unicode=True, sort_keys=False), encoding="utf-8")
    ex_tables = json.loads((EX / "methods/tables.json").read_text(encoding="utf-8"))
    mp = pytest.MonkeyPatch()
    mp.setattr(U, "sim_tables", lambda: {**ex_tables, "simKey": M.SIM_KEY})   # same thresholds as the examples
    mp.setattr(U, "load_reviews", lambda: U.SYNTH_REVIEWS)
    keep = (M.EX, M.BUILD_ID, M.CREATED, M.SYNTH, M.ENGINE, M.MANIFEST)
    try:
        summary = U.build_results(bundle, tmp / "results/test-build", "test-build", "2026-11-02T00:00:00Z", tmp / "prereg.yaml")
    finally:
        mp.undo()
        M.EX, M.BUILD_ID, M.CREATED, M.SYNTH, M.ENGINE, M.MANIFEST = keep
        M.GOLD = M.EX / "golden"
    return tmp / "results/test-build", summary


def test_real_path_gives_the_same_numbers_as_the_examples(real_build):
    out, summary = real_build
    assert summary["verdicts"] == 24 and summary["contrasts"] == 11
    n = 0
    for sub in ("verdicts", "contrasts", "lineups", "series", "cases"):
        for f in sorted((EX / sub).rglob("*.json")):
            if "_states" in f.parts:
                continue
            g = out / f.relative_to(EX)
            assert g.exists(), g
            assert _strip(json.loads(g.read_text(encoding="utf-8"))) == _strip(json.loads(f.read_text(encoding="utf-8"))), f
            n += 1
    assert n >= 40


def test_real_path_map_and_tiles(real_build):
    out, _ = real_build
    assert filecmp.cmp(out / "maps/air_temp/ANN/cells.bin.gz", EX / "maps/air_temp/ANN/cells.bin.gz", shallow=False)
    assert len(list((out / "cells/air_temp/t").glob("*.bin.gz"))) == 18 * 36


def test_real_path_files_validate_and_are_labelled(real_build):
    from validate_results import validate
    out, _ = real_build
    assert validate(out) == []
    b = json.loads((out / "build.json").read_text(encoding="utf-8"))
    assert b["buildId"] == "test-build" and b["goldenTests"]["passed"] == b["goldenTests"]["total"] >= 60
    assert not (out / "verdicts/_states").exists() and not (out / "golden").exists()


def test_results_refuses_without_a_committed_preregistration(tmp_path):
    bundle = U.write_synthetic_bundle(tmp_path / "bundle")
    with pytest.raises(SystemExit) as e:
        U.build_results(bundle, tmp_path / "out", "x")       # config/preregistration.yaml is a draft with <fill> values
    assert "pre-registration" in str(e.value) or "status" in str(e.value)
    assert not (tmp_path / "out").exists()

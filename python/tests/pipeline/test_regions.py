# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Regions stage: box fractions (P-02), polygon fractions and holes (P-03), the support rule (P-04), pair split (P-18)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from shapely.geometry import Polygon, box

from casefile_engine import base as M
from casefile_pipeline import regions
from casefile_pipeline.boundaries import BOUNDARY_DIR, RegionDef, region_defs
from casefile_pipeline.series import split_cells

ROOT = Path(__file__).resolve().parents[3]


def _box_region(rid, b, exact=True):
    return RegionDef(rid, "comparison", "comparison", {"en": rid, "bn": rid}, {"en": rid, "bn": rid}, box(*b), "test box", "test",
                     tuple(b) if exact else None)


# ----------------------------------------------------------------------------------------------- P-02
@pytest.mark.parametrize("grid", [M.MERRA2, M.IMERG])
def test_p02_box_fractions_equal_box_weights(grid):
    b = (90.0, 22.0, 91.0, 23.0)
    cells = regions.region_cells(_box_region("cmp:t", b), grid)
    ref, area = M.box_weights(b, grid)
    assert cells == ref
    assert regions.mask_summary(cells, grid)[0] == pytest.approx(area, rel=1e-6)


# ----------------------------------------------------------------------------------------------- P-03
@pytest.mark.parametrize("grid", [M.MERRA2, M.IMERG])
def test_p03_polygon_equal_to_a_box_is_within_004_of_the_box_rule(grid):
    """5 × 5 sampling against the exact box rule: the effective cells agree within 4%; one cell can differ by at
    most two sample spacings (0.2), which happens only on thin edge slivers. Edges are put off the sample points."""
    b = (89.93, 21.71, 92.33, 24.13)
    ref = {(r, c): f for r, c, f in M.box_weights(b, grid)[0]}
    got = {(r, c): f for r, c, f in regions.polygon_fractions(box(*b), grid)}
    assert abs(sum(got.values()) - sum(ref.values())) <= 0.04 * sum(ref.values())
    for k in set(ref) | set(got):
        assert abs(ref.get(k, 0.0) - got.get(k, 0.0)) <= 0.2 + 1e-9, k
    inner = [k for k, f in ref.items() if f == 1.0]
    assert inner and all(got.get(k) == 1.0 for k in inner)


def test_p03_holes_are_respected():
    g = M.MERRA2
    outer = [(80.0, 10.0), (90.0, 10.0), (90.0, 20.0), (80.0, 20.0)]
    hole = [(83.03, 13.03), (87.03, 13.03), (87.03, 17.03), (83.03, 17.03)]
    with_hole = {(r, c): f for r, c, f in regions.polygon_fractions(Polygon(outer, [hole]), g)}
    full = {(r, c): f for r, c, f in regions.polygon_fractions(Polygon(outer), g)}
    lat_r = round((15.0 - g["lat0"]) / g["dlat"])
    lon_c = round((85.0 - g["lon0"]) / g["dlon"])
    assert full[(lat_r, lon_c)] == 1.0 and (lat_r, lon_c) not in with_hole
    eff_hole = sum(with_hole.values())
    assert sum(full.values()) - eff_hole == pytest.approx(16.0 / (0.5 * 0.625), abs=1.0)    # 4° × 4° hole, within 2%


# ----------------------------------------------------------------------------------------------- S1, S2
def test_support_rule_s1_s2_on_boxes(tmp_path):
    big = _box_region("cmp:big", (88.0, 22.0, 91.0, 25.0))
    small = _box_region("cmp:small", (90.1, 23.1, 90.6, 23.6))
    prereg = {"pairs": []}
    index, masks = regions.build_regions([big, small], tmp_path, "t1", prereg=prereg, log=lambda *_: None)
    by = {r["id"]: r for r in index["regions"]}
    assert by["cmp:big"]["inSet"] and all(s["passes"] for s in by["cmp:big"]["support"].values())
    s = by["cmp:small"]["support"]["merra2_native"]
    assert s["effectiveCells"] < 4 and not s["passes"] and not by["cmp:small"]["inSet"]
    assert by["cmp:small"]["cells"] == {}
    assert by["cmp:big"]["support"]["merra2_native"]["spillShare"] == M.spill_share(masks[("cmp:big", "merra2_native")][0], M.MERRA2)
    mask = json.loads((tmp_path / "regions/cells/merra2_native/cmp__small.json").read_text(encoding="utf-8"))
    assert mask["schema"] == "casefile/mask@3" and mask["synthetic"] is False


# ----------------------------------------------------------------------------------------------- P-04 (real boundary files)
@pytest.mark.skipif(not (BOUNDARY_DIR / "sources.json").exists(),
                    reason="the boundary files are not in .cache/boundaries (run `casefile-pipeline regions` once)")
def test_p04_real_boundaries_reproduce_the_support_evidence(tmp_path):
    import yaml

    ref = json.loads((ROOT / "tools/decide/support_split_out.json").read_text(encoding="utf-8"))["regions"]
    cfg = yaml.safe_load((ROOT / "config/regions.yaml").read_text(encoding="utf-8"))
    key = {r["id"]: f"bd_div:{r['match']}" for r in cfg["divisions"]}
    index, _ = regions.build_regions(region_defs(), tmp_path, "t", log=lambda *_: None)
    in_set = set()
    for r in index["regions"]:
        d = ref[key.get(r["id"], r["id"])]["merra2_native"]
        s = r["support"]["merra2_native"]
        assert abs(s["effectiveCells"] - d["effectiveCells5x5"]) <= 0.15, r["id"]
        assert abs(s["spillShare"] - d["spillShare5x5"]) <= 0.02, r["id"]
        if r["inSet"]:
            in_set.add(r["id"])
    divisions = {r["id"] for r in cfg["divisions"]}
    assert in_set & divisions == {"bd_div:dhaka", "bd_div:khulna", "bd_div:rajshahi", "bd_div:rangpur"}
    assert {r["id"] for r in cfg["home"]} | {r["id"] for r in cfg["comparison_candidates"]} <= in_set


# ----------------------------------------------------------------------------------------------- P-18
def test_p18_split_larger_fraction_keeps_a_tie_drops():
    a = [[1, 1, 0.6], [1, 2, 0.5], [1, 3, 1.0], [1, 4, 0.2]]
    b = [[1, 1, 0.4], [1, 2, 0.5], [1, 4, 0.7], [1, 5, 1.0]]
    ka, kb = split_cells(a, b)
    assert ka == [[1, 1, 0.6], [1, 3, 1.0]]
    assert kb == [[1, 4, 0.7], [1, 5, 1.0]]
    masks = {("a", g["id"]): (a, 0, 0) for g in (M.MERRA2, M.IMERG)} | {("b", g["id"]): (b, 0, 0) for g in (M.MERRA2, M.IMERG)}
    split = M.pair_split(masks, "a", "b")["grids"]["merra2_native"]
    assert split["effectiveCellsA"] == pytest.approx(sum(f for *_, f in ka))
    assert split["effectiveCellsB"] == pytest.approx(sum(f for *_, f in kb))


def test_an_added_coarse_grid_never_changes_the_set(tmp_path):
    """02 §14 step 5: a new dataset's grid gets masks and support, but inSet and the pair split stay those of the
    first-release grids; a region that fails on the new grid gets no series for its variables."""
    r = _box_region("cmp:mid", (90.25, 22.25, 91.75, 23.75))         # 1.5° box: passes on MERRA-2, fails S1 on 1°
    index, masks = regions.build_regions([r], tmp_path, "t", prereg={"pairs": []},
                                         grid_ids=("merra2_native", "imerg_native", "global_1deg"), log=lambda *_: None)
    e = index["regions"][0]
    assert e["support"]["merra2_native"]["passes"] and e["inSet"] is True
    # the index lists the first-release grids only: the engine copies them into prereg.json (minimum 4 cells each)
    assert set(e["support"]) == set(e["cells"]) == {"merra2_native", "imerg_native"}
    assert (tmp_path / "regions/cells/global_1deg/cmp__mid.json").exists() and masks[("cmp:mid", "global_1deg")][2] < 4
    from casefile_pipeline.stages import grid_passes, index_support
    assert index_support(index, "cmp:mid", "merra2_native") and not index_support(index, "cmp:mid", "global_1deg")
    assert grid_passes(index, masks, "cmp:mid", "merra2_native") and not grid_passes(index, masks, "cmp:mid", "global_1deg")


def test_mask_grids_start_with_the_first_release_grids():
    from casefile_pipeline.grids import NATIVE_GRIDS, mask_grids
    assert mask_grids()[:2] == NATIVE_GRIDS

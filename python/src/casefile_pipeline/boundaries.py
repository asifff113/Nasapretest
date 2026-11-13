# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reading the boundary files and building each region's outline (docs/02_DATA.md §7.1, config/regions.yaml).

Matching follows config/regions.yaml: Natural Earth Admin 0 on `ADM0_A3`; Natural Earth Admin 1 on `name` with
`adm0_a3` (the match "West Bengal (IND)" is name "West Bengal", adm0_a3 "IND"); geoBoundaries on `shapeISO`
(its `shapeName` spells Rajshahi "Rajshani"). A region given as a box minus land is the box minus the union of the
Natural Earth Admin 0 polygons, as in tools/decide/support_cells.py. Exactly one feature must match each region.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from shapely.geometry import box as shp_box
from shapely.geometry import shape
from shapely.ops import unary_union

from casefile_engine.base import ROOT, load_yaml

BOUNDARY_DIR = ROOT / ".cache" / "boundaries"
SECTIONS = {"home": ("country", "home"), "divisions": ("division", "division"), "comparison_candidates": ("comparison", "comparison")}


@dataclass
class RegionDef:
    """One region of the fixed set: its outline in longitude-latitude degrees and what the index records."""
    id: str
    kind: str
    role: str
    name: dict
    in_: dict
    geometry: object                                   # shapely (Multi)Polygon
    source: str
    licence: str
    box: tuple[float, float, float, float] | None = None   # set when the region is exactly a box (exact overlap)
    extra: dict = field(default_factory=dict)


def _features(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def _one(features: list[dict], test, what: str) -> dict:
    hits = [f for f in features if test(f["properties"])]
    if len(hits) != 1:
        raise ValueError(f"{what}: {len(hits)} features match, expected exactly 1")
    return hits[0]


def region_defs(config: dict | None = None, folder: Path = BOUNDARY_DIR, meta: dict | None = None) -> list[RegionDef]:
    """Every region of config/regions.yaml with its outline, read from the boundary files in `folder`."""
    from .sources import boundary_files

    cfg = config or load_yaml("config/regions.yaml")
    meta = meta if meta is not None else json.loads((folder / "sources.json").read_text(encoding="utf-8"))
    bcfg = cfg["boundaries"]
    cache: dict[str, list] = {}

    def feats(key: str) -> list[dict]:
        if key not in cache:
            cache[key] = _features(folder / boundary_files.FILES[key]["file"])
        return cache[key]

    def describe(key: str) -> tuple[str, str]:
        m = meta.get(key, {})
        src = bcfg[key]["source"] + (f" ({m['file']}, {m['version']})" if m else "")
        lic = m.get("licence") or bcfg[key]["licence"]
        return src, lic

    out = []
    for section, (kind, role) in SECTIONS.items():
        for r in cfg.get(section, []):
            if "box" in r:
                b = tuple(float(x) for x in r["box"])
                geom = shp_box(*b)
                src, lic = f"fixed box {list(b)}", "not applicable (a fixed box)"
                exact = b
                if r.get("minus"):
                    land_key = r["minus"]
                    land = unary_union([shape(f["geometry"]).buffer(0) for f in feats("natural_earth_admin0")])
                    geom = geom.difference(land)
                    s0, lic = describe("natural_earth_admin0")
                    src = f"fixed box {list(b)} minus land ({bcfg[land_key]['source']}: the union of {s0})"
                    exact = None
                out.append(RegionDef(r["id"], kind, role, r["name"], r["in"], geom, src, lic, exact))
                continue
            key, match = r["boundary"], str(r["match"])
            if key == "natural_earth_admin0":
                f = _one(feats(key), lambda p, match=match: p.get("ADM0_A3") == match, f"{r['id']} ADM0_A3={match}")
            elif key == "natural_earth_admin1":
                m = re.fullmatch(r"(.+) \(([A-Z]{3})\)", match)
                if not m:
                    raise ValueError(f"{r['id']}: an Admin 1 match must read 'Name (ISO3)', got {match!r}")
                f = _one(feats(key), lambda p, m=m: p.get("name") == m.group(1) and p.get("adm0_a3") == m.group(2), f"{r['id']} {match}")
            elif key == "geoboundaries_bgd_adm1":
                f = _one(feats(key), lambda p, match=match: p.get("shapeISO") == match, f"{r['id']} shapeISO={match}")
            else:
                raise KeyError(f"{r['id']}: unknown boundary key {key}")
            src, lic = describe(key)
            out.append(RegionDef(r["id"], kind, role, r["name"], r["in"], shape(f["geometry"]).buffer(0), src, lic))
    return out


def union_bbox(defs: list[RegionDef], pad: float = 1.0) -> tuple[float, float, float, float]:
    """(W, S, E, N) covering every region, widened by `pad` degrees (the IMERG subset box, docs/02_DATA.md §3.2)."""
    b = [d.geometry.bounds for d in defs]
    return (max(-180.0, min(x[0] for x in b) - pad), max(-90.0, min(x[1] for x in b) - pad),
            min(180.0, max(x[2] for x in b) + pad), min(90.0, max(x[3] for x in b) + pad))

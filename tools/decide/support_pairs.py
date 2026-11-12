"""Pair overlap on the MERRA-2 grid: what share of each region's weight comes from cells the two regions share.

Usage: python -I support_pairs.py <geoBoundaries BGD ADM1> <NE 50m admin-0> <NE 10m admin-1> <out.json>
"""
import itertools
import json
import sys

sys.path.insert(0, sys.argv[5] if len(sys.argv) > 5 else ".")
import support_cells as S  # noqa: E402
from shapely.geometry import shape, box  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

gb, ne0, ne1, out = sys.argv[1:5]
regions = {}
for f in S.load(gb):
    p = f["properties"]
    regions[f"bd_div:{p['shapeISO']}"] = (p["shapeName"], shape(f["geometry"]).buffer(0))
for f in S.load(ne0):
    p = f["properties"]
    if p.get("ADM0_A3") in ("BGD", "MMR", "NPL"):
        regions[{"BGD": "country:BGD", "MMR": "cmp:myanmar", "NPL": "cmp:nepal"}[p["ADM0_A3"]]] = (p["ADM0_A3"], shape(f["geometry"]).buffer(0))
for f in S.load(ne1):
    p = f["properties"]
    if p.get("adm0_a3") == "IND" and p.get("name") in ("West Bengal", "Assam", "Meghalaya"):
        regions["cmp:" + p["name"].lower().replace(" ", "_")] = (p["name"], shape(f["geometry"]).buffer(0))
land = unary_union([shape(f["geometry"]).buffer(0) for f in S.load(ne0)])
regions["cmp:bay_of_bengal"] = ("Bay of Bengal (box minus land)", box(80.0, 5.0, 95.0, 22.0).difference(land))

g = S.GRIDS["merra2_native"]
cells = {}
summary = {}
for rid, (name, geom) in regions.items():
    rows = S.fractions(geom, g)
    w = {(i, j): a * f for (i, j, f, f5, a) in rows}
    cells[rid] = w
    m = S.metrics(rows)
    summary[rid] = {"name": name, **m}

pairs = {}
for a, b in itertools.combinations(sorted(regions), 2):
    wa, wb = cells[a], cells[b]
    shared = set(wa) & set(wb)
    sa = sum(wa[c] for c in shared) / sum(wa.values()); sb = sum(wb[c] for c in shared) / sum(wb.values())
    pairs[f"{a} | {b}"] = {"sharedCells": len(shared), "sharedShareA": round(sa, 3), "sharedShareB": round(sb, 3),
                           "maxSharedShare": round(max(sa, sb), 3)}
json.dump({"regions": summary, "pairs": pairs}, open(out, "w"), indent=1)
print("regions (MERRA-2): eff cells | interior share")
for rid, m in sorted(summary.items(), key=lambda kv: kv[1]["effectiveCells"]):
    print(f"  {rid:22s} {m['name'][:30]:30s} {m['effectiveCells']:7.2f} | {m['interiorWeightShare']:.4f}")
print("pairs with any shared cell (max shared share):")
for k, v in sorted(pairs.items(), key=lambda kv: -kv[1]["maxSharedShare"]):
    if v["sharedCells"]:
        print(f"  {k:45s} shared {v['sharedCells']:3d}  A {v['sharedShareA']:.3f}  B {v['sharedShareB']:.3f}")

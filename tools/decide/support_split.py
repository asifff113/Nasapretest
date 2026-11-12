"""Support rule, final evidence: per region the effective cells, the spill share (the part of the region mean that
describes area outside the region), and for every candidate pair the effective cells left after the disjoint split
(each cell touched by both regions goes to the region holding more of it; ties are dropped from both).

Usage: python -I support_split.py <geoBoundaries BGD ADM1> <NE 50m admin-0> <NE 10m admin-1> <out.json> <this folder>
Fractions use the spec's 5 x 5 subsample rule (02_DATA §7.2); exact overlaps are reported beside them.
"""
import itertools
import json
import sys

sys.path.insert(0, sys.argv[5])
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
        regions[{"BGD": "country:BGD", "MMR": "cmp:myanmar", "NPL": "cmp:nepal"}[p["ADM0_A3"]]] = (p["NAME"], shape(f["geometry"]).buffer(0))
for f in S.load(ne1):
    p = f["properties"]
    if p.get("adm0_a3") == "IND" and p.get("name") in ("West Bengal", "Assam", "Meghalaya"):
        regions["cmp:" + p["name"].lower().replace(" ", "_")] = (p["name"], shape(f["geometry"]).buffer(0))
land = unary_union([shape(f["geometry"]).buffer(0) for f in S.load(ne0)])
regions["cmp:bay_of_bengal"] = ("Bay of Bengal (box minus land)", box(80.0, 5.0, 95.0, 22.0).difference(land))

res = {"regions": {}, "pairs": {}}
cells = {}
for gname in ("merra2_native", "imerg_native"):
    g = S.GRIDS[gname]
    cells[gname] = {}
    for rid, (name, geom) in regions.items():
        rows = S.fractions(geom, g)
        cells[gname][rid] = {(i, j): (f5, fe, a) for (i, j, fe, f5, a) in rows if f5 > 0 or fe > 0}
        f5 = [v[0] for v in cells[gname][rid].values()]; fe = [v[1] for v in cells[gname][rid].values()]; a = [v[2] for v in cells[gname][rid].values()]
        w5 = [x * y for x, y in zip(a, f5)]; we = [x * y for x, y in zip(a, fe)]
        spill5 = sum(x * y * (1 - y) for x, y in zip(a, f5)) / sum(w5) if sum(w5) else None
        spille = sum(x * y * (1 - y) for x, y in zip(a, fe)) / sum(we) if sum(we) else None
        res["regions"].setdefault(rid, {"name": name})[gname] = {
            "effectiveCells5x5": round(sum(f5), 2), "effectiveCellsExact": round(sum(fe), 2),
            "spillShare5x5": round(spill5, 3), "spillShareExact": round(spille, 3)}

for a_, b_ in itertools.combinations(sorted(regions), 2):
    row = {}
    for gname in ("merra2_native", "imerg_native"):
        ca, cb = cells[gname][a_], cells[gname][b_]
        shared = set(ca) & set(cb)
        if not shared and gname == "merra2_native":
            row = None
            break
        ea = sum(v[0] for k, v in ca.items() if k not in shared or ca[k][0] > cb[k][0])
        eb = sum(v[0] for k, v in cb.items() if k not in shared or cb[k][0] > ca[k][0])
        row[gname] = {"sharedCells": len(shared), "effectiveCellsAfterSplitA": round(ea, 2), "effectiveCellsAfterSplitB": round(eb, 2)}
    if row:
        res["pairs"][f"{a_} | {b_}"] = row

json.dump(res, open(out, "w"), indent=1)
print("region                  name                        MERRA-2 eff(5x5) spill(5x5) spill(exact) | IMERG eff spill")
for rid, r in sorted(res["regions"].items(), key=lambda kv: kv[1]["merra2_native"]["effectiveCells5x5"]):
    m, i = r["merra2_native"], r["imerg_native"]
    print(f"{rid:22s} {r['name'][:26]:26s} {m['effectiveCells5x5']:8.2f} {m['spillShare5x5']:10.3f} {m['spillShareExact']:10.3f} | {i['effectiveCells5x5']:8.1f} {i['spillShare5x5']:.3f}")
print("pairs that share MERRA-2 cells: effective cells left after the split (A, B)")
for k, v in sorted(res["pairs"].items()):
    m = v["merra2_native"]
    print(f"  {k:40s} shared {m['sharedCells']:3d}  after split A {m['effectiveCellsAfterSplitA']:7.2f}  B {m['effectiveCellsAfterSplitB']:7.2f}")

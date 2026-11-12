"""Support rule evidence: how many native cells cover each region of the candidate set (02_DATA §7.3).

Usage: python -I support_cells.py <geoBoundaries BGD ADM1 geojson> <NE 50m admin-0 geojson> <NE 10m admin-1 geojson> <out.json>
Reads boundary files only (no climate data, no trends). Fractions are exact polygon-cell overlaps computed with
shapely in longitude-latitude, weighted by the sine-latitude cell area; the spec's 5 x 5 subsample estimate is
reported beside them.
"""
import json
import math
import sys

import numpy as np
from shapely.geometry import box, shape, Point
from shapely.ops import unary_union
from shapely.prepared import prep

R = 6371.0088
GRIDS = {
    "merra2_native": dict(lat0=-90.0, dlat=0.5, nlat=361, lon0=-180.0, dlon=0.625, nlon=576),
    "imerg_native": dict(lat0=-89.95, dlat=0.1, nlat=1800, lon0=-179.95, dlon=0.1, nlon=3600),
}


def load(path):
    return json.load(open(path))["features"]


def cell_edges(g, i, j):
    lat = g["lat0"] + i * g["dlat"]; lon = g["lon0"] + j * g["dlon"]
    s, n = max(-90.0, lat - g["dlat"] / 2), min(90.0, lat + g["dlat"] / 2)
    w, e = lon - g["dlon"] / 2, lon + g["dlon"] / 2
    return w, s, e, n


def cell_area(w, s, e, n):
    return R * R * math.radians(e - w) * (math.sin(math.radians(n)) - math.sin(math.radians(s)))


def fractions(geom, g, subsample=5):
    minx, miny, maxx, maxy = geom.bounds
    i0 = int(math.floor((miny - g["lat0"]) / g["dlat"])) - 1; i1 = int(math.ceil((maxy - g["lat0"]) / g["dlat"])) + 1
    j0 = int(math.floor((minx - g["lon0"]) / g["dlon"])) - 1; j1 = int(math.ceil((maxx - g["lon0"]) / g["dlon"])) + 1
    pg = prep(geom)
    rows = []
    for i in range(max(0, i0), min(g["nlat"], i1 + 1)):
        for j in range(j0, j1 + 1):
            w, s, e, n = cell_edges(g, i, j)
            c = box(w, s, e, n)
            if not pg.intersects(c):
                continue
            inter = geom.intersection(c)
            if inter.is_empty:
                continue
            # exact fraction of the cell's area (equal-area in sin(lat) within one cell: use the lat-lon area ratio with
            # a cos(lat) correction evaluated on the intersection's centroid; error is negligible inside one cell)
            f_exact = inter.area / c.area
            # spec's 5 x 5 subsample estimate
            hits = 0
            for a in range(subsample):
                for b in range(subsample):
                    x = w + (b + 0.5) * (e - w) / subsample; y = s + (a + 0.5) * (n - s) / subsample
                    hits += pg.contains(Point(x, y))
            rows.append((i, j, f_exact, hits / subsample ** 2, cell_area(w, s, e, n)))
    return rows


def metrics(rows):
    f = np.array([r[2] for r in rows]); f5 = np.array([r[3] for r in rows]); a = np.array([r[4] for r in rows])
    wts = a * f
    eff = float(f.sum()); eff5 = float(f5.sum())
    interior = float(wts[f >= 0.5].sum() / wts.sum()) if wts.sum() > 0 else 0.0
    kish = float(wts.sum() ** 2 / (wts ** 2).sum()) if wts.sum() > 0 else 0.0
    return {"areaKm2": round(float(wts.sum()), 0), "cellsTouched": int(len(rows)), "effectiveCells": round(eff, 2),
            "effectiveCells5x5": round(eff5, 2), "cellsMostlyInside": int((f >= 0.5).sum()),
            "interiorWeightShare": round(interior, 3), "kishEffectiveCells": round(kish, 2),
            "largestCellShare": round(float(wts.max() / wts.sum()), 3) if len(rows) else None}


def main():
    gb, ne0, ne1, out = sys.argv[1:5]
    regions = {}
    for f in load(gb):
        p = f["properties"]
        regions[f"bd_div:{p['shapeISO']}:{p['shapeName']}"] = shape(f["geometry"]).buffer(0)
    for f in load(ne0):
        p = f["properties"]
        if p.get("ADM0_A3") in ("BGD", "MMR", "NPL"):
            regions[{"BGD": "country:BGD", "MMR": "cmp:myanmar", "NPL": "cmp:nepal"}[p["ADM0_A3"]]] = shape(f["geometry"]).buffer(0)
    for f in load(ne1):
        p = f["properties"]
        if p.get("adm0_a3") == "IND" and p.get("name") in ("West Bengal", "Assam", "Meghalaya"):
            regions["cmp:" + p["name"].lower().replace(" ", "_")] = shape(f["geometry"]).buffer(0)
    land = unary_union([shape(f["geometry"]).buffer(0) for f in load(ne0)])
    bay = box(80.0, 5.0, 95.0, 22.0)
    regions["cmp:bay_of_bengal(box)"] = bay
    regions["cmp:bay_of_bengal(box minus land)"] = bay.difference(land)
    res = {}
    for rid, geom in regions.items():
        res[rid] = {gname: metrics(fractions(geom, g)) for gname, g in GRIDS.items()
                    if not (gname == "imerg_native" and "bay" in rid and False)}
        m = res[rid]["merra2_native"]
        print(f"{rid:42s} area {m['areaKm2']:>9.0f} km2 | MERRA-2 eff {m['effectiveCells']:6.2f} (5x5 {m['effectiveCells5x5']:6.2f}) "
              f"mostly-inside {m['cellsMostlyInside']:3d} interior {m['interiorWeightShare']:.2f} kish {m['kishEffectiveCells']:6.2f} "
              f"| IMERG eff {res[rid]['imerg_native']['effectiveCells']:8.1f}", flush=True)
    json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()

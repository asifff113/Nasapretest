# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reader for GPM IMERG V07 Final monthly: /Grid/precipitation (rain_imerg) (docs/02_DATA.md §3.2).

What the files hold (build plan, step 2A): HDF5 group "Grid"; precipitation in mm/hr with dims (time, lon, lat),
transposed here to (lat, lon) (P-07); latitude −89.95…89.95 (1800), longitude −179.95…179.95 (3600); fill near
−9999.9. Conversion on read: mm/hr × 24 → mm/day. Only the box covering every region of config/regions.yaml plus 1°
is kept. Version 07 Final only: never Late Run or V08 (`check_granule_names`).
"""
from . import Reader, register


def check_granule_names(names: list[str]) -> None:
    """P-12: every granule must be a V07 Final monthly file ("3B-MO.MS.MRG" and "V07" in its name)."""
    bad = [n for n in names if "3B-MO.MS.MRG" not in n or ".V07" not in n]
    if bad:
        raise ValueError(f"IMERG: {len(bad)} granule(s) are not V07 Final monthly, for example {bad[0]}")


IMERG_V07 = register(Reader(source_id="imerg_v07_final_monthly", grid_id="imerg_native", group="Grid", dims=("time", "lon", "lat"),
                            time="time", lat="lat", lon="lon", units={"precipitation": "mm/hr"}, subset_to_regions=True,
                            name_check=check_granule_names))

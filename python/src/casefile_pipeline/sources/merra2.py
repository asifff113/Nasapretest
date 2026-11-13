# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Readers for MERRA-2 monthly: T2M (air_temp) and PRECTOTCORR (rain) (docs/02_DATA.md §3.1).

Short names, versions and DOIs come from config/sources.yaml (merra2_slv, merra2_precip); variable names and
monthly units from config/variables.yaml. What the files hold (build plan, step 2A): dims (time, lat, lon) at the
root, latitude −90…90 (361), longitude −180…179.375 (576), T2M in K, PRECTOTCORR in kg m-2 s-1. Read in one
M2TMNXSLV granule on 13 Nov 2026: TQV "total_precipitable_water_vapor" in kg m-2 and SLP "sea_level_pressure" in Pa,
same grid and fill (1e15). Conversion on read (casefile_pipeline.units): K − 273.15 → °C; kg m-2 s-1 × 86 400 →
mm/day; kg m-2 of water = mm; Pa ÷ 100 → hPa.
"""
from . import Reader, register

MERRA2_SLV = register(Reader(source_id="merra2_slv", grid_id="merra2_native", group=None, dims=("time", "lat", "lon"),
                             time="time", lat="lat", lon="lon", units={"T2M": "K", "TQV": "kg m-2", "SLP": "Pa"}))
MERRA2_FLX = register(Reader(source_id="merra2_precip", grid_id="merra2_native", group=None, dims=("time", "lat", "lon"),
                             time="time", lat="lat", lon="lon", units={"PRECTOTCORR": "kg m-2 s-1"}))

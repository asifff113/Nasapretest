# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Tiny NetCDF files shaped like the real products, written by the tests themselves (no network)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import xarray as xr

from casefile_pipeline.grids import GRIDS, lat_centres, lon_centres


def merra2_file(path: Path, name: str, units: str, values: np.ndarray, fill: float = 1e15) -> Path:
    """One MERRA-2-like monthly file: variable `name` (time, lat, lon) at the root, with _FillValue."""
    g = GRIDS["merra2_native"]
    da = xr.DataArray(values[None].astype(np.float32), dims=("time", "lat", "lon"), attrs={"units": units},
                      coords={"time": [0.0], "lat": lat_centres(g), "lon": lon_centres(g)})
    xr.Dataset({name: da}).to_netcdf(path, engine="h5netcdf", encoding={name: {"_FillValue": np.float32(fill)}})
    return path


def imerg_file(path: Path, values_lat_lon: np.ndarray, fill: float = -9999.9) -> Path:
    """One IMERG-like monthly file: group Grid, precipitation (time, lon, lat) in mm/hr, with _FillValue."""
    g = GRIDS["imerg_native"]
    da = xr.DataArray(values_lat_lon.T[None].astype(np.float32), dims=("time", "lon", "lat"), attrs={"units": "mm/hr"},
                      coords={"time": [0.0], "lon": lon_centres(g), "lat": lat_centres(g)})
    xr.Dataset({"precipitation": da}).to_netcdf(path, engine="h5netcdf", group="Grid",
                                                encoding={"precipitation": {"_FillValue": np.float32(fill), "zlib": True}})
    return path


def granule(month: str, name: str | None = None) -> dict:
    """A CMR-like granule record for one month."""
    y, m = int(month[:4]), int(month[5:7])
    last = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return {"umm": {"GranuleUR": f"TEST.1:{name or 'file_' + month}.nc4",
                    "TemporalExtent": {"RangeDateTime": {"BeginningDateTime": f"{month}-01T00:00:00.000Z",
                                                         "EndingDateTime": f"{month}-{last:02d}T23:59:59.000Z"}}}}

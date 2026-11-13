# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reader for MODIS/Terra Vegetation Indices Monthly L3 Global 0.05Deg CMG V061 (MOD13C2 061): plant greenness (NDVI).

Short name, version and DOI come from config/sources.yaml (modis_vegetation); the variable name and monthly unit from
config/variables.yaml (greenness = CMG_0_05_Deg_Monthly_NDVI).

What the files hold. The archive keeps HDF-EOS2 (HDF4) files, which this pipeline does not open; the cloud OPeNDAP
server (opendap.earthdata.nasa.gov, listed in each granule's CMR record) returns the variable as NetCDF-4. Read in
MOD13C2.A2020001.061.2020328142931 on 14 Nov 2026 through that server:
- group MOD_Grid_monthly_CMG_VI/Data_Fields holds CMG_0_05_Deg_Monthly_NDVI, int16, dims
  (YDim_MOD_Grid_monthly_CMG_VI 3600, XDim_MOD_Grid_monthly_CMG_VI 7200), no time dimension (one month per file);
- group MOD_Grid_monthly_CMG_VI holds Latitude (89.975 … −89.975, step −0.05) and Longitude (−179.975 … 179.975);
- attributes units "NDVI", _FillValue −3000, valid_range [−2000, 10000], scale_factor 10000, add_offset 0.
MOD13 User Guide v3.10 (Didan and Barreto Munoz, Sep 2019), Table 19: "CMG 0.05 Deg Monthly NDVI", units NDVI, int16,
valid range −2000…10000, fill −3000, scale factor 0.0001. The file's scale_factor 10000 is the MODIS convention for
the same thing (value = stored ÷ 10000); the reader applies the guide's 0.0001 and checks the file says 10000, so the
generic CF rule (value = stored × scale_factor) is never applied to these files.

Regridding. 0.05° is finer than any region needs and 26 million cells a month is heavy, so the reader averages blocks
of 10 × 10 cells into the 0.5° grid `modis_05deg` (grids.py). The CMG is an equal-angle grid nested exactly in 0.5°,
so the block mean is the conservative regrid of docs/02_DATA.md §4: each 0.05° row is weighted by its area
(sin φ_north − sin φ_south), fill and out-of-range cells are left out, and a 0.5° cell stays NaN unless valid cells
hold at least half of its area (the same 0.5 rule as the 1° map regrid). Sea cells hold the fill: land only.

Known limits (User Guide §8.1, §9): cloudy pixels are replaced with the long-term MODIS average for that period
(pixel reliability rank 4, "Estimated"), so in persistently cloudy places the series leans toward its average and a
trend there is damped; Terra's orbit drifts (config/known_breaks.yaml terra_orbit_drift).
"""
from __future__ import annotations

from dataclasses import dataclass

import h5py
import numpy as np

from ..grids import lat_centres, lon_centres
from ..units import convert
from . import AccessMismatch, Reader, register

NDVI = "CMG_0_05_Deg_Monthly_NDVI"


def block_mean(x: np.ndarray, block: int, step: float, min_valid: float = 0.5) -> np.ndarray:
    """Area-weighted mean of `block` × `block` cells of a global equal-angle grid whose rows run south to north
    (row 0 at 90° S), cell size `step` degrees. NaN cells are left out; a block stays NaN unless its valid cells hold at
    least `min_valid` of its area. Rows are taken one block at a time to keep memory small."""
    nlat, nlon = x.shape
    if nlat % block or nlon % block or abs(nlat * step - 180.0) > 1e-6 or abs(nlon * step - 360.0) > 1e-6:
        raise ValueError(f"block_mean needs a whole global grid in blocks of {block}: got {x.shape} at {step}°")
    south = np.radians(-90.0 + step * np.arange(nlat))
    w = np.sin(south + np.radians(step)) - np.sin(south)              # relative area of a cell in each row
    out = np.full((nlat // block, nlon // block), np.nan, dtype=np.float64)
    for r in range(nlat // block):
        rows = x[r * block:(r + 1) * block].astype(np.float64)
        wr = w[r * block:(r + 1) * block, None]
        ok = np.isfinite(rows)
        num = (np.where(ok, rows, 0.0) * wr).reshape(block, nlon // block, block).sum(axis=(0, 2))
        den = (ok * wr).reshape(block, nlon // block, block).sum(axis=(0, 2))
        full = wr.sum() * block
        keep = den >= min_valid * full - 1e-15
        out[r, keep] = num[keep] / den[keep]
    return out


@dataclass(frozen=True)
class CmgReader(Reader):
    """A MODIS CMG monthly product read through OPeNDAP: data and coordinates sit in two HDF-EOS groups, the field has
    no time dimension, and the stored integers carry the MODIS scale convention. `dims` is (no time dimension, rows,
    columns); `time` is empty."""

    coord_group: str = ""                 # group holding the Latitude and Longitude arrays
    scale: float = 1.0                    # documented multiplier from stored integer to value (User Guide)
    file_scale_factor: float = 1.0        # the scale_factor attribute the file must carry (MODIS: the divisor)
    valid_range: tuple[int, int] = (0, 0)  # documented valid range of the stored integers
    fine_step: float = 0.05               # degrees, the CMG cell size
    block: int = 10                       # fine cells per output cell along each axis

    def constraint(self, variable: str) -> str:
        """DAP4 constraint: the variable and the two coordinate arrays, each by its full group path."""
        return ";".join([f"/{self.group}/{variable}", f"/{self.coord_group}/{self.lat}", f"/{self.coord_group}/{self.lon}"])

    def coordinates(self, ds) -> tuple[np.ndarray, np.ndarray]:
        """Latitude and longitude of the fine grid, from the coordinate group of the file `ds` was opened from."""
        src = ds.encoding.get("source")
        if not src:
            raise AccessMismatch(f"{self.short_name}: cannot find the file to read {self.coord_group}/{self.lat}")
        with h5py.File(src, "r") as h:
            if self.coord_group not in h or self.lat not in h[self.coord_group] or self.lon not in h[self.coord_group]:
                raise AccessMismatch(f"{self.short_name}: no {self.lat}/{self.lon} in group {self.coord_group}")
            return np.asarray(h[self.coord_group][self.lat][()], float), np.asarray(h[self.coord_group][self.lon][()], float)

    def decode(self, ds, variable: dict, box: tuple[int, int, int, int] | None = None,
               name: str | None = None) -> tuple[np.ndarray, dict]:
        """One month of `name` on the 0.5° grid, in the variable's monthly unit (see the module docstring)."""
        name = name or str(variable["variable"])
        if name != str(variable["variable"]):
            raise KeyError(f"{self.short_name}: '{name}' is not '{variable['variable']}'")
        if name not in ds.variables:
            raise AccessMismatch(f"{self.short_name}: variable '{name}' not in the file (has {sorted(ds.variables)})")
        da = ds[name]
        if tuple(da.dims) != self.dims[1:]:
            raise AccessMismatch(f"{self.short_name} {name}: dimensions {tuple(da.dims)}, the documentation says {self.dims[1:]}")
        units = str(da.attrs.get("units", "")).strip()
        if units != self.units[name]:
            raise AccessMismatch(f"{self.short_name} {name}: units '{units}', the documentation says '{self.units[name]}'")
        sf, off = da.attrs.get("scale_factor"), da.attrs.get("add_offset", 0.0)
        if sf is None or not np.isclose(float(sf), self.file_scale_factor) or not np.isclose(float(off), 0.0):
            raise AccessMismatch(f"{self.short_name} {name}: scale_factor {sf}, add_offset {off}; expected "
                                 f"{self.file_scale_factor} and 0 (value = stored × {self.scale}, User Guide)")
        fill = da.attrs.get("_FillValue", da.encoding.get("_FillValue"))
        if fill is None:
            raise AccessMismatch(f"{self.short_name} {name}: no _FillValue in the file")
        n_fine_lat, n_fine_lon = round(180 / self.fine_step), round(360 / self.fine_step)
        lat, lon = self.coordinates(ds)
        want_lat = 90.0 - self.fine_step / 2 - self.fine_step * np.arange(n_fine_lat)         # north to south, as stored
        want_lon = -180.0 + self.fine_step / 2 + self.fine_step * np.arange(n_fine_lon)
        if lat.shape != want_lat.shape or not np.allclose(lat, want_lat, atol=1e-6):
            raise AccessMismatch(f"{self.short_name}: latitude {lat.max():.3f}..{lat.min():.3f} ({lat.size}) is not the 0.05° CMG")
        if lon.shape != want_lon.shape or not np.allclose(lon, want_lon, atol=1e-6):
            raise AccessMismatch(f"{self.short_name}: longitude {lon.min():.3f}..{lon.max():.3f} ({lon.size}) is not the 0.05° CMG")
        raw = np.asarray(da.values)
        lo, hi = self.valid_range
        x = raw.astype(np.float32)
        x[(raw == int(fill)) | (raw < lo) | (raw > hi)] = np.nan
        x = x[::-1] * np.float32(self.scale)                         # rows south to north, stored integer → value
        coarse = block_mean(x, self.block, self.fine_step)
        g = self.grid
        if coarse.shape != (g["nlat"], g["nlon"]) or not np.isclose(lat_centres(g)[0], -90 + self.fine_step * self.block / 2) \
                or not np.isclose(lon_centres(g)[0], -180 + self.fine_step * self.block / 2):
            raise AccessMismatch(f"{self.short_name}: the block mean does not land on the {g['id']} grid")
        if box is not None:
            r0, r1, c0, c1 = box
            coarse = coarse[r0:r1, c0:c1]
        values = convert(coarse, units, variable["units"]["monthly"]).astype(np.float32)
        fin = values[np.isfinite(values)]
        valid_fine = int(np.isfinite(x).sum())
        facts = {"variable": name, "dims": list(da.dims), "units": units, "fill": float(fill),
                 "scaleFactorInFile": float(sf), "documentedScale": self.scale, "validRange": [lo, hi],
                 "lat": [float(lat.min()), float(lat.max()), int(lat.size)], "lon": [float(lon.min()), float(lon.max()), int(lon.size)],
                 "fineValid": valid_fine, "fineMissing": int(x.size - valid_fine),
                 "regrid": f"area-weighted mean of {self.block} x {self.block} cells of {self.fine_step} deg; NaN unless half the area is valid",
                 "monthlyUnit": variable["units"]["monthly"], "finite": int(fin.size), "missing": int(values.size - fin.size),
                 "min": float(fin.min()) if fin.size else None, "max": float(fin.max()) if fin.size else None,
                 "mean": float(fin.mean()) if fin.size else None}
        return values, facts


def _check_names(names: list[str]) -> None:
    """Every granule must be a MOD13C2 collection 061 file (CMR returns only the pinned product; this is a second look)."""
    bad = [n for n in names if not (n.startswith("MOD13C2.A") and ".061." in n)]
    if bad:
        raise AccessMismatch(f"MOD13C2: granules not of MOD13C2 061: {bad[:3]}")


MOD13C2 = register(CmgReader(source_id="modis_vegetation", grid_id="modis_05deg", group="MOD_Grid_monthly_CMG_VI/Data_Fields",
                             dims=("", "YDim_MOD_Grid_monthly_CMG_VI", "XDim_MOD_Grid_monthly_CMG_VI"),
                             time="", lat="Latitude", lon="Longitude", units={NDVI: "NDVI"}, name_check=_check_names,
                             coord_group="MOD_Grid_monthly_CMG_VI", scale=0.0001, file_scale_factor=10000.0,
                             valid_range=(-2000, 10000), fine_step=0.05, block=10))

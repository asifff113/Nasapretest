# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Data sources: one generic Earthdata fetcher (`earthdata.py`) plus one small reader per product.

A reader holds only what is specific to its product: the HDF5 group, the order of the variable's dimensions as it
arrives, the coordinate names, the units the documentation says the file carries, the grid, and whether only the
region box is kept. Short name, version and DOI come from config/sources.yaml; the variable names and monthly units
from config/variables.yaml. A new dataset is one more reader registered here (docs/02_DATA.md §14).

`Reader.decode()` turns one opened monthly file into one field [n_lat][n_lon] in the monthly unit, with NaN for
fill and non-finite values, on the reader's grid (latitude increasing with the row, longitude with the column).

A variable of config/variables.yaml may be the sum of several file variables, written "A + B" (GLDAS runoff =
Qs_acc + Qsb_acc, GLDAS-2 README §3.5 item 2). Each part is fetched and decoded on its own, in the monthly unit;
`casefile_pipeline.stages.load_field` adds them month by month (NaN if any part is NaN).
Network access is allowed only inside this package (AGENTS.md rule 9); this module itself makes no request.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from casefile_engine.base import SOURCES, VARS

from ..grids import GRIDS, lat_centres, lon_centres
from ..units import convert, mask_fill

USED_STATUSES = ("analysed", "sensitivity")    # variables the first release fetches (config/variables.yaml)


class AccessMismatch(RuntimeError):
    """A file differs from what the documentation says (dims, units, coordinates): stop and report, never guess."""


@dataclass(frozen=True)
class Reader:
    source_id: str                        # id in config/sources.yaml
    grid_id: str                          # id in casefile_pipeline.grids.GRIDS
    group: str | None                     # HDF5 group holding the variable and its coordinates (None: the root)
    dims: tuple[str, str, str]            # the variable's dimensions in the order they arrive
    time: str
    lat: str
    lon: str
    units: dict[str, str]                 # variable name in the file → units attribute the documentation gives
    subset_to_regions: bool = False       # keep only the box covering every region (+1°), docs/02_DATA.md §3.2
    name_check: Callable[[list[str]], None] | None = None    # raises if a granule is not of the pinned product
    # variable name → the unit the documentation gives for the monthly value when the units attribute alone does not
    # say it (GLDAS "_acc": "kg m-2" in the file, a 3-hour accumulation averaged over the month); used to convert
    rate_units: dict[str, str] = field(default_factory=dict)

    # ------------------------------------------------------------------ configuration
    @property
    def source(self) -> dict:
        return SOURCES[self.source_id]

    @property
    def short_name(self) -> str:
        return str(self.source["short_name"])

    @property
    def version(self) -> str:
        return str(self.source["version"])

    @property
    def grid(self) -> dict:
        return GRIDS[self.grid_id]

    def variables(self) -> list[dict]:
        """The variables of config/variables.yaml this product supplies (status analysed or sensitivity)."""
        return [v for v in VARS.values() if v.get("source") == self.source_id and v.get("status") in USED_STATUSES]

    def file_variables(self) -> list[str]:
        """The variables to read from the files: the parts of every used variable, in order, each once."""
        out: list[str] = []
        for v in self.variables():
            out += [p for p in parts(str(v["variable"])) if p not in out]
        return out

    def entry_for(self, file_variable: str) -> dict:
        """The used variable of config/variables.yaml that `file_variable` belongs to (alone or as a part)."""
        for v in self.variables():
            if file_variable in parts(str(v["variable"])):
                return v
        raise KeyError(f"{self.short_name}: no used variable '{file_variable}' in config/variables.yaml")

    def path(self, name: str) -> str:
        return f"/{self.group}/{name}" if self.group else f"/{name}"

    def constraint(self, variable: str) -> str:
        """DAP4 constraint naming one variable and its coordinates, separated by ';' (docs/02_DATA.md §2)."""
        return ";".join([self.path(variable)] + [self.path(c) for c in (self.time, self.lat, self.lon)])

    # ------------------------------------------------------------------ decoding one monthly file
    def decode(self, ds, variable: dict, box: tuple[int, int, int, int] | None = None,
               name: str | None = None) -> tuple[np.ndarray, dict]:
        """One month of the file variable `name` (default: `variable["variable"]`), which is `variable` (an entry of
        config/variables.yaml) or one of its parts, from the opened dataset `ds`.

        `ds` must be opened with mask_and_scale=False so the fill value is read as found. Returns
        (values [n_lat][n_lon] float32 in the variable's monthly unit, facts as found in the file). `box` is
        (row0, row1, col0, col1) on the reader's grid; None keeps the whole grid."""
        name = name or str(variable["variable"])
        if name not in parts(str(variable["variable"])):
            raise KeyError(f"{self.short_name}: '{name}' is not a part of '{variable['variable']}'")
        if name not in ds.variables:
            raise AccessMismatch(f"{self.short_name}: variable '{name}' not in the file (has {sorted(ds.variables)})")
        da = ds[name]
        if tuple(da.dims) != self.dims:
            raise AccessMismatch(f"{self.short_name} {name}: dimensions {tuple(da.dims)}, the documentation says {self.dims}")
        if da.sizes[self.time] != 1:
            raise AccessMismatch(f"{self.short_name} {name}: {da.sizes[self.time]} time steps in a monthly file, expected 1")
        units = str(da.attrs.get("units", "")).strip()
        if units != self.units[name]:
            raise AccessMismatch(f"{self.short_name} {name}: units '{units}', the documentation says '{self.units[name]}'")
        g = self.grid
        lat = np.asarray(ds[self.lat].values, dtype=float)
        lon = np.asarray(ds[self.lon].values, dtype=float)
        if lat.shape != (g["nlat"],) or not np.allclose(lat, lat_centres(g), atol=1e-3):
            raise AccessMismatch(f"{self.short_name}: latitude {lat.min():.3f}..{lat.max():.3f} ({lat.size}) is not the {g['id']} grid")
        if lon.shape != (g["nlon"],) or not np.allclose(lon, lon_centres(g), atol=1e-3):
            raise AccessMismatch(f"{self.short_name}: longitude {lon.min():.3f}..{lon.max():.3f} ({lon.size}) is not the {g['id']} grid")
        fill = da.attrs.get("_FillValue", da.encoding.get("_FillValue", da.attrs.get("missing_value")))
        raw = np.asarray(da.values)[0]
        x = mask_fill(raw, fill)
        scale, offset = da.attrs.get("scale_factor"), da.attrs.get("add_offset")
        if scale is not None or offset is not None:
            x = x * float(1.0 if scale is None else scale) + float(0.0 if offset is None else offset)
        if self.dims[1:] == (self.lon, self.lat):
            x = x.T                                            # (lon, lat) → (lat, lon), docs/02_DATA.md §3.2 (P-07)
        elif self.dims[1:] != (self.lat, self.lon):
            raise AccessMismatch(f"{self.short_name}: unexpected axis order {self.dims}")
        if box is not None:
            r0, r1, c0, c1 = box
            x = x[r0:r1, c0:c1]
        values = convert(x, self.rate_units.get(name, units), variable["units"]["monthly"]).astype(np.float32)
        fin = values[np.isfinite(values)]
        facts = {"variable": name, "dims": list(da.dims), "units": units,
                 **({"documentedUnits": self.rate_units[name]} if name in self.rate_units else {}),
                 "fill": None if fill is None else float(np.asarray(fill).ravel()[0]),
                 "lat": [float(lat.min()), float(lat.max()), int(lat.size)], "lon": [float(lon.min()), float(lon.max()), int(lon.size)],
                 "monthlyUnit": variable["units"]["monthly"], "finite": int(fin.size), "missing": int(values.size - fin.size),
                 "min": float(fin.min()) if fin.size else None, "max": float(fin.max()) if fin.size else None,
                 "mean": float(fin.mean()) if fin.size else None}
        return values, facts


def parts(file_variable: str) -> list[str]:
    """The file variables a config variable is made of: "Qs_acc + Qsb_acc" → ["Qs_acc", "Qsb_acc"]; "T2M" → ["T2M"]."""
    return [p.strip() for p in str(file_variable).split("+")]


READERS: dict[str, Reader] = {}


def register(reader: Reader) -> Reader:
    """Register a reader under its source id (config/sources.yaml)."""
    if reader.source_id not in SOURCES:
        raise KeyError(f"source '{reader.source_id}' is not in config/sources.yaml")
    READERS[reader.source_id] = reader
    return reader


def reader_for_variable(variable_id: str) -> Reader:
    src = VARS[variable_id]["source"]
    if src not in READERS:
        raise KeyError(f"no reader for source '{src}' of variable '{variable_id}'")
    return READERS[src]


def used_readers() -> list[Reader]:
    """Readers of every product that supplies a variable the release uses, in config/sources.yaml order."""
    return [READERS[s] for s in SOURCES if s in READERS and READERS[s].variables()]


from . import gldas, imerg, merra2, modis  # noqa: F401  (registers the readers)

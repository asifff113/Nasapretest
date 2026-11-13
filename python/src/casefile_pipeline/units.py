# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Unit conversions to each variable's monthly unit (docs/01_ARCHITECTURE.md §5, docs/02_DATA.md §3).

The key is (units attribute as found in the file, monthly unit of config/variables.yaml). A pair that is not
listed stops the pipeline: a unit is never guessed.

- K → °C: x − 273.15
- kg m⁻² s⁻¹ → mm/day: x × 86 400 (1 kg m⁻² of water is 1 mm; never × 86 400 000)
- mm/hr → mm/day: x × 24
"""
from __future__ import annotations

from collections.abc import Callable

import numpy as np

CONVERT: dict[tuple[str, str], Callable[[np.ndarray], np.ndarray]] = {
    ("K", "°C"): lambda x: x - 273.15,
    ("kg m-2 s-1", "mm/day"): lambda x: x * 86400.0,
    ("mm/hr", "mm/day"): lambda x: x * 24.0,
}


def convert(values: np.ndarray, found: str, monthly_unit: str) -> np.ndarray:
    """Convert `values` from the file's units (`found`) to `monthly_unit`. NaN stays NaN."""
    key = (str(found).strip(), monthly_unit)
    if key not in CONVERT:
        raise ValueError(f"no conversion from '{found}' to '{monthly_unit}': stop and check the product's documentation")
    return CONVERT[key](np.asarray(values, dtype=np.float64))


def mask_fill(values: np.ndarray, fill) -> np.ndarray:
    """Float64 copy of `values` with the fill value and every non-finite value set to NaN (never zero)."""
    x = np.array(values, dtype=np.float64)
    if fill is not None:
        f = float(np.asarray(fill).ravel()[0])
        x[np.isclose(x, f, rtol=1e-6, atol=0.0)] = np.nan
    x[~np.isfinite(x)] = np.nan
    return x

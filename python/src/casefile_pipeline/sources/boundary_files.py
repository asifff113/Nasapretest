# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Downloading the boundary files of config/regions.yaml into .cache/boundaries/ (docs/02_DATA.md §7.1).

One entry per boundary key of config/regions.yaml. The addresses are the GeoJSON files of each source's own
repository: Natural Earth's vector repository at a fixed release tag, and the geoBoundaries release folder that
config/regions.yaml names. Each file is downloaded once; its SHA-256 and the licence statement shipped with it
are written to .cache/boundaries/sources.json. Network access happens only here (AGENTS.md rule 9).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

NE_TAG = "v5.1.2"
_NE = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_TAG}"
_GB = "https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/BGD/ADM1"

FILES: dict[str, dict] = {
    "natural_earth_admin0": {"url": f"{_NE}/geojson/ne_50m_admin_0_countries.geojson", "file": "ne_50m_admin_0_countries.geojson",
                             "licence_url": f"{_NE}/LICENSE.md", "version": f"Natural Earth {NE_TAG}"},
    "natural_earth_admin1": {"url": f"{_NE}/geojson/ne_10m_admin_1_states_provinces.geojson", "file": "ne_10m_admin_1_states_provinces.geojson",
                             "licence_url": f"{_NE}/LICENSE.md", "version": f"Natural Earth {NE_TAG}"},
    "geoboundaries_bgd_adm1": {"url": f"{_GB}/geoBoundaries-BGD-ADM1.geojson", "file": "geoBoundaries-BGD-ADM1.geojson",
                               "licence_url": f"{_GB}/geoBoundaries-BGD-ADM1-metaData.json", "version": "geoBoundaries gbOpen (main)"},
}


def _get(url: str) -> bytes:
    import requests

    r = requests.get(url, timeout=120)
    r.raise_for_status()
    return r.content


def ensure(folder: Path, keys=None, log=print) -> dict:
    """Download each boundary file once into `folder`; return {key: {file, sha256, licence, …}}."""
    folder.mkdir(parents=True, exist_ok=True)
    meta_path = folder / "sources.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    for key in keys or FILES:
        spec = FILES[key]
        path = folder / spec["file"]
        if not path.exists():
            log(f"  downloading {spec['file']}")
            data = _get(spec["url"])
            json.loads(data)                                  # must be JSON (GeoJSON)
            path.write_bytes(data)
        if key not in meta or meta[key].get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest():
            lic = _get(spec["licence_url"]).decode("utf-8", "replace")
            if lic.lstrip().startswith("{"):
                d = json.loads(lic)
                lic = d.get("boundaryLicense", "") + (f" ({d['licenseDetail']})" if d.get("licenseDetail") else "")
            else:
                lic = lic.strip().splitlines()[0].lstrip("# ").strip()
            meta[key] = {"file": spec["file"], "url": spec["url"], "version": spec["version"],
                         "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "licence": lic}
    meta_path.write_bytes((json.dumps(meta, indent=1, ensure_ascii=False)).encode("utf-8"))
    return meta

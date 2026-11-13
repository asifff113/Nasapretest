# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""input_manifest.json for the bundle (docs/02_DATA.md §9, schemas/input_manifest.schema.json).

`product_entry` is written by `fetch` (one per product, beside the monthly file); `write_manifest` joins them with
the checks when `bundle` runs. Every file is pinned by the SHA-256 of the saved response and, for subsets, by
`valuesSha256` of the decoded array. The manifest holds no timestamp of its own beyond the latest fetch, so the
same cache always gives the same manifest (and the same hash in the pre-registration).
"""
from __future__ import annotations

import json
from pathlib import Path

from casefile_engine.base import SOURCES


def product_entry(source_id: str, records: list[dict], first: str, last: str, bbox, provider: str) -> dict:
    """One product of the manifest from the month records of a fetch (in month order). `provider` is the access
    route as the provenance schema names it (earthaccess, power_check, csv, synthetic); the detailed route goes into
    the manifest's checks."""
    s = SOURCES[source_id]
    facts = records[0]["facts"]
    variables = sorted(facts)
    units = {v: facts[v]["units"] for v in variables}
    fills = {facts[v]["fill"] for v in variables}
    fill = fills.pop() if len(fills) == 1 else json.dumps({v: facts[v]["fill"] for v in variables})
    files = []
    for r in records:
        f = {"name": r["name"], "month": r["month"], "sha256": r["sha256"], "bytes": int(r["bytes"])}
        if r.get("valuesSha256"):
            f["valuesSha256"] = r["valuesSha256"]
        files.append(f)
    return {"source": source_id, "shortName": str(s["short_name"]), "version": str(s["version"]), "doi": s.get("doi"),
            "query": {"provider": provider, "temporal": [first, last], "bbox": None if bbox is None else [round(float(x), 4) for x in bbox]},
            "variables": variables, "units": units, "fill": fill, "firstMonth": first, "lastMonth": last,
            "granuleCount": len(records), "files": files}


def write_manifest(out: Path, manifest_id: str, created: str, products: list[dict], checks: list[dict]) -> Path:
    doc = {"schema": "casefile/input_manifest@3", "manifestId": manifest_id, "created": created, "synthetic": False,
           "products": products, "checks": checks}
    p = Path(out) / "input_manifest.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes((json.dumps(doc, ensure_ascii=False, indent=1)).encode("utf-8"))
    return p

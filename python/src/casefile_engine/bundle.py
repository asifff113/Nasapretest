# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""The input bundle: what the pipeline hands to the engine (docs/01_ARCHITECTURE.md §5).

    <bundle>/input_manifest.json                     schema casefile/input_manifest@3
    <bundle>/regions/index.json                      schema casefile/region_index@3
    <bundle>/regions/cells/<grid>/<region>.json      schema casefile/mask@3
    <bundle>/series/<variable>/<region>.npz          start "YYYY-MM", monthly [n_months], cells [n_cells][n_months],
                                                     area_km2, effective_cells, grid
    <bundle>/pairs/<variable>/<pair id>.npz          start, a [n_months], b [n_months]   (disjoint-cell means; optional)
    <bundle>/map/<variable>__<season>.npz            years [n_years], values [180][360][n_years]   (optional)

Values are in analysis units: the monthly units of config/variables.yaml (air_temp in °C, rain and rain_imerg in mm/day). Missing
months are NaN. In file names a region id has ":" replaced by "__".
"""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import yaml

from . import __version__
from . import base as M
from . import build as B

MAX_CELLS = 2000          # more cells than this are thinned evenly before the leftover-memory check
SYNTH_REVIEWS = [{"case": f"contrast|{M.LEAD_PAIR}|rain_imerg|ANN", "break": "imerg_trmm_to_gpm_2014", "outcome": "no_step_seen",
                  "reviewer": "A (example)", "note": "Synthetic example review: no step at June 2014 in the series or the difference."}]


# ---------------------------------------------------------------------------------------------- small helpers
def _git(*args) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=M.ROOT, capture_output=True, text=True, timeout=20)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def created_now() -> str:
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    t = dt.datetime.fromtimestamp(int(epoch), dt.timezone.utc) if epoch else dt.datetime.now(dt.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _npz(path: Path) -> dict:
    with np.load(path, allow_pickle=False) as z:
        return {k: z[k] for k in z.files}


# ---------------------------------------------------------------------------------------------- synthetic bundle
def write_synthetic_bundle(out: Path) -> Path:
    """The synthetic example in bundle form: the reference for the format and the input of `examples`."""
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    keep = (M.EX, M.BUILD_ID, M.CREATED, M.SYNTH)
    M.configure(out=out, build_id="synthetic-v3", created="2026-11-02T00:00:00Z", synthetic=True)
    try:
        index, masks = M.build_regions()                      # regions/index.json and the masks
        files = []
        for rid in ("synthetic:north_plain", "synthetic:south_delta", "synthetic:east_coast"):
            for var in ("air_temp", "rain", "rain_imerg"):
                if var == "rain_imerg" and rid == "synthetic:east_coast":
                    continue
                a = M.region_arrays(rid, var, masks)
                monthly = np.array(a["monthly"], dtype=float)
                if (rid, var) == ("synthetic:east_coast", "rain"):
                    # a deliberate gap: May 1995 is missing, so MAM 1995 is missing ("missing_year")
                    monthly[M.L.month_index(f"{a['first']}-01", 1995, 5)] = np.nan
                f = out / f"series/{var}/{M.fpath(rid)}.npz"
                f.parent.mkdir(parents=True, exist_ok=True)
                np.savez_compressed(f, start=f"{a['first']}-01", monthly=monthly, cells=np.asarray(a["cells"], dtype=float),
                                    area_km2=float(a["area"]), effective_cells=float(a["eff"]), grid=a["grid"])
                b = np.nan_to_num(np.asarray(monthly, dtype="<f4")).tobytes()
                files.append({"name": f"SYNTHETIC_{var}_{M.fpath(rid)}.bin", "month": f"{a['first']}-01", "sha256": M.sha256_bytes(b), "bytes": len(b)})
        files.sort(key=lambda x: x["name"])

        def prod(source, short, version, doi, t0, t1, bbox, variables, units, n, pick):
            return {"source": source, "shortName": short, "version": version, "doi": doi,
                    "query": {"provider": "synthetic", "temporal": [t0, t1], "bbox": bbox}, "variables": variables, "units": units,
                    "fill": None, "firstMonth": t0, "lastMonth": t1, "granuleCount": n, "files": [f for f in files if pick(f["name"])]}

        manifest = {"schema": "casefile/input_manifest@3", "manifestId": "synthetic-manifest", "created": M.CREATED, "synthetic": True,
                    "products": [
                        prod("merra2_slv", "M2TMNXSLV", "5.12.4", "10.5067/AP1B0BA5PD2K", "1980-01", "2025-12", None, ["T2M"], {"T2M": "K"}, 552,
                             lambda n: "air_temp" in n),
                        prod("merra2_precip", "M2TMNXFLX", "5.12.4", "10.5067/0JRLVL8YV2Y4", "1980-01", "2025-12", None, ["PRECTOTCORR"],
                             {"PRECTOTCORR": "kg m-2 s-1"}, 552, lambda n: "_rain_" in n and "imerg" not in n),
                        prod("imerg_v07_final_monthly", "GPM_3IMERGM", "07", "10.5067/GPM/IMERG/3B-MONTH/07", "1998-01", "2025-09",
                             [80.0, 15.0, 100.0, 30.0], ["precipitation"], {"precipitation": "mm/hr"}, 333, lambda n: "imerg" in n)],
                    "checks": [{"id": "power_cross_check", "result": "skip", "note": "synthetic data: no POWER call"}]}
        M.write_json("input_manifest.json", manifest)
        from . import mapbuild
        V, _, _ = mapbuild.synthetic_field()
        (out / "map").mkdir(exist_ok=True)
        np.savez_compressed(out / "map/air_temp__ANN.npz", years=np.arange(1980, 2026), values=V)
    finally:
        M.configure(out=keep[0], build_id=keep[1], created=keep[2], synthetic=keep[3])
    return out


# ---------------------------------------------------------------------------------------------- reading a bundle
def bundle_hashes(bundle: Path) -> dict:
    bundle = Path(bundle)
    return {"analysis_yaml_sha256": M.CONFIG_SHA, "input_manifest_sha256": M.sha256_file(bundle / "input_manifest.json"),
            "regions_support_sha256": M.sha256_file(bundle / "regions/index.json")}


def load_bundle(bundle: Path, prereg: dict) -> dict:
    """Read the bundle into the inputs of build.run(). Region order follows the pre-registration's region set."""
    bundle = Path(bundle)
    index = json.loads((bundle / "regions/index.json").read_text(encoding="utf-8"))
    win = {v["id"]: (int(v["main_window"]["first"]), int(v["main_window"]["last"])) for v in prereg["variables"]}
    seasons = ["ANN"] + list(prereg["seasons"]["secondary"])
    series, pair_series, record_last = {}, {}, {}
    for reg in prereg["regions"]["set"]:
        rid = reg["id"]
        for var in win:
            f = bundle / f"series/{var}/{M.fpath(rid)}.npz"
            if not f.exists():
                continue
            z = _npz(f)
            first = int(str(z["start"])[:4])
            if str(z["start"])[5:7] != "01":
                raise ValueError(f"{f}: the series must start in January (start={z['start']}); pad earlier months with NaN")
            monthly = np.asarray(z["monthly"], dtype=float)
            cells = np.asarray(z["cells"], dtype=float).reshape(-1, len(monthly))
            if cells.shape[0] > MAX_CELLS:
                cells = cells[np.unique(np.linspace(0, cells.shape[0] - 1, MAX_CELLS).round().astype(int))]
            sea, cell_sea = M.seasonal_block(var, first, monthly, cells, seasons, win[var][1])
            series[(rid, var)] = {"monthly": monthly, "first": first, "seasons": sea, "cells": cell_sea, "area": float(z["area_km2"]),
                                  "eff": float(z["effective_cells"]), "grid": str(z["grid"])}
            record_last[var] = win[var][1]
    for p in index.get("pairs", []):
        for var in win:
            f = bundle / f"pairs/{var}/{p['id']}.npz"
            if f.exists():
                z = _npz(f)
                pair_series[(p["id"], var)] = {"first": int(str(z["start"])[:4]), "a": np.asarray(z["a"], dtype=float), "b": np.asarray(z["b"], dtype=float)}
    map_fields = {}
    for f in sorted((bundle / "map").glob("*.npz")) if (bundle / "map").exists() else []:
        var, season = f.stem.split("__")
        z = _npz(f)
        map_fields[(var, season)] = (np.asarray(z["years"], dtype=int), np.asarray(z["values"], dtype=float))
    return {"index": index, "series": series, "pair_series": pair_series, "map_fields": map_fields, "record_last": record_last,
            "manifest": json.loads((bundle / "input_manifest.json").read_text(encoding="utf-8")),
            "manifest_sha": M.sha256_file(bundle / "input_manifest.json")}


def copy_bundle_files(bundle: Path, out: Path) -> None:
    """The manifest, the region index and the masks are published unchanged with the results."""
    bundle, out = Path(bundle), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(bundle / "input_manifest.json", out / "input_manifest.json")
    if (out / "regions").exists():
        shutil.rmtree(out / "regions")
    shutil.copytree(bundle / "regions", out / "regions")


def annual_field(variable: str, start: str, monthly_field, first: int, last: int):
    """For the pipeline: annual values of a monthly 1° field [180][360][n_months], with the engine's own rules
    (03 §2.2). Returns (years, values [180][360][n_years]). Takes about a minute per variable."""
    f = np.asarray(monthly_field, dtype=float)
    rule = M.VARS[variable]["rule"]
    years = list(range(first, last + 1))
    out = np.full(f.shape[:2] + (len(years),), np.nan)
    for r in range(f.shape[0]):
        for c in range(f.shape[1]):
            v = f[r, c]
            if not np.isfinite(v).any():
                continue
            a = M.L.annual_values(start, [None if not np.isfinite(x) else float(x) for x in v], "ANN", rule, first, last)
            out[r, c] = [np.nan if x is None else x for x in a["values"]]
    return np.asarray(years), out


# ---------------------------------------------------------------------------------------------- checks
def check_bundle(bundle: Path) -> list[str]:
    """Shape, unit and range checks. Prints climatological summaries only: never a yearly series or a trend."""
    bundle = Path(bundle)
    problems: list[str] = []
    for need in ("input_manifest.json", "regions/index.json"):
        if not (bundle / need).exists():
            problems.append(f"missing {need}")
    if problems:
        return problems
    index = json.loads((bundle / "regions/index.json").read_text(encoding="utf-8"))
    ids = {r["id"] for r in index["regions"]}
    rows = []
    for f in sorted((bundle / "series").glob("*/*.npz")) if (bundle / "series").exists() else []:
        var, rid = f.parent.name, f.stem.replace("__", ":", 1)
        if var not in M.VARS:
            problems.append(f"{f}: unknown variable '{var}' (config/variables.yaml)")
            continue
        z = _npz(f)
        miss = [k for k in ("start", "monthly", "cells", "area_km2", "effective_cells", "grid") if k not in z]
        if miss:
            problems.append(f"{f}: missing arrays {miss}")
            continue
        m, c = np.asarray(z["monthly"], dtype=float), np.asarray(z["cells"], dtype=float)
        if rid not in ids:
            problems.append(f"{f}: region '{rid}' is not in regions/index.json")
        if c.ndim != 2 or c.shape[1] != m.shape[0]:
            problems.append(f"{f}: cells must be [n_cells][n_months] with n_months={m.shape[0]}, got {c.shape}")
            continue
        if str(z["start"])[5:7] != "01":
            problems.append(f"{f}: start must be a January (got {z['start']})")
        units = M.VARS[var]["units"]["monthly"]
        lo, hi = M.VARS[var].get("valid_range") or (-np.inf, np.inf)      # config/variables.yaml
        fin = m[np.isfinite(m)]
        if fin.size == 0:
            problems.append(f"{f}: no finite monthly value")
            continue
        if units == "°C" and fin.mean() > 150:
            problems.append(f"{f}: mean {fin.mean():.1f} looks like kelvin; subtract 273.15")
        if units == "mm/day" and fin.max() < 0.01:
            problems.append(f"{f}: maximum {fin.max():.2e} looks like kg m-2 s-1; multiply by 86400")
        if fin.min() < lo or fin.max() > hi:
            problems.append(f"{f}: values outside [{lo}, {hi}] {units}: min {fin.min():.3g}, max {fin.max():.3g}")
        cellfin = c[np.isfinite(c)]
        if cellfin.size and (cellfin.min() < lo or cellfin.max() > hi):
            problems.append(f"{f}: cell values outside [{lo}, {hi}] {units}")
        if float(z["effective_cells"]) <= 0 or c.shape[0] == 0:
            problems.append(f"{f}: no cells")
        clim = [float(np.nanmean(m[k::12])) for k in range(12)]
        rows.append(f"  {var:11s} {rid:28s} start {str(z['start'])}  months {m.shape[0]:4d}  missing {int((~np.isfinite(m)).sum()):3d}  "
                    f"cells {c.shape[0]:5d}  monthly climatology {min(clim):.2f}..{max(clim):.2f} {units}"
                    + (f"  mean yearly total {float(np.mean(clim)) * 365.25:.0f} mm" if units == "mm/day" else ""))
    if not rows:
        problems.append("no series/<variable>/<region>.npz file")
    for f in sorted((bundle / "pairs").glob("*/*.npz")) if (bundle / "pairs").exists() else []:
        z = _npz(f)
        if any(k not in z for k in ("start", "a", "b")) or np.asarray(z["a"]).shape != np.asarray(z["b"]).shape:
            problems.append(f"{f}: needs start, a and b of equal length")
    for f in sorted((bundle / "map").glob("*.npz")) if (bundle / "map").exists() else []:
        z = _npz(f)
        if "years" not in z or "values" not in z or np.asarray(z["values"]).shape != (180, 360, len(z["years"])):
            problems.append(f"{f}: needs years [n] and values [180][360][n]")
    print("series found (climatology only; no yearly values are shown before the pre-registration):")
    print("\n".join(rows))
    return problems


def load_prereg(bundle: Path, path: Path | None = None, require_committed: bool = True) -> tuple[dict, list[str]]:
    """config/preregistration.yaml as the dict the build uses, with the problems that stop a build."""
    path = Path(path) if path else M.ROOT / "config/preregistration.yaml"
    raw = path.read_bytes()
    pr = yaml.safe_load(raw)
    problems = []
    if "<fill" in raw.decode("utf-8"):
        problems.append("the pre-registration still contains <fill ...> values")
        return pr, problems
    if require_committed and pr.get("status") != "committed":
        problems.append("status is not 'committed'")
    want = bundle_hashes(bundle)
    for k, v in want.items():
        if pr["hashes"].get(k) != v:
            problems.append(f"hashes.{k} is {pr['hashes'].get(k)!r}; this configuration and bundle give {v}")
    index = json.loads((Path(bundle) / "regions/index.json").read_text(encoding="utf-8"))
    reg = {r["id"]: r for r in index["regions"]}
    for r in pr["regions"]["set"]:
        if r["id"] not in reg:
            problems.append(f"region {r['id']} is not in the bundle's regions/index.json")
        elif not reg[r["id"]].get("inSet"):
            problems.append(f"region {r['id']} does not pass the support rule")
        elif not r.get("effective_native_cells"):
            # the numbers come from the bundle, which the pre-registration pins by regions_support_sha256
            r["effective_native_cells"] = {g: v["effectiveCells"] for g, v in reg[r["id"]]["support"].items()}
    ipairs = {p["id"]: p for p in index.get("pairs", [])}
    set_ids = {r["id"] for r in pr["regions"]["set"]}
    for p in pr["pairs"]:
        if p["a"] not in set_ids or p["b"] not in set_ids:
            problems.append(f"pair {p['id']}: both regions must be in regions.set")
        if p["id"] not in ipairs:
            problems.append(f"pair {p['id']} is not in the bundle's regions/index.json (the pipeline builds it from this file)")
        elif not ipairs[p["id"]]["split"]["passes"]:
            problems.append(f"pair {p['id']} fails the disjoint-cell rule S3")
    if sum(1 for p in pr["pairs"] if p.get("lead")) != 1:
        problems.append("exactly one pair must have lead: true")
    fam = B.family_keys(pr)
    pr["family_preview"] = {"confirmatory": fam["confirmatory"], "secondary": fam["secondary"]}
    pr["sha256"] = M.sha256_bytes(raw)
    if require_committed and _git("rev-parse", "--is-inside-work-tree") == "true":
        rel = os.path.relpath(path, M.ROOT)
        if _git("status", "--porcelain", "--", rel):
            problems.append(f"{rel} has uncommitted changes: commit it before the results build")
        pr["commit"] = _git("log", "-n", "1", "--format=%H", "--", rel) or pr.get("commit")
    return pr, problems


def load_reviews() -> list[dict]:
    """config/break_review.yaml. A case is written as {kind, pair or region, variable, season} or as the key string."""
    p = M.ROOT / "config/break_review.yaml"
    if not p.exists():
        return []
    out = []
    for r in (yaml.safe_load(p.read_text(encoding="utf-8")) or {}).get("reviews") or []:
        c = r["case"]
        if isinstance(c, dict):
            c = (f"contrast|{c['pair']}|{c['variable']}|{c['season']}" if c.get("kind") == "contrast"
                 else f"trend|{c['region']}|{c['variable']}|{c['season']}")
        out.append({"case": c, "break": r["break"], "outcome": r["outcome"], "reviewer": r.get("reviewer", ""), "note": r.get("note", "")})
    return out


def sim_tables() -> dict:
    """The simulation tables shipped with the engine (full size, fixed seeds). They depend only on config/analysis.yaml."""
    p = Path(__file__).resolve().parent / "data/sim_tables.json"
    t = json.loads(p.read_text(encoding="utf-8"))
    if t.get("simKey") != M.SIM_KEY:
        raise SystemExit("The simulation settings in config/analysis.yaml changed since the methods tables were simulated.\n"
                         "Run: casefile-engine methods-tables   (about 40 minutes), then build again.")
    return t


def selfcheck(verbose: bool = True) -> dict:
    """Recompute the golden values and compare them with examples/golden (07 §2). A mismatch stops every build."""
    from . import golden
    tables = json.loads((M.ROOT / "examples/methods/tables.json").read_text(encoding="utf-8"))
    keep = (M.EX, M.BUILD_ID, M.CREATED, M.SYNTH)
    total = passed = 0
    bad = []
    with tempfile.TemporaryDirectory() as tmp:
        M.configure(out=tmp, build_id="synthetic-v3", created="2026-11-02T00:00:00Z", synthetic=True)
        try:
            golden.build_all(tables)
        finally:
            M.configure(out=keep[0], build_id=keep[1], created=keep[2], synthetic=keep[3])
        for f in sorted((M.ROOT / "examples/golden").glob("*.json")):
            g = Path(tmp) / "golden" / f.name
            if not g.exists():
                continue                                    # map_cells.json is checked by the examples test
            want, got = json.loads(f.read_text(encoding="utf-8")), json.loads(g.read_text(encoding="utf-8"))
            wc, gc = _cases(want), _cases(got)
            for k, (w, x) in enumerate(zip(wc, gc)):
                total += 1
                if _same(w, x):
                    passed += 1
                else:
                    bad.append(f"{f.name} case {k}")
            if len(wc) != len(gc):
                bad.append(f"{f.name}: {len(wc)} cases expected, {len(gc)} computed")
    if verbose:
        print(f"golden self-check: {passed}/{total} cases match" + ("" if not bad else "; MISMATCH in " + ", ".join(bad[:8])))
    return {"suite": "examples/golden", "total": total, "passed": passed, "failed": bad}


def _cases(doc):
    for key in ("cases", "tests", "items"):
        if isinstance(doc, dict) and isinstance(doc.get(key), list):
            return doc[key]
    return [doc]


def _same(a, b, tol=1e-9) -> bool:
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_same(a[k], b[k], tol) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_same(x, y, tol) for x, y in zip(a, b))
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None or isinstance(a, str) or isinstance(b, str):
        return a == b
    return abs(float(a) - float(b)) <= tol * max(1.0, abs(float(a)), abs(float(b)))


# ---------------------------------------------------------------------------------------------- builds
def _clear(out: Path, keep=()) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for child in out.iterdir():
        if child.name in keep:
            continue
        shutil.rmtree(child) if child.is_dir() else child.unlink()


def build_examples(out: Path | None = None) -> dict:
    """examples/: the synthetic bundle run through the same code as a real build, plus the state demos and golden files."""
    out = Path(out).resolve() if out else M.ROOT / "examples"
    with tempfile.TemporaryDirectory() as tmp:
        bundle = write_synthetic_bundle(Path(tmp) / "bundle")
        M.configure(out=out, build_id="synthetic-v3", created="2026-11-02T00:00:00Z", synthetic=True,
                    engine=f"casefile_engine {__version__} (synthetic examples)")
        _clear(out, keep=("power",))           # examples/power: the hand-kept POWER parser fixture
        copy_bundle_files(bundle, out)
        index = json.loads((out / "regions/index.json").read_text(encoding="utf-8"))
        h = bundle_hashes(bundle)
        prereg = B.build_prereg(index, h["input_manifest_sha256"], h["regions_support_sha256"])
        M.REPS, M.LREPS = 300, 150            # reduced repetitions: the examples are for layout and tests, not for claims
        tables = M.methods_tables(prereg["sha256"], h["input_manifest_sha256"], B.family_keys(prereg))
        inp = load_bundle(bundle, prereg)
        inp.update(prereg=prereg, tables=tables, reviews=SYNTH_REVIEWS, states=True, golden=True,
                   map_fields={("air_temp", "ANN"): None}, record_last={})
        return B.run(inp)


def build_results(bundle: Path, out: Path, build_id: str, created: str | None = None, prereg_path: Path | None = None) -> dict:
    """A real results build. Refuses to run without a committed pre-registration that matches this bundle."""
    bundle, out = Path(bundle).resolve(), Path(out).resolve()
    problems = check_bundle(bundle)
    prereg, pp = load_prereg(bundle, prereg_path)
    problems += pp
    if problems:
        raise SystemExit("The results build cannot run:\n  - " + "\n  - ".join(problems))
    gold = selfcheck()
    if gold["failed"]:
        raise SystemExit("Golden values do not match: the engine was changed. Nothing was built.")
    manifest = json.loads((bundle / "input_manifest.json").read_text(encoding="utf-8"))
    synthetic = bool(manifest.get("synthetic"))
    M.configure(out=out, build_id=build_id, created=created or created_now(), synthetic=synthetic,
                engine=f"casefile_engine {__version__}", manifest=manifest)
    _clear(out)
    copy_bundle_files(bundle, out)
    fam = B.family_keys(prereg)
    tables = dict(sim_tables())
    tables.pop("simKey", None)
    tables.update({"synthetic": synthetic, "created": M.CREATED, "engine": M.ENGINE,
                   "golden": {"suite": gold["suite"], "total": gold["total"], "passed": gold["passed"]},
                   "families": {"confirmatory": fam["confirmatory"], "secondary": fam["secondary"],
                                "alpha": prereg["alpha"]["confirmatory"], "secondaryQ": prereg["alpha"]["secondary_q"]},
                   "prereg": {"sha256": prereg["sha256"], "commit": prereg.get("commit")},
                   "inputManifest": {"sha256": M.sha256_file(bundle / "input_manifest.json")}})
    inp = load_bundle(bundle, prereg)
    sha = _git("rev-parse", "HEAD") or "unknown"
    inp.update(prereg=prereg, tables=tables, reviews=load_reviews(), states=False, golden=False,
               build_extra={"engine": {"version": __version__, "gitSha": sha}, "pipeline": {"gitSha": sha},
                            "prereg": {"path": "prereg.json", "sha256": prereg["sha256"], "commit": prereg.get("commit"),
                                       "status": "synthetic" if synthetic else "committed"},
                            "goldenTests": {"suite": gold["suite"], "total": gold["total"], "passed": gold["passed"]},
                            "products": [{"source": p["source"], "shortName": p["shortName"], "version": p["version"],
                                          "granules": p["granuleCount"]} for p in manifest["products"]]})
    summary = B.run(inp)
    summary["out"] = str(out)
    return summary

# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Settings, methods tables, grids and the synthetic example data.

The repository root is found from CASEFILE_ROOT or from this file's place (python/src/casefile_engine). Call
configure() to choose where results are written and how they are labelled; everything else comes from config/.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path

import numpy as np
import yaml

from . import layer as L
from . import stats as R


def _find_root() -> Path:
    env = os.environ.get("CASEFILE_ROOT")
    if env:
        return Path(env).resolve()
    here = Path(__file__).resolve()
    for p in [Path.cwd().resolve(), *Path.cwd().resolve().parents, *here.parents]:
        if (p / "config/analysis.yaml").exists():
            return p
    raise RuntimeError("Cannot find the repository root (config/analysis.yaml). Set CASEFILE_ROOT.")


ROOT = _find_root()
QUICK = False
EX = ROOT / "examples"
GOLD = EX / "golden"
CREATED = "2026-11-02T00:00:00Z"
BUILD_ID = "synthetic-v3"
ENGINE = "casefile_engine (synthetic examples)"
SYNTH = True          # True labels every output as synthetic (the banner); a real build sets False
MANIFEST = None       # the input manifest of a real build (provenance reads it)


def configure(out=None, build_id=None, created=None, synthetic=None, engine=None, manifest=None):
    """Choose the output folder and the labels of this run."""
    global EX, GOLD, BUILD_ID, CREATED, SYNTH, ENGINE, MANIFEST
    if out is not None:
        EX = Path(out).resolve()
        GOLD = EX / "golden"
    if build_id is not None:
        BUILD_ID = build_id
    if created is not None:
        CREATED = created
    if synthetic is not None:
        SYNTH = bool(synthetic)
    if engine is not None:
        ENGINE = engine
    if manifest is not None:
        MANIFEST = manifest


def load_yaml(p):
    return yaml.safe_load(open(ROOT / p, encoding="utf-8"))


CFG = load_yaml("config/analysis.yaml")
VARS = {v["id"]: v for v in load_yaml("config/variables.yaml")["variables"]}
SOURCES = {s["id"]: s for s in load_yaml("config/sources.yaml")["sources"]}
BREAKS = load_yaml("config/known_breaks.yaml")["breaks"]
QUESTIONS = load_yaml("config/questions.yaml")["cards"]
CASES_CFG = load_yaml("config/cases.yaml")["cases"]
I18N = {lang: json.load(open(ROOT / f"config/i18n/{lang}.json", encoding="utf-8")) for lang in ("en", "bn")}
ALPHA = 0.05
MULT = CFG["interval"]["multiplier"]


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    return sha256_bytes(p.read_bytes())


def clean(o):
    """JSON-safe: numpy → python; NaN/inf → None."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return f if math.isfinite(f) else None
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    return o


def write_json(rel, obj):
    p = EX / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(clean(obj), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return p


def gz(b: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as f:
        f.write(b)
    return buf.getvalue()


def fpath(region_id):
    return region_id.replace(":", "__")


CONFIG_SHA = sha256_file(ROOT / "config/analysis.yaml")

# Variables that may get a verdict (D1): the configured list plus every variable marked analysed or sensitivity in
# config/variables.yaml, so a new dataset is switched on there and config/analysis.yaml stays untouched.
BASE_VARIABLES = list(CFG["domain"]["variables"])     # the golden cases are fixed to these
for _v in VARS.values():
    if _v.get("status") in ("analysed", "sensitivity") and _v["id"] not in CFG["domain"]["variables"]:
        CFG["domain"]["variables"].append(_v["id"])
# An analysed variable may name its sensitivity variable (config/variables.yaml, key "sensitivity"): {"rain": "rain_imerg"}.
SENS = {v["id"]: v["sensitivity"] for v in VARS.values() if v.get("sensitivity")}
# The simulated methods tables depend only on these settings; they are tied to this key, not to the whole file.
SIM_KEY = hashlib.sha256(json.dumps({"interval": CFG["interval"], "ar1": CFG["ar1"], "methods_tables": CFG["methods_tables"],
                                     "domain": {k: v for k, v in CFG["domain"].items() if k != "variables"}},
                                    sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()

# ============================================================================ 1. methods tables (reduced reps)
REPS = 120 if QUICK else 300
LREPS = 60 if QUICK else 150


def calibration_tables():
    mt = CFG["methods_tables"]
    rows = []
    for n in mt["calibration_n"]:
        t = np.arange(n, dtype=float) + 1980
        for phi in mt["calibration_phi"]:
            rng = R.rng_for(f"calibration|{n}|{phi}|")
            fa = 0
            for _ in range(REPS):
                fa += R.mk_ar1(t, R.ar1(rng, n, phi))["p"] < ALPHA
            rows.append({"n": n, "phi": phi, "reps": REPS, "falseAlarmPct": round(100 * fa / REPS, 2),
                         "passDomainPct": None, "falseAlarmAmongPassPct": None})
    return rows


def leftover_table():
    mt = CFG["methods_tables"]
    return R.simulate_leftover_table(mt["leftover_n"], CFG["domain"]["leftover"]["m_eff_steps"], mt["calibration_phi"], LREPS)


def domain_pass_rates(cal, tables):
    """Fill passDomainPct and falseAlarmAmongPassPct (single series: m_eff = 1)."""
    maxpct = CFG["domain"]["max_false_alarm_pct"]
    for row in cal:
        n, phi = row["n"], row["phi"]
        if n < CFG["domain"]["min_years_verdict"]:
            row["passDomainPct"] = 0.0
            continue
        t = np.arange(n, dtype=float) + 1980
        rng = R.rng_for(f"calibration|{n}|{phi}|")
        passed = fa = 0
        pmax = L.phi_max_for(n, cal, maxpct)
        for _ in range(REPS):
            x = R.ar1(rng, n, phi)
            r = R.mk_ar1(t, x)
            lo = R.leftover_stat(t, x[None, :])
            crit = R.leftover_critical(n, 1, lo["phiCells"], tables)
            if r["phi"] <= pmax + 1e-12 and lo["stat"] <= crit:
                passed += 1
                fa += r["p"] < ALPHA
        row["passDomainPct"] = round(100 * passed / REPS, 2)
        row["falseAlarmAmongPassPct"] = round(100 * fa / passed, 2) if passed else None
    return cal


def methods_tables(prereg_sha, manifest_sha, families):
    cal = calibration_tables()
    lct = leftover_table()
    cal = domain_pass_rates(cal, lct)
    maxpct = CFG["domain"]["max_false_alarm_pct"]
    phimax = [{"n": n, "phiMax": L.phi_max_for(n, cal, maxpct)} for n in CFG["methods_tables"]["calibration_n"]]
    extra = []
    for n in (25, 46):
        t = np.arange(n, dtype=float) + 1980
        rng = R.rng_for(f"ties|{n}||")
        fa = sum(R.mk_ar1(t, np.round(R.ar1(rng, n, 0.3), 1))["p"] < ALPHA for _ in range(REPS))
        extra.append({"kind": "ties", "n": n, "reps": REPS, "falseAlarmPct": round(100 * fa / REPS, 2)})
        rng = R.rng_for(f"growing_spread|{n}||")
        sd = np.linspace(0.5, 1.5, n)
        fa = sum(R.mk_ar1(t, sd * rng.normal(size=n))["p"] < ALPHA for _ in range(REPS))
        extra.append({"kind": "growing_spread", "n": n, "reps": REPS, "falseAlarmPct": round(100 * fa / REPS, 2)})
    stress = []
    for fam in ("mixed_ar1_0.1_0.9", "ar2_0.15_0.65"):
        for n in (25, 46):
            t = np.arange(n, dtype=float) + 1980
            for m in (1, 5, 20):
                rng = R.rng_for(f"stress|{n}|{fam}|{m}")
                fa = fa_after = 0
                reps = max(40, REPS // 3)
                for _ in range(reps):
                    if fam.startswith("mixed"):
                        cells = np.array([R.ar1(rng, n, 0.1) + R.ar1(rng, n, 0.9) for _ in range(m)])
                    else:
                        cells = np.array([R.ar2(rng, n, 0.15, 0.65) for _ in range(m)])
                    x = cells.mean(axis=0)
                    r = R.mk_ar1(t, x)
                    sig = r["p"] < ALPHA
                    fa += sig
                    lo = R.leftover_stat(t, cells)
                    crit = R.leftover_critical(n, lo["mEff"], lo["phiCells"], lct)
                    ok = r["phi"] <= L.phi_max_for(n, cal, maxpct) + 1e-12 and lo["stat"] <= crit
                    fa_after += sig and ok
                stress.append({"family": fam, "n": n, "mEff": m, "reps": reps, "falseAlarmPct": round(100 * fa / reps, 2),
                               "falseAlarmAfterDomainPct": round(100 * fa_after / reps, 2)})
    coverage = []
    for n in CFG["methods_tables"]["coverage_n"]:
        t = np.arange(n, dtype=float) + 1980
        for phi in CFG["methods_tables"]["coverage_phi"]:
            for mult in (1.96, 2.25):
                rng = R.rng_for(f"coverage|{n}|{phi}|")
                hit = 0
                for _ in range(REPS):
                    x = 0.02 * (t - t[0]) + R.ar1(rng, n, phi)
                    r = R.mk_ar1(t, x, mult)
                    hit += r["ciLow"] <= 0.02 <= r["ciHigh"]
                coverage.append({"n": n, "phi": phi, "multiplier": mult, "reps": REPS, "coveragePct": round(100 * hit / REPS, 2)})
    power = []
    preps = max(40, REPS // 3)
    for n in CFG["methods_tables"]["power_n"]:
        t = np.arange(n, dtype=float) + 1980
        for phi in CFG["methods_tables"]["power_phi"]:
            for eff in CFG["methods_tables"]["power_effects_sd_per_year"]:
                rng = R.rng_for(f"power|{n}|{phi}|{eff}")
                hit = sum(R.mk_ar1(t, eff * (t - t[0]) + R.ar1(rng, n, phi))["p"] < ALPHA for _ in range(preps))
                power.append({"n": n, "phi": phi, "effectSdPerYear": eff, "reps": preps, "powerPct": round(100 * hit / preps, 2)})
    contrast = []
    n = 30
    t = np.arange(n, dtype=float) + 1980
    for case, ta, tb, rho in (("null_rho0", 0, 0, 0.0), ("null_rho0.5", 0, 0, 0.5), ("null_rho0.9", 0, 0, 0.9),
                              ("known_A+0.03_B-0.01", 0.03, -0.01, 0.5), ("shared_stationary_driver", 0.03, -0.03, 0.9)):
        rng = R.rng_for(f"contrast|{n}|{case}|")
        rd = so = 0
        reps = max(40, REPS // 3)
        for _ in range(reps):
            common = R.ar1(rng, n, 0.5)
            a = ta * (t - t[0]) + math.sqrt(rho) * common + math.sqrt(1 - rho) * R.ar1(rng, n, 0.3)
            b = tb * (t - t[0]) + math.sqrt(rho) * common + math.sqrt(1 - rho) * R.ar1(rng, n, 0.3)
            ra, rb, rdd = R.mk_ar1(t, a), R.mk_ar1(t, b), R.mk_ar1(t, a - b)
            rd += rdd["p"] < ALPHA
            so += (ra["p"] < ALPHA and rb["p"] < ALPHA and np.sign(ra["slope"]) != np.sign(rb["slope"]))
        contrast.append({"case": case, "reps": reps, "ratesDifferPct": round(100 * rd / reps, 2), "supportedOppositePct": round(100 * so / reps, 2)})
    return {"schema": "casefile/methods@3", "synthetic": SYNTH, "created": CREATED, "engine": ENGINE,
            "seedRule": "seed = first 8 bytes (little-endian) of SHA-256('<table>|<n>|<phi>|<extra>')",
            "note": (f"EXAMPLE ONLY: reduced repetitions ({REPS} per row, {LREPS} for critical values). The engine builds full tables (03_SCIENCE §9)."
                     if REPS < CFG["methods_tables"]["reps"] else f"{REPS} repetitions per row, {LREPS} per critical value (03_SCIENCE §9)."),
            "calibration": cal, "extraRows": extra, "phiMax": phimax, "stress": stress, "coverage": coverage, "power": power,
            "leftoverCritical": lct, "contrast": contrast,
            "mapNull": [],
            "golden": {"suite": "examples/golden", "total": 0, "passed": 0},
            "families": {"confirmatory": families["confirmatory"], "secondary": families["secondary"], "alpha": ALPHA, "secondaryQ": ALPHA},
            "prereg": {"sha256": prereg_sha, "commit": None}, "inputManifest": {"sha256": manifest_sha}}


# ============================================================================ 2. grids and synthetic regions
MERRA2 = {"id": "merra2_native", "lat0": -90.0, "dlat": 0.5, "nlat": 361, "lon0": -180.0, "dlon": 0.625, "nlon": 576}
IMERG = {"id": "imerg_native", "lat0": -89.95, "dlat": 0.1, "nlat": 1800, "lon0": -179.95, "dlon": 0.1, "nlon": 3600}
ONE = {"id": "global_1deg", "lat0": 89.5, "dlat": -1.0, "nlat": 180, "lon0": -179.5, "dlon": 1.0, "nlon": 360}
RE = 6371.0088


def edges(g, axis):
    if axis == "lat":
        c = g["lat0"] + g["dlat"] * np.arange(g["nlat"])
        h = abs(g["dlat"]) / 2
        return np.clip(c - h, -90, 90), np.clip(c + h, -90, 90)
    c = g["lon0"] + g["dlon"] * np.arange(g["nlon"])
    h = g["dlon"] / 2
    return c - h, c + h


def box_weights(bbox, g):
    """Exact fractional overlap of a box with each cell (overlap in sin(lat) × overlap in lon; 02_DATA §7.3)."""
    w, s, e, n = bbox
    la, lb = edges(g, "lat")
    lo_a, lo_b = np.minimum(la, lb), np.maximum(la, lb)
    ov_lat = np.clip(np.minimum(lo_b, n), None, None) - np.maximum(lo_a, s)
    frac_lat = np.where(ov_lat > 0, (np.sin(np.radians(np.minimum(lo_b, n))) - np.sin(np.radians(np.maximum(lo_a, s)))) /
                        (np.sin(np.radians(lo_b)) - np.sin(np.radians(lo_a))), 0.0)
    oa, ob = edges(g, "lon")
    ov_lon = np.minimum(ob, e) - np.maximum(oa, w)
    frac_lon = np.where(ov_lon > 0, ov_lon / g["dlon"], 0.0)
    cells = []
    area = 0.0
    for r in np.where(frac_lat > 0)[0]:
        cell_area = RE ** 2 * math.radians(g["dlon"]) * (math.sin(math.radians(lo_b[r])) - math.sin(math.radians(lo_a[r])))
        for c in np.where(frac_lon > 0)[0]:
            f = round(float(frac_lat[r] * frac_lon[c]), 4)
            if f > 0:
                cells.append([int(r), int(c), f])
                area += f * cell_area
    return cells, area


REGIONS = [
    {"id": "synthetic:north_plain", "role": "home", "bbox": [1.0, 4.0, 4.0, 6.5], "name": {"en": "North Plain (example)", "bn": "উত্তর সমভূমি (উদাহরণ)"},
     "in": {"en": "in North Plain", "bn": "উত্তর সমভূমিতে"}},
    {"id": "synthetic:south_delta", "role": "comparison", "bbox": [1.0, 1.0, 4.0, 3.5], "name": {"en": "South Delta (example)", "bn": "দক্ষিণ ব-দ্বীপ (উদাহরণ)"},
     "in": {"en": "in South Delta", "bn": "দক্ষিণ ব-দ্বীপে"}},
    {"id": "synthetic:east_coast", "role": "division", "bbox": [4.5, 1.5, 6.5, 4.5], "name": {"en": "East Coast (example)", "bn": "পূর্ব উপকূল (উদাহরণ)"},
     "in": {"en": "on the East Coast", "bn": "পূর্ব উপকূলে"}},
    {"id": "synthetic:hill_rim", "role": "division", "bbox": [6.6, 5.0, 7.4, 5.8], "name": {"en": "Hill Rim (example)", "bn": "পাহাড়ি প্রান্ত (উদাহরণ)"},
     "in": {"en": "on the Hill Rim", "bn": "পাহাড়ি প্রান্তে"}},
]
LEAD_PAIR = "pair_north_vs_delta"
EXPLORATION_PAIR = "pair_north_vs_east"
SECONDARY = ["MAM", "JJAS"]
SEASONS = ["ANN"] + SECONDARY
WIN = {"air_temp": (1980, 2025), "rain": (1980, 2025), "rain_imerg": (1998, 2024)}
THRESH = {"air_temp": 0.1, "rain": 40.0, "rain_imerg": 40.0}


def spill_share(cw, g):
    """Part of the region mean that describes area outside the region: sum a f (1 - f) / sum a f (02_DATA §7.3)."""
    la, lb = edges(g, "lat")
    num = den = 0.0
    for r, c, f in cw:
        a = math.sin(math.radians(max(la[r], lb[r]))) - math.sin(math.radians(min(la[r], lb[r])))
        num += a * f * (1 - f); den += a * f
    return round(num / den, 4) if den > 0 else 1.0


def pair_split(masks, a, b, grid_list=None):
    """Disjoint split for a contrast (02_DATA §7.4): a cell touched by both regions goes to the one holding the larger
    fraction; a tie drops it from both. Each side must keep the minimum effective cells on every grid.
    masks[(region id, grid id)] = (cells [[row, col, fraction], …], area_km2, effective_cells). grid_list: the grid
    definitions to check (default: MERRA-2 and IMERG); pass a new dataset's grid as well when one is added."""
    grids, ok_all = {}, True
    for g in (grid_list or (MERRA2, IMERG)):
        ca = {(r, c): f for r, c, f in masks[(a, g["id"])][0]}
        cb = {(r, c): f for r, c, f in masks[(b, g["id"])][0]}
        shared = set(ca) & set(cb)
        ea = sum(f for k, f in ca.items() if k not in shared or f > cb[k])
        eb = sum(f for k, f in cb.items() if k not in shared or f > ca[k])
        ok = ea >= CFG["support"]["min_native_cells"] and eb >= CFG["support"]["min_native_cells"]
        grids[g["id"]] = {"sharedCells": len(shared), "effectiveCellsA": round(ea, 4), "effectiveCellsB": round(eb, 4), "passes": bool(ok)}
        ok_all = ok_all and ok
    return {"rule": "disjoint_cells_larger_fraction", "grids": grids, "passes": bool(ok_all)}


def build_regions():
    idx_regions, masks = [], {}
    for reg in REGIONS:
        support, cells = {}, {}
        for g in (MERRA2, IMERG):
            cw, area = box_weights(reg["bbox"], g)
            eff = round(sum(c[2] for c in cw), 4)
            masks[(reg["id"], g["id"])] = (cw, area, eff)
            spill = spill_share(cw, g)
            support[g["id"]] = {"effectiveCells": eff, "spillShare": spill,
                                "passes": bool(eff >= CFG["support"]["min_native_cells"] and spill <= CFG["support"]["max_spill_share"])}
            cells[g["id"]] = f"regions/cells/{g['id']}/{fpath(reg['id'])}.json"
        in_set = all(v["passes"] for v in support.values())
        b = reg["bbox"]
        area = masks[(reg["id"], "merra2_native")][1]
        pairs = []
        if reg["id"] in ("synthetic:north_plain", "synthetic:south_delta"):
            pairs.append(LEAD_PAIR)
        if reg["id"] in ("synthetic:north_plain", "synthetic:east_coast"):
            pairs.append(EXPLORATION_PAIR)
        idx_regions.append({"id": reg["id"], "kind": "synthetic", "role": reg["role"], "name": reg["name"], "in": reg["in"],
                            "bbox": b, "centroid": [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], "areaKm2": round(area, 1),
                            "boundary": {"source": "synthetic box", "licence": "synthetic example"}, "inSet": in_set,
                            "support": support, "cells": cells if in_set else {}, "geom": None, "pairs": pairs})
    for (rid, gid), (cw, area, eff) in masks.items():
        write_json(f"regions/cells/{gid}/{fpath(rid)}.json", {"schema": "casefile/mask@3", "region": rid, "grid": gid, "cells": cw,
                                                               "areaKm2": round(area, 1), "effectiveCells": eff, "synthetic": True})
    pairs = [{"id": LEAD_PAIR, "a": "synthetic:north_plain", "b": "synthetic:south_delta", "lead": True, "preRegistered": True,
              "question": {"en": "Has rain changed differently in North Plain and South Delta? (example)", "bn": "উত্তর সমভূমি ও দক্ষিণ ব-দ্বীপে কি বৃষ্টি ভিন্নভাবে বদলেছে? (উদাহরণ)"}},
             {"id": EXPLORATION_PAIR, "a": "synthetic:north_plain", "b": "synthetic:east_coast", "lead": False, "preRegistered": False,
              "question": {"en": "Did North Plain and East Coast change differently? (example, not pre-registered)", "bn": "উত্তর সমভূমি ও পূর্ব উপকূল কি ভিন্নভাবে বদলেছে? (উদাহরণ, আগে নিবন্ধিত নয়)"}}]
    for pr in pairs:
        pr["split"] = pair_split(masks, pr["a"], pr["b"])
    index = {"schema": "casefile/region_index@3", "buildId": BUILD_ID, "synthetic": True, "grids": [MERRA2, IMERG, ONE],
             "minNativeCells": CFG["support"]["min_native_cells"], "maxSpillShare": CFG["support"]["max_spill_share"],
             "cellIdPattern": "cell:<row>_<col>", "regions": idx_regions, "pairs": pairs}
    write_json("regions/index.json", index)
    return index, masks


# ============================================================================ 3. synthetic monthly data → series
CLIM_T = np.array([24.5, 25.5, 27.0, 28.0, 28.5, 28.0, 27.5, 27.5, 27.5, 27.0, 26.0, 25.0])
CLIM_R = np.array([0.3, 0.6, 1.5, 4.0, 9.0, 14.0, 15.0, 13.0, 10.0, 5.0, 1.0, 0.3])        # mm/day
SPEC = {   # per region: trends per year (°C, fraction of mean rain per year), memory, special cases
    "synthetic:north_plain": {"t_trend": 0.021, "r_trend": -0.0022, "t_mam_extra": 0.012, "phi": 0.3},
    "synthetic:south_delta": {"t_trend": 0.021, "r_trend": 0.0026, "t_mam_extra": 0.0, "phi": 0.3},
    "synthetic:east_coast": {"t_trend": 0.022, "r_trend": 0.0004, "t_mam_extra": 0.0, "phi": 0.3},
    "synthetic:hill_rim": {"t_trend": 0.02, "r_trend": 0.0, "t_mam_extra": 0.0, "phi": 0.3},
}


def synth_cells(rid, variable, ncell, first, last):
    """Monthly values for each native cell: climatology + trend + shared AR(1) yearly anomaly + cell noise."""
    sp = SPEC[rid]
    rng = R.rng_for(f"synthetic|{rid}|{variable}|")
    years = np.arange(first, last + 1)
    ny = len(years)
    common = R.ar1(R.rng_for(f"synthetic|common|{variable.replace('rain_imerg', 'rain')}|"), 2025 - 1980 + 1, sp["phi"])[first - 1980:last - 1980 + 1]
    shared_year = 0.8 * common + 0.6 * R.ar1(rng, ny, sp["phi"])     # a regional signal shared by all regions, plus a local part
    out = np.zeros((ncell, ny * 12))
    for c in range(ncell):
        cell_year = R.ar1(rng, ny, sp["phi"])
        for k, y in enumerate(years):
            dt = y - 1980
            for m in range(12):
                if variable == "air_temp":
                    extra = sp["t_mam_extra"] * dt if m in (2, 3, 4) else 0.0
                    v = CLIM_T[m] + sp["t_trend"] * dt + extra + 0.22 * shared_year[k] + 0.08 * cell_year[k] + 0.3 * rng.normal()
                else:
                    factor = 1 + sp["r_trend"] * dt * (1.6 if m in (5, 6, 7, 8) else 0.4)
                    v = max(0.0, CLIM_R[m] * factor * (1 + 0.07 * shared_year[k] + 0.04 * cell_year[k] + 0.15 * rng.normal()))
                out[c, k * 12 + m] = v
    return years, out


def region_arrays(rid, variable, masks):
    """Synthetic monthly values: the region mean and every native cell."""
    grid = "imerg_native" if variable == "rain_imerg" else "merra2_native"
    cw, area, eff = masks[(rid, grid)]
    first, last = (1998, 2025) if variable == "rain_imerg" else (1980, 2025)
    years, cells = synth_cells(rid, variable, len(cw), first, last)
    if variable == "rain_imerg":
        cells = cells[:, : (2025 - 1998) * 12 + 9]            # the Final record ends Sep 2025
    lat_area = np.array([math.cos(math.radians((MERRA2 if grid == "merra2_native" else IMERG)["lat0"] + r * (MERRA2 if grid == "merra2_native" else IMERG)["dlat"])) for r, _, _ in cw])
    w = np.array([c[2] for c in cw]) * lat_area
    monthly = (w[:, None] * cells).sum(axis=0) / w.sum()
    return {"first": first, "monthly": monthly, "cells": cells, "area": area, "eff": eff, "grid": grid}


def _aslist(v):
    return [None if not np.isfinite(x) else float(x) for x in v]


def seasonal_block(variable, first, monthly, cells, seasons, last):
    """Annual and seasonal values of a region's monthly series, and the same for each cell (03 §2.2)."""
    rule = VARS[variable]["rule"]
    out, cell_seasons = {}, {}
    for s in seasons:
        a = L.annual_values(f"{first}-01", _aslist(monthly), s, rule, first, last)
        out[s] = {"years": a["years"], "values": a["values"], "monthsUsed": a["monthsUsed"], "coverage": None}
        cs = []
        for c in range(cells.shape[0]):
            ac = L.annual_values(f"{first}-01", _aslist(cells[c]), s, rule, first, last)
            cs.append(ac["values"])
        cell_seasons[s] = (a["years"], np.array([[np.nan if v is None else v for v in row] for row in cs]).reshape(len(cs), len(a["years"])))
    return out, cell_seasons


def region_series(rid, variable, masks):
    a = region_arrays(rid, variable, masks)
    w0, w1 = WIN[variable]
    seasons, cell_seasons = seasonal_block(variable, a["first"], a["monthly"], a["cells"], SEASONS, w1 if variable != "rain_imerg" else 2024)
    return {"monthly": a["monthly"], "first": a["first"], "seasons": seasons, "cells": cell_seasons, "area": a["area"], "eff": a["eff"], "grid": a["grid"]}


def prov_items(variable):
    src = SOURCES[VARS[variable]["source"]]
    if SYNTH or MANIFEST is None:
        return [{"product": src["name"], "shortName": src["short_name"], "version": src["version"], "doi": src.get("doi"),
                 "route": "synthetic", "granules": None, "accessed": None, "note": "SYNTHETIC example values; not real measurements"}]
    prod = next((p for p in MANIFEST.get("products", []) if p.get("source") == src["id"]), {})
    return [{"product": src["name"], "shortName": prod.get("shortName", src["short_name"]), "version": prod.get("version", src["version"]),
             "doi": prod.get("doi", src.get("doi")), "route": (prod.get("query") or {}).get("provider"), "granules": prod.get("granuleCount"),
             "accessed": MANIFEST.get("created"), "note": None}]


def provenance(variable, prereg_sha, manifest_sha):
    return {"items": prov_items(variable), "inputManifestSha256": manifest_sha, "preregSha256": prereg_sha,
            "configSha256": CONFIG_SHA, "engine": ENGINE, "buildId": BUILD_ID, "created": CREATED}

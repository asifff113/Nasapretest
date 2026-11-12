# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Builds every result file from prepared inputs (the verdict layer and the results build)."""
from __future__ import annotations

import hashlib
import json
import math

import numpy as np

from . import base as M
from . import layer as L
from . import stats as R

CFG, VARS, I18N, ALPHA = M.CFG, M.VARS, M.I18N, M.ALPHA


# ============================================================================ pre-registration (synthetic, filled)
def build_prereg(index, manifest_sha, regions_sha):
    reg = {r["id"]: r for r in index["regions"]}
    pr = {
        "schema": "casefile/prereg@3", "status": "committed", "commit": None,
        "signed_by": ["A (example)", "B (example)", "C (example)"],
        "hashes": {"analysis_yaml_sha256": M.CONFIG_SHA, "input_manifest_sha256": manifest_sha, "regions_support_sha256": regions_sha},
        "alpha": {"confirmatory": ALPHA, "secondary_q": ALPHA, "map_q": 0.1},
        "variables": [
            {"id": "air_temp", "product": "MERRA-2 M2TMNXSLV 5.12.4, T2M (synthetic)", "role": "analysed", "main_window": {"first": 1980, "last": 2025},
             "practical_threshold": {"units": "°C per decade", "default": M.THRESH["air_temp"], "by_season": {}, "reason": "Example threshold for synthetic data."}},
            {"id": "rain", "product": "MERRA-2 PRECTOTCORR (synthetic)", "role": "analysed", "main_window": {"first": 1980, "last": 2025},
             "practical_threshold": {"units": "mm per decade", "default": M.THRESH["rain"], "by_season": {"JJAS": 30.0}, "reason": "Example threshold for synthetic data."}},
            {"id": "rain_imerg", "product": "GPM IMERG V07 Final monthly (synthetic)", "role": "sensitivity", "main_window": {"first": 1998, "last": 2024},
             "practical_threshold": {"units": "mm per decade", "default": M.THRESH["rain_imerg"], "by_season": {"JJAS": 30.0}, "reason": "Same as rain."}},
        ],
        "seasons": {"main": "ANN", "secondary": M.SECONDARY, "djf_starts_one_year_later": True},
        "regions": {"support_rule": {"min_native_cells": CFG["support"]["min_native_cells"]},
                    "set": [{"id": rid, "role": reg[rid]["role"],
                             "effective_native_cells": {g: reg[rid]["support"][g]["effectiveCells"] for g in reg[rid]["support"]}}
                            for rid in ("synthetic:north_plain", "synthetic:south_delta", "synthetic:east_coast")]},
        "pairs": [{"id": M.LEAD_PAIR, "a": "synthetic:north_plain", "b": "synthetic:south_delta", "lead": True,
                   "question": {"en": "Has rain changed differently in North Plain and South Delta? (example)",
                                "bn": "উত্তর সমভূমি ও দক্ষিণ ব-দ্বীপে কি বৃষ্টি ভিন্নভাবে বদলেছে? (উদাহরণ)"}}],
        "windows": {"alternatives": CFG["robustness"]["windows"]},
        "headline_cases": [{"kind": "contrast", "pair": M.LEAD_PAIR, "variable": "rain", "season": "ANN"},
                           {"kind": "contrast", "pair": M.LEAD_PAIR, "variable": "air_temp", "season": "ANN"}],
        "family_preview": {"confirmatory": [], "secondary": []},
        "amendments": [], "synthetic": True,
    }
    fam = family_keys(pr)
    pr["family_preview"] = {"confirmatory": fam["confirmatory"], "secondary": fam["secondary"]}
    body = json.dumps(pr, ensure_ascii=False, sort_keys=True).encode()
    pr["sha256"] = hashlib.sha256(body).hexdigest()
    return pr


def key(variable, target, season, window="main"):
    return f"{variable} | {target} | {season} | {window}"


def family_keys(pr):
    conf, sec = [], []
    analysed = [v["id"] for v in pr["variables"] if v["role"] == "analysed"]
    for p in pr["pairs"]:
        for v in analysed:
            for tgt in (p["a"], p["b"], f"{p['a']}-minus-{p['b']}"):
                k = key(v, tgt, "ANN")
                if k not in conf:
                    conf.append(k)
                for s in pr["seasons"]["secondary"]:
                    ks = key(v, tgt, s)
                    if ks not in sec:
                        sec.append(ks)
    return {"confirmatory": conf, "secondary": sec}


# ============================================================================ text
def T(lang):
    return I18N[lang]


def var_names(variable, lang):
    v = VARS[variable]
    return v["name"][lang], v["name_mid"][lang]


def fmt_rate(x, d, units, lang):
    return L.num(x, d, units, T(lang))


def trend_text(v, lang, region_in, variable):
    s = T(lang)
    st = v["stats"]
    ch = st["change"]
    units = ch["units"]
    d = R.decimals_for(ch["ratePerDecade"])
    rate = fmt_rate(ch["ratePerDecade"], d, units, lang)
    lo = fmt_rate(ch["rateLowPerDecade"], d, units, lang)
    hi = fmt_rate(ch["rateHighPerDecade"], d, units, lang)
    dt = R.decimals_for(ch["total"])
    total = L.num(abs(ch["total"]), dt, units, s, signed=False)
    total_signed = L.num(ch["total"], dt, units, s)
    first, last = v["series_first_used"], v["series_last_used"]
    Vn, vn = var_names(variable, lang)
    sp = L.season_phrase(VARS[variable]["rule"], v["season"], s)
    P = {"Variable": Vn, "variable": vn, "in_region": region_in, "season_phrase": sp, "from": first, "to": last,
         "rate": rate, "lo": lo, "hi": hi, "total": total, "total_signed": total_signed}
    head, how_much, how_sure, checks, practical, overturn, notes = "", [], [], [], [], [], []
    if v["status"] == "verdict":
        if v["grade"] in ("strong", "supported") and ch["ratePerDecade"] != 0:
            head = R.fill(s["verdict"]["headline"]["up" if ch["ratePerDecade"] > 0 else "down"], P)
        else:
            head = R.fill(s["verdict"]["headline"]["cant_tell_yet"], P)
    else:
        rp = {"rate": rate, "lo": lo, "hi": hi, "n": st["n"], "from": first, "to": last,
              "missing": len(v["robustness"]["gaps"]["missingYears"]), "requested": len(v["series"]["years"]),
              "years": ", ".join(str(y) for y in v["robustness"]["gaps"]["missingYears"][:5]),
              "label": next((b["label"][lang] for b in v["robustness"]["breaks"] if b["status"] == "step"), "")}
        tmpl = s["reason"]["sensitivity" if (v["reason"] == "exploration" and v["family"] == "sensitivity") else v["reason"]]
        head = R.fill(tmpl, {k: val for k, val in rp.items() if "{" + k + "}" in tmpl})
    if v["status"] == "verdict" or v["reason"] == "exploration":
        how_much.append(R.fill(s["verdict"]["rate"], P))
        if ch["percent"] is not None:
            dp = R.decimals_for(ch["percent"])
            how_much.append(R.fill(s["verdict"]["total_pct"], {**P, "pct": R.signed(ch["percent"], dp) + "%"}))
        else:
            how_much.append(R.fill(s["verdict"]["total"], P))
        if ch["snr"] is not None:
            how_much.append(s["verdict"]["snr"]["small" if ch["snr"] < 1 else ("similar" if ch["snr"] <= 2 else "large")])
        checks = check_lines(v, s, lang)
        pr_ = v["practical"]
        if pr_["position"] is not None:
            th = L.num(pr_["threshold"], R.decimals_for(pr_["threshold"]), units, s, signed=False)
            practical.append(R.fill(s["practical"][pr_["position"]], {"threshold": th}))
    if v["status"] == "verdict":
        fam = v["family"]
        pa = v["multiplicity"]["pAdjusted"]
        how_sure.append(R.fill(s["verdict"]["sure"][fam], {"family_size": v["multiplicity"]["familySize"], "p_adj_expr": R.p_expr(pa)}))
        how_sure.append(R.fill(s["verdict"]["sure"]["mkar1"], {"p_expr": R.p_expr(st["mkAr1"]["p"])}))
        key_ = "above" if pa >= ALPHA else ("doubts" if v["grade"] == "cant_tell_yet" else "below")
        how_sure.append(R.fill(s["verdict"]["sure"][key_], {"alpha": R.fixed(ALPHA, 2), "n_doubts": len(v["doubts"])}
                               if key_ == "doubts" else {"alpha": R.fixed(ALPHA, 2)}))
        overturn = overturn_lines(v, s, lang, units)
        if fam == "secondary":
            notes.append(s["verdict"]["secondary_note"])
    if VARS[variable]["kind"] == "model":
        notes.append(s["checks"]["model_note"])
    if v["family"] == "sensitivity":
        notes.append(s["sensitivity"]["lineage"])
    block = {"headline": head, "howMuch": how_much, "howSure": how_sure, "checks": checks, "practical": practical,
             "overturn": overturn, "notes": notes}
    if lang == "bn":
        block = {k: (R.to_bn(x) if isinstance(x, str) else [R.to_bn(y) for y in x]) for k, x in block.items()}
    return block


def check_lines(v, s, lang):
    rb = v["robustness"]
    c = s["checks"]
    out = [c["gaps"]["pass"]] if not rb["gaps"]["missingYears"] else []
    if rb["coverage"]["status"] == "pass":
        out.append(c["coverage"]["pass"])
    elif rb["coverage"]["status"] == "doubt":
        out.append(R.fill(c["coverage"]["doubt"], {"cmin": R.fixed(rb["coverage"]["cmin"], 2), "cmax": R.fixed(rb["coverage"]["cmax"], 2)}))
    if not rb["breaks"]:
        out.append(c["breaks"]["none"])
    for b in rb["breaks"]:
        out.append(R.fill(c["breaks"][b["status"]], {"year": b["year"], "label": b["label"][lang]}))
    lo = rb["loo"]
    if lo["status"] in ("pass", "doubt", "note"):
        out.append(c["loo"][lo["status"]] if lo["status"] == "pass" else R.fill(c["loo"][lo["status"]], {"year": lo["year"]}))
    w = rb["windows"]
    if w["status"] in ("pass", "doubt"):
        out.append(R.fill(c["windows"][w["status"]], {"agree": w["agree"], "ran": w["ran"]}))
    if rb["pettitt"] is not None:
        out.append(R.fill(c["pettitt"]["flag"], {"year": rb["pettitt"]["year"]}) if rb["pettitt"]["flagged"] else c["pettitt"]["none"])
    return out


def overturn_lines(v, s, lang, units):
    o = s["overturn"]
    rb = v["robustness"]
    out_ids, out = [], []
    dated = [b for b in rb["breaks"] if b["year"] is not None]
    if dated:
        out_ids.append("O1"); out.append(R.fill(o["O1"], {"year": dated[0]["year"], "label": dated[0]["label"][lang]}))
    if rb["loo"]["status"] != "skip" and len(out) < 3:
        sig = v["stats"]["mkAr1"]["p"] < ALPHA
        p = rb["loo"]["pMax"] if sig else rb["loo"]["pMin"]
        out_ids.append("O2"); out.append(R.fill(o["O2"], {"year": rb["loo"]["year"], "p_expr": R.p_expr(p)}))
    ran = [i for i in rb["windows"]["items"] if i["ran"]]
    if ran and len(out) < 3:
        sign = 1 if v["stats"]["change"]["ratePerDecade"] >= 0 else -1
        weakest = min(ran, key=lambda i: sign * i["ratePerDecade"])
        d = R.decimals_for(weakest["ratePerDecade"])
        out_ids.append("O3"); out.append(R.fill(o["O3"], {"from": weakest["first"], "to": weakest["last"], "rate": L.num(weakest["ratePerDecade"], d, units, s)}))
    if v.get("sens_same") is not None and len(out) < 3:
        out_ids.append("O5"); out.append(R.fill(o["O5"], {"direction": o["O5_same"] if v["sens_same"] else o["O5_other"], "from": 1998, "to": 2024}))
    if len(out) < 3:
        lo = v["stats"]["leftover"]
        out_ids.append("O4"); out.append(R.fill(o["O4"], {"finding": o["O4_none"] if (lo is None or lo["passed"]) else o["O4_some"]}))
    if v["practical"]["position"] is not None and len(out) < 3:
        th = L.num(v["practical"]["threshold"], R.decimals_for(v["practical"]["threshold"]), units, s, signed=False)
        out_ids.append("O6"); out.append(R.fill(o["O6"], {"threshold": th, "includes": o["O6_excludes"] if v["practical"]["position"] == "exceeds" else o["O6_includes"]}))
    if v["grade"] == "cant_tell_yet" and len(out) < 3:
        out_ids.append("O7"); out.append(o["O7"])
    v["overturn"] = out_ids[:3]
    return out[:3]


# ============================================================================ results
def window_values(sea, first, last):
    lookup = dict(zip(sea["years"], sea["values"]))
    ys = list(range(first, last + 1))
    return ys, [lookup.get(y) for y in ys]


def cells_window(cells_entry, first, last):
    years, arr = cells_entry
    idx = [years.index(y) for y in range(first, last + 1)]
    return arr[:, idx]


def analyse(variable, season, ys, vals, cells, tables, prereg_seasons):
    st = L.core_stats(ys, vals, cells=cells, cfg=CFG, tables=tables)
    st["change"]["units"] = VARS[variable]["units"]["aggregated"]
    if VARS[variable]["ratio_scale"]:
        first = [y for y, x in zip(ys, vals) if x is not None][0]
        base = st["sen"]["intercept"] + st["sen"]["slopePerYear"] * first
        st["change"]["baseline"] = base
        st["change"]["percent"] = 100 * st["change"]["total"] / base if base > 0 else None
    dom, reason, missing = L.domain_checks(variable, season, ys, vals, st, CFG, tables, prereg_seasons)
    return st, dom, reason, missing


def chart_block(rec, show_interval):
    """What the site draws (04_UI §6.1): display values, the Sen line and the range band, all computed here so the
    browser does no arithmetic beyond layout. Contrasts plot d as departures from its window mean (03 §2.5)."""
    ys, vals = rec["series"]["years"], rec["series"]["values"]
    used = [(y, v) for y, v in zip(ys, vals) if v is not None and np.isfinite(v)]
    offset = float(np.mean([v for _, v in used])) if (rec["kind"] == "contrast" and used) else 0.0
    disp = [None if (v is None or not np.isfinite(v)) else float(v - offset) for v in vals]
    sen = rec["stats"].get("sen") or {}
    b, a = sen.get("slopePerYear"), sen.get("intercept")
    if not used or b is None or a is None:
        return {"values": disp, "offset": offset, "pivot": None, "line": None, "band": None}
    y0, y1 = used[0][0], used[-1][0]
    tm = float(np.median([y for y, _ in used]))
    xm = float(np.median([v for _, v in used])) - offset
    line = [[y0, float(a + b * y0 - offset)], [y1, float(a + b * y1 - offset)]]
    band = None
    lo, hi = sen.get("ciLowPerYear"), sen.get("ciHighPerYear")
    if show_interval and lo is not None and hi is not None:
        band = {"low": [[y0, float(xm + lo * (y0 - tm))], [y1, float(xm + lo * (y1 - tm))]],
                "high": [[y0, float(xm + hi * (y0 - tm))], [y1, float(xm + hi * (y1 - tm))]]}
    return {"values": disp, "offset": offset, "pivot": [tm, xm], "line": line, "band": band}


def finish(rec, family, method, fsize, p_adj, tables, prereg, breaks, reviews, case_key, headline, full_years, full_values, rec_first, rec_last):
    """Robustness, grade, practical; rec holds stats/domain/reason."""
    st, dom, reason = rec["stats"], rec["domain"], rec["reason"]
    ys, vals = rec["series"]["years"], rec["series"]["values"]
    first, last = rec["window"]["first"], rec["window"]["last"]
    rb = {"gaps": {"missingYears": rec["missing"]}, "coverage": {"status": "skip", "cmin": None, "cmax": None, "p": None},
          "breaks": [], "loo": {"status": "skip", "year": None, "pMax": None, "pMin": None},
          "windows": {"status": "skip", "agree": 0, "ran": 0, "items": []}, "pettitt": None}
    doubts = []
    if dom["inDomain"]:
        rb["breaks"] = L.break_notes(rec["variable"]["id"], first, last, breaks, reviews, case_key, CFG["robustness"]["break_margin_years"])
        rb["loo"] = L.loo(ys, vals, ALPHA, st["mkAr1"]["p"])
        rb["windows"] = L.alt_windows(full_years, full_values, first, last, prereg["windows"]["alternatives"], rec_first, rec_last,
                                      st["sen"]["slopePerYear"], st["mkAr1"]["p"], ALPHA, CFG["robustness"]["windows_min_years"])
        rb["coverage"] = L.coverage_check(ys, rec.get("coverage"), ALPHA, CFG["robustness"]["coverage_drift_min_range"])
        if family == "confirmatory" or headline:
            rb["pettitt"] = L.pettitt(ys, vals, CFG["robustness"]["pettitt_alpha"])
        if rb["loo"]["status"] == "doubt":
            doubts.append("loo_flip")
        if rb["windows"]["status"] == "doubt":
            doubts.append("windows_disagree")
        if rb["coverage"]["status"] == "doubt":
            doubts.append("coverage_drift")
        if any(b["status"] == "unreviewed" for b in rb["breaks"]):
            doubts.append("break_unreviewed")
        if any(b["status"] == "step" for b in rb["breaks"]):
            reason = "break_review"
    if reason is None and family in ("exploration", "sensitivity"):
        reason = "exploration"
    status = "verdict" if reason is None else "no_verdict"
    g = L.grade(p_adj, ALPHA, doubts, CFG["grade"]["strong_alpha_divisor"], CFG["grade"]["supported_max_doubts"]) if status == "verdict" else None
    var = rec["variable"]["id"]
    vp = next(x for x in prereg["variables"] if x["id"] == var)
    th = vp["practical_threshold"]["by_season"].get(rec["season"], vp["practical_threshold"]["default"])
    show_interval = status == "verdict" or reason == "exploration"
    pos = L.practical_position(st["change"]["rateLowPerDecade"], st["change"]["rateHighPerDecade"], th) if show_interval else None
    rec.update({"family": family, "multiplicity": {"method": method, "familySize": fsize, "pAdjusted": p_adj, "alpha": ALPHA},
                "status": status, "grade": g, "reason": reason, "robustness": rb, "doubts": doubts,
                "practical": {"threshold": th if show_interval else None, "units": vp["practical_threshold"]["units"], "position": pos}})
    rec["spine"] = {"status": status, "grade": g, "reason": reason,
                    "ratePerDecade": st["change"]["ratePerDecade"],
                    "rateLowPerDecade": st["change"]["rateLowPerDecade"] if show_interval else None,
                    "rateHighPerDecade": st["change"]["rateHighPerDecade"] if show_interval else None,
                    "units": st["change"]["units"], "family": family, "familySize": fsize, "inDomain": dom["inDomain"]}
    rec["chart"] = chart_block(rec, show_interval)
    return rec


def run(inp):
    """Build every result file into M.EX from prepared inputs (see bundle.load_bundle for their shape).

    inp: index (regions/index.json), series {(region, variable): arrays and seasons}, pair_series {(pair, variable): split
    series}, manifest_sha, prereg (dict with sha256), tables (methods tables), reviews (break reviews),
    map_fields {(variable, season): (years, field) or None}, states and golden (synthetic extras), record_last, build_extra.
    """
    global ALPHA
    index, series, prereg, tables = inp["index"], inp["series"], inp["prereg"], inp["tables"]
    manifest_sha, pair_series = inp["manifest_sha"], inp.get("pair_series") or {}
    regions = {r["id"]: r for r in index["regions"]}
    prereg_sha = prereg["sha256"]
    fam = family_keys(prereg)
    ALPHA = prereg["alpha"]["confirmatory"]
    WIN = {v["id"]: (int(v["main_window"]["first"]), int(v["main_window"]["last"])) for v in prereg["variables"]}
    VAR_ORDER = [v["id"] for v in prereg["variables"]]
    ANALYSED = [v["id"] for v in prereg["variables"] if v["role"] == "analysed"]
    SECONDARY = list(prereg["seasons"]["secondary"])
    SEASONS = ["ANN"] + SECONDARY
    REGION_ORDER = list(dict.fromkeys(rid for rid, _ in series))
    PRE = {p["id"] for p in prereg["pairs"]}
    SENS_VARS = {v["id"] for v in prereg["variables"] if v["role"] == "sensitivity"}
    M.write_json("prereg.json", prereg)
    M.write_json("methods/tables.json", tables)

    def pair_values(pid, var, season, ra, rb_):
        """The two sides of a difference: from the pair's disjoint-cell series when the pipeline supplies them (02 §7.4),
        otherwise from each region's own series (the regions share no cell)."""
        ps = pair_series.get((pid, var))
        if ps is None:
            return ra["series"]["values"], rb_["series"]["values"], ra["full"], rb_["full"]
        w, sides = ra["window"], []
        for side in ("a", "b"):
            sea, _ = M.seasonal_block(var, ps["first"], ps[side], np.zeros((0, len(ps[side]))), [season], WIN[var][1])
            sides.append(sea[season])
        return (window_values(sides[0], w["first"], w["last"])[1], window_values(sides[1], w["first"], w["last"])[1],
                (sides[0]["years"], sides[0]["values"]), (sides[1]["years"], sides[1]["values"]))


    for (rid, var), s in series.items():
        M.write_json(f"series/{var}/{M.fpath(rid)}.json", {
            "schema": "casefile/series@3", "synthetic": M.SYNTH, "variable": var, "region": rid,
            "units": VARS[var]["units"], "rule": VARS[var]["rule"],
            "monthly": {"start": f"{s['first']}-01", "values": [None if not np.isfinite(x) else round(float(x), 4) for x in s["monthly"]], "coverage": None},
            "seasons": {k: {"years": v["years"], "values": [None if x is None else round(x, 4) for x in v["values"]], "monthsUsed": v["monthsUsed"], "coverage": None}
                        for k, v in s["seasons"].items()},
            "areaKm2": round(s["area"], 1), "effectiveCells": {s["grid"]: s["eff"]},
            "provenance": M.provenance(var, prereg_sha, manifest_sha)})

    # ---------------------------------------------------------------- pass 1: stats and domain
    recs = {}
    for (rid, var), s in series.items():
        w0, w1 = WIN[var]
        for season in SEASONS:
            first = w0 + 1 if season == "DJF" and w0 == s["first"] else w0
            ys, vals = window_values(s["seasons"][season], first, w1)
            cells = cells_window(s["cells"][season], first, w1)
            st, dom, reason, missing = analyse(var, season, ys, vals, cells, tables, SECONDARY)
            used = [y for y, x in zip(ys, vals) if x is not None]
            recs[(var, rid, season)] = {"kind": "trend", "variable": {"id": var, "kind": VARS[var]["kind"], "source": VARS[var]["source"],
                                        "units": VARS[var]["units"]["aggregated"], "rule": VARS[var]["rule"], "ratioScale": VARS[var]["ratio_scale"]},
                                        "region_id": rid, "season": season, "window": {"id": "main", "first": first, "last": w1},
                                        "series": {"years": ys, "values": vals, "units": VARS[var]["units"]["aggregated"]},
                                        "stats": st, "domain": dom, "reason": reason, "missing": missing,
                                        "series_first_used": used[0], "series_last_used": used[-1],
                                        "full": (s["seasons"][season]["years"], s["seasons"][season]["values"])}
    pairs = {p["id"]: p for p in index["pairs"]}
    for pid, p in pairs.items():
        for var in VAR_ORDER:
            for season in SEASONS:
                if (var, p["a"], season) not in recs or (var, p["b"], season) not in recs:
                    continue
                if pid not in PRE and season != "ANN":
                    continue
                ra, rb_ = recs[(var, p["a"], season)], recs[(var, p["b"], season)]
                ys = ra["series"]["years"]
                xa, xb, fa, fb = pair_values(pid, var, season, ra, rb_)
                d = [None if (x is None or y is None) else x - y for x, y in zip(xa, xb)]
                st = L.core_stats(ys, d, cfg=CFG, tables=tables)
                st["change"]["units"] = VARS[var]["units"]["aggregated"]
                d6 = {"id": "D6", "passed": bool(ra["domain"]["inDomain"] and rb_["domain"]["inDomain"]), "value": "A and B", "limit": "both in the domain"}
                dom, reason, missing = L.domain_checks(var, season, ys, d, st, CFG, tables, SECONDARY, d6_override=d6)
                used = [y for y, x in zip(ys, d) if x is not None]
                fd = [None if (x is None or y is None) else x - y for x, y in zip(fa[1], fb[1])]
                recs[(var, f"{p['a']}-minus-{p['b']}", season)] = {
                    "kind": "contrast", "pair": pid, "variable": ra["variable"], "region_id": None, "season": season, "window": ra["window"],
                    "series": {"years": ys, "values": d, "units": VARS[var]["units"]["aggregated"]}, "stats": st, "domain": dom,
                    "reason": reason, "missing": missing, "series_first_used": used[0], "series_last_used": used[-1], "full": (fa[0], fd)}

    # ---------------------------------------------------------------- families: Holm and BH with m fixed by the pre-registration
    padj = {}
    for famname, method, keys in (("confirmatory", "holm", fam["confirmatory"]), ("secondary", "bh", fam["secondary"])):
        ps = []
        for kk in keys:
            var, tgt, season, _ = [x.strip() for x in kk.split("|")]
            r = recs.get((var, tgt, season))
            ok = r is not None and r["domain"]["inDomain"]
            ps.append(r["stats"]["mkAr1"]["p"] if ok else 1.0)
        adj = R.holm(ps, len(keys)) if method == "holm" else R.benjamini_hochberg(ps, len(keys))
        for kk, a in zip(keys, adj):
            var, tgt, season, _ = [x.strip() for x in kk.split("|")]
            padj[(var, tgt, season)] = (famname, method, len(keys), float(a))

    # ---------------------------------------------------------------- pass 2: finish and write
    reviews = inp.get("reviews") or []
    written = {}
    for kk, rec in recs.items():
        var, tgt, season = kk
        if var in SENS_VARS:
            famname, method, fsize, pa = "sensitivity", "none", 0, None
        elif kk in padj:
            famname, method, fsize, pa = padj[kk]
        else:
            famname, method, fsize, pa = "exploration", "none", 0, None
        headline = rec["kind"] == "contrast" and bool(pairs[rec["pair"]]["lead"]) and season == "ANN"
        case_key = f"contrast|{rec.get('pair')}|{var}|{season}" if rec["kind"] == "contrast" else f"trend|{tgt}|{var}|{season}"
        s_first = int(rec["full"][0][0])
        s_last = int(rec["full"][0][-1])
        finish(rec, famname, method, fsize, pa, tables, prereg, M.BREAKS, reviews, case_key, headline, rec["full"][0], rec["full"][1], s_first, s_last)

    # sensitivity links (rain only)
    for kk, rec in recs.items():
        var, tgt, season = kk
        if var in M.SENS:
            imerg = recs.get((M.SENS[var], tgt, season))
            if imerg is not None:
                rec["sens_same"] = bool(np.sign(imerg["stats"]["change"]["ratePerDecade"]) == np.sign(rec["stats"]["change"]["ratePerDecade"]))

    def vpath(var, rid, season):
        return f"verdicts/{var}/{M.fpath(rid)}/{season}.json"

    def cpath(var, pid, season):
        return f"contrasts/{var}/{pid}/{season}.json"

    for kk, rec in recs.items():
        var, tgt, season = kk
        if rec["kind"] != "trend":
            continue
        reg = regions[tgt]
        text = {lang: trend_text(rec, lang, reg["in"][lang], var) for lang in ("en", "bn")}
        out = {"schema": "casefile/verdict@3", "synthetic": M.SYNTH, "id": f"{var}__{M.fpath(tgt)}__{season}",
               "variable": rec["variable"], "region": {"id": tgt, "kind": reg["kind"], "areaKm2": reg["areaKm2"]},
               "season": season, "window": rec["window"], "family": rec["family"], "multiplicity": rec["multiplicity"],
               "status": rec["status"], "grade": rec["grade"], "reason": rec["reason"], "series": rec["series"], "domain": rec["domain"],
               "stats": rec["stats"], "robustness": rec["robustness"], "doubts": rec["doubts"], "practical": rec["practical"],
               "overturn": rec.get("overturn", []) if rec["status"] == "verdict" else [],
               "sensitivity": vpath(M.SENS[var], tgt, season) if (var in M.SENS and (M.SENS[var], tgt, season) in recs) else None,
               "spine": rec["spine"], "chart": rec["chart"], "text": text, "provenance": M.provenance(var, prereg_sha, manifest_sha)}
        if rec["status"] != "verdict":
            out["overturn"] = []
        M.write_json(vpath(var, tgt, season), out)
        written[kk] = out

    contrasts = {}
    for kk, rec in recs.items():
        var, tgt, season = kk
        if rec["kind"] != "contrast":
            continue
        p = pairs[rec["pair"]]
        va, vb = written[(var, p["a"], season)], written[(var, p["b"], season)]
        sa, sb = va["stats"], vb["stats"]
        ofd = bool(sa["sen"]["slopePerYear"] != 0 and sb["sen"]["slopePerYear"] != 0 and np.sign(sa["sen"]["slopePerYear"]) != np.sign(sb["sen"]["slopePerYear"]))
        sot = bool(ofd and va["grade"] in ("strong", "supported") and vb["grade"] in ("strong", "supported"))
        rd = bool(rec["status"] == "verdict" and rec["grade"] in ("strong", "supported"))
        sens = None
        if var in M.SENS and (M.SENS[var], tgt, season) in recs:
            svar = M.SENS[var]
            ri = recs[(svar, tgt, season)]
            # MERRA-2 over the same years as IMERG
            ys = list(range(WIN[svar][0], WIN[svar][1] + 1))
            full = dict(zip(rec["full"][0], rec["full"][1]))
            rm = L.core_stats(ys, [full.get(y) for y in ys])
            sens = {"variable": svar, "path": cpath(svar, rec["pair"], season), "window": ri["window"],
                    "rateImergPerDecade": ri["stats"]["change"]["ratePerDecade"], "rateMerraPerDecade": rm["change"]["ratePerDecade"],
                    "sameSign": bool(np.sign(ri["stats"]["change"]["ratePerDecade"]) == np.sign(rm["change"]["ratePerDecade"])),
                    "imergExcludesZero": bool(ri["stats"]["change"]["rateLowPerDecade"] > 0 or ri["stats"]["change"]["rateHighPerDecade"] < 0),
                    "merraExcludesZero": bool(rm["change"]["rateLowPerDecade"] > 0 or rm["change"]["rateHighPerDecade"] < 0)}
            rec["sens_same"] = sens["sameSign"]
        text = {lang: contrast_text(rec, va, vb, p, regions, lang, var, ofd, sot, rd, sens) for lang in ("en", "bn")}
        side = lambda v: {"id": v["region"]["id"], "verdict": vpath(var, v["region"]["id"], season),
                          "ratePerDecade": v["stats"]["change"]["ratePerDecade"], "rateLowPerDecade": v["stats"]["change"]["rateLowPerDecade"],
                          "rateHighPerDecade": v["stats"]["change"]["rateHighPerDecade"], "pAdjusted": v["multiplicity"]["pAdjusted"],
                          "status": v["status"], "grade": v["grade"], "inDomain": v["domain"]["inDomain"]}
        out = {"schema": "casefile/contrast@3", "synthetic": M.SYNTH, "id": f"{var}__{rec['pair']}__{season}",
               "pair": {"id": rec["pair"], "a": p["a"], "b": p["b"], "preRegistered": p["preRegistered"], "lead": p["lead"]},
               "variable": var, "season": season, "window": rec["window"], "family": rec["family"], "multiplicity": rec["multiplicity"],
               "status": rec["status"], "grade": rec["grade"], "reason": rec["reason"], "estimand": "trend_in_difference",
               "difference": rec["series"], "domain": rec["domain"], "stats": rec["stats"], "robustness": rec["robustness"],
               "doubts": rec["doubts"], "regions": {"a": side(va), "b": side(vb)},
               "labels": {"oppositeFittedDirections": ofd, "supportedOppositeTrends": sot, "ratesDiffer": rd},
               "sensitivity": sens, "practical": rec["practical"], "spine": rec["spine"], "chart": rec["chart"],
               "split": p["split"], "text": text,
               "provenance": M.provenance(var, prereg_sha, manifest_sha)}
        M.write_json(cpath(var, rec["pair"], season), out)
        contrasts[kk] = out

    # ---------------------------------------------------------------- line-ups (M3)
    lineups = {}
    for rid in REGION_ORDER:
        items = []
        for var in ANALYSED:
            for season in SEASONS:
                if (var, rid, season) in written:
                    items.append(written[(var, rid, season)])
        if not items:
            continue
        ps = [v["stats"]["mkAr1"]["p"] for v in items]
        q = R.benjamini_hochberg(ps, len(ps))
        rows = []
        for v, qq in zip(items, q):
            show = v["status"] == "verdict" or v["reason"] == "exploration"
            rows.append({"variable": v["variable"]["id"], "season": v["season"], "family": v["family"], "status": v["status"], "grade": v["grade"],
                         "reason": v["reason"], "ratePerDecade": v["stats"]["change"]["ratePerDecade"],
                         "rateLowPerDecade": v["stats"]["change"]["rateLowPerDecade"] if show else None,
                         "rateHighPerDecade": v["stats"]["change"]["rateHighPerDecade"] if show else None,
                         "units": v["stats"]["change"]["units"], "pAdjusted": v["multiplicity"]["pAdjusted"],
                         "qWithinLineup": float(qq) if v["family"] == "exploration" else None, "path": vpath(v["variable"]["id"], rid, v["season"])})
        lu = {"schema": "casefile/lineup@3", "synthetic": M.SYNTH, "region": rid, "nTests": len(rows),
              "familySizes": {"confirmatory": len(fam["confirmatory"]), "secondary": len(fam["secondary"])}, "items": rows,
              "provenance": M.provenance(ANALYSED[0], prereg_sha, manifest_sha)}
        M.write_json(f"lineups/{M.fpath(rid)}.json", lu)
        lineups[rid] = lu

    # ---------------------------------------------------------------- state demos (synthetic example only)
    if inp.get("states"):
        build_states(tables, prereg, prereg_sha, manifest_sha, regions)

    # ---------------------------------------------------------------- map, cells, cases, catalog, build, offline set
    from . import mapbuild as make_map
    for (mvar, mseason), fld in (inp.get("map_fields") or {}).items():
        if fld is None:
            make_map.build_map(tables, prereg_sha, manifest_sha)
        else:
            make_map.build_map(tables, prereg_sha, manifest_sha, mvar, mseason, fld[0], fld[1], golden=False)
    cases = build_cases(written, contrasts, lineups, regions, fam, prereg)
    build_catalog(inp.get("record_last") or {})
    build_manifest_files(prereg, manifest_sha, prereg_sha, inp.get("build_extra"))   # build.json
    build_offline(cases)                                                             # then the offline set
    if inp.get("golden"):
        M.write_json("current.json", {"schema": "casefile/current@3", "buildId": M.BUILD_ID, "path": f"results/{M.BUILD_ID}/", "previous": [], "synthetic": M.SYNTH})
        from . import golden as make_golden
        make_golden.build_all(tables)
    return {"verdicts": len(written), "contrasts": len(contrasts), "lineups": len(lineups), "cases": len(cases)}


def contrast_text(rec, va, vb, p, regions, lang, var, ofd, sot, rd, sens):
    s = T(lang)
    st = rec["stats"]
    ch = st["change"]
    units = ch["units"]
    A, B = regions[p["a"]]["name"][lang], regions[p["b"]]["name"][lang]
    Vn, vn = var_names(var, lang)
    sp = L.season_phrase(VARS[var]["rule"], rec["season"], s)
    d = R.decimals_for(ch["ratePerDecade"])
    P = {"A": A, "B": B, "Variable": Vn, "variable": vn, "season_phrase": sp,
         "rate_d": L.num(ch["ratePerDecade"], d, units, s), "lo_d": L.num(ch["rateLowPerDecade"], d, units, s),
         "hi_d": L.num(ch["rateHighPerDecade"], d, units, s)}
    ca, cb = va["stats"]["change"], vb["stats"]["change"]
    da, db = R.decimals_for(ca["ratePerDecade"]), R.decimals_for(cb["ratePerDecade"])
    side = R.fill(s["contrast"]["side"], {"A": A, "B": B, "rate_a": L.num(ca["ratePerDecade"], da, units, s), "lo_a": L.num(ca["rateLowPerDecade"], da, units, s),
                                          "hi_a": L.num(ca["rateHighPerDecade"], da, units, s), "rate_b": L.num(cb["ratePerDecade"], db, units, s),
                                          "lo_b": L.num(cb["rateLowPerDecade"], db, units, s), "hi_b": L.num(cb["rateHighPerDecade"], db, units, s)})
    h = s["contrast"]["headline"]
    if rec["status"] == "verdict":
        head = R.fill(h["rates_differ"] if rd else h["cant_tell_yet"], {k: v for k, v in P.items() if "{" + k + "}" in (h["rates_differ"] if rd else h["cant_tell_yet"])})
    elif rec["reason"] == "exploration":
        hk = "sensitivity" if rec["family"] == "sensitivity" else "exploration"
        head = R.fill(h[hk], {k: v for k, v in P.items() if "{" + k + "}" in h[hk]})
    else:
        tmpl = s["reason"][rec["reason"]]
        rp = {"rate": P["rate_d"], "lo": P["lo_d"], "hi": P["hi_d"], "n": st["n"], "from": rec["series_first_used"], "to": rec["series_last_used"],
              "missing": len(rec["missing"]), "requested": len(rec["series"]["years"]), "years": ", ".join(str(y) for y in rec["missing"][:5]), "label": ""}
        reason_txt = R.fill(tmpl, {k: v for k, v in rp.items() if "{" + k + "}" in tmpl})
        head = R.fill(h["no_verdict"], {"A": A, "B": B, "reason": reason_txt})
    how_much = [side, s["contrast"]["not_subtracted"]]
    if sot:
        how_much.append(s["contrast"]["supported_opposite"])
    elif ofd:
        how_much.append(s["contrast"]["opposite_fitted"])
    how_sure, overturn, checks, practical = [], [], [], []
    if rec["status"] == "verdict" or rec["reason"] == "exploration":
        checks = check_lines(rec, s, lang)
        if rec["practical"]["position"] is not None:
            th = L.num(rec["practical"]["threshold"], R.decimals_for(rec["practical"]["threshold"]), units, s, signed=False)
            practical.append(R.fill(s["practical"][rec["practical"]["position"]], {"threshold": th}))
    if rec["status"] == "verdict":
        pa = rec["multiplicity"]["pAdjusted"]
        how_sure.append(R.fill(s["verdict"]["sure"][rec["family"]], {"family_size": rec["multiplicity"]["familySize"], "p_adj_expr": R.p_expr(pa)}))
        how_sure.append(R.fill(s["verdict"]["sure"]["mkar1"], {"p_expr": R.p_expr(st["mkAr1"]["p"])}))
        key_ = "above" if pa >= ALPHA else ("doubts" if rec["grade"] == "cant_tell_yet" else "below")
        how_sure.append(R.fill(s["verdict"]["sure"][key_], {"alpha": R.fixed(ALPHA, 2), "n_doubts": len(rec["doubts"])}
                               if key_ == "doubts" else {"alpha": R.fixed(ALPHA, 2)}))
        overturn = overturn_lines(rec, s, lang, units)
    notes = []
    if VARS[var]["kind"] == "model":
        notes.append(s["checks"]["model_note"])
    if sens is not None:
        dm, di = R.decimals_for(sens["rateMerraPerDecade"]), R.decimals_for(sens["rateImergPerDecade"])
        notes.append(R.fill(s["sensitivity"]["same" if sens["sameSign"] else "other"],
                            {"from": 1998, "to": 2024, "rate_i": L.num(sens["rateImergPerDecade"], di, units, s), "rate_m": L.num(sens["rateMerraPerDecade"], dm, units, s)}))
        notes.append(s["sensitivity"]["lineage"])
    if rec["family"] == "sensitivity":
        notes.append(s["sensitivity"]["lineage"])
    block = {"headline": head, "howMuch": how_much, "howSure": how_sure, "checks": checks, "practical": practical, "overturn": overturn, "notes": notes}
    if lang == "bn":
        block = {k: (R.to_bn(x) if isinstance(x, str) else [R.to_bn(y) for y in x]) for k, x in block.items()}
    return block


def build_states(tables, prereg, prereg_sha, manifest_sha, regions):
    """Crafted single-series verdicts, one per no-verdict reason, for the UI and the E-tests."""
    out = {}
    rid = "synthetic:north_plain"
    reg = regions[rid]
    rng = R.rng_for("states|||")
    def make(name, var, years, values, cells, season="ANN", family="confirmatory", reviews=None, fsize=6, padj=0.5):
        st, dom, reason, missing = analyse(var, season, years, values, cells, tables, M.SECONDARY)
        used = [y for y, x in zip(years, values) if x is not None]
        rec = {"kind": "trend", "variable": {"id": var, "kind": VARS[var]["kind"], "source": VARS[var]["source"], "units": VARS[var]["units"]["aggregated"],
                                             "rule": VARS[var]["rule"], "ratioScale": VARS[var]["ratio_scale"]},
               "region_id": rid, "season": season, "window": {"id": "main", "first": years[0], "last": years[-1]},
               "series": {"years": years, "values": values, "units": VARS[var]["units"]["aggregated"]}, "stats": st, "domain": dom,
               "reason": reason, "missing": missing, "series_first_used": used[0], "series_last_used": used[-1]}
        method = "holm" if family == "confirmatory" else "none"
        finish(rec, family, method, fsize if family == "confirmatory" else 0, padj if family == "confirmatory" else None, tables, prereg,
               M.BREAKS, reviews or [], f"state|{name}", False, years, values, years[0], years[-1])
        text = {lang: trend_text(rec, lang, reg["in"][lang], var) for lang in ("en", "bn")}
        v = {"schema": "casefile/verdict@3", "synthetic": True, "id": f"state__{name}", "variable": rec["variable"],
             "region": {"id": rid, "kind": "synthetic", "areaKm2": reg["areaKm2"]}, "season": season, "window": rec["window"],
             "family": rec["family"], "multiplicity": rec["multiplicity"], "status": rec["status"], "grade": rec["grade"], "reason": rec["reason"],
             "series": rec["series"], "domain": rec["domain"], "stats": rec["stats"], "robustness": rec["robustness"], "doubts": rec["doubts"],
             "practical": rec["practical"], "overturn": rec.get("overturn", []) if rec["status"] == "verdict" else [], "sensitivity": None,
             "spine": rec["spine"], "chart": rec["chart"], "text": text, "provenance": M.provenance(var, prereg_sha, manifest_sha)}
        M.write_json(f"verdicts/_states/{name}.json", v)
        out[name] = v
        return v
    def cellset(n, phi, m=6, trend=0.0, base=27.0, kind="ar1"):
        t = np.arange(n)
        cells = []
        for _ in range(m):
            if kind == "ar1":
                e = R.ar1(rng, n, phi)
            elif kind == "ar2":
                e = R.ar2(rng, n, 0.15, 0.65)
            else:
                e = R.ar1(rng, n, 0.1) + R.ar1(rng, n, 0.9)
            cells.append(base + trend * t + 0.3 * e)
        return np.array(cells)
    c = cellset(18, 0.2, trend=0.03)
    make("short_record", "air_temp", list(range(2008, 2026)), list(c.mean(0)), c)
    c = cellset(12, 0.2, trend=0.03)
    make("too_short", "air_temp", list(range(2014, 2026)), list(c.mean(0)), c)
    c = cellset(30, 0.2, trend=0.02)
    vals = list(c.mean(0)); vals[7] = None
    make("missing_year", "air_temp", list(range(1996, 2026)), vals, c)
    c = cellset(46, 0.0, m=12, trend=0.0, kind="ar2")
    make("outside_domain", "air_temp", list(range(1980, 2026)), list(c.mean(0)), c)
    rv = [{"case": "state|break_review", "break": "imerg_trmm_to_gpm_2014", "outcome": "step_seen", "reviewer": "A (example)", "note": "Synthetic step at 2014."}]
    t = np.arange(27)
    common = 70 * R.ar1(rng, 27, 0.0)
    cells = np.array([2000 + 3.0 * (np.arange(1998, 2025) - 1998) + 90 * (np.arange(1998, 2025) >= 2014) + common + 25 * R.ar1(rng, 27, 0.0)
                      for _ in range(30)])
    make("break_review", "rain_imerg", list(range(1998, 2025)), list(cells.mean(0)), cells, family="sensitivity", reviews=rv)
    c = cellset(46, 0.2, trend=0.03)
    make("exploration", "air_temp", list(range(1980, 2026)), list(c.mean(0)), c, family="exploration")
    return out


def build_cases(written, contrasts, lineups, regions, fam, prereg):
    cases = []
    lead = next((p for p in prereg["pairs"] if p.get("lead")), None)
    if lead is None:
        return cases
    A, B, LEAD = lead["a"], lead["b"], lead["id"]
    for cc in M.CASES_CFG:
        u = cc["uses"]
        if u["kind"] == "contrast":
            if (u["variable"], f"{A}-minus-{B}", u["season"]) not in contrasts:
                continue
            c = contrasts[(u["variable"], f"{A}-minus-{B}", u["season"])]
            va = written[(u["variable"], A, u["season"])]
            vb = written[(u["variable"], B, u["season"])]
            ending = "supported" if c["labels"]["ratesDiffer"] else "cant_tell_yet"
            res = [f"contrasts/{u['variable']}/{LEAD}/{u['season']}.json",
                   f"verdicts/{u['variable']}/{M.fpath(va['region']['id'])}/{u['season']}.json",
                   f"verdicts/{u['variable']}/{M.fpath(vb['region']['id'])}/{u['season']}.json"]
        else:
            if A not in lineups:
                continue
            lu = lineups[A]
            c, va, vb, ending = None, None, None, None
            res = [f"lineups/{M.fpath(A)}.json"] + [it["path"] for it in lu["items"]]
        beats = []
        for b in cc["beats"]:
            if "ending" in b and b["ending"] != ending:
                continue
            cap = {}
            for lang in ("en", "bn"):
                tmpl = b["caption"][lang]
                P = {"A": regions[A]["name"][lang], "B": regions[B]["name"][lang],
                     "dataset": "MERRA-2", "family_size": len(fam["confirmatory"]), "n_tests": lineups[A]["nTests"]}
                if c is not None:
                    units = c["stats"]["change"]["units"]
                    s = T(lang)
                    d = R.decimals_for(c["stats"]["change"]["ratePerDecade"])
                    P.update({"from": c["window"]["first"], "to": c["window"]["last"], "n_years": c["stats"]["n"],
                              "rate_d": L.num(c["stats"]["change"]["ratePerDecade"], d, units, s),
                              "rate_a": L.num(va["stats"]["change"]["ratePerDecade"], R.decimals_for(va["stats"]["change"]["ratePerDecade"]), units, s),
                              "rate_b": L.num(vb["stats"]["change"]["ratePerDecade"], R.decimals_for(vb["stats"]["change"]["ratePerDecade"]), units, s),
                              "headline": c["text"][lang]["headline"]})
                text = R.fill(tmpl, {k: v for k, v in P.items() if "{" + k + "}" in tmpl})
                cap[lang] = R.to_bn(text) if lang == "bn" else text
            beats.append({"at": b["at"], "caption": cap})
        title = {lang: R.fill(cc["title"][lang], {k: v for k, v in {"A": regions[A]["name"][lang], "B": regions[B]["name"][lang]}.items()
                                                  if "{" + k + "}" in cc["title"][lang]}) for lang in ("en", "bn")}
        case = {"schema": "casefile/casefile@3", "synthetic": M.SYNTH, "id": cc["id"], "uses": {k: (v if k != "pair" else LEAD) for k, v in u.items()}
                if u["kind"] == "contrast" else {"kind": "lineup", "region": A},
                "ending": ending, "title": title, "summary": cc["summary"], "results": [r for r in res if r], "beats": beats}
        M.write_json(f"cases/{cc['id']}.json", case)
        cases.append(case)
    return cases


def build_offline(cases):
    files = set()
    for c in cases:
        files.add(f"cases/{c['id']}.json")
        files.update(c["results"])
    files.update(["catalog.json", "regions/index.json", "methods/tables.json", "prereg.json", "build.json"])
    entries = []
    for f in sorted(files):
        p = M.EX / f
        if p.exists():
            entries.append({"path": f, "sha256": M.sha256_file(p), "bytes": p.stat().st_size})
    s = {"schema": "casefile/offline_set@3", "buildId": M.BUILD_ID, "synthetic": M.SYNTH,
         "cases": [{"id": c["id"], "title": c["title"], "files": [f"cases/{c['id']}.json"] + c["results"]} for c in cases],
         "files": entries, "totalBytes": sum(e["bytes"] for e in entries)}
    M.write_json("offline/set.json", s)
    return s


def build_catalog(record_last=None):
    record_last = record_last or {}
    import yaml
    srcs = yaml.safe_load(open(M.ROOT / "config/sources.yaml", encoding="utf-8"))["sources"]
    brk = {b["id"]: b for b in M.BREAKS}
    variables = []
    for v in yaml.safe_load(open(M.ROOT / "config/variables.yaml", encoding="utf-8"))["variables"]:
        v = dict(v)
        rc = dict(v["record_card"])
        rc["known_breaks"] = [{"id": b, "label": brk[b]["label"], "date": brk[b]["date"], "verified": brk[b]["verified"]} for b in rc["known_breaks"]]
        v["record_card"] = rc
        if v["record"]["to"] is None and v["status"] in ("analysed",):
            v["record"] = {"from": v["record"]["from"], "to": record_last.get(v["id"], 2025)}
        variables.append(v)
    cat = {"schema": "casefile/catalog@3", "buildId": M.BUILD_ID, "created": M.CREATED, "synthetic": M.SYNTH, "variables": variables,
           "questions": M.QUESTIONS,
           "sources": [{"id": s["id"], "status": s["status"], "name": s["name"], "short_name": s["short_name"], "version": s["version"],
                        "kind": s["kind"], "doi": s["doi"], "doi_verified": s["doi_verified"], "citation": s["citation"], "reference": s["reference"],
                        "licence": s["licence"]} for s in srcs]}
    M.write_json("catalog.json", cat)


def build_manifest_files(prereg, manifest_sha, prereg_sha, extra=None):
    hashes = {k: M.sha256_file(M.ROOT / p) for k, p in (("analysis", "config/analysis.yaml"), ("variables", "config/variables.yaml"),
              ("regions", "config/regions.yaml"), ("seasons", "config/seasons.yaml"), ("known_breaks", "config/known_breaks.yaml"),
              ("break_review", "config/break_review.yaml"), ("i18n_en", "config/i18n/en.json"), ("i18n_bn", "config/i18n/bn.json"))}
    counts = {d: sum(1 for _ in (M.EX / d).rglob("*.json")) for d in ("verdicts", "contrasts", "lineups", "maps", "cases")}
    b = {"schema": "casefile/build@3", "buildId": M.BUILD_ID, "created": M.CREATED, "synthetic": M.SYNTH,
         "engine": {"version": "reference", "gitSha": "synthetic"}, "pipeline": {"gitSha": "synthetic"},
         # a real build records the library versions; the examples do not, so that they rebuild identically anywhere
         "python": ({"numpy": np.__version__, "scipy": __import__("scipy").__version__} if extra
                    else {"numpy": "not recorded in the examples", "scipy": "not recorded in the examples"}),
         "inputManifest": {"path": "input_manifest.json", "sha256": manifest_sha},
         "prereg": {"path": "prereg.json", "sha256": prereg_sha, "commit": None, "status": "synthetic"},
         "configHashes": hashes, "goldenTests": {"suite": "examples/golden", "total": 0, "passed": 0},
         "products": [{"source": "merra2_slv", "shortName": "M2TMNXSLV", "version": "5.12.4", "granules": 0},
                      {"source": "merra2_precip", "shortName": "M2TMNXFLX", "version": "5.12.4", "granules": 0},
                      {"source": "imerg_v07_final_monthly", "shortName": "GPM_3IMERGM", "version": "07", "granules": 0}],
         "counts": counts, "files": {"count": sum(1 for p in M.EX.rglob("*") if p.is_file() and not ({"golden", "power"} & set(p.parts))),
                                     "bytes": sum(p.stat().st_size for p in M.EX.rglob("*") if p.is_file() and not ({"golden", "power"} & set(p.parts)))}}
    if extra:
        b.update(extra)
    M.write_json("build.json", b)



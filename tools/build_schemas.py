"""Writes schemas/*.schema.json for spec pack v3 (run once; the JSON files are the pack's contract)."""
import json
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
BASE = "https://casefile-earth.github.io/spec/schemas/"
D = "draft/2020-12"


def S(name, title, body, desc=None):
    s = {"$schema": f"https://json-schema.org/{D}/schema", "$id": BASE + name + ".schema.json", "title": title}
    if desc:
        s["description"] = desc
    s.update(body)
    (OUT / f"{name}.schema.json").write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n")


C = "common.schema.json#/$defs/"
num_or_null = {"type": ["number", "null"]}
int_or_null = {"type": ["integer", "null"]}
str_or_null = {"type": ["string", "null"]}


def ref(x):
    return {"$ref": C + x}


def obj(props, required=None, extra=False):
    o = {"type": "object", "properties": props, "additionalProperties": extra}
    o["required"] = list(props.keys()) if required is None else required
    return o


# ------------------------------------------------------------------ common
S("common", "Shared definitions for spec pack v3 schemas", {"$defs": {
    "text2": obj({"en": {"type": "string", "minLength": 1}, "bn": {"type": "string", "minLength": 1}}),
    "sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "variableId": {"type": "string", "pattern": "^[a-z][a-z0-9_]*$"},
    "analysedVariable": {"type": "string", "pattern": "^[a-z][a-z0-9_]*$"},   # any variable of config/variables.yaml marked analysed or sensitivity
    "seasonId": {"enum": ["ANN", "DJF", "MAM", "JJAS", "ON", "JJA", "SON"]},
    "regionId": {"type": "string", "pattern": "^(country:[A-Z]{3}|bd_div:[a-z_]+|cmp:[a-z0-9_]+|cell:[0-9]{1,3}_[0-9]{1,3}|synthetic:[a-z0-9_]+)$"},
    "pairId": {"type": "string", "pattern": "^pair_[a-z0-9_]+$"},
    "family": {"enum": ["confirmatory", "secondary", "exploration", "sensitivity"]},
    "grade": {"enum": ["strong", "supported", "cant_tell_yet"]},
    "reason": {"enum": ["outside_domain", "short_record", "too_short", "missing_year", "not_testable", "break_review", "exploration"]},
    "status": {"enum": ["verdict", "no_verdict"]},
    "doubt": {"enum": ["loo_flip", "windows_disagree", "coverage_drift", "break_unreviewed"]},
    "years": {"type": "array", "items": {"type": "integer", "minimum": 1850, "maximum": 2100}},
    "values": {"type": "array", "items": {"type": ["number", "null"]}},
    "window": obj({"id": {"type": "string"}, "first": {"type": "integer"}, "last": {"type": "integer"}}),
    "grid": obj({"id": {"type": "string"}, "lat0": {"type": "number"}, "dlat": {"type": "number"}, "nlat": {"type": "integer"},
                 "lon0": {"type": "number"}, "dlon": {"type": "number"}, "nlon": {"type": "integer"}}),
    "multiplicity": obj({"method": {"enum": ["holm", "bh", "bh_lineup", "none"]}, "familySize": {"type": "integer", "minimum": 0},
                         "pAdjusted": num_or_null, "alpha": {"type": "number", "exclusiveMinimum": 0, "maximum": 0.2}}),
    "domainCheck": obj({"id": {"enum": ["D1", "D2", "D3", "D4", "D5", "D6", "D7"]}, "passed": {"type": "boolean"},
                        "value": {"type": ["number", "string", "null"]}, "limit": {"type": ["number", "string", "null"]}}),
    "domain": obj({"inDomain": {"type": "boolean"}, "checks": {"type": "array", "items": {"$ref": "#/$defs/domainCheck"}, "minItems": 7, "maxItems": 7}}),
    "stats": obj({
        "n": {"type": "integer", "minimum": 0},
        "mk": obj({"S": {"type": "integer"}, "varS": {"type": "number"}, "tau": num_or_null, "z": {"type": "number"},
                   "p": {"type": "number", "minimum": 0, "maximum": 1}, "pKind": {"const": "mk_normal_cc"}}),
        "ar1": obj({"phiRaw": {"type": "number"}, "phi": {"type": "number", "minimum": 0, "maximum": 0.95},
                    "vif": {"type": "number", "minimum": 1}, "estimator": {"const": "ar1_regression_consecutive"}}),
        "mkAr1": obj({"varSStar": {"type": "number"}, "z": {"type": "number"}, "p": num_or_null, "pKind": {"const": "mk_normal_cc"}}),
        "sen": obj({"slopePerYear": {"type": "number"}, "intercept": {"type": "number"}, "ciLowPerYear": {"type": "number"},
                    "ciHighPerYear": {"type": "number"}, "multiplier": {"type": "number"}, "nPairs": {"type": "integer"}}),
        "change": obj({"ratePerDecade": {"type": "number"}, "rateLowPerDecade": {"type": "number"}, "rateHighPerDecade": {"type": "number"},
                       "total": {"type": "number"}, "totalLow": {"type": "number"}, "totalHigh": {"type": "number"},
                       "span": {"type": "integer"}, "units": {"type": "string"}, "percent": num_or_null, "baseline": num_or_null,
                       "residSd": {"type": "number", "minimum": 0}, "snr": num_or_null}),
        "ttest": obj({"available": {"type": "boolean"}, "slopePerYear": num_or_null, "intercept": num_or_null, "se": num_or_null, "r1": num_or_null, "phi": num_or_null,
                      "nEff": num_or_null, "seAdj": num_or_null, "t": num_or_null, "df": num_or_null, "p": num_or_null,
                      "ciLowPerYear": num_or_null, "ciHighPerYear": num_or_null, "role": {"const": "display_only"}}),
        "naive": obj({"z": {"type": "number"}, "p": {"type": "number"}, "label": {"const": "naive_ignores_memory"}}),
        "leftover": {"type": ["object", "null"], "properties": {
            "stat": {"type": "number"}, "m": {"type": "integer"}, "mEff": {"type": "number"}, "mEffStep": {"type": "integer"},
            "rhoBar": {"type": "number"}, "phiCells": {"type": "number", "minimum": 0, "maximum": 0.95},
            "critical": {"type": "number"}, "passed": {"type": "boolean"},
            "source": {"enum": ["contributing_cells", "neighbourhood_5x5", "both_regions"]}},
            "required": ["stat", "m", "mEff", "mEffStep", "rhoBar", "phiCells", "critical", "passed", "source"], "additionalProperties": False},
    }),
    "breakNote": obj({"id": {"type": "string"}, "year": int_or_null, "label": {"$ref": "#/$defs/text2"},
                      "status": {"enum": ["reviewed", "unreviewed", "step"]},
                      "review": {"type": ["object", "null"], "properties": {"outcome": {"enum": ["no_step_seen", "step_seen", "unclear"]},
                                 "reviewer": {"type": "string"}, "note": {"type": "string"}},
                                 "required": ["outcome", "reviewer", "note"], "additionalProperties": False}}),
    "windowItem": obj({"id": {"type": "string"}, "first": {"type": "integer"}, "last": {"type": "integer"}, "ran": {"type": "boolean"},
                       "ratePerDecade": num_or_null, "rateLowPerDecade": num_or_null, "rateHighPerDecade": num_or_null,
                       "p": num_or_null, "agrees": {"type": ["boolean", "null"]}}),
    "robustness": obj({
        "gaps": obj({"missingYears": {"$ref": "#/$defs/years"}}),
        "coverage": obj({"status": {"enum": ["pass", "doubt", "skip"]}, "cmin": num_or_null, "cmax": num_or_null, "p": num_or_null}),
        "breaks": {"type": "array", "items": {"$ref": "#/$defs/breakNote"}},
        "loo": obj({"status": {"enum": ["pass", "doubt", "note", "skip"]}, "year": int_or_null, "pMax": num_or_null, "pMin": num_or_null}),
        "windows": obj({"status": {"enum": ["pass", "doubt", "skip"]}, "agree": {"type": "integer"}, "ran": {"type": "integer"},
                        "items": {"type": "array", "items": {"$ref": "#/$defs/windowItem"}, "maxItems": 5}}),
        "pettitt": {"type": ["object", "null"], "properties": {"flagged": {"type": "boolean"}, "year": int_or_null, "U": {"type": "number"},
                    "p": {"type": "number", "minimum": 0, "maximum": 1}, "method": {"const": "pyhomogeneity.pettitt_test(sim=None)"}},
                    "required": ["flagged", "year", "U", "p", "method"], "additionalProperties": False},
    }),
    "practical": obj({"threshold": num_or_null, "units": {"type": "string"}, "position": {"enum": ["exceeds", "overlaps", "smaller", None]}}),
    "textBlock": obj({"headline": {"type": "string", "minLength": 1}, "howMuch": {"type": "array", "items": {"type": "string"}},
                      "howSure": {"type": "array", "items": {"type": "string"}}, "checks": {"type": "array", "items": {"type": "string"}},
                      "practical": {"type": "array", "items": {"type": "string"}}, "overturn": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                      "notes": {"type": "array", "items": {"type": "string"}}}),
    "text": obj({"en": {"$ref": "#/$defs/textBlock"}, "bn": {"$ref": "#/$defs/textBlock"}}),
    "pairSplit": obj({"rule": {"const": "disjoint_cells_larger_fraction"},
                      "grids": {"type": "object", "additionalProperties": obj({"sharedCells": {"type": "integer", "minimum": 0},
                                "effectiveCellsA": {"type": "number", "minimum": 0}, "effectiveCellsB": {"type": "number", "minimum": 0},
                                "passes": {"type": "boolean"}})},
                      "passes": {"type": "boolean"}}),
    "point": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
    "segment": {"type": "array", "items": {"$ref": "#/$defs/point"}, "minItems": 2, "maxItems": 2},
    "chart": obj({"values": {"$ref": "#/$defs/values"},
                  "offset": {"type": "number", "description": "Subtracted from the stored values for display (the window mean of d for contrasts; 0 otherwise)"},
                  "pivot": {"oneOf": [{"$ref": "#/$defs/point"}, {"type": "null"}]},
                  "line": {"oneOf": [{"$ref": "#/$defs/segment"}, {"type": "null"}]},
                  "band": {"oneOf": [obj({"low": {"$ref": "#/$defs/segment"}, "high": {"$ref": "#/$defs/segment"}}), {"type": "null"}]}},
                 ),
    "spine": obj({"status": {"$ref": "#/$defs/status"}, "grade": {"enum": ["strong", "supported", "cant_tell_yet", None]},
                  "reason": {"enum": ["outside_domain", "short_record", "too_short", "missing_year", "not_testable", "break_review", "exploration", None]},
                  "ratePerDecade": num_or_null, "rateLowPerDecade": num_or_null, "rateHighPerDecade": num_or_null, "units": {"type": "string"},
                  "family": {"$ref": "#/$defs/family"}, "familySize": {"type": "integer"}, "inDomain": {"type": "boolean"}}),
}})

# ------------------------------------------------------------------ provenance
S("provenance", "Provenance — where a result came from", obj({
    "items": {"type": "array", "items": obj({
        "product": {"type": "string"}, "shortName": str_or_null, "version": str_or_null, "doi": str_or_null,
        "route": {"enum": ["earthaccess", "power_check", "csv", "synthetic"]}, "granules": int_or_null,
        "accessed": str_or_null, "note": str_or_null})},
    "inputManifestSha256": {"oneOf": [ref("sha256"), {"type": "null"}]},
    "preregSha256": {"oneOf": [ref("sha256"), {"type": "null"}]},
    "configSha256": {"oneOf": [ref("sha256"), {"type": "null"}]},
    "engine": {"type": "string"},
    "buildId": {"type": "string"},
    "created": {"type": "string", "format": "date-time"}}))

PROV = {"$ref": "provenance.schema.json"}

# ------------------------------------------------------------------ build, current, input manifest
S("build", "Results build manifest — results/<buildId>/build.json", obj({
    "schema": {"const": "casefile/build@3"}, "buildId": {"type": "string"}, "created": {"type": "string"}, "synthetic": {"type": "boolean"},
    "engine": obj({"version": {"type": "string"}, "gitSha": {"type": "string"}}),
    "pipeline": obj({"gitSha": {"type": "string"}}),
    "python": {"type": "object", "additionalProperties": {"type": "string"}},
    "inputManifest": obj({"path": {"type": "string"}, "sha256": ref("sha256")}),
    "prereg": obj({"path": {"type": "string"}, "sha256": ref("sha256"), "commit": str_or_null, "status": {"enum": ["committed", "synthetic"]}}),
    "configHashes": {"type": "object", "additionalProperties": ref("sha256"),
                     "required": ["analysis", "variables", "regions", "seasons", "known_breaks", "break_review", "i18n_en", "i18n_bn"]},
    "goldenTests": obj({"suite": {"type": "string"}, "total": {"type": "integer"}, "passed": {"type": "integer"}}),
    "products": {"type": "array", "items": obj({"source": {"type": "string"}, "shortName": {"type": "string"}, "version": {"type": "string"}, "granules": {"type": "integer"}})},
    "counts": {"type": "object", "additionalProperties": {"type": "integer"}},
    "files": obj({"count": {"type": "integer"}, "bytes": {"type": "integer"}})}))

S("current", "Pointer to the build the site shows — results/current.json", obj({
    "schema": {"const": "casefile/current@3"}, "buildId": {"type": "string"}, "path": {"type": "string"},
    "previous": {"type": "array", "items": {"type": "string"}}, "synthetic": {"type": "boolean"}}))

S("input_manifest", "Pinned input manifest — every input file by SHA-256 (02_DATA §9)", obj({
    "schema": {"const": "casefile/input_manifest@3"}, "manifestId": {"type": "string"}, "created": {"type": "string"}, "synthetic": {"type": "boolean"},
    "products": {"type": "array", "minItems": 1, "items": obj({
        "source": {"type": "string"}, "shortName": {"type": "string"}, "version": {"type": "string"}, "doi": str_or_null,
        "query": obj({"provider": {"type": "string"}, "temporal": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 2},
                      "bbox": {"type": ["array", "null"], "items": {"type": "number"}, "minItems": 4, "maxItems": 4}}),
        "variables": {"type": "array", "items": {"type": "string"}}, "units": {"type": "object", "additionalProperties": {"type": "string"}},
        "fill": {"type": ["number", "string", "null"]}, "firstMonth": {"type": "string", "pattern": "^\\d{4}-(0[1-9]|1[0-2])$"},
        "lastMonth": {"type": "string", "pattern": "^\\d{4}-(0[1-9]|1[0-2])$"}, "granuleCount": {"type": "integer"},
        "files": {"type": "array", "items": obj({"name": {"type": "string"}, "month": {"type": "string"}, "sha256": ref("sha256"), "bytes": {"type": "integer"},
                                                  "valuesSha256": ref("sha256")}, required=["name", "month", "sha256", "bytes"])}})},
    "checks": {"type": "array", "items": obj({"id": {"type": "string"}, "result": {"enum": ["pass", "fail", "skip"]}, "note": {"type": "string"}})}}))

# ------------------------------------------------------------------ pre-registration
practical = obj({"units": {"type": "string"}, "default": {"type": "number", "exclusiveMinimum": 0},
                 "by_season": {"type": "object", "additionalProperties": {"type": "number", "exclusiveMinimum": 0}},
                 "reason": {"type": "string", "minLength": 1}})
S("prereg", "Pre-registration (config/preregistration.yaml, compiled) — 03_SCIENCE §10", obj({
    "schema": {"const": "casefile/prereg@3"},
    "status": {"enum": ["draft", "committed"]},
    "commit": str_or_null,
    "signed_by": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 3},
    "hashes": obj({"analysis_yaml_sha256": ref("sha256"), "input_manifest_sha256": ref("sha256"), "regions_support_sha256": ref("sha256")}),
    "alpha": obj({"confirmatory": {"type": "number", "exclusiveMinimum": 0, "maximum": 0.1},
                  "secondary_q": {"type": "number", "exclusiveMinimum": 0, "maximum": 0.1}, "map_q": {"const": 0.1}}),
    "variables": {"type": "array", "minItems": 1, "items": obj({
        "id": ref("analysedVariable"), "product": {"type": "string"}, "role": {"enum": ["analysed", "sensitivity"]},
        "main_window": obj({"first": {"type": "integer", "minimum": 1980}, "last": {"type": "integer", "maximum": 2100}}),
        "practical_threshold": practical})},
    "seasons": obj({"main": {"const": "ANN"}, "secondary": {"type": "array", "items": ref("seasonId"), "uniqueItems": True},
                    "djf_starts_one_year_later": {"type": "boolean"}}),
    "regions": obj({"support_rule": obj({"min_native_cells": {"type": "number", "minimum": 4},
                                         "max_spill_share": {"type": "number", "exclusiveMinimum": 0, "maximum": 0.3334}},
                                        required=["min_native_cells"]),
                    "set": {"type": "array", "minItems": 2, "items": obj({"id": ref("regionId"), "role": {"enum": ["home", "division", "comparison"]},
                            "effective_native_cells": {"type": "object", "additionalProperties": {"type": "number", "minimum": 4}}})}}),
    "pairs": {"type": "array", "minItems": 1, "items": obj({"id": ref("pairId"), "a": ref("regionId"), "b": ref("regionId"),
              "lead": {"type": "boolean"}, "question": ref("text2"),
              "split_support": {"type": "object", "description": "Effective native cells left for A and B after the disjoint split, per grid (02 §7.4)",
                                "additionalProperties": obj({"effective_cells_a": {"type": ["number", "string"]}, "effective_cells_b": {"type": ["number", "string"]}})}},
              required=["id", "a", "b", "lead", "question"])},
    "windows": obj({"alternatives": {"type": "array", "minItems": 5, "maxItems": 5, "items": obj({
        "id": {"type": "string", "pattern": "^[a-z0-9]+$"}, "start_shift": {"type": "integer", "minimum": 0}, "end_shift": {"type": "integer", "maximum": 0}})}}),
    "headline_cases": {"type": "array", "items": {"type": "object", "properties": {
        "kind": {"enum": ["contrast", "trend", "lineup"]}, "pair": {"type": "string"}, "region": {"type": "string"},
        "variable": ref("analysedVariable"), "season": ref("seasonId")}, "required": ["kind"], "additionalProperties": False}},
    "family_preview": obj({"confirmatory": {"type": "array", "items": {"type": "string"}}, "secondary": {"type": "array", "items": {"type": "string"}}}),
    "amendments": {"type": "array", "items": obj({"when": {"enum": ["before any real trend", "after"]}, "what": {"type": "string"},
                   "reason": {"type": "string"}, "sha256_before": ref("sha256")})},
    "sha256": ref("sha256"),
    "synthetic": {"type": "boolean"}},
    required=["schema", "status", "commit", "signed_by", "hashes", "alpha", "variables", "seasons", "regions", "pairs", "windows",
              "headline_cases", "family_preview", "amendments"]))

# ------------------------------------------------------------------ catalog
var_item = {"type": "object", "additionalProperties": False,
            "required": ["id", "status", "group", "kind", "source", "name", "name_mid", "definition", "how_measured", "units", "rule",
                         "ratio_scale", "record", "record_card"],
            "properties": {
                "id": ref("variableId"), "status": {"enum": ["analysed", "sensitivity", "reference", "deferred"]},
                "group": {"enum": ["heat", "water", "air", "weather", "land", "sky"]}, "kind": {"enum": ["satellite", "model", "observations"]},
                "agency": {"type": "string"}, "source": {"type": "string"}, "variable": {"type": "string"}, "conversion": {"type": "string"},
                "name": ref("text2"), "name_mid": ref("text2"), "definition": ref("text2"), "how_measured": ref("text2"),
                "units": obj({"monthly": {"type": "string"}, "aggregated": {"type": "string"}}), "rule": {"enum": ["mean", "sum"]},
                "ratio_scale": {"type": "boolean"}, "record": obj({"from": {"type": "integer"}, "to": int_or_null}),
                "record_card": obj({"gaps": ref("text2"), "known_breaks": {"type": "array", "items": obj({"id": {"type": "string"},
                                    "label": ref("text2"), "date": str_or_null, "verified": {"type": "boolean"}})},
                                    "observation_or_model": ref("text2"), "cannot_answer": ref("text2")}),
                "sensitivity": {"type": "string"},
                "colormap": {"type": "object", "properties": {"trend": {"type": "string"}, "value": {"type": "string"}}, "additionalProperties": False},
                "valid_range": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
                "tags": {"type": "array", "items": {"type": "string"}}}}
S("catalog", "Catalog — variables with record cards, question cards and sources (M1)", obj({
    "schema": {"const": "casefile/catalog@3"}, "buildId": {"type": "string"}, "created": {"type": "string"}, "synthetic": {"type": "boolean"},
    "variables": {"type": "array", "minItems": 1, "items": var_item},
    "questions": {"type": "array", "items": obj({"id": {"type": "string"}, "flow": {"enum": ["place", "compare", "none"]}, "question": ref("text2"),
                  "shortlist": {"type": "array", "items": obj({"variable": ref("variableId"), "why": ref("text2")})},
                  "also_deferred": {"type": "array", "items": ref("variableId")}}, required=["id", "flow", "question", "shortlist"])},
    "sources": {"type": "array", "items": obj({"id": {"type": "string"}, "status": {"type": "string"}, "name": {"type": "string"},
                "short_name": {"type": "string"}, "version": {"type": "string"}, "kind": {"type": "string"}, "doi": str_or_null,
                "doi_verified": {"type": "boolean"}, "citation": {"type": "string"}, "reference": {"type": "string"}, "licence": {"type": "string"}})}}))

# ------------------------------------------------------------------ regions
S("region_index", "Region index — the fixed region set with support results and contributing cells (02_DATA §7)", obj({
    "schema": {"const": "casefile/region_index@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "grids": {"type": "array", "items": ref("grid")},
    "minNativeCells": {"type": "number", "minimum": 4},
    "maxSpillShare": {"type": "number", "exclusiveMinimum": 0, "maximum": 0.3334},
    "cellIdPattern": {"const": "cell:<row>_<col>"},
    "regions": {"type": "array", "items": obj({
        "id": ref("regionId"), "kind": {"enum": ["country", "division", "comparison", "synthetic"]}, "role": {"enum": ["home", "division", "comparison"]},
        "name": ref("text2"), "in": ref("text2"),
        "bbox": {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4},
        "centroid": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
        "areaKm2": {"type": "number", "minimum": 0},
        "boundary": obj({"source": {"type": "string"}, "licence": {"type": "string"}}),
        "inSet": {"type": "boolean"},
        "support": {"type": "object", "additionalProperties": obj({"effectiveCells": {"type": "number"}, "spillShare": {"type": "number", "minimum": 0, "maximum": 1},
                                                                    "passes": {"type": "boolean"}})},
        "cells": {"type": "object", "additionalProperties": {"type": "string"}},
        "geom": str_or_null,
        "pairs": {"type": "array", "items": ref("pairId")}})},
    "pairs": {"type": "array", "items": obj({"id": ref("pairId"), "a": ref("regionId"), "b": ref("regionId"), "lead": {"type": "boolean"},
              "preRegistered": {"type": "boolean"}, "question": ref("text2"), "split": ref("pairSplit")})}}))

S("mask", "Contributing cells of one region on one grid (02_DATA §7.2)", obj({
    "schema": {"const": "casefile/mask@3"}, "region": ref("regionId"), "grid": {"type": "string"},
    "cells": {"type": "array", "items": {"type": "array", "minItems": 3, "maxItems": 3,
              "prefixItems": [{"type": "integer", "minimum": 0}, {"type": "integer", "minimum": 0}, {"type": "number", "exclusiveMinimum": 0, "maximum": 1}]}},
    "areaKm2": {"type": "number", "minimum": 0}, "effectiveCells": {"type": "number", "minimum": 0}, "synthetic": {"type": "boolean"}}))

# ------------------------------------------------------------------ series
season_block = obj({"years": ref("years"), "values": ref("values"), "monthsUsed": {"type": "array", "items": {"type": "integer"}},
                    "coverage": {"type": ["array", "null"], "items": {"type": ["number", "null"]}}})
S("series", "Series — one variable for one region: monthly values for display and one value per year per season (03_SCIENCE §2)", obj({
    "schema": {"const": "casefile/series@3"}, "synthetic": {"type": "boolean"}, "variable": ref("variableId"), "region": ref("regionId"),
    "units": obj({"monthly": {"type": "string"}, "aggregated": {"type": "string"}}), "rule": {"enum": ["mean", "sum"]},
    "monthly": {"type": ["object", "null"], "properties": {"start": {"type": "string", "pattern": "^\\d{4}-(0[1-9]|1[0-2])$"}, "values": ref("values"),
                "coverage": {"type": ["array", "null"], "items": {"type": ["number", "null"]}}}, "required": ["start", "values", "coverage"], "additionalProperties": False},
    "seasons": {"type": "object", "propertyNames": ref("seasonId"), "additionalProperties": season_block, "minProperties": 1},
    "areaKm2": {"type": "number"}, "effectiveCells": {"type": "object", "additionalProperties": {"type": "number"}},
    "provenance": PROV}))

# ------------------------------------------------------------------ verdict
S("verdict", "Verdict — one region, one variable, one season, main window (03_SCIENCE §8)", obj({
    "schema": {"const": "casefile/verdict@3"}, "synthetic": {"type": "boolean"}, "id": {"type": "string"},
    "variable": obj({"id": ref("analysedVariable"), "kind": {"enum": ["satellite", "model", "observations"]}, "source": {"type": "string"},
                     "units": {"type": "string"}, "rule": {"enum": ["mean", "sum"]}, "ratioScale": {"type": "boolean"}}),
    "region": obj({"id": ref("regionId"), "kind": {"enum": ["country", "division", "comparison", "cell", "synthetic"]}, "areaKm2": num_or_null}),
    "season": ref("seasonId"), "window": ref("window"), "family": ref("family"), "multiplicity": ref("multiplicity"),
    "status": ref("status"), "grade": {"enum": ["strong", "supported", "cant_tell_yet", None]},
    "reason": {"enum": ["outside_domain", "short_record", "too_short", "missing_year", "not_testable", "break_review", "exploration", None]},
    "series": obj({"years": ref("years"), "values": ref("values"), "units": {"type": "string"}}),
    "domain": ref("domain"), "stats": ref("stats"), "robustness": ref("robustness"),
    "doubts": {"type": "array", "items": ref("doubt"), "uniqueItems": True},
    "practical": ref("practical"),
    "overturn": {"type": "array", "items": {"enum": ["O1", "O2", "O3", "O4", "O5", "O6", "O7"]}, "maxItems": 3},
    "sensitivity": {"type": ["string", "null"], "description": "Path of the matching IMERG result (rain only)"},
    "spine": ref("spine"), "chart": ref("chart"), "text": ref("text"), "provenance": PROV}))

side = obj({"id": ref("regionId"), "verdict": {"type": "string"}, "ratePerDecade": {"type": "number"}, "rateLowPerDecade": {"type": "number"},
            "rateHighPerDecade": {"type": "number"}, "pAdjusted": num_or_null, "status": ref("status"),
            "grade": {"enum": ["strong", "supported", "cant_tell_yet", None]}, "inDomain": {"type": "boolean"}})
S("contrast", "Contrast — the trend in the difference A − B for one pair (03_SCIENCE §8.5)", obj({
    "schema": {"const": "casefile/contrast@3"}, "synthetic": {"type": "boolean"}, "id": {"type": "string"},
    "pair": obj({"id": ref("pairId"), "a": ref("regionId"), "b": ref("regionId"), "preRegistered": {"type": "boolean"}, "lead": {"type": "boolean"}}),
    "variable": ref("analysedVariable"), "season": ref("seasonId"), "window": ref("window"), "family": ref("family"),
    "multiplicity": ref("multiplicity"), "status": ref("status"), "grade": {"enum": ["strong", "supported", "cant_tell_yet", None]},
    "reason": {"enum": ["outside_domain", "short_record", "too_short", "missing_year", "not_testable", "break_review", "exploration", None]},
    "estimand": {"const": "trend_in_difference"},
    "difference": obj({"years": ref("years"), "values": ref("values"), "units": {"type": "string"}}),
    "domain": ref("domain"), "stats": ref("stats"), "robustness": ref("robustness"),
    "doubts": {"type": "array", "items": ref("doubt"), "uniqueItems": True},
    "regions": obj({"a": side, "b": side}),
    "labels": obj({"oppositeFittedDirections": {"type": "boolean"}, "supportedOppositeTrends": {"type": "boolean"}, "ratesDiffer": {"type": "boolean"}}),
    "sensitivity": {"type": ["object", "null"], "properties": {"variable": ref("analysedVariable"), "path": {"type": "string"}, "window": ref("window"),
                    "rateImergPerDecade": {"type": "number"}, "rateMerraPerDecade": {"type": "number"}, "sameSign": {"type": "boolean"},
                    "imergExcludesZero": {"type": "boolean"}, "merraExcludesZero": {"type": "boolean"}},
                    "required": ["variable", "path", "window", "rateImergPerDecade", "rateMerraPerDecade", "sameSign", "imergExcludesZero", "merraExcludesZero"],
                    "additionalProperties": False},
    "practical": ref("practical"), "spine": ref("spine"), "chart": ref("chart"), "split": ref("pairSplit"), "text": ref("text"), "provenance": PROV}))

S("lineup", "Line-up — temperature and rain for one region, ANN and pre-registered seasons (M3; 03_SCIENCE §7.4)", obj({
    "schema": {"const": "casefile/lineup@3"}, "synthetic": {"type": "boolean"}, "region": ref("regionId"),
    "nTests": {"type": "integer", "minimum": 1}, "familySizes": obj({"confirmatory": {"type": "integer"}, "secondary": {"type": "integer"}}),
    "items": {"type": "array", "minItems": 1, "items": obj({
        "variable": ref("analysedVariable"), "season": ref("seasonId"), "family": ref("family"), "status": ref("status"),
        "grade": {"enum": ["strong", "supported", "cant_tell_yet", None]},
        "reason": {"enum": ["outside_domain", "short_record", "too_short", "missing_year", "not_testable", "break_review", "exploration", None]},
        "ratePerDecade": num_or_null, "rateLowPerDecade": num_or_null, "rateHighPerDecade": num_or_null, "units": {"type": "string"},
        "pAdjusted": num_or_null, "qWithinLineup": num_or_null, "path": {"type": "string"}})},
    "provenance": PROV}))

# ------------------------------------------------------------------ map and cells
S("map_meta", "Screening map — per-cell results for one variable and season on the 1° grid (M8; 03_SCIENCE §7.5)", obj({
    "schema": {"const": "casefile/map@3"}, "synthetic": {"type": "boolean"}, "variable": ref("analysedVariable"), "season": ref("seasonId"),
    "grid": ref("grid"), "window": ref("window"), "label": {"const": "exploration"}, "units": {"type": "string"},
    "nCells": {"type": "integer"}, "nTestable": {"type": "integer"}, "nSignificant": {"type": "integer"}, "fdrQ": {"const": 0.1},
    "colourLimit": {"type": "number"},
    "file": {"type": "string"}, "byteOrder": {"const": "little"}, "layout": {"const": "field-major: each field is a [nlat][nlon] block, in the order listed"},
    "fields": {"type": "array", "items": obj({"name": {"enum": ["rate", "rate_low", "rate_high", "p", "q", "flags"]},
               "dtype": {"enum": ["int16", "uint8", "float32"]}, "scale": {"type": "number"}, "offset": {"type": "number"}, "fill": {"type": ["number", "null"]}})},
    "flagBits": obj({"testable": {"const": 1}, "significant": {"const": 2}, "short_or_missing": {"const": 4}, "phi_out_of_range": {"const": 8},
                     "leftover_memory": {"const": 16}, "not_finite": {"const": 32}}),
    "provenance": PROV}))

S("cell_tiles", "Cell tiles — one value per year and season for every 1° cell, read one tile at a time (02_DATA §6)", obj({
    "schema": {"const": "casefile/cell_tiles@3"}, "synthetic": {"type": "boolean"}, "variable": ref("analysedVariable"), "grid": ref("grid"),
    "tile": obj({"rows": {"type": "integer"}, "cols": {"type": "integer"}}), "seasons": {"type": "array", "items": ref("seasonId")},
    "years": obj({"first": {"type": "integer"}, "last": {"type": "integer"}}), "units": {"type": "string"},
    "dtype": {"const": "int16"}, "byteOrder": {"const": "little"}, "scale": {"type": "number", "exclusiveMinimum": 0}, "offset": {"type": "number"},
    "fill": {"const": -32768}, "layout": {"const": "[row][col][season][year]"}, "path": {"const": "t/<tr>_<tc>.bin.gz"},
    "tilesPresent": {"type": "array", "items": {"type": "array", "items": {"type": "integer"}, "minItems": 2, "maxItems": 2}},
    "provenance": PROV}))

# ------------------------------------------------------------------ methods tables
S("methods", "Methods tables — the engine's own calibration, stress, coverage, power and critical values (03_SCIENCE §9)", obj({
    "schema": {"const": "casefile/methods@3"}, "synthetic": {"type": "boolean"}, "created": {"type": "string"}, "engine": {"type": "string"},
    "seedRule": {"type": "string"}, "note": {"type": "string"},
    "calibration": {"type": "array", "minItems": 1, "items": obj({"n": {"type": "integer"}, "phi": {"type": "number"}, "reps": {"type": "integer"},
                    "falseAlarmPct": {"type": "number"}, "passDomainPct": {"type": "number"}, "falseAlarmAmongPassPct": num_or_null})},
    "extraRows": {"type": "array", "items": obj({"kind": {"enum": ["ties", "growing_spread"]}, "n": {"type": "integer"}, "reps": {"type": "integer"},
                  "falseAlarmPct": {"type": "number"}})},
    "phiMax": {"type": "array", "minItems": 1, "items": obj({"n": {"type": "integer"}, "phiMax": {"type": "number"}})},
    "stress": {"type": "array", "items": obj({"family": {"enum": ["mixed_ar1_0.1_0.9", "ar2_0.15_0.65"]}, "n": {"type": "integer"},
               "mEff": {"type": "integer"}, "reps": {"type": "integer"}, "falseAlarmPct": {"type": "number"}, "falseAlarmAfterDomainPct": {"type": "number"}})},
    "coverage": {"type": "array", "items": obj({"n": {"type": "integer"}, "phi": {"type": "number"}, "multiplier": {"type": "number"},
                 "reps": {"type": "integer"}, "coveragePct": {"type": "number"}})},
    "power": {"type": "array", "items": obj({"n": {"type": "integer"}, "phi": {"type": "number"}, "effectSdPerYear": {"type": "number"},
              "reps": {"type": "integer"}, "powerPct": {"type": "number"}})},
    "leftoverCritical": {"type": "array", "minItems": 1, "items": obj({"n": {"type": "integer"}, "mEff": {"type": "integer"}, "phi": {"type": "number"},
                         "critical": {"type": "number"}, "reps": {"type": "integer"}})},
    "contrast": {"type": "array", "items": obj({"case": {"type": "string"}, "reps": {"type": "integer"}, "ratesDifferPct": {"type": "number"},
                 "supportedOppositePct": {"type": "number"}})},
    "mapNull": {"type": "array", "items": obj({"rows": {"type": "integer"}, "cols": {"type": "integer"}, "reps": {"type": "integer"},
                "mapsWithFalseDotPct": {"type": "number"}})},
    "golden": obj({"suite": {"type": "string"}, "total": {"type": "integer"}, "passed": {"type": "integer"}}),
    "families": obj({"confirmatory": {"type": "array", "items": {"type": "string"}}, "secondary": {"type": "array", "items": {"type": "string"}},
                     "alpha": {"type": "number"}, "secondaryQ": {"type": "number"}}),
    "prereg": obj({"sha256": ref("sha256"), "commit": str_or_null}),
    "inputManifest": obj({"sha256": ref("sha256")})}))

# ------------------------------------------------------------------ watch cases, offline set, view
S("casefile", "Watch case — beats with captions filled from results (S2)", obj({
    "schema": {"const": "casefile/casefile@3"}, "synthetic": {"type": "boolean"}, "id": {"type": "string", "pattern": "^[a-z][a-z0-9_]*$"},
    "uses": {"type": "object", "properties": {"kind": {"enum": ["contrast", "trend", "lineup"]}, "pair": {"type": "string"}, "region": {"type": "string"},
             "variable": ref("analysedVariable"), "season": ref("seasonId")}, "required": ["kind"], "additionalProperties": False},
    "ending": {"enum": ["supported", "cant_tell_yet", None]},
    "title": ref("text2"), "summary": ref("text2"),
    "results": {"type": "array", "items": {"type": "string"}, "minItems": 1},
    "beats": {"type": "array", "minItems": 1, "items": {"type": "object", "additionalProperties": False, "required": ["at", "caption"], "properties": {
        "at": {"enum": ["question", "place", "series", "difference", "verdict", "robustness", "lineup", "methods", "takeaway"]},
        "caption": ref("text2"), "highlight": {"type": "string"}, "durationMs": {"type": "integer", "minimum": 1000, "maximum": 20000}}}}}))

S("offline_set", "Offline case set — the cases and files inlined into the offline build (M10)", obj({
    "schema": {"const": "casefile/offline_set@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "cases": {"type": "array", "minItems": 1, "items": obj({"id": {"type": "string"}, "title": ref("text2"), "files": {"type": "array", "items": {"type": "string"}}})},
    "files": {"type": "array", "items": obj({"path": {"type": "string"}, "sha256": ref("sha256"), "bytes": {"type": "integer"}})},
    "totalBytes": {"type": "integer"}}))

S("view", "View state in the URL hash (01_ARCHITECTURE §6)", {"type": "object", "additionalProperties": False, "required": ["screen"], "properties": {
    "screen": {"enum": ["home", "question", "place", "compare", "map", "methods", "watch", "offline", "data", "ai", "about"]},
    "region": ref("regionId"), "pair": {"type": "string"}, "variable": ref("analysedVariable"), "season": ref("seasonId"),
    "sensitivity": {"const": "imerg"}, "case": {"type": "string"}, "question": {"type": "string"}}})

# ------------------------------------------------------------------ exploration files (casefile-pipeline explore; added 13 Nov 2026, extended 14 Nov 2026)
num_list = {"type": "array", "items": num_or_null}
num12 = {"type": "array", "items": num_or_null, "minItems": 12, "maxItems": 12}
years_pair = {"type": "array", "items": {"type": "integer"}, "minItems": 2, "maxItems": 2}
S("map_years", "Yearly map frames — one [180][360] int16 frame per year for the globe's year slider, with anomalies and decades (exploration)", obj({
    "schema": {"const": "casefile/map_years@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "variable": ref("analysedVariable"), "season": ref("seasonId"), "label": {"const": "exploration"}, "grid": ref("grid"),
    "units": {"type": "string"}, "rule": {"enum": ["mean", "sum"]}, "years": {"type": "array", "items": {"type": "integer"}, "minItems": 1},
    "file": {"type": "string"}, "dtype": {"const": "int16"}, "byteOrder": {"const": "little"}, "layout": {"const": "[year][row][col]"},
    "scale": {"type": "number", "exclusiveMinimum": 0}, "offset": {"type": "number"}, "fill": {"const": -32768},
    "range": {"type": ["array", "null"], "items": {"type": "number"}, "minItems": 2, "maxItems": 2}, "source": {"type": "string"},
    "anomaly": {"oneOf": [{"type": "null"}, obj({"file": {"type": "string"}, "baseline": years_pair, "dtype": {"const": "int8"},
                                                 "scale": {"type": "number", "exclusiveMinimum": 0}, "fill": {"const": -128}, "clippedAt": {"type": "number"},
                                                 "layout": {"const": "[year][row][col]"}, "range": num_or_null})]},
    "decades": {"oneOf": [{"type": "null"}, obj({"file": {"type": "string"}, "frames": {"const": ["early", "late", "change"]},
                                                 "early": years_pair, "late": years_pair, "scale": {"type": "number", "exclusiveMinimum": 0},
                                                 "layout": {"const": "[frame][row][col]"}, "changeRange": num_or_null})]}}))

place_info = {"bbox": {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4},
              "centroid": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
              "areaKm2": {"type": "number", "minimum": 0}, "effectiveCells": {"type": "number", "minimum": 0},
              "spillShare": {"type": "number", "minimum": 0, "maximum": 1}, "passesSupport": {"type": "boolean"},
              "iso3": str_or_null, "continent": str_or_null}
explore_region_info = {"id": ref("regionId"), "kind": {"enum": ["country", "division", "comparison"]}, "name": ref("text2"), **place_info}
explore_area_info = {"id": {"type": "string", "pattern": "^(world|world:land|continent:[a-z_]+)$"}, "kind": {"enum": ["world", "continent"]},
                     "name": ref("text2"), **place_info}
trend_reason = {"enum": [None, "ok", "descriptive", "too_short", "missing_year", "constant", "not_finite", "phi_out_of_range"]}
trend_props = {"testable": {"type": "boolean"}, "reason": trend_reason, "exploratory": {"type": "boolean"}, "n": {"type": "integer"},
               "first": int_or_null, "last": int_or_null, "ratePerDecade": num_or_null, "lowPerDecade": num_or_null, "highPerDecade": num_or_null,
               "p": num_or_null, "q": num_or_null, "standsOut": {"type": "boolean"}, "phi": num_or_null, "jumpYear": int_or_null}
period = obj({"from": {"type": "integer"}, "to": {"type": "integer"}, "mean": num_or_null, "monthly": num12})
variable_block = obj({
    "unitsMonthly": {"type": "string"}, "units": {"type": "string"}, "rule": {"enum": ["mean", "sum"]},
    "years": {"type": "array", "items": {"type": "integer"}}, "annual": num_list, "monthlyClimatology": num12,
    "baseline": {"oneOf": [{"type": "null"}, years_pair]}, "annualAnomaly": {"type": ["array", "null"], "items": num_or_null},
    "monthlyAnomaly": {"type": ["array", "null"], "items": num12}, "rolling10": num_list,
    "decades": {"oneOf": [{"type": "null"}, obj({"early": period, "late": period, "change": num_or_null, "changeMonthly": num12})]},
    "trend": obj(trend_props),
    "monthTrends": {"type": "array", "minItems": 12, "maxItems": 12,
                    "items": obj({"testable": {"type": "boolean"}, "reason": trend_reason, "ratePerDecade": num_or_null, "p": num_or_null,
                                  "q": num_or_null, "standsOut": {"type": "boolean"}})}})
S("explore_region", "Region detail — yearly values, monthly climatology, past against present and an exploration trend of one region for every parameter", obj({
    "schema": {"const": "casefile/explore_region@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "label": {"const": "exploration"}, "grid": {"type": "string"}, "region": obj(explore_region_info),
    "boundary": obj({"source": {"type": "string"}, "licence": {"type": "string"}}),
    "variables": {"type": "object", "additionalProperties": variable_block}}))

S("explore_area", "Area detail — the world, the world's land or a continent: the same blocks as a region detail file (exploration)", obj({
    "schema": {"const": "casefile/explore_area@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "label": {"const": "exploration"}, "grid": {"type": "string"}, "area": obj(explore_area_info),
    "boundary": obj({"source": {"type": "string"}, "licence": {"type": "string"}}),
    "variables": {"type": "object", "additionalProperties": variable_block}}))

S("explore_trends", "Exploration trends of one parameter in every place, adjusted for the number of places tested", obj({
    "schema": {"const": "casefile/explore_trends@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "label": {"const": "exploration"}, "variable": ref("analysedVariable"), "units": {"type": "string"}, "rule": {"enum": ["mean", "sum"]},
    "q": {"type": "number"}, "method": {"type": "string"},
    "items": {"type": "array", "items": obj({"id": {"type": "string"}, "kind": {"enum": ["country", "division", "comparison", "world", "continent"]},
                                             "name": ref("text2"), "iso3": str_or_null, "continent": str_or_null, "passesSupport": {"type": "boolean"},
                                             "anomalyLast": num_or_null, "decadeChange": num_or_null, **trend_props})}}))

S("explore_hovmoller", "Latitude × year — the mean anomaly of each 1° latitude row in each year (exploration)", obj({
    "schema": {"const": "casefile/explore_hovmoller@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "label": {"const": "exploration"}, "variable": ref("analysedVariable"), "units": {"type": "string"}, "baseline": years_pair,
    "years": {"type": "array", "items": {"type": "integer"}}, "lat": {"type": "array", "items": {"type": "number"}},
    "cells": {"type": "array", "items": {"type": "integer"}}, "values": {"type": "array", "items": num_list},
    "range": num_or_null, "method": {"type": "string"}}))

S("explore_index", "Region detail index — every country, configured region and area with a detail file (exploration)", obj({
    "schema": {"const": "casefile/explore_index@3"}, "buildId": {"type": "string"}, "synthetic": {"type": "boolean"},
    "label": {"const": "exploration"}, "grid": {"type": "string"},
    "variables": {"type": "array", "items": obj({"id": ref("analysedVariable"), "units": {"type": "string"}, "rule": {"enum": ["mean", "sum"]},
                                                 "first": {"type": "integer"}, "last": {"type": "integer"},
                                                 "trendTested": {"type": "integer"}, "trendStandsOut": {"type": "integer"}})},
    "regions": {"type": "array", "items": obj({**explore_region_info, "file": {"type": "string"}})},
    "areas": {"type": "array", "items": obj({**explore_area_info, "file": {"type": "string"}})},
    "trends": {"type": "array", "items": {"type": "string"}}, "hovmoller": {"type": "array", "items": {"type": "string"}}}))

print("schemas written:", sorted(p.name for p in OUT.glob("*.schema.json")))

"""Does the engine (python/src/casefile_engine/stats.py, which wrote examples/golden/engine_cases.json)
reproduce the v2 spec pack's golden values for every field whose rule did not change?

Usage:  python -I check_v2_goldens.py <v2 engine_cases.json> <v3 engine_cases.json> <out.json>

Fields compared (v2 name -> v3 name): mk.*, ar1.*, mkAr1.*, sen.slope/intercept/ciLowPlain/ciHighPlain/nPairs,
residSd, ols.* -> ttest.*, pettitt.p/year and pettitt.K -> pettitt.U. The widened interval (sen.ciLow/ciHigh)
changed on purpose (multiplier 1.96 -> 2.25) and is reported separately.
"""
import json
import math
import sys

v2 = {c["id"]: c for c in json.load(open(sys.argv[1]))["cases"]}
v3 = {c["id"]: c for c in json.load(open(sys.argv[2]))["cases"]}

PAIRS = [
    ("mk", "mk", ["n", "S", "varS", "tau", "z", "p"]),
    ("ar1", "ar1", ["phiRaw", "phi", "vif"]),
    ("mkAr1", "mkAr1", ["varSStar", "z", "p"]),
    ("sen", "sen", ["slope", "intercept", "ciLowPlain", "ciHighPlain", "nPairs"]),
]
TT = [("slope", "slopePerYear"), ("intercept", "intercept"), ("se", "se"), ("r1", "r1"), ("phi", "phi"),
      ("nEff", "nEff"), ("seAdj", "seAdj"), ("t", "t"), ("df", "df"), ("p", "p"),
      ("ciLow", "ciLowPerYear"), ("ciHigh", "ciHighPerYear")]


def diff(a, b):
    if a is None and b is None:
        return 0.0
    if a is None or b is None:
        return math.inf
    if isinstance(a, bool) or isinstance(b, bool):
        return 0.0 if a == b else math.inf
    return abs(float(a) - float(b)) / max(1.0, abs(float(b)))


worst, where, widened = {}, {}, []
for cid, c2 in v2.items():
    e2, e3 = c2["expected"], v3[cid]["expected"]

    def note(key, d):
        if d > worst.get(key, -1):
            worst[key], where[key] = d, cid

    for k2, k3, fields in PAIRS:
        if e2.get(k2) is None:
            continue
        for f in fields:
            note(f"{k2}.{f}", diff(e3[k3].get(f), e2[k2].get(f)))
    note("residSd", diff(e3.get("residSd"), e2.get("residSd")))
    if e2.get("ols") is not None and e3.get("ttest") is not None:
        note("ttest.available", 0.0 if e2["ols"]["available"] == e3["ttest"]["available"] else math.inf)
        if e2["ols"]["available"]:
            for f2, f3 in TT:
                note(f"ttest.{f3}", diff(e3["ttest"].get(f3), e2["ols"].get(f2)))
    if e2.get("pettitt") and e3.get("pettitt"):
        note("pettitt.p", diff(e3["pettitt"]["p"], e2["pettitt"]["p"]))
        note("pettitt.year", diff(e3["pettitt"]["year"], e2["pettitt"]["year"]))
        note("pettitt.U_vs_K", diff(e3["pettitt"]["U"], e2["pettitt"]["K"]))
    if e2.get("sen") is not None:
        widened.append({"id": cid, "v2_1.96": [e2["sen"]["ciLow"], e2["sen"]["ciHigh"]],
                        "v3_2.25": [e3["sen"]["ciLow"], e3["sen"]["ciHigh"]]})

out = {"casesCompared": len(v2), "maxRelativeDifference": {k: (None if math.isinf(v) else v) for k, v in sorted(worst.items())},
       "worstCase": where, "widenedIntervalChanged": widened}
json.dump(out, open(sys.argv[3], "w"), indent=1)
bad = {k: v for k, v in worst.items() if v > 1e-9}
print("cases compared:", len(v2))
print("fields with relative difference > 1e-9:", {k: (where[k], v) for k, v in bad.items()} or "none")
print("largest difference over all fields:", max(worst.values()))

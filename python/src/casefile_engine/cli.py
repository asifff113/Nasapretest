# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""casefile-engine: the command line of the engine."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="casefile-engine", description="CaseFile Earth engine")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("selfcheck", help="recompute the golden values and compare them with examples/golden")
    p = sub.add_parser("examples", help="rebuild examples/ from the synthetic bundle (about 4 minutes)")
    p.add_argument("--out", default=None)
    p = sub.add_parser("synth-bundle", help="write the synthetic example as an input bundle (the format reference)")
    p.add_argument("out")
    p = sub.add_parser("check-bundle", help="check an input bundle: files, shapes, units, ranges")
    p.add_argument("bundle")
    p = sub.add_parser("prereg-check", help="validate config/preregistration.yaml against a bundle; print hashes and families")
    p.add_argument("--bundle", required=True)
    p.add_argument("--file", default=None)
    p = sub.add_parser("results", help="the results build (needs a committed pre-registration)")
    p.add_argument("--bundle", required=True)
    p.add_argument("--out", required=True, help="for example results/<build id>")
    p.add_argument("--build-id", required=True)
    p.add_argument("--created", default=None, help="ISO time; default SOURCE_DATE_EPOCH or now")
    p.add_argument("--prereg", default=None)
    p.add_argument("--set-current", action="store_true", help="also write current.json beside the build folder")
    p = sub.add_parser("methods-tables", help="re-simulate the methods tables (only after config/analysis.yaml changed)")
    p.add_argument("--reps", type=int, default=None)
    a = ap.parse_args(argv)

    from . import base as M
    from . import bundle as U

    if a.cmd == "selfcheck":
        r = U.selfcheck()
        return 1 if r["failed"] or r["total"] == 0 else 0
    if a.cmd == "examples":
        print(json.dumps(U.build_examples(a.out)))
        return 0
    if a.cmd == "synth-bundle":
        print("bundle written:", U.write_synthetic_bundle(Path(a.out)))
        return 0
    if a.cmd == "check-bundle":
        problems = U.check_bundle(Path(a.bundle))
        print("bundle OK" if not problems else "PROBLEMS:\n  - " + "\n  - ".join(problems))
        return 1 if problems else 0
    if a.cmd == "prereg-check":
        print("hashes for config/preregistration.yaml → hashes:")
        for k, v in U.bundle_hashes(Path(a.bundle)).items():
            print(f"  {k}: \"{v}\"")
        idx = json.loads((Path(a.bundle) / "regions/index.json").read_text(encoding="utf-8"))
        print("regions that pass the support rule (id: effective cells per grid):")
        for r in idx["regions"]:
            if r.get("inSet"):
                print(f"  {r['id']}: " + ", ".join(f"{g} {v['effectiveCells']}" for g, v in r["support"].items()))
        print("pairs in the bundle (id: passes the disjoint-cell rule):")
        for q in idx.get("pairs", []):
            print(f"  {q['id']}: {q['a']} vs {q['b']}: {'passes' if q['split']['passes'] else 'FAILS'}")
        pr, problems = U.load_prereg(Path(a.bundle), a.file)
        if "family_preview" in pr and not any("<fill" in str(x) for x in pr["family_preview"].get("confirmatory", [])):
            fam = pr["family_preview"]
            print(f"confirmatory family ({len(fam['confirmatory'])} tests, Holm):")
            print("\n".join("  " + k for k in fam["confirmatory"]))
            print(f"secondary family ({len(fam['secondary'])} tests, Benjamini-Hochberg)")
        if pr.get("sha256"):
            print("sha256 of the file:", pr["sha256"], "| commit:", pr.get("commit"))
        print("pre-registration OK: the results build may run" if not problems else "NOT READY:\n  - " + "\n  - ".join(problems))
        return 1 if problems else 0
    if a.cmd == "results":
        summary = U.build_results(Path(a.bundle), Path(a.out), a.build_id, a.created, a.prereg)
        if a.set_current:
            cur = Path(a.out).resolve().parent / "current.json"
            prev = []
            if cur.exists():
                old = json.loads(cur.read_text(encoding="utf-8"))
                prev = [x for x in [old.get("buildId"), *old.get("previous", [])] if x and x != a.build_id]
            cur.write_text(json.dumps({"schema": "casefile/current@3", "buildId": a.build_id, "path": f"results/{a.build_id}/",
                                       "previous": prev, "synthetic": bool(M.SYNTH)}, indent=1) + "\n", encoding="utf-8")
            summary["current"] = str(cur)
        print(json.dumps(summary))
        return 0
    if a.cmd == "methods-tables":
        M.REPS = a.reps or M.CFG["methods_tables"]["reps"]
        M.LREPS = max(50, M.REPS // 2) if a.reps else M.CFG["methods_tables"]["leftover_reps"]
        t = M.methods_tables("", "", {"confirmatory": [], "secondary": []})
        t["simKey"] = M.SIM_KEY
        out = Path(__file__).resolve().parent / "data/sim_tables.json"
        out.write_text(json.dumps(M.clean(t), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("written:", out)
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())

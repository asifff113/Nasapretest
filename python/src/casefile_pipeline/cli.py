# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""casefile-pipeline: access-check | fetch | regions | bundle (docs/01_ARCHITECTURE.md §6.1).

    casefile-pipeline access-check [--products M2TMNXSLV …]
    casefile-pipeline fetch [--products …] [--first YYYY-MM] [--last YYYY-MM] [--workers 8]
    casefile-pipeline regions [--bundle-id b1] [--boundaries <folder with the files and sources.json>]
    casefile-pipeline bundle [--bundle-id b1]
    casefile-pipeline explore --results ../results/<id> [--bundle-id b1]   (after the results build)

Every command prints counts, units, ranges and climatologies only (AGENTS.md rule 5).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def _month(s: str) -> str:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", s):
        raise argparse.ArgumentTypeError("use YYYY-MM")
    return s


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(prog="casefile-pipeline", description="CaseFile Earth data pipeline (Part 2)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("access-check", help="log in, find and read one granule of each product, print what it holds")
    p.add_argument("--products", nargs="*", help="source ids or short names (default: every product the release uses)")
    p = sub.add_parser("fetch", help="fetch every month of each product into .cache/monthly/ (resumes if stopped)")
    p.add_argument("--products", nargs="*")
    p.add_argument("--first", type=_month, help="first month (default: the record's first month)")
    p.add_argument("--last", type=_month, help="last month (default: the record's last month)")
    p.add_argument("--workers", type=int, default=8)
    p = sub.add_parser("regions", help="masks, support rule and pair splits → .cache/bundle/<id>/regions/")
    p.add_argument("--bundle-id", default="b1")
    p.add_argument("--boundaries", type=Path, help="use boundary files already in this folder (no download)")
    p = sub.add_parser("bundle", help="series, pairs, map fields and input_manifest.json → .cache/bundle/<id>/")
    p.add_argument("--bundle-id", default="b1")
    p = sub.add_parser("explore", help="yearly map frames and region detail files beside a results build (exploration)")
    p.add_argument("--bundle-id", default="b1")
    p.add_argument("--results", type=Path, required=True, help="the results build folder, for example ../results/r2")
    a = ap.parse_args(argv)

    from . import stages

    if a.cmd == "access-check":
        stages.access_check(a.products)
        return 0
    if a.cmd == "fetch":
        stages.fetch(a.products, a.first, a.last, a.workers)
        return 0
    if a.cmd == "regions":
        stages.regions_stage(a.bundle_id, a.boundaries)
        return 0
    if a.cmd == "explore":
        stages.explore_stage(a.bundle_id, a.results)
        return 0
    if a.cmd == "bundle":
        from casefile_engine.bundle import check_bundle

        out = stages.bundle(a.bundle_id)
        problems = check_bundle(out)
        print("bundle OK" if not problems else "\n".join(problems))
        return 1 if problems else 0
    return 2


if __name__ == "__main__":
    sys.exit(main())

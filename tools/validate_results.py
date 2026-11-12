"""Validates a results build (or any folder of result files): every JSON against the schema its "schema" field names.

    python tools/validate_results.py results/<build id>
"""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
NAME_FOR = {"casefile/map@3": "map_meta"}


def validate(folder: Path) -> list[str]:
    reg, docs = Registry(), {}
    for p in sorted((ROOT / "schemas").glob("*.schema.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        res = Resource.from_contents(d)
        reg = reg.with_resource(d["$id"], res).with_resource(p.name, res)
        docs[p.name] = d
    fail, n = [], 0
    for p in sorted(Path(folder).rglob("*.json")):
        if "golden" in p.parts or "power" in p.parts:
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        tag = d.get("schema") if isinstance(d, dict) else None
        if tag is None:
            fail.append(f"{p}: no schema field")
            continue
        sf = f"{NAME_FOR.get(tag) or tag.split('/')[1].split('@')[0]}.schema.json"
        if sf not in docs:
            fail.append(f"{p}: unknown schema {tag}")
            continue
        v = Draft202012Validator(docs[sf], registry=reg, format_checker=FormatChecker())
        for e in sorted(v.iter_errors(d), key=lambda e: list(e.path))[:3]:
            fail.append(f"{p}: {'/'.join(map(str, e.path))}: {e.message[:200]}")
        n += 1
    print(f"{n} files checked in {folder}")
    return fail


if __name__ == "__main__":
    problems = validate(Path(sys.argv[1]))
    print("results OK" if not problems else "\n".join(problems))
    sys.exit(1 if problems else 0)

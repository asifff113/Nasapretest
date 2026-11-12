"""Validates the spec pack: every JSON in examples/ against the schema its "schema" field names, every schema
against JSON Schema 2020-12, the pre-registration template against the example's structure, the config YAML
files for parse errors, and English/Bangla i18n key and placeholder parity (test X-04).

Usage:  python tools/validate_pack.py [pack root]      (exit code 1 on any failure)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1])
SCHEMAS = ROOT / "schemas"
NAME_FOR = {"casefile/map@3": "map_meta"}     # schema field → file name where they differ
fail = []


def load_registry():
    reg = Registry()
    docs = {}
    for p in sorted(SCHEMAS.glob("*.schema.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(d)
        res = Resource.from_contents(d)
        reg = reg.with_resource(d["$id"], res).with_resource(p.name, res)
        docs[p.name] = d
    return reg, docs


def schema_file_for(tag: str) -> str:
    name = NAME_FOR.get(tag) or tag.split("/")[1].split("@")[0]
    return f"{name}.schema.json"


def main():
    reg, docs = load_registry()
    print(f"schemas: {len(docs)} valid")
    n = 0
    for p in sorted((ROOT / "examples").rglob("*.json")):
        if "golden" in p.parts:
            json.loads(p.read_text(encoding="utf-8"))        # golden files: parse only (they are test fixtures)
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        tag = d.get("schema") if isinstance(d, dict) else None
        if tag is None:
            if "power" in p.parts:
                continue                                      # POWER API fixture (external format)
            fail.append(f"{p.relative_to(ROOT)}: no schema field")
            continue
        sf = schema_file_for(tag)
        if sf not in docs:
            fail.append(f"{p.relative_to(ROOT)}: unknown schema {tag}")
            continue
        v = Draft202012Validator(docs[sf], registry=reg, format_checker=FormatChecker())
        errs = sorted(v.iter_errors(d), key=lambda e: list(e.path))
        for e in errs[:3]:
            fail.append(f"{p.relative_to(ROOT)}: {'/'.join(map(str, e.path))}: {e.message[:200]}")
        if d.get("synthetic") is False:
            fail.append(f"{p.relative_to(ROOT)}: examples must be synthetic")
        n += 1
    print(f"examples: {n} validated")
    for p in sorted((ROOT / "config").rglob("*.yaml")):
        try:
            yaml.safe_load(p.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:  # noqa: PERF203
            fail.append(f"{p.relative_to(ROOT)}: YAML error {e}")
    # the pre-registration template keeps the structure of the schema (keys of the example)
    tmpl = yaml.safe_load((ROOT / "config/preregistration.yaml").read_text(encoding="utf-8"))
    req = docs["prereg.schema.json"]["required"]
    missing = [k for k in req if k not in tmpl]
    if missing:
        fail.append(f"config/preregistration.yaml: missing keys {missing}")
    if tmpl.get("status") != "draft":
        print("note: config/preregistration.yaml is not a draft (status:", tmpl.get("status"), ")")
    # i18n parity
    en = json.loads((ROOT / "config/i18n/en.json").read_text(encoding="utf-8"))
    bn = json.loads((ROOT / "config/i18n/bn.json").read_text(encoding="utf-8"))

    def flat(d, pre=""):
        out = {}
        for k, v in d.items():
            q = f"{pre}.{k}" if pre else k
            out.update(flat(v, q) if isinstance(v, dict) else {q: v})
        return out
    fe, fb = flat(en), flat(bn)
    ph = re.compile(r"\{([a-zA-Z_]+)\}")
    for k in sorted(set(fe) ^ set(fb)):
        fail.append(f"i18n: key only in one language: {k}")
    for k in sorted(set(fe) & set(fb)):
        if set(ph.findall(str(fe[k]))) != set(ph.findall(str(fb[k]))):
            fail.append(f"i18n: placeholders differ for {k}")
    print(f"i18n: {len(fe)} keys checked")
    if fail:
        print("\nFAILURES:")
        for f in fail:
            print(" -", f)
        sys.exit(1)
    print("pack OK")


if __name__ == "__main__":
    main()

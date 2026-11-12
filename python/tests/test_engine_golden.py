# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""G-01…G-11: the engine reproduces every golden value in examples/golden (docs/07_TESTS.md §2). Fast."""
import json

import numpy as np

from casefile_engine import base as M
from casefile_engine import bundle as U
from casefile_engine import stats as R


def test_golden_values_match():
    r = U.selfcheck(verbose=False)
    assert r["total"] >= 60
    assert r["failed"] == [] and r["passed"] == r["total"]


def test_selfcheck_catches_a_changed_statistic(monkeypatch):
    orig = R.inflation
    monkeypatch.setattr(R, "inflation", lambda n, phi: orig(n, phi) * 1.001)
    assert U.selfcheck(verbose=False)["failed"], "a 0.1% change in the variance inflation must fail the golden check"


def test_seeds_are_fixed():
    assert R.seed_for("calibration|30|0.3|") == int.from_bytes(__import__("hashlib").sha256(b"calibration|30|0.3|").digest()[:8], "little")


def test_no_trend_gives_about_five_percent_false_alarms():
    rng = R.rng_for("unit|false-alarm||")
    t = np.arange(1980, 2020, dtype=float)
    hits = sum(R.mk_ar1(t, rng.normal(size=40))["p"] < 0.05 for _ in range(600))
    assert 0.02 <= hits / 600 <= 0.08


def test_full_methods_tables_are_shipped_and_match_the_configuration():
    t = U.sim_tables()                       # raises if config/analysis.yaml changed since they were simulated
    assert t["calibration"][0]["reps"] == M.CFG["methods_tables"]["reps"]
    assert all(row["phiMax"] is not None for row in t["phiMax"])


def test_examples_validate_against_their_schemas():
    from validate_results import validate
    assert validate(M.ROOT / "examples") == []

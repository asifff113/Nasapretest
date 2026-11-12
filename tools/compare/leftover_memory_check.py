"""Leftover-memory domain check: the playbook's single-null construction (rt_pool.py, critical value
from AR(1) 0.5 regions) against a memory-matched construction (critical value from AR(1) regions at
the region's own bias-corrected memory, in steps of 0.1), on independent cells.

Usage: python -I leftover_memory_check.py <recompute scripts folder> <this folder> <out.json>
"""
import json
import sys

import numpy as np

sys.path.insert(0, sys.argv[1])
sys.path.insert(0, sys.argv[2])
from rt_check import ar1, ar2  # noqa: E402
import compare_mkar1_ttest as C  # noqa: E402


def acf(e, k):
    e = e - e.mean()
    return np.sum(e[k:] * e[:-k]) / np.sum(e * e)


def stat_cell(x):
    n = len(x); t = np.arange(n); b, a = np.polyfit(t, x, 1); e = x - (a + b * t)
    r1 = acf(e, 1)
    return np.mean([acf(e, k) - r1 ** k for k in (2, 3, 4)])


def cells(rng, kind, n, m, phi=None):
    if kind == "AR1":
        return [ar1(rng, n, phi) for _ in range(m)]
    if kind == "mix":
        return [ar1(rng, n, 0.1) + ar1(rng, n, 0.9) for _ in range(m)]
    return [ar2(rng, n, 0.15, 0.65) for _ in range(m)]


def region(rng, kind, n, m, phi=None):
    xs = cells(rng, kind, n, m, phi)
    s = np.mean([stat_cell(x) for x in xs])
    mean_series = np.mean(xs, axis=0)
    years = np.arange(n) + 1980
    _, phi_t, _ = C.spec_mkar1(years, mean_series)
    return s, phi_t


BINS = np.round(np.arange(0.0, 0.81, 0.1), 1)

if __name__ == "__main__":
    rng = np.random.default_rng(11)
    out = {"design": "independent cells; 95th percentile critical values; 1000 null regions per value; 500 test regions per row",
           "rows": []}
    for n in (25, 46):
        for m in (5, 20):
            single = np.quantile([region(rng, "AR1", n, m, 0.5)[0] for _ in range(1000)], 0.95)
            matched = {float(b): np.quantile([region(rng, "AR1", n, m, float(b))[0] for _ in range(1000)], 0.95) for b in BINS}
            row = {"n": n, "cells": m, "crit_single_ar1_0.5": float(single),
                   "crit_matched": {str(k): float(v) for k, v in matched.items()}}
            for label, kind, phi in (("AR(1) 0.0", "AR1", 0.0), ("AR(1) 0.3", "AR1", 0.3), ("AR(1) 0.6", "AR1", 0.6),
                                     ("mixed 0.1+0.9", "mix", None), ("AR(2) 0.15/0.65", "ar2", None)):
                fs = fm = 0
                for _ in range(500):
                    s, ph = region(rng, kind, n, m, phi)
                    fs += s > single
                    b = float(min(BINS[-1], max(0.0, np.round(ph, 1))))
                    fm += s > matched[b]
                row[label] = {"single_null_pct": round(100 * fs / 500, 1), "memory_matched_pct": round(100 * fm / 500, 1)}
            out["rows"].append(row)
            print(n, m, {k: v for k, v in row.items() if k not in ("crit_matched",)})
    json.dump(out, open(sys.argv[3], "w"), indent=1)

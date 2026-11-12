# `casefile_pipeline` — Part 2 (backend / data pipeline)

**Status: skeleton only.** Each module has a docstring saying what it will do; no logic is written yet.
The CLI (`cli.py`) is still the stub that exits with "not built yet".

## What this package must produce

`casefile-pipeline bundle` writes `.cache/bundle/<id>/` in the exact format of `docs/01_ARCHITECTURE.md` §5,
and `uv run casefile-engine check-bundle <bundle>` accepts it. That bundle is the only thing the engine reads.
The format reference is the synthetic bundle: `uv run casefile-engine synth-bundle <dir>`.

## Before you start

1. Read `AGENTS.md` (the hard rules), `docs/01_ARCHITECTURE.md` §5–§6, and Part 2 of `docs/05_BUILD_PLAN.md`.
2. Get a NASA Earthdata Login and approve **NASA GESDISC DATA ARCHIVE** (build plan, Part 0).
   Credentials go only in Codespaces secrets `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD`: never in a file or commit.
3. Work on the branch **`part-2-pipeline`**. You own only `python/src/casefile_pipeline/`,
   `python/tests/pipeline/` and `docs/ai_log/part-2.md`.
4. `cd python && uv sync --extra pipeline`, then `uv run casefile-engine selfcheck` (expects 60/60).

## Steps (each has a ready prompt in `prompts/`)

| Step | Prompt | Modules | Command |
|---|---|---|---|
| 2A Access check and fetch | `prompts/part-2A.txt` | `sources/earthdata.py`, `sources/merra2.py`, `sources/imerg.py`, `manifest.py`, `cli.py` | `casefile-pipeline access-check`, `fetch` |
| 2B Regions, masks, support rule (parallel with 2A) | `prompts/part-2B.txt` | `boundaries.py`, `regions.py`, `cli.py` | `casefile-pipeline regions` |
| 2C Series, pairs, map field, bundle (after 2A + 2B) | `prompts/part-2C.txt` | `series.py`, `mapfield.py`, `manifest.py`, `cli.py` | `casefile-pipeline bundle --bundle-id b1` |
| 2D Add or swap a dataset (later) | `prompts/part-2D.txt` | one new reader in `sources/` | — |

Tests go in `python/tests/pipeline/` (ids P-01…P-19 in `docs/07_TESTS.md` §4); none may use the network.

## Rules that matter most here

- Never edit `python/src/casefile_engine/`, `schemas/`, `examples/` or `config/` (except what step 2D names).
- The pipeline prepares, it does not test: no trend, p-value or yearly series is computed or printed.
  Until `config/preregistration.yaml` is committed, print climatologies, counts, units and ranges only.
- Never build NASA file names or `*.gesdisc.eosdis.nasa.gov` URLs by hand; find files through `earthaccess`/CMR.
- No hard-coded variable, region or pair id: read them from `config/`.
- Commit messages end with `AI-assisted: <tool> (<model>)`; log each session in `docs/ai_log/part-2.md`.

# `casefile_pipeline` — Part 2 (backend / data pipeline)

Fetches NASA data and writes the input bundle `.cache/bundle/<id>/` in the format of `docs/01_ARCHITECTURE.md` §5,
which `uv run casefile-engine check-bundle <bundle>` accepts. It computes no trend, no p-value and no yearly series
for display, and it prints counts, units, ranges and climatologies only.

## Commands (run in `python/`, after `uv sync --extra pipeline`)

```bash
uv run casefile-pipeline access-check                 # log in; one granule per product: route, dims, units, fill, ranges
uv run casefile-pipeline fetch                        # every month of every product → .cache/monthly/ (resumes if stopped)
uv run casefile-pipeline fetch --first 2020-01 --last 2022-12      # a small window (each product's record still bounds it)
uv run casefile-pipeline regions --bundle-id b1       # boundary files → masks, support rule, pair splits → regions/
uv run casefile-pipeline bundle  --bundle-id b1       # series, pairs, map fields, input_manifest.json; then check-bundle
uv run casefile-engine check-bundle ../.cache/bundle/b1
uv run casefile-engine prereg-check --bundle ../.cache/bundle/b1
```

Login: a free NASA Earthdata account (urs.earthdata.nasa.gov) with **NASA GESDISC DATA ARCHIVE** approved, given as
`EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` in the environment or a `~/.netrc` line for `urs.earthdata.nasa.gov`.
An api.nasa.gov key does not work. Credentials never enter the repository, a log or the bundle.

## Modules

| Module | Does |
|---|---|
| `sources/earthdata.py` | Login, CMR search through earthaccess, month bookkeeping, the three routes (OPeNDAP subset, remote read, whole file), the cache in `.cache/raw/` |
| `sources/__init__.py`, `merra2.py`, `imerg.py` | The `Reader` (group, axis order, units as documented, grid, box) and one registered reader per product |
| `sources/boundary_files.py` | Downloads the boundary files and their licence statements into `.cache/boundaries/` |
| `units.py`, `grids.py` | Unit conversions to each variable's monthly unit; the grid list (the engine's definitions) |
| `boundaries.py`, `regions.py` | Region outlines from `config/regions.yaml`; 5 × 5 masks, S1–S2, pair splits (S3), `regions/index.json` |
| `series.py`, `mapfield.py`, `manifest.py` | Region and pair series; the conservative 1° regrid and annual field; `input_manifest.json` |
| `stages.py`, `cli.py` | The four stages and the command line |

A new dataset is one more reader in `sources/` plus its entries in `config/` (`docs/02_DATA.md` §14).

## Tests

`uv run pytest tests/pipeline` (no network). P-04 runs on the real boundary files once `regions` has downloaded them.
On Windows with the repository on another drive than the temporary folder, run the full suite with
`uv run pytest -m "not slow" --basetemp=../.cache/pytest-tmp` (an engine test uses `os.path.relpath`).

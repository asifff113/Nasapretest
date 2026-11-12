# CaseFile Earth — final build package

CaseFile Earth is a NASA Space Apps 2026 project for the challenge "Be an Earth System Trend Detective!". A user picks a question and a place, or two places to compare. The tool tests the trend in temperature or rain, or the trend in the difference between two regions, and shows a graded verdict or "can't tell yet", in English and Bangla, with its evidence.

This folder is the repository to start from. The statistics engine is included and tested. The rest is built from `docs/05_BUILD_PLAN.md`: seven independent parts, each with a prompt to paste into a coding agent and checks that prove it is done.

## Start here

1. Create a public GitHub repository, put this folder's contents in it and push (build plan, Part 0).
2. Check the engine on your machine:
   ```bash
   cd python && uv sync && uv run casefile-engine selfcheck && uv run pytest -m "not slow"
   ```
   Expected: `golden self-check: 60/60 cases match`, and every test passes.
3. Open `docs/05_BUILD_PLAN.md`. Give Part 2 (data pipeline) and Part 3 (site) to two people or two agent sessions at once; they share no file. The prompt for each step is a file in `prompts/`.
4. When the data bundle exists, a person fills and commits the pre-registration and runs the results build (Part 4). Then Part 5 puts the site on the real results and deploys it, and Part 6 polishes.

## The parts

| Part | What | Built by | Depends on |
|---|---|---|---|
| 0 | Repository, CI, Pages | an agent, 1 prompt | — |
| 1 | The engine | **already built**; you only run its tests | — |
| 2 | Data pipeline: NASA data → the input bundle (steps 2A, 2B, 2C; 2D adds a dataset) | agents | Part 0 |
| 3 | The site on the synthetic examples (steps 3A–3E) | agents | Part 0 |
| 4 | Pre-registration and the real results | a person, with commands | Parts 1, 2 |
| 5 | The site on real results; deploy | an agent | Parts 3, 4 |
| 6 | Polish and final checks | an agent and a person | Part 5 |

Each part has its own branch and its own folders, works from files already in this package, and merges without conflicts (build plan, "How the parts stay independent").

## What is in the package

| Path | What |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | The rules every coding agent follows |
| `docs/05_BUILD_PLAN.md` | **The plan: parts, prompts, checks, merging** |
| `prompts/` | **Each step's prompt as its own file, ready to paste or hand to a teammate** |
| `docs/01_ARCHITECTURE.md` | The architecture: components, the input bundle, results layout, budgets, deploy, decisions |
| `docs/00_BRIEF.md` | What we build and why; scope; the cut list |
| `docs/02_DATA.md` | Data sources and routes (checked against NASA's catalogue on 11 Nov 2026), units, regions, support rule; §14: adding a dataset |
| `docs/03_SCIENCE.md` | Every statistical rule the engine implements; wording rules |
| `docs/04_UI.md` | Screens, components, accessibility, style tokens, toolkit |
| `docs/07_TESTS.md` | Test ids |
| `docs/10_FINDINGS.md`, `docs/12_METHOD_COMPARISON.md` | Findings, and how the methods were chosen |
| `docs/AI_USE.md`, `docs/ai_log/` | The AI-use statement and the session logs |
| `python/src/casefile_engine/` | **The engine (provided, frozen)**, with `data/sim_tables.json`, the full-size methods tables |
| `python/src/casefile_pipeline/` | A stub: Part 2 builds it |
| `python/tests/` | The engine's tests |
| `schemas/` | 19 JSON Schemas: the format of every file the site reads |
| `examples/` | A complete synthetic results build, with every state the screens must show, and the golden values |
| `config/` | Analysis settings (frozen), the pre-registration template with recommended values, variables, regions, sources, known breaks, strings in English and Bangla |
| `templates/` | The Methods page text; an optional usability test |
| `tools/` | `validate_pack.py`, `validate_results.py`, the schema builder, and the studies behind the method decisions |

## What was verified while making this package

- **The engine reproduces its golden values:** 60 of 60 cases; a 0.1% change in one formula makes the check fail.
- **`examples/` is exactly what the engine builds:** rebuilt from the synthetic input bundle and compared byte for byte.
- **The real build path works end to end:** a bundle on disk (with disjoint-cell pair files), a YAML pre-registration and `casefile-engine results` give the same numbers as the examples, a valid file set, the map and all 648 cell tiles; without a committed pre-registration the build refuses and writes nothing.
- **A new dataset needs no engine change:** a test adds a variable that exists only in the configuration, on a grid the engine has never seen, and runs a full results build with it.
- **Every example and results file validates** against its schema; English and Bangla strings have the same 244 keys.
- **The methods tables are simulated at full size** (2 000 series per row, fixed seeds) and shipped.
- **The data facts are current:** collection names, versions, file sizes and the OPeNDAP addresses were read from NASA's catalogue on 11 Nov 2026; the `earthaccess` functions the plan names exist in version 0.19.

**Not verified here** (it needs your Earthdata login): an actual data request. Step 2A starts with an access check on one file of each product and has two fallback routes.

## Known limits, stated on the Methods page

- When a record's true year-to-year memory is near the edge of the validated range (0.6–0.8), false alarms among the records that still receive a verdict can reach 16%; for memory up to 0.5 and 25 or more years they are 3–7% (`docs/03_SCIENCE.md` §5.2).
- The engine is one implementation, checked against earlier expected values and by simulation; there is no second, independent implementation.
- Null-map behaviour of the screening map was not simulated; the map is labelled exploration and gives no verdicts.

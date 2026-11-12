# AGENTS.md — rules for coding agents on CaseFile Earth

CaseFile Earth is a NASA Space Apps 2026 project for the challenge "Be an Earth System Trend Detective!". A user picks a question and a place from a fixed set, or two places to compare. The tool tests the trend in temperature or rain, or the trend in the difference between two regions, and shows a graded verdict or "can't tell yet", in English and Bangla, with its evidence. A provided Python engine computes every statistic once, in the build. A static site displays the result files and works offline.

**Before any task, read:** this file; `docs/01_ARCHITECTURE.md` (the authority on modules, files and commands); your step in `docs/05_BUILD_PLAN.md` and the sections it names.

## Hard rules

1. **The documents win.** Build what they say. If they are ambiguous, contradict each other or look wrong, stop and ask. Never improvise statistics or data handling.
2. **The engine is provided and frozen.** Do not edit anything under `python/src/casefile_engine/`. Every statistic and every verdict sentence comes from it. If it looks wrong, write down the input that shows it and stop.
3. **The pipeline prepares, it does not test.** `python/src/casefile_pipeline/` fetches data, converts units, computes region weights and monthly means, and writes the input bundle (01 §5). It computes no trend, no p-value and no yearly series for display.
4. **The site computes nothing.** `web/` reads result files and formats them. No mean, slope, difference, p-value or rounding of a statistic in the browser; arithmetic is for layout only. Decoding a binary file (scale, fill, flag bits) is allowed.
5. **Pre-registration before any real trend.** Nothing computes, prints, plots or displays a trend, a yearly series or an early-against-late comparison from real data until `config/preregistration.yaml` is committed with `status: committed`. `casefile-engine results` enforces this. Before that, checks on real data show climatologies, counts, units and ranges only. Synthetic data in `examples/` are exempt.
6. **Never choose pre-registered values.** Agents do not pick or change pairs, thresholds, windows, seasons or alpha in `config/preregistration.yaml`. People do, before the commit; nobody does after.
7. **Contracts are shared.** Do not edit `schemas/`, `examples/` or `config/` unless your step's prompt says so. Every JSON file you write validates against its schema (`tools/validate_pack.py`, `tools/validate_results.py`).
8. **Never invent** data, numbers, citations, DOIs, URLs, product, collection or variable names, or API parameters. If the documents do not say, stop and ask.
9. **Network only in the pipeline's `sources/`.** Find NASA files through `earthaccess` and CMR; never build file names by hand (MERRA-2 prefixes change over the record) and never use `*.gesdisc.eosdis.nasa.gov` addresses. The site fetches only its own files; the offline build fetches nothing.
10. **Careful words** (`docs/03_SCIENCE.md` §12). "Consistent with", never "caused by", "due to" or "proves". "Can't tell yet" is not "no change", and the screen says so. A comparison is "the trend in the difference", never two significance labels side by side. IMERG is a sensitivity check, never a confirmation. MERRA-2 is labelled model output. Every user-visible string comes from the string files, in English and Bangla: `config/i18n/` (the engine's sentences and shared strings; read-only) and `web/src/i18n/` (strings the site adds).
11. **No secrets, no AI in the product.** Credentials live only in Codespaces secrets. The product makes no LLM call.
12. **Synthetic stays synthetic.** Files in `examples/` carry `"synthetic": true` and show a banner. Never mix them into `results/`.
13. **Tests are not negotiable.** Write tests with the code. Never weaken, skip or delete a test, change a golden value or edit `config/analysis.yaml` to get green.
14. **Stay in your part.** Work on your part's branch and change only the files it owns (`docs/05_BUILD_PLAN.md`, "How the parts stay independent"). Hard-code no variable, region or pair id: read them from `config/` or from the result files. Keep the cut list cut (`docs/00_BRIEF.md` §6).
15. **Show, don't claim.** "Done" means every check of the step was run and its real output shown. After two failed attempts at the same error, stop and report the error, what you tried and two options.
16. **Acknowledge AI use.** End every commit message with `AI-assisted: <tool> (<model>)`. Start every new source file with the comment `Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.` Add a row to your part's log `docs/ai_log/part-<n>.md` for each session.
17. **No AI contributors.** Never add a `Co-Authored-By:` trailer for an AI tool, and never make an AI tool the author, co-author or contributor of a commit or pull request. Commits are authored by the person who runs the session. Disable your tool's automatic co-author line (Claude Code: `.claude/settings.json` in this repository already does).

## Commands

```bash
# engine and pipeline (in python/)
uv sync                                            # add --extra pipeline for Part 2
uv run casefile-engine selfcheck                   # golden values: 60/60 must match
uv run pytest -m "not slow"                        # fast tests
uv run pytest -m slow                              # rebuilds examples/ and runs a full build (about 8 minutes)
uv run casefile-engine synth-bundle <dir>          # the synthetic input bundle: the format reference
uv run casefile-pipeline access-check | fetch | regions | bundle      # Part 2 builds these
uv run casefile-engine check-bundle <bundle>
uv run casefile-engine prereg-check --bundle <bundle>
uv run casefile-engine results --bundle <bundle> --out ../results/<id> --build-id <id> [--set-current]

# whole repository (from the root)
uv run --project python python tools/validate_pack.py              # examples, config, i18n parity → "pack OK"
uv run --project python python tools/validate_results.py results/<id>

# site (in web/; Part 3 builds it)
npm ci && npm run dev
npm run typecheck && npm run lint && npm test
npm run test:e2e                                   # Playwright on examples/ or on a results build
npm run build && npm run build:offline
```

## Style

- **Python 3.11+:** type hints, docstrings that state units, ruff clean. No notebooks in `src/`.
- **TypeScript:** strict, no `any`. Numbers are formatted only through `web/src/i18n/format.ts` (Bangla digits, the minus sign U+2212).
- **JSON:** UTF-8; validates against `schemas/`.

## Where things are

| Need | File |
|---|---|
| The parts, their checks and their prompts | `docs/05_BUILD_PLAN.md` |
| Modules, the input bundle, results layout, budgets, deploy, decisions | `docs/01_ARCHITECTURE.md` |
| What we build and why; scope; the cut list | `docs/00_BRIEF.md` |
| Data sources, routes, units, regions, support rule | `docs/02_DATA.md` |
| Every statistical rule, the validated domain, families, wording | `docs/03_SCIENCE.md` |
| Screens, components, accessibility, style tokens, toolkit | `docs/04_UI.md` |
| Test ids | `docs/07_TESTS.md` |
| Output formats and worked examples | `schemas/`, `examples/` |
| Thresholds, the pre-registration, variables, regions, known breaks, strings | `config/` |
| How the methods were chosen (evidence) | `docs/12_METHOD_COMPARISON.md`, `tools/decide/`, `tools/compare/` |
| AI-use statement and log | `docs/AI_USE.md` |

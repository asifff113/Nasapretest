# Prompts, one file per step

Each file is one step of `docs/05_BUILD_PLAN.md`, complete with its rules: paste it into a coding agent that has the repository open, or hand it to a teammate. The files are generated from the plan (`python tools/make_prompts.py`); edit the plan, not these.

| File | Step | Branch | Can start when |
|---|---|---|---|
| `part-0.txt` | Repository, CI, Pages | `main` | now |
| `part-2A.txt` | Access check and fetch | `part-2-pipeline` | Part 0 is done |
| `part-2B.txt` | Regions, masks, support rule | `part-2-pipeline` | Part 0 is done (parallel with 2A) |
| `part-2C.txt` | Series, pair series, map field, the bundle | `part-2-pipeline` | 2A and 2B are done |
| `part-2D.txt` | Add or swap a dataset | `part-2-pipeline` | when the official resources are known; fill the `<…>` first |
| `part-3A.txt` | Site foundation, Question, Place | `part-3-site` | Part 0 is done |
| `part-3B.txt` | Line-up, Verdict, Compare | `part-3-site` | 3A is done |
| `part-3C.txt` | Screening map and cell pages | `part-3-site` | 3A is done (parallel with 3B) |
| `part-3D.txt` | Watch cases, Methods, text pages | `part-3-site` | 3B is done |
| `part-3E.txt` | The offline file | `part-3-site` | 3B–3D are done |
| `part-4.txt` | Running the results build | `part-4-results` | the bundle exists and a person has filled the pre-registration |
| `part-5.txt` | The site on real results; deploy | `part-5-release` | Parts 3 and 4 are merged |
| `part-6A.txt` | Polish loop | `part-6-polish` | Part 5 is done |

Part 1 has no prompt: the engine is provided, and its checks are three commands in the plan.

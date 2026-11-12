# AI use — statement and record

The FAQ requires a description of how "Super Intelligence" (SI) tools were used (#5, TRUE in both fact-checks). The local guide wants each tool, the prompts it got and the data it worked on. This file is that record. §1 is the statement for the project page and the app's AI-use page; §3 records the AI work that shaped the plan and the spec; §4 logs every coding-agent session. AI-council tables and scores never appear in the videos, slides or project page; they stay here and in the playbook's decision record (v3 6.6).

Check the official wording in the Submission guide and adjust §1 if it asks for more.

---

## 1. Statement (for the project page and the app's "AI use" page; fill the placeholders)

> **How we used Super Intelligence (SI) tools.** We used SI tools in four ways. (1) **Planning:** we asked 17 AI advisors (several models, each given a role such as statistician or skeptic) to critique our plan, had two research tools fact-check 44 of the claims, merged the advice by fixed rules (verified facts first, then feasibility, then scientific validity), let our own simulation code settle every statistical dispute, and had a different model red-team the merged plan. (2) **Specification and engine:** an AI assistant helped write our specification (documents, data formats, test cases with expected values, prompts) and wrote the statistics engine from it. The engine's numbers were checked against an earlier set of expected values, by simulation studies whose rules were fixed before they ran, and by tests that rebuild every example exactly. (3) **Code:** AI coding assistants (<tools and models>) wrote the data pipeline and the website from that specification, checked by tests and read by a person. (4) **Language:** AI drafted Bangla and English interface text, which a native Bangla reader corrected. People decided the design, the statistical methods, every threshold, the regions and the comparisons, and we committed those choices before we looked at any real trend.
>
> **SI in the product.** None. No AI computes, changes or words any number. Every value, verdict and sentence on screen comes from one tested Python engine and fixed templates.
>
> **Media.** <No AI-generated images, video or audio are used. / Any AI-generated image, video or audio is labelled "AI-generated".>
>
> **Record.** Every AI-assisted commit ends with `AI-assisted: <tool> (<model>)`; new source files start with a one-line acknowledgement; this file lists each tool, its prompts and the data it worked on.

---

## 2. Rules for the record

- One row per agent session, written when the session ends, in that part's own file `docs/ai_log/part-<n>.md` (separate files, so parts built on separate branches never conflict). §4 shows the columns.
- Name the step of `05_BUILD_PLAN.md` (for example 2A).
- Say which data the AI saw: spec files only, synthetic examples, or real data (and whether before or after the pre-registration).
- "Human review" says who checked the result and how: tests run, read line by line, a native-speaker check.
- Record problems honestly: a wrong formula caught by a test, an invented API parameter, a number that did not match. An honest log is worth more than a clean one.
- Keep the prompts. Prompts for the steps are in `05_BUILD_PLAN.md`; anything else (council, fact-check, red team) is kept in the team drive, linked in §3.

---

## 3. Record of AI work on the plan and the spec

| # | What | Tools and models | Prompts (where kept) | Data the AI worked on | What it produced | Human decisions and checks |
|---|---|---|---|---|---|---|
| 1 | Spec pack v1 and v2 (28–29 Oct 2026) | Claude (claude.ai) | <link: team drive> | The challenge page capture (Details tab), the challenge author's video transcript, the Bangladesh guides | `casefile-earth-spec-v2.zip`: documents, schemas, configuration, synthetic examples, golden values, prompts | Scope, roles, methods and data choices by the team |
| 2 | AI council (29–31 Oct 2026): 17 answers | GPT-6 Astra ×3 (statistician, skeptic, architect), Minimax, GLM, Gemini 4 Argon ×2 (data, validation), Mistral ×2 (skeptic, story), DeepSeek, Kimi (project manager), Meta AI (Bangladesh), Doubao, Manus, Grok (contrarian), Copilot, Qwen | <link: team drive> | Team playbook v2 and the challenge statement | 48 concepts in 16 answers (Qwen proposed none), 13 consensus points, 13 disagreements, 12 one-off ideas | The team kept CaseFile Earth; each dispute was ruled by verified facts, then feasibility, then validity, and statistical disputes by our own simulation (playbook v3 §1–§5) |
| 3 | Fact-check: 44 claims | Gemini 4 Argon Deep Research; Perplexity | <link: team drive> | Claims from the council and from playbook v2 | A verdict per claim (TRUE, FALSE, CAN'T VERIFY), with sources | Where one checker verified a claim on an official page and the other could not open it, the claim was treated as verified; where they conflicted (#9, #16a, #17), a person opened the source or flagged the item |
| 4 | Merge and recompute: Team Playbook v3 | <tool and model> | <link> | The council answers, the fact-check, playbook v2, the organisers' guides | Playbook v3 and the recompute scripts (`trend-recompute-scripts.zip`: NumPy 2.5, SciPy 1.18.1, statsmodels 0.15.0, pymannkendall 1.4.3; 2 000 series per cell, fixed seeds) | Every checkable number was re-run in code; the team ruled on each change |
| 5 | Red-team review of v3 | <another model> | <link> | Playbook v3 | Three simulated judges scored the plan 16–17 out of 25; 32 points | Every number the review gave that code can check was re-run, and all held; 26 points accepted, 6 partly accepted, none rejected (playbook v3 §9) |
| 6 | Spec pack v3 | Claude, in a Claude Code session (configured model `claude-opus-5-5`; the serving model may differ) | The team's request; kept in the team drive | `casefile-earth-spec-v2.zip`, Team Playbook v3, `trend-recompute-scripts.zip` | `casefile-earth-spec-v3.zip`: the documents, schemas, configuration, synthetic examples, golden values and prompts rewritten for v3; the pre-registration template; the build sequence and rebuild checklist; the method comparison and its evidence (`tools/compare/`); `CHANGES.md` | <who reviewed which files> |
| 7 | v3.1 update (3 Nov 2026): the three open method decisions; files for a guide AI (since removed) | Claude, in a Claude Code session (configured model `claude-opus-5-5`; the serving model may differ) | The team's request; kept in the team drive | Spec pack v3; the public boundary files (geoBoundaries BGD ADM1, Natural Earth); no climate data | The studies in `tools/decide/` (simulation and geometry only) and the changes they led to (03 §4.2 and §5.3; 02 §7; ADR-06, ADR-16); the UI toolkit (ADR-17, 04 §12); `guide/` | <who checked the studies>; A confirms ADR-06 and ADR-16 in the decision log |
| 8 | Final build package (11 Nov 2026): the engine as product code, the input-bundle contract, the full-size methods tables, the build plan | Claude, in a Claude Code session (configured model `claude-fable-5-2`; the serving model may differ) | The team's request | Spec pack v3.1; NASA's CMR catalogue metadata for three granules (no data values); no climate data | `python/src/casefile_engine/` and its tests, `data/sim_tables.json`, `docs/01_ARCHITECTURE.md`, `docs/05_BUILD_PLAN.md`, `AGENTS.md`, the edits to 02, 03 and 07 | <who ran the tests and read the plan> |

---

## 4. Session log (coding agents)

| # | When | Person | Tool and model | Build step | Prompt | Data it saw | What the AI produced | Commits / PR | Human review | Problems found |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | 0 | Prompt 0 | spec only | | | | |

@AGENTS.md

## Claude Code notes

- One step of `docs/05_BUILD_PLAN.md` per session. Read files yourself; use a search subagent for wide searches.
- Run long jobs (the fetch, the results build, the slow tests) in a background shell and keep working.
- For the site, use the frontend-design skill if it is installed, inside the tokens and toolkit of `docs/04_UI.md` §11–§12 and the design direction in `docs/05_BUILD_PLAN.md` Part 3.
- Commit trailer: `AI-assisted: Claude Code (<model>)`.
- Never add a `Co-Authored-By:` line or any AI attribution to commits or pull requests (AGENTS.md rule 17).

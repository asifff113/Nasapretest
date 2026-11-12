# AI session log — Part 3

| When | Step | Person | Tool and model | Data it saw | What the AI produced | Human review | Problems found |
|---|---|---|---|---|---|---|---|
| 2026-11-12 | 3A–3E, 6A (on examples), 5 deploy fallback | asifff113 | Claude Code (claude-opus-5-5) | spec files and the synthetic examples only; no real data | The whole site in `web/`: reader, i18n and number formatting, URL state, every screen of 04_UI (home, question, place and line-up, verdict card, compare, screening map, cell page, methods, watch player, offline list, data, AI use, about), charts, the offline single-file build, unit tests and Playwright tests; deploy.yml publishes the examples until real results exist | pending | 04 §2 (language never in the URL) and the 3A prompt (language in the URL) disagree: the site follows 04 and accepts `?lang=bn` once on load. The result files hold no per-test power value, so no per-test power sentence is shown |

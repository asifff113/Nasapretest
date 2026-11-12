# `web/` — Part 3 (the site)

**Status: skeleton only.** These folders mark where things go; nothing is implemented, and there is no
`package.json` yet (the CI `web` job starts running once Part 3 adds one).

Branch: **`part-3-site`**. Part 3 owns `web/` and `docs/ai_log/part-3.md`. Steps 3A–3E have ready prompts in
`prompts/part-3*.txt`; read `AGENTS.md`, `docs/04_UI.md` and `docs/01_ARCHITECTURE.md` §6.3–§9 first.
The site is built and tested on `examples/` (synthetic data in the real format); it computes no statistic.

Stack (ADR-10, ADR-17): Vite + React + TypeScript (strict), Tailwind CSS with the tokens of `docs/04_UI.md` §11,
shadcn/ui, Lucide, Motion, Observable Plot, Zustand, Vitest, Playwright, ESLint; offline build with
vite-plugin-singlefile.

```
web/
├── scripts/compile-strings.mjs    3A: config/i18n + src/i18n/site.*.json → src/generated/strings.json
├── public/fonts/                  3A: Inter, Noto Sans Bengali (bundled; nothing fetched at run time)
├── public/outlines/               3C: Natural Earth outlines for the map
├── src/data/                      3A: results.ts, cache.ts, offline.ts (docs/01_ARCHITECTURE.md §6.3)
├── src/i18n/                      3A: t(), format.ts, site.en.json, site.bn.json
├── src/state/                     3A: view.ts (view ⇄ URL hash)
├── src/ui/common/                 3A: shadcn/ui components
├── src/components/                components of docs/04_UI.md §5 (suggested folder)
├── src/charts/                    TrendChart, DifferenceChart (suggested folder)
├── src/screens/                   Home, Question, Place, Compare, Map, Methods, Watch, … (suggested folder)
├── tests/unit/                    Vitest
├── tests/e2e/                     Playwright: W-xx and X-xx of docs/07_TESTS.md §8–§9
└── tests/screens/                 6A: screenshot baselines
```

Folders marked "suggested" are not fixed by the docs; Part 3 may rename them.

# `web/` — the CaseFile Earth site (Part 3)

A static site that **reads the engine's result files and computes nothing**. Every number and every verdict
sentence comes from a result file; the browser only formats and lays them out (AGENTS.md rules 4 and 10).
It is built and tested on `examples/` (synthetic data in the real format) and shows a real results build
unchanged.

## Run it

```bash
npm ci
npm run dev                 # http://localhost:5173, showing the real results in ../results
RESULTS_DIR=../examples npm run dev  # the same site on the synthetic examples (every screen state)
```

`npm run dev`, `build`, `test` and `typecheck` first run `scripts/compile-strings.mjs`, which merges
`config/i18n/{en,bn}.json` (read-only) with `src/i18n/site.{en,bn}.json` into `src/generated/strings.json`
and fails on a missing key or a placeholder that differs between English and Bangla.

## Checks

```bash
npm run typecheck && npm run lint && npm test     # TypeScript strict, ESLint, Vitest
npm run test:e2e                                  # Playwright: W-01…W-13, X-01, X-02, X-05, X-06, I-03, I-04
npm run build && npm run build:offline            # dist/ and dist-offline/index.html (one file)
npm run screens                                   # screenshots of every screen → tests/screens/ (polish loop)
```

`RESULTS_DIR` chooses the folder for `dev`, `preview`, the offline build and the tests. Without it, `dev` shows
`../results` when the repository has a results build; `preview`, the offline build and the tests use `../examples`.
The tests read every id from that folder, so the same suite runs on the examples and on `../results`.

## How it is built

| Path | What |
|---|---|
| `src/data/results.ts` | The reader: `loadCurrent`, `loadJson`, `loadMapLayer`, `loadCellSeries` (01 §6.3). Decodes the binary map and cell tiles (scale, fill, flag bits); no statistic |
| `src/data/offline.ts` | In the offline build, serves the files of `offline/set.json` inlined into the HTML |
| `src/state/view.ts` | View ⇄ URL hash (`schemas/view.schema.json`); every view can be shared |
| `src/i18n/` | `t()`, `format.ts` (03 §12.3, checked against `examples/golden/format_cases.json`), the site's own strings |
| `src/components/` | VerdictCard, CompareView, LineupTable, PlacePicker, ContributingCells, ConfidenceSpine, ProvenancePanel, ExpertPanel, RecordCard, … (04 §5) |
| `src/charts/` | TrendChart, PairChart and DifferenceChart (Observable Plot), Sparkline (plain SVG). They draw the engine's `chart` block |
| `src/explore/` | The globe explorer: globe, surface texture (Earth + layer + borders), side panels |
| `src/components/atlas/` | The atlas page head (graticule, facts), the SVG locator globe for places and pairs, the record-group icons |
| `src/map/` | The flat screening map on a canvas, equirectangular, with the bundled outlines; colour scales |
| `src/screens/` | Home, Question, Place, CellPage, Compare, MapScreen, Methods, Watch, Offline, DataCredits, AiUse, About |
| `src/ui/common/` | shadcn/ui components on Radix, re-themed to the tokens of 04 §11 |
| `public/outlines/` | Natural Earth 1:110m land, borders and named countries (public domain), from `scripts/build-outlines.mjs` |
| `public/textures/` | NASA Blue Marble and a relief map (public domain), as shipped in the three-globe examples |
| `build/plugins.ts` | Dev server for the results folder, the offline data module, the Content Security Policy |

Design direction "Atlas" (ADR-24): ocean navy (default) and ivory paper, one gold accent, serif headlines. The home
page and the map are a 3D globe explorer (ADR-23, `src/explore/`): NASA's Blue Marble image with the chosen record's
map draped over it, click anywhere for that 1° square, pins for registered places, and an ask box backed by the
no-AI smart matcher (ADR-25, `src/data/matcher.ts`, `src/data/places.ts`). The flat map stays one switch away for the
keyboard and weak devices. Every other page opens with the atlas head and, for a place, a pair or a cell, a small
locator globe that turns to face it. The line-up is an evidence board (records down, seasons across). The verdict card is still a case folder, printed on the ivory answer sheet: a gold tab with the case id, the status as a
stamp before any number, one plain sentence, then the numbers. Fonts (Instrument Serif, Inter Tight, Noto Serif and
Sans Bengali, IBM Plex Mono), icons, the Earth image and the outlines are bundled; the site fetches nothing from
another origin, and the offline file makes no request at all.

## Where the site needs nothing more from the engine, and where it cannot go further

- The per-test power sentence of 04 §4.9 (`methods.power_sentence`) needs a power value per confirmatory test;
  the result files hold the power table only, so the page shows the table and no per-test sentence.
- Arbitrary pairs of places (04 §4.6, "any two places from the region set") need a contrast file per pair; the
  pair picker lists the pairs the build has files for (`regions/index.json` → `pairs`).
- Region outlines appear when the build writes `regions/geom/<region>.json` (the synthetic examples have none, so
  the place map shows the contributing cells only).

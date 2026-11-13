# Site data requests (proposal, Part 3 → Part 2)

Status: **proposal, 13 Nov 2026.** Nothing here changes `schemas/`, `config/` or the engine. Each item needs the
team's agreement, and anything that touches `config/preregistration.yaml` is decided by people, before the commit
(AGENTS.md rules 1, 6 and 7).

The site computes nothing (rule 4). It can sort, colour and count what the result files hold, but it cannot
average squares into a country or a continent, and it cannot make a yearly map. These four additions would let
the site show what visitors keep asking for: "which countries are changing fastest", "watch the planet change",
and stripes for every square.

## 1. Countries (and continents, and the world) as exploration regions

**What the site would show:** a league table of countries from fastest to slowest change for each record and
season; a country page with its verdict-style card (exploration, no verdict words), its yearly chart and climate
stripes; the same for continents and the whole world.

**Proposed route (likely no engine change, to confirm with the engine owner):** the pipeline adds each country as
one more region in the input bundle, with role `country`, its mask on each grid, and the support rule applied
like any other region. 03 §7.3 already makes every region outside the pre-registered families exploration, so the
engine writes ordinary verdict and line-up files with `status: no_verdict`, `reason: exploration`, and its FDR
q within the line-up.

| Item | Detail |
|---|---|
| Boundaries | Natural Earth admin-0 (public domain), the same source as the bundled outlines; continents as unions of countries |
| Region ids | `country:<ISO3>` (for example `country:BGD`), `continent:<name>`, `world` |
| Names | `name.en` from Natural Earth; `name.bn` from a reviewed list (Part 3 can supply the Bangla names for review) |
| Index | `regions/index.json` lists them with `role: "country"` / `"continent"` / `"world"` and `inSet: true` when they pass the support rule |
| Size | About 175 countries × 2 records × 3 seasons ≈ 1,050 small verdict files, plus 175 line-ups |

Open questions for people: whether small countries that fail the support rule are listed greyed (as divisions
are now), and whether a multiplicity adjustment across all countries is wanted beyond the per-line-up q.

## 2. Yearly map frames (the time-lapse)

**What the site would show:** a play button on the globe that runs 1980 → 2025, one frame per year, so visitors
watch where warming and drying spread.

| Item | Detail |
|---|---|
| File | `maps/<variable>/<season>/years.bin.gz`, beside the existing `cells.bin.gz` |
| Meta | in the existing `meta.json`: `"years": {"first": 1980, "last": 2025, "field": "value", "dtype": "int16", "scale": …, "fill": -32768}` |
| Layout | year-major: one `[nlat][nlon]` block per year, the same grid and byte order as the rate fields |
| Values | the yearly value of each square as the engine already aggregates it (the same numbers as the cell tiles) |
| Size | 64,800 squares × 46 years × 2 bytes ≈ 6 MB raw, about 2–3 MB gzipped per record and season |

If anomalies are preferred to raw values (so every square starts near zero), the baseline period is a people
decision and belongs in the pre-registration or `config/analysis.yaml`, not in the site.

## 3. Cell tiles for every square

The example build has three tiles, so only those squares show a yearly chart and stripes. A tile for every land
square (or every square) lets any click on the globe show its stripes. Same format as today
(`cells/<variable>/t/…`); `cells/<variable>/meta.json` already lists `tilesPresent`.

## 4. A map for every analysed record

The examples carry an `air_temp` map only. The catalog marks `rain` as analysed too, so the results build should
write `maps/rain/<season>/` the same way; the globe's record switcher picks it up with no site change. The same
holds for any record that becomes analysed later (for example soil moisture or water vapour).

## What the site already does without these files

- Click any country: its squares stay coloured, the rest of the planet fades, and a panel lists every square from
  the slowest to the fastest change, the squares rising and falling fastest, and how many stand out. These are
  the map file's own values, sorted and counted; the panel says that a whole-country answer needs item 1.
- 3D columns: each square that stands out rises as a column, its height from the map file's rate.
- Climate stripes for every verdict, every comparison side and every square that has a tile.

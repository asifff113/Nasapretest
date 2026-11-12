# 10 — Findings

What we learned from the official statement, the challenge author's video, the data providers, other public projects for this challenge and the organisers' material, and what we changed because of it. It is also the team's record: §6, §7 and §8 are filled in as the build runs. Fact-check claim numbers (#nn) are those of playbook v3.

---

## 1. The official statement and what it means for us

| What it says | What it means for us | Where |
|---|---|---|
| "select variables measured by Earth science missions **or produced by Earth science models**" | Model and satellite data both count, and every variable is labelled with what made it | M1, 02 §1 |
| "what is changing, where …, how much …, and if these changes are … 'significant'" | Line-up (what), places and the screening map (where), rate and total change (how much), a graded verdict (significant) | M3, M2, M8, M4, M7 |
| "can trend one way in one region and the opposite way in another, even when the same process drives both" | Compare two regions by testing the trend in their difference, with "opposite fitted directions", "supported opposite trends" and "rates differ" | M6, 03 §8.5 |
| "particular regions of the land, ocean, or even levels of the atmosphere" | Land regions, the Bay of Bengal candidate and ocean cells; levels of the atmosphere are deferred | M2, 02 §1 |
| MODIS, OMI, AIRS, GPM, MERRA-2, GLDAS | MERRA-2 and GPM in the first release; the others keep their record cards, marked "not analysed in this release" | ADR-02 |
| "t-test, the Mann-Kendall test, or confidence intervals" | MK-AR1 decides; the widened Sen range; the t-test shown for comparison | 03 §4 |
| High-school and college audience; "simple definitions" | Question cards, record cards, a glossary, Bangla; a usability test with three outside students | M1 |
| "a short series of questions"; "a couple of demonstration examples that the user could watch" | Question cards; watch cases | M1, S2 |
| SI from news, papers or "the characteristics of a region" | COULD: an SI matcher onto existing cards only | 00 §6 |
| "a longer period" can make a trend significant | "Can't tell yet, which is not the same as no change"; the power table on the Methods page | M7, M9 |
| "regular cycles, such as the seasonal cycle" must be removed; "linear trends would be a great start" | One value per year or season; linear trends; steps only flagged | 03 §2, S4 |
| "More resources may be added before the hackathon begins" | Read the Resources tab when it is published; add what it names with step 2D | 00 §1.1 |

**The challenge author's video** (Dr. James Acker, NASA Goddard; his tool is Giovanni): his five steps map onto our flow (00 §2). His Wisconsin aerosol example needs MODIS aerosols, a deferred product, so it is a COULD case. His point that "a longer time series" may be all a trend needs is answered by "can't tell yet" and the power table, not by a "years needed" number.

---

## 2. Answers from the organisers

Not used by the build. Keep the team's own notes on registration and the official guides here.

---

## 3. Data access in November 2026

- **GES DISC on-premises servers are "discontinued no earlier than September 30, 2026"** (#25). We never build `*.gesdisc.eosdis.nasa.gov` URLs. The cloud routes and Earthdata Login application approvals are unconfirmed (#25, #26), so V-01 and V-02 check them.
- **MERRA-2:** the output grid is 0.625° longitude × 0.5° latitude, 576 × 361 points (GMAO page). `PRECTOTCORR` is bias-corrected precipitation in kg m⁻² s⁻¹ (#14); which monthly collection holds it is checked in V-03.
- **IMERG V07 Final** starts in January 1998 (#11b) and its Final record ends in September 2025, with V08 Final expected in fall 2026 (#11a). We pin V07, end annual trends in 2024, and never append Late Run or V08.
- **NASA POWER:** its weather comes from MERRA-2 since 1 Jan 1981, with a GEOS-IT tail of about two days' latency that is later overwritten (#29a); it also serves `IMERG_PRECTOT` from 1 Jun 1998 (#29b). So POWER never witnesses MERRA-2, and its IMERG never witnesses IMERG.
- **Giovanni's** status is unconfirmed (#28); we do not use it.
- **Earth Engine** community tier: 150 EECU-hours a month, 40 concurrent requests, 100 MiB per result, 10 MB per request, about 2 batch tasks (#31). Not needed until MODIS or GSMaP return.
- **v2 notes, not re-checked for v3:** the GES DISC migration guidance (last updated 1 Sep 2026) also described on-premises OPeNDAP being switched off, the end of the Level 3/4 Regridder and Subsetter, and the end of THREDDS. We rely on none of these; V-02 checks the route we do use.

---

## 4. Other public projects for this challenge

We read ten public GitHub repositories made for this challenge (read-only; we copied nothing). Two are from Bangladesh local events.

| Project (repository) | What stands out |
|---|---|
| "Trend Detective" (Streamlit + Earth Engine) | The strongest. A 3D globe with any place, but live data need the user's own Earth Engine account. Seasonal Mann–Kendall, Sen with an interval, an OLS cross-check with effective sample size, BH-FDR, per-pixel maps, a time-lapse, compare places, a plain answer card |
| "Orion Space" (Barisal) | A 3D console: MERRA-2 grid points over Bangladesh, Mann–Kendall and Sen, GIBS imagery, GPM, GRACE-FO, POWER, LLM features |
| "My Climate Story" (Delta Detectives) | A static site with POWER and four Bangladesh sites: Theil–Sen heatmaps, Bangla, a low-data mode, a quiz, lesson plans |
| "TerraTrend" | A Three.js globe; eight variables from NASA and NOAA, each with a plain-language "case file" |
| Five others | POWER and Mann–Kendall web apps, AI narration through free LLM APIs, globes; one plan-only README |

**The baseline is high.** Globes, POWER points, Mann–Kendall with Sen, Bangla, AI narration, multi-variable scans and FDR already exist somewhere. The "detective" and "case file" wording is common because the title invites it.

**What none of them shows**, and where our points come from:
1. The trend in the difference between two regions, tested directly, instead of two significance labels side by side.
2. Verdicts only inside a validated domain, with "no verdict" outside it, and the stress tests that justify it.
3. A pre-registration committed before any real trend, with its hash on every result, and the number of tests on every screen.
4. "Can't tell yet, which is not the same as no change", tested with students.
5. One engine, asserted golden tests, a pinned input manifest, and an offline file that ran on a clean laptop.

---

## 5. Organiser material: what matters for the product

| Source | Point | What we do |
|---|---|---|
| FAQ (#5, TRUE in both checks) | A description of how "Super Intelligence" (SI) tools were used is required | `docs/AI_USE.md`, in that wording |
| Local rubric (#4) | Five criteria scored 1–20, plus Teamwork, User experience and NASA data use at 1–5, three 0/1 checks and a 5% bonus for teams with women members; "Best Use of Science" is an award, not a criterion | Usability test with students (Q2); NASA data named clearly on every result |
| Space Apps Terms (#33) | Non-NASA data must be freely available or OSI-licensed, with the licence documented | Boundary licences recorded (V-06; #33b unconfirmed) |
| Build guide (mentors) | Its showcase demo puts one district at p = 0.003 beside one with "no significant trend" | That is the fallacy the contrast test fixes (v3 consensus row 3); we do not copy it |
| Build guide | Dates the end of Suomi NPP to 1 Nov | The fact-check says delivery ends 2 Nov 2026 (#21); Suomi NPP is not used |

---

## 6. Access-check results (Part 2)

| V-id | Result | Evidence (URL form, value, screenshot) | Checked by | Date checked |
|---|---|---|---|---|
| V-01 | | | | |
| V-02 | | | | |
| V-03 | Partly done: the collection holding `PRECTOTCORR` is `M2TMNXFLX` 5.12.4, DOI 10.5067/0JRLVL8YV2Y4; `PRECTOTCORR` is listed for the MERRA-2 flux collection in kg m⁻² s⁻¹. Still to do: open one monthly granule; fill value; latest month | data.nasa.gov entry for M2TMNXFLX; Earth Engine catalog `NASA/GSFC/MERRA/flx/2` | Claude (spec update) | 3 Nov 2026 |
| V-04 | Partly done: an HDF Group sample of an IMERG monthly file shows `precipitation` in mm/hr, fill −9999.9, stored longitude-first. Still to do: confirm on a V07 Final granule; first and last month | eosdap.hdfgroup.org sample `imergm.h5` | Claude (spec update) | 3 Nov 2026 |
| V-05 | | | | |
| V-06 | Done for geoBoundaries: gbOpen BGD ADM1 (boundary year 2015, 8 units) is CC0 1.0; `shapeName` spells Rajshahi "Rajshani", so match on `shapeISO`. Natural Earth: the field names `ADM0_A3` (1:50m Admin 0) and `name` with `adm0_a3` (1:10m Admin 1) were read in the downloaded files; record the terms shipped with them | `geoBoundaries-BGD-ADM1-metaData.json` (GitHub, wmgeolab/geoBoundaries) | Claude (spec update) | 3 Nov 2026 |
| V-07 | Partly done: `/api/temporal/monthly/point`, `start` and `end` as years, up to 20 parameters per point request and one per regional request. Still to do: fill value, annual key, licence, the D-06 tolerance | POWER monthly API documentation page | Claude (spec update) | 3 Nov 2026 |
| V-08 | | | | |
| V-09 | | | | |
| V-10 | | | | |
| V-11 | Confirmed while writing this pack: pyhomogeneity 1.1 `pettitt_test(x, alpha=0.05, sim=20000)`; `sim=None` gives the analytic p; re-check against the lock file | `python/src/casefile_engine/layer.py` | — | — |

---

## 7. Measured sizes and performance (Part 6)

| Item | Budget (01 §8) | Measured | On which machine |
|---|---|---|---|
| JS shipped (gzip), online build | ≤ 400 KB initial | | |
| First view on a 4G phone | ≤ 2.5 s | | |
| Largest place or compare screen | ≤ 300 KB | | |
| One screening map | ≤ 1 MB | | |
| Cell tiles, all | about 60 MB computed | | |
| Offline file | ≤ 15 MB | | |
| Peak memory, demo laptop | — | | |
| Full results build | ≤ 200 MB | | |

---

## 8. Findings during the build

One row for anything a check or a reader found: what, where, what was done.

| When | What was found | Where (file, step) | What we did |
|---|---|---|---|
| | | | |

---

## 9. Decided, and still open

**Decided** (12 §8; 01 §11): the MK-AR1 variant, the leftover-memory check, the support rule, the provided engine, the input bundle, one repository.

**Still open, in the order they come up:**
- Part 2: the access checks on real files (02 §10): the OPeNDAP request form on one granule of each product; `PRECTOTCORR`'s fill value; IMERG's fill and axis order on a V07 file.
- Before Part 4: the official resource list. A dataset it names can be added with step 2D (02 §14).
- Part 4: the team's choices in the pre-registration (the plan recommends values for every one).
- Part 6: a native Bangla reader for the interface text.
- A known limit, shown on the Methods page: when a record's true memory is near the edge of the validated range, false alarms among the records that still pass can reach 16% (03 §5.2).

---

## 10. Sources

- NASA Space Apps Challenge 2026, "Be An Earth System Trend Detective!", challenge details page (our capture holds only the Details tab): https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/?tab=details
- Trend Detective — Space Apps 2026 Team Playbook v3, and its sources: the fact-check by Gemini 4 Argon Deep Research and Perplexity (44 claims), the AI council's 17 answers, the red-team review.
- GPM data page: https://gpm.nasa.gov/data
- GMAO, MERRA-2 system characteristics: https://gmao.gsfc.nasa.gov/gmao-products/merra-2/system-characteristics_merra-2/
- JPL GRACE mascons page: https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/
- NASA Space Apps 2026 Participant Terms and Conditions: https://www.spaceappschallenge.org/legal/
- NASA Space Apps participant FAQ: https://www.spaceappschallenge.org/resources/participant-faqs/
- Space Apps 2026 Bangladesh Participants Guide, Build Guide, Mission Playbook and participant roadmap (provided by the team).
- Public GitHub repositories for this challenge (read-only review).

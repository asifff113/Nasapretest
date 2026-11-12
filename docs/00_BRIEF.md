# 00 — Brief

> **CaseFile Earth**: every trend is a suspect until the evidence says otherwise.
> Pick a question and two places. The tool lines up the data that could answer it, tests the trend in the difference between the two places, and gives a graded verdict, or "can't tell yet", with the evidence attached.

This file is the "why" and the "what". `01_ARCHITECTURE.md` is the "how", `03_SCIENCE.md` holds the rules for every number, and `05_BUILD_PLAN.md` gives the order of work.

---

## 1. The challenge in its own words

Quotes are exact. They come from our capture of the challenge page, which holds only the Details tab (Advanced; Earth Science, Software).

**Summary.** "Your challenge is to create a tool that can select variables measured by Earth science missions or produced by Earth science models, visualize how they change over time, and determine what is changing, where it is changing, how much it is changing, and if these changes are what scientists call 'significant.'"

**The twist.** "A measured Earth science data variable can trend one way in one region and the opposite way in another, even when the same process drives both."

**Two parts of the problem.** "Finding variables that are trending, from simple ones like temperature and rainfall to more complex ones like evaporation or streamflow; and analyzing trends in particular regions of the land, ocean, or even levels of the atmosphere."

**Named sources.** MODIS, OMI, AIRS and GPM (instruments); MERRA-2 and GLDAS (models). "Finding, analyzing, and relating significant trends to the processes causing them is one of the most important uses of NASA Earth science data."

**Objectives.**
1. "Identify Earth science variables of interest that can be investigated for potential trends. As the Background notes, NASA and other space agencies offer numerous variables, some familiar and some more specialized for use by particular branches of science."
2. "Acquire the data variables for a particular region, since most trends in the data will not be global – though some trends can be!"
3. "Generate and visualize a time series for the variable and region of interest over a long enough period of time to allow statistical analysis."
4. "Perform a basic statistical analysis of that time series, indicating the rate of change over time, and to test the trend's significance using methods such as a t-test, the Mann-Kendall test, or confidence intervals."
5. "A response that does both the visualization and the analysis meets the full scope of this challenge."

**Potential considerations (optional, but judges read them).**
- Audience: "high school and college students, along with members of the public who have some scientific background. Providing simple definitions of the variables would help these users considerably." The aim is "to help the users become data detectives."
- Approach: "a short series of questions about what or where they would like to investigate"; "a couple of demonstration examples that the user could watch"; "SI could be useful here to identify data with the potential to show trends in particular areas, drawing on either news articles and research papers or the characteristics of a region such as a desert, rain forest, tidal estuary, or the atmosphere above a large city."
- Data: "daily and monthly data are likely the easiest to process"; "Finding a trend is interesting even if it doesn't reach the level of significance. Sometimes all a trend needs to become significant is a longer period"; consider CUAHSI's hydrology tools; "some are not evident unless regular cycles, such as the seasonal cycle, are removed"; "detecting and analyzing linear trends would be a great start."

### 1.1 Resources tab

Our capture does not include the Resources tab. Read it once before Part 4 and cite what it names.

| Resource | Type | Already in our catalog? | Action |
|---|---|---|---|
| _(fill in Part 3)_ | | | |

---

## 2. The challenge author's five steps, and ours

From the official video by the challenge author (Dr. James Acker, NASA Goddard).

> "Here are the steps to follow to be an Earth science data trend detective with NASA data. **Your app should be able to do this.**" (4:15)

| Author's step | CaseFile Earth | Scope |
|---|---|---|
| 1. "Decide on the data variable or variables for analysis." | A question card leads to a shortlist of variables, each with a record card | M1 |
| 2. "Choose a region for the analysis and that can be the entire world." | A place from the fixed region set, or any 1° cell of the global screening map, which covers the whole world | M2, M8 |
| 3. "Select the time period for the time series." | The main window is fixed in the pre-registration. Five alternative windows are shown as robustness checks, and IMERG covers 1998–2024. There is no free year slider, because every number is precomputed | M5, S3 |
| 4. "Create the time series and examine it. Does it appear to have a trend?" | The series on actual years, with its trend line, range and documented data changes | M4 |
| 5. "Analyze the trend for significance." | A verdict card, and for two places the trend in their difference | M4, M6, M7 |

Other things the author said, and where they went:
- "Sometimes choosing the data is more complicated than doing an analysis." → question cards and record cards (M1).
- "It is easier to determine trends over time for data points that are weekly or monthly." → monthly data aggregated to years and seasons (03 §2).
- His worked example, MODIS Aqua aerosol over Wisconsin, made in Giovanni → a COULD case. It needs a deferred product (aerosols).
- "If the p-value is more than 0.05 … That doesn't mean it isn't a trend or that it isn't important. Sometimes all that is needed to make a trend significant is a longer time series." → "can't tell yet, which is not the same as no change" on every such card (M7); the power table on the Methods page as a conditional calculation (03 §9.4); and the overturn line "a longer record or a larger region could change this answer" (S1). The card shows no "years needed" number.
- A big eruption can cause "a cooling trend" → not modelled in this release. `config/known_breaks.yaml` holds documented data changes only; the copy says "consistent with" and never names a cause, and an El Niño-adjusted test is a COULD item.

---

## 3. Requirements and how this release meets them

S = statement, V = author's video.

| Id | Requirement | Source | This release |
|---|---|---|---|
| R-01 | Variables from satellite missions and models, labelled as such | S | MERRA-2 (model) and GPM IMERG (satellites and gauges), with badges. Other named products keep their record cards, marked "not analysed in this release" |
| R-02 | Help users choose: a short question flow and simple definitions | S, V | Question cards, shortlists and record cards in English and Bangla (M1) |
| R-03 | A region, including the entire world | V, S | Fixed region set, plus a global 1° screening map (M2, M8) |
| R-04 | Land, ocean and levels of the atmosphere | S | Land regions, the Bay of Bengal candidate and ocean cells on the map. Atmospheric levels (AIRS) are deferred |
| R-05 | A time period long enough for statistics | V, S | At least 20 complete years for a verdict (03 §5) |
| R-06 | Create and examine the time series | V, S | Series chart on actual years (M4) |
| R-07 | Rate of change; significance by t-test, Mann–Kendall or intervals | S | Sen slope per decade with a calibrated 95% range; MK-AR1; the t-test shown for comparison only (03 §4) |
| R-08 | What, where, how much, significant | S | Line-up (what), places and map (where), rate and total (how much), graded verdict (significant) |
| R-09 | Opposite-sign trends driven by the same process | S | The trend in the difference A − B, with "opposite fitted directions", "supported opposite trends" and "rates differ" (M6) |
| R-10 | Relate trends to processes | S | Question and record cards describe the process in plain words; copy says "consistent with", never "caused by". Process cards are not in this release |
| R-11 | Remove or respect the seasonal cycle; trends within a season | S, V | Annual values and the pre-registered seasons (03 §2) |
| R-12 | Non-significant trends still matter; a longer record may change the answer | S, V | "Can't tell yet" wording (M7); the power table on the Methods page; overturn rule O7 |
| R-13 | Daily and monthly data | S, V | Monthly data. Daily extremes are COULD |
| R-14 | A couple of watchable demonstration examples | S | Watch cases (S2) |
| R-15 | (Optional) "SI" to suggest data with trend potential | S | COULD: an SI matcher that only maps free text onto existing question cards |
| R-16 | Students and the interested public | S | Plain words, Bangla, usability test with outside students where time allows (07 §10) |
| R-17 | Outside hydrology tools (CUAHSI) | S | Not in this release |
| R-18 | Linear trends are enough | S | Sen slope and MK-AR1; steps only flagged (Pettitt, S4) |
| R-19 | Data from NASA and other space agencies | S | NASA data in this release. JAXA GSMaP is COULD |

---

## 4. The product

CaseFile Earth treats every trend as a case. A user picks a question and one or two places from a fixed set. The tool lines up the variables that could answer it, tests the trend in the difference between two regions, and issues a graded verdict, or "can't tell yet", with the evidence attached. This covers the statement's jobs (select variables, visualize change, and say what, where, how much and whether it is significant) for Bangladesh and the pre-registered comparison regions, with a global 1° screening map for exploration. The first release analyses temperature and rain only, the two simple variables the statement names first.

**Learning goal.** After two minutes, a student can say how fast rain changed in each of two regions, whether the two differ, and that "can't tell yet" is not "no change".

**The flow.**
1. **Question.** A question card ("Has rain changed differently in two places?") leads to a shortlist of variables. Each variable has a record card: record length, gaps, known breaks, observation or model, and what it cannot answer.
2. **Place.** Bangladesh, its divisions that pass the support rule, the pre-registered comparison regions, or any 1° cell of the screening map. Every place shows the data cells that cover it.
3. **Line-up.** Temperature and rain, annual and each pre-registered season, with the number of tests shown.
4. **Verdict.** The series on actual years; the rate per decade with its 95% range; a grade, "can't tell yet, which is not the same as no change", or "no verdict" when the record lies outside the range the method was tested for; the checks that try to break it; whether the change is big enough to matter; and what would overturn the claim.
5. **Compare.** For two places, the trend in the difference A − B, labelled as such, with each place's own rate beside it.

Around the flow: the **screening map** for each variable (exploration, with untestable cells hatched), **watch cases** that play a case step by step, the **IMERG sensitivity check** for rain, the **confidence spine** on every screen that shows a result, the **provenance panel** on every result, and a one-page **Methods** page.

**One engine, static site.** One Python engine computes every number once, in the build. The site only displays the results, works offline from a single file, and contains no AI.

**Global map, local voice.** Bangla and English throughout; Bangladesh's seasons and divisions built in.

---

## 5. Users and their questions

| User | Typical question | What they need from us |
|---|---|---|
| High-school student (Dhaka) | "Is it really getting hotter before the monsoon?" | Plain words, Bangla, a clear answer or "can't tell yet", no jargon without a definition |
| College student | "Has the monsoon changed differently here and across the border?" | The compare screen, the seasons, the two tests the statement names |
| Teacher | "Can I show my class what significance means?" | Watch cases, the Methods page, shareable links, the offline file |
| Curious public, journalist | "Is this a trend or a bad year?" | Honest verdicts, the checks that try to break them, provenance |
| NASA judge | "Is the science right, and is it NASA data?" | Named products with DOIs, the validated domain, calibration tables, the pre-registration hash, provenance on every number |

---

## 6. Scope

**The build sequence finishes every MUST and every SHOULD item, polished.** COULD items wait until all of them are done. CUT items are never built. Owners: A = lead scientist and statistics engineer, B = data engineer and release owner, C = app developer and story lead.

| Id | Feature | Statement job | Owner | Build steps | Tests |
|---|---|---|---|---|---|
| M1 | Question cards leading to a variable shortlist, each with a record card (record length, gaps, known breaks, observation or model, what it cannot answer). Deferred variables keep their cards, marked "not analysed in this release" | Select variables | C, B (facts) | Part 3 | W-01, X-03 |
| M2 | Place picker over the fixed region set: Bangladesh, its divisions that pass the support rule, the pre-registered comparison regions, and any 1° cell of the screening map. Every region shows its contributing cells | Where | C, B | Part 2, Part 3 | P-03, P-04, D-09, W-02 |
| M3 | Line-up of temperature and rain, annual and pre-registered seasons, with Benjamini–Hochberg control and the number of tests shown | What | C, A | Part 3, Part 4 | W-03 |
| M4 | Interrogation inside the validated domain: series on actual years, Sen slope per decade with a calibrated 95% range, MK-AR1 p-value; outside it, the slope and "no verdict" | How much; significant | A, C | Part 1, Part 3 | G-01, G-04, W-04 |
| M5 | Core checks: documented breaks with a manual review of headline cases, coverage and gaps, leave-one-year-out, five alternative windows | Significant | A, B | Part 1, Part 4 | G-06 |
| M6 | Compare two regions: the trend in the difference A − B, labelled as such, with each region's own slope beside it; worded "opposite fitted directions", "supported opposite trends" or "rates differ" | Where | A, C | Part 1, Part 3, Part 4 | G-07, K-08, W-05 |
| M7 | Verdict card: a grade, or "can't tell yet, which is not the same as no change", from English and Bangla templates; no "years needed" number | Significant | A, C | Part 1, Part 3 | W-04 |
| M8 | Global screening map per variable, precomputed per 1° cell: false discovery rate 0.10 within the map, untestable cells hatched, labelled exploration | Where | B, A, C | Part 3, Part 4 | G-05, W-06 |
| M9 | Provenance panel and a one-page Methods page: validated domain and stress tests, confirmatory family, calibration and coverage tables, asserted golden tests, input manifest, pre-registration hash | Trust | A, C | Part 3 | P-10, P-14, W-07, W-08 |
| M10 | Public static site that only displays precomputed results; a complete offline case set with its cases listed; no AI narrator, and AI never touches a number | Trust | C, B | Part 3 | I-02…I-04, W-10 |
| S1 | "What would overturn this claim?" | Trust | A, C | Part 3 | W-13 |
| S2 | Watch cases on temperature and rain | Select variables | C | Part 3 | W-09 |
| S3 | Rain sensitivity check: the same results on IMERG beside MERRA-2, labelled a sensitivity check | Trust | A, B | Part 3 | W-05 |
| S4 | Pettitt flag on headline cases; it never decides a verdict | Significant | A | Part 3 | G-01 |
| S5 | Confidence spine: the current claim's uncertainty on every screen | Trust | C | Part 3 | W-12 |

**COULD** (only after every MUST and SHOULD step is done): an SI matcher onto existing cards; the Wisconsin smoke case with aerosols; JAXA GSMaP as a second rain record; deferred products, one at a time, each with its own domain check; El Niño-adjusted partial Mann–Kendall; EOF patterns; daily extremes; a PDF case file; ritu seasons (the Bengali six-season calendar); held-out hypothesis tests.

**CUT** (never build): the opposites finder, the Cancellation Lens, the red-noise envelope, the full trend triangle, the change matrix, districts and drawn boxes, the browser statistics engine, NASA POWER live points, the AI narrator, automated step-versus-trend selection.

**Not in this release** (v2 features that v3 lists neither as MUST nor SHOULD): Real or random?, the significance clock, Scan as a clue ranker, Scout, Suspects and process cards, Giovanni import, links and bridge, CSV import, the atmosphere-level picker, exports and the notebook export.

**Cut order, if something must go** (features go before checks): every COULD item, then the SHOULD items from S5 back to S1, then M8's map, then M3's seasons. **Never cut** the domain rules and stress tests, the asserted golden tests, provenance and the Methods page, the offline case set, the dress rehearsal (S27), M4, M6, M7 or the public link.

---

## 7. Traceability: what a judge sees

| Criterion | Evidence on screen or on the project page |
|---|---|
| Scientific validity | Validated domain with "no verdict" outside it; calibration, stress-test and coverage tables; the pre-registration hash; asserted golden tests in CI; the trend in the difference instead of two labels side by side |
| Relevance to the challenge | The statement's jobs (select, visualize, what, where, how much, significant), the t-test and Mann–Kendall named, the opposite-trend twist answered with a direct test |
| NASA data use | MERRA-2 and GPM IMERG named with versions and DOIs on every result; the input manifest |
| User experience | Question cards, Bangla, the offline file, watch cases, and the usability test with three outside students |
| Presentation | The demo leads with one question and shows the real result, whatever it is |

---

## 8. Demo story

**One sentence:** "Has rainfall changed differently in Bangladesh and its neighbour? CaseFile Earth tests the trend in the difference itself, on NASA data, and shows its evidence."

The demo leads with the pre-registered Bangladesh contrast on real data, whatever it shows: a supported difference and a well-explained "can't tell yet" are both strong results.

---

## 9. What sets it apart

Public repositories for this challenge already show globes, NASA POWER points, Mann–Kendall with Sen's slope, Bangla text, AI narration and multi-variable scans (`10_FINDINGS.md` §4). Those are the baseline.

| Usually built | CaseFile Earth |
|---|---|
| "Significant here, not there" read as a difference | The trend in the difference is tested directly |
| One p-value from a library default | MK-AR1, calibrated by our own simulation, used only inside the range where it was tested; "no verdict" outside it |
| Every place and season tested, best ones shown | A pre-registration committed before any real trend, its hash on every result; Holm and Benjamini–Hochberg; the number of tests printed |
| "Not significant" read as "no change" | "Can't tell yet, which is not the same as no change" |
| Numbers computed in two places, or by AI | One Python engine computes every number; the site only displays; no AI in the product |
| A demo that needs the venue Wi-Fi | One offline HTML file with its case set, tested on a clean laptop |

---

## 10. Non-goals and honesty rules

- No forecasts and no machine-learning predictions. The statement asks about detecting trends, and extrapolation misleads.
- No causal claims. Say "consistent with", never "caused by", "because" or "due to".
- No invented numbers. Synthetic data live only in `examples/`, carry `"synthetic": true` and trigger a banner.
- No NASA logos, insignia or mission patches. This is a precaution: the rule is not in the published rules we could check (fact-check #6).
- No AI in the product. AI was used to plan and write code, and `docs/AI_USE.md` records how.

---

## 11. Glossary (short definitions; Bangla in `config/i18n/bn.json` → `glossary`)

| Term | Plain definition used in the app |
|---|---|
| Trend | A steady rise or fall over many years, not just one unusual year |
| Can't tell yet | The record is too short or too noisy to decide. It does not mean nothing changed |
| p-value | How often random ups and downs alone would produce a trend at least this strong |
| 95% range | A range of rates that fit the data. Ranges made this way catch the true rate about 95 times in 100; it is not a 95% chance for this one range |
| Mann–Kendall test | A test that counts how often later years are higher than earlier years |
| t-test (on a slope) | A test of whether the best straight line slopes more than noise would allow |
| Sen's slope | The middle value of all the slopes between pairs of years; one odd year cannot fool it |
| Memory (autocorrelation) | When one year resembles the next, the record holds less information than its length suggests |
| Trend in the difference | Region A minus region B, year by year. If the two changed at different rates, this difference has a trend |
| Pre-registered | Written down and committed before we looked at any trend, so we cannot pick the results we like |
| Exploration | Anything we did not register in advance. We show it, but give no verdict |
| Validated domain | The kinds of records on which we tested the method. Outside them we show the slope and give no verdict |
| Sensitivity check | The same question asked of a second dataset that shares some inputs; it is not an independent confirmation |
| Model or reanalysis | A computer model that blends many observations into a complete picture, such as MERRA-2 |
| Satellite record | Measurements from sensors in orbit, such as the satellites behind IMERG |

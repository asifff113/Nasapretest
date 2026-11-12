# Methods — how CaseFile Earth decides

Source text for the app's one-page Methods page (`#/methods`, M9; A owns it, C lays it out). Each section has a plain version and a "For experts" version, and both need Bangla. Keep the anchors, because the verdict card links to them. Every number in `<…>` comes from this build's files (`methods/tables.json`, `prereg.json`, `build.json`, `input_manifest.json`), never from this template. The rules themselves are in `docs/03_SCIENCE.md`; this page explains them.

---

## {#data} Where the numbers come from

**Plain.** Temperature and rain come from MERRA-2, a NASA model that blends many observations. For rain we also show GPM IMERG, a record from satellites and rain gauges, as a sensitivity check: the two share some inputs, so IMERG is not an independent confirmation. Every result says which kind of data it uses.

**For experts.** Region values are area-weighted means on each product's native grid (MERRA-2 0.5° × 0.625°; IMERG 0.1°), using the fraction of each cell inside the region. A region enters our set only if at least `<min cells>` effective data cells cover it and at most `<max spill share>` of what its mean describes lies outside it (cells that are mostly outside the region count only by their inside part). When two places are compared, a cell both touch goes to the one holding more of it, so the difference never compares the same data with itself; each side must still keep `<min cells>` cells. The screening map uses a conservative regrid to 1°. Input files are pinned by SHA-256 in the input manifest `<manifest sha256>`. Build `<build id>`.

## {#seasons} One value per year

**Plain.** Months repeat every year: summers are hot and monsoons are wet. To see a long-term change we compare like with like: one value per year, or one per season (for example every June–September).

**For experts.** Temperatures use a day-weighted mean of the months; rain adds daily rate × days. A season and every rain total need all their months; a yearly temperature needs at least 10 of 12 months, using the climatology plus the mean anomaly of the valid months. Seasons that cross the new year are dated by the year in which they end. Space first, then time. Missing years stay missing; nothing is interpolated.

## {#how-much} How much is it changing?

**Plain.** We draw the most typical slope through the years and say how much it changes per decade, with a 95% range: ranges made this way catch the true rate about 95 times in 100. It is not a 95% chance that this one range is right.

**For experts.** Sen's slope (the median of all pairwise slopes, on actual years) with Conover's intercept. The range uses Sen's rank method with the Mann–Kendall variance inflated for memory and the multiplier 2.25 instead of 1.96, because 1.96 caught the true rate too rarely in our simulations. Achieved coverage: `<coverage table, §9.3>`.

## {#significant} Is it significant?

**Plain.** A trend is "supported" when a pattern this clear would rarely appear from random ups and downs alone, after allowing for "memory" (a warm year is often followed by another warm year) and for the number of tests we ran.

**For experts.** MK-AR1: Mann–Kendall with a tie-corrected variance, inflated by 1 + 2Σ(1 − k/n)φ̃ᵏ, where φ̂ is the AR(1) coefficient of a regression of each year on the year before, with an intercept and a trend (consecutive years only), bias-corrected as φ̃ = (nφ̂ + 2)/(n − 4) and clipped to [0, 0.95]. p uses the normal approximation with a continuity correction. A least-squares t-test with effective sample size is shown for comparison and never decides; it is "unavailable" when the effective sample size is 3 or less.

**False alarms when nothing changes** (`<calibration table, §9.1>`): "With no trend, it flags about `<k>` in 100 such records." This describes the method, not the chance that a verdict on this site is wrong.

## {#domain} Where our verdicts are valid

**Plain.** We tested the method on many kinds of made-up records. It works well on some and badly on others, so we give verdicts only on the kinds where it works. Elsewhere we show the slope and say "no verdict: outside the range this method was tested for".

**For experts.** A verdict needs: temperature or rain; the whole year or a pre-registered season; at least 20 complete years (15–19 are exploratory); no missing year; memory φ̃ ≤ φ_max(n) `<table>`, the largest memory at which the calibrated false-alarm rate stays at or below 8% (among records that then pass every check the rate is `<false alarms among passing records, by n and memory>`: close to 5% for memory up to 0.5 and higher, up to about 16%, when the true memory is near the limit, because passing then favours records whose memory was underestimated); and a pooled leftover-memory check across the region's data cells that finds no memory beyond what AR(1) describes, its threshold matched to the cells' own memory `<leftover critical values, §9.5>`.

**Stress tests** (`<stress table, §9.2>`): with no trend, records whose memory mixes a fast and a slow part, and AR(2) records, make any such test too eager. Our domain checks lower those rates; the table shows by how much.

## {#family} What we registered in advance

**Plain.** Before we looked at any trend in real data, we wrote down and committed exactly which places, pairs, seasons and thresholds we would test. Only those tests get verdict words. Everything else is exploration.

**For experts.** Pre-registration `<sha256>`, commit `<commit>`. The confirmatory family (`<m₁>` tests: for each pre-registered pair and each variable, both regions' yearly trends and the trend in their difference) uses Holm's correction at α = `<α>`; the secondary family (`<m₂>` season tests) uses Benjamini–Hochberg at q = `<q>`. `<family list>`

## {#compare} Comparing two places

**Plain.** "Significant here, not there" does not show that two places changed differently. We subtract one place from the other, year by year, and test the trend in that difference. Each place's own rate is shown beside it, never subtracted.

**For experts.** The estimand is the trend in d(t) = A(t) − B(t), with its own Sen slope, range and MK-AR1 test. It is not Sen(A) − Sen(B). Labels: "opposite fitted directions" (descriptive only), "supported opposite trends" (both regions supported, opposite signs), "rates differ" (the difference is supported). Tested on synthetic pairs with known answers: `<contrast table, §9.6>`.

## {#checks} Can we break it?

**Plain.** Before we accept a trend, we try to break it: a missing year, other start and end years, a change in the data rather than in the Earth.

**For experts.** Coverage and gaps; documented data changes, each reviewed by a person for headline cases; leave-one-year-out; five alternative windows (robustness checks, not new claims). A doubt lowers the grade. The Pettitt test flags a sudden jump and never changes a verdict.

## {#grade} The grade

Strong evidence (adjusted p below α/5 and no doubts) · Supported trend (adjusted p below α and at most one doubt) · Can't tell yet, which is not the same as no change (everything else). The practical threshold (`<thresholds>` per decade, declared in advance) is answered separately: is the change big enough to matter?

## {#power} What a record this long can detect

**Plain.** A short or noisy record can miss a real change. If year-to-year noise stays as it was, a change of the size we declared would be caught in about `<N>` of 10 records this long.

**For experts.** Power of MK-AR1 by simulation with an injected trend equal to the declared threshold `<power table, §9.4>`. Weatherhead et al. (1998) appears only as a labelled fallback. The verdict card shows no "years needed" number.

## {#maps} The screening map

**Plain.** If you test thousands of places, some will look significant by chance. We control the share of false alarms among the dots (false discovery rate 10%) and hatch the places we cannot test. The map is for exploring and gives no verdicts.

**For experts.** Per 1° cell, MK-AR1 with memory pooled over the 5 × 5 neighbourhood and the leftover-memory check; Benjamini–Hochberg at q = 0.10 over the testable cells within each map (Wilks 2016); `<n testable>` tests in this map. Pure-noise maps: `<map null test, §9.7>`.

## {#tests} Tests that guard the code

Golden tests assert values, tolerances and verdicts, and any mismatch fails the build. This build: `<passed>` of `<total>` golden tests passed. The confirmatory results were also recomputed with a separate reference implementation.

## {#limits} What we don't do

No forecasts. No claims about causes ("consistent with", never "caused by"). Linear trends only; jumps are flagged. Places smaller than the data cells are not in our set. Variables other than temperature and rain are not analysed in this release.

## {#reproduce} Reproduce any result

Every result file is public and carries its build id, the input-manifest hash and the pre-registration hash. The same pinned inputs, pre-registration and code give the same files.

## {#references} References

<Copy `docs/03_SCIENCE.md` §16 and `docs/02_DATA.md` §12.>

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// W-01…W-13 and I-03 of docs/07_TESTS.md, at 1280 px (desktop project) and 360 px (phone project), EN and BN.
import { expect, test, type Page } from '@playwright/test';
import {
  cases,
  catalog,
  contrast,
  exists,
  fileId,
  inSetRegions,
  lineupOf,
  list,
  offlineSet,
  open,
  outOfSet,
  read,
  regionIndex,
  strings,
  synthetic,
  verdict,
  VERDICT_WORDS,
  watchPage,
  type Lang,
} from './helpers';
import type { Build, Prereg } from '../../src/data/types';

const LANGS: Lang[] = ['en', 'bn'];
const prereg = read<Prereg>('prereg.json');
const build = read<Build>('build.json');
const home = inSetRegions.find((r) => r.role === 'home') ?? inSetRegions[0];
const homeLineup = home ? lineupOf(home.id) : undefined;
const t = (lang: Lang, key: string) => strings[lang][key] ?? key;
const digitsBn = (s: string) => s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d);

async function openProvenance(page: Page) {
  const btn = page.getByTestId('provenance-disclosure').getByRole('button').first();
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await expect(page.getByTestId('provenance')).toBeVisible();
}

for (const lang of LANGS) {
  test.describe(`${lang}`, () => {
    test('W-01 question cards open a shortlist with record cards; deferred cards are greyed', async ({ page }) => {
      const q = catalog.questions.find((x) => (x.also_deferred ?? []).length > 0 && x.shortlist.length > 0) ?? catalog.questions[0];
      if (!q) test.skip();
      await open(page, '#/', lang);
      await page.getByTestId('cta-start').click();
      await page.getByTestId(`question-card-${q!.id}`).click();
      await expect(page.getByTestId('shortlist')).toBeVisible();
      for (const s of q!.shortlist) {
        const card = page.getByTestId(`record-card-${s.variable}`);
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute('data-deferred', 'false');
      }
      for (const d of q!.also_deferred ?? []) {
        const card = page.getByTestId(`record-card-${d}`);
        await expect(card).toHaveAttribute('data-deferred', 'true');
        await expect(card.getByTestId('not-analysed')).toHaveText(t(lang, 'record_card.not_analysed'));
      }
    });

    test('W-02 place picker: the fixed set only, contributing cells drawn, a failed division says why', async ({ page }) => {
      await open(page, '#/place', lang);
      const picker = page.getByTestId('place-picker');
      await expect(picker).toBeVisible();
      await expect(picker.locator('[data-in-set]')).toHaveCount(regionIndex.regions.length);
      for (const r of outOfSet) {
        const item = picker.getByTestId(`region-${r.id}`);
        await expect(item).toHaveAttribute('data-in-set', 'false');
        await expect(item.getByTestId('not-in-set')).toHaveText(t(lang, 'place.not_in_set'));
      }
      await picker.getByTestId(`region-${home!.id}`).click();
      await expect(page.getByTestId('contributing-cells')).toBeVisible();
      await expect(page.locator(`[data-testid="mask-${home!.id}"] rect`).first()).toBeAttached();
      await expect(page.getByTestId('support-line')).toBeVisible();
    });

    test('W-03 the line-up shows the number of tests and each row\'s family', async ({ page, isMobile }) => {
      await open(page, `#/place?region=${home!.id}`, lang);
      const l = homeLineup!;
      const intro = t(lang, 'lineup.intro').replace('{n_tests}', lang === 'bn' ? digitsBn(String(l.nTests)) : String(l.nTests));
      await expect(page.getByTestId('lineup-intro')).toHaveText(intro);
      const rows = page.getByTestId(isMobile ? 'lineup-row-mobile' : 'lineup-row');
      await expect(rows).toHaveCount(l.items.length);
      for (let i = 0; i < l.items.length; i++) {
        await expect(rows.nth(i)).toHaveAttribute('data-family', l.items[i]!.family);
        await expect(rows.nth(i).getByTestId('family-badge')).toHaveText(t(lang, `family.${l.items[i]!.family}`));
      }
    });

    test('W-05 compare: the trend in the difference, each place beside it, the labels, the IMERG lineage', async ({ page }) => {
      const h = prereg.headline_cases.find((x) => x.kind === 'contrast') ?? { pair: regionIndex.pairs[0]?.id, variable: 'rain', season: 'ANN' };
      const rel = `contrasts/${h.variable}/${h.pair}/${h.season}.json`;
      test.skip(!exists(rel), 'no headline contrast in this build');
      const c = contrast(rel);
      await open(page, `#/compare?pair=${h.pair}&variable=${h.variable}&season=${h.season}`, lang);
      await expect(page.getByTestId('compare-headline')).toHaveText(c.text[lang].headline);
      await expect(page.getByTestId('estimand-title')).toBeVisible();
      if (c.domain.inDomain && c.stats.change?.rateLowPerDecade !== null) await expect(page.getByTestId('compare-card').getByTestId('rate-range')).toBeVisible();
      await expect(page.getByTestId('contrast-side')).toBeVisible();
      const labels = page.getByTestId('contrast-labels');
      await expect(labels.getByTestId('label-rates')).toHaveCount(c.labels.ratesDiffer ? 1 : 0);
      await expect(labels.getByTestId('label-opp')).toHaveCount(c.labels.supportedOppositeTrends ? 1 : 0);
      await expect(labels.getByTestId('label-fit')).toHaveCount(c.labels.oppositeFittedDirections ? 1 : 0);
      if (c.sensitivity) {
        await page.getByTestId('sensitivity-switch').click();
        await expect(page.getByTestId('sensitivity-lineage')).toHaveText(t(lang, 'sensitivity.lineage'));
        await expect(page).toHaveURL(/sensitivity=imerg/);
      }
    });

    test('W-06 map: exploration label, number of tests, hatching; a square has no verdict words', async ({ page }) => {
      const maps = list('maps').filter((p) => p.endsWith('meta.json'));
      test.skip(maps.length === 0, 'no map in this build');
      await open(page, '#/map', lang);
      await expect(page.getByTestId('globe-explorer')).toBeVisible();
      await expect(page.getByTestId('map-tests')).toContainText(t(lang, 'map.label'));
      await expect(page.getByTestId('map-label')).toBeVisible();
      // The flat map: the same layer, with a keyboard cursor; a click opens the square in the side panel.
      await page.getByTestId('view-flat').click();
      const canvas = page.getByTestId('map-canvas');
      await expect(canvas).toBeVisible();
      await expect(page.getByTestId('flat-map').getByTestId('map-legend')).toContainText(t(lang, 'map.legend_hatch'));
      const box = await canvas.boundingBox();
      await canvas.click({ position: { x: (box!.width * 3) / 4, y: box!.height / 3 } });
      if ((await page.getByTestId('explore-cell').count()) === 0) await page.getByTestId('open-cell').click();
      const panel = page.getByTestId('explore-cell');
      await expect(panel).toBeVisible();
      await expect(page).toHaveURL(/region=cell:\d+_\d+/);
      for (const w of VERDICT_WORDS(strings[lang])) expect(await panel.innerText()).not.toContain(w);
      // Its full page is exploration too.
      await page.getByTestId('explore-open-cell').click();
      await expect(page.getByTestId('cell-status')).toHaveText(t(lang, 'family.exploration'));
      const text = await page.locator('main').innerText();
      for (const w of VERDICT_WORDS(strings[lang])) expect(text).not.toContain(w);
    });

    test('ASK the ask box understands a question and opens the place that answers it', async ({ page }) => {
      const maps = list('maps').filter((p) => p.endsWith('meta.json'));
      test.skip(maps.length === 0, 'no map in this build');
      await open(page, '#/map', lang);
      await page.getByTestId('view-flat').click();
      await page.getByTestId('ask-input').fill(t(lang, 'site.explore.try_1'));
      await page.getByTestId('ask-submit').click();
      await expect(page.getByTestId('understood')).toBeVisible();
      await expect(page.getByTestId('explore-cell')).toBeVisible();
      await expect(page).toHaveURL(/region=cell:\d+_\d+/);
    });

    test('W-07 the provenance panel shows dataset, version, years, values, build, pre-registration and manifest', async ({ page }) => {
      const item = homeLineup!.items.find((i) => i.status === 'verdict') ?? homeLineup!.items[0]!;
      const v = verdict(item.path);
      await open(page, `#/place?region=${home!.id}&variable=${item.variable}&season=${item.season}`, lang);
      await openProvenance(page);
      const p = page.getByTestId('provenance');
      await expect(p).toContainText(v.provenance.items[0]!.shortName);
      await expect(p).toContainText(v.provenance.items[0]!.version);
      await expect(p).toContainText(v.provenance.buildId);
      await expect(p).toContainText(v.provenance.preregSha256.slice(0, 16));
      await expect(p).toContainText(v.provenance.inputManifestSha256.slice(0, 16));
      const years = `${v.window.first}–${v.window.last}`;
      await expect(p).toContainText(lang === 'bn' ? digitsBn(years) : years);
    });

    test('W-08 the Methods page renders every table, rates worded as a property of the method', async ({ page }) => {
      await open(page, '#/methods', lang);
      await expect(page.getByTestId('methods-property')).toContainText(t(lang, 'methods.property').split('{k}')[1]!.trim().slice(0, 20));
      // Open every "For experts" panel.
      const closed = page.locator('main button[aria-expanded="false"]');
      while ((await closed.count()) > 0) await closed.first().click();
      for (const id of ['table-calibration', 'table-phimax', 'table-stress', 'table-coverage', 'table-power', 'table-leftover', 'table-contrast']) {
        await expect(page.getByTestId(id)).toBeVisible();
      }
      await expect(page.getByTestId('prereg-hash')).toContainText(build.prereg.sha256);
      await expect(page.getByTestId('golden-summary')).toBeVisible();
    });

    test('W-10 the offline list shows the cases kept on the device', async ({ page }) => {
      await open(page, '#/offline', lang);
      await expect(page.getByTestId('offline-list')).toBeVisible();
      for (const c of offlineSet.cases) await expect(page.getByTestId(`offline-case-${c.id}`)).toContainText(c.title[lang]);
    });

    test('W-13 "what would overturn this claim" shows at most three items, only on verdicts', async ({ page }) => {
      for (const item of homeLineup!.items) {
        const v = verdict(item.path);
        await open(page, `#/place?region=${home!.id}&variable=${item.variable}&season=${item.season}`, lang);
        await expect(page.getByTestId('verdict-headline')).toHaveText(v.text[lang].headline);
        const n = await page.getByTestId('overturn-list').locator('li').count();
        expect(n).toBeLessThanOrEqual(3);
        if (v.status !== 'verdict') expect(n).toBe(0);
      }
    });
  });
}

// W-04: a verdict card for every status and reason in verdicts/ (including _states/). Files that no line-up points
// to are served in place of a real verdict, so every one of them goes through the same screen.
const host = homeLineup?.items[0];
for (const rel of list('verdicts')) {
  test(`W-04 ${rel}`, async ({ page }) => {
    const v = verdict(rel);
    const owner = inSetRegions.find((r) => fileId(r.id) === rel.split('/')[2]);
    const item = owner ? lineupOf(owner.id).items.find((i) => i.path === rel) : undefined;
    let hash: string;
    if (owner && item) {
      hash = `#/place?region=${owner.id}&variable=${item.variable}&season=${item.season}`;
    } else {
      hash = `#/place?region=${home!.id}&variable=${host!.variable}&season=${host!.season}`;
      await page.route(`**/${host!.path}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) }));
    }
    for (const lang of LANGS) {
      await open(page, hash, lang);
      await expect(page.getByTestId('verdict-headline')).toHaveText(v.text[lang].headline);
      await expect(page.getByTestId('verdict-card').getByTestId('status-badge').first()).toBeVisible();
      if (!v.domain.inDomain) await expect(page.getByTestId('rate-range')).toHaveCount(0);
      if (v.status === 'verdict' && v.grade === 'cant_tell_yet') expect(v.text[lang].headline.length).toBeGreaterThan(0);
    }
  });
}

test('W-09 every watch case plays to the end with the ending its result chose', async ({ page }) => {
  for (const c of cases) {
    await open(page, `#/watch/${c.id}`);
    await expect(page.getByTestId('watch-player')).toBeVisible();
    for (let i = 0; i < c.beats.length - 1; i++) {
      if (c.beats[i]!.at === 'verdict') await expect(page.getByTestId('watch-ending')).toHaveAttribute('data-ending', c.ending ?? 'none');
      await page.getByTestId('watch-next').click();
    }
    await expect(page.getByTestId('watch-player')).toHaveAttribute('data-beat-index', String(c.beats.length - 1));
    await expect(page.getByTestId('watch-caption')).toHaveText(c.beats[c.beats.length - 1]!.caption.en);
    await expect(page.getByTestId('watch-replay')).toBeVisible();
  }
});

test('W-09 a "can\'t tell yet" ending picks the verdict beat and the last screen', async ({ page }) => {
  const c = cases.find((x) => x.beats.some((b) => b.at === 'verdict') && x.beats.some((b) => b.at === 'takeaway'));
  test.skip(!c, 'no case with a verdict and a takeaway beat');
  const changed = { ...c!, ending: 'cant_tell_yet' };
  await page.route(`**/cases/${c!.id}.json`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(changed) }));
  await open(page, `#/watch/${c!.id}`);
  const vi = c!.beats.findIndex((b) => b.at === 'verdict');
  await page.getByTestId('watch-progress').getByRole('button').nth(vi).click();
  await expect(page.getByTestId('watch-ending')).toHaveAttribute('data-ending', 'cant_tell_yet');
  await expect(page.getByTestId('watch-verdict').getByTestId('status-badge')).toContainText(strings.en['grade.cant_tell_yet.name']!);
  const last = c!.beats.length - 1;
  await page.getByTestId('watch-progress').getByRole('button').nth(last).click();
  await expect(page.getByTestId('watch-takeaway')).toHaveAttribute('data-ending', 'cant_tell_yet');
});

test('W-11 every view restores from its URL', async ({ page }) => {
  const pair = regionIndex.pairs[0];
  const views: [string, string][] = [
    ['#/', 'lead-case'],
    [`#/question?question=${catalog.questions[0]!.id}`, 'shortlist'],
    [`#/place?region=${home!.id}&variable=${homeLineup!.items[1]?.variable ?? ''}&season=${homeLineup!.items[1]?.season ?? ''}`, 'verdict-card'],
    ...(pair ? ([[`#/compare?pair=${pair.id}`, 'compare-view']] as [string, string][]) : []),
    ['#/map', 'map-label'],
    [`#/watch/${cases[0]!.id}`, 'watch-player'],
    ['#/methods', 'methods-domain'],
    ['#/offline', 'offline-list'],
    ['#/data', 'citations'],
    ['#/ai', 'ai-statement'],
  ];
  for (const [hash, id] of views) {
    await open(page, hash);
    await expect(page.getByTestId(id).first(), hash).toBeVisible();
  }
  // A bad link falls back to defaults with a notice.
  await open(page, '#/place?region=synthetic:does_not_exist');
  await expect(page.getByTestId('bad-link')).toBeVisible();
  await expect(page.getByTestId('place-picker')).toBeVisible();
});

test('W-12 the confidence spine appears on every screen that shows a result', async ({ page }) => {
  const pair = regionIndex.pairs[0];
  const screens = [`#/place?region=${home!.id}`, ...(pair ? [`#/compare?pair=${pair.id}`] : []), `#/watch/${cases[0]!.id}`];
  const tiles = list('cells').filter((p) => p.endsWith('meta.json'));
  if (tiles.length) {
    const meta = read<{ variable: string; tile: { rows: number; cols: number }; tilesPresent: [number, number][] }>(tiles[0]!);
    const [tr, tc] = meta.tilesPresent[0]!;
    screens.push(`#/place?region=cell:${tr * meta.tile.rows}_${tc * meta.tile.cols}&variable=${meta.variable}`);
  }
  for (const s of screens) {
    await open(page, s);
    await expect(page.getByTestId('spine'), s).toBeVisible();
  }
  await open(page, '#/methods');
  await expect(page.getByTestId('spine')).toHaveCount(0);
});

test('W-04 the synthetic banner shows whenever synthetic data are on screen', async ({ page }) => {
  await open(page, `#/place?region=${home!.id}`);
  await expect(page.getByTestId('synthetic-banner')).toHaveCount(synthetic ? 1 : 0);
});

test('I-03 the site requests only files from its own origin, with no console error', async ({ page, baseURL }) => {
  const w = watchPage(page, baseURL!);
  const pair = regionIndex.pairs[0];
  for (const h of ['#/', '#/question', `#/place?region=${home!.id}`, ...(pair ? [`#/compare?pair=${pair.id}`] : []), '#/map', '#/methods', `#/watch/${cases[0]!.id}`, '#/data']) {
    await open(page, h);
    await page.waitForLoadState('networkidle');
  }
  expect(w.foreign).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('ATLAS the place shows how its squares are chosen, and the verdict has one stripe per year', async ({ page }) => {
  const item = homeLineup!.items[0]!;
  const v = read<{ series: { years: number[] } }>(item.path);
  await open(page, `#/place?region=${home!.id}&variable=${item.variable}&season=${item.season}`);
  await expect(page.getByTestId('squares-explainer')).toBeVisible();
  await expect(page.locator('[data-testid="squares-explainer"] [data-testid="contributing-cells"] text').first()).toBeAttached();
  await expect(page.getByTestId('climate-stripes').first()).toBeVisible();
  await expect(page.getByTestId('climate-stripes').first().locator('svg > rect')).toHaveCount(v.series.years.length);
});

test('COUNTRY asking about a country opens its squares, and a square opens with a way back', async ({ page }) => {
  const maps = list('maps').filter((p) => p.endsWith('meta.json'));
  test.skip(maps.length === 0, 'no map in this build');
  await open(page, '#/map');
  await page.getByTestId('view-flat').click();
  await page.getByTestId('ask-input').fill('Is Nigeria getting hotter?');
  await page.getByTestId('ask-submit').click();
  const panel = page.getByTestId('explore-country');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Nigeria');
  const items = panel.locator('ol button');
  test.skip((await items.count()) === 0, 'no testable square in this country');
  await items.first().click();
  await expect(page.getByTestId('explore-cell')).toBeVisible();
  await page.getByTestId('back-to-country').click();
  await expect(page.getByTestId('explore-country')).toBeVisible();
});

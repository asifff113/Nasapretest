// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The exploration screens: Trends (counts of the engine's map squares), compare any two places, the story of any
// place, region reports, the globe's year timeline and the record list. Tests that need the exploration files
// (explore/, maps/<v>/ANN/years.json) run on a results build (RESULTS_DIR=../results) and are skipped on examples/.
import { expect, test } from '@playwright/test';
import { catalog, exists, open, read, regionIndex } from './helpers';

const hasExplore = exists('explore/index.json');
const analysed = catalog.variables.filter((v) => v.status === 'analysed');
const mapVar = analysed.find((v) => exists(`maps/${v.id}/ANN/meta.json`));
const yearsVar = analysed.find((v) => exists(`maps/${v.id}/ANN/years.json`));

test('Trends counts the squares of the engine map and ranks places', async ({ page }) => {
  test.skip(!mapVar, 'no screening map in this build');
  await open(page, `#/trends?variable=${mapVar!.id}`);
  const headline = page.getByTestId('trends-headline');
  await expect(headline).toBeVisible();
  await expect(page.getByTestId('trends-tested')).not.toHaveText('0');
  await expect(page.getByTestId('trends-histogram')).toBeVisible();
  const area = page.getByRole('combobox', { name: 'Area' });
  if (await area.isVisible()) await area.selectOption({ label: 'Continent' }); // phones show the switch as a list
  else await page.getByTestId('trends-level-continent').click();
  await expect(headline).toBeVisible();
});

test('the record list shows only records with data in this build', async ({ page }) => {
  await open(page, '#/map');
  const rail = page.getByTestId('variable-rail');
  await expect(rail).toBeVisible();
  for (const v of catalog.variables.filter((x) => x.status === 'deferred' || x.status === 'reference')) {
    await expect(rail.getByText(v.name.en, { exact: true })).toHaveCount(0);
  }
});

test('Watch explains what a case is', async ({ page }) => {
  await open(page, '#/watch');
  await expect(page.getByTestId('what-case')).toBeVisible();
  await expect(page.getByTestId('case-list')).toBeVisible();
});

test('compare has a tested mode and an any-two mode', async ({ page }) => {
  await open(page, '#/compare');
  await expect(page.getByTestId('compare-modes')).toBeVisible();
  await page.getByTestId('compare-mode-any').click();
  await expect(page.getByTestId('any-compare')).toBeVisible();
});

test.describe('with the exploration files', () => {
  test.skip(!hasExplore, 'this build has no explore/ files (examples)');

  test('any two places side by side, with a swap', async ({ page }) => {
    await open(page, '#/compare?a=country:BGD&b=country:IND');
    await expect(page.getByTestId('compare-table')).toBeVisible();
    await expect(page.getByTestId('report-years-chart')).toBeVisible();
    await page.getByTestId('any-swap').click();
    await expect(page).toHaveURL(/a=country:IND&b=country:BGD/);
  });

  test('any country opens its report', async ({ page }) => {
    await open(page, '#/place?region=country:NPL');
    await expect(page.getByTestId('region-report')).toBeVisible();
    await expect(page.getByTestId('report-glance')).toBeVisible();
    await expect(page.getByTestId('report-years-chart')).toBeVisible();
  });

  test('a region in the set but outside the pre-registered tests opens its report', async ({ page }) => {
    const prereg = read<{ regions: { set: { id: string }[] } }>('prereg.json');
    const tested = new Set(prereg.regions.set.map((r) => r.id));
    const untested = regionIndex.regions.find((r) => r.inSet && !tested.has(r.id));
    test.skip(!untested, 'every region in the set is pre-registered');
    await open(page, `#/place?region=${untested!.id}`);
    await expect(page.getByTestId('region-report')).toBeVisible();
    await expect(page.getByText(/not in this build/i)).toHaveCount(0);
  });

  test('the place gallery lists every place with a search', async ({ page }) => {
    await open(page, '#/place');
    const dir = page.getByTestId('place-directory');
    await expect(dir).toBeVisible();
    await page.getByTestId('directory-search').fill('Nepal');
    await expect(dir.getByRole('link', { name: 'Nepal' }).first()).toBeVisible();
  });

  test('the story of any place plays step by step', async ({ page }) => {
    await open(page, '#/watch?region=country:NPL');
    await expect(page.getByTestId('story-player')).toBeVisible();
    await expect(page.getByTestId('story-caption')).toContainText('Nepal');
    await page.getByRole('button', { name: /Next step/ }).click();
    await expect(page.getByTestId('story-step')).toContainText('2');
  });
});

test('the globe timeline repaints a chosen year', async ({ page }) => {
  test.skip(!yearsVar, 'this build has no yearly map frames');
  await open(page, `#/map?variable=${yearsVar!.id}`);
  await page.getByRole('button', { name: 'Year by year' }).click();
  await expect(page.getByTestId('years-timeline')).toBeVisible();
  await page.getByTestId('years-year-1990').click();
  await expect(page.getByTestId('years-year')).toHaveText('1990');
});

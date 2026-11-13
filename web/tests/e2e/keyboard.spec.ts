// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// X-02: keyboard only — choose a question, a place and a pair, open a verdict, the map and the Methods page.
import { expect, test, type Page } from '@playwright/test';
import { catalog, inSetRegions, lineupOf, open, regionIndex } from './helpers';

/** Tabs forward until the focused element matches, then presses Enter. */
async function tabTo(page: Page, selector: string, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);
    if (hit) return;
  }
  throw new Error(`keyboard could not reach ${selector}`);
}

test('X-02 keyboard only', async ({ page }) => {
  const q = catalog.questions[0]!;
  const home = inSetRegions.find((r) => r.role === 'home') ?? inSetRegions[0]!;
  const item = lineupOf(home.id).items[1] ?? lineupOf(home.id).items[0]!;
  const pair = regionIndex.pairs[0];

  await open(page, '#/');
  await tabTo(page, '[data-testid="cta-start"]');
  await page.keyboard.press('Enter');
  await tabTo(page, `[data-testid="question-card-${q.id}"]`);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('shortlist')).toBeVisible();

  await open(page, '#/place');
  await tabTo(page, `[data-testid="region-${home.id}"]`);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`region=${home.id}`));
  await tabTo(page, `[data-testid="lineup"] a[href*="season=${item.season}"][href*="variable=${item.variable}"]`);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`season=${item.season}`));
  await expect(page.getByTestId('verdict-card')).toBeVisible();

  if (pair) {
    await open(page, '#/compare');
    await tabTo(page, `[data-testid="pair-${pair.id}"]`);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('compare-view')).toBeVisible();
  }

  await open(page, '#/map');
  // A segmented control takes one Tab stop; the arrow keys move between its options.
  await tabTo(page, '[data-testid="view-globe"]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('flat-map')).toBeVisible();
  await tabTo(page, '[data-testid="map-canvas"]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('map-announce')).not.toBeEmpty();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/region=cell:/);
  await expect(page.getByTestId('explore-cell')).toBeVisible();

  await open(page, '#/');
  await tabTo(page, 'header a[href="#/methods"], footer a[href="#/methods"]');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('methods-domain')).toBeVisible();
});

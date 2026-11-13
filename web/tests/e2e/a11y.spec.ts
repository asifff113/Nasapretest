// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// X-01: axe-core on every screen, light and dark, English and Bangla: no serious or critical violation.
// X-05: charts have text alternatives; status icons have text. X-06: reduced motion stops transitions.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { cases, catalog, inSetRegions, open, regionIndex, type Lang } from './helpers';

const home = inSetRegions.find((r) => r.role === 'home') ?? inSetRegions[0];
const pair = regionIndex.pairs[0];
const SCREENS = [
  '#/',
  `#/question?question=${catalog.questions[0]?.id ?? ''}`,
  '#/place',
  `#/place?region=${home?.id ?? ''}`,
  ...(pair ? [`#/compare?pair=${pair.id}`] : []),
  '#/map',
  '#/methods',
  `#/watch/${cases[0]?.id ?? ''}`,
  '#/watch',
  '#/offline',
  '#/data',
  '#/ai',
  '#/about',
];

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'bn'] as Lang[]) {
    test(`X-01 axe: no serious or critical violation (${theme}, ${lang})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const problems: string[] = [];
      for (const s of SCREENS) {
        await open(page, s, lang, theme);
        await page.waitForLoadState('networkidle');
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        for (const v of res.violations) {
          if (v.impact === 'serious' || v.impact === 'critical') {
            problems.push(`${s}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
}

test('X-05 charts have text alternatives and status icons have text', async ({ page }) => {
  await open(page, `#/place?region=${home?.id ?? ''}`);
  const chart = page.getByTestId('trend-chart');
  await expect(chart).toHaveAttribute('role', 'img');
  expect((await chart.getAttribute('aria-label'))?.length ?? 0).toBeGreaterThan(10);
  for (const badge of await page.getByTestId('status-badge').all()) {
    expect((await badge.innerText()).trim().length).toBeGreaterThan(0);
  }
});

test('X-06 with reduced motion, transitions stop and the watch player still advances', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await open(page, `#/watch/${cases[0]?.id ?? ''}`);
  await expect(page.getByTestId('watch-player')).toHaveAttribute('data-beat-index', '0');
  const duration = await page.getByTestId('watch-playpause').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.01);
  await page.clock.runFor(6500);
  await expect(page.getByTestId('watch-player')).toHaveAttribute('data-beat-index', '1');
});

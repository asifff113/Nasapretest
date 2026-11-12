// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The polish loop (docs/04_UI.md §12; Part 6A): screenshots of every screen at 360, 768 and 1280 px, light and dark,
// English and Bangla, saved to tests/screens/. Run with `npm run screens`; not part of `npm run test:e2e`.
import path from 'node:path';
import { test } from '@playwright/test';
import { cases, catalog, inSetRegions, open, regionIndex, WEB, type Lang } from './helpers';

const home = inSetRegions.find((r) => r.role === 'home') ?? inSetRegions[0];
const pair = regionIndex.pairs[0];
const SCREENS: [string, string][] = [
  ['home', '#/'],
  ['question', `#/question?question=${catalog.questions[1]?.id ?? catalog.questions[0]?.id ?? ''}`],
  ['place', `#/place?region=${home?.id ?? ''}`],
  ['compare', pair ? `#/compare?pair=${pair.id}` : '#/compare'],
  ['map', '#/map'],
  ['methods', '#/methods'],
  ['watch', `#/watch/${cases[0]?.id ?? ''}`],
  ['offline', '#/offline'],
];
const WIDTHS = (process.env.SCREEN_WIDTHS ?? '360,768,1280').split(',').map(Number);
const THEMES = (process.env.SCREEN_THEMES ?? 'light,dark').split(',') as ('light' | 'dark')[];
const LANGS = (process.env.SCREEN_LANGS ?? 'en,bn').split(',') as Lang[];

for (const w of WIDTHS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      test(`@screens ${w} ${theme} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        for (const [name, hash] of SCREENS) {
          await open(page, hash, lang);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(WEB, 'tests', 'screens', `${name}-${w}-${theme}-${lang}.png`), fullPage: true });
        }
      });
    }
  }
}

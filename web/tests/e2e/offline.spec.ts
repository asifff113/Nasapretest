// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// W-10 and I-04: the offline build is one HTML file (at most 15 MB) that opens from file:// with the network
// blocked, lists the cases kept on the device, and plays every case. Zero requests are attempted.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { cases, offlineSet, WEB } from './helpers';

const out = path.join(WEB, 'dist-offline');
let file = '';

test.beforeAll(() => {
  execSync('npm run build:offline', { cwd: WEB, stdio: 'ignore' });
  const html = fs.readdirSync(out).filter((f) => f.endsWith('.html'));
  expect(html).toEqual(['index.html']);
  expect(fs.readdirSync(out).length).toBe(1);
  file = path.join(out, 'index.html');
  expect(fs.statSync(file).size).toBeLessThanOrEqual(15 * 1024 * 1024);
});

test('I-04 / W-10 the offline file opens from file:// with the network blocked and plays every case', async ({ page, context }) => {
  const requests: string[] = [];
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    requests.push(u);
    return route.abort();
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) requests.push(u);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = pathToFileURL(file).href;

  await page.goto(url);
  await expect(page.getByTestId('offline-list')).toBeVisible();
  for (const c of offlineSet.cases) await expect(page.getByTestId(`offline-case-${c.id}`)).toBeVisible();

  for (const c of cases) {
    await page.goto(`${url}#/watch/${c.id}`);
    await expect(page.getByTestId('watch-player')).toBeVisible();
    for (let i = 0; i < c.beats.length - 1; i++) await page.getByTestId('watch-next').click();
    await expect(page.getByTestId('watch-player')).toHaveAttribute('data-beat-index', String(c.beats.length - 1));
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

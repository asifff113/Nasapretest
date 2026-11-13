// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Shared helpers for the end-to-end tests. Ids come from the folder the site shows (RESULTS_DIR), never from code.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { CaseFile, Catalog, Contrast, Current, Lineup, OfflineSet, RegionIndex, Verdict } from '../../src/data/types';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB = path.resolve(here, '..', '..');
export const RESULTS_DIR = path.resolve(WEB, process.env.RESULTS_DIR ?? '../examples');

const current = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'current.json'), 'utf8')) as Current;
/** The build's own folder: <dir>/<buildId>/ for a results folder, <dir> itself for the examples. */
export const BUILD_DIR = fs.existsSync(path.join(RESULTS_DIR, current.buildId, 'build.json')) ? path.join(RESULTS_DIR, current.buildId) : RESULTS_DIR;

export function read<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(BUILD_DIR, rel), 'utf8')) as T;
}
export function exists(rel: string): boolean {
  return fs.existsSync(path.join(BUILD_DIR, rel));
}
export function list(relDir: string, ext = '.json'): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(ext)) out.push(path.relative(BUILD_DIR, p).split(path.sep).join('/'));
    }
  };
  walk(path.join(BUILD_DIR, relDir));
  return out.sort();
}

export const catalog = read<Catalog>('catalog.json');
export const regionIndex = read<RegionIndex>('regions/index.json');
export const offlineSet = read<OfflineSet>('offline/set.json');
export const cases = offlineSet.cases.map((c) => read<CaseFile>(`cases/${c.id}.json`));
export const fileId = (id: string) => id.replace(/:/g, '__');
export const inSetRegions = regionIndex.regions.filter((r) => r.inSet);
export const outOfSet = regionIndex.regions.filter((r) => !r.inSet);
export const lineupOf = (id: string) => read<Lineup>(`lineups/${fileId(id)}.json`);
export const verdict = (rel: string) => read<Verdict>(rel);
export const contrast = (rel: string) => read<Contrast>(rel);
export const synthetic = Boolean(current.synthetic);

export type Lang = 'en' | 'bn';

/** Opens a view in a language (the language lives in localStorage, never in the URL). */
export async function open(page: Page, hash: string, lang: Lang = 'en', theme?: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(
    ([l, th]) => {
      try {
        window.localStorage.setItem('cfe.lang', l as string);
        if (th) window.localStorage.setItem('cfe.theme', th as string);
      } catch {
        /* ignore */
      }
    },
    [lang, theme ?? ''],
  );
  // A fresh document each time: going to the same URL with only a new hash would not reload the page.
  await page.goto('about:blank');
  await page.goto(`/${hash}`);
  await expect(page.locator('main')).toBeVisible();
}

/** Collects console errors and requests to other origins during a test. */
export function watchPage(page: Page, origin: string) {
  const errors: string[] = [];
  const foreign: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });
  return { errors, foreign };
}

/** Words that must never appear on exploration screens (map, cells). */
export const VERDICT_WORDS = (t: Record<string, string>) => [t['grade.strong.name'], t['grade.supported.name'], t['grade.cant_tell_yet.name']].filter(Boolean) as string[];

export const strings = JSON.parse(fs.readFileSync(path.join(WEB, 'src', 'generated', 'strings.json'), 'utf8')) as Record<Lang, Record<string, string>>;

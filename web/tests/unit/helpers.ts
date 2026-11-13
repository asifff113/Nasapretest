// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '..', '..', '..');
export const WEB = path.resolve(here, '..', '..');
/** The results folder the tests run on: examples/ by default, or RESULTS_DIR. */
export const RESULTS = path.resolve(WEB, process.env.RESULTS_DIR ?? '../examples');

export function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8')) as T;
}

export function readResult<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(RESULTS, rel), 'utf8')) as T;
}

export function listFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(ext)) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

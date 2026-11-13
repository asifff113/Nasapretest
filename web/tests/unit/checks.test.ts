// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The check marks line up with the engine's check sentences in every result file of the build.
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkMarks } from '../../src/components/ChecksList';
import type { Contrast, Verdict } from '../../src/data/types';
import { RESULTS, listFiles } from './helpers';

const files = [...listFiles(path.join(RESULTS, 'verdicts'), '.json'), ...listFiles(path.join(RESULTS, 'contrasts'), '.json')];

describe('check marks', () => {
  it('finds result files', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8')) as Verdict | Contrast;
    if (r.text.en.checks.length === 0) continue;
    it(path.relative(RESULTS, f), () => {
      expect(checkMarks(r.robustness).length).toBe(r.text.en.checks.length);
      expect(r.text.bn.checks.length).toBe(r.text.en.checks.length);
    });
  }
});

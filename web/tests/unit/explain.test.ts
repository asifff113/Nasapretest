// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// "Explain this chart": on every result file, the limit it names is one of the challenges the engine marks as
// weakening, and every string it can pick (limit, correction method, reason) exists in English and Bangla.
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { challengeMarks } from '../../src/components/ChallengePanel';
import { firstLimit } from '../../src/components/ExplainChart';
import type { Contrast, Verdict } from '../../src/data/types';
import { RESULTS, listFiles, readJson } from './helpers';

type Strings = { site: { explain: Record<string, string>; reason_short: Record<string, string> } };
const en = readJson<Strings>('web/src/i18n/site.en.json');
const bn = readJson<Strings>('web/src/i18n/site.bn.json');
const files = [...listFiles(path.join(RESULTS, 'verdicts'), '.json'), ...listFiles(path.join(RESULTS, 'contrasts'), '.json')];

describe('explain this chart, on every result file', () => {
  it('finds result files', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8')) as Verdict | Contrast;
    it(path.relative(RESULTS, f), () => {
      const limit = firstLimit(r, 0);
      if (limit) {
        const sens = r.sensitivity;
        const cross = sens === null || sens === undefined ? null : typeof sens === 'string' ? ('verdict' as const) : { sameSign: sens.sameSign };
        expect(challengeMarks(r.robustness, r.doubts, 0, cross).find((c) => c.id === limit)?.mark).toBe('weakens');
        expect(en.site.explain[`limit_${limit}`]).toBeTruthy();
        expect(bn.site.explain[`limit_${limit}`]).toBeTruthy();
      }
      expect(en.site.explain[`method_${r.multiplicity.method}`]).toBeTruthy();
      expect(bn.site.explain[`method_${r.multiplicity.method}`]).toBeTruthy();
      if (r.status !== 'verdict' && r.reason) {
        expect(en.site.reason_short[r.reason]).toBeTruthy();
        expect(bn.site.reason_short[r.reason]).toBeTruthy();
      }
    });
  }
});

describe('explain strings', () => {
  it('has a limit sentence for every challenge', () => {
    for (const id of ['loo', 'windows', 'jump', 'breaks', 'coverage', 'crosscheck', 'doubts']) {
      expect(en.site.explain[`limit_${id}`]).toBeTruthy();
      expect(bn.site.explain[`limit_${id}`]).toBeTruthy();
    }
  });
});

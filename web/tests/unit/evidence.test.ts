// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The evidence layer on every result file of the build, and on the real case that motivated it: Bangladesh rain,
// where the exploration screen "stands out" while the pre-registered test says "can't tell yet".
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Contrast, Verdict } from '../../src/data/types';
import type { ExploreTrends } from '../../src/data/explore';
import { challenge, classOfFamily, explorationFinding, nextActions, otherDatasetFinding, windowPoints } from '../../src/copilot/evidence';
import { REPO, RESULTS, listFiles } from './helpers';

const files = [...listFiles(path.join(RESULTS, 'verdicts'), '.json'), ...listFiles(path.join(RESULTS, 'contrasts'), '.json')];
const read = <T,>(p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as T;

describe('evidence on every result file', () => {
  it('finds result files', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const r = read<Verdict | Contrast>(f);
    const rel = path.relative(RESULTS, f).replaceAll('\\', '/');
    it(rel, () => {
      const findings = challenge(r, rel);
      expect(findings.length).toBeGreaterThan(0);
      // the first finding is always the deciding test (or why there is none)
      expect(['test_supported', 'test_cant_tell', 'no_verdict', 'sensitivity_role']).toContain(findings[0]!.id);
      for (const x of findings) expect(x.source.startsWith(`${rel}#`)).toBe(true);
      // a graded claim only ever comes from a pre-registered family
      if (findings[0]!.id === 'test_supported') expect(classOfFamily(r.family)).toBe('preregistered');
      // window chart: the main window first, then only windows that ran, values copied as written
      const pts = windowPoints(r);
      if (r.spine.ratePerDecade !== null) {
        expect(pts[0]).toMatchObject({ main: true, rate: r.spine.ratePerDecade, first: r.window.first, last: r.window.last });
      }
      expect(pts.filter((p) => !p.main).length).toBeLessThanOrEqual(r.robustness.windows?.ran ?? 0);
      expect(Array.isArray(nextActions(findings, r))).toBe(true);
    });
  }
});

const R5 = path.join(REPO, 'results', 'r5');
const real = fs.existsSync(path.join(R5, 'verdicts', 'rain', 'country__BGD', 'ANN.json'));

describe.skipIf(!real)('Bangladesh rain in r5: the case the copilot must not get wrong', () => {
  const vPath = 'verdicts/rain/country__BGD/ANN.json';
  const v = real ? read<Verdict>(path.join(R5, vPath)) : (null as unknown as Verdict);
  const trends = real ? read<ExploreTrends>(path.join(R5, 'explore', 'trends', 'rain.json')) : (null as unknown as ExploreTrends);
  const imergPath = v?.sensitivity ?? '';
  const imerg = real && imergPath ? read<Verdict>(path.join(R5, imergPath)) : undefined;

  it('the registered test decides: can\'t tell yet, with its adjusted p', () => {
    const f = challenge(v, vPath);
    expect(classOfFamily(v.family)).toBe('preregistered');
    expect(f[0]).toMatchObject({ id: 'test_cant_tell', severity: 'qualify', params: { pAdjusted: v.multiplicity.pAdjusted, familySize: 12 } });
  });

  it('the 1998 jump is flagged and reported as unreviewed, not hidden behind "no documented data change"', () => {
    const jump = challenge(v, vPath).find((x) => x.id === 'jump_unreviewed' || x.id === 'jump_reviewed');
    expect(jump).toMatchObject({ id: 'jump_unreviewed', severity: 'qualify', params: { year: v.robustness.pettitt?.year, documentedBreaks: 0 } });
  });

  it('an influential year is named', () => {
    expect(challenge(v, vPath).find((x) => x.id === 'loo_flip')?.params.year).toBe(v.robustness.loo?.year);
  });

  it('exploration "stands out" is reconciled with the registered verdict, not allowed to overrule it', () => {
    const item = trends.items.find((i) => i.id === 'country:BGD');
    const f = explorationFinding(v, vPath, item, 'explore/trends/rain.json');
    expect(item?.standsOut).toBe(true);
    expect(f).toMatchObject({ id: 'exploration_differs', severity: 'note', params: { standsOut: true, grade: 'cant_tell_yet' } });
  });

  it('IMERG is shown with its own window: not a matched comparison', () => {
    const f = otherDatasetFinding(v, vPath, imerg, imergPath);
    expect(f).toMatchObject({ id: 'other_dataset', params: { matched: false, first: imerg?.window.first, mainFirst: 1980 } });
  });

  it('next steps follow from what is left open', () => {
    const f = [...challenge(v, vPath), otherDatasetFinding(v, vPath, imerg, imergPath)!];
    expect(nextActions(f, v)).toEqual(expect.arrayContaining(['open_seasons', 'open_other_dataset', 'open_monthly']));
  });
});

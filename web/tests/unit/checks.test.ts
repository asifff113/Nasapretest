// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The check marks line up with the engine's check sentences in every result file of the build, and the site's
// row on undated data changes goes right after the engine's breaks sentence.
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkMarks, lastBreakRow, undatedBreaks } from '../../src/components/ChecksList';
import type { Catalog, Contrast, Robustness, Verdict } from '../../src/data/types';
import { RESULTS, listFiles, readJson } from './helpers';

const files = [...listFiles(path.join(RESULTS, 'verdicts'), '.json'), ...listFiles(path.join(RESULTS, 'contrasts'), '.json')];
const catalog = JSON.parse(fs.readFileSync(path.join(RESULTS, 'catalog.json'), 'utf8')) as Catalog;
const engineEn = readJson<{ checks: { breaks: { none: string } } }>('config/i18n/en.json');
const variableOf = (r: Verdict | Contrast) => (typeof r.variable === 'string' ? r.variable : r.variable.id);

describe('check marks', () => {
  it('finds result files', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8')) as Verdict | Contrast;
    if (r.text.en.checks.length === 0) continue;
    const undated = undatedBreaks(catalog, variableOf(r)).length > 0;
    it(path.relative(RESULTS, f), () => {
      expect(checkMarks(r.robustness, undated).length).toBe(r.text.en.checks.length);
      expect(r.text.bn.checks.length).toBe(r.text.en.checks.length);
      if (r.robustness.breaks.length === 0 && r.robustness.gaps.missingYears.length === 0) {
        // The undated-changes row is inserted after this index: it must be the engine's "none" sentence.
        expect(r.text.en.checks[lastBreakRow(r.robustness)]).toBe(engineEn.checks.breaks.none);
      }
    });
  }
});

const base: Robustness = {
  gaps: { missingYears: [] },
  coverage: { status: 'skip', cmin: null, cmax: null, p: null },
  breaks: [],
  loo: { status: 'pass', year: null, pMax: null, pMin: null },
  windows: null,
  pettitt: { flagged: true, year: 1998 },
};

describe('undated data changes', () => {
  it('lists only the record card changes that have no date', () => {
    const withCard = catalog.variables.find((v) => (v.record_card?.known_breaks ?? []).some((b) => b.date === null));
    expect(withCard).toBeDefined();
    const got = undatedBreaks(catalog, withCard!.id).map((b) => b.id);
    const want = (withCard!.record_card?.known_breaks ?? []).filter((b) => b.date === null).map((b) => b.id);
    expect(got).toEqual(want);
    expect(got.length).toBeGreaterThan(0);
  });

  it('returns nothing without a catalog, a variable or a card', () => {
    expect(undatedBreaks(undefined, 'x')).toEqual([]);
    expect(undatedBreaks(catalog, undefined)).toEqual([]);
    expect(undatedBreaks(catalog, '__no_such_record__')).toEqual([]);
  });

  it('turns the empty breaks row from a pass into a note', () => {
    expect(checkMarks(base)[1]).toBe('pass');
    expect(checkMarks(base, true)[1]).toBe('note');
  });

  it('leaves dated break rows as they were', () => {
    const r: Robustness = { ...base, breaks: [{ id: 'b', year: 2014, label: { en: 'x', bn: 'x' }, status: 'unreviewed', review: null }] };
    expect(checkMarks(r, true)).toEqual(checkMarks(r, false));
  });

  it('finds the last breaks row with and without a coverage row', () => {
    expect(lastBreakRow(base)).toBe(1);
    expect(lastBreakRow({ ...base, coverage: { status: 'pass', cmin: 1, cmax: 1, p: null } })).toBe(2);
    const two = { ...base, breaks: [0, 1].map((i) => ({ id: `b${i}`, year: 2000 + i, label: { en: '', bn: '' }, status: 'unreviewed', review: null })) };
    expect(lastBreakRow(two)).toBe(2);
  });
});

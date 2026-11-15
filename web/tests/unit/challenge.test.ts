// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// "Challenge this conclusion": its marks follow the engine's statuses in every result file, the cross-check row
// appears only when the result names one, and every doubt the schema allows has a sentence in both languages.
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { challengeMarks } from '../../src/components/ChallengePanel';
import type { Contrast, Robustness, Verdict } from '../../src/data/types';
import { RESULTS, listFiles, readJson } from './helpers';

const files = [...listFiles(path.join(RESULTS, 'verdicts'), '.json'), ...listFiles(path.join(RESULTS, 'contrasts'), '.json')];
const cross = (r: Verdict | Contrast) =>
  r.sensitivity === null || r.sensitivity === undefined ? null : typeof r.sensitivity === 'string' ? ('verdict' as const) : { sameSign: r.sensitivity.sameSign };

describe('challenge marks on every result file', () => {
  it('finds result files', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8')) as Verdict | Contrast;
    it(path.relative(RESULTS, f), () => {
      const list = challengeMarks(r.robustness, r.doubts, 0, cross(r));
      const byId = Object.fromEntries(list.map((c) => [c.id, c.mark]));
      expect(byId.doubts).toBe(r.doubts.length ? 'weakens' : 'holds');
      expect('crosscheck' in byId).toBe(Boolean(r.sensitivity));
      const lo = r.robustness.loo?.status;
      expect(byId.loo).toBe(lo === 'pass' ? 'holds' : lo === 'doubt' ? 'weakens' : lo === 'note' ? 'note' : 'skip');
      expect(byId.jump).toBe(r.robustness.pettitt ? (r.robustness.pettitt.flagged ? 'weakens' : 'holds') : 'skip');
    });
  }
});

const base: Robustness = {
  gaps: { missingYears: [] },
  coverage: { status: 'skip', cmin: null, cmax: null, p: null },
  breaks: [],
  loo: { status: 'doubt', year: 2018, pMax: 0.05, pMin: 0.002 },
  windows: { status: 'pass', agree: 4, ran: 5, items: [] },
  pettitt: { flagged: true, year: 1998 },
};

describe('challenge marks', () => {
  it('turns undated data changes into a note, and an unreviewed dated one into a weakness', () => {
    expect(challengeMarks(base, [], 0, null).find((c) => c.id === 'breaks')?.mark).toBe('holds');
    expect(challengeMarks(base, [], 2, null).find((c) => c.id === 'breaks')?.mark).toBe('note');
    const dated = { ...base, breaks: [{ id: 'b', year: 2014, label: { en: '', bn: '' }, status: 'unreviewed', review: null }] };
    expect(challengeMarks(dated, [], 0, null).find((c) => c.id === 'breaks')?.mark).toBe('weakens');
  });
  it('reads the comparison cross-check from sameSign', () => {
    expect(challengeMarks(base, [], 0, { sameSign: false }).find((c) => c.id === 'crosscheck')?.mark).toBe('weakens');
    expect(challengeMarks(base, [], 0, { sameSign: true }).find((c) => c.id === 'crosscheck')?.mark).toBe('holds');
    expect(challengeMarks(base, [], 0, 'verdict').find((c) => c.id === 'crosscheck')?.mark).toBe('note');
  });
});

describe('doubt sentences', () => {
  const schema = readJson<{ $defs?: Record<string, { enum?: string[] }>; definitions?: Record<string, { enum?: string[] }> }>('schemas/common.schema.json');
  const doubts = (schema.$defs ?? schema.definitions ?? {}).doubt?.enum ?? [];
  const en = readJson<{ site: { challenge: Record<string, string> } }>('web/src/i18n/site.en.json');
  const bn = readJson<{ site: { challenge: Record<string, string> } }>('web/src/i18n/site.bn.json');
  it('reads the doubt ids from the schema', () => expect(doubts.length).toBeGreaterThan(0));
  for (const d of doubts) {
    it(d, () => {
      expect(en.site.challenge[`doubt_${d}`]).toBeTruthy();
      expect(bn.site.challenge[`doubt_${d}`]).toBeTruthy();
    });
  }
});

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Answer kinds: which records are registered, explored or unavailable is read from the files, never from ids,
// and the registered answer shown beside an exploration trend is the line-up's main-season test.
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kindsDisagree, recordKind, registeredMain } from '../../src/components/AnswerKind';
import type { ExploreIndex } from '../../src/data/explore';
import type { Catalog, Lineup, Prereg } from '../../src/data/types';
import { RESULTS, listFiles } from './helpers';

const read = <T,>(rel: string): T => JSON.parse(fs.readFileSync(path.join(RESULTS, rel), 'utf8')) as T;
const catalog = read<Catalog>('catalog.json');
const prereg = read<Prereg>('prereg.json');
const exploreFile = path.join(RESULTS, 'explore', 'index.json');
const explore = fs.existsSync(exploreFile) ? read<ExploreIndex>('explore/index.json') : undefined;
const graded = new Set(prereg.variables.filter((p) => p.role === 'analysed').map((p) => p.id));

describe('recordKind', () => {
  for (const v of catalog.variables) {
    it(v.id, () => {
      const k = recordKind(v, prereg, explore);
      if (graded.has(v.id)) expect(k).toBe('registered');
      else if (v.status === 'sensitivity' || v.status === 'reference') expect(k).toBeNull();
      else if (explore?.variables.some((x) => x.id === v.id)) expect(k).toBe('exploratory');
      else if (v.status === 'deferred') expect(k).toBe('unavailable');
      else expect(k).toBeNull();
    });
  }

  it('never calls a record registered without the pre-registration', () => {
    for (const v of catalog.variables) expect(recordKind(v, undefined, explore)).not.toBe('registered');
  });
});

describe('kindsDisagree', () => {
  it('flags a trend that stands out beside a registered "can\'t tell yet" or "no verdict"', () => {
    expect(kindsDisagree(true, { status: 'verdict', grade: 'cant_tell_yet' })).toBe(true);
    expect(kindsDisagree(true, { status: 'no_verdict', grade: null })).toBe(true);
  });
  it('flags a registered verdict beside a trend that does not stand out', () => {
    expect(kindsDisagree(false, { status: 'verdict', grade: 'supported' })).toBe(true);
    expect(kindsDisagree(false, { status: 'verdict', grade: 'strong' })).toBe(true);
  });
  it('is quiet when both agree', () => {
    expect(kindsDisagree(true, { status: 'verdict', grade: 'strong' })).toBe(false);
    expect(kindsDisagree(false, { status: 'verdict', grade: 'cant_tell_yet' })).toBe(false);
  });
});

describe('registeredMain', () => {
  const lineups = listFiles(path.join(RESULTS, 'lineups'), '.json');
  it('finds line-ups', () => expect(lineups.length).toBeGreaterThan(0));
  for (const f of lineups) {
    const l = JSON.parse(fs.readFileSync(f, 'utf8')) as Lineup;
    it(path.basename(f), () => {
      const main = registeredMain(l.items);
      for (const [variable, it] of Object.entries(main)) {
        expect(it.variable).toBe(variable);
        expect(it.family).toBe('confirmatory');
        expect(it.season).toBe(prereg.seasons.main);
      }
      expect(Object.values(main).every((it) => graded.has(it.variable))).toBe(true);
    });
  }
  it('is empty without a line-up', () => expect(registeredMain(undefined)).toEqual({}));
});

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// format.ts against the engine's own formatting cases (examples/golden/format_cases.json; docs/03_SCIENCE.md §12.3).
import { describe, expect, it } from 'vitest';
import { decimalsFor, digits, fixed, pExpr, signed, tick, toBangla } from '../../src/i18n/format';
import { readJson } from './helpers';

interface FormatCases {
  numbers: { x: number; decimals: number; fixed: string; signed: string; bn: string }[];
  pExpr: [number, string, string][];
}

const cases = readJson<FormatCases>('examples/golden/format_cases.json');

describe('number formatting matches the engine', () => {
  for (const c of cases.numbers) {
    it(`x = ${c.x}`, () => {
      expect(decimalsFor(c.x)).toBe(c.decimals);
      expect(fixed(c.x)).toBe(c.fixed);
      expect(signed(c.x)).toBe(c.signed);
      expect(digits(signed(c.x), 'bn')).toBe(c.bn);
    });
  }
  for (const [p, en, bn] of cases.pExpr) {
    it(`p = ${p}`, () => {
      expect(pExpr(p)).toBe(en);
      expect(toBangla(pExpr(p))).toBe(bn);
    });
  }
});

describe('Bangla digits', () => {
  it('keep the digits inside words with Latin letters', () => {
    expect(toBangla('MERRA-2 V07 rose by 1.3 °C over 1980–2025')).toBe('MERRA-2 V07 rose by ১.৩ °C over ১৯৮০–২০২৫');
  });
});

describe('axis ticks', () => {
  it('use the true minus sign and no trailing zeros', () => {
    expect(tick(-0.5, 'en')).toBe('−0.5');
    expect(tick(27, 'en')).toBe('27');
    expect(tick(-0, 'en')).toBe('0');
    expect(tick(1.25, 'bn')).toBe('১.২৫');
  });
});

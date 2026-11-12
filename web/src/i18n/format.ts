// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Number formatting for numbers the engine did not put into sentences (axis ticks, table cells),
// with the rules of docs/03_SCIENCE.md §12.3. The engine is the reference: tests/unit/format.test.ts
// checks every case of examples/golden/format_cases.json. Formatting changes how a number is written,
// never what it is.
import type { Lang } from '../data/types';

const MINUS = '−';
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Decimals for x: two significant figures, clamped to [0, 4]; 0 for zero or non-finite. */
export function decimalsFor(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return 0;
  const d = 2 - 1 - Math.floor(Math.log10(Math.abs(x)));
  return Math.min(4, Math.max(0, d));
}

/**
 * Fixed notation with ties rounded away from zero on the exact binary value.
 * Number.prototype.toFixed works on the exact value and, for a tie, picks the larger magnitude
 * (ECMA-262 §21.1.3.3), which is ROUND_HALF_UP on |x|. Negative zero becomes "0"; "-" becomes "−".
 */
export function fixed(x: number, d: number = decimalsFor(x)): string {
  if (!Number.isFinite(x)) return '–';
  const neg = x < 0;
  const body = Math.abs(x).toFixed(d);
  const isZero = /^0(\.0+)?$/.test(body);
  return neg && !isZero ? MINUS + body : body;
}

/** Signed: "+" when the fixed string is not zero and not negative. */
export function signed(x: number, d: number = decimalsFor(x)): string {
  const f = fixed(x, d);
  if (f === '–') return f;
  const isZero = /^0(\.0+)?$/.test(f);
  return f.startsWith(MINUS) || isZero ? f : '+' + f;
}

/** p-values: "< 0.001", 3 decimals below 0.1, otherwise 2 decimals. */
export function pValue(p: number): string {
  if (!Number.isFinite(p)) return '–';
  if (p < 0.001) return '< 0.001';
  if (p < 0.1) return p.toFixed(3);
  return p.toFixed(2);
}

/** "p < 0.001" or "p = 0.034", as the engine writes it in sentences. */
export function pExpr(p: number): string {
  const v = pValue(p);
  return v.startsWith('<') ? `p ${v}` : `p = ${v}`;
}

/**
 * Bangla digits: map 0–9 to ০–৯, except inside words that contain Latin letters, so names such as
 * "MERRA-2" and "V07" keep their digits (docs/03_SCIENCE.md §12.3).
 */
export function toBangla(s: string): string {
  return s.replace(/[^\s]+/g, (word) => (/[A-Za-z]/.test(word) ? word : word.replace(/[0-9]/g, (c) => BN_DIGITS[Number(c)] ?? c)));
}

/** Applies the language's digits to an already formatted string. */
export function digits(s: string, lang: Lang): string {
  return lang === 'bn' ? toBangla(s) : s;
}

/** A plain integer such as a year or a count, in the language's digits. */
export function int(n: number, lang: Lang): string {
  return digits(String(Math.trunc(n)), lang);
}

/** A rate or value with the decimals chosen for `ref` (so a range shares the rate's decimals). */
export function rate(x: number | null | undefined, lang: Lang, ref?: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  const d = decimalsFor(ref !== null && ref !== undefined && Number.isFinite(ref) ? ref : x);
  return digits(signed(x, d), lang);
}

/** An unsigned number with fixed decimals (table cells such as percentages or φ). */
export function num(x: number | null | undefined, lang: Lang, d?: number): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  return digits(fixed(x, d ?? decimalsFor(x)), lang);
}

/** p-value in the language's digits. */
export function p(x: number | null | undefined, lang: Lang): string {
  if (x === null || x === undefined) return '–';
  return digits(pValue(x), lang);
}

/** A value with its units, "+0.29 °C". */
export function withUnits(s: string, units: string | null | undefined): string {
  return units ? `${s} ${units}` : s;
}

/** A tick formatter for chart axes: values formatted with a shared number of decimals. */
export function tickFormatter(lang: Lang, step: number): (v: number) => string {
  const d = step > 0 && Number.isFinite(step) ? Math.min(4, Math.max(0, -Math.floor(Math.log10(step)))) : 0;
  return (v: number) => digits(fixed(v, d), lang);
}

/** An axis tick (a "nice" number chosen by the scale): the shortest exact form, with the true minus sign. */
export function tick(v: number, lang: Lang): string {
  if (!Number.isFinite(v)) return '';
  const s = v.toFixed(4).replace(/\.?0+$/, '');
  const out = s === '-0' ? '0' : s.replace('-', MINUS);
  return digits(out, lang);
}

/** A year axis tick: a plain integer. */
export function yearTick(lang: Lang): (v: number) => string {
  return (v: number) => int(v, lang);
}

/** A short hash for display, with the full value kept for copying. */
export function shortHash(h: string | null | undefined, n = 12): string {
  if (!h) return '–';
  return h.length > n ? `${h.slice(0, n)}…` : h;
}

/** Bytes as KB or MB (layout text only). */
export function bytes(n: number, lang: Lang): string {
  if (n >= 1_000_000) return digits(`${(n / 1_000_000).toFixed(1)} MB`, lang);
  if (n >= 1000) return digits(`${Math.round(n / 1000)} KB`, lang);
  return digits(`${n} B`, lang);
}

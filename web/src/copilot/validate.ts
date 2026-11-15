// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Checks a copilot answer before it reaches the screen. A schema-valid answer is not a factual one, so: every number
// in it must appear in what the tools returned (or in the user's own question), and none of the wording barred by
// docs/03_SCIENCE.md §12.1 may appear. An answer that fails is replaced by a verified template built from the files.

/** The same barred wording as the site's own string test (tests/unit/strings.test.ts, X-07). A negated mention of
 * an independent confirmation ("not an independent confirmation") is the site's own careful wording and is allowed. */
const BARRED: RegExp[] = [/caused by/i, /due to/i, /driven by/i, /\bbecause\b/i, /\bproves?\b/i, /\bdefinitely\b/i, /\bconfirms\b/i, /\bno trend\b/i, /(?<!not an? )independent confirmation/i, /95% chance/i];
const BARRED_BN: RegExp[] = [/কারণে/, /প্রমাণ করে/, /নিশ্চিতভাবে/];

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla digits and the typographic minus to ASCII, thousands separators removed. */
export function normaliseDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).replace(/−/g, '-').replace(/(\d),(?=\d{3}\b)/g, '$1');
}

/** Every number written in a text, as written (sign dropped: a sign is judged with its words, not here). */
export function numbersIn(text: string): string[] {
  return [...normaliseDigits(text).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

/** All numbers inside tool results, at full precision. */
export function numbersInEvidence(evidence: unknown): number[] {
  const out: number[] = [];
  const walk = (x: unknown) => {
    if (typeof x === 'number' && Number.isFinite(x)) out.push(Math.abs(x));
    else if (typeof x === 'string') for (const n of numbersIn(x)) out.push(Number(n));
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(evidence);
  return out;
}

/** A written number is supported when some evidence value rounds to it at the precision it was written with. */
function supported(written: string, evidence: number[]): boolean {
  const n = Number(written);
  const decimals = written.includes('.') ? written.split('.')[1]!.length : 0;
  const tol = 0.5 * 10 ** -decimals + 1e-9;
  return evidence.some((m) => Math.abs(m - n) <= tol);
}

export interface Check {
  ok: boolean;
  unsupportedNumbers: string[];
  barred: string[];
}

/** Small counts ("one of 12 tests", "two places", "5 windows") and the 95% of a range need no evidence. */
const FREE = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '95']);

export function checkAnswer(answer: string, evidence: unknown[], question: string): Check {
  const pool = [...numbersInEvidence(evidence), ...numbersIn(question).map(Number)];
  const unsupportedNumbers = numbersIn(answer).filter((n) => !FREE.has(n) && !supported(n, pool));
  const barred = [...BARRED, ...BARRED_BN].filter((re) => re.test(answer)).map((re) => re.source);
  return { ok: unsupportedNumbers.length === 0 && barred.length === 0, unsupportedNumbers, barred };
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The evidence layer: what kind of claim a result supports, and what qualifies it ("challenge this conclusion").
// Pure functions over result files the engine wrote. Nothing here computes a statistic (AGENTS.md rule 4): every
// number is copied from a file, every finding names the file and field it comes from, and the wording lives in
// the string files (site.copilot.*). The same findings feed the challenge panel and the copilot's tools.
import type { Contrast, Family, Robustness, Verdict } from '../data/types';
import type { ExploreTrendItem } from '../data/explore';

/** How strong a claim the evidence allows. Decided from the file's own family and status, never from one flag. */
export type EvidenceClass = 'preregistered' | 'exploratory' | 'descriptive' | 'unavailable';

export function classOfFamily(family: Family): EvidenceClass {
  if (family === 'confirmatory' || family === 'secondary') return 'preregistered';
  return 'exploratory';                      // exploration and the IMERG sensitivity check: never graded
}

export type Severity = 'support' | 'qualify' | 'note';

export type FindingId =
  | 'test_supported'
  | 'test_cant_tell'
  | 'no_verdict'
  | 'sensitivity_role'
  | 'windows_agree'
  | 'windows_disagree'
  | 'loo_flip'
  | 'loo_ok'
  | 'jump_unreviewed'
  | 'jump_reviewed'
  | 'break_documented'
  | 'gaps'
  | 'coverage_doubt'
  | 'practical'
  | 'exploration_differs'
  | 'other_dataset'
  | 'contrast_labels'
  | 'contrast_split';

export type Value = string | number | boolean | null;

export interface Finding {
  id: FindingId;
  severity: Severity;
  /** Raw values from the file, formatted by the screen (never pre-rounded here). */
  params: Record<string, Value>;
  /** Where each value comes from: "<result path>#<field>". */
  source: string;
}

type Result = Verdict | Contrast;

function isContrast(r: Result): r is Contrast {
  return 'pair' in r;
}

/** The test that decides the claim: the adjusted p-value of the result's own family. */
function testFinding(r: Result, path: string): Finding {
  const src = `${path}#multiplicity`;
  if (r.status !== 'verdict') {
    return { id: 'no_verdict', severity: 'qualify', params: { reason: r.reason ?? null }, source: `${path}#reason` };
  }
  if (r.family === 'sensitivity') {
    return { id: 'sensitivity_role', severity: 'note', params: {}, source: `${path}#family` };
  }
  const params = {
    pAdjusted: r.multiplicity.pAdjusted,
    alpha: r.multiplicity.alpha,
    familySize: r.multiplicity.familySize,
    method: r.multiplicity.method,
    family: r.family,
    grade: r.grade,
  };
  if (r.grade === 'cant_tell_yet') return { id: 'test_cant_tell', severity: 'qualify', params, source: src };
  return { id: 'test_supported', severity: 'support', params, source: src };
}

function robustnessFindings(rob: Robustness, path: string): Finding[] {
  const out: Finding[] = [];
  if (rob.gaps.missingYears.length > 0) {
    out.push({ id: 'gaps', severity: 'qualify', params: { years: rob.gaps.missingYears.join(', ') }, source: `${path}#robustness.gaps` });
  }
  if (rob.coverage.status === 'doubt') {
    out.push({ id: 'coverage_doubt', severity: 'qualify', params: { p: rob.coverage.p }, source: `${path}#robustness.coverage` });
  }
  const w = rob.windows;
  if (w && w.ran > 0) {
    const id = w.agree === w.ran ? 'windows_agree' : 'windows_disagree';
    out.push({ id, severity: id === 'windows_agree' ? 'support' : 'qualify', params: { agree: w.agree, ran: w.ran }, source: `${path}#robustness.windows` });
  }
  if (rob.loo) {
    if (rob.loo.status === 'doubt') {
      out.push({ id: 'loo_flip', severity: 'qualify', params: { year: rob.loo.year, pMin: rob.loo.pMin, pMax: rob.loo.pMax }, source: `${path}#robustness.loo` });
    } else if (rob.loo.status === 'pass') {
      out.push({ id: 'loo_ok', severity: 'support', params: {}, source: `${path}#robustness.loo` });
    }
  }
  for (const b of rob.breaks) {
    out.push({
      id: 'break_documented',
      severity: b.review?.outcome === 'no_step_seen' ? 'note' : 'qualify',
      params: { breakId: b.id, year: b.year, review: b.review?.outcome ?? 'unreviewed' },
      source: `${path}#robustness.breaks`,
    });
  }
  const pt = rob.pettitt;
  if (pt?.flagged && pt.year !== null) {
    // A statistical jump is a flag, not a cause. It counts as reviewed only when a documented data change near that
    // year carries a person's review (config/break_review.yaml); otherwise the screen says it is unreviewed.
    const reviewed = rob.breaks.find((b) => b.review && b.year !== null && Math.abs(b.year - (pt.year as number)) <= 2);
    out.push({
      id: reviewed ? 'jump_reviewed' : 'jump_unreviewed',
      severity: reviewed ? 'note' : 'qualify',
      params: { year: pt.year, documentedBreaks: rob.breaks.length, review: reviewed?.review?.outcome ?? null },
      source: `${path}#robustness.pettitt`,
    });
  }
  return out;
}

/** The exploration screen and the registered test answer different questions with different corrections. When
 * they disagree in direction of confidence, say so instead of letting one silently overrule the other. */
export function explorationFinding(r: Result, path: string, item: ExploreTrendItem | undefined, trendsPath: string): Finding | null {
  if (!item || isContrast(r) || r.family === 'sensitivity' || r.status !== 'verdict') return null;
  const confirmed = r.grade === 'strong' || r.grade === 'supported';
  if (item.standsOut === confirmed) return null;
  return {
    id: 'exploration_differs',
    severity: 'note',
    params: {
      standsOut: item.standsOut ?? null,
      q: item.q ?? null,
      pAdjusted: r.multiplicity.pAdjusted,
      familySize: r.multiplicity.familySize,
      grade: r.grade,
    },
    source: `${trendsPath}#items[${item.id}] vs ${path}#multiplicity`,
  };
}

/** A second record of the same quantity (IMERG beside MERRA-2 rain). Its window can differ from the main one: then it
 * is not a matched comparison, and the finding says so with both windows. */
export function otherDatasetFinding(r: Verdict, path: string, other: Verdict | undefined, otherPath: string): Finding | null {
  if (!other) return null;
  const matched = other.window.first === r.window.first && other.window.last === r.window.last;
  return {
    id: 'other_dataset',
    severity: 'note',
    params: {
      variable: other.variable.id,
      first: other.window.first,
      last: other.window.last,
      mainFirst: r.window.first,
      mainLast: r.window.last,
      matched,
      rate: other.spine.ratePerDecade,
      low: other.spine.rateLowPerDecade,
      high: other.spine.rateHighPerDecade,
      status: other.status,
      reason: other.reason ?? null,
    },
    source: `${otherPath}#spine vs ${path}#window`,
  };
}

/** Every finding that supports or qualifies one result, in the order a careful reader would check them. */
export function challenge(r: Result, path: string): Finding[] {
  const out: Finding[] = [testFinding(r, path), ...robustnessFindings(r.robustness, path)];
  if (r.practical?.position) {
    out.push({ id: 'practical', severity: r.practical.position === 'exceeds' ? 'support' : 'note', params: { position: r.practical.position, threshold: r.practical.threshold, units: r.practical.units }, source: `${path}#practical` });
  }
  if (isContrast(r)) {
    out.push({ id: 'contrast_labels', severity: 'note', params: { ...r.labels }, source: `${path}#labels` });
    if (r.split) out.push({ id: 'contrast_split', severity: r.split.passes ? 'note' : 'qualify', params: { passes: r.split.passes }, source: `${path}#split` });
  }
  return out;
}

export interface WindowPoint {
  id: string;
  first: number;
  last: number;
  rate: number;
  low: number | null;
  high: number | null;
  main: boolean;
}

/** The main window and each alternative window that ran, as the engine wrote them (for the window chart). */
export function windowPoints(r: Result): WindowPoint[] {
  const out: WindowPoint[] = [];
  if (r.spine.ratePerDecade !== null) {
    out.push({ id: 'main', first: r.window.first, last: r.window.last, rate: r.spine.ratePerDecade, low: r.spine.rateLowPerDecade, high: r.spine.rateHighPerDecade, main: true });
  }
  for (const w of r.robustness.windows?.items ?? []) {
    if (w.ran && w.ratePerDecade !== null) {
      out.push({ id: w.id, first: w.first, last: w.last, rate: w.ratePerDecade, low: w.rateLowPerDecade, high: w.rateHighPerDecade, main: false });
    }
  }
  return out;
}

export type NextAction = 'open_seasons' | 'open_other_dataset' | 'open_monthly' | 'open_methods' | 'open_contrast_sides';

/** What to look at next, chosen from what the findings leave open (no search for significance). */
export function nextActions(findings: Finding[], r: Result): NextAction[] {
  const ids = new Set(findings.map((f) => f.id));
  const out: NextAction[] = [];
  if (!isContrast(r) && r.season === 'ANN' && (ids.has('test_cant_tell') || ids.has('windows_disagree'))) out.push('open_seasons');
  if (ids.has('other_dataset')) out.push('open_other_dataset');
  if (ids.has('jump_unreviewed') || ids.has('break_documented') || ids.has('loo_flip')) out.push('open_monthly');
  if (ids.has('exploration_differs') || ids.has('no_verdict')) out.push('open_methods');
  if (isContrast(r)) out.push('open_contrast_sides');
  return out;
}

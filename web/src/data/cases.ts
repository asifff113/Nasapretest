// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Watch cases. The build's case list is offline/set.json (every case the build kept on the device);
// each case file names the result it plays.
import { paths } from './results';
import { useResult, useResults } from './hooks';
import type { CaseFile, OfflineSet, Prereg } from './types';

export function caseResultPath(c: CaseFile): string | null {
  const u = c.uses;
  if (u.kind === 'contrast' && u.variable && u.pair && u.season) return paths.contrast(u.variable, u.pair, u.season);
  if (u.kind === 'verdict' && u.variable && u.region && u.season) return paths.verdict(u.variable, u.region, u.season);
  if (u.kind === 'lineup' && u.region) return paths.lineup(u.region);
  return null;
}

export function useOfflineSet() {
  return useResult<OfflineSet>('offline/set.json');
}

/** All case files of the build, in the order of the offline set. */
export function useCases() {
  const set = useOfflineSet();
  const list = set.data ? set.data.cases.map((c) => paths.caseFile(c.id)) : null;
  const cases = useResults<CaseFile>(list);
  return { set, cases };
}

/** The lead case: the one that plays the first headline case of the pre-registration (or the first case). */
export function pickLeadCase(cases: CaseFile[], prereg: Prereg | undefined): CaseFile | undefined {
  const h = prereg?.headline_cases[0];
  if (h) {
    const hit = cases.find((c) => c.uses.kind === h.kind && c.uses.variable === h.variable && c.uses.season === h.season && (h.pair ? c.uses.pair === h.pair : true));
    if (hit) return hit;
  }
  return cases.find((c) => c.uses.kind === 'contrast') ?? cases[0];
}

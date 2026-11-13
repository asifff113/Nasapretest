// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The current claim shown by the confidence spine (docs/04_UI.md §5, S5). A result screen sets it while it is
// on screen; the shell draws the spine under the header (desktop) or above the bottom bar (phone).
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Spine } from '../data/types';

export interface SpineClaim {
  spine: Spine;
  /** A short label for what the claim is about ("Rain · North Plain · Whole year"). */
  about: string;
  /** The element id of the full result, for a jump button (not a hash link: the hash holds the view). */
  anchor?: string;
}

export const useSpineStore = create<{ claim: SpineClaim | null; set: (c: SpineClaim | null) => void }>((set) => ({
  claim: null,
  set: (claim) => set({ claim }),
}));

/** Shows `claim` on the spine while the calling component is mounted. */
export function useSpineClaim(claim: SpineClaim | null): void {
  const set = useSpineStore((s) => s.set);
  const key = claim ? `${claim.about}|${claim.spine.status}|${claim.spine.grade}|${claim.spine.ratePerDecade}` : '';
  useEffect(() => {
    set(claim);
    return () => set(null);
    // the key identifies the claim
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { IS_OFFLINE_BUILD } from '../data/offline';

/** True where the copilot can exist: the dev server (which serves the relay) and builds made with VITE_COPILOT=1
 * (the Vercel build, tools/vercel_build.sh). GitHub Pages and the offline file have no relay, so they show no
 * copilot and make no request for it. */
export const COPILOT_HOSTED = !IS_OFFLINE_BUILD && (import.meta.env.DEV || import.meta.env.VITE_COPILOT === '1');

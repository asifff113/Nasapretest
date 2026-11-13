// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
/// <reference types="vite/client" />

declare const __OFFLINE__: boolean;

interface ImportMetaEnv {
  /** Where the results live, relative to the page. Default "./results" (docs/01_ARCHITECTURE.md §6.3). */
  readonly RESULTS_BASE?: string;
  readonly VITE_RESULTS_BASE?: string;
}

declare module 'virtual:offline-data' {
  const data: { current: unknown; json: Record<string, unknown>; binary: Record<string, string> } | null;
  export default data;
}

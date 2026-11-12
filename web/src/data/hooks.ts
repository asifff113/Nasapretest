// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// React hooks over the reader. Each panel loads only the files it needs and shows its own state:
// loading, not in this build, unreachable, or an error with an id.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { BadFileError, loadCurrent, loadJson, MissingFileError, UnreachableError, type CurrentBuild } from './results';
import type { Catalog, Prereg, RegionIndex } from './types';

export type LoadStatus = 'loading' | 'ok' | 'missing' | 'unreachable' | 'error';

export interface Loaded<T> {
  status: LoadStatus;
  data: T | undefined;
  error: Error | undefined;
  /** A short id for bug reports when status is "error". */
  errorId?: string;
}

interface SessionState {
  /** A loaded file carried "synthetic": true. The banner cannot be dismissed while this is true. */
  synthetic: boolean;
  /** The results host could not be reached. */
  unreachable: boolean;
  /** A view needed a file that is not on this device (offline file only). */
  offlineMiss: boolean;
  markSynthetic: () => void;
  markUnreachable: () => void;
  markOfflineMiss: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  synthetic: false,
  unreachable: false,
  offlineMiss: false,
  markSynthetic: () => {
    if (!get().synthetic) set({ synthetic: true });
  },
  markUnreachable: () => {
    if (!get().unreachable) set({ unreachable: true });
  },
  markOfflineMiss: () => {
    if (!get().offlineMiss) set({ offlineMiss: true });
  },
}));

function errorId(err: Error): string {
  let h = 0;
  const s = `${err.name}:${err.message}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `CFE-${h.toString(36).toUpperCase().padStart(6, '0').slice(0, 6)}`;
}

export function classify<T>(err: unknown): Loaded<T> {
  const e = err instanceof Error ? err : new Error(String(err));
  if (e instanceof MissingFileError) {
    if (__OFFLINE__) useSession.getState().markOfflineMiss();
    return { status: 'missing', data: undefined, error: e };
  }
  if (e instanceof UnreachableError) {
    useSession.getState().markUnreachable();
    return { status: 'unreachable', data: undefined, error: e };
  }
  if (e instanceof BadFileError) return { status: 'error', data: undefined, error: e, errorId: errorId(e) };
  return { status: 'error', data: undefined, error: e, errorId: errorId(e) };
}

function noteSynthetic(data: unknown): void {
  if (data && typeof data === 'object' && (data as { synthetic?: unknown }).synthetic === true) {
    useSession.getState().markSynthetic();
  }
}

/** Runs an async loader keyed by `key`; null key = nothing to load yet. */
export function useAsync<T>(key: string | null, load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ key: string | null; value: Loaded<T> }>({
    key: null,
    value: { status: 'loading', data: undefined, error: undefined },
  });
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    load().then(
      (data) => {
        noteSynthetic(data);
        if (alive) setState({ key, value: { status: 'ok', data, error: undefined } });
      },
      (err: unknown) => {
        if (alive) setState({ key, value: classify<T>(err) });
      },
    );
    return () => {
      alive = false;
    };
    // `load` is recreated each render; the key names what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === null || state.key !== key) return { status: 'loading', data: undefined, error: undefined };
  return state.value;
}

export function useBuild(): Loaded<CurrentBuild> {
  return useAsync('current', () => loadCurrent());
}

/** Loads one JSON file of the current build. `path` null = wait. */
export function useResult<T>(path: string | null): Loaded<T> {
  const build = useBuild();
  const root = build.data?.root;
  const key = path !== null && build.status === 'ok' ? `${root}|${path}` : null;
  const res = useAsync<T>(key, () => loadJson<T>(root ?? '', path ?? ''));
  if (build.status !== 'ok' && build.status !== 'loading') return { ...build, data: undefined } as Loaded<T>;
  return res;
}

export const useCatalog = () => useResult<Catalog>('catalog.json');
export const useRegionIndex = () => useResult<RegionIndex>('regions/index.json');
export const usePrereg = () => useResult<Prereg>('prereg.json');

/** Several files at once; ok only when every file loaded. */
export function useResults<T>(paths: string[] | null): Loaded<T[]> & { done: number; total: number } {
  const build = useBuild();
  const root = build.data?.root ?? '';
  const key = paths && build.status === 'ok' ? `${root}|${paths.join(',')}` : null;
  const [done, setDone] = useState(0);
  const res = useAsync<T[]>(key, () => {
    setDone(0);
    return Promise.all(
      (paths ?? []).map((p) =>
        loadJson<T>(root, p).then((d) => {
          noteSynthetic(d);
          setDone((n) => n + 1);
          return d;
        }),
      ),
    );
  });
  return { ...res, done, total: paths?.length ?? 0 };
}

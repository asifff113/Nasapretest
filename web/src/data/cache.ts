// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// A small in-memory cache of file promises, so a file is fetched at most once per session.

const store = new Map<string, Promise<unknown>>();
const MAX = 400;

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;
  const p = load().catch((err: unknown) => {
    store.delete(key); // a failed load may be retried later
    throw err;
  });
  store.set(key, p);
  if (store.size > MAX) {
    const first = store.keys().next().value;
    if (first !== undefined) store.delete(first);
  }
  return p;
}

/** Whether a key has been loaded (or is loading) already. */
export function isCached(key: string): boolean {
  return store.has(key);
}

export function clearCache(): void {
  store.clear();
}

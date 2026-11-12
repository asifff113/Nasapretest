// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// In the offline build, the files of offline/set.json are inlined here and served to the same reader
// calls as the online site (docs/01_ARCHITECTURE.md §6.3). In the online build this module holds nothing.
import data from 'virtual:offline-data';
import type { Current } from './types';

export const IS_OFFLINE_BUILD: boolean = __OFFLINE__;

export function offlineCurrent(): Current | null {
  return data ? (data.current as Current) : null;
}

/** The parsed JSON for a path relative to the build root, or undefined when the file is not on the device. */
export function offlineJson(path: string): unknown {
  return data ? data.json[path] : undefined;
}

/** The raw bytes for a binary file, or undefined when the file is not on the device. */
export function offlineBinary(path: string): Uint8Array | undefined {
  const b64 = data?.binary[path];
  if (b64 === undefined) return undefined;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Every path kept on this device. */
export function offlinePaths(): string[] {
  return data ? [...Object.keys(data.json), ...Object.keys(data.binary)].sort() : [];
}

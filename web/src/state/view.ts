// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// View state ⇄ URL hash (docs/01_ARCHITECTURE.md §6.3; schemas/view.schema.json). Every view can be shared.
// This module checks the syntax of the hash only; whether an id exists in this build is checked by the
// screen against the result files (unknown ids fall back to defaults with a notice).
import { create } from 'zustand';

export type Screen = 'home' | 'question' | 'place' | 'compare' | 'map' | 'methods' | 'watch' | 'offline' | 'data' | 'ai' | 'about';

export const SCREENS: readonly Screen[] = ['home', 'question', 'place', 'compare', 'map', 'methods', 'watch', 'offline', 'data', 'ai', 'about'];

export interface View {
  screen: Screen;
  region?: string;
  pair?: string;
  variable?: string;
  season?: string;
  sensitivity?: 'imerg';
  case?: string;
  question?: string;
}

const REGION_RE = /^(country:[A-Z]{3}|bd_div:[a-z_]+|cmp:[a-z0-9_]+|cell:[0-9]{1,3}_[0-9]{1,3}|synthetic:[a-z0-9_]+)$/;
const ID_RE = /^[a-z][a-z0-9_]*$/;
const SEASONS = ['ANN', 'DJF', 'MAM', 'JJAS', 'ON', 'JJA', 'SON'];
const SLUG_RE = /^[A-Za-z0-9_-]+$/;

export interface ParsedView {
  view: View;
  /** True when the hash held a value that failed its syntax check (it was dropped). */
  bad: boolean;
}

export function parseHash(hash: string): ParsedView {
  const raw = hash.replace(/^#/, '');
  const [pathPart = '', query = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  let bad = false;
  const first = segs[0] ?? 'home';
  const screen = (SCREENS as readonly string[]).includes(first) ? (first as Screen) : 'home';
  if (segs.length > 0 && screen === 'home' && first !== 'home') bad = true;
  const view: View = { screen };
  const params = new URLSearchParams(query);

  const take = (key: keyof View, ok: (v: string) => boolean) => {
    const v = params.get(key);
    if (v === null || v === '') return;
    if (ok(v)) (view as unknown as Record<string, string>)[key] = v;
    else bad = true;
  };
  take('region', (v) => REGION_RE.test(v));
  take('pair', (v) => SLUG_RE.test(v));
  take('variable', (v) => ID_RE.test(v));
  take('season', (v) => SEASONS.includes(v));
  take('question', (v) => SLUG_RE.test(v));
  const sens = params.get('sensitivity');
  if (sens === 'imerg') view.sensitivity = 'imerg';
  else if (sens) bad = true;
  if (screen === 'watch' && segs[1]) {
    if (SLUG_RE.test(segs[1])) view.case = segs[1];
    else bad = true;
  }
  // Unknown parameters are ignored (docs/01_ARCHITECTURE.md §6.3).
  return { view, bad };
}

export function toHash(view: View): string {
  if (view.screen === 'home') return '#/';
  if (view.screen === 'watch') return view.case ? `#/watch/${view.case}` : '#/watch';
  const params = new URLSearchParams();
  const order: (keyof View)[] = ['question', 'region', 'pair', 'variable', 'season', 'sensitivity'];
  for (const k of order) {
    const v = view[k];
    if (typeof v === 'string' && v) params.set(k, v);
  }
  const q = params.toString().replace(/%3A/gi, ':');
  return `#/${view.screen}${q ? `?${q}` : ''}`;
}

interface ViewState {
  view: View;
  /** Set when the current link was incomplete or invalid; screens add their own data checks. */
  badLink: boolean;
  navigate: (view: View, opts?: { replace?: boolean }) => void;
  /** Update some parameters of the current view. */
  patch: (patch: Partial<View>, opts?: { replace?: boolean }) => void;
  flagBadLink: () => void;
}

function initial(): ParsedView {
  if (typeof window === 'undefined') return { view: { screen: 'home' }, bad: false };
  return parseHash(window.location.hash);
}

export const useView = create<ViewState>((set, get) => {
  const first = initial();
  return {
    view: first.view,
    badLink: first.bad,
    navigate: (view, opts) => {
      const hash = toHash(view);
      if (typeof window !== 'undefined' && window.location.hash !== hash) {
        if (opts?.replace) window.history.replaceState(null, '', hash);
        else window.history.pushState(null, '', hash);
      }
      const changedScreen = get().view.screen !== view.screen;
      set({ view, badLink: changedScreen ? false : get().badLink });
    },
    patch: (patch, opts) => {
      const next = { ...get().view, ...patch } as View;
      for (const k of Object.keys(next) as (keyof View)[]) if (next[k] === undefined) delete next[k];
      get().navigate(next, opts);
    },
    flagBadLink: () => set({ badLink: true }),
  };
});

/** Keeps the store in step with Back, Forward and pasted links. */
export function startHashSync(): () => void {
  const onChange = () => {
    const parsed = parseHash(window.location.hash);
    useView.setState({ view: parsed.view, badLink: parsed.bad });
  };
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function href(view: View): string {
  return toHash(view);
}

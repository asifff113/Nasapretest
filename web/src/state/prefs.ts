// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Language and theme. Both live in localStorage (inside try/catch) and never in the URL, so a shared link
// works in either language (docs/04_UI.md §2). A link may carry ?lang=bn once, to open in Bangla.
import { create } from 'zustand';
import type { Lang } from '../data/types';

export type Theme = 'light' | 'dark' | 'system';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
}

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const fromLink = new URLSearchParams(window.location.search).get('lang');
  if (fromLink === 'bn' || fromLink === 'en') return fromLink;
  return read('cfe.lang') === 'bn' ? 'bn' : 'en';
}

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const t = read('cfe.theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', Boolean(dark));
}

export function applyLang(lang: Lang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}

interface PrefsState {
  lang: Lang;
  theme: Theme;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
}

export const usePrefs = create<PrefsState>((set) => ({
  lang: initialLang(),
  theme: initialTheme(),
  setLang: (lang) => {
    write('cfe.lang', lang);
    applyLang(lang);
    set({ lang });
  },
  setTheme: (theme) => {
    write('cfe.theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));

export function useLang(): Lang {
  return usePrefs((s) => s.lang);
}

// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// t(key, params): every user-visible string comes from the string files, in English and Bangla.
// config/i18n holds the engine's sentences and the shared strings (read-only); src/i18n/site.*.json holds
// the strings the site adds. scripts/compile-strings.mjs merges them and fails on a missing key.
import { useCallback } from 'react';
import strings from '../generated/strings.json';
import type { Lang, LangText } from '../data/types';
import { useLang } from '../state/prefs';
import { digits } from './format';

type Table = Record<string, string>;
const TABLES = strings as unknown as Record<Lang, Table>;

export type Params = Record<string, string | number>;

function fill(template: string, params: Params | undefined, lang: Lang): string {
  if (!params) return template;
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    return typeof v === 'number' ? digits(String(v), lang) : v;
  });
}

/** Looks a key up. A missing key shows ⟦key⟧ in development and English in production. */
export function translate(lang: Lang, key: string, params?: Params): string {
  const hit = TABLES[lang][key];
  if (typeof hit === 'string') return fill(hit, params, lang);
  if (import.meta.env.DEV) return `⟦${key}⟧`;
  const en = TABLES.en[key];
  return typeof en === 'string' ? fill(en, params, 'en') : key;
}

export function hasKey(key: string): boolean {
  return typeof TABLES.en[key] === 'string';
}

export type T = (key: string, params?: Params) => string;

export function useT(): T {
  const lang = useLang();
  return useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);
}

/** Picks a language's text from a result file's {en, bn} pair. */
export function pick(text: LangText | null | undefined, lang: Lang): string {
  if (!text) return '';
  return text[lang] ?? text.en ?? '';
}

/**
 * For keys built from data (a grid id, a flag name, a reason): the string when the files define one,
 * otherwise the id itself, so a new id from a new build still reads sensibly.
 */
export function tOr(t: T, key: string, fallback: string, params?: Params): string {
  return hasKey(key) ? t(key, params) : fallback;
}

export function allKeys(lang: Lang): string[] {
  return Object.keys(TABLES[lang]);
}

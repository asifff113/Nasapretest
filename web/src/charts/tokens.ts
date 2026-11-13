// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Reads the colour tokens as plain colours for charts and the map canvas, and follows theme changes.
import { useEffect, useState, type RefObject } from 'react';
import { usePrefs } from '../state/prefs';

export interface Tokens {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  link: string;
  line: string;
  lineStrong: string;
  strong: string;
  supported: string;
  canttell: string;
  noverdict: string;
  exploration: string;
  dark: boolean;
}

const NAMES: Record<keyof Omit<Tokens, 'dark'>, string> = {
  bg: '--bg',
  surface: '--surface',
  ink: '--ink',
  muted: '--muted',
  accent: '--accent',
  link: '--link',
  line: '--line',
  lineStrong: '--line-strong',
  strong: '--grade-strong',
  supported: '--grade-supported',
  canttell: '--grade-cant-tell',
  noverdict: '--no-verdict',
  exploration: '--exploration',
};

export function readTokens(scope?: HTMLElement | null): Tokens {
  const el = scope ?? document.documentElement;
  const cs = getComputedStyle(el);
  const out = { dark: Boolean(el.closest('.dark')) && !el.closest('.paper') } as Tokens;
  for (const [k, v] of Object.entries(NAMES)) (out as unknown as Record<string, string>)[k] = cs.getPropertyValue(v).trim() || '#888';
  return out;
}

/** Colours as they apply where the chart sits (a chart on the ivory answer sheet takes the sheet's colours). */
export function useTokens(scope?: RefObject<HTMLElement | null>): Tokens {
  const theme = usePrefs((s) => s.theme);
  const [tokens, setTokens] = useState<Tokens>(() => readTokens());
  useEffect(() => {
    const update = () => setTokens(readTokens(scope?.current));
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [theme, scope]);
  return tokens;
}

/** The status colour of a tone. */
export function toneColour(tokens: Tokens, tone: string): string {
  switch (tone) {
    case 'strong':
      return tokens.strong;
    case 'supported':
      return tokens.supported;
    case 'canttell':
      return tokens.canttell;
    case 'noverdict':
      return tokens.noverdict;
    default:
      return tokens.exploration;
  }
}

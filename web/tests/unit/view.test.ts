// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// W-11 at unit level: every view round-trips through the URL hash; bad values are dropped and flagged.
import { describe, expect, it } from 'vitest';
import { parseHash, toHash, type View } from '../../src/state/view';

describe('view ⇄ hash', () => {
  const views: View[] = [
    { screen: 'home' },
    { screen: 'question', question: 'rain_changing' },
    { screen: 'place', region: 'country:BGD', variable: 'rain', season: 'JJAS' },
    { screen: 'place', region: 'cell:66_270', variable: 'air_temp', season: 'ANN' },
    { screen: 'compare', pair: 'pair_bgd_vs_wb', variable: 'rain', season: 'ANN', sensitivity: 'imerg' },
    { screen: 'map', variable: 'air_temp', season: 'ANN' },
    { screen: 'watch', case: 'lead_contrast_rain' },
    { screen: 'methods' },
    { screen: 'offline' },
    { screen: 'data' },
    { screen: 'ai' },
    { screen: 'about' },
  ];
  for (const v of views) {
    it(`round-trips ${toHash(v)}`, () => {
      const parsed = parseHash(toHash(v));
      expect(parsed.bad).toBe(false);
      expect(parsed.view).toEqual(v);
    });
  }

  it('keeps ":" readable in region ids', () => {
    expect(toHash({ screen: 'place', region: 'country:BGD' })).toBe('#/place?region=country:BGD');
  });

  it('ignores unknown parameters', () => {
    const p = parseHash('#/map?variable=rain&zoom=4');
    expect(p.bad).toBe(false);
    expect(p.view).toEqual({ screen: 'map', variable: 'rain' });
  });

  it('drops invalid values and flags the link', () => {
    const p = parseHash('#/place?region=Dhaka!&season=SUMMER');
    expect(p.bad).toBe(true);
    expect(p.view).toEqual({ screen: 'place' });
  });

  it('falls back to home for an unknown screen', () => {
    expect(parseHash('#/nowhere').view.screen).toBe('home');
    expect(parseHash('#/nowhere').bad).toBe(true);
  });
});

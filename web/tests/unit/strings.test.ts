// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// X-03/X-04/X-07: every key exists in both languages with the same placeholders, every key the code uses exists,
// and the words barred by docs/03_SCIENCE.md §12.1 appear in no string the site adds.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allKeys, hasKey, translate } from '../../src/i18n';
import { WEB, listFiles, readResult } from './helpers';
import type { Catalog } from '../../src/data/types';

const placeholders = (s: string) => [...s.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]).sort().join(',');

describe('string files', () => {
  it('have the same keys in English and Bangla', () => {
    expect(allKeys('bn').sort()).toEqual(allKeys('en').sort());
  });

  it('use the same placeholders in both languages', () => {
    for (const k of allKeys('en')) {
      if (k === 'meta.digits') continue;
      expect(placeholders(translate('bn', k)), k).toBe(placeholders(translate('en', k)));
    }
  });

  it('define every key the code asks for', () => {
    const missing: string[] = [];
    for (const file of listFiles(path.join(WEB, 'src'), '.tsx').concat(listFiles(path.join(WEB, 'src'), '.ts'))) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-z_]+(?:\.[A-Za-z0-9_-]+)+)'/g)) if (!hasKey(m[1] as string)) missing.push(`${path.basename(file)}: ${m[1]}`);
      for (const m of src.matchAll(/\bk="([a-z_]+(?:\.[A-Za-z0-9_-]+)+)"/g)) if (!hasKey(m[1] as string)) missing.push(`${path.basename(file)}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('use no barred wording in the strings the site adds (X-07)', () => {
    const barred = [/caused by/i, /due to/i, /driven by/i, /\bbecause\b/i, /\bproves?\b/i, /\bdefinitely\b/i, /\bconfirms\b/i, /\bno trend\b/i, /independent confirmation/i, /95% chance/i];
    const offenders: string[] = [];
    for (const lang of ['en'] as const) {
      const site = JSON.parse(fs.readFileSync(path.join(WEB, 'src', 'i18n', `site.${lang}.json`), 'utf8'));
      const flat: [string, string][] = [];
      const walk = (o: Record<string, unknown>, p: string) => {
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === 'string') flat.push([`${p}${k}`, v]);
          else if (v && typeof v === 'object') walk(v as Record<string, unknown>, `${p}${k}.`);
        }
      };
      walk(site, '');
      for (const [k, v] of flat) {
        if (k.startsWith('site.references.')) continue; // titles of published papers
        // "Not the same as no change" and "not an independent confirmation" are the required negations.
        const text = v.replace(/not the same as no change/gi, '').replace(/not an independent confirmation/gi, '').replace(/not a 95% chance/gi, '');
        if (/\bno change\b/i.test(text)) offenders.push(`${k}: no change`);
        for (const re of barred) if (re.test(text)) offenders.push(`${k}: ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('give every catalog variable a name, definition and record card in both languages (X-03)', () => {
    const catalog = readResult<Catalog>('catalog.json');
    for (const v of catalog.variables) {
      expect(v.name.en && v.name.bn, v.id).toBeTruthy();
      expect(v.definition.en && v.definition.bn, v.id).toBeTruthy();
      expect(v.how_measured.en && v.how_measured.bn, v.id).toBeTruthy();
      expect(v.record_card, v.id).toBeTruthy();
    }
  });
});

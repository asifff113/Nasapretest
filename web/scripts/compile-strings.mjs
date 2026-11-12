// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Prebuild step (docs/05_BUILD_PLAN.md step 3A): merges the engine's shared strings (config/i18n, read-only)
// with the strings the site adds (web/src/i18n/site.*.json) into src/generated/strings.json.
// Fails the build when a key is missing in either language, a placeholder differs between languages,
// or a site key would shadow a shared key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const repo = path.resolve(web, '..');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Flattens nested objects into dotted keys; arrays and strings are leaves. */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const placeholders = (s) => (typeof s === 'string' ? [...s.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort().join(',') : '');

const langs = ['en', 'bn'];
const merged = {};
const errors = [];

for (const lang of langs) {
  const shared = flatten(read(path.join(repo, 'config', 'i18n', `${lang}.json`)));
  const site = flatten(read(path.join(web, 'src', 'i18n', `site.${lang}.json`)));
  for (const k of Object.keys(site)) {
    if (k in shared) errors.push(`site.${lang}.json redefines the shared key "${k}" (config/i18n is read-only)`);
  }
  merged[lang] = { ...shared, ...site };
}

const [en, bn] = [merged.en, merged.bn];
for (const k of Object.keys(en)) if (!(k in bn)) errors.push(`missing in bn: ${k}`);
for (const k of Object.keys(bn)) if (!(k in en)) errors.push(`missing in en: ${k}`);
for (const k of Object.keys(en)) {
  if (k in bn && k !== 'meta.digits' && placeholders(en[k]) !== placeholders(bn[k])) {
    errors.push(`placeholders differ for ${k}: en {${placeholders(en[k])}} bn {${placeholders(bn[k])}}`);
  }
}

if (errors.length) {
  console.error('compile-strings failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const outDir = path.join(web, 'src', 'generated');
fs.mkdirSync(outDir, { recursive: true });
const out = JSON.stringify({ en, bn }, null, 0);
const target = path.join(outDir, 'strings.json');
if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== out) fs.writeFileSync(target, out);
console.log(`strings: ${Object.keys(en).length} keys in English and Bangla`);

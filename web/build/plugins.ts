// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Build-time helpers for Vite. Nothing here runs in the browser.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

/** The folder served at /results/ in dev and preview, and read by the offline build. */
export function resultsDir(): string {
  return path.resolve(webRoot, process.env.RESULTS_DIR ?? '../examples');
}

const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.gz': 'application/octet-stream',
  '.bin': 'application/octet-stream',
};

/** Serves RESULTS_DIR at /results/ (dev and preview only). Files are sent as stored: a .bin.gz stays gzip. */
export function resultsServer(): Plugin {
  const dir = resultsDir();
  const handler = (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b?: unknown): void }, next: () => void) => {
    const url = req.url ?? '';
    const marker = '/results/';
    const at = url.indexOf(marker);
    if (at === -1) return next();
    let rel = decodeURIComponent(url.slice(at + marker.length).split('?')[0] ?? '');
    // The reader looks for a build in <base>/<buildId>/. The examples folder is itself the build, so serve it
    // under its build id too: /results/synthetic-v3/x → examples/x.
    try {
      const current = JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8')) as { buildId?: string };
      const prefix = `${current.buildId ?? ''}/`;
      if (current.buildId && rel.startsWith(prefix) && !fs.existsSync(path.join(dir, current.buildId))) rel = rel.slice(prefix.length);
    } catch {
      // no current.json: serve as is
    }
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('not found');
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(fs.readFileSync(file));
  };
  return {
    name: 'casefile-results-server',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

const VIRTUAL = 'virtual:offline-data';
const RESOLVED = '\0' + VIRTUAL;

/**
 * `virtual:offline-data`: in the offline build, every file named in offline/set.json (plus current.json and
 * the set itself) inlined as data; in the online build, null.
 */
export function offlineData(enabled: boolean): Plugin {
  return {
    name: 'casefile-offline-data',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      if (!enabled) return 'export default null;';
      const dir = resultsDir();
      const current = JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8')) as { buildId: string };
      // The build root: <dir>/<buildId>/ when it exists (a results folder), else <dir> itself (examples/).
      const nested = path.join(dir, current.buildId);
      const root = fs.existsSync(path.join(nested, 'build.json')) ? nested : dir;
      const set = JSON.parse(fs.readFileSync(path.join(root, 'offline', 'set.json'), 'utf8')) as {
        files: { path: string }[];
        cases: { files: string[] }[];
      };
      const wanted = new Set<string>(['offline/set.json']);
      for (const f of set.files) wanted.add(f.path);
      for (const c of set.cases) for (const f of c.files) wanted.add(f);
      const json: Record<string, unknown> = {};
      const binary: Record<string, string> = {};
      for (const rel of [...wanted].sort()) {
        const file = path.join(root, rel);
        if (!fs.existsSync(file)) throw new Error(`offline set names a file that is not in the build: ${rel}`);
        if (rel.endsWith('.json')) json[rel] = JSON.parse(fs.readFileSync(file, 'utf8'));
        else binary[rel] = fs.readFileSync(file).toString('base64');
      }
      return `export default ${JSON.stringify({ current, json, binary })};`;
    },
  };
}

/** SHA-256 hashes of the classic inline scripts in a page (the small theme bootstrap), for script-src. */
function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // Browsers turn CR LF into LF before hashing, so hash the text the way the browser sees it.
    const text = (m[1] ?? '').replace(/\r\n?/g, '\n');
    out.push(`'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`);
  }
  return out;
}

/** Content Security Policy for the online build (docs/01_ARCHITECTURE.md §9). Dev keeps Vite's inline scripts. */
export function siteCsp(): Plugin {
  return {
    name: 'casefile-csp',
    apply: 'build',
    // After Vite's own rewrites, so the hashes match the page as it is served.
    transformIndexHtml: { order: 'post', handler(html) {
      const policy = [
        "default-src 'self'",
        "connect-src 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        ["script-src 'self'", ...inlineScriptHashes(html)].join(' '),
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ');
      return html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    } },
  };
}

/** The offline file may run only its own inlined code and may connect nowhere. */
export function offlineCsp(): Plugin {
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
  ].join('; ');
  return {
    name: 'casefile-offline-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

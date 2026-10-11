import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * PRECACHE MANIFEST (build-time only; imported by vite.config.ts, never by the app).
 *
 * The service worker (public/sw.js) precaches the built app shell so the home-screen app plays offline. Vite's
 * output names are content-hashed, so the list of files only exists after a build: this tiny plugin computes it in
 * `writeBundle` and prepends it to `dist/sw.js` as `self.__PRECACHE_MANIFEST__ = { version, files }`.
 *
 * - `files` are paths relative to the deploy root (no leading slash or `./`), so they resolve against the service
 *   worker's scope and keep working under the relative base path (`base: './'`) in any sub-folder.
 * - `version` is a hash of every precached file's content (plus the sw.js template), so any change to the shipped
 *   app gives sw.js new bytes, which makes browsers install the new worker and swap caches.
 * - Left out: source maps, other HTML pages and the chunks only they use (graphics preview), the `.woff` fallbacks
 *   of fonts that also ship as `.woff2`, and sw.js itself.
 */

export interface PrecacheManifest {
  version: string;
  files: string[];
}

/** The parts of a Rollup output chunk/asset that the selection needs (keeps the logic testable without Vite). */
export interface BundleFile {
  fileName: string;
  type: 'chunk' | 'asset';
  /** Chunk only: an entry point (Vite names HTML entries after their `rollupOptions.input` key). */
  isEntry?: boolean;
  name?: string;
  imports?: readonly string[];
  dynamicImports?: readonly string[];
}

export const SW_FILE = 'sw.js';
export const MANIFEST_GLOBAL = '__PRECACHE_MANIFEST__';

/** `assets/font-500-AbCd1234.woff` → `assets/font-500.woff` (drops Vite's 8-character content hash). */
export function unhashed(file: string): string {
  return file.replace(/-[\w-]{8}(\.[^./]+)$/, '$1');
}

function isExcluded(file: string, woff2: ReadonlySet<string>, keepHtml: string): boolean {
  if (file === SW_FILE || file.endsWith('.map')) return true;
  if (file.endsWith('.html') && file !== keepHtml) return true;
  if (file.endsWith('.woff') && woff2.has(unhashed(file))) return true;
  return false;
}

/** Every chunk statically or dynamically reachable from the given entry chunks. */
function reachable(bundle: readonly BundleFile[], roots: readonly BundleFile[]): Set<string> {
  const byName = new Map(bundle.map((f) => [f.fileName, f]));
  const seen = new Set<string>();
  const stack = roots.map((r) => r.fileName);
  while (stack.length) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const f = byName.get(name);
    for (const dep of [...(f?.imports ?? []), ...(f?.dynamicImports ?? [])]) stack.push(dep);
  }
  return seen;
}

/**
 * Chooses the precached files: all bundle output and public files except the exclusions above and chunks that only
 * a non-app entry (e.g. graphics-preview.html) can reach. Sorted and de-duplicated, so the result is stable.
 */
export function selectPrecacheFiles(
  bundle: readonly BundleFile[],
  publicFiles: readonly string[],
  opts: { appEntry?: string; appHtml?: string } = {},
): string[] {
  const appEntry = opts.appEntry ?? 'main';
  const appHtml = opts.appHtml ?? 'index.html';
  const entries = bundle.filter((f) => f.type === 'chunk' && f.isEntry);
  const app = entries.filter((f) => f.name === appEntry);
  const others = entries.filter((f) => f.name !== appEntry);
  const appChunks = reachable(bundle, app);
  const otherOnly = new Set([...reachable(bundle, others)].filter((n) => !appChunks.has(n)));
  const names = [...bundle.map((f) => f.fileName), ...publicFiles].map((n) => n.split(sep).join('/').replace(/^\.?\//, ''));
  const all = new Set(names);
  // fonts that ship as .woff2 too: every browser with service workers reads woff2, so skip the .woff fallback
  const woff2 = new Set([...all].filter((n) => n.endsWith('.woff2')).map((n) => unhashed(n).slice(0, -1)));
  return [...all].filter((n) => !otherOnly.has(n) && !isExcluded(n, woff2, appHtml)).sort();
}

/** Content version: sha-256 over each file's path and content hash, plus any extra salt (the sw.js template). */
export function manifestVersion(files: readonly string[], read: (file: string) => Uint8Array | string, salt = ''): string {
  const h = createHash('sha256');
  h.update(salt);
  for (const f of [...files].sort()) {
    h.update(f);
    h.update('\0');
    h.update(createHash('sha256').update(read(f)).digest('hex'));
    h.update('\n');
  }
  return h.digest('hex').slice(0, 12);
}

/** The line prepended to dist/sw.js. */
export function manifestPrelude(m: PrecacheManifest): string {
  return `self.${MANIFEST_GLOBAL} = ${JSON.stringify(m)};\n`;
}

/** Removes a previously prepended manifest line (rebuilds into the same outDir stay idempotent). */
export function stripPrelude(source: string): string {
  return source.startsWith(`self.${MANIFEST_GLOBAL} = `) ? source.slice(source.indexOf('\n') + 1) : source;
}

/** Relative paths (forward slashes) of every file under `dir`. */
export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** Vite plugin: writes the precache manifest into the built sw.js (build only; dev never registers the worker). */
export function precacheManifestPlugin(opts: { appEntry?: string; appHtml?: string } = {}): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'recursion:precache-manifest',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    writeBundle(output, bundle) {
      const outDir = output.dir ?? resolve(config.root, config.build.outDir);
      const swPath = join(outDir, SW_FILE);
      if (!existsSync(swPath)) {
        this.warn(`${SW_FILE} not found in ${outDir}; service worker precache manifest skipped`);
        return;
      }
      const files: BundleFile[] = Object.values(bundle).map((f) =>
        f.type === 'chunk'
          ? { fileName: f.fileName, type: 'chunk', isEntry: f.isEntry, name: f.name, imports: f.imports, dynamicImports: f.dynamicImports }
          : { fileName: f.fileName, type: 'asset' },
      );
      const publicFiles = config.publicDir ? listFiles(config.publicDir) : [];
      const list = selectPrecacheFiles(files, publicFiles, opts).filter((f) => existsSync(join(outDir, f)));
      const template = stripPrelude(readFileSync(swPath, 'utf8'));
      const version = manifestVersion(list, (f) => readFileSync(join(outDir, f)), template);
      writeFileSync(swPath, manifestPrelude({ version, files: list }) + template);
      const bytes = list.reduce((n, f) => n + statSync(join(outDir, f)).size, 0);
      config.logger.info(`precache manifest: ${list.length} files, ${(bytes / 1024).toFixed(0)} kB, version ${version}`);
    },
  };
}

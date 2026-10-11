import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listFiles,
  manifestPrelude,
  manifestVersion,
  precacheManifestPlugin,
  selectPrecacheFiles,
  stripPrelude,
  unhashed,
  type BundleFile,
} from './precacheManifest';

// A bundle shaped like the real build: the game entry (main) and the graphics preview entry share three + a core
// chunk; the preview's own chunks and HTML must stay out of the precache.
const BUNDLE: BundleFile[] = [
  { fileName: 'assets/main-AAAAAAAA.js', type: 'chunk', isEntry: true, name: 'main', imports: ['assets/three-BBBBBBBB.js', 'assets/index-CCCCCCCC.js'], dynamicImports: ['assets/solutions-DDDDDDDD.js'] },
  { fileName: 'assets/solutions-DDDDDDDD.js', type: 'chunk', name: 'solutions', imports: ['assets/harness-EEEEEEEE.js', 'assets/index-CCCCCCCC.js'] },
  { fileName: 'assets/harness-EEEEEEEE.js', type: 'chunk', name: 'harness', imports: ['assets/index-CCCCCCCC.js'] },
  { fileName: 'assets/three-BBBBBBBB.js', type: 'chunk', name: 'three' },
  { fileName: 'assets/index-CCCCCCCC.js', type: 'chunk', name: 'index', imports: ['assets/three-BBBBBBBB.js'] },
  { fileName: 'assets/graphicsPreview-FFFFFFFF.js', type: 'chunk', isEntry: true, name: 'graphicsPreview', dynamicImports: ['assets/preview-GGGGGGGG.js'] },
  { fileName: 'assets/preview-GGGGGGGG.js', type: 'chunk', name: 'preview', imports: ['assets/harness-EEEEEEEE.js', 'assets/index-CCCCCCCC.js'] },
  { fileName: 'assets/main-HHHHHHHH.css', type: 'asset' },
  { fileName: 'assets/forecast.worker-IIIIIIII.js', type: 'asset' },
  { fileName: 'assets/orbitron-latin-500-normal-J1J1J1J1.woff2', type: 'asset' },
  { fileName: 'assets/orbitron-latin-500-normal-K2K2K2K2.woff', type: 'asset' },
  { fileName: 'assets/only-woff-L3L3L3L3.woff', type: 'asset' },
  { fileName: 'assets/main-AAAAAAAA.js.map', type: 'asset' },
  { fileName: 'index.html', type: 'asset' },
  { fileName: 'graphics-preview.html', type: 'asset' },
];
const PUBLIC = ['favicon.svg', 'icons/icon-192.png', 'intro/hallucinated-intro.js', 'manifest.webmanifest', 'sw.js'];

describe('precache manifest: file selection', () => {
  const files = selectPrecacheFiles(BUNDLE, PUBLIC);

  it('keeps the app shell, every chunk the game can load (static and lazy), its worker, css, fonts and public files', () => {
    expect(files).toEqual([
      'assets/forecast.worker-IIIIIIII.js',
      'assets/harness-EEEEEEEE.js', // reached through the lazy solutions chunk (attract replay)
      'assets/index-CCCCCCCC.js',
      'assets/main-AAAAAAAA.js',
      'assets/main-HHHHHHHH.css',
      'assets/only-woff-L3L3L3L3.woff',
      'assets/orbitron-latin-500-normal-J1J1J1J1.woff2',
      'assets/solutions-DDDDDDDD.js',
      'assets/three-BBBBBBBB.js',
      'favicon.svg',
      'icons/icon-192.png',
      'index.html',
      'intro/hallucinated-intro.js',
      'manifest.webmanifest',
    ]);
  });

  it('leaves out preview-only chunks and pages, source maps, sw.js and .woff fallbacks of .woff2 fonts', () => {
    for (const f of ['assets/graphicsPreview-FFFFFFFF.js', 'assets/preview-GGGGGGGG.js', 'graphics-preview.html', 'assets/main-AAAAAAAA.js.map', 'sw.js', 'assets/orbitron-latin-500-normal-K2K2K2K2.woff']) {
      expect(files).not.toContain(f);
    }
  });

  it('uses deploy-relative paths (no leading slash or ./) so they resolve against the worker scope under base ./', () => {
    expect(selectPrecacheFiles([], ['./a.png', '/b.png', 'c/d.png'])).toEqual(['a.png', 'b.png', 'c/d.png']);
    for (const f of files) expect(f).not.toMatch(/^(\.|\/)/);
  });

  it('is stable: sorted and de-duplicated whatever the bundle order', () => {
    const shuffled = [...BUNDLE].reverse();
    expect(selectPrecacheFiles(shuffled, [...PUBLIC, 'favicon.svg'].reverse())).toEqual(files);
  });

  it('honours a different app entry name', () => {
    const other = selectPrecacheFiles(BUNDLE, [], { appEntry: 'graphicsPreview', appHtml: 'graphics-preview.html' });
    expect(other).toContain('assets/preview-GGGGGGGG.js');
    expect(other).toContain('graphics-preview.html');
    expect(other).not.toContain('assets/solutions-DDDDDDDD.js');
    expect(other).not.toContain('index.html');
  });

  it('strips Vite content hashes only from the file name', () => {
    expect(unhashed('assets/rajdhani-latin-700-normal-BPDUZo87.woff2')).toBe('assets/rajdhani-latin-700-normal.woff2');
    expect(unhashed('assets/rajdhani-latin-700-normal-e0Uj8ZlN.woff')).toBe('assets/rajdhani-latin-700-normal.woff');
    expect(unhashed('icons/icon-192.png')).toBe('icons/icon-192.png');
  });
});

describe('precache manifest: version', () => {
  const content: Record<string, string> = { 'a.js': 'one', 'b.css': 'two' };
  const read = (f: string): string => content[f] ?? '';

  it('is a short hex digest, independent of list order', () => {
    const v = manifestVersion(['a.js', 'b.css'], read);
    expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(manifestVersion(['b.css', 'a.js'], read)).toBe(v);
  });

  it('changes when any file content, the file list or the sw.js template changes', () => {
    const v = manifestVersion(['a.js', 'b.css'], read);
    expect(manifestVersion(['a.js', 'b.css'], (f) => (f === 'b.css' ? 'two!' : read(f)))).not.toBe(v);
    expect(manifestVersion(['a.js'], read)).not.toBe(v);
    expect(manifestVersion(['a.js', 'b.css'], read, 'template v2')).not.toBe(v);
  });

  it('prelude defines the global the worker reads, and re-stripping it is idempotent', () => {
    const line = manifestPrelude({ version: 'abc', files: ['index.html'] });
    expect(line).toBe('self.__PRECACHE_MANIFEST__ = {"version":"abc","files":["index.html"]};\n');
    const sw = 'const MANIFEST = self.__PRECACHE_MANIFEST__;\n';
    expect(stripPrelude(line + sw)).toBe(sw);
    expect(stripPrelude(sw)).toBe(sw);
  });
});

describe('precache manifest: Vite plugin', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  const put = (root: string, file: string, text: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };

  it('writes the manifest into the built sw.js (idempotently) and lists only files that exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'precache-'));
    const pub = join(dir, 'public');
    const out = join(dir, 'dist');
    put(pub, 'icons/icon-192.png', 'png');
    put(pub, 'sw.js', '// template\n');
    put(out, 'icons/icon-192.png', 'png');
    put(out, 'sw.js', '// template\n');
    put(out, 'index.html', '<html>');
    put(out, 'assets/main-AAAAAAAA.js', 'main');
    put(out, 'assets/main-AAAAAAAA.js.map', '{}');

    const plugin = precacheManifestPlugin();
    const info: string[] = [];
    (plugin.configResolved as (c: unknown) => void)({ root: dir, publicDir: pub, build: { outDir: 'dist' }, logger: { info: (m: string) => info.push(m) } });
    const bundle = {
      'assets/main-AAAAAAAA.js': { type: 'chunk', fileName: 'assets/main-AAAAAAAA.js', isEntry: true, name: 'main', imports: [], dynamicImports: [] },
      'assets/main-AAAAAAAA.js.map': { type: 'asset', fileName: 'assets/main-AAAAAAAA.js.map' },
      'index.html': { type: 'asset', fileName: 'index.html' },
      'assets/missing-ZZZZZZZZ.js': { type: 'asset', fileName: 'assets/missing-ZZZZZZZZ.js' },
    };
    const writeBundle = plugin.writeBundle as (this: { warn(m: string): void }, o: { dir: string }, b: unknown) => void;
    const ctx = { warn: (m: string) => info.push(`warn ${m}`) };
    writeBundle.call(ctx, { dir: out }, bundle);
    const first = readFileSync(join(out, 'sw.js'), 'utf8');
    const m = /^self\.__PRECACHE_MANIFEST__ = (.*);\n/.exec(first);
    expect(m).not.toBeNull();
    const manifest = JSON.parse(m![1]!) as { version: string; files: string[] };
    expect(manifest.files).toEqual(['assets/main-AAAAAAAA.js', 'icons/icon-192.png', 'index.html']);
    expect(manifest.version).toMatch(/^[0-9a-f]{12}$/);
    expect(first.endsWith('// template\n')).toBe(true);
    expect(info.some((l) => l.startsWith('precache manifest: 3 files'))).toBe(true);

    writeBundle.call(ctx, { dir: out }, bundle); // a second pass over the same output does not stack preludes
    expect(readFileSync(join(out, 'sw.js'), 'utf8')).toBe(first);

    put(out, 'index.html', '<html lang="en">'); // content change → new version
    writeBundle.call(ctx, { dir: out }, bundle);
    expect(readFileSync(join(out, 'sw.js'), 'utf8')).not.toBe(first);
    expect(listFiles(pub)).toEqual(['icons/icon-192.png', 'sw.js']);
  });

  it('warns and does nothing when the build has no sw.js', () => {
    dir = mkdtempSync(join(tmpdir(), 'precache-'));
    const plugin = precacheManifestPlugin();
    const warns: string[] = [];
    (plugin.configResolved as (c: unknown) => void)({ root: dir, publicDir: '', build: { outDir: 'dist' }, logger: { info: () => undefined } });
    (plugin.writeBundle as (this: { warn(m: string): void }, o: { dir: string }, b: unknown) => void).call({ warn: (m) => warns.push(m) }, { dir }, {});
    expect(warns).toHaveLength(1);
  });
});

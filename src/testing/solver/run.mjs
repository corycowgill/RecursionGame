// Launcher for `npm run solve -- <level...> [options]`: bundles the TypeScript solver CLI with esbuild (shipped with
// Vite) into node_modules/.cache and runs it with Node, so the solver needs no extra tooling. See cli.ts for options.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const outDir = join(root, 'node_modules', '.cache', 'recursion-solver');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'cli.mjs');
await build({
  entryPoints: [join(here, 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
await import(pathToFileURL(outfile).href);

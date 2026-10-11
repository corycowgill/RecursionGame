# Load-time & release engineer: round 4

Owned: `vite.config.ts`, `src/main.ts`, `src/app/bootstrap.ts` (loading paths only), `public/**` (service worker),
`src/testing/harness` (import boundaries). Nothing committed; the director handles git.

## Summary

1. **The test harness is out of the boot path.** The attract replay's solution compiler now lives in
   `src/app/solutions.ts`, and the app reaches it only through a dynamic import (`src/app/lazySolutions.ts`). The
   menu boots with the attract chamber idle. After the menu has painted (`requestAnimationFrame` → `setTimeout`),
   the chunk is fetched, the solution is compiled and the attract replay restarts with it. The debug hook's
   `runSolution()` still works for Playwright: it returns synchronously once the chunk has loaded, and otherwise
   returns a Promise, which `page.evaluate` awaits. New hook members `solutionsReady()` and `loadSolutions()` were
   added. All e2e callers already go through `await hook(page, h => h.runSolution())`, so no spec changed.
2. **Finding: the ~200 KB "harness" chunk was never really the harness.** Rollup named the chunk shared by
   `index.html` and `graphics-preview.html` after one of its modules, `harness.ts`. Its sourcemap shows it is the
   shared game core: environment kit, level definitions, rendering, entity visuals, simulation and physics. The
   harness itself is 12 KB of source (**1.25 KB gzip**). The menu needs everything else in that chunk to draw its 3D
   backdrop. The split therefore saves almost no bytes. What it does save is main-thread time before the first menu
   frame: compiling the attract solution costs 25 ms (L01) to 305 ms (L10) per level on this desktop CPU with a warm
   JIT (`compileSolution` benchmark). A returning player whose continue level is L10 used to pay that up front, and
   a phone is several times slower.
3. **Preview pages: confirmed separate.** `graphics-preview.html` is its own Rollup entry. `index.html` never loads
   or modulepreloads its chunks (`graphicsPreview`, `preview`, `turntable`, 5.4 KB gzip in total), and the service
   worker does not precache them. It still has to be in the build, because `tests/e2e/visual.spec.ts` serves it
   from `dist/`. `ui-preview.html` is not a build input at all (dev server only).
4. **Service worker for offline home-screen play.** `public/sw.js` holds a versioned cache
   `recursion-<CACHE_REVISION>-<version>`. It is cache-first for `assets/*`, network-first for `index.html` and the
   scope root (with a cached fallback offline), and deletes older `recursion-*` caches on activate. All paths are
   relative to the registration scope, so it works under `base: './'`. A tiny Vite plugin,
   `src/build/precacheManifest.ts` (no dependencies), writes the precache manifest into `dist/sw.js` at build time.
   It is registered from `src/main.ts` through `src/app/serviceWorker.ts` only when all of these hold: production
   build, https or localhost, not `navigator.webdriver`, and `serviceWorker` in navigator. `?nosw` unregisters it,
   deletes the caches and reloads.
5. **`render.yaml`:** `/sw.js`, `/` and `/index.html` are served `no-cache`. `/assets/*` stays immutable for a year.
6. **README:** a new "Service worker (offline play)" section covers what is precached, how to bump (automatic;
   `CACHE_REVISION` to force a full refresh), how to clear (`?nosw` or site data), and the hosting header.

## Bundle sizes (gzip, Vite's own report)

Critical path is the entry script plus its modulepreloads in `index.html`.

| Chunk | Before | After |
|---|---|---|
| `main-*.js` | 80.88 kB | 81.54 kB (lazy loader, debug-hook branch, SW registration) |
| `three-*.js` | 193.37 kB | 193.37 kB |
| `library-*.js` | 22.17 kB | 22.17 kB |
| shared core (`harness-*.js` before, `index-*.js` after) | 64.15 kB | 63.06 kB |
| `modulepreload-polyfill` → `preload-helper` | 0.44 kB | 1.03 kB (Vite's dynamic-import helper) |
| **Critical path total** | **361.0 kB** | **361.2 kB** |
| Lazy: `solutions-*.js` + `harness-*.js` (true harness) | (in critical path) | 0.29 + 1.25 kB |
| Worker `forecast.worker-*.js` (separate request, unchanged) | 14.2 kB* | 14.2 kB* |

\* gzip measured with node zlib level 9, since Vite does not report workers.

So the byte size is flat: about 1.5 kB of real harness code moved out, and the lazy-load helper plus the SW
registration came in. Precache payload (raw): 24 files, 1760 kB, of which three.js is 673 kB. The `.woff` font
fallbacks (65 kB), source maps and preview chunks are excluded.

## Time to main menu (headless Chromium, SwiftShader)

Method: `vite preview` of each build (before = the working tree at the start of my pass; after = final), a fresh
browser per run, `?quality=low`, 1280×720. A `MutationObserver` init script timestamps the insertion of the
`main-menu` DOM, then `rAF → setTimeout` marks the first painted frame after it. The table also gives the
browser's FCP and when the attract autopilot starts. Five runs each, medians, in ms from navigation start. Scripts
are in the scratchpad (`tools/ttm2.mjs`, `tools/trace.mjs`).

| Desktop 1280×720 | Before | After |
|---|---|---|
| DOMContentLoaded (JS loaded and parsed, bootstrap ran) | 4681 | 4152 |
| Menu DOM inserted | 4681 | 4151 |
| **First menu frame painted** | **11202** | **10021** |
| First contentful paint | 13808 | 12672 |
| Attract replay running the known solution | 11194 | 16859 (deferred on purpose; the chamber idles until then) |
| Longest main-thread task | 6539 | 5854 |

iPhone 15 landscape emulation, 3 runs each: first menu frame 6682 → 7014, FCP 8328 → 7300. That is noise-level and
mixed in direction.

Read these numbers honestly. On this machine, time to menu is dominated by two things this round does not touch:
loading and parsing about 1.1 MB of JS (~4 s on a busy 4-CPU box), and the **first WebGL frame, which compiles about
33 shader programs in software (5–6.5 s)**. The CPU profile puts ~70% of boot time inside three.js's
`getProgramParameter` link-status check. The −1.2 s on desktop is larger than the compile cost removed, so part of
it is run-to-run noise from other agents' processes. Treat the result as "no regression, small gain". The real win
is on slow devices with a late continue level, which this machine cannot measure.

### Tried and reverted: painting the DOM menu before the first 3D frame

Deferring the frame loop's first `requestAnimationFrame` by one frame lets the DOM menu paint before the
shader-compiling 3D frame. Measured with tracing screenshots, the menu was visible at **6.4 s instead of 15.4 s**.
But under SwiftShader that first 3D frame then took **~11.3 s instead of ~6.2 s**. I checked this with variants:
lazy-only, deferral-only, CSS animations off, and `#ui` hidden. The link count was identical (38 programs). So the
3D backdrop appeared ~5 s later and the main thread was blocked for longer, which would slow every e2e boot. The
cause looks specific to software GL, since compiling after the first compositor frame is slower there, but I could
not confirm that on real hardware. I reverted the change. **Recommendation for the director:** try it on a real
iPhone/desktop GPU. If the first frame does not slow down there, it is a one-line change in `bootstrap.ts` (boot
section) that shows the menu several hundred ms to seconds sooner.

## Service worker: verification (Chromium, scratchpad scripts `tools/swcheck.mjs`, `tools/swupdate.mjs`)

- Under Playwright as-is (`navigator.webdriver` true): **0 registrations**, so the e2e suites always hit the network.
- With `webdriver` spoofed to false on `localhost`: registers with scope `http://localhost:<port>/`, precaches
  24/24 files, and takes control of the page (`clients.claim`).
- **Offline** (`context.setOffline(true)`) reload: the menu boots, the attract replay switches to the known
  solution (the lazy chunk is served from the cache), `loadLevel(3)` plays, and `runSolution()` completes L04
  (tick 803). `?quality=low` navigations work offline too (the shell is matched without the query). The only
  console errors offline come from the vendored studio intro, which requests an Orbitron font from
  `fonts.gstatic.com` (cross-origin, not cached). It falls back to a local font. Automation skips the intro, so the
  e2e suites never see this.
- **Update:** after changing the deployed `sw.js` bytes, the new worker installs and waits while the old tab is
  open, and both caches coexist. After the old tab closes, the new worker activates and the old cache is deleted.
  The app calls `registration.update()` on each launch, because headless Chromium did not run its navigation update
  check within 20 s. Note: `vite preview` (sirv) keeps the ETags it computed at startup, so worker updates only show
  up locally after restarting the preview server (documented in the README). I tested the update flow with
  `python -m http.server`.
- `?nosw`: registrations 0, caches deleted, one reload.

## Tests

- New `src/build/precacheManifest.test.ts` (11 tests): file selection (lazy chunks and the worker included;
  preview-only chunks, other HTML, maps, sw.js and `.woff` fallbacks excluded), deploy-relative paths, stable
  ordering, alternate entry, hash stripping, content versioning (order-independent; changes with content, list or
  template), prelude idempotence, and the plugin's `writeBundle` against a temp `dist/` (writes the manifest, drops
  files that do not exist, stays idempotent on rewrite, bumps the version on a content change, warns when sw.js is
  missing).
- New `src/app/serviceWorker.test.ts` (3 tests): registration gate (prod/https/localhost; never in dev, on insecure
  origins, under webdriver, or without support).
- `npm run verify`: typecheck clean, **Vitest 44 files / 589 tests passed**, build OK (the plugin logs
  `precache manifest: 24 files, 1760 kB`). The golden replays are untouched; no simulation code changed.
- `CI=1 E2E_PORT=4721 npx playwright test tests/e2e/smoke.spec.ts`: started (3 tests); it had not finished when this report was written. The log is in the scratchpad (`smoke.log`). The director should confirm it.

## Files

New: `src/app/solutions.ts`, `src/app/lazySolutions.ts`, `src/app/serviceWorker.ts`, `src/app/serviceWorker.test.ts`,
`src/build/precacheManifest.ts`, `src/build/precacheManifest.test.ts`, `public/sw.js`.

Changed (owned): `vite.config.ts` (plugin, comments), `src/main.ts` (SW registration), `render.yaml` (headers).

Changed (shared, minimal and additive; please note):
- `src/app/bootstrap.ts`: the import line, plus `restartAttract()` idles the chamber until the solutions chunk is
  loaded and the new `scheduleAttractSolutions()` loads it. No other flow changes. (Another agent's
  `setEchoPalette` lines in the same file are theirs.)
- `src/app/flow.ts`: `solutionFor` moved to `src/app/solutions.ts`, which removes the static harness import.
- `src/app/debugHook.ts`: lazy `runSolution`, plus `solutionsReady()` / `loadSolutions()`.
- `src/app/flow.test.ts`, `src/app/forecast.test.ts`: import `solutionFor` from `./solutions` (one line each).
- `README.md`: the preview-entry note and the "Service worker (offline play)" section under Building and deploying.
- `docs/architecture/overview.md`: three lines under "Debug hook".

## Known issues / follow-ups

1. Bytes on the critical path are unchanged: three.js (193 kB gz) plus the shared core are needed for the menu's 3D
   backdrop. Larger wins would come from lazy-loading modules the menu does not need, such as `src/ui/touch` (64 KB
   source, only on touch devices) and `src/engine/audio` (99 KB source, only after the first gesture). That needs
   bootstrap restructuring by their owners.
2. Before the solution chunk arrives, the attract chamber runs idle for a moment, then restarts at tick 0 with the
   echoes. On a real device that is a fraction of a second after the menu appears; on SwiftShader it is a few
   seconds.
3. Compiling the attract solution still runs synchronously on the main thread once loaded (up to ~0.3 s for L10 on
   desktop). Moving it into the forecast worker would remove that jank.
4. The service worker was tested in Chromium only (no Safari/WebKit here). iOS standalone apps keep separate
   storage, and iOS may evict caches under storage pressure.
5. That Render's `path: /` header matches only the root URL is assumed from Render's header-path syntax. It is not
   verified against a live deploy.

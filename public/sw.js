/*
 * RECURSION service worker: offline play for the home-screen web app.
 *
 * Registered from src/main.ts (src/app/serviceWorker.ts) only in production builds, only on https or localhost, and
 * never under automation (navigator.webdriver). `npm run build` prepends the precache manifest
 * (`self.__PRECACHE_MANIFEST__ = { version, files }`, see src/build/precacheManifest.ts), so the copy in dist/ lists
 * the exact hashed files of that build. This template on its own (dev) precaches nothing.
 *
 * Strategy
 *   install   precache the app shell + assets into `recursion-<CACHE_REVISION>-<version>`
 *   activate  delete every other `recursion-*` cache, then take control of open pages
 *   fetch     index.html / navigations: network first (fresh deploys win), cached shell when offline
 *             assets/* (content-hashed, immutable): cache first, then network (and cached for next time)
 *             other files in scope (icons, manifest, intro script): cache first, then network
 *
 * A new build changes this file's bytes (new version), so browsers install the new worker in the background. It
 * takes over once every page of the old one is closed (no skipWaiting: a running page may still lazy-load chunks
 * of its own build). Online players get new deploys right away anyway, because index.html is network-first.
 *
 * Paths are resolved against the registration scope, so the deploy works from any sub-folder (base './').
 */
const MANIFEST = self.__PRECACHE_MANIFEST__ || { version: 'dev', files: [] };
/** Bump to make every client drop its caches and download everything again (see README "Service worker"). */
const CACHE_REVISION = 1;
const CACHE_PREFIX = 'recursion-';
const CACHE = `${CACHE_PREFIX}${CACHE_REVISION}-${MANIFEST.version}`;

const SCOPE = self.registration.scope; // ends with '/'
const INDEX_URL = new URL('index.html', SCOPE).href;
const ASSETS_URL = new URL('assets/', SCOPE).href;

const stripQuery = (href) => href.split(/[?#]/)[0];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(
        MANIFEST.files.map((file) => {
          const url = new URL(file, SCOPE).href;
          // hashed assets may come from the HTTP cache (immutable); everything else is revalidated
          return new Request(url, { cache: url.startsWith(ASSETS_URL) ? 'default' : 'no-cache' });
        }),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (cacheable(res)) await cache.put(INDEX_URL, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(INDEX_URL);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: !request.url.startsWith(ASSETS_URL) });
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res) && request.url.startsWith(ASSETS_URL)) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  const path = stripQuery(request.url);
  if (path === SCOPE || path === INDEX_URL) {
    event.respondWith(networkFirstShell(request));
    return;
  }
  // Other pages (e.g. graphics-preview.html) and sw.js itself: plain network.
  if (request.mode === 'navigate' || path.endsWith('.html') || path === new URL('sw.js', SCOPE).href) return;
  event.respondWith(cacheFirst(request));
});

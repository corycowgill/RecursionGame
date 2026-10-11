/**
 * Service worker registration (load path, round 4). public/sw.js precaches the built app for offline home-screen
 * play. It is registered only when all of these hold:
 *   - production build (the dev server never registers it, so hot reload is never served from a cache),
 *   - a secure context: https, or localhost for `npm run preview`,
 *   - not under automation (`navigator.webdriver`: Playwright and other test drivers always hit the network).
 * `?nosw` unregisters the worker and deletes its caches (a manual escape hatch; see README "Service worker").
 */
export interface ServiceWorkerEnv {
  prod: boolean;
  protocol: string;
  hostname: string;
  webdriver: boolean;
  supported: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function shouldRegisterServiceWorker(env: ServiceWorkerEnv): boolean {
  if (!env.prod || !env.supported || env.webdriver) return false;
  return env.protocol === 'https:' || LOCAL_HOSTS.has(env.hostname);
}

export const SW_CACHE_PREFIX = 'recursion-';

/** Unregisters every service worker of this origin and deletes the game's caches. */
export async function removeServiceWorker(): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(SW_CACHE_PREFIX)).map((k) => caches.delete(k)));
  }
}

export function registerServiceWorker(): void {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const env: ServiceWorkerEnv = {
    prod: import.meta.env.PROD,
    protocol: location.protocol,
    hostname: location.hostname,
    webdriver: typeof navigator !== 'undefined' && navigator.webdriver === true,
    supported,
  };
  if (supported && new URLSearchParams(location.search).has('nosw')) {
    // The old worker keeps controlling this page (and could refill a cache) until it unloads: reload once, uncontrolled.
    const controlled = navigator.serviceWorker.controller !== null;
    void removeServiceWorker()
      .then(() => {
        if (controlled) location.reload();
      })
      .catch(() => undefined);
    return;
  }
  if (!shouldRegisterServiceWorker(env)) return;
  // After the page has loaded, so installing (precaching) never competes with the first load.
  const register = (): void => {
    navigator.serviceWorker
      .register('./sw.js')
      // Check for a new deploy on every launch (a home-screen app may never navigate again); a new worker installs in
      // the background and takes over once the old pages are closed.
      .then((reg) => (reg.active ? reg.update() : undefined))
      .catch((err: unknown) => console.warn('[sw] registration failed', err));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

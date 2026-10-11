/**
 * TOUCH ENVIRONMENT — pure device checks over a small snapshot (unit-tested), plus `readTouchEnv()` for the live
 * page. Presentation only: decides whether on-screen controls, the rotate overlay and the iOS "Add to Home Screen"
 * hint exist; never consulted by the simulation.
 */
export interface TouchEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** matchMedia('(pointer: coarse)') — the primary pointer is a finger. */
  coarsePointer: boolean;
  /** matchMedia('(hover: none)') — no hovering pointer (phones / tablets). */
  noHover: boolean;
  /** navigator.standalone (iOS home-screen web app) or display-mode standalone / fullscreen. */
  standalone: boolean;
  /** navigator.webdriver (automation). */
  webdriver: boolean;
}

/** iPhone / iPod / iPad, including iPadOS 13+ which reports a Mac user agent with touch. */
export function isIOSDevice(env: Pick<TouchEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true;
  const macLike = /Macintosh|MacIntel/i.test(env.userAgent) || env.platform === 'MacIntel';
  return macLike && env.maxTouchPoints > 1;
}

/** A finger is (or can be) the main input: on-screen controls are offered. */
export function isTouchDevice(env: Pick<TouchEnv, 'maxTouchPoints' | 'coarsePointer'>): boolean {
  return env.maxTouchPoints > 0 && env.coarsePointer;
}

/** Touch is the natural first device (phone / tablet): show the controls before the first touch. */
export function touchFirst(env: Pick<TouchEnv, 'maxTouchPoints' | 'coarsePointer' | 'noHover'>): boolean {
  return isTouchDevice(env) && env.noHover;
}

/** iOS Safari in a normal tab: suggest Add to Home Screen (iPhone has no Fullscreen API; the home-screen app is full screen). */
export function shouldSuggestHomeScreen(env: TouchEnv, dismissed: boolean): boolean {
  return !dismissed && isIOSDevice(env) && !env.standalone;
}

export function readTouchEnv(): TouchEnv {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { userAgent: '', platform: '', maxTouchPoints: 0, coarsePointer: false, noHover: false, standalone: false, webdriver: false };
  }
  const mq = (q: string): boolean => {
    try {
      return typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent ?? '',
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    coarsePointer: mq('(pointer: coarse)'),
    noHover: mq('(hover: none)'),
    standalone: nav.standalone === true || mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)'),
    webdriver: nav.webdriver === true,
  };
}

const A2HS_KEY = 'recursion.a2hsDismissed';

/** Per-viewer convenience flag (may be unavailable: private mode, blocked storage). */
export function homeScreenHintDismissed(): boolean {
  try {
    return localStorage.getItem(A2HS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissHomeScreenHint(): void {
  try {
    localStorage.setItem(A2HS_KEY, '1');
  } catch {
    /* storage unavailable: the hint simply returns next visit */
  }
}

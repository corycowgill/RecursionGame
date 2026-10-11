import type { QualityLevel } from './quality';

/**
 * Device classification for renderer quality auto-selection. Pure functions over a small environment snapshot so
 * they can be unit-tested without a browser; `readDeviceEnv()` builds the snapshot from the live page.
 * Presentation only: never consulted by the simulation.
 */
export interface DeviceEnv {
  userAgent: string;
  /** navigator.platform (iPadOS 13+ reports 'MacIntel' with a desktop Safari UA). */
  platform: string;
  maxTouchPoints: number;
  /** matchMedia('(pointer: coarse)') for the primary pointer. */
  coarsePointer: boolean;
  /** matchMedia('(any-pointer: fine)'): a mouse/trackpad is available as well. */
  finePointer: boolean;
  /** screen size in CSS pixels (either orientation). */
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
}

export interface DeviceProfile {
  /** Phone or tablet class hardware: auto-selects the 'mobile' preset and a 30 fps resolution target. */
  mobile: boolean;
  ios: boolean;
  /** Short reason, for the debug overlay / logs. */
  reason: string;
}

/** Shorter screen edge (CSS px) at or below which a coarse-pointer device counts as phone/tablet-class. */
export const SMALL_SCREEN_MAX = 1100;

/** iPhone / iPod / iPad, including iPadOS 13+ which presents itself as desktop Safari on a Mac with touch. */
export function isIOS(env: Pick<DeviceEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true;
  const macLike = /Macintosh|MacIntel/i.test(env.userAgent) || env.platform === 'MacIntel';
  return macLike && env.maxTouchPoints > 1;
}

export function classifyDevice(env: DeviceEnv): DeviceProfile {
  const ios = isIOS(env);
  if (ios) return { mobile: true, ios, reason: /iPad|Macintosh|MacIntel/i.test(env.userAgent) || env.platform === 'MacIntel' ? 'ipad' : 'iphone' };
  if (/Android.*Mobile|Mobile.*Android|Windows Phone|Mobi/i.test(env.userAgent)) return { mobile: true, ios, reason: 'mobile-ua' };
  const shortEdge = Math.min(env.screenWidth || Infinity, env.screenHeight || Infinity);
  // coarse primary pointer, no mouse, small screen: phones, Android tablets, touch-only Chromebooks in tablet mode
  if (env.coarsePointer && !env.finePointer && shortEdge <= SMALL_SCREEN_MAX) return { mobile: true, ios, reason: 'coarse-small' };
  return { mobile: false, ios, reason: 'desktop' };
}

/** The preset 'auto' resolves to on this device. Desktop keeps the long-standing default (high). */
export function autoQuality(profile: DeviceProfile): QualityLevel {
  return profile.mobile ? 'mobile' : 'high';
}

/**
 * Renderer preset for a Settings / URL quality value. 'auto' (and anything missing or unknown) picks by device;
 * an explicit preset is always respected. Settings also has 'ultra', which the renderer serves with 'high'.
 */
export function resolveQuality(preset: string | null | undefined, profile: DeviceProfile): QualityLevel {
  switch (preset) {
    case 'low':
    case 'mobile':
    case 'medium':
    case 'high':
      return preset;
    case 'ultra':
      return 'high';
    default:
      return autoQuality(profile);
  }
}

/** Frame rate the dynamic-resolution guard holds: 30 on phones/tablets, 60 on desktop. */
export function targetFpsFor(profile: DeviceProfile): number {
  return profile.mobile ? 30 : 60;
}

/** Snapshot of the live browser environment (safe outside a browser: returns a desktop profile). */
export function readDeviceEnv(): DeviceEnv {
  const nav = (globalThis as { navigator?: Partial<Navigator> }).navigator;
  const mm = (q: string): boolean => {
    try {
      return typeof matchMedia === 'function' && matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const scr = (globalThis as { screen?: Partial<Screen> }).screen;
  return {
    userAgent: nav?.userAgent ?? '',
    platform: nav?.platform ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    coarsePointer: mm('(pointer: coarse)'),
    finePointer: mm('(any-pointer: fine)'),
    screenWidth: scr?.width ?? 0,
    screenHeight: scr?.height ?? 0,
    devicePixelRatio: (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1,
  };
}

let cached: DeviceProfile | null = null;
/** The live device profile (cached: the hardware class does not change during a session). */
export function deviceProfile(): DeviceProfile {
  if (!cached) cached = classifyDevice(readDeviceEnv());
  return cached;
}

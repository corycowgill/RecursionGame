import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../persistence/settings';
import { autoQuality, classifyDevice, isIOS, resolveQuality, targetFpsFor, type DeviceEnv } from './device';
import { QUALITY_PRESETS } from './quality';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ requests the desktop site: a Mac UA, told apart only by touch points
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};

function env(over: Partial<DeviceEnv>): DeviceEnv {
  return {
    userAgent: UA.windows,
    platform: 'Win32',
    maxTouchPoints: 0,
    coarsePointer: false,
    finePointer: true,
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 1,
    ...over,
  };
}

const iphone = env({ userAgent: UA.iphone, platform: 'iPhone', maxTouchPoints: 5, coarsePointer: true, finePointer: false, screenWidth: 393, screenHeight: 852, devicePixelRatio: 3 });

describe('device classification', () => {
  it('detects iPhone, legacy iPad and iPadOS desktop-mode Safari as iOS / mobile', () => {
    expect(classifyDevice(iphone)).toMatchObject({ mobile: true, ios: true, reason: 'iphone' });
    expect(classifyDevice(env({ userAgent: UA.ipadLegacy, platform: 'iPad', maxTouchPoints: 5 }))).toMatchObject({ mobile: true, ios: true });
    const ipadOS = env({ userAgent: UA.ipadDesktop, platform: 'MacIntel', maxTouchPoints: 5, coarsePointer: true, finePointer: false, screenWidth: 1032, screenHeight: 1376 });
    expect(classifyDevice(ipadOS)).toMatchObject({ mobile: true, ios: true, reason: 'ipad' });
  });

  it('keeps a real Mac (no touch points) on desktop', () => {
    const mac = env({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIOS(mac)).toBe(false);
    expect(classifyDevice(mac)).toMatchObject({ mobile: false, ios: false });
  });

  it('treats Android phones (UA) and coarse-pointer small-screen tablets as mobile', () => {
    expect(classifyDevice(env({ userAgent: UA.androidPhone, coarsePointer: true, finePointer: false, screenWidth: 412, screenHeight: 915 })).mobile).toBe(true);
    const tablet = env({ userAgent: UA.androidTablet, platform: 'Linux armv8l', maxTouchPoints: 10, coarsePointer: true, finePointer: false, screenWidth: 800, screenHeight: 1280 });
    expect(classifyDevice(tablet)).toMatchObject({ mobile: true, reason: 'coarse-small' });
  });

  it('keeps desktops, touch laptops (fine pointer available) and big touch screens on desktop', () => {
    expect(classifyDevice(env({})).mobile).toBe(false);
    expect(classifyDevice(env({ maxTouchPoints: 10, coarsePointer: false, finePointer: true, screenWidth: 1366, screenHeight: 768 })).mobile).toBe(false);
    expect(classifyDevice(env({ maxTouchPoints: 10, coarsePointer: true, finePointer: false, screenWidth: 3840, screenHeight: 2160 })).mobile).toBe(false);
  });

  it('tolerates an empty environment (non-browser)', () => {
    expect(classifyDevice(env({ userAgent: '', platform: '', screenWidth: 0, screenHeight: 0 })).mobile).toBe(false);
  });
});

describe('quality preset selection', () => {
  const mobile = classifyDevice(iphone);
  const desktop = classifyDevice(env({}));

  it("'auto' picks the mobile preset on phones/tablets and high on desktop", () => {
    expect(autoQuality(mobile)).toBe('mobile');
    expect(autoQuality(desktop)).toBe('high');
    expect(resolveQuality('auto', mobile)).toBe('mobile');
    expect(resolveQuality('auto', desktop)).toBe('high');
  });

  it('missing or unknown values behave like auto', () => {
    for (const v of [null, undefined, '', 'insane']) {
      expect(resolveQuality(v, mobile)).toBe('mobile');
      expect(resolveQuality(v, desktop)).toBe('high');
    }
  });

  it("respects an explicit preset on any device ('ultra' renders as high)", () => {
    for (const p of ['low', 'mobile', 'medium', 'high'] as const) {
      expect(resolveQuality(p, mobile)).toBe(p);
      expect(resolveQuality(p, desktop)).toBe(p);
    }
    expect(resolveQuality('ultra', mobile)).toBe('high');
  });

  it('new saves default to auto; saved explicit presets survive sanitising', () => {
    expect(DEFAULT_SETTINGS.quality).toBe('auto');
    expect(sanitizeSettings({}).quality).toBe('auto');
    expect(sanitizeSettings({ quality: 'high' }).quality).toBe('high');
    expect(sanitizeSettings({ quality: 'mobile' }).quality).toBe('mobile');
  });

  it('targets 30 fps on mobile and 60 on desktop', () => {
    expect(targetFpsFor(mobile)).toBe(30);
    expect(targetFpsFor(desktop)).toBe(60);
  });

  it('the mobile preset stays inside the iOS budget', () => {
    const m = QUALITY_PRESETS.mobile;
    expect(m.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(m.shadows).toBe(false);
    expect(m.contactShadows).toBe(true);
    expect(m.antialias).not.toBe('smaa');
    expect(m.bloomResolutionScale).toBeLessThanOrEqual(0.5);
    expect(m.particles).toBeLessThan(QUALITY_PRESETS.medium.particles);
    expect(m.backdrop).toBe('reduced');
    expect(m.characterLod).toBe(1);
    expect(m.textureScale).toBeLessThanOrEqual(0.5);
    // desktop presets are unchanged by the mobile work
    for (const k of ['low', 'medium', 'high'] as const) {
      expect(QUALITY_PRESETS[k]).toMatchObject({ backdrop: 'full', characterLod: 0, textureScale: 1, contactShadows: false });
    }
  });
});

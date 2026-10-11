import { describe, expect, it } from 'vitest';
import { shouldRegisterServiceWorker, type ServiceWorkerEnv } from './serviceWorker';

const base: ServiceWorkerEnv = { prod: true, protocol: 'https:', hostname: 'recursion.example', webdriver: false, supported: true };

describe('service worker registration gate', () => {
  it('registers in production builds on https', () => {
    expect(shouldRegisterServiceWorker(base)).toBe(true);
  });

  it('registers on localhost over http (npm run preview)', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      expect(shouldRegisterServiceWorker({ ...base, protocol: 'http:', hostname })).toBe(true);
    }
  });

  it('never registers in dev, on insecure origins, under automation or without support', () => {
    expect(shouldRegisterServiceWorker({ ...base, prod: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, protocol: 'http:' })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, protocol: 'http:', hostname: '192.168.1.20' })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, webdriver: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, protocol: 'http:', hostname: 'localhost', webdriver: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, supported: false })).toBe(false);
  });
});

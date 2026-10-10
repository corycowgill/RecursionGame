/**
 * Storage backends. Browsers can deny or throw on localStorage (private mode, quota, sandboxed iframes, file://),
 * so every access is wrapped and we fall back to an in-memory store that keeps the session working.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Returns window.localStorage if it exists and accepts a write/read/remove round trip, else null. */
export function detectLocalStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!ls) return null;
    const probe = '__recursion_probe__';
    ls.setItem(probe, '1');
    const ok = ls.getItem(probe) === '1';
    ls.removeItem(probe);
    return ok ? ls : null;
  } catch {
    return null;
  }
}

/**
 * FNV-1a (32-bit) hashing over a canonical traversal of plain data:
 *  - object keys are visited in sorted (code-unit) order; undefined-valued keys are skipped
 *  - every value is prefixed with a type tag so [1] and "1" and {0:1} hash differently
 * Used for world-state hashes (determinism tests, replay verification, desync detection).
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export class Fnv1a {
  private h = FNV_OFFSET;

  byte(b: number): void {
    this.h = Math.imul(this.h ^ (b & 0xff), FNV_PRIME) >>> 0;
  }

  int32(v: number): void {
    this.byte(v);
    this.byte(v >>> 8);
    this.byte(v >>> 16);
    this.byte(v >>> 24);
  }

  str(s: string): void {
    this.int32(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.byte(c);
      this.byte(c >>> 8);
    }
  }

  num(n: number): void {
    if (Number.isInteger(n) && n >= -2147483648 && n <= 4294967295) {
      this.byte(0x01);
      this.int32(n | 0);
      if (n > 2147483647) this.byte(0x7f); // distinguish uint32 values above int32 range
    } else {
      // Non-integers should never appear in SimState; hash their exact repr so drift is still detected.
      this.byte(0x02);
      this.str(String(n));
    }
  }

  value(v: unknown): void {
    if (v === null) {
      this.byte(0x10);
    } else if (typeof v === 'number') {
      this.num(v);
    } else if (typeof v === 'boolean') {
      this.byte(v ? 0x11 : 0x12);
    } else if (typeof v === 'string') {
      this.byte(0x13);
      this.str(v);
    } else if (Array.isArray(v)) {
      this.byte(0x14);
      this.int32(v.length);
      for (const item of v) this.value(item);
    } else if (typeof v === 'object') {
      this.byte(0x15);
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      for (const k of keys) {
        const val = obj[k];
        if (val === undefined) continue;
        this.str(k);
        this.value(val);
      }
      this.byte(0x16);
    } else if (v === undefined) {
      this.byte(0x17);
    } else {
      throw new Error(`Unhashable value of type ${typeof v}`);
    }
  }

  digest(): number {
    return this.h >>> 0;
  }
}

export function hashValue(v: unknown): number {
  const h = new Fnv1a();
  h.value(v);
  return h.digest();
}

export function hashToHex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Fast deep clone for plain simulation data (objects, arrays, primitives). No Dates/Maps/classes. */
export function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
    return out as unknown as T;
  }
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k in src) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = deepClone(src[k]);
  }
  return out as T;
}

/** Recursively freezes plain data (dev aid for read-only views/snapshots). */
export function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Throws if the value contains anything other than integers/booleans/strings/null/arrays/plain objects. */
export function assertPlainIntegerData(v: unknown, path = 'state'): void {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return;
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`Non-integer number at ${path}: ${v}`);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((item, i) => assertPlainIntegerData(item, `${path}[${i}]`));
    return;
  }
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error(`Non-plain object at ${path}`);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined) continue;
      assertPlainIntegerData(val, `${path}.${k}`);
    }
    return;
  }
  throw new Error(`Invalid value type ${typeof v} at ${path}`);
}

import type { VoiceCategory } from './types';

/**
 * Voice limiter. Prevents pile-ups (e.g. five echoes stepping on the same tick, or a dozen plates clunking at
 * once after a rewind) from saturating the mix or the CPU.
 *
 * Rules, applied in order when a new one-shot asks to start at time `t`:
 *  1. Dedupe: a cue with the same `key` that started less than DEDUPE_WINDOW ago is dropped.
 *  2. Burst: at most BURST_LIMIT[category] voices of a category may START within ±BURST_WINDOW of each other.
 *  3. Category polyphony (VOICE_LIMITS) and 4. global polyphony (GLOBAL_VOICE_LIMIT).
 * For 2–4, the newcomer may steal the lowest-priority, oldest voice if its own priority is ≥ that voice's;
 * otherwise it is dropped. Player sounds have priority 2, echo sounds 1, so the live player is always heard.
 * Stolen voices are faded out over ~30 ms (no clicks).
 */
export const VOICE_LIMITS: Record<VoiceCategory, number> = {
  footstep: 6,
  mechanical: 14,
  temporal: 6,
  ui: 4,
  stinger: 3,
  ambient: 10,
  music: 40,
};
export const BURST_LIMIT: Partial<Record<VoiceCategory, number>> = { footstep: 3, mechanical: 6, ui: 2 };
export const BURST_WINDOW = 0.05;
export const DEDUPE_WINDOW = 0.045;
export const GLOBAL_VOICE_LIMIT = 64;

export interface VoiceHandle {
  id: number;
  category: VoiceCategory;
  priority: number;
  start: number;
  end: number;
  key: string | undefined;
  /** Fade out quickly and stop the sources (called when stolen or on dispose). */
  kill(at: number): void;
}

export type Admission =
  | { allow: true; steal: VoiceHandle[] }
  | { allow: false; reason: 'dedupe' | 'burst' | 'category' | 'global' };

export class VoiceManager {
  private voices: VoiceHandle[] = [];
  private lastKey = new Map<string, number>();
  private nextId = 1;
  dropped = 0;
  stolen = 0;

  prune(now: number): void {
    if (this.voices.length === 0) return;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.lastKey.size > 256) {
      for (const [k, t] of this.lastKey) if (now - t > 1) this.lastKey.delete(k);
    }
  }

  count(category?: VoiceCategory): number {
    if (!category) return this.voices.length;
    let n = 0;
    for (const v of this.voices) if (v.category === category) n++;
    return n;
  }

  admit(category: VoiceCategory, priority: number, t: number, key: string | undefined, now: number): Admission {
    this.prune(now);
    if (key !== undefined) {
      const last = this.lastKey.get(key);
      if (last !== undefined && Math.abs(t - last) < DEDUPE_WINDOW) return this.drop('dedupe');
    }
    const steal: VoiceHandle[] = [];
    const taken = new Set<VoiceHandle>();
    const victim = (pool: VoiceHandle[]): VoiceHandle | null => {
      let best: VoiceHandle | null = null;
      for (const v of pool) {
        if (taken.has(v)) continue;
        if (!best || v.priority < best.priority || (v.priority === best.priority && v.start < best.start)) best = v;
      }
      return best && best.priority <= priority ? best : null;
    };
    const tryMakeRoom = (pool: VoiceHandle[], limit: number): boolean => {
      const live = pool.filter((v) => !taken.has(v));
      if (live.length < limit) return true;
      const v = victim(live);
      if (!v) return false;
      taken.add(v);
      steal.push(v);
      return true;
    };

    const burst = BURST_LIMIT[category];
    if (burst !== undefined) {
      const near = this.voices.filter((v) => v.category === category && Math.abs(v.start - t) <= BURST_WINDOW);
      // Within a burst only a strictly higher-priority newcomer may displace (keeps the first steps of a crowd).
      if (near.length >= burst) {
        const v = victim(near);
        if (!v || v.priority >= priority) return this.drop('burst');
        taken.add(v);
        steal.push(v);
      }
    }
    if (!tryMakeRoom(this.voices.filter((v) => v.category === category), VOICE_LIMITS[category])) return this.drop('category');
    if (!tryMakeRoom(this.voices, GLOBAL_VOICE_LIMIT)) return this.drop('global');
    return { allow: true, steal };
  }

  register(v: Omit<VoiceHandle, 'id'>, now: number, stolen: readonly VoiceHandle[]): VoiceHandle {
    for (const s of stolen) {
      s.kill(now);
      this.stolen++;
    }
    if (stolen.length) this.voices = this.voices.filter((x) => !stolen.includes(x));
    const handle: VoiceHandle = { ...v, id: this.nextId++ };
    this.voices.push(handle);
    if (v.key !== undefined) this.lastKey.set(v.key, v.start);
    return handle;
  }

  killAll(now: number): void {
    for (const v of this.voices) v.kill(now);
    this.voices = [];
  }

  private drop(reason: 'dedupe' | 'burst' | 'category' | 'global'): Admission {
    this.dropped++;
    return { allow: false, reason };
  }
}

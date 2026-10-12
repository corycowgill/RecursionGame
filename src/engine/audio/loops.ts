import type { SimView } from '../contracts';
import type { Listener } from './mapping';
import { spatial } from './mapping';
import { chain, filter, gain, type NoiseBank } from './synth';

/**
 * Continuous machinery loops driven by STATE (not events), reconciled every frame:
 *   laser emitter on → beam hum · elevator moving → motor · moving platform travelling → whirr
 *   pressure plate pressed → teal hum · socket powered → energy buzz · exit portal active → portal choir
 *   temporal gate open → violet field · chrono relay with a pulse in flight → soft ticking packet whose tick rate rises
 *   as the oldest packet nears the output (round 6).
 * Reconciling against state (instead of start/stop events) means a rewind, restart or scrub can never leave a
 * loop stuck on. Only the MAX_LOOPS nearest loops sound; the rest are culled. A loop is released only after it
 * has been undesired for RELEASE_GRACE seconds (prevents flapping at moving-platform waypoints).
 */
export const MAX_LOOPS = 8;
export const RELEASE_GRACE = 0.2;

export type LoopKind = 'laser' | 'elevator' | 'platform' | 'plate' | 'socket' | 'portal' | 'gate' | 'relay';

interface Desired {
  key: string;
  kind: LoopKind;
  x: number;
  z: number;
  /** Kind-specific modulation (e.g. elevator direction). */
  mod: number;
  dist2: number;
}

interface LoopVoice {
  kind: LoopKind;
  out: GainNode;
  pan: StereoPannerNode;
  sources: AudioScheduledSourceNode[];
  params: AudioParam[];
  level: number;
  lastWanted: number;
  releasing: boolean;
  releasedAt: number;
}

const LEVEL: Record<LoopKind, number> = {
  laser: 0.05,
  elevator: 0.12,
  platform: 0.06,
  plate: 0.025,
  socket: 0.03,
  portal: 0.07,
  gate: 0.03,
  relay: 0.035,
};

export class LoopBank {
  private voices = new Map<string, LoopVoice>();
  private ducked = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly wet: AudioNode,
    private readonly noise: NoiseBank,
  ) {}

  get size(): number {
    let n = 0;
    for (const v of this.voices.values()) if (!v.releasing) n++;
    return n;
  }

  keys(): string[] {
    return [...this.voices.entries()].filter(([, v]) => !v.releasing).map(([k]) => k);
  }

  setDucked(d: boolean): void {
    this.ducked = d;
    for (const v of this.voices.values()) if (!v.releasing) this.level(v, v.level);
  }

  sync(state: SimView, listener: Listener | null): void {
    const now = this.ctx.currentTime;
    const desired: Desired[] = [];
    const lx = listener?.x ?? 0;
    const lz = listener?.z ?? 0;
    const push = (key: string, kind: LoopKind, x: number, z: number, mod = 0): void => {
      const dx = x - lx;
      const dz = z - lz;
      desired.push({ key, kind, x, z, mod, dist2: dx * dx + dz * dz });
    };
    for (const id in state.entities) {
      const e = state.entities[id];
      if (!e) continue;
      switch (e.kind) {
        case 'laserEmitter':
          if (e.state.on) push(`laser:${id}`, 'laser', e.x, e.z);
          break;
        case 'elevator':
          if (e.state.moving) push(`elevator:${id}`, 'elevator', e.x, e.z, Math.sign(e.state.dy));
          break;
        case 'movingPlatform':
          if (e.state.dx !== 0 || e.state.dz !== 0) push(`platform:${id}`, 'platform', e.x, e.z);
          break;
        case 'pressurePlate':
          if (e.state.pressed) push(`plate:${id}`, 'plate', e.x, e.z);
          break;
        case 'energySocket':
          if (e.state.powered) push(`socket:${id}`, 'socket', e.x, e.z);
          break;
        case 'exitPortal':
          if (e.state.active) push(`portal:${id}`, 'portal', e.x, e.z);
          break;
        case 'temporalGate':
          if (e.state.open) push(`gate:${id}`, 'gate', e.x, e.z);
          break;
        case 'chronoRelay': {
          const p = e.state.pending;
          // mod rises from 0 to 1 over the last 2 s before the oldest packet arrives (ticks speed up: "here it comes")
          if (p.length > 0) push(`relay:${id}`, 'relay', e.x, e.z, Math.max(0, Math.min(1, 1 - (p[0] ?? 0) / 120)));
          break;
        }
        default:
          break;
      }
    }
    desired.sort((a, b) => a.dist2 - b.dist2 || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const keep = desired.slice(0, MAX_LOOPS);
    const wanted = new Set(keep.map((d) => d.key));

    for (const d of keep) {
      let v = this.voices.get(d.key);
      if (v && v.releasing) {
        // Revive a fading voice rather than stacking a new one.
        v.releasing = false;
      }
      if (!v) {
        v = this.create(d.kind);
        this.voices.set(d.key, v);
      }
      v.lastWanted = now;
      const s = spatial(d.x, d.z, listener);
      v.pan.pan.setTargetAtTime(s.pan, now, 0.08);
      this.level(v, LEVEL[d.kind] * s.gain);
      if (d.kind === 'elevator') {
        const p = v.params[0];
        if (p) p.setTargetAtTime(d.mod >= 0 ? 62 : 48, now, 0.25);
      }
      if (d.kind === 'relay') {
        const p = v.params[0];
        if (p) p.setTargetAtTime(3 + d.mod * 7, now, 0.2);
      }
    }
    for (const [key, v] of this.voices) {
      if (wanted.has(key)) continue;
      if (!v.releasing && now - v.lastWanted >= RELEASE_GRACE) this.release(key, v, now);
      else if (v.releasing && now - v.releasedAt > 1.5) this.voices.delete(key); // onended fallback
    }
  }

  /** Immediately stop everything (dispose / hard reset). */
  stopAll(): void {
    const now = this.ctx.currentTime;
    for (const [key, v] of this.voices) this.release(key, v, now, 0.05);
    this.voices.clear();
  }

  private level(v: LoopVoice, lvl: number): void {
    v.level = lvl;
    v.out.gain.setTargetAtTime(this.ducked ? lvl * 0.25 : lvl, this.ctx.currentTime, 0.12);
  }

  private release(key: string, v: LoopVoice, now: number, fade = 0.35): void {
    v.releasing = true;
    v.releasedAt = now;
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setValueAtTime(v.out.gain.value, now);
    v.out.gain.setTargetAtTime(0, now, fade / 4);
    for (const s of v.sources) {
      try {
        s.stop(now + fade + 0.05);
      } catch {
        /* already stopped */
      }
    }
    const voices = this.voices;
    const last = v.sources[0];
    if (last) {
      last.onended = () => {
        if (voices.get(key) === v && v.releasing) voices.delete(key);
        try {
          v.pan.disconnect();
        } catch {
          /* ignore */
        }
      };
    } else voices.delete(key);
  }

  private create(kind: LoopKind): LoopVoice {
    const c = this.ctx;
    const t = c.currentTime;
    const out = gain(c, 0);
    const pan = c.createStereoPanner();
    chain(out, pan, this.dest);
    const sources: AudioScheduledSourceNode[] = [];
    const params: AudioParam[] = [];
    const o = (type: OscillatorType, f: number, detune = 0): OscillatorNode => {
      const n = c.createOscillator();
      n.type = type;
      n.frequency.setValueAtTime(f, t);
      if (detune) n.detune.setValueAtTime(detune, t);
      n.start(t);
      sources.push(n);
      return n;
    };
    const nz = (color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode => {
      const n = c.createBufferSource();
      n.buffer = this.noise.get(color);
      n.loop = true;
      n.start(t, (sources.length * 0.37) % 2);
      sources.push(n);
      return n;
    };
    const lfo = (rate: number, depth: number, target: AudioParam): void => {
      const l = o('sine', rate);
      const g = gain(c, depth);
      chain(l, g);
      g.connect(target);
    };
    switch (kind) {
      case 'laser': {
        // Bright electric hum: saw + octave through a low-pass, with a fizzing band of noise.
        const lp = filter(c, 'lowpass', 1600, 2);
        chain(o('sawtooth', 120), lp, out);
        chain(o('sine', 240, 4), gain(c, 0.6), out);
        chain(nz('white'), filter(c, 'bandpass', 4200, 3), gain(c, 0.25), out);
        lfo(0.7, 180, lp.frequency);
        break;
      }
      case 'elevator': {
        const lp = filter(c, 'lowpass', 520, 1.5);
        const m = o('sawtooth', 55);
        params.push(m.frequency);
        chain(m, lp, out);
        chain(o('square', 110, -8), gain(c, 0.25), lp);
        chain(nz('brown'), filter(c, 'lowpass', 300, 0.7), gain(c, 0.8), out);
        lfo(7, 3, m.frequency);
        break;
      }
      case 'platform': {
        chain(o('sine', 72), out);
        chain(nz('pink'), filter(c, 'bandpass', 380, 1.5), gain(c, 0.6), out);
        chain(o('triangle', 144, 6), gain(c, 0.3), out);
        break;
      }
      case 'plate': {
        chain(o('sine', 110), out);
        chain(o('sine', 220, 3), gain(c, 0.4), out);
        const g = gain(c, 0.15);
        chain(o('triangle', 330), g, out);
        lfo(0.4, 0.1, g.gain);
        break;
      }
      case 'socket': {
        chain(o('sine', 98), out);
        chain(o('sawtooth', 196), filter(c, 'lowpass', 700, 1), gain(c, 0.35), out);
        chain(o('sine', 392, 5), gain(c, 0.12), out);
        break;
      }
      case 'portal': {
        // Shimmering choir: D-A-D-F# sines beating slowly, plus a swirling band of air.
        const sum = gain(c, 1);
        chain(sum, out);
        sum.connect(this.wet);
        [146.8, 220, 293.7, 370].forEach((f, i) => chain(o('sine', f, (i % 2 ? 1 : -1) * 4), gain(c, 0.5 / (1 + i * 0.4)), sum));
        const bp = filter(c, 'bandpass', 1200, 2);
        chain(nz('pink'), bp, gain(c, 0.5), sum);
        lfo(0.15, 700, bp.frequency);
        break;
      }
      case 'relay': {
        // Soft ticking packet: a high sine gated by a fast square LFO (tick rate = params[0]) through a band-pass.
        const g = gain(c, 0);
        chain(o('sine', 1320), filter(c, 'bandpass', 1500, 4), g, out);
        const l = o('square', 3);
        params.push(l.frequency);
        const depth = gain(c, 0.5);
        chain(l, depth);
        depth.connect(g.gain);
        g.gain.setValueAtTime(0.5, t);
        g.connect(this.wet);
        break;
      }
      case 'gate': {
        const g = gain(c, 1);
        chain(o('sine', 329.6), g, out);
        chain(o('sine', 494, 6), gain(c, 0.6), g);
        lfo(4, 0.35, g.gain);
        g.connect(this.wet);
        break;
      }
    }
    return { kind, out, pan, sources, params, level: 0, lastWanted: t, releasing: false, releasedAt: 0 };
  }
}

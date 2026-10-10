import type { AudioRng } from './rng';

/** Small synthesis toolkit shared by SFX recipes, ambience and music. All times are AudioContext seconds. */

export type NoiseColor = 'white' | 'pink' | 'brown';

export class NoiseBank {
  private cache = new Map<NoiseColor, AudioBuffer>();
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly seed: number,
  ) {}

  get(color: NoiseColor): AudioBuffer {
    let b = this.cache.get(color);
    if (!b) {
      b = makeNoise(this.ctx, color, 2.5, this.seed + color.length * 7919);
      this.cache.set(color, b);
    }
    return b;
  }
}

function makeNoise(ctx: BaseAudioContext, color: NoiseColor, seconds: number, seed: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed >>> 0 || 1;
  const rnd = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd();
    if (color === 'white') d[i] = w * 0.6;
    else if (color === 'pink') {
      // Paul Kellet's refined pink filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
  }
  // Short crossfade so looping is seamless.
  const fade = Math.min(len >> 2, Math.floor(ctx.sampleRate * 0.05));
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    const j = len - fade + i;
    d[j] = (d[j] ?? 0) * (1 - a) + (d[i] ?? 0) * a;
  }
  return buf;
}

/** Per-voice build environment handed to recipes. */
export interface VoiceEnv {
  ctx: BaseAudioContext;
  /** Destination for this voice (voice gain → panner → bus). */
  out: AudioNode;
  /** Reverb send for this voice (connect sparingly; amount already applied). */
  wet: AudioNode;
  /** Start time. */
  t: number;
  rng: AudioRng;
  p: Record<string, number>;
  noise: NoiseBank;
  /** Register a scheduled source so the voice can be stopped when stolen. */
  track<T extends AudioScheduledSourceNode>(src: T): T;
}

export function gain(ctx: BaseAudioContext, v = 1): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, ctx.currentTime);
  return g;
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, ctx.currentTime);
  f.Q.setValueAtTime(q, ctx.currentTime);
  return f;
}

export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (a && b) a.connect(b);
  }
  return nodes[nodes.length - 1] as AudioNode;
}

export function osc(env: VoiceEnv, type: OscillatorType, freq: number, t0: number, t1: number, detune = 0): OscillatorNode {
  const o = env.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (detune) o.detune.setValueAtTime(detune, t0);
  o.start(t0);
  o.stop(t1 + 0.02);
  return env.track(o);
}

export function noise(env: VoiceEnv, color: NoiseColor, t0: number, t1: number, rate = 1): AudioBufferSourceNode {
  const src = env.ctx.createBufferSource();
  src.buffer = env.noise.get(color);
  src.loop = true;
  src.playbackRate.setValueAtTime(rate, t0);
  src.start(t0, env.rng.range(0, 2));
  src.stop(t1 + 0.02);
  return env.track(src);
}

/** Percussive envelope: ~instant attack to `peak`, exponential decay to silence over `decay` seconds. */
export function perc(g: AudioParam, t: number, peak: number, decay: number, attack = 0.002): void {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Attack / hold / release envelope. */
export function ahr(g: AudioParam, t: number, peak: number, attack: number, hold: number, release: number): void {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.setValueAtTime(peak, t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

/** Reverse ("swell") envelope: exponential rise to `peak` then a hard but click-free cut. */
export function swell(g: AudioParam, t: number, peak: number, rise: number, cut = 0.03): void {
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(peak, t + rise);
  g.linearRampToValueAtTime(0.0001, t + rise + cut);
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Quantising WaveShaper curve (bit-crush flavour) with `steps` levels. */
export function crushCurve(steps: number, n = 1024): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * steps) / steps;
  }
  return c;
}

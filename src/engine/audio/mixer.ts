import type { AudioVolumes, VoiceCategory } from './types';

/**
 * Master signal chain:
 *
 *   category buses ─┬─────────────────────────────► mix ─► masterGain ─► glue compressor ─► limiter ─► soft clip ─► out
 *                   └─► reverb send ─► convolver (generated IR) ─► reverb return ─┘
 *
 *   music  bus → musicFilter (lowpass, used for pause / rewind tape-sweep) → mix
 *   sfx    bus → mix; footstep / mechanical / temporal / stinger / ambient / ui sub-buses feed the sfx bus
 *
 * All gains are smoothed with setTargetAtTime to avoid zipper noise.
 */
export class Mixer {
  readonly ctx: BaseAudioContext;
  readonly input: GainNode; // pre-master mix
  readonly master: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  readonly clipper: WaveShaperNode;
  readonly music: GainNode;
  readonly musicFilter: BiquadFilterNode;
  readonly sfx: GainNode;
  readonly reverbSend: GainNode;
  readonly reverb: ConvolverNode;
  readonly reverbReturn: GainNode;
  private readonly buses = new Map<VoiceCategory, GainNode>();
  private volumes: AudioVolumes = { master: 0.8, music: 0.7, sfx: 0.9 };

  constructor(ctx: BaseAudioContext, seed: number) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.master = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.limiter = ctx.createDynamicsCompressor();
    this.clipper = ctx.createWaveShaper();

    // Glue compression: gentle, slow, keeps the mix cohesive when many echoes act at once.
    setNow(this.compressor.threshold, -20, ctx);
    setNow(this.compressor.knee, 14, ctx);
    setNow(this.compressor.ratio, 3, ctx);
    setNow(this.compressor.attack, 0.012, ctx);
    setNow(this.compressor.release, 0.25, ctx);
    // Brick-wall-ish limiter.
    setNow(this.limiter.threshold, -4, ctx);
    setNow(this.limiter.knee, 0, ctx);
    setNow(this.limiter.ratio, 20, ctx);
    setNow(this.limiter.attack, 0.002, ctx);
    setNow(this.limiter.release, 0.12, ctx);
    // Soft clip as the very last safety net (tanh, unity-ish below -6 dBFS).
    this.clipper.curve = softClipCurve(2048);
    this.clipper.oversample = '2x';

    this.input.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.clipper);
    this.clipper.connect(ctx.destination);

    this.reverbSend = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbReturn = ctx.createGain();
    this.reverb.buffer = generateImpulse(ctx, 3.4, seed);
    setNow(this.reverbReturn.gain, 0.55, ctx);
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.input);

    this.music = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    setNow(this.musicFilter.frequency, 18000, ctx);
    setNow(this.musicFilter.Q, 0.5, ctx);
    this.music.connect(this.musicFilter);
    this.musicFilter.connect(this.input);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.input);

    const sub: [VoiceCategory, number][] = [
      ['footstep', 0.8],
      ['mechanical', 0.9],
      ['temporal', 1.0],
      ['stinger', 1.0],
      ['ambient', 0.75],
      ['ui', 2.4],
    ];
    for (const [cat, g] of sub) {
      const bus = ctx.createGain();
      setNow(bus.gain, g, ctx);
      bus.connect(this.sfx);
      this.buses.set(cat, bus);
    }
    this.buses.set('music', this.music);
    this.applyVolumes(0);
  }

  bus(cat: VoiceCategory): GainNode {
    return this.buses.get(cat) ?? this.sfx;
  }

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  setVolumes(v: Partial<AudioVolumes>): void {
    const c = (x: number | undefined, d: number): number =>
      typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d;
    this.volumes = {
      master: c(v.master, this.volumes.master),
      music: c(v.music, this.volumes.music),
      sfx: c(v.sfx, this.volumes.sfx),
    };
    this.applyVolumes(0.08);
  }

  private applyVolumes(smooth: number): void {
    // Perceptual curve (≈ x²) so a slider at 50 % sounds like half volume. Headroom: master tops out at 0.9.
    const curve = (x: number): number => x * x;
    ramp(this.master.gain, curve(this.volumes.master) * 0.9, this.ctx, smooth);
    ramp(this.music.gain, curve(this.volumes.music) * 0.6, this.ctx, smooth);
    ramp(this.sfx.gain, curve(this.volumes.sfx), this.ctx, smooth);
  }

  dispose(): void {
    try {
      this.clipper.disconnect();
      this.input.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

export function setNow(p: AudioParam, v: number, ctx: BaseAudioContext): void {
  p.cancelScheduledValues(ctx.currentTime);
  p.setValueAtTime(v, ctx.currentTime);
}

/** Smooth parameter change (time constant ≈ smooth/3 so it is ~95 % done after `smooth` seconds). */
export function ramp(p: AudioParam, v: number, ctx: BaseAudioContext, smooth: number): void {
  const t = ctx.currentTime;
  if (smooth <= 0) {
    setNow(p, v, ctx);
    return;
  }
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.setTargetAtTime(v, t, Math.max(0.005, smooth / 3));
}

export function softClipCurve(n: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = 1.4;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/**
 * Procedural stereo impulse response for a large metal-and-stone hall: sparse early reflections, then
 * exponentially decaying noise that darkens over time (progressive one-pole lowpass) with slight L/R decorrelation.
 */
export function generateImpulse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  let s = (seed ^ 0x9e3779b9) >>> 0 || 1;
  const rnd = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const pre = Math.floor(0.012 * rate) + ch * 37;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      const env = Math.exp((-6.9 * t) / seconds); // −60 dB at `seconds`
      const coeff = 0.15 + 0.8 * Math.min(1, t / seconds); // darker as it decays
      lp += (rnd() - lp) * (1 - coeff);
      d[i] = lp * env * 0.9;
    }
    // Early reflections from the chamber walls.
    const taps = [0.019, 0.027, 0.041, 0.053, 0.067, 0.089, 0.113];
    for (let k = 0; k < taps.length; k++) {
      const tap = taps[k] ?? 0;
      const idx = Math.floor((tap + ch * 0.0031) * rate);
      if (idx < len) d[idx] = (d[idx] ?? 0) + (k % 2 ? -1 : 1) * 0.5 * Math.exp(-k * 0.35);
    }
  }
  return buf;
}

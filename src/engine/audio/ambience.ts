import type { AudioRng } from './rng';
import { chain, filter, gain, midiToHz, type NoiseBank } from './synth';

/**
 * Facility soundscape (ambient bus):
 *  - Deep drone: D1 sine + detuned A1 triangles + brown-noise rumble with a very slow breathing filter.
 *  - Air: a whisper of band-passed pink noise drifting in pitch.
 *  - Distant machinery (scheduled): metallic clanks / ratchets every 4–11 s, heavily reverberated, random pan;
 *    a slow far-away piston thump with occasional skipped beats.
 *  - Clock: very quiet alternating tick/tock once per second — the chamber is always counting.
 * Variation comes from the cosmetic seeded RNG only.
 */
export class Ambience {
  private readonly out: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private started = false;
  private nextClock = 0;
  private nextPiston = 0;
  private nextMachine = 0;
  private clockPhase = 0;
  scheduledEvents = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
    private readonly wet: AudioNode,
    private readonly noise: NoiseBank,
    private readonly rng: AudioRng,
  ) {
    this.out = gain(ctx, 0);
    this.out.connect(dest);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const c = this.ctx;
    const t = c.currentTime;
    const o = (type: OscillatorType, f: number, detune = 0): OscillatorNode => {
      const n = c.createOscillator();
      n.type = type;
      n.frequency.setValueAtTime(f, t);
      if (detune) n.detune.setValueAtTime(detune, t);
      n.start(t);
      this.sources.push(n);
      return n;
    };
    const nz = (color: 'pink' | 'brown', offset: number): AudioBufferSourceNode => {
      const n = c.createBufferSource();
      n.buffer = this.noise.get(color);
      n.loop = true;
      n.start(t, offset);
      this.sources.push(n);
      return n;
    };
    const lfo = (rate: number, depth: number, target: AudioParam): void => {
      const l = o('sine', rate);
      const g = gain(c, depth);
      l.connect(g);
      g.connect(target);
    };

    const drone = gain(c, 0.06);
    drone.connect(this.out);
    chain(o('sine', midiToHz(26)), gain(c, 0.55), drone); // D1
    chain(o('triangle', midiToHz(33), -6), gain(c, 0.16), drone); // A1
    chain(o('triangle', midiToHz(33), 7), gain(c, 0.16), drone);
    chain(o('sine', midiToHz(50), 3), gain(c, 0.04), drone); // faint D3 overtone

    const rumbleLp = filter(c, 'lowpass', 160, 0.9);
    chain(nz('brown', 0.3), rumbleLp, gain(c, 0.55), drone);
    lfo(0.045, 70, rumbleLp.frequency);

    const airBp = filter(c, 'bandpass', 900, 0.8);
    const airG = gain(c, 0.035);
    chain(nz('pink', 1.1), airBp, airG, this.out);
    airG.connect(this.wet);
    lfo(0.03, 400, airBp.frequency);
    lfo(0.07, 0.015, airG.gain);

    this.out.gain.setValueAtTime(0.0001, t);
    this.out.gain.exponentialRampToValueAtTime(1, t + 4);
    this.nextClock = t + 1;
    this.nextPiston = t + 2;
    this.nextMachine = t + this.rng.range(3, 6);
  }

  /** Schedule one-shot ambience up to `horizon` (AudioContext seconds). */
  schedule(horizon: number): void {
    if (!this.started) return;
    while (this.nextClock < horizon) {
      this.clock(this.nextClock, this.clockPhase++ % 2 === 0);
      this.nextClock += 1;
    }
    while (this.nextPiston < horizon) {
      if (!this.rng.chance(0.15)) this.piston(this.nextPiston);
      this.nextPiston += 2.4;
    }
    while (this.nextMachine < horizon) {
      this.machine(this.nextMachine);
      this.nextMachine += this.rng.range(4, 11);
    }
  }

  /** Re-anchor the scheduler after a suspend / long stall so we never burst-schedule the past. */
  resync(now: number): void {
    if (this.nextClock < now) this.nextClock = Math.ceil(now);
    if (this.nextPiston < now) this.nextPiston = now + 0.5;
    if (this.nextMachine < now) this.nextMachine = now + this.rng.range(2, 6);
  }

  dispose(): void {
    const t = this.ctx.currentTime;
    for (const s of this.sources) {
      try {
        s.stop(t + 0.05);
      } catch {
        /* ignore */
      }
    }
    try {
      this.out.disconnect();
    } catch {
      /* ignore */
    }
  }

  private tracked<T extends AudioScheduledSourceNode>(n: T, t0: number, t1: number): T {
    n.start(t0);
    n.stop(t1);
    this.scheduledEvents++;
    return n;
  }

  private clock(t: number, tick: boolean): void {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise.get('white');
    const bp = filter(c, 'bandpass', tick ? 3300 : 2700, 12);
    const g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    chain(n, bp, g, this.out);
    g.connect(this.wet);
    this.tracked(n, t, t + 0.05);
  }

  private piston(t: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.3);
    const g = gain(c, 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    const lp = filter(c, 'lowpass', 140, 0.7);
    chain(o, g, lp, this.out);
    lp.connect(this.wet);
    this.tracked(o, t, t + 0.4);
    // Hiss exhaust after each stroke.
    const n = c.createBufferSource();
    n.buffer = this.noise.get('pink');
    const bp = filter(c, 'bandpass', 2200, 1.5);
    const ng = gain(c, 0);
    ng.gain.setValueAtTime(0.0001, t + 0.15);
    ng.gain.linearRampToValueAtTime(0.012, t + 0.2);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    chain(n, bp, ng, this.wet);
    this.tracked(n, t + 0.15, t + 0.75);
  }

  private machine(t: number): void {
    const c = this.ctx;
    const pan = c.createStereoPanner();
    pan.pan.setValueAtTime(this.rng.range(-0.8, 0.8), t);
    const g = gain(c, 0.5);
    chain(g, pan, this.wet); // almost entirely reverb: it is far away
    const dry = gain(c, 0.12);
    chain(pan, dry, this.out);
    const base = this.rng.range(140, 320);
    const ratchet = this.rng.chance(0.35);
    const hits = ratchet ? this.rng.int(4, 7) : this.rng.int(1, 2);
    for (let h = 0; h < hits; h++) {
      const ht = t + h * (ratchet ? 0.09 : 0.45);
      [1, 1.51, 2.27, 3.07].forEach((r, i) => {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(base * r * this.rng.jitter(0.01), ht);
        const pg = gain(c, 0);
        const dur = (ratchet ? 0.25 : 1.4) * (1 - i * 0.15);
        pg.gain.setValueAtTime(0.0001, ht);
        pg.gain.linearRampToValueAtTime((ratchet ? 0.02 : 0.035) / (1 + i), ht + 0.002);
        pg.gain.exponentialRampToValueAtTime(0.0001, ht + dur);
        chain(o, pg, g);
        this.tracked(o, ht, ht + dur + 0.05);
      });
    }
  }
}

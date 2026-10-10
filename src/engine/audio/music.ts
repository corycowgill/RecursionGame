import type { MusicState } from './types';
import type { AudioRng } from './rng';
import { chain, filter, gain, midiToHz } from './synth';

/**
 * Generative ambient score. Layers are always "conceptually" running; each has its own gain and the music state
 * only changes layer target gains (smooth ~2.5 s crossfades) and, at the next chord boundary, the progression.
 * Notes are only scheduled for layers that are audible, so silent layers cost nothing.
 *
 * Harmony: D dorian for exploration and puzzle solving (Dm9 – B♭maj7 – Fmaj7 – Cadd9), D lydian/major for
 * completion (Dmaj9 – Gmaj7/D – Em9/D – Dmaj9), a slower darker pair for the menu. Tempo 84 BPM, 8th-note grid.
 *
 *   pad     detuned saw pairs through a slowly opening low-pass (all states)
 *   bells   sparse FM bells on the pentatonic subset (explore / menu / complete)
 *   bass    sub-sine roots with soft attack (explore, solving)
 *   pulse   muted clock-like plucks on every 8th, accented on beats — the "machine" of solving
 *   arp     glassy arpeggio that grows denser with the number of echoes (solving)
 *   choir   bright sustained shimmer (complete)
 */
export type MusicLayer = 'pad' | 'bells' | 'bass' | 'pulse' | 'arp' | 'choir';
export const MUSIC_LAYERS: readonly MusicLayer[] = ['pad', 'bells', 'bass', 'pulse', 'arp', 'choir'];

export const LAYER_MIX: Record<MusicState, Record<MusicLayer, number>> = {
  silent: { pad: 0, bells: 0, bass: 0, pulse: 0, arp: 0, choir: 0 },
  menu: { pad: 0.85, bells: 0.55, bass: 0.2, pulse: 0, arp: 0, choir: 0 },
  explore: { pad: 0.7, bells: 0.6, bass: 0.35, pulse: 0, arp: 0, choir: 0 },
  solving: { pad: 0.5, bells: 0.25, bass: 0.7, pulse: 0.55, arp: 0.5, choir: 0 },
  complete: { pad: 0.8, bells: 0.7, bass: 0.3, pulse: 0, arp: 0, choir: 0.8 },
};

/** Chords as MIDI note lists (low → high). */
const PROGRESSIONS: Record<'dorian' | 'major' | 'menu', number[][]> = {
  dorian: [
    [50, 57, 60, 64, 65], // Dm9 (D A C E F)
    [46, 53, 57, 62, 65], // B♭maj7 (B♭ F A D F)
    [41, 53, 57, 60, 64], // Fmaj7 (F F A C E)
    [48, 55, 62, 64, 67], // Cadd9 (C G D E G)
  ],
  major: [
    [50, 57, 61, 64, 66], // Dmaj9
    [43, 55, 59, 62, 66], // Gmaj7
    [40, 55, 59, 62, 66], // Em9-ish
    [50, 57, 62, 64, 69], // Dadd9
  ],
  menu: [
    [50, 57, 60, 65, 69], // Dm(add11)
    [46, 53, 58, 62, 65], // B♭
  ],
};
const PENTA_DORIAN = [62, 64, 65, 69, 72, 74, 76, 77, 81];
const PENTA_MAJOR = [62, 64, 66, 69, 71, 74, 76, 78, 81];

const BPM = 84;
const STEP = 60 / BPM / 2; // 8th note

export class Music {
  readonly layers = new Map<MusicLayer, GainNode>();
  private readonly padFilter: BiquadFilterNode;
  private state: MusicState = 'silent';
  private pendingProgression: keyof typeof PROGRESSIONS = 'dorian';
  private progression: keyof typeof PROGRESSIONS = 'dorian';
  private step = 0;
  private nextStepTime = 0;
  private running = false;
  private intensity = 0;
  notesScheduled = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
    wet: AudioNode,
    private readonly rng: AudioRng,
  ) {
    this.padFilter = filter(ctx, 'lowpass', 900, 0.6);
    for (const l of MUSIC_LAYERS) {
      const g = gain(ctx, 0);
      g.connect(dest);
      if (l === 'bells' || l === 'arp' || l === 'choir' || l === 'pad') g.connect(wet);
      this.layers.set(l, g);
    }
    const pad = this.layers.get('pad');
    if (pad) this.padFilter.connect(pad);
  }

  get current(): MusicState {
    return this.state;
  }

  /** 0..5 — number of echoes; densifies the arp and opens the pad filter while solving. */
  setIntensity(n: number): void {
    this.intensity = Math.max(0, Math.min(5, n));
  }

  setState(s: MusicState, fade = 2.5): void {
    const t = this.ctx.currentTime;
    if (!this.running) {
      this.running = true;
      this.nextStepTime = t + 0.1;
      this.step = 0;
    }
    this.state = s;
    this.pendingProgression = s === 'complete' ? 'major' : s === 'menu' ? 'menu' : 'dorian';
    const mix = LAYER_MIX[s];
    for (const l of MUSIC_LAYERS) {
      const g = this.layers.get(l);
      if (!g) continue;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.setTargetAtTime(mix[l], t, Math.max(0.01, fade / 3));
    }
    const cutoff = s === 'complete' ? 2600 : s === 'solving' ? 1300 : s === 'menu' ? 700 : 950;
    this.padFilter.frequency.setTargetAtTime(cutoff, t, fade / 2);
  }

  /** Is the layer currently (or about to be) audible? */
  private audible(l: MusicLayer): boolean {
    return LAYER_MIX[this.state][l] > 0.001 || (this.layers.get(l)?.gain.value ?? 0) > 0.002;
  }

  resync(now: number): void {
    if (this.nextStepTime < now) this.nextStepTime = now + 0.05;
  }

  schedule(horizon: number): void {
    if (!this.running) return;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.step++;
      this.nextStepTime += STEP;
    }
  }

  dispose(): void {
    for (const g of this.layers.values()) {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private scheduleStep(step: number, t: number): void {
    const stepsPerChord = this.progression === 'menu' ? 32 : 16; // 2 bars (menu: 4 bars)
    const inChord = step % stepsPerChord;
    if (inChord === 0) this.progression = this.pendingProgression; // switch harmony on chord boundaries
    const prog = PROGRESSIONS[this.progression];
    const chord = prog[Math.floor(step / stepsPerChord) % prog.length] ?? prog[0] ?? [50];
    const chordDur = stepsPerChord * STEP;
    const penta = this.progression === 'major' ? PENTA_MAJOR : PENTA_DORIAN;

    if (inChord === 0 && this.audible('pad')) this.pad(chord, t, chordDur);
    if (this.audible('bass') && (inChord === 0 || inChord === 8 || (this.state === 'solving' && inChord === 14))) {
      this.bass((chord[0] ?? 50) - 12 + (inChord === 14 ? 7 : 0), t, inChord === 14 ? STEP * 1.8 : STEP * 7);
    }
    if (this.audible('pulse')) {
      const accent = step % 2 === 0;
      const note = (chord[step % 4 === 2 ? 1 : 0] ?? 50) + 12;
      this.pluck(note, t, accent ? 0.11 : 0.06);
    }
    if (this.audible('arp')) {
      const density = 0.35 + this.intensity * 0.12;
      if (this.rng.chance(density)) {
        const pool = chord.slice(1);
        const n = (pool[(step + this.rng.int(0, 1)) % pool.length] ?? 62) + 12 + (this.rng.chance(0.25) ? 12 : 0);
        this.glass(n, t);
      }
    }
    if (this.audible('bells')) {
      const p = this.state === 'complete' ? 0.3 : this.state === 'menu' ? 0.12 : 0.16;
      if (step % 2 === 0 && this.rng.chance(p)) this.bell(this.rng.pick(penta) + (this.rng.chance(0.3) ? 12 : 0), t);
    }
    if (inChord === 0 && this.audible('choir')) this.choir(chord, t, chordDur);
  }

  private osc(type: OscillatorType, f: number, t0: number, t1: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    o.start(t0);
    o.stop(t1 + 0.05);
    this.notesScheduled++;
    return o;
  }

  private env(t: number, peak: number, a: number, hold: number, r: number): GainNode {
    const g = gain(this.ctx, 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    return g;
  }

  private pad(chord: number[], t: number, dur: number): void {
    const a = 1.6;
    const r = 2.4;
    const hold = Math.max(0.1, dur - a + 0.4);
    chord.slice(1).forEach((m, i) => {
      const g = this.env(t + i * 0.08, 0.035, a, hold, r);
      chain(g, this.padFilter);
      for (const d of [-9, 9]) chain(this.osc('sawtooth', midiToHz(m), t, t + a + hold + r + i * 0.08, d + this.rng.range(-2, 2)), g);
    });
  }

  private bass(m: number, t: number, dur: number): void {
    const out = this.layers.get('bass');
    if (!out) return;
    const g = this.env(t, 0.22, 0.06, dur * 0.6, dur * 0.5);
    chain(this.osc('sine', midiToHz(m), t, t + dur * 1.2), g, out);
    const g2 = this.env(t, 0.03, 0.02, dur * 0.3, dur * 0.3);
    chain(this.osc('triangle', midiToHz(m + 12), t, t + dur), g2, out);
  }

  private pluck(m: number, t: number, peak: number): void {
    const out = this.layers.get('pulse');
    if (!out) return;
    const lp = filter(this.ctx, 'lowpass', 1800, 4);
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.16);
    const g = this.env(t, peak, 0.003, 0.01, 0.18);
    chain(this.osc('square', midiToHz(m), t, t + 0.25), lp, g, out);
  }

  private glass(m: number, t: number): void {
    const out = this.layers.get('arp');
    if (!out) return;
    const g = this.env(t, 0.045, 0.004, 0.02, 0.5);
    chain(this.osc('triangle', midiToHz(m), t, t + 0.6), g, out);
    const g2 = this.env(t, 0.012, 0.004, 0.01, 0.3);
    chain(this.osc('sine', midiToHz(m + 19), t, t + 0.4), g2, out);
  }

  private bell(m: number, t: number): void {
    const out = this.layers.get('bells');
    if (!out) return;
    const f = midiToHz(m);
    const car = this.osc('sine', f, t, t + 2.6);
    const mod = this.osc('sine', f * 3.5, t, t + 2.6);
    const mg = gain(this.ctx, f * 1.2);
    mg.gain.setValueAtTime(f * 1.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 1.8);
    chain(mod, mg);
    mg.connect(car.frequency);
    const g = this.env(t, 0.05, 0.004, 0.05, 2.4);
    chain(car, g, out);
  }

  private choir(chord: number[], t: number, dur: number): void {
    const out = this.layers.get('choir');
    if (!out) return;
    const hold = Math.max(0.1, dur - 1.6);
    chord.slice(1).forEach((m, i) => {
      const g = this.env(t, 0.03, 1.4, hold, 2.2);
      const vib = this.osc('sine', 4.6 + i * 0.3, t, t + dur + 2.5);
      const vg = gain(this.ctx, 7);
      chain(vib, vg);
      const o = this.osc('triangle', midiToHz(m + 12), t, t + 1.4 + hold + 2.2);
      vg.connect(o.detune);
      chain(o, g, out);
    });
  }
}

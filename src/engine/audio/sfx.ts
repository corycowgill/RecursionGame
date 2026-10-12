import type { VoiceCategory } from './types';
import { ahr, chain, crushCurve, filter, gain, midiToHz, noise, osc, perc, swell, type VoiceEnv } from './synth';

/**
 * SFX recipes. Each recipe builds a small synthesis graph into `env.out` (dry) and `env.wet` (reverb send),
 * schedules everything relative to `env.t`, and returns the voice length in seconds (used by the voice limiter
 * and for cleanup). Recipes must only use `env.rng` for variation.
 *
 * Sonic identity
 *  - Player = warm gold: sine/triangle bodies, brass-like saws, grounded thumps.
 *  - Echoes = cyan: softer, low-passed, with a faint high crystalline shimmer and more reverb.
 *  - Temporal = reversed envelopes, pitch dives, granular clouds, chord blooms in D (dorian/lydian colours).
 *  - Hazard / invalid = coral: detuned squares, bit-crush, stutter.
 */
export interface Recipe {
  category: VoiceCategory;
  /** Reverb send amount 0..1. */
  wet: number;
  build(env: VoiceEnv): number;
}

/* ------------------------------------------------------------------ building blocks --------- */

/** Pitch-dropping sine thump (kick-like body). */
function thump(e: VoiceEnv, t: number, f0: number, f1: number, dur: number, peak: number, dest: AudioNode = e.out): void {
  const g = gain(e.ctx, 0);
  const o = osc(e, 'sine', f0, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  perc(g.gain, t, peak, dur);
  chain(o, g, dest);
}

/** Filtered noise burst (clicks, scuffs, hisses). */
function burst(
  e: VoiceEnv,
  t: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  dur: number,
  peak: number,
  color: 'white' | 'pink' | 'brown' = 'white',
  dest: AudioNode = e.out,
): BiquadFilterNode {
  const src = noise(e, color, t, t + dur + 0.05, e.rng.jitter(0.1));
  const f = filter(e.ctx, type, freq, q);
  const g = gain(e.ctx, 0);
  perc(g.gain, t, peak, dur, 0.001);
  chain(src, f, g, dest);
  return f;
}

/** Inharmonic metallic ring (struck plate / beam). Ratios loosely follow a free plate's modes. */
function ring(e: VoiceEnv, t: number, base: number, dur: number, peak: number, dest: AudioNode = e.out, partials = 4): void {
  const ratios = [1, 1.51, 2.27, 3.07, 4.13, 5.4];
  for (let i = 0; i < partials; i++) {
    const r = ratios[i] ?? 1;
    const g = gain(e.ctx, 0);
    const o = osc(e, 'sine', base * r * e.rng.jitter(0.01), t, t + dur * (1 - i * 0.12) + 0.05);
    perc(g.gain, t, peak / (1 + i * 0.7), dur * (1 - i * 0.12), 0.001);
    chain(o, g, dest);
  }
}

/** Simple 2-op FM bell. */
function bell(e: VoiceEnv, t: number, freq: number, dur: number, peak: number, ratio = 1.4, index = 2.2, dest: AudioNode = e.out): void {
  const car = osc(e, 'sine', freq, t, t + dur + 0.05);
  const mod = osc(e, 'sine', freq * ratio, t, t + dur + 0.05);
  const mg = gain(e.ctx, 0);
  mg.gain.setValueAtTime(freq * index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.05), t + dur * 0.7);
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = gain(e.ctx, 0);
  perc(g.gain, t, peak, dur, 0.003);
  chain(car, g, dest);
}

/** Tone with attack/hold/release. */
function tone(
  e: VoiceEnv,
  t: number,
  type: OscillatorType,
  freq: number,
  peak: number,
  a: number,
  h: number,
  r: number,
  dest: AudioNode = e.out,
  detune = 0,
): OscillatorNode {
  const o = osc(e, type, freq, t, t + a + h + r + 0.05, detune);
  const g = gain(e.ctx, 0);
  ahr(g.gain, t, peak, a, h, r);
  chain(o, g, dest);
  return o;
}

/** Servo whine: a saw through a resonant band-pass gliding between two pitches. */
function servo(e: VoiceEnv, t: number, f0: number, f1: number, dur: number, peak: number): void {
  const o = osc(e, 'sawtooth', f0, t, t + dur + 0.1);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const o2 = osc(e, 'square', f0 * 2.01, t, t + dur + 0.1);
  o2.frequency.exponentialRampToValueAtTime(f1 * 2.01, t + dur);
  const bp = filter(e.ctx, 'bandpass', f0 * 3, 3.5);
  bp.frequency.exponentialRampToValueAtTime(f1 * 3, t + dur);
  const g = gain(e.ctx, 0);
  ahr(g.gain, t, peak, 0.03, Math.max(0, dur - 0.08), 0.06);
  const g2 = gain(e.ctx, 0.25);
  chain(o2, g2, bp);
  chain(o, bp, g, e.out);
}

/** Pneumatic hiss: high-passed white noise with a swept band. */
function hiss(e: VoiceEnv, t: number, dur: number, peak: number, f0 = 6000, f1 = 2500): void {
  const src = noise(e, 'white', t, t + dur + 0.1);
  const hp = filter(e.ctx, 'highpass', 1800, 0.7);
  const bp = filter(e.ctx, 'bandpass', f0, 0.9);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = gain(e.ctx, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  chain(src, hp, bp, g, e.out);
}

/** Echo shimmer: the faint crystalline "tail" that marks sounds made by past selves. */
function shimmer(e: VoiceEnv, t: number, peak: number): void {
  const f = e.rng.pick([2349, 2637, 2960, 3136, 3520]);
  const g = gain(e.ctx, 0);
  const o = osc(e, 'sine', f, t, t + 0.3);
  perc(g.gain, t + 0.01, peak, 0.22, 0.01);
  chain(o, g, e.wet);
  chain(g, e.out);
}

/* ------------------------------------------------------------------ temporal ---------------- */

const D4 = 62;

function buildRewind(e: VoiceEnv, scale = 1): number {
  const t = e.t;
  const len = 1.15 * scale;
  // 1) Pitch dive (tape-stop): saw 2 octaves down through a closing low-pass.
  const dive = osc(e, 'sawtooth', 880, t, t + len);
  dive.frequency.exponentialRampToValueAtTime(48, t + len);
  const dive2 = osc(e, 'sawtooth', 884, t, t + len, 9);
  dive2.frequency.exponentialRampToValueAtTime(49, t + len);
  const lp = filter(e.ctx, 'lowpass', 5200, 2.5);
  lp.frequency.exponentialRampToValueAtTime(180, t + len);
  const dg = gain(e.ctx, 0);
  dg.gain.setValueAtTime(0.0001, t);
  dg.gain.exponentialRampToValueAtTime(0.16, t + 0.12);
  dg.gain.setValueAtTime(0.16, t + len * 0.6);
  dg.gain.exponentialRampToValueAtTime(0.0001, t + len);
  dive.connect(lp);
  dive2.connect(lp);
  chain(lp, dg, e.out);

  // 2) Reverse-swept granular whoosh: grains accelerate, band sweeps high → low, each grain has a reversed env.
  const grains = Math.round(26 * scale);
  let gt = t;
  for (let i = 0; i < grains; i++) {
    const k = i / (grains - 1);
    const center = 7200 * Math.pow(260 / 7200, k) * e.rng.jitter(0.15);
    const glen = 0.11 - 0.06 * k;
    const src = noise(e, 'white', gt, gt + glen + 0.04, 1.6 - 1.1 * k);
    const bp = filter(e.ctx, 'bandpass', center, 4 + 6 * k);
    const pan = e.ctx.createStereoPanner();
    pan.pan.setValueAtTime((i % 2 ? 1 : -1) * e.rng.range(0.2, 0.75) * (1 - k * 0.6), gt);
    const g = gain(e.ctx, 0);
    swell(g.gain, gt, 0.5 + 0.35 * k, glen, 0.012);
    chain(src, bp, g, pan, e.out);
    pan.connect(e.wet);
    gt += (len / grains) * (1.5 - k);
  }

  // 3) Reverse cymbal swell (the "inhale" of time).
  const sw = noise(e, 'pink', t, t + len + 0.05, 0.9);
  const hp = filter(e.ctx, 'highpass', 2500, 0.6);
  hp.frequency.exponentialRampToValueAtTime(700, t + len);
  const sg = gain(e.ctx, 0);
  swell(sg.gain, t, 0.28, len, 0.04);
  chain(sw, hp, sg, e.out);
  sg.connect(e.wet);

  // 4) Clock ticks running backwards, accelerating.
  let ct = t + 0.05;
  for (let i = 0; i < 7; i++) {
    burst(e, ct, 'bandpass', i % 2 ? 2600 : 3300, 9, 0.025, 0.22);
    ct += 0.17 * Math.pow(0.78, i) * scale;
  }

  // 5) Landing: sub drop + soft metallic ring when the present snaps back.
  thump(e, t + len - 0.02, 95, 32, 0.45, 0.55);
  ring(e, t + len - 0.02, 190, 1.4, 0.05, e.wet, 3);
  return len + 1.5;
}

function buildEchoBloom(e: VoiceEnv): number {
  const t = e.t;
  // Each echo gets its own transposition so the bloom itself identifies "Echo n".
  const idx = Math.max(0, Math.floor(e.p['echoIndex'] ?? 0));
  const trans = [0, 2, 5, 7, 9][idx % 5] ?? 0;
  const chord = [0, 7, 11, 14, 16, 19, 23]; // Dmaj9 / lydian spread
  const sum = gain(e.ctx, 1);
  // Tremolo shimmer on the whole chord.
  const trem = osc(e, 'sine', 6.2, t, t + 3.4);
  const tg = gain(e.ctx, 0.22);
  trem.connect(tg);
  tg.connect(sum.gain);
  sum.connect(e.out);
  sum.connect(e.wet);
  chord.forEach((iv, i) => {
    const f = midiToHz(D4 + trans + iv - 12 * (i === 0 ? 1 : 0));
    const st = t + i * 0.045;
    const peak = 0.07 / (1 + i * 0.15);
    tone(e, st, 'triangle', f, peak, 0.35, 0.6, 2.0, sum, -7);
    tone(e, st, 'triangle', f, peak, 0.35, 0.6, 2.0, sum, 7);
    tone(e, st + 0.02, 'sine', f * 2, peak * 0.35, 0.5, 0.3, 1.8, sum);
  });
  // Rising sparkles (pentatonic, two octaves up).
  const penta = [0, 2, 4, 7, 9];
  for (let i = 0; i < 9; i++) {
    const n = D4 + trans + 24 + (penta[e.rng.int(0, 4)] ?? 0) + (i > 5 ? 12 : 0);
    const st = t + 0.1 + i * 0.11 + e.rng.range(0, 0.05);
    const g = gain(e.ctx, 0);
    const o = osc(e, 'sine', midiToHz(n), st, st + 0.6);
    perc(g.gain, st, 0.035, 0.5, 0.004);
    chain(o, g, e.wet);
    g.connect(e.out);
  }
  // Soft airy swell underneath.
  const air = noise(e, 'pink', t, t + 2.2);
  const bp = filter(e.ctx, 'bandpass', 3200, 1.2);
  const ag = gain(e.ctx, 0);
  ahr(ag.gain, t, 0.06, 0.6, 0.2, 1.2);
  chain(air, bp, ag, e.wet);
  return 3.6;
}

function buildRecordStart(e: VoiceEnv): number {
  const t = e.t;
  // Tape-engage thump + click, then a gold rising fifth and a "ready" ping.
  thump(e, t, 160, 70, 0.12, 0.25);
  burst(e, t, 'highpass', 4000, 0.7, 0.02, 0.18);
  tone(e, t + 0.04, 'triangle', midiToHz(69), 0.09, 0.01, 0.07, 0.25);
  tone(e, t + 0.04, 'sine', midiToHz(81), 0.03, 0.01, 0.07, 0.2);
  tone(e, t + 0.14, 'triangle', midiToHz(76), 0.1, 0.01, 0.1, 0.5);
  tone(e, t + 0.14, 'sine', midiToHz(88), 0.03, 0.01, 0.06, 0.45);
  bell(e, t + 0.24, midiToHz(93), 0.6, 0.025, 3.5, 1.2, e.wet);
  return 1.0;
}

function buildRecordEnd(e: VoiceEnv): number {
  const t = e.t;
  // Mirror of record start: falling fifth, tape disengage.
  tone(e, t, 'triangle', midiToHz(76), 0.08, 0.005, 0.06, 0.18);
  tone(e, t + 0.08, 'triangle', midiToHz(69), 0.08, 0.005, 0.06, 0.3);
  burst(e, t + 0.08, 'bandpass', 1200, 1.2, 0.05, 0.14);
  return 0.6;
}

function buildTimeUp(e: VoiceEnv): number {
  const t = e.t;
  for (let i = 0; i < 3; i++) {
    tone(e, t + i * 0.16, 'square', midiToHz(76 - i * 3), 0.035, 0.005, 0.07, 0.06);
  }
  return buildRecordEnd({ ...e, t: t + 0.5 }) + 0.5;
}

function buildDivergence(e: VoiceEnv): number {
  const t = e.t;
  // Detuned glitch stutter: two clashing squares through a bit-crusher, chopped into irregular slices.
  const crush = e.ctx.createWaveShaper();
  crush.curve = crushCurve(5);
  const lp = filter(e.ctx, 'lowpass', 3600, 1.5);
  const gate = gain(e.ctx, 0);
  chain(crush, lp, gate, e.out);
  gate.connect(e.wet);
  const a = osc(e, 'square', 220, t, t + 0.8);
  const b = osc(e, 'square', 233.1, t, t + 0.8, 18);
  const sub = osc(e, 'sawtooth', 110, t, t + 0.8, -25);
  const mix = gain(e.ctx, 0.28);
  a.connect(mix);
  b.connect(mix);
  sub.connect(mix);
  mix.connect(crush);
  let st = t;
  for (let i = 0; i < 9; i++) {
    const on = e.rng.range(0.025, 0.06);
    const off = e.rng.range(0.012, 0.04);
    const j = e.rng.pick([1, 1, 1.5, 0.75, 2, 0.5]);
    a.frequency.setValueAtTime(220 * j, st);
    b.frequency.setValueAtTime(233.1 * j * e.rng.jitter(0.03), st);
    const peak = 0.5 * (1 - i / 11);
    gate.gain.setValueAtTime(0.0001, st);
    gate.gain.linearRampToValueAtTime(peak, st + 0.003);
    gate.gain.setValueAtTime(peak, st + on);
    gate.gain.linearRampToValueAtTime(0.0001, st + on + 0.004);
    st += on + off;
  }
  // Final detuned "error" fall.
  const f = tone(e, st, 'sawtooth', 330, 0.08, 0.005, 0.05, 0.3);
  f.frequency.exponentialRampToValueAtTime(90, st + 0.35);
  burst(e, t, 'highpass', 5000, 0.8, 0.04, 0.2);
  return st - t + 0.6;
}

function buildEchoFinished(e: VoiceEnv): number {
  const t = e.t;
  const o = tone(e, t, 'sine', 1318.5, 0.08, 0.01, 0.05, 0.45, e.wet);
  o.frequency.exponentialRampToValueAtTime(1244.5, t + 0.5);
  tone(e, t, 'sine', 1975.5, 0.03, 0.01, 0.03, 0.3);
  return 0.7;
}

function buildLoopDeleted(e: VoiceEnv): number {
  const t = e.t;
  // Digital dissolve: descending granular cloud of sine blips + crushed noise fade.
  for (let i = 0; i < 14; i++) {
    const st = t + i * 0.045 + e.rng.range(0, 0.02);
    const f = 2400 * Math.pow(0.84, i) * e.rng.jitter(0.12);
    const g = gain(e.ctx, 0);
    const o = osc(e, i % 3 ? 'sine' : 'square', f, st, st + 0.1);
    perc(g.gain, st, 0.1 * (1 - i / 16), 0.07, 0.002);
    const pan = e.ctx.createStereoPanner();
    pan.pan.setValueAtTime(e.rng.range(-0.6, 0.6), st);
    chain(o, g, pan, e.out);
  }
  burst(e, t, 'bandpass', 1400, 0.8, 0.7, 0.06, 'pink', e.wet);
  return 1.1;
}

function buildRestart(e: VoiceEnv): number {
  const len = buildRewind(e, 1.25);
  // Heavier: deep boom + chord collapse.
  thump(e, e.t + 1.4, 70, 26, 0.9, 0.6);
  burst(e, e.t + 1.4, 'lowpass', 300, 0.7, 0.8, 0.25, 'brown', e.wet);
  return len + 0.4;
}

function buildArrival(e: VoiceEnv): number {
  const t = e.t;
  // Chamber boot: sub swell, distant metallic resonance, soft gold harmonic.
  const sub = osc(e, 'sine', 36.7, t, t + 3.2);
  const g = gain(e.ctx, 0);
  ahr(g.gain, t, 0.35, 0.9, 0.4, 1.8);
  chain(sub, g, e.out);
  ring(e, t + 0.3, 110, 3.0, 0.05, e.wet, 5);
  tone(e, t + 0.6, 'triangle', midiToHz(D4 - 12), 0.05, 0.8, 0.2, 1.6, e.wet);
  tone(e, t + 0.6, 'triangle', midiToHz(D4 - 5), 0.04, 0.9, 0.2, 1.6, e.wet);
  return 3.4;
}

function buildEchoLimit(e: VoiceEnv): number {
  const t = e.t;
  tone(e, t, 'square', 155.6, 0.05, 0.005, 0.09, 0.05, e.out);
  tone(e, t, 'square', 164.8, 0.04, 0.005, 0.09, 0.05, e.out);
  tone(e, t + 0.16, 'square', 146.8, 0.05, 0.005, 0.14, 0.08, e.out);
  tone(e, t + 0.16, 'square', 155.6, 0.04, 0.005, 0.14, 0.08, e.out);
  return 0.5;
}

/* ------------------------------------------------------------------ actors / props ---------- */

function buildFootstep(e: VoiceEnv): number {
  const t = e.t;
  const echo = (e.p['echo'] ?? 0) > 0;
  const metal = (e.p['metal'] ?? 0) > 0;
  const foot = e.p['foot'] ?? 0;
  const dest = echo ? filter(e.ctx, 'lowpass', 2400, 0.6) : e.out;
  if (echo) dest.connect(e.out);
  const j = e.rng.jitter(0.08) * (foot ? 0.94 : 1);
  // Heel body.
  thump(e, t, 125 * j, 58, 0.07, echo ? 0.32 : 0.55, dest);
  // Sole scuff (varies per step).
  burst(e, t + 0.004, 'bandpass', 1700 * e.rng.jitter(0.25), 1.4, 0.045 * e.rng.jitter(0.3), echo ? 0.12 : 0.22, 'white', dest);
  // Toe tap shortly after the heel.
  burst(e, t + 0.035 + e.rng.range(0, 0.012), 'highpass', 3000, 0.7, 0.018, echo ? 0.05 : 0.09, 'white', dest);
  if (metal) ring(e, t, 620 * j, 0.22, echo ? 0.02 : 0.045, dest, 4);
  if (echo) shimmer(e, t, 0.012);
  return 0.32;
}

function buildPickup(e: VoiceEnv): number {
  const t = e.t;
  const item = e.p['cell'] ?? 0;
  if (item > 0) {
    // Energy cell: crystalline lift + charged hum flick.
    bell(e, t, 880, 0.5, 0.06, 1.5, 1.6);
    const s = tone(e, t, 'sine', 400, 0.05, 0.01, 0.08, 0.12);
    s.frequency.exponentialRampToValueAtTime(1600, t + 0.18);
    burst(e, t, 'highpass', 6000, 0.7, 0.08, 0.06, 'white', e.wet);
    return 0.7;
  }
  // Crate: magnetic clamp thunk, metal clank, short servo lift.
  thump(e, t, 150, 60, 0.1, 0.45);
  ring(e, t + 0.005, 330, 0.3, 0.05, e.out, 4);
  burst(e, t, 'bandpass', 900, 1.3, 0.06, 0.2);
  servo(e, t + 0.04, 140, 260, 0.18, 0.05);
  return 0.5;
}

function buildDrop(e: VoiceEnv): number {
  const t = e.t;
  if ((e.p['cell'] ?? 0) > 0) {
    tone(e, t, 'sine', 2400, 0.04, 0.002, 0.01, 0.2);
    tone(e, t, 'sine', 3610, 0.02, 0.002, 0.01, 0.15);
    thump(e, t, 300, 160, 0.05, 0.15);
    return 0.4;
  }
  // Crate: heavy thud, debris rattle, two small bounces.
  thump(e, t, 95, 38, 0.24, 0.75);
  burst(e, t, 'lowpass', 650, 0.8, 0.18, 0.35, 'brown');
  ring(e, t + 0.004, 240, 0.45, 0.06, e.out, 5);
  burst(e, t + 0.09, 'bandpass', 1300, 2, 0.035, 0.08);
  burst(e, t + 0.15, 'bandpass', 1500, 2, 0.025, 0.04);
  return 0.8;
}

function buildPlateDown(e: VoiceEnv): number {
  const t = e.t;
  thump(e, t, 140, 48, 0.13, 0.55);
  burst(e, t, 'bandpass', 950, 1.6, 0.05, 0.28);
  ring(e, t + 0.003, 420, 0.32, 0.04, e.out, 3);
  // Teal energize: soft rising hum flick.
  const h = tone(e, t + 0.05, 'sine', 110, 0.08, 0.04, 0.12, 0.3);
  h.frequency.exponentialRampToValueAtTime(220, t + 0.25);
  hiss(e, t + 0.02, 0.18, 0.03, 5000, 3000);
  return 0.6;
}

function buildPlateUp(e: VoiceEnv): number {
  const t = e.t;
  thump(e, t, 220, 120, 0.06, 0.25);
  burst(e, t, 'highpass', 2500, 0.8, 0.03, 0.12);
  const h = tone(e, t, 'sine', 220, 0.04, 0.01, 0.04, 0.2);
  h.frequency.exponentialRampToValueAtTime(100, t + 0.25);
  return 0.4;
}

function buildDoorOpen(e: VoiceEnv): number {
  const t = e.t;
  const dur = e.p['dur'] ?? 0.3;
  burst(e, t, 'bandpass', 700, 1.5, 0.05, 0.2); // unlatch
  servo(e, t + 0.02, 170, 420, dur + 0.1, 0.07);
  hiss(e, t + 0.03, dur + 0.25, 0.09);
  thump(e, t + dur + 0.08, 100, 55, 0.12, 0.3); // end stop
  ring(e, t + dur + 0.08, 280, 0.35, 0.03, e.out, 3);
  return dur + 0.6;
}

function buildDoorClose(e: VoiceEnv): number {
  const t = e.t;
  const dur = e.p['dur'] ?? 0.3;
  servo(e, t, 420, 160, dur + 0.05, 0.065);
  hiss(e, t, dur + 0.15, 0.07, 3500, 1500);
  // Heavy seal.
  thump(e, t + dur + 0.05, 75, 36, 0.28, 0.7);
  burst(e, t + dur + 0.05, 'lowpass', 500, 0.8, 0.2, 0.3, 'brown');
  ring(e, t + dur + 0.05, 190, 0.6, 0.04, e.wet, 4);
  return dur + 0.8;
}

function buildDoorBlocked(e: VoiceEnv): number {
  const t = e.t;
  const lp = filter(e.ctx, 'lowpass', 1400, 0.8);
  lp.connect(e.out);
  tone(e, t, 'square', 329.6, 0.05, 0.004, 0.08, 0.04, lp);
  tone(e, t + 0.15, 'square', 311.1, 0.05, 0.004, 0.1, 0.06, lp);
  return 0.45;
}

function buildSwitchOn(e: VoiceEnv): number {
  const t = e.t;
  burst(e, t, 'bandpass', 2600, 3, 0.012, 0.25);
  burst(e, t + 0.03, 'bandpass', 1900, 3, 0.015, 0.2);
  const b = tone(e, t + 0.03, 'triangle', 600, 0.07, 0.005, 0.05, 0.12);
  b.frequency.exponentialRampToValueAtTime(900, t + 0.12);
  tone(e, t + 0.05, 'sine', 120, 0.06, 0.03, 0.08, 0.2);
  return 0.4;
}

function buildSwitchTick(e: VoiceEnv): number {
  const t = e.t;
  const remaining = e.p['remaining'] ?? 9;
  const urgent = remaining <= 3;
  const tock = Math.round(remaining) % 2 === 0;
  const f = (tock ? 1500 : 1850) * (urgent ? 1.25 : 1);
  tone(e, t, 'sine', f, urgent ? 0.16 : 0.11, 0.001, 0.005, 0.05);
  burst(e, t, 'bandpass', f * 1.7, 6, 0.015, 0.3);
  if (urgent) tone(e, t + 0.09, 'sine', f * 1.5, 0.12, 0.001, 0.005, 0.05);
  return 0.25;
}

function buildSwitchOff(e: VoiceEnv): number {
  const t = e.t;
  const b = tone(e, t, 'triangle', 900, 0.06, 0.005, 0.05, 0.15);
  b.frequency.exponentialRampToValueAtTime(380, t + 0.18);
  thump(e, t + 0.04, 160, 80, 0.08, 0.25);
  burst(e, t + 0.04, 'bandpass', 1600, 2, 0.02, 0.15);
  return 0.4;
}

function buildCellInserted(e: VoiceEnv): number {
  const t = e.t;
  thump(e, t, 180, 70, 0.08, 0.4);
  burst(e, t, 'bandpass', 1500, 2, 0.03, 0.25);
  // Power-up sweep.
  const s = osc(e, 'sawtooth', 80, t + 0.05, t + 0.75);
  s.frequency.exponentialRampToValueAtTime(330, t + 0.65);
  const lp = filter(e.ctx, 'lowpass', 220, 4);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
  const g = gain(e.ctx, 0);
  ahr(g.gain, t + 0.05, 0.08, 0.35, 0.15, 0.2);
  chain(s, lp, g, e.out);
  // Teal confirmation chime.
  bell(e, t + 0.45, midiToHz(81), 0.8, 0.045, 2, 1.4);
  bell(e, t + 0.55, midiToHz(88), 0.9, 0.035, 2, 1.2, e.wet);
  return 1.6;
}

function buildCellRemoved(e: VoiceEnv): number {
  const t = e.t;
  burst(e, t, 'bandpass', 1300, 2, 0.03, 0.2);
  const s = osc(e, 'sawtooth', 330, t, t + 0.7);
  s.frequency.exponentialRampToValueAtTime(55, t + 0.6);
  const lp = filter(e.ctx, 'lowpass', 3000, 3);
  lp.frequency.exponentialRampToValueAtTime(150, t + 0.6);
  const g = gain(e.ctx, 0);
  ahr(g.gain, t, 0.08, 0.02, 0.2, 0.35);
  chain(s, lp, g, e.out);
  return 0.9;
}

function buildElevatorStart(e: VoiceEnv): number {
  const t = e.t;
  burst(e, t, 'bandpass', 600, 1.2, 0.06, 0.25); // brake release
  thump(e, t, 110, 50, 0.1, 0.3);
  const m = osc(e, 'sawtooth', 40, t, t + 0.8);
  m.frequency.exponentialRampToValueAtTime(110, t + 0.6);
  const lp = filter(e.ctx, 'lowpass', 300, 2);
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
  const g = gain(e.ctx, 0);
  ahr(g.gain, t, 0.12, 0.3, 0.2, 0.25);
  chain(m, lp, g, e.out);
  hiss(e, t, 0.3, 0.04, 4000, 2000);
  return 0.9;
}

function buildElevatorArrive(e: VoiceEnv): number {
  const t = e.t;
  hiss(e, t, 0.35, 0.06, 3000, 1200); // brake
  thump(e, t + 0.05, 90, 40, 0.2, 0.55);
  ring(e, t + 0.05, 230, 0.6, 0.04, e.wet, 4);
  tone(e, t + 0.25, 'sine', midiToHz(74), 0.03, 0.01, 0.08, 0.4); // arrival ding
  tone(e, t + 0.38, 'sine', midiToHz(79), 0.03, 0.01, 0.08, 0.5);
  return 1.0;
}

function buildPlatformDepart(e: VoiceEnv): number {
  const t = e.t;
  burst(e, t, 'bandpass', 900, 1.5, 0.03, 0.3);
  servo(e, t, 90, 160, 0.3, 0.1);
  return 0.5;
}

function buildPlatformArrive(e: VoiceEnv): number {
  const t = e.t;
  thump(e, t, 120, 60, 0.1, 0.3);
  burst(e, t, 'bandpass', 1100, 1.5, 0.03, 0.12);
  return 0.4;
}

function buildLaserOn(e: VoiceEnv): number {
  const t = e.t;
  const z = tone(e, t, 'sawtooth', 180, 0.05, 0.01, 0.08, 0.15);
  z.frequency.exponentialRampToValueAtTime(2400, t + 0.12);
  const s = tone(e, t, 'sine', 300, 0.06, 0.005, 0.1, 0.2);
  s.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
  burst(e, t, 'highpass', 5000, 0.7, 0.15, 0.1);
  return 0.45;
}

function buildLaserOff(e: VoiceEnv): number {
  const t = e.t;
  const z = tone(e, t, 'sawtooth', 1800, 0.08, 0.005, 0.05, 0.15);
  z.frequency.exponentialRampToValueAtTime(150, t + 0.2);
  return 0.35;
}

function buildReceiverLit(e: VoiceEnv): number {
  const t = e.t;
  [784, 1174.7, 1568].forEach((f, i) => tone(e, t + i * 0.05, 'sine', f, 0.045, 0.04, 0.1, 0.9, i === 2 ? e.wet : e.out));
  bell(e, t, 1568, 0.6, 0.02, 2.76, 1, e.wet);
  return 1.3;
}

function buildReceiverUnlit(e: VoiceEnv): number {
  const t = e.t;
  tone(e, t, 'sine', 1174.7, 0.035, 0.01, 0.05, 0.2);
  tone(e, t + 0.09, 'sine', 784, 0.035, 0.01, 0.05, 0.3);
  return 0.6;
}

function buildGate(e: VoiceEnv): number {
  const t = e.t;
  const open = (e.p['open'] ?? 1) > 0;
  // Violet temporal field: FM bell + vibrato chord + swell (reversed when closing).
  const base = open ? midiToHz(71) : midiToHz(66);
  bell(e, t + (open ? 0.12 : 0), base, 0.9, 0.04, 1.41, 2.5, e.wet);
  const vib = osc(e, 'sine', 5, t, t + 1.1);
  const vg = gain(e.ctx, 6);
  vib.connect(vg);
  [1, 1.26, 1.5].forEach((r) => {
    const o = tone(e, t, 'sine', base * r * (open ? 1 : 0.5), 0.03, open ? 0.25 : 0.02, 0.2, open ? 0.5 : 0.6);
    vg.connect(o.detune);
  });
  const n = noise(e, 'pink', t, t + 0.6);
  const bp = filter(e.ctx, 'bandpass', open ? 1500 : 3000, 3);
  bp.frequency.exponentialRampToValueAtTime(open ? 3500 : 900, t + 0.45);
  const g = gain(e.ctx, 0);
  if (open) swell(g.gain, t, 0.12, 0.4, 0.06);
  else perc(g.gain, t, 0.1, 0.45);
  chain(n, bp, g, e.out);
  return 1.2;
}

/**
 * Gate held open by an occupant (round 4): the doorBlocked "uh-uh" (two falling detuned squares) re-voiced in the
 * gate's violet temporal timbre — a wavering FM pair over a stuttering band of field noise — so it reads as the
 * same warning ("something is in the way, I can't close") but clearly belongs to the field, not a door.
 */
function buildGateBlocked(e: VoiceEnv): number {
  const t = e.t;
  const lp = filter(e.ctx, 'lowpass', 1800, 0.9);
  lp.connect(e.out);
  const vib = osc(e, 'sine', 9, t, t + 0.5);
  const vg = gain(e.ctx, 18);
  vib.connect(vg);
  const a = tone(e, t, 'square', midiToHz(64), 0.04, 0.004, 0.08, 0.05, lp);
  const b = tone(e, t + 0.15, 'square', midiToHz(63), 0.04, 0.004, 0.1, 0.07, lp);
  vg.connect(a.detune);
  vg.connect(b.detune);
  bell(e, t, midiToHz(76), 0.35, 0.018, 1.41, 1.6, e.wet);
  // stutter: three short bursts of field noise
  for (let k = 0; k < 3; k++) burst(e, t + k * 0.07, 'bandpass', 2600 - k * 400, 4, 0.03, 0.05, 'pink');
  return 0.5;
}

/**
 * Lift held mid-move (round 4): brake clamp + a strained, stalled motor (a low saw that sags instead of ramping
 * up) + a coral two-beep warning, matching the pulsing coral edge the renderer shows.
 */
function buildElevatorHeld(e: VoiceEnv): number {
  const t = e.t;
  burst(e, t, 'bandpass', 520, 1.4, 0.05, 0.22); // brake clamp
  thump(e, t, 95, 45, 0.08, 0.25);
  const m = osc(e, 'sawtooth', 70, t, t + 0.6);
  m.frequency.exponentialRampToValueAtTime(48, t + 0.5); // motor sags: stalled
  const lp = filter(e.ctx, 'lowpass', 420, 3);
  const g = gain(e.ctx, 0);
  ahr(g.gain, t, 0.12, 0.03, 0.3, 0.2);
  chain(m, lp, g, e.out);
  const warn = filter(e.ctx, 'lowpass', 2200, 0.7);
  warn.connect(e.out);
  tone(e, t + 0.12, 'square', 880, 0.035, 0.003, 0.06, 0.03, warn);
  tone(e, t + 0.27, 'square', 880, 0.035, 0.003, 0.06, 0.05, warn);
  return 0.65;
}

function buildPortalOn(e: VoiceEnv): number {
  const t = e.t;
  // Rising swell into a D-major-add9 chord with a sub foundation.
  const sum = gain(e.ctx, 1);
  sum.connect(e.out);
  sum.connect(e.wet);
  const lp = filter(e.ctx, 'lowpass', 300, 1.2);
  lp.frequency.exponentialRampToValueAtTime(4200, t + 1.2);
  lp.connect(sum);
  [50, 57, 62, 66, 69, 76].forEach((m, i) => {
    tone(e, t + i * 0.03, 'sawtooth', midiToHz(m), 0.03, 1.0, 0.4, 1.2, lp, -6);
    tone(e, t + i * 0.03, 'sawtooth', midiToHz(m), 0.03, 1.0, 0.4, 1.2, lp, 6);
  });
  tone(e, t, 'sine', midiToHz(38), 0.18, 1.0, 0.4, 1.2);
  const n = noise(e, 'pink', t, t + 1.3);
  const bp = filter(e.ctx, 'bandpass', 600, 2);
  bp.frequency.exponentialRampToValueAtTime(5000, t + 1.1);
  const g = gain(e.ctx, 0);
  swell(g.gain, t, 0.12, 1.1, 0.25);
  chain(n, bp, g, sum);
  bell(e, t + 1.1, midiToHz(86), 1.4, 0.04, 2, 1.5, e.wet);
  return 3.0;
}

function buildPortalOff(e: VoiceEnv): number {
  const t = e.t;
  const s = tone(e, t, 'sawtooth', midiToHz(62), 0.06, 0.02, 0.1, 0.6);
  s.frequency.exponentialRampToValueAtTime(midiToHz(38), t + 0.7);
  thump(e, t + 0.1, 80, 35, 0.3, 0.3);
  return 1.0;
}

function buildInteractFailed(e: VoiceEnv): number {
  const t = e.t;
  const echo = (e.p['echo'] ?? 0) > 0;
  const lp = filter(e.ctx, 'lowpass', echo ? 900 : 1300, 0.8);
  lp.connect(e.out);
  const pk = echo ? 0.03 : 0.055;
  tone(e, t, 'square', 196, pk, 0.004, 0.06, 0.04, lp);
  tone(e, t, 'square', 185, pk * 0.8, 0.004, 0.06, 0.04, lp);
  tone(e, t + 0.11, 'square', 174.6, pk, 0.004, 0.08, 0.06, lp);
  return 0.35;
}

function buildInteractUse(e: VoiceEnv): number {
  const t = e.t;
  burst(e, t, 'bandpass', 2200, 2.5, 0.015, 0.35);
  tone(e, t + 0.01, 'triangle', 1046.5, 0.07, 0.002, 0.02, 0.08);
  return 0.2;
}

/* ---- round 6 mechanics ---- */

/** Check valve pass: a mechanical clack (turnstile fin) with a small ratchet click. */
function buildValvePass(e: VoiceEnv): number {
  const t = e.t;
  thump(e, t, 220, 110, 0.06, 0.35);
  burst(e, t, 'bandpass', 2600, 3, 0.03, 0.25);
  burst(e, t + 0.05, 'bandpass', 3400, 4, 0.02, 0.15);
  return 0.2;
}

/** Check valve denial: a dull thud against the closed face plus a short rattle. */
function buildValveDenied(e: VoiceEnv): number {
  const t = e.t;
  thump(e, t, 90, 50, 0.16, 0.5);
  burst(e, t, 'lowpass', 500, 0.8, 0.1, 0.25, 'brown');
  for (let i = 0; i < 3; i++) burst(e, t + 0.04 + i * 0.035, 'bandpass', 1900, 5, 0.015, 0.08);
  return 0.3;
}

/** Reversible valve flip: a violet servo sweep. */
function buildValveFlip(e: VoiceEnv): number {
  servo(e, e.t, 180, 360, 0.4, 0.05);
  tone(e, e.t + 0.32, 'sine', midiToHz(83), 0.05, 0.01, 0.05, 0.3, e.wet);
  return 0.7;
}

/** Relay armed (an edge enters the conduit): a soft glassy tick. */
function buildRelayArm(e: VoiceEnv): number {
  tone(e, e.t, 'sine', 2093, 0.035, 0.002, 0.01, 0.08);
  burst(e, e.t, 'highpass', 6000, 0.7, 0.015, 0.05);
  return 0.15;
}

/** Relay output toggles: bright chime on rising, a soft falling pair on falling. */
function buildRelayEmit(e: VoiceEnv): number {
  const t = e.t;
  if ((e.p['rising'] ?? 1) > 0) {
    bell(e, t, midiToHz(86), 0.9, 0.045, 2, 1.4, e.wet);
    tone(e, t, 'triangle', midiToHz(74), 0.05, 0.005, 0.08, 0.35);
    return 1.0;
  }
  tone(e, t, 'sine', midiToHz(81), 0.035, 0.005, 0.05, 0.2);
  tone(e, t + 0.09, 'sine', midiToHz(74), 0.03, 0.005, 0.05, 0.25);
  return 0.45;
}

/** Paradox Glass shatter: a crack, then a shower of high glassy grains. */
function buildShatter(e: VoiceEnv): number {
  const t = e.t;
  burst(e, t, 'highpass', 2500, 0.7, 0.05, 0.45);
  thump(e, t, 300, 120, 0.05, 0.3);
  for (let i = 0; i < 9; i++) tone(e, t + 0.03 + i * 0.03 + e.rng.range(0, 0.02), 'sine', 2600 + e.rng.range(0, 2400), 0.03, 0.001, 0.005, 0.07, i % 3 === 0 ? e.wet : e.out);
  burst(e, t + 0.05, 'bandpass', 5200, 1.2, 0.35, 0.18, 'white', e.wet);
  return 0.8;
}

/** Attuned refusal ("wrong timeline"): a soft detuned two-note fall, gentler than a failure buzz. */
function buildAttunedFail(e: VoiceEnv): number {
  const t = e.t;
  const lp = filter(e.ctx, 'lowpass', 1800, 0.7);
  lp.connect(e.out);
  tone(e, t, 'triangle', midiToHz(76), 0.045, 0.01, 0.06, 0.18, lp);
  tone(e, t, 'triangle', midiToHz(76) * 1.012, 0.03, 0.01, 0.06, 0.18, lp);
  tone(e, t + 0.13, 'triangle', midiToHz(70), 0.045, 0.01, 0.08, 0.28, lp);
  return 0.5;
}

function buildEntityGeneric(e: VoiceEnv): number {
  tone(e, e.t, 'triangle', 880, 0.06, 0.005, 0.03, 0.12);
  return 0.2;
}

function buildFanfare(e: VoiceEnv): number {
  const t = e.t;
  // 1) Bell motif up the D major arpeggio.
  [74, 78, 81, 86].forEach((m, i) => bell(e, t + i * 0.12, midiToHz(m), 1.0, 0.05, 2, 1.3, i === 3 ? e.wet : e.out));
  // 2) Timpani-like hits.
  thump(e, t, 90, 45, 0.5, 0.5);
  thump(e, t + 0.55, 90, 45, 0.6, 0.6);
  // 3) Brass chord swell (filtered saw pairs): A/D → D.
  const brass = (st: number, notes: number[], dur: number, peak: number): void => {
    const lp = filter(e.ctx, 'lowpass', 400, 1.5);
    lp.frequency.setValueAtTime(400, st);
    lp.frequency.exponentialRampToValueAtTime(3000, st + 0.35);
    lp.frequency.exponentialRampToValueAtTime(1400, st + dur);
    lp.connect(e.out);
    lp.connect(e.wet);
    for (const m of notes) {
      tone(e, st, 'sawtooth', midiToHz(m), peak, 0.12, dur - 0.3, 0.9, lp, -5);
      tone(e, st, 'sawtooth', midiToHz(m), peak, 0.12, dur - 0.3, 0.9, lp, 5);
    }
  };
  brass(t + 0.05, [57, 64, 69, 73], 0.6, 0.022);
  brass(t + 0.55, [50, 57, 62, 66, 69, 76], 2.2, 0.024);
  // 4) Shimmer sparkles.
  for (let i = 0; i < 12; i++) {
    const st = t + 0.6 + i * 0.13 + e.rng.range(0, 0.05);
    const m = 86 + ([0, 2, 4, 7, 9, 12][e.rng.int(0, 5)] ?? 0);
    const g = gain(e.ctx, 0);
    const o = osc(e, 'sine', midiToHz(m), st, st + 0.5);
    perc(g.gain, st, 0.03, 0.4, 0.003);
    chain(o, g, e.wet);
    g.connect(e.out);
  }
  return 4.2;
}

/* ------------------------------------------------------------------ UI ---------------------- */

function buildUi(kind: string): (e: VoiceEnv) => number {
  return (e) => {
    const t = e.t;
    switch (kind) {
      case 'hover':
        tone(e, t, 'sine', 2350, 0.025, 0.002, 0.005, 0.035);
        return 0.08;
      case 'click':
        burst(e, t, 'bandpass', 3000, 3, 0.012, 0.15);
        tone(e, t, 'triangle', 1200, 0.04, 0.002, 0.01, 0.05);
        return 0.1;
      case 'confirm':
        tone(e, t, 'triangle', midiToHz(88), 0.05, 0.003, 0.04, 0.15);
        tone(e, t + 0.07, 'triangle', midiToHz(95), 0.05, 0.003, 0.05, 0.3);
        tone(e, t + 0.07, 'sine', midiToHz(107), 0.012, 0.003, 0.05, 0.25, e.wet);
        return 0.45;
      case 'back':
        tone(e, t, 'triangle', midiToHz(83), 0.04, 0.003, 0.03, 0.1);
        tone(e, t + 0.06, 'triangle', midiToHz(76), 0.04, 0.003, 0.04, 0.18);
        return 0.3;
      case 'toggle':
        burst(e, t, 'bandpass', 2400, 3, 0.01, 0.15);
        burst(e, t + 0.035, 'bandpass', 3200, 3, 0.01, 0.12);
        return 0.1;
      case 'error':
        tone(e, t, 'square', 220, 0.03, 0.003, 0.05, 0.04);
        tone(e, t + 0.09, 'square', 207.7, 0.03, 0.003, 0.07, 0.05);
        return 0.25;
      case 'open': {
        const n = noise(e, 'pink', t, t + 0.3);
        const bp = filter(e.ctx, 'bandpass', 500, 2);
        bp.frequency.exponentialRampToValueAtTime(3500, t + 0.22);
        const g = gain(e.ctx, 0);
        swell(g.gain, t, 0.08, 0.2, 0.06);
        chain(n, bp, g, e.out);
        bell(e, t + 0.18, midiToHz(93), 0.4, 0.02, 3, 1, e.wet);
        return 0.6;
      }
      case 'close': {
        const n = noise(e, 'pink', t, t + 0.25);
        const bp = filter(e.ctx, 'bandpass', 3000, 2);
        bp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
        const g = gain(e.ctx, 0);
        perc(g.gain, t, 0.14, 0.2);
        chain(n, bp, g, e.out);
        return 0.3;
      }
      case 'slider':
        tone(e, t, 'sine', 1600 + (e.p['value'] ?? 0.5) * 1200, 0.02, 0.001, 0.005, 0.03);
        return 0.06;
      case 'scrub':
        burst(e, t, 'bandpass', 4200, 5, 0.008, 0.06);
        return 0.04;
      default:
        return buildInteractUse(e);
    }
  };
}

/* ------------------------------------------------------------------ registry ---------------- */

export const RECIPES: Record<string, Recipe> = {
  rewind: { category: 'temporal', wet: 0.35, build: (e) => buildRewind(e) },
  rewindShort: { category: 'temporal', wet: 0.3, build: (e) => buildRewind(e, 0.7) },
  echoBloom: { category: 'temporal', wet: 0.6, build: buildEchoBloom },
  recordStart: { category: 'temporal', wet: 0.25, build: buildRecordStart },
  recordEnd: { category: 'temporal', wet: 0.2, build: buildRecordEnd },
  timeUp: { category: 'temporal', wet: 0.2, build: buildTimeUp },
  divergence: { category: 'temporal', wet: 0.3, build: buildDivergence },
  echoFinished: { category: 'temporal', wet: 0.5, build: buildEchoFinished },
  loopDeleted: { category: 'temporal', wet: 0.4, build: buildLoopDeleted },
  restart: { category: 'stinger', wet: 0.4, build: buildRestart },
  arrival: { category: 'stinger', wet: 0.5, build: buildArrival },
  echoLimit: { category: 'ui', wet: 0.1, build: buildEchoLimit },
  fanfare: { category: 'stinger', wet: 0.45, build: buildFanfare },

  footstep: { category: 'footstep', wet: 0.12, build: buildFootstep },
  pickup: { category: 'mechanical', wet: 0.18, build: buildPickup },
  drop: { category: 'mechanical', wet: 0.2, build: buildDrop },
  interactFailed: { category: 'mechanical', wet: 0.1, build: buildInteractFailed },
  interactUse: { category: 'mechanical', wet: 0.1, build: buildInteractUse },
  plateDown: { category: 'mechanical', wet: 0.2, build: buildPlateDown },
  plateUp: { category: 'mechanical', wet: 0.15, build: buildPlateUp },
  doorOpen: { category: 'mechanical', wet: 0.25, build: buildDoorOpen },
  doorClose: { category: 'mechanical', wet: 0.3, build: buildDoorClose },
  doorBlocked: { category: 'mechanical', wet: 0.1, build: buildDoorBlocked },
  switchOn: { category: 'mechanical', wet: 0.15, build: buildSwitchOn },
  switchTick: { category: 'mechanical', wet: 0.2, build: buildSwitchTick },
  switchOff: { category: 'mechanical', wet: 0.15, build: buildSwitchOff },
  cellInserted: { category: 'mechanical', wet: 0.3, build: buildCellInserted },
  cellRemoved: { category: 'mechanical', wet: 0.2, build: buildCellRemoved },
  elevatorStart: { category: 'mechanical', wet: 0.25, build: buildElevatorStart },
  elevatorArrive: { category: 'mechanical', wet: 0.3, build: buildElevatorArrive },
  platformDepart: { category: 'mechanical', wet: 0.2, build: buildPlatformDepart },
  platformArrive: { category: 'mechanical', wet: 0.2, build: buildPlatformArrive },
  laserOn: { category: 'mechanical', wet: 0.2, build: buildLaserOn },
  laserOff: { category: 'mechanical', wet: 0.15, build: buildLaserOff },
  receiverLit: { category: 'mechanical', wet: 0.35, build: buildReceiverLit },
  receiverUnlit: { category: 'mechanical', wet: 0.2, build: buildReceiverUnlit },
  gateOpen: { category: 'temporal', wet: 0.4, build: (e) => buildGate({ ...e, p: { ...e.p, open: 1 } }) },
  gateClose: { category: 'temporal', wet: 0.35, build: (e) => buildGate({ ...e, p: { ...e.p, open: 0 } }) },
  gateBlocked: { category: 'mechanical', wet: 0.2, build: buildGateBlocked },
  elevatorHeld: { category: 'mechanical', wet: 0.15, build: buildElevatorHeld },
  portalOn: { category: 'stinger', wet: 0.45, build: buildPortalOn },
  portalOff: { category: 'mechanical', wet: 0.3, build: buildPortalOff },
  entityGeneric: { category: 'mechanical', wet: 0.15, build: buildEntityGeneric },
  valvePass: { category: 'mechanical', wet: 0.15, build: buildValvePass },
  valveDenied: { category: 'mechanical', wet: 0.1, build: buildValveDenied },
  valveFlip: { category: 'temporal', wet: 0.3, build: buildValveFlip },
  relayArm: { category: 'mechanical', wet: 0.25, build: buildRelayArm },
  relayEmit: { category: 'mechanical', wet: 0.35, build: buildRelayEmit },
  shatter: { category: 'mechanical', wet: 0.3, build: buildShatter },
  attunedFail: { category: 'mechanical', wet: 0.2, build: buildAttunedFail },
};

for (const kind of ['hover', 'click', 'confirm', 'back', 'toggle', 'error', 'open', 'close', 'slider', 'scrub']) {
  RECIPES[`ui:${kind}`] = { category: 'ui', wet: kind === 'confirm' || kind === 'open' ? 0.2 : 0.05, build: buildUi(kind) };
}

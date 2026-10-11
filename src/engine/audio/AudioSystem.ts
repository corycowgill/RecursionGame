import type { SimEvent, SimView } from '../contracts';
import { Ambience } from './ambience';
import { LoopBank } from './loops';
import { listenerOf, mapEvents, priorityOf } from './mapping';
import { Mixer } from './mixer';
import { Music } from './music';
import { AudioRng } from './rng';
import { RECIPES } from './sfx';
import { NoiseBank, type VoiceEnv } from './synth';
import type { AudioStats, AudioSystem, AudioSystemOptions, AudioVolumes, Cue, MusicState, UiSoundKind, VoiceCategory } from './types';
import { VoiceManager } from './voices';

/** Scheduling latency added to "now" for one-shots (keeps attacks sample-accurate without audible lag). */
const LATENCY = 0.01;
/** Music / ambience lookahead window. */
const LOOKAHEAD = 0.6;
const CUE_LOG = 96;

interface Engine {
  ctx: BaseAudioContext;
  owned: boolean;
  mixer: Mixer;
  voices: VoiceManager;
  noise: NoiseBank;
  loops: LoopBank;
  ambience: Ambience;
  music: Music;
  /** Per-voice nodes to disconnect after the voice has finished. */
  garbage: { end: number; nodes: AudioNode[] }[];
  lastUpdate: number;
}

type AudioContextCtor = new () => AudioContext;

function defaultContext(): BaseAudioContext | null {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * Create the procedural audio system. It is inert until `unlock()` is called from a user gesture (browser
 * autoplay policy); events handled before that are ignored (no backlog burst on unlock).
 *
 * Wiring (app layer):
 * ```ts
 * const audio = createAudioSystem({ volumes: { master: s.masterVolume / 100, music: s.musicVolume / 100, sfx: s.sfxVolume / 100 } });
 * window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });
 * window.addEventListener('keydown', () => void audio.unlock(), { once: true });
 * // every frame, after stepping:
 * audio.handleEvents(game.drainEvents(), game.getState());
 * // menus: audio.setMusicState('menu'); ui callbacks: onUISound: (cue) => audio.playUi(cue)
 * ```
 */
export function createAudioSystem(opts: AudioSystemOptions = {}): AudioSystem {
  const seed = (opts.seed ?? 0x5ec0251) >>> 0;
  const rng = new AudioRng(seed);
  const autoMusic = opts.autoMusic ?? true;
  let engine: Engine | null = null;
  let volumes: Partial<AudioVolumes> = { ...opts.volumes };
  let musicState: MusicState = 'silent';
  let paused = false;
  let played = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  const cueLog: Cue[] = [];

  const ensureEngine = (): Engine | null => {
    if (engine || disposed) return engine;
    let ctx: BaseAudioContext | null = null;
    let owned = false;
    if (typeof opts.context === 'function') ctx = opts.context();
    else if (opts.context) ctx = opts.context;
    else {
      ctx = defaultContext();
      owned = true;
    }
    if (!ctx) return null;
    const mixer = new Mixer(ctx, seed);
    mixer.setVolumes(volumes);
    const noise = new NoiseBank(ctx, seed);
    engine = {
      ctx,
      owned,
      mixer,
      voices: new VoiceManager(),
      noise,
      loops: new LoopBank(ctx, mixer.bus('mechanical'), mixer.reverbSend, noise),
      ambience: new Ambience(ctx, mixer.bus('ambient'), mixer.reverbSend, noise, rng),
      music: new Music(ctx, mixer.bus('music'), mixer.reverbSend, rng),
      garbage: [],
      lastUpdate: ctx.currentTime,
    };
    return engine;
  };

  const applyMusic = (s: MusicState): void => {
    musicState = s;
    const e = engine;
    if (!e) return;
    e.music.setState(s);
    // The facility drone sits back in the menu and swells in the chamber.
    const amb = e.mixer.bus('ambient');
    const t = e.ctx.currentTime;
    amb.gain.cancelScheduledValues(t);
    amb.gain.setValueAtTime(amb.gain.value, t);
    amb.gain.setTargetAtTime(s === 'menu' ? 0.4 : s === 'silent' ? 0 : 0.75, t, 0.8);
  };

  const play = (cue: Cue, at?: number): boolean => {
    const e = engine;
    if (!e) return false;
    const recipe = RECIPES[cue.sound];
    if (!recipe) return false;
    const now = e.ctx.currentTime;
    const t = Math.max(now, at ?? now + LATENCY) + cue.delay;
    const category: VoiceCategory = cue.category;
    const priority = priorityOf(cue);
    const adm = e.voices.admit(category, priority, t, cue.key, now);
    if (!adm.allow) return false;

    const ctx = e.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(Math.max(0, cue.gain), now);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.max(-1, Math.min(1, cue.pan)), now);
    out.connect(pan);
    pan.connect(e.mixer.bus(category));
    const wet = ctx.createGain();
    wet.gain.setValueAtTime(recipe.wet * Math.max(0, cue.gain), now);
    wet.connect(e.mixer.reverbSend);

    const sources: AudioScheduledSourceNode[] = [];
    const env: VoiceEnv = {
      ctx,
      out,
      wet,
      t,
      rng,
      p: cue.params,
      noise: e.noise,
      track: (src) => {
        sources.push(src);
        return src;
      },
    };
    let dur = 0.5;
    try {
      dur = recipe.build(env);
    } catch {
      dur = 0.1;
    }
    const end = t + dur;
    e.voices.register(
      {
        category,
        priority,
        start: t,
        end,
        key: cue.key,
        kill: (k: number) => {
          out.gain.cancelScheduledValues(k);
          out.gain.setValueAtTime(out.gain.value, k);
          out.gain.linearRampToValueAtTime(0, k + 0.03);
          wet.gain.cancelScheduledValues(k);
          wet.gain.setValueAtTime(wet.gain.value, k);
          wet.gain.linearRampToValueAtTime(0, k + 0.03);
          for (const s of sources) {
            try {
              s.stop(k + 0.05);
            } catch {
              /* not started / already stopped */
            }
          }
        },
      },
      now,
      adm.steal,
    );
    e.garbage.push({ end: end + 0.5, nodes: [pan, wet] });
    played++;
    cueLog.push(cue);
    if (cueLog.length > CUE_LOG) cueLog.splice(0, cueLog.length - CUE_LOG);
    return true;
  };

  const update = (): void => {
    const e = engine;
    if (!e) return;
    const now = e.ctx.currentTime;
    if (now - e.lastUpdate > 1) {
      e.ambience.resync(now);
      e.music.resync(now);
    }
    e.lastUpdate = now;
    const horizon = now + LOOKAHEAD;
    e.ambience.schedule(horizon);
    e.music.schedule(horizon);
    if (e.garbage.length) {
      const keep: Engine['garbage'] = [];
      for (const g of e.garbage) {
        if (g.end > now) keep.push(g);
        else
          for (const n of g.nodes) {
            try {
              n.disconnect();
            } catch {
              /* ignore */
            }
          }
      }
      e.garbage = keep;
    }
    e.voices.prune(now);
  };

  const tapeSweep = (e: Engine, delay: number): void => {
    const f = e.mixer.musicFilter.frequency;
    const t = e.ctx.currentTime + delay;
    const base = paused ? 700 : 18000;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(200, f.value), t);
    f.setTargetAtTime(380, t, 0.1);
    f.setTargetAtTime(base, t + 1.0, 0.35);
  };

  const system: AudioSystem = {
    async unlock() {
      const e = ensureEngine();
      if (!e) return;
      const ac = e.ctx as Partial<AudioContext>;
      if (ac.state === 'suspended' && typeof ac.resume === 'function') {
        try {
          await ac.resume();
        } catch {
          /* resume can reject outside a gesture; the next gesture will retry */
        }
      }
      e.ambience.start();
      applyMusic(musicState);
      if ((opts.scheduler ?? 'interval') === 'interval' && timer === null && typeof setInterval === 'function') {
        timer = setInterval(update, 100);
      }
      update();
    },

    handleEvents(events: readonly SimEvent[], state: SimView) {
      if (disposed) return;
      // Automatic music phases (also tracked before unlock so the right state plays once audio starts).
      if (autoMusic && events.length) {
        let target: MusicState | null = null;
        const echoes = state.actors.reduce((n, a) => n + (a.kind === 'echo' ? 1 : 0), 0);
        for (const ev of events) {
          if (ev.type === 'levelLoaded' || ev.type === 'chamberRestart') target = 'explore';
          else if (ev.type === 'echoSpawned') target = 'solving';
          else if (ev.type === 'loopDeleted') target = echoes > 0 ? 'solving' : 'explore';
          else if (ev.type === 'levelComplete') target = 'complete';
        }
        const sticky = musicState === 'complete' || musicState === 'menu';
        const leavesSticky = events.some((ev) => ev.type === 'levelLoaded' || ev.type === 'chamberRestart');
        if (target && target !== musicState && (!sticky || leavesSticky || target === 'complete')) applyMusic(target);
        engine?.music.setIntensity(echoes);
      }
      const e = engine;
      if (!e) return; // not unlocked yet: no backlog
      if (events.length) {
        const now = e.ctx.currentTime + LATENCY;
        for (const c of mapEvents(events, state)) {
          play(c, now);
          if (c.sound === 'rewind' || c.sound === 'rewindShort' || c.sound === 'restart') tapeSweep(e, c.delay);
        }
      }
      e.loops.sync(state, listenerOf(state));
    },

    setMusicState(s: MusicState) {
      if (s === musicState) return;
      applyMusic(s);
    },

    setVolumes(v: Partial<AudioVolumes>) {
      volumes = { ...volumes, ...v };
      engine?.mixer.setVolumes(v);
    },

    setPaused(p: boolean) {
      paused = p;
      const e = engine;
      if (!e) return;
      e.loops.setDucked(p);
      const f = e.mixer.musicFilter.frequency;
      const t = e.ctx.currentTime;
      f.cancelScheduledValues(t);
      f.setValueAtTime(f.value, t);
      f.setTargetAtTime(p ? 700 : 18000, t, 0.25);
    },

    setBackgrounded(hidden: boolean) {
      const e = engine;
      if (!e) return;
      const ac = e.ctx as Partial<AudioContext>;
      try {
        if (hidden && ac.state === 'running' && typeof ac.suspend === 'function') void ac.suspend().catch(() => undefined);
        else if (!hidden && ac.state === 'suspended' && typeof ac.resume === 'function') void ac.resume().catch(() => undefined);
      } catch {
        /* a closed or exotic context: nothing to do */
      }
    },

    playUi(kind: UiSoundKind) {
      const name = `ui:${kind}`;
      if (!RECIPES[name]) return;
      play({ sound: name, category: 'ui', pan: 0, gain: 1, delay: 0, params: {}, key: name });
    },

    update,

    stats(): AudioStats {
      const e = engine;
      const cats: VoiceCategory[] = ['footstep', 'mechanical', 'temporal', 'ui', 'stinger', 'ambient', 'music'];
      const activeByCategory = {} as Record<VoiceCategory, number>;
      if (e) e.voices.prune(e.ctx.currentTime);
      for (const c of cats) activeByCategory[c] = e ? e.voices.count(c) : 0;
      return {
        activeVoices: e ? e.voices.count() : 0,
        activeByCategory,
        activeLoops: e ? e.loops.size : 0,
        played,
        dropped: e ? e.voices.dropped : 0,
        musicState,
        unlocked: !!e,
      };
    },

    recentCues() {
      return cueLog;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
      const e = engine;
      if (!e) return;
      const now = e.ctx.currentTime;
      e.voices.killAll(now);
      e.loops.stopAll();
      e.ambience.dispose();
      e.music.dispose();
      e.mixer.dispose();
      const ac = e.ctx as Partial<AudioContext>;
      if (e.owned && typeof ac.close === 'function') void ac.close().catch(() => undefined);
      engine = null;
    },
  };
  return system;
}

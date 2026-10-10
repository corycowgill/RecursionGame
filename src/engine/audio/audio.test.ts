import { describe, expect, it } from 'vitest';
import type { ActorState, AnySimEntity, SimEvent, SimView } from '../contracts';
import { TemporalGame } from '../temporal/TemporalGame';
import { createDefaultRegistry } from '../../gameplay/entities';
import { TEST_LEVELS } from '../../levels/definitions';
import { compileSolution } from '../../testing/harness/harness';
import { createAudioSystem } from './AudioSystem';
import { ECHO_STEP_GAIN, SEQ, mapEvents, spatial } from './mapping';
import { LAYER_MIX, MUSIC_LAYERS } from './music';
import { AudioRng } from './rng';
import { RECIPES } from './sfx';
import { NoiseBank, type VoiceEnv } from './synth';
import { BURST_LIMIT, VOICE_LIMITS, VoiceManager } from './voices';
import { MockAudioContext, MockAudioParam, MockGainNode, type MockScheduledSource } from './testing/mockAudioContext';

/* ------------------------------------------------------------------ fixtures ----------------- */

function actor(id: string, x: number, z: number, echoIndex = -1): ActorState {
  const echo = id !== 'player';
  return {
    id: id as ActorState['id'],
    kind: echo ? 'echo' : 'player',
    echoIndex,
    loopId: echo ? Number(id.split(':')[1]) : null,
    x,
    y: 0,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 0,
    heading: 0,
    moving: false,
    carrying: null,
    strideUnits: 0,
    foot: 0,
    finished: false,
    divergedAtTick: null,
    divergenceCount: 0,
    lastInteraction: null,
    interactHeld: false,
  };
}

function view(actors: ActorState[], entities: AnySimEntity[] = []): SimView {
  const ents: Record<string, AnySimEntity> = {};
  for (const e of entities) ents[e.id] = e;
  return { tick: 10, status: 'playing', completedAtTick: null, rng: 1, actors, entities: ents, signals: {} } as SimView;
}

const PLAYER_AT_ORIGIN = view([actor('player', 5000, 5000)]);

function step(actorId: string, x: number, tick = 10, foot: 0 | 1 = 0): SimEvent {
  return { type: 'footstep', tick, actorId: actorId as 'player', x, y: 0, z: 5000, foot };
}

function laser(id: string, on: boolean, x = 6000): AnySimEntity {
  return { id, kind: 'laserEmitter', x, y: 0, z: 5000, carriedBy: null, state: { on, beamLength: 0, hitEntityId: null, hitActorId: null } };
}

function unlockedSystem(): { ctx: MockAudioContext; audio: ReturnType<typeof createAudioSystem> } {
  const ctx = new MockAudioContext();
  const audio = createAudioSystem({ context: ctx.asContext(), scheduler: 'manual', autoMusic: true });
  return { ctx, audio };
}

/* ------------------------------------------------------------------ mapping ------------------ */

describe('event → cue mapping', () => {
  it('player footsteps are full volume; echo footsteps are softer, flagged and panned by x', () => {
    const cues = mapEvents([step('player', 5000), step('echo:1', 9000), step('echo:2', 1000)], PLAYER_AT_ORIGIN);
    expect(cues.map((c) => c.sound)).toEqual(['footstep', 'footstep', 'footstep']);
    const [p, right, left] = cues;
    expect(p?.actor).toBe('player');
    expect(p?.params['echo']).toBe(0);
    expect(p?.pan).toBeCloseTo(0);
    expect(right?.actor).toBe('echo');
    expect(right?.params['echo']).toBe(1);
    expect(right?.gain).toBeLessThanOrEqual(ECHO_STEP_GAIN);
    expect(right?.pan).toBeGreaterThan(0.3);
    expect(left?.pan).toBeLessThan(-0.3);
  });

  it('spatialisation is bounded and attenuates with distance', () => {
    const near = spatial(5000, 5000, { x: 5000, z: 5000 });
    const far = spatial(40000, 40000, { x: 5000, z: 5000 });
    expect(near).toEqual({ pan: 0, gain: 1 });
    expect(far.pan).toBeLessThanOrEqual(0.85);
    expect(far.gain).toBeLessThan(0.5);
    expect(far.gain).toBeGreaterThan(0.2);
  });

  it('commit batch is sequenced: record end → rewind → echo bloom → record start', () => {
    const events: SimEvent[] = [
      { type: 'rewind', tick: 300, fromTick: 300, loopCount: 1 },
      { type: 'echoSpawned', tick: 0, actorId: 'echo:1', loopId: 1, echoIndex: 0 },
      { type: 'recordStart', tick: 0, loopCount: 1 },
    ];
    const cues = mapEvents(events, PLAYER_AT_ORIGIN);
    expect(cues.map((c) => c.sound)).toEqual(['recordEnd', 'rewind', 'echoBloom', 'recordStart']);
    const delays = cues.map((c) => c.delay);
    expect(delays).toEqual([0, SEQ.rewind, SEQ.echoBloom, SEQ.recordStartAfterRewind]);
    expect(cues[2]?.params['echoIndex']).toBe(0);
    expect(cues.every((c) => c.category === 'temporal')).toBe(true);
  });

  it('resetLoop (rewind without a new echo) uses the short rewind and no bloom', () => {
    const cues = mapEvents(
      [
        { type: 'rewind', tick: 120, fromTick: 120, loopCount: 0 },
        { type: 'recordStart', tick: 0, loopCount: 0 },
      ],
      PLAYER_AT_ORIGIN,
    );
    expect(cues.map((c) => c.sound)).toEqual(['rewindShort', 'recordStart']);
  });

  it('maps every SimEvent type, and every cue names an existing recipe', () => {
    const e = 'x';
    const all: SimEvent[] = [
      step('player', 5000),
      { type: 'pickup', tick: 1, actorId: 'player', entityId: e, entityKind: 'crate' },
      { type: 'drop', tick: 1, actorId: 'echo:1', entityId: e, entityKind: 'energyCell' },
      { type: 'interact', tick: 1, actorId: 'player', entityId: e, entityKind: 'elevator', kind: 'use' },
      { type: 'interactFailed', tick: 1, actorId: 'player', entityId: null, reason: 'blocked' },
      {
        type: 'divergence',
        tick: 1,
        actorId: 'echo:1',
        loopId: 1,
        echoIndex: 0,
        expected: { tick: 1, verb: 'interact', kind: 'pickup', entityId: e },
        actual: { tick: 1, verb: 'interact', kind: 'fail', entityId: e },
      },
      { type: 'echoFinished', tick: 1, actorId: 'echo:1', loopId: 1, echoIndex: 0 },
      { type: 'plateDown', tick: 1, entityId: e },
      { type: 'plateUp', tick: 1, entityId: e },
      { type: 'doorOpen', tick: 1, entityId: e },
      { type: 'doorClose', tick: 1, entityId: e },
      { type: 'doorBlocked', tick: 1, entityId: e },
      { type: 'switchOn', tick: 1, entityId: e, actorId: 'player' },
      { type: 'switchOff', tick: 1, entityId: e },
      { type: 'switchTick', tick: 1, entityId: e, remainingTicks: 120 },
      { type: 'cellInserted', tick: 1, entityId: e, cellId: 'c', actorId: 'player' },
      { type: 'cellRemoved', tick: 1, entityId: e, cellId: 'c', actorId: null },
      { type: 'elevatorStart', tick: 1, entityId: e, fromY: 0, toY: 1000 },
      { type: 'elevatorArrive', tick: 1, entityId: e, y: 1000 },
      { type: 'laserOn', tick: 1, entityId: e },
      { type: 'laserOff', tick: 1, entityId: e },
      { type: 'receiverLit', tick: 1, entityId: e },
      { type: 'receiverUnlit', tick: 1, entityId: e },
      { type: 'gateOpen', tick: 1, entityId: e },
      { type: 'gateClose', tick: 1, entityId: e },
      { type: 'platformDepart', tick: 1, entityId: e },
      { type: 'platformArrive', tick: 1, entityId: e },
      { type: 'portalActivated', tick: 1, entityId: e },
      { type: 'portalDeactivated', tick: 1, entityId: e },
      { type: 'entity', tick: 1, name: 'custom', entityId: e },
      { type: 'levelLoaded', tick: 0, levelId: 'L' },
      { type: 'echoLimitReached', tick: 1, maxEchoes: 2 },
      { type: 'loopDeleted', tick: 0, loopId: 1, echoIndex: 0 },
      { type: 'chamberRestart', tick: 0 },
      { type: 'loopTimeUp', tick: 1, maxTicks: 100 },
      { type: 'levelComplete', tick: 1, levelId: 'L', echoesUsed: 1, ticks: 100 },
    ];
    const cues = mapEvents(all, PLAYER_AT_ORIGIN);
    for (const c of cues) expect(RECIPES[c.sound], c.sound).toBeDefined();
    const names = new Set(cues.map((c) => c.sound));
    for (const expected of [
      'footstep', 'pickup', 'drop', 'interactUse', 'interactFailed', 'divergence', 'echoFinished', 'plateDown',
      'plateUp', 'doorOpen', 'doorClose', 'doorBlocked', 'switchOn', 'switchOff', 'switchTick', 'cellInserted',
      'cellRemoved', 'elevatorStart', 'elevatorArrive', 'laserOn', 'laserOff', 'receiverLit', 'receiverUnlit',
      'gateOpen', 'gateClose', 'platformDepart', 'platformArrive', 'portalOn', 'portalOff', 'entityGeneric',
      'arrival', 'echoLimit', 'loopDeleted', 'restart', 'timeUp', 'fanfare',
    ]) {
      expect(names.has(expected), expected).toBe(true);
    }
    // Cell pickups/drops use the crystalline variant.
    expect(cues.find((c) => c.sound === 'drop')?.params['cell']).toBe(1);
    expect(cues.find((c) => c.sound === 'pickup')?.params['cell']).toBe(0);
  });

  it('interact events for pickup/insert do not double up with their dedicated events', () => {
    const cues = mapEvents(
      [{ type: 'interact', tick: 1, actorId: 'player', entityId: 's', entityKind: 'energySocket', kind: 'insert' }],
      PLAYER_AT_ORIGIN,
    );
    expect(cues).toEqual([]);
  });

  it('spreads multi-tick batches by tick offset (capped)', () => {
    const cues = mapEvents([step('player', 5000, 10), step('player', 5000, 13)], PLAYER_AT_ORIGIN);
    expect(cues[0]?.delay).toBe(0);
    expect(cues[1]?.delay).toBeCloseTo(3 / 60);
  });
});

/* ------------------------------------------------------------------ recipes ------------------ */

describe('synthesis recipes', () => {
  it('every recipe builds a finite, self-terminating graph', () => {
    for (const [name, recipe] of Object.entries(RECIPES)) {
      const ctx = new MockAudioContext();
      const c = ctx.asContext();
      const sources: MockScheduledSource[] = [];
      const env: VoiceEnv = {
        ctx: c,
        out: ctx.createGain() as unknown as AudioNode,
        wet: ctx.createGain() as unknown as AudioNode,
        t: 0.5,
        rng: new AudioRng(7),
        p: { echoIndex: 3, echo: 1, foot: 1, metal: 1, cell: 1, remaining: 2, dur: 0.3, value: 0.5 },
        noise: new NoiseBank(c, 1),
        track: (s) => {
          sources.push(s as unknown as MockScheduledSource);
          return s;
        },
      };
      const dur = recipe.build(env);
      expect(dur, name).toBeGreaterThan(0);
      expect(dur, name).toBeLessThan(8);
      expect(ctx.started.length, `${name} starts sources`).toBeGreaterThan(0);
      for (const s of ctx.started) {
        expect(s.stopTime, `${name}: ${s.nodeType} must be stopped`).not.toBeNull();
        expect(s.stopTime as number, name).toBeLessThanOrEqual(0.5 + dur + 0.1);
        expect(s.startTime as number, name).toBeGreaterThanOrEqual(0.5 - 1e-9);
      }
      // Every started source was tracked (so the voice can be stolen cleanly).
      expect(sources.length, name).toBe(ctx.started.length);
    }
  });

  it('the rewind is a reverse-swept granular cloud with a pitch dive', () => {
    const { ctx, audio } = unlockedSystem();
    return audio.unlock().then(() => {
      const before = ctx.count('bufferSource');
      audio.handleEvents([{ type: 'rewind', tick: 100, fromTick: 100, loopCount: 0 }], PLAYER_AT_ORIGIN);
      // ≥ 18 grains + swell + ticks.
      expect(ctx.count('bufferSource') - before).toBeGreaterThan(18);
      const dive = ctx.created.find(
        (n) => n.nodeType === 'oscillator' && (n as unknown as { type: string }).type === 'sawtooth',
      ) as unknown as { frequency: MockAudioParam } | undefined;
      expect(dive).toBeDefined();
      const exp = dive?.frequency.events.find((e) => e.type === 'exp');
      expect(exp && exp.value).toBeLessThan(100);
    });
  });
});

/* ------------------------------------------------------------------ voice limiting ----------- */

describe('voice limiting', () => {
  it('a crowd of echoes stepping on the same tick is capped by the burst limit', async () => {
    const { audio } = unlockedSystem();
    await audio.unlock();
    const events: SimEvent[] = [];
    for (let i = 1; i <= 20; i++) events.push(step(`echo:${i}`, 5000 + i * 100));
    audio.handleEvents(events, PLAYER_AT_ORIGIN);
    const s = audio.stats();
    expect(s.activeByCategory.footstep).toBe(BURST_LIMIT.footstep);
    expect(s.dropped).toBe(20 - (BURST_LIMIT.footstep ?? 0));
  });

  it('the live player footstep always gets through a crowd (steals an echo voice)', async () => {
    const { audio } = unlockedSystem();
    await audio.unlock();
    const events: SimEvent[] = [];
    for (let i = 1; i <= 8; i++) events.push(step(`echo:${i}`, 5000));
    events.push(step('player', 5000));
    audio.handleEvents(events, PLAYER_AT_ORIGIN);
    const steps = audio.recentCues().filter((c) => c.sound === 'footstep');
    expect(steps.some((c) => c.actor === 'player')).toBe(true);
    expect(audio.stats().activeByCategory.footstep).toBeLessThanOrEqual(BURST_LIMIT.footstep ?? 0);
  });

  it('category polyphony is enforced across overlapping (non-burst) footsteps', async () => {
    const { ctx, audio } = unlockedSystem();
    await audio.unlock();
    for (let i = 0; i < 30; i++) {
      audio.handleEvents([step(`echo:${(i % 5) + 1}`, 5000, 10 + i)], PLAYER_AT_ORIGIN);
      ctx.advance(0.051); // just outside the burst window, but voices last ~0.3 s
    }
    expect(audio.stats().activeByCategory.footstep).toBeLessThanOrEqual(VOICE_LIMITS.footstep);
  });

  it('stolen voices fade out instead of clicking', () => {
    const vm = new VoiceManager();
    const kills: number[] = [];
    for (let i = 0; i < VOICE_LIMITS.temporal; i++) {
      const a = vm.admit('temporal', 3, i, undefined, 0);
      expect(a.allow).toBe(true);
      if (a.allow) vm.register({ category: 'temporal', priority: 3, start: i, end: 100, key: undefined, kill: (t) => kills.push(t) }, 0, a.steal);
    }
    const a = vm.admit('temporal', 3, 50, undefined, 0);
    expect(a.allow).toBe(true);
    if (a.allow) {
      expect(a.steal).toHaveLength(1);
      expect(a.steal[0]?.start).toBe(0); // oldest
      vm.register({ category: 'temporal', priority: 3, start: 50, end: 100, key: undefined, kill: () => undefined }, 0, a.steal);
    }
    expect(kills).toEqual([0]);
    expect(vm.count('temporal')).toBe(VOICE_LIMITS.temporal);
  });

  it('a lower-priority sound cannot steal from a full category of higher-priority voices', () => {
    const vm = new VoiceManager();
    for (let i = 0; i < VOICE_LIMITS.footstep; i++) {
      const a = vm.admit('footstep', 2, i * 0.2, undefined, 0);
      if (a.allow) vm.register({ category: 'footstep', priority: 2, start: i * 0.2, end: 100, key: undefined, kill: () => undefined }, 0, a.steal);
    }
    const a = vm.admit('footstep', 1, 5, undefined, 0);
    expect(a).toEqual({ allow: false, reason: 'category' });
  });

  it('identical keyed cues inside the dedupe window collapse', async () => {
    const { audio } = unlockedSystem();
    await audio.unlock();
    audio.handleEvents(
      [
        { type: 'plateDown', tick: 5, entityId: 'p' },
        { type: 'plateDown', tick: 5, entityId: 'p' },
      ],
      PLAYER_AT_ORIGIN,
    );
    expect(audio.recentCues().filter((c) => c.sound === 'plateDown')).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ system ------------------- */

describe('audio system lifecycle', () => {
  it('is inert before unlock (autoplay policy) and resumes the context on unlock', async () => {
    const ctx = new MockAudioContext();
    const audio = createAudioSystem({ context: () => ctx.asContext(), scheduler: 'manual' });
    audio.handleEvents([step('player', 5000)], PLAYER_AT_ORIGIN);
    audio.playUi('click');
    expect(ctx.created.length).toBe(1); // only the destination node
    expect(audio.stats().unlocked).toBe(false);
    await audio.unlock();
    expect(ctx.resumeCalls).toBe(1);
    expect(audio.stats().unlocked).toBe(true);
    await audio.unlock(); // idempotent
    expect(ctx.resumeCalls).toBe(1);
  });

  it('master chain ends in compressor → limiter → soft clip → destination', async () => {
    const { ctx, audio } = unlockedSystem();
    await audio.unlock();
    const clip = ctx.created.find((n) => n.nodeType === 'waveshaper' && n.outputs.includes(ctx.destination));
    expect(clip).toBeDefined();
    const comps = ctx.created.filter((n) => n.nodeType === 'compressor') as unknown as { threshold: MockAudioParam; ratio: MockAudioParam; outputs: unknown[] }[];
    expect(comps).toHaveLength(2);
    expect(comps[1]?.ratio.value).toBeGreaterThanOrEqual(20); // limiter
    expect(comps[0]?.outputs).toContain(comps[1]);
    expect(ctx.count('convolver')).toBe(1);
  });

  it('respects volume settings with a perceptual curve and clamps out-of-range values', async () => {
    const { ctx, audio } = unlockedSystem();
    await audio.unlock();
    audio.setVolumes({ master: 0.5, music: 2, sfx: -1 });
    const gains = ctx.created.filter((n) => n.nodeType === 'gain') as unknown as MockGainNode[];
    const targets = gains.map((g) => g.gain.events.filter((e) => e.type === 'target').pop()?.value);
    expect(targets).toContain(0.25 * 0.9); // master 0.5² × headroom
    expect(targets).toContain(0.6); // music clamped to 1 → 1² × 0.6
    expect(targets).toContain(0); // sfx clamped to 0
  });

  it('ambience and music are scheduled ahead by update()', async () => {
    const { ctx, audio } = unlockedSystem();
    audio.setMusicState('explore');
    await audio.unlock();
    const startCount = ctx.started.length;
    for (let i = 0; i < 40; i++) {
      ctx.advance(0.1);
      audio.update();
    }
    // 4 s of audio: clock ticks + pistons + pad/bass/bells notes.
    expect(ctx.started.length - startCount).toBeGreaterThan(15);
    const late = ctx.started.filter((s) => (s.startTime ?? 0) > ctx.currentTime + 1);
    expect(late).toHaveLength(0); // lookahead is bounded
  });

  it('music states crossfade layer gains to the documented mix', async () => {
    const { ctx, audio } = unlockedSystem();
    await audio.unlock();
    audio.setMusicState('solving');
    expect(audio.stats().musicState).toBe('solving');
    const layerTargets = (ctx.created.filter((n) => n.nodeType === 'gain') as unknown as MockGainNode[])
      .map((g) => g.gain.events.filter((e) => e.type === 'target').pop()?.value)
      .filter((v): v is number => v !== undefined);
    for (const l of MUSIC_LAYERS) if (LAYER_MIX.solving[l] > 0) expect(layerTargets).toContain(LAYER_MIX.solving[l]);
  });

  it('automatic music follows chamber events', async () => {
    const { audio } = unlockedSystem();
    await audio.unlock();
    audio.handleEvents([{ type: 'levelLoaded', tick: 0, levelId: 'L' }], PLAYER_AT_ORIGIN);
    expect(audio.stats().musicState).toBe('explore');
    const withEcho = view([actor('echo:1', 3000, 3000, 0), actor('player', 5000, 5000)]);
    audio.handleEvents([{ type: 'echoSpawned', tick: 0, actorId: 'echo:1', loopId: 1, echoIndex: 0 }], withEcho);
    expect(audio.stats().musicState).toBe('solving');
    audio.handleEvents([{ type: 'levelComplete', tick: 9, levelId: 'L', echoesUsed: 1, ticks: 9 }], withEcho);
    expect(audio.stats().musicState).toBe('complete');
    // 'complete' is sticky until a new level / restart.
    audio.handleEvents([{ type: 'loopDeleted', tick: 0, loopId: 1, echoIndex: 0 }], PLAYER_AT_ORIGIN);
    expect(audio.stats().musicState).toBe('complete');
    audio.handleEvents([{ type: 'chamberRestart', tick: 0 }], PLAYER_AT_ORIGIN);
    expect(audio.stats().musicState).toBe('explore');
  });

  it('machinery loops follow state (laser hum) and are released after a grace period', async () => {
    const { ctx, audio } = unlockedSystem();
    await audio.unlock();
    audio.handleEvents([], view([actor('player', 5000, 5000)], [laser('l1', true)]));
    expect(audio.stats().activeLoops).toBe(1);
    audio.handleEvents([], view([actor('player', 5000, 5000)], [laser('l1', false)]));
    expect(audio.stats().activeLoops).toBe(1); // still inside the grace window
    ctx.advance(0.3);
    audio.handleEvents([], view([actor('player', 5000, 5000)], [laser('l1', false)]));
    expect(audio.stats().activeLoops).toBe(0);
  });

  it('only the nearest machinery loops sound', async () => {
    const { audio } = unlockedSystem();
    await audio.unlock();
    const lasers: AnySimEntity[] = [];
    for (let i = 0; i < 20; i++) lasers.push(laser(`l${String(i).padStart(2, '0')}`, true, 5000 + i * 1000));
    audio.handleEvents([], view([actor('player', 5000, 5000)], lasers));
    expect(audio.stats().activeLoops).toBe(8);
  });

  it('UI cues play on the ui bus and unknown kinds are ignored', async () => {
    const { audio } = unlockedSystem();
    await audio.unlock();
    audio.playUi('confirm');
    audio.playUi('nope' as 'click');
    expect(audio.recentCues().map((c) => c.sound)).toEqual(['ui:confirm']);
  });

  it('dispose stops everything and does not close an injected context', async () => {
    const { ctx, audio } = unlockedSystem();
    await audio.unlock();
    audio.handleEvents([], view([actor('player', 5000, 5000)], [laser('l1', true)]));
    audio.dispose();
    expect(ctx.closed).toBe(false);
    expect(audio.stats().unlocked).toBe(false);
    audio.handleEvents([step('player', 5000)], PLAYER_AT_ORIGIN); // no throw after dispose
  });
});

/* ------------------------------------------------------------------ integration -------------- */

describe('audio over a real chamber playthrough', () => {
  it('plays the test chamber solution end-to-end with the full temporal identity', async () => {
    const level = TEST_LEVELS[0];
    expect(level).toBeDefined();
    if (!level) return;
    const loops = compileSolution(level);
    const ctx = new MockAudioContext();
    const audio = createAudioSystem({ context: ctx.asContext(), scheduler: 'manual' });
    await audio.unlock();
    const game = new TemporalGame(createDefaultRegistry());
    game.loadLevel(level);
    const sounds = new Set<string>();
    const pump = (): void => {
      audio.handleEvents(game.drainEvents(), game.getState());
      for (const c of audio.recentCues()) sounds.add(c.sound);
      ctx.advance(1 / 30);
      audio.update();
    };
    pump();
    loops.forEach((loop, i) => {
      for (let t = 0; t < loop.inputs.length; t++) {
        const inp = loop.inputs[t];
        if (inp) game.step(inp);
        if (t % 2 === 1) pump();
      }
      pump();
      if (i < loops.length - 1) {
        expect(game.commitLoopAndRewind()).toBe(true);
        pump();
      }
    });
    expect(game.getState().status).toBe('complete');
    for (const s of ['arrival', 'recordStart', 'footstep', 'recordEnd', 'rewind', 'echoBloom', 'fanfare']) {
      expect(sounds.has(s), s).toBe(true);
    }
    expect(audio.stats().musicState).toBe('complete');
    expect(audio.stats().activeVoices).toBeLessThanOrEqual(64);
  });
});

import {
  IDLE_INPUT,
  sanitizeInput,
  type ActorId,
  type DivergenceRecord,
  type EntityKind,
  type LevelDefinition,
  type PlayerInput,
  type RecordedInteraction,
  type SimEvent,
  type SimState,
  type SimView,
  type StepResult,
  type TemporalGameApi,
  type TemporalLoop,
  type Timeline,
  type TimelineMarker,
  type TimelineTrack,
} from '../contracts';
import { deepClone } from '../simulation/clone';
import { replayTracks, trackFinishedAt, trackInputAt, type ReplayTrack } from '../simulation/recursion';
import type { EntityRegistry } from '../simulation/registry';
import { LevelRuntimeImpl } from '../simulation/runtime';
import { hashState } from '../simulation/stateHash';
import { createInitialState, stepSim, type ActorFrame, type TickReport } from '../simulation/step';
import { cloneLoop } from './loops';

export interface TemporalGameOptions {
  /** Snapshot cache interval in ticks for scrubbing. default 30 (0.5 s) */
  snapshotInterval?: number;
  /** Keep a copy of the previous state for render interpolation. default true */
  trackPrevious?: boolean;
}

type ExpectationMap = Map<number, RecordedInteraction>;

const verbKey = (tick: number, verb: 'interact' | 'action'): number => tick * 2 + (verb === 'action' ? 1 : 0);

/**
 * TemporalGame — the single authority over gameplay state. Owns the deterministic simulation, the loop list
 * (echo recordings), the live recording, snapshots for scrubbing and the timeline.
 *
 * Pass = one run of the chamber from tick 0 with the current echoes + the live player. Every operation that
 * changes the set of loops (commit, delete, restart, setLoops) or discards the recording (resetLoop) starts a
 * new pass from the deterministic initial state.
 */
export class TemporalGame implements TemporalGameApi {
  private readonly registry: EntityRegistry;
  private readonly snapshotInterval: number;
  private readonly trackPrevious: boolean;

  private rt: LevelRuntimeImpl | null = null;
  private loops: TemporalLoop[] = [];
  private expectations: ExpectationMap[] = [];
  /** Replay tracks of the current loop set (one per echo actor, incl. nested-loop copies). */
  private tracks: ReplayTrack[] = [];
  private nextLoopId = 1;

  private state: SimState | null = null;
  private prevState: SimState | null = null;
  private recording: PlayerInput[] = [];
  private recordingOutcomes: RecordedInteraction[] = [];

  /** Snapshots of the current pass keyed by tick (state BEFORE simulating that tick). */
  private snapshots = new Map<number, SimState>();
  private previewBaseTick = -1;
  private previewSnapshots = new Map<number, SimState>();

  private queue: SimEvent[] = [];
  private passMarkers = new Map<ActorId, TimelineMarker[]>();
  private passDivergences: DivergenceRecord[] = [];
  private finishedAt = new Map<ActorId, number>();

  constructor(registry: EntityRegistry, options: TemporalGameOptions = {}) {
    this.registry = registry;
    this.snapshotInterval = Math.max(1, Math.floor(options.snapshotInterval ?? 30));
    this.trackPrevious = options.trackPrevious ?? true;
  }

  /* ------------------------------------------------------------------ level / loops ---------- */

  loadLevel(level: LevelDefinition): void {
    this.rt = new LevelRuntimeImpl(level, this.registry);
    this.loops = [];
    this.expectations = [];
    this.nextLoopId = 1;
    this.queue = [];
    this.newPass();
    this.emitMeta({ type: 'levelLoaded', tick: 0, levelId: level.id });
    this.emitMeta({ type: 'recordStart', tick: 0, loopCount: 0 });
  }

  get level(): LevelDefinition {
    return this.runtime().level;
  }

  get echoesRemaining(): number {
    return Math.max(0, this.level.maxEchoes - this.loops.length);
  }

  getLoops(): readonly TemporalLoop[] {
    return this.loops;
  }

  getRecording(): readonly PlayerInput[] {
    return this.recording;
  }

  commitLoopAndRewind(): boolean {
    const state = this.live();
    if (this.loops.length >= this.level.maxEchoes) {
      this.emitMeta({ type: 'echoLimitReached', tick: state.tick, maxEchoes: this.level.maxEchoes });
      return false;
    }
    if (this.recording.length === 0) return false;
    const fromTick = state.tick;
    const loop: TemporalLoop = {
      id: this.nextLoopId++,
      durationTicks: this.recording.length,
      inputs: this.recording,
      outcomes: this.recordingOutcomes,
    };
    this.loops.push(loop);
    this.expectations.push(buildExpectations(loop));
    this.newPass();
    this.emitMeta({ type: 'rewind', tick: fromTick, fromTick, loopCount: this.loops.length });
    const echoIndex = this.loops.length - 1;
    this.emitMeta({ type: 'echoSpawned', tick: 0, actorId: `echo:${loop.id}`, loopId: loop.id, echoIndex });
    this.emitMeta({ type: 'recordStart', tick: 0, loopCount: this.loops.length });
    return true;
  }

  resetLoop(): void {
    const fromTick = this.live().tick;
    this.newPass();
    this.emitMeta({ type: 'rewind', tick: fromTick, fromTick, loopCount: this.loops.length });
    this.emitMeta({ type: 'recordStart', tick: 0, loopCount: this.loops.length });
  }

  restartChamber(): void {
    this.live();
    this.loops = [];
    this.expectations = [];
    this.newPass();
    this.emitMeta({ type: 'chamberRestart', tick: 0 });
    this.emitMeta({ type: 'recordStart', tick: 0, loopCount: 0 });
  }

  deleteLoop(index: number): void {
    this.live();
    const loop = this.loops[index];
    if (!loop) throw new RangeError(`deleteLoop: no loop at index ${index}`);
    this.loops.splice(index, 1);
    this.expectations.splice(index, 1);
    this.newPass();
    this.emitMeta({ type: 'loopDeleted', tick: 0, loopId: loop.id, echoIndex: index });
    this.emitMeta({ type: 'recordStart', tick: 0, loopCount: this.loops.length });
  }

  setLoops(loops: readonly TemporalLoop[]): void {
    this.live();
    if (loops.length > this.level.maxEchoes) throw new RangeError(`setLoops: ${loops.length} > maxEchoes`);
    this.loops = loops.map(cloneLoop);
    this.expectations = this.loops.map(buildExpectations);
    this.nextLoopId = this.loops.reduce((m, l) => Math.max(m, l.id + 1), 1);
    this.newPass();
    this.emitMeta({ type: 'recordStart', tick: 0, loopCount: this.loops.length });
  }

  /* ------------------------------------------------------------------ stepping --------------- */

  step(input: PlayerInput): StepResult {
    const state = this.live();
    if (state.status !== 'playing') return { events: [], advanced: false };
    const rt = this.runtime();
    const tick = state.tick;
    if (tick % this.snapshotInterval === 0 && !this.snapshots.has(tick)) this.snapshots.set(tick, deepClone(state));
    if (this.trackPrevious) this.prevState = deepClone(state);

    const playerInput = sanitizeInput(input, tick);
    const events: SimEvent[] = [];
    const report = stepSim(rt, state, this.framesFor(tick, playerInput), events);
    this.recording.push(playerInput);
    this.absorbReport(report, events);
    this.previewBaseTick = -1;
    for (const e of events) this.queue.push(e);
    return { events, advanced: true };
  }

  /* ------------------------------------------------------------------ views ------------------ */

  getState(): SimView {
    return this.live();
  }

  getPreviousState(): SimView {
    return this.prevState ?? this.live();
  }

  hash(): number {
    return hashState(this.runtime(), this.live());
  }

  hashOf(state: SimView): number {
    // hashState only reads; the cast drops the readonly view type.
    return hashState(this.runtime(), state as SimState);
  }

  drainEvents(): SimEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  getSnapshotAt(tick: number): SimView {
    const state = this.live();
    const max = this.level.loopDurationTicks;
    const t = Math.max(0, Math.min(Math.floor(tick), max));
    if (t === state.tick) return deepClone(state);
    if (t < state.tick) {
      let base = t - (t % this.snapshotInterval);
      while (base > 0 && !this.snapshots.has(base)) base -= this.snapshotInterval;
      const snap = this.snapshots.get(base);
      const work = deepClone(snap ?? this.initialState());
      this.simulate(work, t, (k) => this.recording[k] ?? IDLE_INPUT);
      return work;
    }
    // Preview: echoes continue, player idles.
    if (this.previewBaseTick !== state.tick) {
      this.previewSnapshots = new Map();
      this.previewBaseTick = state.tick;
    }
    let bestTick = state.tick;
    let best: SimState = state;
    for (const [k, s] of this.previewSnapshots) {
      if (k <= t && k > bestTick) {
        bestTick = k;
        best = s;
      }
    }
    const work = deepClone(best);
    this.simulate(work, t, () => IDLE_INPUT, true);
    return work;
  }

  getTimeline(): Timeline {
    const state = this.live();
    const rt = this.runtime();
    const kindOf = (id: string | null): EntityKind | null => {
      if (id === null) return null;
      try {
        return rt.def(id).kind;
      } catch {
        return null;
      }
    };
    const toMarker = (o: RecordedInteraction): TimelineMarker => {
      const m: TimelineMarker = {
        tick: o.tick,
        kind: o.kind,
        verb: o.verb,
        entityId: o.entityId,
        entityKind: kindOf(o.entityId),
        success: o.kind !== 'fail',
      };
      if (o.reason !== undefined) m.reason = o.reason;
      return m;
    };
    const tracks: TimelineTrack[] = [];
    for (const tr of this.tracks) {
      const id: ActorId = tr.actorId;
      const loop = tr.loop;
      const track: TimelineTrack = {
        actorId: id,
        kind: 'echo',
        echoIndex: tr.loopIndex,
        loopId: loop.id,
        durationTicks: loop.durationTicks,
        planned: loop.outcomes
          .filter((o) => o.kind !== 'none')
          .map((o) => toMarker(tr.offset === 0 ? o : { ...o, tick: o.tick + tr.offset })),
        actual: [...(this.passMarkers.get(id) ?? [])],
        divergences: this.passDivergences.filter((d) => d.actorId === id),
        finishedAtTick: this.finishedAt.get(id) ?? null,
      };
      if (tr.depth > 0) {
        track.recursion = tr.depth;
        track.startTick = tr.offset;
      }
      tracks.push(track);
    }
    const playerMarkers = this.recordingOutcomes.filter((o) => o.kind !== 'none').map(toMarker);
    tracks.push({
      actorId: 'player',
      kind: 'player',
      echoIndex: -1,
      loopId: null,
      durationTicks: this.recording.length,
      planned: playerMarkers,
      actual: [...playerMarkers],
      divergences: [],
      finishedAtTick: null,
    });
    return {
      levelId: rt.level.id,
      currentTick: state.tick,
      maxTicks: rt.level.loopDurationTicks,
      maxEchoes: rt.level.maxEchoes,
      status: state.status,
      tracks,
    };
  }

  /* ------------------------------------------------------------------ internals -------------- */

  private runtime(): LevelRuntimeImpl {
    if (!this.rt) throw new Error('TemporalGame: no level loaded');
    return this.rt;
  }

  private live(): SimState {
    if (!this.state) throw new Error('TemporalGame: no level loaded');
    return this.state;
  }

  private initialState(): SimState {
    return createInitialState(this.runtime(), this.loops);
  }

  private newPass(): void {
    this.tracks = replayTracks(this.runtime().level, this.loops);
    this.state = this.initialState();
    this.prevState = null;
    this.recording = [];
    this.recordingOutcomes = [];
    this.snapshots = new Map([[0, deepClone(this.state)]]);
    this.previewBaseTick = -1;
    this.previewSnapshots = new Map();
    this.passMarkers = new Map();
    this.passDivergences = [];
    this.finishedAt = new Map();
  }

  private framesFor(tick: number, playerInput: PlayerInput): ActorFrame[] {
    const frames: ActorFrame[] = [];
    for (const track of this.tracks) {
      const exp = this.expectations[track.loopIndex] as ExpectationMap;
      const local = tick - track.offset;
      const finished = trackFinishedAt(track, tick);
      const input = trackInputAt(track, tick);
      const frame: ActorFrame = { input, replayFinished: finished };
      if (local >= 0 && !finished && (input.interactPressed || input.actionPressed)) {
        // Expectations are keyed by the loop's own (local) tick; nested-loop copies are shifted by their offset.
        const expected: NonNullable<ActorFrame['expected']> = {};
        const ei = exp.get(verbKey(local, 'interact'));
        const ea = exp.get(verbKey(local, 'action'));
        if (ei) expected.interact = ei;
        if (ea) expected.action = ea;
        frame.expected = expected;
      }
      frames.push(frame);
    }
    frames.push({ input: playerInput });
    return frames;
  }

  /** Re-simulates `work` up to tick `t` without events. */
  private simulate(work: SimState, t: number, playerInputAt: (tick: number) => PlayerInput, cachePreview = false): void {
    const rt = this.runtime();
    while (work.tick < t && work.status === 'playing') {
      const k = work.tick;
      stepSim(rt, work, this.framesFor(k, sanitizeInput(playerInputAt(k), k)), null);
      if (cachePreview && work.tick % this.snapshotInterval === 0) this.previewSnapshots.set(work.tick, deepClone(work));
    }
  }

  private absorbReport(report: TickReport, events: readonly SimEvent[]): void {
    const rt = this.runtime();
    for (const { actorId, outcome } of report.interactions) {
      if (actorId === 'player') this.recordingOutcomes.push(outcome);
      if (outcome.kind === 'none') continue;
      let kind: EntityKind | null = null;
      if (outcome.entityId !== null) {
        try {
          kind = rt.def(outcome.entityId).kind;
        } catch {
          kind = null;
        }
      }
      const m: TimelineMarker = {
        tick: outcome.tick,
        kind: outcome.kind,
        verb: outcome.verb,
        entityId: outcome.entityId,
        entityKind: kind,
        success: outcome.kind !== 'fail',
      };
      if (outcome.reason !== undefined) m.reason = outcome.reason;
      const list = this.passMarkers.get(actorId) ?? [];
      list.push(m);
      this.passMarkers.set(actorId, list);
    }
    const state = this.live();
    for (const d of report.divergences) {
      const actor = state.actors.find((a) => a.id === d.actorId);
      this.passDivergences.push({
        tick: report.tick,
        actorId: d.actorId,
        loopId: actor?.loopId ?? -1,
        echoIndex: actor?.echoIndex ?? -1,
        expected: d.expected,
        actual: d.actual,
      });
    }
    for (const e of events) if (e.type === 'echoFinished') this.finishedAt.set(e.actorId, e.tick);
  }

  private emitMeta(e: SimEvent): void {
    this.queue.push(e);
  }
}

function buildExpectations(loop: TemporalLoop): ExpectationMap {
  const m: ExpectationMap = new Map();
  for (const o of loop.outcomes) m.set(verbKey(o.tick, o.verb), o);
  return m;
}

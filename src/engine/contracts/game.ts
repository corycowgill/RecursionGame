import type { EntityId, EntityKind } from './entities';
import type { SimEvent } from './events';
import type { PlayerInput } from './input';
import type { LevelDefinition } from './level';
import type { SimStatus, SimView } from './state';
import type { ActorId, DivergenceRecord, InteractionKind, TemporalLoop } from './temporal';

/** One marker on a timeline track. */
export interface TimelineMarker {
  tick: number;
  kind: InteractionKind;
  verb: 'interact' | 'action';
  entityId: EntityId | null;
  entityKind: EntityKind | null;
  /** false for 'fail'. */
  success: boolean;
  reason?: string;
}

export interface TimelineTrack {
  actorId: ActorId;
  kind: 'player' | 'echo';
  /** 0-based echo index ("Echo 1" = 0), -1 for the player. */
  echoIndex: number;
  loopId: number | null;
  /** Recorded length (echo) or ticks recorded so far (player). */
  durationTicks: number;
  /** Interactions as originally recorded (echo: from the loop; player: same as `actual`). */
  planned: TimelineMarker[];
  /** Interactions observed in the current pass up to the current tick. */
  actual: TimelineMarker[];
  /** Divergences observed in the current pass. */
  divergences: DivergenceRecord[];
  /** Tick at which an echo finished replaying in this pass (null if not yet / player). */
  finishedAtTick: number | null;
}

export interface Timeline {
  levelId: string;
  currentTick: number;
  /** Max recordable ticks for a loop (LevelDefinition.loopDurationTicks). */
  maxTicks: number;
  maxEchoes: number;
  status: SimStatus;
  /** Echo tracks in echoIndex order followed by the player track. */
  tracks: TimelineTrack[];
}

export interface StepResult {
  /** Events produced by this tick (also queued for drainEvents()). */
  events: readonly SimEvent[];
  /** False if the step was ignored (level complete / time up / no level). */
  advanced: boolean;
}

/**
 * Game-facing temporal API (implementation: src/engine/temporal/TemporalGame.ts).
 * All mutation of gameplay state goes through these methods. Views returned are read-only.
 */
export interface TemporalGameApi {
  loadLevel(level: LevelDefinition): void;
  readonly level: LevelDefinition;
  /** Simulate exactly one 60 Hz tick with the player's input (input.tick is overwritten). */
  step(input: PlayerInput): StepResult;
  /**
   * End the current recording: it becomes an echo (TemporalLoop) and the chamber rewinds to tick 0.
   * Returns false (and emits echoLimitReached) when maxEchoes echoes already exist, or if nothing was recorded.
   */
  commitLoopAndRewind(): boolean;
  /** Discard the current recording and rewind to tick 0 keeping existing echoes. */
  resetLoop(): void;
  /** Shift+R: remove all echoes and rewind to tick 0. */
  restartChamber(): void;
  /** Remove echo `index` (0-based); remaining echoes keep their recordings; rewinds to tick 0. */
  deleteLoop(index: number): void;
  /** Replace all loops (persistence / replays); rewinds to tick 0. */
  setLoops(loops: readonly TemporalLoop[]): void;
  getLoops(): readonly TemporalLoop[];
  /** Inputs recorded so far in this pass (player). */
  getRecording(): readonly PlayerInput[];
  getState(): SimView;
  /** State before the last step (for render interpolation). */
  getPreviousState(): SimView;
  getTimeline(): Timeline;
  /**
   * World state at any tick of the current pass, for scrubbing. Ticks <= current tick reproduce the pass
   * exactly (cached snapshots + re-simulation). Ticks beyond the current tick are a PREVIEW in which echoes
   * replay and the player idles. Always returns a fresh read-only copy; never affects the live state.
   */
  getSnapshotAt(tick: number): SimView;
  /** FNV-1a 32-bit hash of the canonical live SimState. */
  hash(): number;
  /** Same canonical hash for any state of this level (e.g. a snapshot from getSnapshotAt). */
  hashOf(state: SimView): number;
  /** Returns and clears all queued events (sim + meta). */
  drainEvents(): SimEvent[];
  readonly echoesRemaining: number;
}

import type { ActorId, RecordedInteraction } from './temporal';
import type { AnySimEntity, EntityId, EntityKind, SimEntity } from './entities';
import type { Dir4, Dir8 } from './numeric';
import type { SignalId } from './signals';

/** Physical tuning (sim units / ticks). Changing these changes every recording: treat as versioned. */
export const PHYS = {
  /** Half-width of the actor's square collision footprint. */
  ACTOR_HALF: 280,
  ACTOR_HEIGHT: 850,
  /** Units per tick when moving along one axis (2.4 tiles/s). */
  ACTOR_SPEED: 40,
  /** Per-axis units per tick when moving diagonally (≈ ACTOR_SPEED / √2). */
  ACTOR_SPEED_DIAG: 28,
  /** Max height difference an actor can step across between adjacent surfaces. */
  STEP_TOLERANCE: 300,
  /** Distance from actor centre to the interaction probe point along its facing. */
  REACH: 650,
  /** Distance travelled between footstep events. */
  STRIDE: 450,
  /** Half-width of a crate's footprint (crates are cell-snapped when resting). */
  CRATE_HALF: 400,
  CRATE_HEIGHT: 800,
  /** Height above the carrier's feet at which carried items ride (renderers may offset further). */
  CARRY_HEIGHT: 500,
} as const;

export type ActorKind = 'player' | 'echo';

export interface ActorState {
  id: ActorId;
  kind: ActorKind;
  /** 0-based position in the loop list for echoes ("Echo 1" = index 0); -1 for the player. */
  echoIndex: number;
  /** Loop being replayed (echo) or null (player). */
  loopId: number | null;
  /** Feet position in units. y follows the walk surface. */
  x: number;
  y: number;
  z: number;
  /** Displacement applied this tick (units) — renderers use it for locomotion blend. */
  vx: number;
  vy: number;
  vz: number;
  /** Interaction facing (cardinal). */
  facing: Dir4;
  /** Visual heading (8-way), last non-zero move direction. */
  heading: Dir8;
  moving: boolean;
  /** Entity carried (exclusive ownership; mirrors SimEntity.carriedBy). */
  carrying: EntityId | null;
  /** Distance accumulator for footsteps. */
  strideUnits: number;
  foot: 0 | 1;
  /** Echo has replayed all its inputs and now idles in place. Always false for the player. */
  finished: boolean;
  /** First tick at which this echo diverged from its recording this pass, or null. */
  divergedAtTick: number | null;
  divergenceCount: number;
  /** Most recent interaction attempt (animation hook). */
  lastInteraction: RecordedInteraction | null;
  /** interactHeld from this tick's input (animation hook; behaviours may read it). */
  interactHeld: boolean;
  /**
   * Nested loops only (LevelDefinition.recursion): recursive copy depth k >= 1 of loop `loopId`, replaying its
   * inputs delayed by k * delayTicks. Absent on ordinary echoes and the player.
   */
  recursion?: number;
}

export type SimStatus = 'playing' | 'complete' | 'timeUp';

/**
 * SimState — the complete, plain, serializable world state. Hashing, snapshotting and cloning operate on it.
 * Static level data (tiles, entity configs, wires) is NOT in here; it lives in the immutable LevelRuntime.
 */
export interface SimState {
  /** Number of ticks simulated so far in this pass. The next step simulates tick `tick`. */
  tick: number;
  status: SimStatus;
  completedAtTick: number | null;
  /** Seeded RNG state (uint32). */
  rng: number;
  /** Processing order: echoes by echoIndex ascending, then the player LAST. */
  actors: ActorState[];
  /** Keyed by EntityId. Iterate via LevelRuntime.entityOrder (sorted), never Object.keys order. */
  entities: Record<EntityId, AnySimEntity>;
  /** Output channels written during the previous tick (double-buffered; see signals.ts). */
  signals: Record<SignalId, boolean>;
}

/** Recursive readonly — the type every consumer outside src/engine/{simulation,temporal,physics} sees. */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Read-only view of the world for renderers / UI / audio. Never cast it back to mutable. */
export type SimView = DeepReadonly<SimState>;
export type ActorView = DeepReadonly<ActorState>;
export type EntityView<K extends EntityKind = EntityKind> = DeepReadonly<SimEntity<K>>;

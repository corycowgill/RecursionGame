import type {
  AnySimEntity,
  EntityConfigMap,
  EntityDefinition,
  EntityDefinitionOf,
  EntityId,
  EntityKind,
  EntityStateMap,
  SimEntity,
} from './entities';
import type { SimEvent } from './events';
import type { Tile } from './geometry';
import type { LevelDefinition } from './level';
import type { Wire } from './signals';
import type { ActorState, SimState } from './state';
import type { ActorId, InteractionKind } from './temporal';

/** Immutable per-level data shared by every pass (never part of SimState, never mutated). */
export interface LevelRuntime {
  readonly level: LevelDefinition;
  readonly width: number;
  readonly height: number;
  /** Out-of-bounds cells read as void. */
  tileAt(col: number, row: number): Readonly<Tile>;
  /** All entity ids sorted ascending (the canonical processing order). */
  readonly entityOrder: readonly EntityId[];
  def(id: EntityId): EntityDefinition;
  /** Wires whose `to` is this entity (sorted by `from`). */
  inputsOf(id: EntityId): readonly Wire[];
  behaviourFor(kind: EntityKind): PuzzleEntityBehaviour<EntityKind>;
}

/** Result of an interaction handler (tick/verb are filled in by the engine). */
export interface InteractionResult {
  kind: InteractionKind;
  entityId: EntityId | null;
  reason?: string;
}

/** Context available to every behaviour callback during a tick. */
export interface SimContext {
  readonly tick: number;
  readonly runtime: LevelRuntime;
  /**
   * Full mutable state. Behaviours may READ anything but may only MUTATE their own entity's `state`/position,
   * and must change ownership only through the helpers on InteractContext.
   */
  readonly state: SimState;
  /** Deterministic RNG (advances SimState.rng). Returns uint32. */
  random(): number;
  /** Deterministic integer in [0, maxExclusive). */
  randomInt(maxExclusive: number): number;
  emit(event: SimEvent): void;
  /** Value of a signal written during the previous tick. */
  signal(id: EntityId): boolean;
  /**
   * Combined value of the wires feeding `id` (applying invert + the entity's logic), read from the previous
   * tick's buffer. Returns null when the entity has no wired inputs.
   */
  inputsPowered(id: EntityId): boolean | null;
  getEntity(id: EntityId): AnySimEntity | undefined;
  getActor(id: ActorId): ActorState | undefined;
  /** Actors whose centre is inside the cell and whose feet are within STEP_TOLERANCE of `y`. */
  actorsOnCell(col: number, row: number, y: number): ActorState[];
  /** Actors whose footprint overlaps the cell's square (any height within ±1 level of `y`). */
  actorsOverlappingCell(col: number, row: number, y: number): ActorState[];
  /** Non-carried entities anchored in the cell (sorted by id). */
  entitiesInCell(col: number, row: number): AnySimEntity[];
  /** Walk-surface height of a cell in units (tiles + entity surface overrides), or null if not walkable. */
  surfaceY(col: number, row: number): number | null;
}

export interface EntityContext<K extends EntityKind> extends SimContext {
  readonly entity: SimEntity<K>;
  readonly def: EntityDefinitionOf<K>;
  readonly config: EntityConfigMap[K];
  /** Write this entity's output channel for the next tick. */
  setOutput(value: boolean): void;
}

export interface InteractContext<K extends EntityKind> extends EntityContext<K> {
  readonly actor: ActorState;
  readonly verb: 'interact' | 'action';
  /** The entity the actor is carrying, if any. */
  readonly item: AnySimEntity | null;
  /**
   * Ownership helper: the actor stops carrying its item, which is anchored at (x,y,z). Use for inserts.
   * Throws if the actor carries nothing (engine bug guard).
   */
  releaseItemTo(x: number, y: number, z: number): AnySimEntity;
  /**
   * Ownership helper: the actor takes exclusive ownership of `entityId` (must be uncarried and the actor
   * empty-handed). Returns false (no change) if ownership rules forbid it.
   */
  giveItemToActor(entityId: EntityId): boolean;
}

export interface InitContext {
  readonly runtime: LevelRuntime;
}

/** Surface override provided by an entity (elevator platform, moving platform...). */
export interface SurfaceCell {
  col: number;
  row: number;
  /** Surface height in units. */
  y: number;
  /**
   * (additive, round 2) Optional planar clip in world units, half-open [minX,maxX) x [minZ,maxZ): the surface exists
   * only at points of the cell inside it (a moving deck straddling two cells covers only part of each). Absent =
   * the whole cell. Points outside the clip fall back to the tile's own surface (void for a deck lane).
   */
  clip?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * PuzzleEntityBehaviour — stateless logic for one entity kind. ALL dynamic data lives in SimEntity.state so
 * snapshots/rewinds are just state copies. Register with EntityRegistry.register(behaviour); the engine never
 * imports gameplay code.
 *
 * Tick order (see docs/architecture/contracts.md): inputs -> interactions (actors in order) -> movement
 * (actors in order) -> entity update (entities in id order) -> carry (riders follow their carrier) -> signal buffer swap -> win check.
 */
export interface PuzzleEntityBehaviour<K extends EntityKind> {
  readonly kind: K;
  /** reset: initial typed state for a new pass (called on load, rewind, restart, loop deletion). */
  reset(def: EntityDefinitionOf<K>, ctx: InitContext): EntityStateMap[K];
  /** Initial output channel value at tick 0. default false */
  initialOutput?(def: EntityDefinitionOf<K>, state: EntityStateMap[K]): boolean;
  /** Per-tick logic; runs after all actors moved, in entity id order. */
  update?(ctx: EntityContext<K>): void;
  /** Data hashed for determinism checks. default: the state object itself. */
  serialize?(state: EntityStateMap[K]): unknown;

  /** Can actors pick this up (exclusive carry)? */
  readonly carriable?: boolean;
  /** Optional veto for pickup (e.g. energy cell seated in a socket). default true when carriable */
  canPickUp?(entity: SimEntity<K>, ctx: SimContext): boolean;
  /** Contribution to pressure plates when resting (not carried) on one. default 0 */
  readonly plateWeight?: number;
  /** Blocks actor/crate movement in its cell right now? default false */
  isSolid?(entity: SimEntity<K>, def: EntityDefinitionOf<K>): boolean;
  /**
   * Per-actor solidity (e.g. temporal gate letting only echoes through). When present it is consulted for
   * actors INSTEAD of isSolid; isSolid still governs item drops and lasers.
   */
  isSolidFor?(entity: SimEntity<K>, def: EntityDefinitionOf<K>, actor: ActorState): boolean;
  /** Blocks laser beams right now? default = isSolid */
  blocksLaser?(entity: SimEntity<K>, def: EntityDefinitionOf<K>): boolean;
  /** Walk-surface overrides (elevators, moving platforms). */
  surfaceCells?(entity: SimEntity<K>, def: EntityDefinitionOf<K>): SurfaceCell[];
  /**
   * Displacement this entity applied to its surface during its last update. Actors whose centre stood on its
   * surface (within STEP_TOLERANCE) when the entity-update phase began are carried by it right after that phase,
   * in the same tick (collision-checked, see contracts §6 step 4b).
   */
  carrierDelta?(entity: SimEntity<K>): { dx: number; dy: number; dz: number } | null;

  /**
   * E pressed while facing this entity. Return null if not interactable (resolution continues with the next
   * candidate), or a result (success or 'fail').
   */
  interact?(ctx: InteractContext<K>): InteractionResult | null;
  /** E pressed while carrying `ctx.item` and facing this entity (e.g. socket accepting a cell). */
  acceptItem?(ctx: InteractContext<K>): InteractionResult | null;
  /** Space pressed while facing this entity. */
  action?(ctx: InteractContext<K>): InteractionResult | null;
}

/** Registry interface (implementation: src/engine/simulation/registry.ts). */
export interface EntityRegistryLike {
  register<K extends EntityKind>(behaviour: PuzzleEntityBehaviour<K>): void;
  get(kind: EntityKind): PuzzleEntityBehaviour<EntityKind> | undefined;
  has(kind: EntityKind): boolean;
  kinds(): EntityKind[];
}

import type { ActorId } from './temporal';
import type { Cell, Dir4 } from './numeric';

/**
 * EntityId — stable string id authored in level data (e.g. "plate-a", "door-1"). Unique per level.
 * Entities are never created or destroyed at runtime (use state flags instead), so the set of ids is fixed
 * for a level and the engine processes them in ascending code-unit order (`a < b`, never localeCompare).
 */
export type EntityId = string;

/** All puzzle component kinds (the 12 components from the brief). */
export const ENTITY_KINDS = [
  'pressurePlate',
  'door',
  'timedSwitch',
  'crate',
  'energyCell',
  'energySocket',
  'elevator',
  'laserEmitter',
  'laserReceiver',
  'temporalGate',
  'movingPlatform',
  'exitPortal',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export function isEntityKind(v: unknown): v is EntityKind {
  return typeof v === 'string' && (ENTITY_KINDS as readonly string[]).includes(v);
}

/** How a consumer combines multiple wired inputs. */
export type SignalLogic = 'and' | 'or';

/* ------------------------------------------------------------------------------------------------
 * Per-kind CONFIG (static, authored in level data, never mutated) and STATE (dynamic, lives in SimState,
 * integers/booleans/strings/null only). Durations are ticks, distances are units, heights are levels unless
 * suffixed otherwise. Gameplay engineers may ADD optional fields; never repurpose existing ones.
 * ---------------------------------------------------------------------------------------------- */

export interface PressurePlateConfig {
  /** Do non-carried crates press the plate? default true */
  acceptsCrates?: boolean;
  /** Occupant count needed (actors + crates). default 1 */
  threshold?: number;
  /** Once pressed, stays pressed for the rest of the pass. default false */
  latch?: boolean;
}
export interface PressurePlateState {
  pressed: boolean;
  /** Number of actors + crates currently on the plate. */
  occupants: number;
  /** Consecutive ticks pressed (0 when up). */
  pressedTicks: number;
}

export interface DoorConfig {
  /** Open when not powered (inverted door). default false */
  startsOpen?: boolean;
  /** Ticks to fully open/close. default 18 */
  openTicks?: number;
}
export interface DoorState {
  /** Desired state from signals (true = wants open). */
  open: boolean;
  /** 0 = closed, 1000 = fully open. Passable (non-solid) when progress >= DOOR_PASSABLE_PROGRESS. */
  progress: number;
  /** True while it wants to close but an actor/crate occupies the doorway (door holds open). */
  blocked: boolean;
}

export interface TimedSwitchConfig {
  /** How long the switch stays on after activation. */
  durationTicks: number;
  /** Re-activating while on restarts the timer. default true */
  retrigger?: boolean;
  /**
   * (level-design addition) Ticks the switch stays locked after switching off; presses fail with reason
   * 'cooldown' meanwhile, so a switch can never be held on continuously by repeated presses. default 0
   */
  cooldownTicks?: number;
}
export interface TimedSwitchState {
  on: boolean;
  remainingTicks: number;
  activatedBy: ActorId | null;
  /** (level-design addition) Remaining cooldown ticks after switching off (only present with cooldownTicks). */
  cooldown?: number;
}

export type CrateConfig = Record<string, never>;
export interface CrateState {
  /** Ticks since last moved (pickup/drop), cosmetic settle timing for renderers. */
  restTicks: number;
}

export interface EnergyCellConfig {
  /** Optional color/channel tag that sockets may require. */
  tag?: string;
}
export interface EnergyCellState {
  /** Socket currently holding this cell, or null. */
  socketId: EntityId | null;
}

export interface EnergySocketConfig {
  /** Energy cell placed in the socket at tick 0. */
  initialCell?: EntityId;
  /** Only accept cells with this tag. */
  requiresTag?: string;
  /** Can an actor take the cell back out? default true */
  allowExtract?: boolean;
}
export interface EnergySocketState {
  cellId: EntityId | null;
  powered: boolean;
}

export interface ElevatorConfig {
  /** Height levels the platform travels between (ascending). Index 0 is the start unless startIndex set. */
  levels: number[];
  startIndex?: number;
  /** Ticks to travel one height level. default 60 */
  ticksPerLevel?: number;
  /**
   * 'signal': goes to levels[last] while wired input is active, levels[0] otherwise.
   * 'cycle' : interacting (E) on the platform/console advances to the next level.
   * 'ride'  : (gameplay addition) standing on the platform for `rideDelayTicks` sends it to the next level.
   * In 'cycle'/'ride' mode a wired input acts as a call button: each rising edge advances to the next level.
   */
  mode?: 'signal' | 'cycle' | 'ride';
  /** 'ride' mode: ticks an occupant must stand on the resting platform before it departs. default 30 */
  rideDelayTicks?: number;
  /** 'ride'/'cycle' mode: return to startIndex after this many empty ticks away from it. default: never */
  returnDelayTicks?: number;
}
export interface ElevatorState {
  /** Current platform surface height in UNITS. */
  y: number;
  targetIndex: number;
  moving: boolean;
  /** Units moved this tick (for carrying actors / renderers). */
  dy: number;
  /** (gameplay addition) ride/return dwell counter in ticks. */
  dwellTicks?: number;
  /** (gameplay addition) ride mode: false after a ride until the platform has been vacated. */
  armed?: boolean;
  /** (gameplay addition) previous combined input value, for rising-edge call buttons. */
  lastInput?: boolean;
  /** (gameplay addition) true while a departure is held because an actor straddles the shaft edge. */
  held?: boolean;
}

export interface LaserEmitterConfig {
  /** Emits when no input wired; with inputs, emits while the combined signal is active. */
  startsOn?: boolean;
  /** Max beam length in tiles. default 32 */
  rangeTiles?: number;
}
export interface LaserEmitterState {
  on: boolean;
  /** Beam length in units from emitter cell centre (0 when off). */
  beamLength: number;
  /** Entity the beam terminates on (receiver, crate, door...) or null (wall). */
  hitEntityId: EntityId | null;
  /** Actor blocking the beam, if any. */
  hitActorId: ActorId | null;
}

export type LaserReceiverConfig = Record<string, never>;
export interface LaserReceiverState {
  lit: boolean;
  litBy: EntityId | null;
  litTicks: number;
}

export interface TemporalGateConfig {
  /** Who may pass while the gate is closed to others. */
  allows: 'echoes' | 'player' | 'all';
  /** With wired inputs, the gate only lets `allows` pass while powered (else blocks everyone). */
  requiresSignal?: boolean;
}
export interface TemporalGateState {
  open: boolean;
  /** Ticks since last state change (renderer pulse). */
  phaseTicks: number;
}

export interface MovingPlatformConfig {
  /** Waypoint cells the platform travels through (first = start). Same height level. */
  path: Cell[];
  /** Units per tick. default 20 */
  speed?: number;
  /** Ticks to wait at each end/waypoint. default 30 */
  pauseTicks?: number;
  mode?: 'pingpong' | 'loop';
  /** With wired inputs, only moves while powered. */
  requiresSignal?: boolean;
}
export interface MovingPlatformState {
  /** Index of the waypoint being travelled toward. */
  targetIndex: number;
  direction: 1 | -1;
  waitTicks: number;
  /** Planar delta applied this tick (units). Actors standing on it are carried by this delta. */
  dx: number;
  dz: number;
}

export interface ExitPortalConfig {
  /** Optional: label of required objective for UI. */
  objective?: string;
}
export interface ExitPortalState {
  /** Powered/open (all wired inputs satisfied, or no inputs). */
  active: boolean;
  activeTicks: number;
}

export interface EntityConfigMap {
  pressurePlate: PressurePlateConfig;
  door: DoorConfig;
  timedSwitch: TimedSwitchConfig;
  crate: CrateConfig;
  energyCell: EnergyCellConfig;
  energySocket: EnergySocketConfig;
  elevator: ElevatorConfig;
  laserEmitter: LaserEmitterConfig;
  laserReceiver: LaserReceiverConfig;
  temporalGate: TemporalGateConfig;
  movingPlatform: MovingPlatformConfig;
  exitPortal: ExitPortalConfig;
}

export interface EntityStateMap {
  pressurePlate: PressurePlateState;
  door: DoorState;
  timedSwitch: TimedSwitchState;
  crate: CrateState;
  energyCell: EnergyCellState;
  energySocket: EnergySocketState;
  elevator: ElevatorState;
  laserEmitter: LaserEmitterState;
  laserReceiver: LaserReceiverState;
  temporalGate: TemporalGateState;
  movingPlatform: MovingPlatformState;
  exitPortal: ExitPortalState;
}

/**
 * Runtime entity record inside SimState. Position is the entity's anchor in units (cell centre for
 * cell-anchored entities; y = surface/base height). Carried entities follow their carrier.
 */
export interface SimEntity<K extends EntityKind = EntityKind> {
  id: EntityId;
  kind: K;
  x: number;
  y: number;
  z: number;
  /** Exclusive ownership: the actor carrying this entity, or null. Mirrors ActorState.carrying. */
  carriedBy: ActorId | null;
  state: EntityStateMap[K];
}
export type AnySimEntity = { [K in EntityKind]: SimEntity<K> }[EntityKind];

/** Level-data definition of one entity. */
export interface EntityDefinitionOf<K extends EntityKind> {
  id: EntityId;
  kind: K;
  col: number;
  row: number;
  /** Height level; defaults to the tile's height level. */
  level?: number;
  /** Orientation (door axis, laser direction, ...). default 0 (north) */
  facing?: Dir4;
  /** Combination of wired inputs. default 'and' */
  logic?: SignalLogic;
  /** Display label for UI/timeline ("Plate A"). */
  label?: string;
  config: EntityConfigMap[K];
}
export type EntityDefinition = { [K in EntityKind]: EntityDefinitionOf<K> }[EntityKind];

/* Shared tuning constants for entity behaviours (sim-side, integers). */
export const DOOR_PASSABLE_PROGRESS = 800;
export const DOOR_DEFAULT_OPEN_TICKS = 18;

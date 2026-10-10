import type { DecorDefinition } from './geometry';
import type { EntityDefinition, EntityId } from './entities';
import type { Dir4 } from './numeric';
import type { Wire } from './signals';

/**
 * InputScript — a compact, JSON-able, deterministic description of one loop's inputs, used for level
 * solutions, tests and bots. It is "played" live through the engine (src/testing/harness), so closed-loop
 * steps like moveTo react to the actual simulated position, exactly like a human would. Compiling a level's
 * solution yields TemporalLoop[] (see harness `compileSolution`).
 */
export type ScriptStep =
  /** Walk toward a cell centre in a straight (possibly diagonal) line until within tolerance. */
  | { op: 'moveTo'; col: number; row: number; timeoutTicks?: number }
  /** Hold a raw direction for N ticks. */
  | { op: 'move'; dx: -1 | 0 | 1; dz: -1 | 0 | 1; ticks: number }
  /** Tap a direction for 1 tick to turn (may nudge the actor up to ACTOR_SPEED units). */
  | { op: 'face'; dir: Dir4 }
  /** Idle for N ticks. */
  | { op: 'wait'; ticks: number }
  /** Idle until the pass reaches an absolute tick (no-op if already past). */
  | { op: 'waitUntil'; tick: number }
  /** Press E for one tick. */
  | { op: 'interact' }
  /** Press Space for one tick. */
  | { op: 'action' }
  /** Hold E for N ticks (first tick is a press). */
  | { op: 'hold'; ticks: number };

export type InputScript = ScriptStep[];

export interface CameraHints {
  /** Focus cell for the overview shot. */
  focus?: { col: number; row: number };
  /** Preferred yaw in 45° steps (0 = looking north from the south-east iso default). */
  yawStep?: number;
  /** 1 = default distance; >1 farther. */
  zoom?: number;
  /** Optional ordered points of interest for the level-intro fly-through. */
  introPath?: { col: number; row: number; level?: number }[];
}

export interface LevelHint {
  text: string;
  /** Show after this many seconds in the chamber (UI decides presentation). */
  afterSeconds?: number;
}

/**
 * LevelDefinition — fully JSON-serializable level schema. Validated by src/levels/validators.
 */
export interface LevelDefinition {
  /** Stable id, e.g. "L01-first-echo". */
  id: string;
  /** 1-based campaign order (0 for test chambers). */
  order: number;
  name: string;
  subtitle?: string;
  /** Story / intro text lines shown on level start. */
  story?: string[];
  grid: {
    width: number;
    height: number;
    /** `height` strings of `width` chars; see TILE_LEGEND in geometry.ts. */
    tiles: string[];
    /** Optional height levels, same shape as tiles, digits '0'-'9'. */
    heights?: string[];
  };
  entities: EntityDefinition[];
  wires: Wire[];
  playerSpawn: { col: number; row: number; facing?: Dir4 };
  /** The exitPortal entity that completes the level. */
  exitId: EntityId;
  /** Maximum number of echoes (committed loops) allowed. */
  maxEchoes: number;
  /** Maximum ticks a single loop may record (recording stops with 'loopTimeUp'). */
  loopDurationTicks: number;
  /** Target completion time in seconds (UI rating). */
  parTimeSeconds: number;
  /** Target echo count for a "perfect" rating (optional). */
  parEchoes?: number;
  hints: LevelHint[];
  /**
   * Known-good solution: one InputScript per loop; all but the last are committed as echoes in order, the
   * last is the final player run that must reach the exit. Verified by the harness in tests.
   */
  solution: InputScript[];
  camera?: CameraHints;
  decor?: DecorDefinition[];
  /** RNG seed for any deterministic randomness (default 1). */
  seed?: number;
  /** Mechanics introduced (for menus/teaching), e.g. ['pressurePlate', 'echo']. */
  teaches?: string[];
}

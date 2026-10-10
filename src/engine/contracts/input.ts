/**
 * PlayerInput contract — the ONLY thing recorded into a TemporalLoop and the only way an actor is driven.
 *
 * moveX / moveY are quantized integers in {-1, 0, 1} expressed in WORLD axes (not camera axes):
 *   moveX: -1 = west (-x), +1 = east (+x)
 *   moveY: -1 = north (-z), +1 = south (+z)    (named moveY per the brief; it maps to the sim z axis)
 * Camera-relative mapping happens in the browser input layer (src/engine/input) BEFORE recording, so
 * recordings are camera-independent and deterministic.
 *
 * interactPressed / actionPressed are edge-triggered (true for exactly one tick per key press).
 * interactHeld is level-triggered (true every tick the key is held).
 */
export interface PlayerInput {
  /** Tick this input applies to. The engine overwrites it with the authoritative tick when recording. */
  tick: number;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  /** E — edge: pick up / drop / use the entity in front of the actor. */
  interactPressed: boolean;
  /** E held (level). Behaviours may read it, e.g. hold-to-operate machinery. */
  interactHeld: boolean;
  /** Space — edge: context action routed to the faced entity's `action` handler (no-op if none). */
  actionPressed: boolean;
}

export const IDLE_INPUT: Readonly<PlayerInput> = Object.freeze({
  tick: 0,
  moveX: 0,
  moveY: 0,
  interactPressed: false,
  interactHeld: false,
  actionPressed: false,
});

export function idleInput(tick: number): PlayerInput {
  return { ...IDLE_INPUT, tick };
}

/** Coerces arbitrary numeric/boolean data (e.g. from JSON) into a valid, quantized PlayerInput. */
export function sanitizeInput(raw: Partial<PlayerInput> | undefined, tick: number): PlayerInput {
  const q = (v: unknown): -1 | 0 | 1 => (typeof v === 'number' ? (v > 0 ? 1 : v < 0 ? -1 : 0) : 0);
  return {
    tick,
    moveX: q(raw?.moveX),
    moveY: q(raw?.moveY),
    interactPressed: raw?.interactPressed === true,
    interactHeld: raw?.interactHeld === true || raw?.interactPressed === true,
    actionPressed: raw?.actionPressed === true,
  };
}

export function inputsEqual(a: PlayerInput, b: PlayerInput): boolean {
  return (
    a.moveX === b.moveX &&
    a.moveY === b.moveY &&
    a.interactPressed === b.interactPressed &&
    a.interactHeld === b.interactHeld &&
    a.actionPressed === b.actionPressed
  );
}

/**
 * Meta commands issued by the player that are NOT simulation input (never recorded). The app layer maps them
 * to TemporalGame API calls (commitLoopAndRewind, restartChamber, ...) or UI actions.
 */
export type GameCommand =
  | { type: 'rewind' } // R: end recording, create echo
  | { type: 'restart' } // Shift+R: restart chamber (clears loops)
  | { type: 'toggleTimeline' } // Tab
  | { type: 'pause' } // Esc
  | { type: 'temporalPreview'; held: boolean } // Q (held)
  | { type: 'selectEcho'; index: number }; // 1-5 -> index 0-4

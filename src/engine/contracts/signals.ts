import type { EntityId } from './entities';

/**
 * SIGNAL / WIRING MODEL
 *
 * Every entity owns exactly one boolean output channel, identified by its EntityId (SignalId = EntityId).
 *   - Sources set it from their own state (plate pressed, receiver lit, switch on, socket powered...).
 *   - Consumers (door, exit portal, elevator in 'signal' mode, emitter, gate, platform...) read the outputs
 *     of the entities wired INTO them and combine them with the entity's `logic` ('and' default | 'or').
 *   - A consumer with no wired inputs is "unwired": each behaviour documents its unwired default
 *     (doors stay closed, exit portals are active, emitters use `startsOn`...).
 *
 * Wires are authored in LevelDefinition.wires and are static.
 *
 * Signals are DOUBLE-BUFFERED: during tick t every entity reads the values written during tick t-1 and
 * writes its new output into the next buffer, which becomes visible at tick t+1. This makes evaluation
 * order-independent (and cycles harmless) at the cost of 1 tick (16.7 ms) latency per hop.
 * At tick 0 all signals start false (behaviours' `initialOutput` may override).
 */
export type SignalId = EntityId;

export interface Wire {
  from: SignalId;
  to: EntityId;
  /** Invert the source value before combining. default false */
  invert?: boolean;
}

import type { PlayerInput } from './input';
import type { EntityId } from './entities';

/**
 * ActorId — stable identifier of an actor within a pass.
 *   'player'          the live, currently-recording actor (gold)
 *   'echo:<loopId>'   the echo replaying TemporalLoop with that id (cyan)
 * Echo *index* (0-based position in the loop list, shown to players as "Echo 1..N") is stored separately on
 * ActorState.echoIndex because it shifts when a loop is deleted; the loopId never changes.
 */
export type ActorId = 'player' | `echo:${number}`;
export const PLAYER_ACTOR_ID: ActorId = 'player';

export function echoActorId(loopId: number): ActorId {
  return `echo:${loopId}`;
}

/**
 * Actor id of recursive copy `depth` (>= 1) of loop `loopId` (nested loops, LevelDefinition.recursion), e.g.
 * 'echo:3.1'. It still starts with 'echo:'; never parse it — read ActorState.loopId / .recursion instead.
 */
export function recursiveEchoActorId(loopId: number, depth: number): ActorId {
  return `echo:${loopId}.${depth}` as ActorId;
}

export function isEchoId(id: ActorId): id is `echo:${number}` {
  return id !== 'player';
}

/** What an interaction attempt resolved to. */
export type InteractionKind =
  | 'pickup' // took a carriable entity (crate, energy cell)
  | 'drop' // placed the carried entity on the faced cell
  | 'insert' // carried entity consumed/accepted by the faced entity (cell -> socket)
  | 'extract' // took an item out of the faced entity (socket -> cell in hand)
  | 'use' // generic activation (switch, elevator console, ...)
  | 'action' // Space context action handled by an entity
  | 'none' // nothing to interact with (not a failure; not a divergence source)
  | 'fail'; // something was there but the interaction could not execute

/** Outcome of one interaction attempt (E or Space) by one actor on one tick. */
export interface RecordedInteraction {
  tick: number;
  verb: 'interact' | 'action';
  kind: InteractionKind;
  /** Primary entity involved (picked up / dropped / used), or null. */
  entityId: EntityId | null;
  /** Machine-readable reason for 'fail' (e.g. 'blocked', 'occupied', 'carriedByOther', 'rejected'). */
  reason?: string;
}

/**
 * TemporalLoop — one committed recording. Echoes replay `inputs` from tick 0 (NOT positions).
 * inputs is dense: inputs[t] is the input applied on tick t, for t in [0, durationTicks).
 * After durationTicks the echo stays in the world idle (still physical: it keeps pressing plates and
 * keeps holding whatever it carries).
 */
export interface TemporalLoop {
  /** Stable, monotonically increasing per chamber attempt; never reused after deletion. */
  id: number;
  durationTicks: number;
  inputs: PlayerInput[];
  /**
   * Interaction outcomes observed while this loop was being recorded live. Used for divergence detection
   * when replayed: if a replayed attempt resolves differently, a `divergence` event + timeline marker is
   * produced and the echo simply continues with its inputs (never teleported or forced).
   */
  outcomes: RecordedInteraction[];
}

/** A divergence: a replayed interaction resolved differently from the recording. */
export interface DivergenceRecord {
  tick: number;
  actorId: ActorId;
  loopId: number;
  echoIndex: number;
  expected: RecordedInteraction;
  actual: RecordedInteraction;
}

import type { ActorView, Dir4, Dir8, EntityId, EntityKind, InteractionKind, SimView } from '../../engine/contracts';

/**
 * PLAYER / ECHO ANIMATION STATE — a pure, read-only derivation from the simulation for renderers, audio and UI.
 * Nothing here feeds back into the simulation. The raw fields live on ActorState (moving, facing, heading,
 * carrying, lastInteraction, interactHeld, finished, divergedAtTick); this module turns them into one flat,
 * animation-ready record so every consumer interprets them identically.
 */

/** How long (ticks) an interaction pose plays after an attempt. */
export const INTERACT_POSE_TICKS = 14;
/** How long (ticks) the "failed" flinch plays after a failed attempt. */
export const FAIL_POSE_TICKS = 24;

export type Locomotion = 'idle' | 'walk' | 'ride';

export interface ActorAnimState {
  id: ActorView['id'];
  kind: ActorView['kind'];
  /** 0-based echo index, -1 for the player. */
  echoIndex: number;
  locomotion: Locomotion;
  /** Walking this tick (own legs, not carried by a platform). */
  moving: boolean;
  /** Planar speed this tick in units/tick (40 straight, ~40 diagonal, 0 idle). */
  speed: number;
  /** Cardinal interaction facing (0 N, 1 E, 2 S, 3 W). */
  facing: Dir4;
  /** 8-way visual heading (0 N … 7 NW); multiply by 45° for yaw. */
  heading: Dir8;
  carrying: EntityId | null;
  carryKind: EntityKind | null;
  /** An interaction attempt happened within INTERACT_POSE_TICKS (play reach/press pose). */
  interacting: boolean;
  /** Kind of the most recent attempt (null if none yet this pass). */
  interactKind: InteractionKind | null;
  /** Ticks since the most recent attempt (null if none). */
  ticksSinceInteract: number | null;
  /** The most recent attempt failed within FAIL_POSE_TICKS (play flinch / invalid feedback). */
  interactFailed: boolean;
  /** E held this tick (hold/charge poses). */
  holding: boolean;
  /** Echo finished replaying and idles in place. */
  finished: boolean;
  /** Echo diverged from its recording this pass (show paradox shimmer). */
  diverged: boolean;
}

export function actorAnimState(view: SimView, actor: ActorView): ActorAnimState {
  const last = actor.lastInteraction;
  // view.tick is the NEXT tick to simulate; the last simulated tick is view.tick - 1.
  const since = last ? view.tick - 1 - last.tick : null;
  const walkSpeed = actor.moving ? Math.max(Math.abs(actor.vx), Math.abs(actor.vz)) : 0;
  const displaced = actor.vx !== 0 || actor.vz !== 0 || actor.vy !== 0;
  const carried = actor.carrying !== null ? view.entities[actor.carrying] : undefined;
  const meaningful = last !== null && last.kind !== 'none';
  return {
    id: actor.id,
    kind: actor.kind,
    echoIndex: actor.echoIndex,
    locomotion: actor.moving ? 'walk' : displaced ? 'ride' : 'idle',
    moving: actor.moving,
    speed: walkSpeed,
    facing: actor.facing,
    heading: actor.heading,
    carrying: actor.carrying,
    carryKind: carried ? carried.kind : null,
    interacting: meaningful && since !== null && since < INTERACT_POSE_TICKS,
    interactKind: last ? last.kind : null,
    ticksSinceInteract: since,
    interactFailed: last !== null && last.kind === 'fail' && since !== null && since < FAIL_POSE_TICKS,
    holding: actor.interactHeld,
    finished: actor.finished,
    diverged: actor.divergedAtTick !== null,
  };
}

/** Animation state for every actor, in processing order (echoes by index, then the player). */
export function allActorAnimStates(view: SimView): ActorAnimState[] {
  return view.actors.map((a) => actorAnimState(view, a));
}

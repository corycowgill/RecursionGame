import type { ActorId, InteractionKind, RecordedInteraction } from './temporal';
import type { EntityId, EntityKind } from './entities';

/**
 * SimEvent stream — produced by the simulation each tick (and by TemporalGame for meta operations such as
 * rewind). Consumers (audio, VFX, UI, analytics) treat events as READ-ONLY notifications: nothing they do may
 * feed back into the simulation. Events are not part of SimState and are not hashed.
 *
 * Every event carries the tick on which it happened. Positions are in sim units (see numeric.ts).
 * Events produced during snapshot re-simulation (scrubbing/preview) are suppressed.
 */
interface EventBase {
  tick: number;
}

export type SimEvent =
  // ---- actors ----
  | (EventBase & { type: 'footstep'; actorId: ActorId; x: number; y: number; z: number; foot: 0 | 1 })
  | (EventBase & { type: 'pickup'; actorId: ActorId; entityId: EntityId; entityKind: EntityKind })
  | (EventBase & { type: 'drop'; actorId: ActorId; entityId: EntityId; entityKind: EntityKind })
  | (EventBase & {
      type: 'interact';
      actorId: ActorId;
      entityId: EntityId;
      entityKind: EntityKind;
      kind: InteractionKind;
    })
  | (EventBase & {
      type: 'interactFailed';
      actorId: ActorId;
      entityId: EntityId | null;
      reason: string;
    })
  | (EventBase & {
      type: 'divergence';
      actorId: ActorId;
      loopId: number;
      echoIndex: number;
      expected: RecordedInteraction;
      actual: RecordedInteraction;
    })
  | (EventBase & { type: 'echoFinished'; actorId: ActorId; loopId: number; echoIndex: number })
  // ---- puzzle components ----
  | (EventBase & { type: 'plateDown'; entityId: EntityId })
  | (EventBase & { type: 'plateUp'; entityId: EntityId })
  | (EventBase & { type: 'doorOpen'; entityId: EntityId }) // started opening
  | (EventBase & { type: 'doorClose'; entityId: EntityId }) // started closing
  | (EventBase & { type: 'doorBlocked'; entityId: EntityId }) // wants to close, doorway occupied
  | (EventBase & { type: 'switchOn'; entityId: EntityId; actorId: ActorId | null })
  | (EventBase & { type: 'switchOff'; entityId: EntityId })
  | (EventBase & { type: 'switchTick'; entityId: EntityId; remainingTicks: number }) // once per second while on
  | (EventBase & { type: 'cellInserted'; entityId: EntityId; cellId: EntityId; actorId: ActorId | null })
  | (EventBase & { type: 'cellRemoved'; entityId: EntityId; cellId: EntityId; actorId: ActorId | null })
  | (EventBase & { type: 'elevatorStart'; entityId: EntityId; fromY: number; toY: number })
  | (EventBase & { type: 'elevatorArrive'; entityId: EntityId; y: number })
  /** A lift starts waiting in place (state.held) because an actor straddles its shaft edge (departure or mid-travel). */
  | (EventBase & { type: 'elevatorHeld'; entityId: EntityId; y: number })
  | (EventBase & { type: 'laserOn'; entityId: EntityId })
  | (EventBase & { type: 'laserOff'; entityId: EntityId })
  | (EventBase & { type: 'receiverLit'; entityId: EntityId })
  | (EventBase & { type: 'receiverUnlit'; entityId: EntityId })
  | (EventBase & { type: 'gateOpen'; entityId: EntityId })
  | (EventBase & { type: 'gateClose'; entityId: EntityId })
  /** Wants to close (signal dropped) but an actor overlaps the gate cell, so it stays open (QA-2). Like doorBlocked. */
  | (EventBase & { type: 'gateBlocked'; entityId: EntityId })
  | (EventBase & { type: 'platformDepart'; entityId: EntityId })
  | (EventBase & { type: 'platformArrive'; entityId: EntityId })
  | (EventBase & { type: 'portalActivated'; entityId: EntityId })
  | (EventBase & { type: 'portalDeactivated'; entityId: EntityId })
  /** Escape hatch for new gameplay events without editing this contract; prefer adding a typed member. */
  | (EventBase & { type: 'entity'; name: string; entityId: EntityId; actorId?: ActorId; value?: number })
  // ---- chamber / temporal (emitted by TemporalGame) ----
  | (EventBase & { type: 'levelLoaded'; levelId: string })
  | (EventBase & { type: 'recordStart'; loopCount: number })
  | (EventBase & { type: 'rewind'; fromTick: number; loopCount: number })
  | (EventBase & { type: 'echoSpawned'; actorId: ActorId; loopId: number; echoIndex: number })
  | (EventBase & { type: 'echoLimitReached'; maxEchoes: number })
  | (EventBase & { type: 'loopDeleted'; loopId: number; echoIndex: number })
  | (EventBase & { type: 'chamberRestart' })
  | (EventBase & { type: 'loopTimeUp'; maxTicks: number })
  | (EventBase & { type: 'levelComplete'; levelId: string; echoesUsed: number; ticks: number });

export type SimEventType = SimEvent['type'];
export type SimEventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;

/** Events relevant to the timeline (interaction markers + divergence). */
export const TIMELINE_EVENT_TYPES: readonly SimEventType[] = [
  'pickup',
  'drop',
  'interact',
  'interactFailed',
  'divergence',
  'echoFinished',
];

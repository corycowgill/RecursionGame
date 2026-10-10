import type { EntityId, EntityKind, LevelDefinition, SimView } from '../../engine/contracts';

/**
 * PUZZLE OBJECTIVES — read-only status of what the exit (and every wired consumer) is waiting for. UI uses it
 * for the objective panel ("2 / 3 conditions"), renderers for indicator lights on doors and portals.
 */

export interface ObjectiveCondition {
  /** Source entity feeding the consumer. */
  entityId: EntityId;
  kind: EntityKind;
  label: string;
  /** Wire inverted (condition satisfied while the source is OFF). */
  inverted: boolean;
  satisfied: boolean;
}

export interface ConsumerStatus {
  entityId: EntityId;
  logic: 'and' | 'or';
  conditions: ObjectiveCondition[];
  satisfiedCount: number;
  /** Combined result of the inputs (as seen on the last simulated tick). */
  powered: boolean;
}

export interface ObjectiveStatus {
  exitId: EntityId;
  objective: string;
  exitActive: boolean;
  exit: ConsumerStatus;
  complete: boolean;
  completedAtTick: number | null;
}

const KIND_LABEL: Record<EntityKind, string> = {
  pressurePlate: 'Pressure plate',
  door: 'Door',
  timedSwitch: 'Timed switch',
  crate: 'Crate',
  energyCell: 'Energy cell',
  energySocket: 'Energy socket',
  elevator: 'Lift',
  laserEmitter: 'Laser emitter',
  laserReceiver: 'Laser receiver',
  temporalGate: 'Temporal gate',
  movingPlatform: 'Moving platform',
  exitPortal: 'Exit portal',
};

/** Status of one wired consumer (door, portal, gate…). */
export function consumerStatus(level: LevelDefinition, view: SimView, consumerId: EntityId): ConsumerStatus {
  const def = level.entities.find((e) => e.id === consumerId);
  const logic = def?.logic ?? 'and';
  const conditions: ObjectiveCondition[] = level.wires
    .filter((w) => w.to === consumerId)
    .slice()
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .map((w) => {
      const src = level.entities.find((e) => e.id === w.from);
      const kind = (src?.kind ?? 'pressurePlate') as EntityKind;
      const inverted = w.invert === true;
      return {
        entityId: w.from,
        kind,
        label: src?.label ?? KIND_LABEL[kind],
        inverted,
        satisfied: (view.signals[w.from] === true) !== inverted,
      };
    });
  const satisfiedCount = conditions.filter((c) => c.satisfied).length;
  const powered =
    conditions.length === 0 ? true : logic === 'or' ? satisfiedCount > 0 : satisfiedCount === conditions.length;
  return { entityId: consumerId, logic, conditions, satisfiedCount, powered };
}

export function getObjectiveStatus(level: LevelDefinition, view: SimView): ObjectiveStatus {
  const exitDef = level.entities.find((e) => e.id === level.exitId);
  const objective =
    (exitDef?.kind === 'exitPortal' ? exitDef.config.objective : undefined) ?? 'Reach the exit portal';
  const exitEntity = view.entities[level.exitId];
  return {
    exitId: level.exitId,
    objective,
    exitActive: exitEntity?.kind === 'exitPortal' ? exitEntity.state.active : false,
    exit: consumerStatus(level, view, level.exitId),
    complete: view.status === 'complete',
    completedAtTick: view.completedAtTick,
  };
}

import type { EntityKind, PuzzleEntityBehaviour } from '../../engine/contracts';
import { EntityRegistry } from '../../engine/simulation/registry';
import { crateBehaviour } from './crate';
import { doorBehaviour } from './door';
import { elevatorBehaviour } from './elevator';
import { energyCellBehaviour } from './energyCell';
import { energySocketBehaviour } from './energySocket';
import { exitPortalBehaviour } from './exitPortal';
import { laserEmitterBehaviour, laserReceiverBehaviour } from './laser';
import { movingPlatformBehaviour } from './movingPlatform';
import { pressurePlateBehaviour } from './pressurePlate';
import { temporalGateBehaviour } from './temporalGate';
import { timedSwitchBehaviour } from './timedSwitch';

export {
  crateBehaviour,
  doorBehaviour,
  elevatorBehaviour,
  energyCellBehaviour,
  energySocketBehaviour,
  exitPortalBehaviour,
  laserEmitterBehaviour,
  laserReceiverBehaviour,
  movingPlatformBehaviour,
  pressurePlateBehaviour,
  temporalGateBehaviour,
  timedSwitchBehaviour,
};
export { traceBeam, beamEnd, LASER_BEAM_HEIGHT, type BeamTrace } from './laser';

/** Every core behaviour, one per entity kind (all 12 kinds from the brief). */
export const CORE_BEHAVIOURS: readonly PuzzleEntityBehaviour<EntityKind>[] = [
  pressurePlateBehaviour,
  doorBehaviour,
  timedSwitchBehaviour,
  crateBehaviour,
  energyCellBehaviour,
  energySocketBehaviour,
  elevatorBehaviour,
  laserEmitterBehaviour,
  laserReceiverBehaviour,
  temporalGateBehaviour,
  movingPlatformBehaviour,
  exitPortalBehaviour,
] as unknown as readonly PuzzleEntityBehaviour<EntityKind>[];

/**
 * Registers every core entity behaviour. New kinds: add one file per kind and register it here — no engine
 * edits required.
 */
export function registerCoreEntities(registry: EntityRegistry): EntityRegistry {
  registry.register(pressurePlateBehaviour);
  registry.register(doorBehaviour);
  registry.register(timedSwitchBehaviour);
  registry.register(crateBehaviour);
  registry.register(energyCellBehaviour);
  registry.register(energySocketBehaviour);
  registry.register(elevatorBehaviour);
  registry.register(laserEmitterBehaviour);
  registry.register(laserReceiverBehaviour);
  registry.register(temporalGateBehaviour);
  registry.register(movingPlatformBehaviour);
  registry.register(exitPortalBehaviour);
  return registry;
}

export function createDefaultRegistry(): EntityRegistry {
  return registerCoreEntities(new EntityRegistry());
}

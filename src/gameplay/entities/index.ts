import type { EntityKind, PuzzleEntityBehaviour } from '../../engine/contracts';
import { EntityRegistry } from '../../engine/simulation/registry';
import { checkValveBehaviour } from './checkValve';
import { chronoRelayBehaviour } from './chronoRelay';
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
  checkValveBehaviour,
  chronoRelayBehaviour,
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
export { valveAxes, valveSolidFor, oppositeDir } from './checkValve';
export { clampRelayDelay } from './chronoRelay';
export { actorMatchesClass } from './common';

/** Every behaviour, one per entity kind (the 12 core kinds from the brief, then the round-6 expansion kinds). */
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
  checkValveBehaviour,
  chronoRelayBehaviour,
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
  // Round 6 expansion kinds (registered after the core 12; registration order never affects simulation order).
  registry.register(checkValveBehaviour);
  registry.register(chronoRelayBehaviour);
  return registry;
}

export function createDefaultRegistry(): EntityRegistry {
  return registerCoreEntities(new EntityRegistry());
}

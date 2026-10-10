import { EntityRegistry } from '../../engine/simulation/registry';
import { crateBehaviour } from './crate';
import { doorBehaviour } from './door';
import { exitPortalBehaviour } from './exitPortal';
import { pressurePlateBehaviour } from './pressurePlate';

export { crateBehaviour, doorBehaviour, exitPortalBehaviour, pressurePlateBehaviour };

/**
 * Registers every implemented entity behaviour. Gameplay engineers: add new kinds here (one file per kind)
 * — no engine edits required.
 */
export function registerCoreEntities(registry: EntityRegistry): EntityRegistry {
  registry.register(pressurePlateBehaviour);
  registry.register(doorBehaviour);
  registry.register(crateBehaviour);
  registry.register(exitPortalBehaviour);
  return registry;
}

export function createDefaultRegistry(): EntityRegistry {
  return registerCoreEntities(new EntityRegistry());
}

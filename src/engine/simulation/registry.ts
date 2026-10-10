import type { EntityKind, EntityRegistryLike, PuzzleEntityBehaviour } from '../contracts';

/**
 * EntityRegistry — maps entity kinds to behaviours. Gameplay code registers behaviours here; the engine
 * never imports gameplay modules. See src/gameplay/entities/index.ts for the default registry.
 */
export class EntityRegistry implements EntityRegistryLike {
  private readonly map = new Map<EntityKind, PuzzleEntityBehaviour<EntityKind>>();

  register<K extends EntityKind>(behaviour: PuzzleEntityBehaviour<K>): void {
    // Behaviours are contravariant in K; the registry stores them type-erased and only ever calls a behaviour
    // with entities of its own kind.
    this.map.set(behaviour.kind, behaviour as unknown as PuzzleEntityBehaviour<EntityKind>);
  }

  get(kind: EntityKind): PuzzleEntityBehaviour<EntityKind> | undefined {
    return this.map.get(kind);
  }

  has(kind: EntityKind): boolean {
    return this.map.has(kind);
  }

  kinds(): EntityKind[] {
    return [...this.map.keys()].sort();
  }

  clone(): EntityRegistry {
    const r = new EntityRegistry();
    for (const b of this.map.values()) r.register(b);
    return r;
  }
}

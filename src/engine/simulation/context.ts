import {
  PHYS,
  UNITS_PER_TILE,
  fdiv,
  type ActorId,
  type ActorState,
  type AnySimEntity,
  type EntityContext,
  type EntityId,
  type EntityKind,
  type InteractContext,
  type LevelRuntime,
  type SimContext,
  type SimEntity,
  type SimEvent,
  type SimState,
} from '../contracts';
import { actorOverlapsCell } from '../physics/collision';
import { buildSurfaceOverrides, cellSurfaceY } from '../physics/terrain';
import { rngInt, rngNext } from './rng';

/** Internal implementation of SimContext for one tick. */
export class TickContext implements SimContext {
  readonly tick: number;
  readonly runtime: LevelRuntime;
  readonly state: SimState;
  /** Signals being written this tick (become state.signals at the end of the tick). */
  readonly nextSignals: Record<EntityId, boolean>;
  private readonly sink: SimEvent[] | null;

  constructor(runtime: LevelRuntime, state: SimState, sink: SimEvent[] | null) {
    this.tick = state.tick;
    this.runtime = runtime;
    this.state = state;
    this.sink = sink;
    this.nextSignals = { ...state.signals };
  }

  random(): number {
    const r = rngNext(this.state.rng);
    this.state.rng = r.state;
    return r.value;
  }

  randomInt(maxExclusive: number): number {
    return rngInt(this.random(), maxExclusive);
  }

  emit(event: SimEvent): void {
    if (this.sink) this.sink.push(event);
  }

  signal(id: EntityId): boolean {
    return this.state.signals[id] === true;
  }

  inputsPowered(id: EntityId): boolean | null {
    const wires = this.runtime.inputsOf(id);
    if (wires.length === 0) return null;
    const logic = this.runtime.def(id).logic ?? 'and';
    if (logic === 'or') {
      for (const w of wires) if (this.signal(w.from) !== (w.invert === true)) return true;
      return false;
    }
    for (const w of wires) if (this.signal(w.from) === (w.invert === true)) return false;
    return true;
  }

  getEntity(id: EntityId): AnySimEntity | undefined {
    return this.state.entities[id];
  }

  getActor(id: ActorId): ActorState | undefined {
    for (const a of this.state.actors) if (a.id === id) return a;
    return undefined;
  }

  actorsOnCell(col: number, row: number, y: number): ActorState[] {
    const out: ActorState[] = [];
    for (const a of this.state.actors) {
      if (fdiv(a.x, UNITS_PER_TILE) !== col || fdiv(a.z, UNITS_PER_TILE) !== row) continue;
      const d = a.y - y;
      if (d > PHYS.STEP_TOLERANCE || d < -PHYS.STEP_TOLERANCE) continue;
      out.push(a);
    }
    return out;
  }

  actorsOverlappingCell(col: number, row: number, y: number): ActorState[] {
    const out: ActorState[] = [];
    for (const a of this.state.actors) {
      const d = a.y - y;
      if (d >= 1000 || d <= -1000) continue;
      if (actorOverlapsCell(a, col, row)) out.push(a);
    }
    return out;
  }

  entitiesInCell(col: number, row: number): AnySimEntity[] {
    const out: AnySimEntity[] = [];
    for (const id of this.runtime.entityOrder) {
      const e = this.state.entities[id];
      if (!e || e.carriedBy !== null) continue;
      if (fdiv(e.x, UNITS_PER_TILE) === col && fdiv(e.z, UNITS_PER_TILE) === row) out.push(e);
    }
    return out;
  }

  surfaceY(col: number, row: number): number | null {
    return cellSurfaceY(this.runtime, buildSurfaceOverrides(this.runtime, this.state), col, row);
  }

  /** Builds a per-entity context (prototype-chained to this tick context). */
  forEntity<K extends EntityKind>(entity: SimEntity<K>): EntityContext<K> {
    const def = this.runtime.def(entity.id);
    const nextSignals = this.nextSignals;
    const ctx = Object.create(this) as EntityContext<K> & { entity: SimEntity<K> };
    Object.defineProperties(ctx, {
      entity: { value: entity },
      def: { value: def },
      config: { value: def.config },
      setOutput: {
        value: (v: boolean) => {
          nextSignals[entity.id] = v;
        },
      },
    });
    return ctx;
  }

  forInteraction<K extends EntityKind>(
    entity: SimEntity<K>,
    actor: ActorState,
    verb: 'interact' | 'action',
    ownership: OwnershipOps,
  ): InteractContext<K> {
    const base = this.forEntity(entity);
    const item = actor.carrying !== null ? (this.state.entities[actor.carrying] ?? null) : null;
    const ctx = Object.create(base) as InteractContext<K>;
    Object.defineProperties(ctx, {
      actor: { value: actor },
      verb: { value: verb },
      item: { value: item },
      releaseItemTo: { value: (x: number, y: number, z: number) => ownership.release(actor, x, y, z) },
      giveItemToActor: { value: (id: EntityId) => ownership.give(actor, id) },
    });
    return ctx;
  }
}

export interface OwnershipOps {
  release(actor: ActorState, x: number, y: number, z: number): AnySimEntity;
  give(actor: ActorState, entityId: EntityId): boolean;
}

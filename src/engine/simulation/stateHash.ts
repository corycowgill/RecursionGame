import type { LevelRuntime, SimState } from '../contracts';
import { Fnv1a } from './hash';

/**
 * Canonical world hash: FNV-1a over tick, status, rng, actors (array order), entities (id order, using
 * behaviour.serialize when provided) and signals (id order). Identical states => identical hashes on every
 * machine. Used per tick by the determinism tests and the replay harness.
 */
export function hashState(rt: LevelRuntime, s: SimState): number {
  const h = new Fnv1a();
  h.num(s.tick);
  h.str(s.status);
  h.value(s.completedAtTick);
  h.num(s.rng);
  h.value(s.actors);
  for (const id of rt.entityOrder) {
    const e = s.entities[id];
    if (!e) {
      h.byte(0);
      continue;
    }
    h.str(id);
    h.str(e.kind);
    h.num(e.x);
    h.num(e.y);
    h.num(e.z);
    h.value(e.carriedBy);
    const b = rt.behaviourFor(e.kind);
    h.value(b.serialize ? b.serialize(e.state) : e.state);
  }
  for (const id of rt.entityOrder) h.value(s.signals[id] === true);
  return h.digest();
}

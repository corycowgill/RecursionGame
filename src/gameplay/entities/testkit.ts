import type { EntityDefinition, LevelDefinition, LevelRecursion, SimEvent, SimView, Wire } from '../../engine/contracts';
import { S } from '../../testing/harness/script';

/**
 * Tiny synthetic chambers for the round-6 mechanic tests (chronoRelay / checkValve / attuned devices). Test-only
 * helper: never imported by the app.
 */
export interface MiniOpts {
  tiles: string[];
  heights?: string[];
  entities: EntityDefinition[];
  wires?: Wire[];
  spawn: { col: number; row: number; facing?: 0 | 1 | 2 | 3 };
  exit: { col: number; row: number };
  maxEchoes?: number;
  recursion?: LevelRecursion;
  loopDurationTicks?: number;
}

export function mini(id: string, o: MiniOpts): LevelDefinition {
  const lvl: LevelDefinition = {
    id,
    order: 0,
    name: id,
    grid: { width: o.tiles[0]!.length, height: o.tiles.length, tiles: o.tiles },
    entities: [...o.entities, { id: 'exit', kind: 'exitPortal', col: o.exit.col, row: o.exit.row, config: {} }],
    wires: o.wires ?? [],
    playerSpawn: o.spawn,
    exitId: 'exit',
    maxEchoes: o.maxEchoes ?? 3,
    loopDurationTicks: o.loopDurationTicks ?? 3600,
    parTimeSeconds: 10,
    hints: [],
    solution: [[S.wait(1)]],
  };
  if (o.heights) lvl.grid.heights = o.heights;
  if (o.recursion) lvl.recursion = o.recursion;
  return lvl;
}

export const ent = <T extends EntityDefinition>(e: T): T => e;

export function entityOf<K extends EntityDefinition['kind']>(view: SimView, id: string, kind: K) {
  const e = view.entities[id];
  if (!e || e.kind !== kind) throw new Error(`no ${kind} '${id}'`);
  return e as Extract<SimView['entities'][string], { kind: K }>;
}

export const playerOf = (view: SimView) => view.actors[view.actors.length - 1]!;

/** Generic `entity` events with the given name. */
export function named(events: readonly SimEvent[], name: string): Extract<SimEvent, { type: 'entity' }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: 'entity' }> => e.type === 'entity' && e.name === name);
}

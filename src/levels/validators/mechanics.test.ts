import { describe, expect, it } from 'vitest';
import type { EntityDefinition, LevelDefinition, Wire } from '../../engine/contracts';
import { mini } from '../../gameplay/entities/testkit';
import { validateLevel } from './validateLevel';

/** Round-6 authoring rules (validators/mechanics.ts) for chrono relays and check valves. Attuned rules: attuned.test.ts. */
const issues = (l: LevelDefinition) => validateLevel(l).map((i) => `${i.severity}: ${i.message}`);
const errors = (l: LevelDefinition) => issues(l).filter((m) => m.startsWith('error'));

function relayLevel(cfg: { delayTicks: number }, wires: Wire[], extra: EntityDefinition[] = [], loop = 3600): LevelDefinition {
  return mini('relay-validate', {
    tiles: ['########', '#......#', '#......#', '########'],
    entities: [
      { id: 'plate', kind: 'pressurePlate', col: 2, row: 1, config: {} },
      { id: 'relay', kind: 'chronoRelay', col: 7, row: 1, config: cfg },
      { id: 'door', kind: 'door', col: 4, row: 2, config: {} },
      ...extra,
    ],
    wires,
    spawn: { col: 1, row: 1 },
    exit: { col: 6, row: 2 },
    loopDurationTicks: loop,
  });
}

describe('chrono relay validator', () => {
  const ok: Wire[] = [
    { from: 'plate', to: 'relay' },
    { from: 'relay', to: 'door' },
  ];
  it('accepts a relay on a wall cell with an input (no non-walkable warning)', () => {
    expect(issues(relayLevel({ delayTicks: 120 }, ok))).toEqual([]);
  });
  it('rejects bad delays and a missing input', () => {
    expect(errors(relayLevel({ delayTicks: 29 }, ok)).length).toBe(1);
    expect(errors(relayLevel({ delayTicks: 901 }, ok)).length).toBe(1);
    expect(errors(relayLevel({ delayTicks: 60.5 }, ok)).length).toBe(1);
    expect(errors(relayLevel({ delayTicks: 60 }, [{ from: 'relay', to: 'door' }])).some((m) => m.includes('no input'))).toBe(true);
  });
  it('warns when the delay eats the loop', () => {
    expect(issues(relayLevel({ delayTicks: 600 }, ok, [], 700)).some((m) => m.startsWith('warning') && m.includes('relay'))).toBe(true);
  });
  it('rejects feedback into its own input (directly or through a door)', () => {
    expect(errors(relayLevel({ delayTicks: 60 }, [...ok, { from: 'relay', to: 'relay' }])).some((m) => m.includes('back into its own input'))).toBe(true);
    expect(errors(relayLevel({ delayTicks: 60 }, [...ok, { from: 'door', to: 'relay' }])).some((m) => m.includes('back into its own input'))).toBe(true);
  });
});

describe('check valve validator', () => {
  const valve = (o: Partial<EntityDefinition> = {}, tiles?: string[], wires: Wire[] = [], extra: EntityDefinition[] = []) =>
    mini('valve-validate', {
      tiles: tiles ?? ['#########', '#.......#', '#########'],
      entities: [{ id: 'valve', kind: 'checkValve', col: 4, row: 1, facing: 1, config: {}, ...o } as EntityDefinition, ...extra],
      wires,
      spawn: { col: 1, row: 1 },
      exit: { col: 7, row: 1 },
    });
  it('accepts a valve across a corridor', () => {
    expect(issues(valve())).toEqual([]);
  });
  it('requires solid lateral neighbours, walkable same-height approaches and a floor cell', () => {
    expect(errors(valve({}, ['#########', '#.......#', '####.####'])).some((m) => m.includes('lateral'))).toBe(true);
    expect(errors(valve({}, ['#########', '#...#...#', '#########'])).some((m) => m.includes('flat floor'))).toBe(true);
    expect(errors(valve({}, ['#########', '#..#....#', '#########'])).some((m) => m.includes('upstream'))).toBe(true);
    const high = valve();
    high.grid.heights = ['000000000', '000001000', '000000000'];
    expect(errors(high).some((m) => m.includes('downstream') && m.includes('height'))).toBe(true);
  });
  it('allows one entity per cell, no outputs, and checks reverseWhenPowered wiring', () => {
    const plate: EntityDefinition = { id: 'plate', kind: 'pressurePlate', col: 2, row: 1, config: {} };
    expect(errors(valve({}, undefined, [], [{ id: 'p2', kind: 'pressurePlate', col: 4, row: 1, config: {} }])).some((m) => m.includes('shares'))).toBe(true);
    expect(errors(valve({ config: { reverseWhenPowered: true } } as Partial<EntityDefinition>)).some((m) => m.includes('reverseWhenPowered'))).toBe(true);
    expect(issues(valve({}, undefined, [{ from: 'plate', to: 'valve' }], [plate])).some((m) => m.startsWith('warning') && m.includes('reverseWhenPowered'))).toBe(true);
    expect(errors(valve({}, undefined, [{ from: 'valve', to: 'exit' }])).some((m) => m.includes('no output'))).toBe(true);
    expect(issues(valve({ config: { reverseWhenPowered: true } } as Partial<EntityDefinition>, undefined, [{ from: 'plate', to: 'valve' }], [plate]))).toEqual([]);
  });
});

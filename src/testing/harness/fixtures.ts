import type { EntityDefinition, LevelDefinition, Wire } from '../../engine/contracts';

/**
 * Small synthetic levels for engine/QA tests (not campaign content).
 */
function room(width: number, height: number): string[] {
  const rows: string[] = [];
  for (let r = 0; r < height; r++) {
    if (r === 0 || r === height - 1) rows.push('#'.repeat(width));
    else rows.push('#' + '.'.repeat(width - 2) + '#');
  }
  return rows;
}

function baseLevel(over: Partial<LevelDefinition> & Pick<LevelDefinition, 'id' | 'grid' | 'entities'>): LevelDefinition {
  return {
    order: 0,
    name: over.id,
    wires: [] as Wire[],
    playerSpawn: { col: 2, row: 2 },
    exitId: 'exit',
    maxEchoes: 3,
    loopDurationTicks: 1800,
    parTimeSeconds: 30,
    hints: [],
    solution: [[{ op: 'wait', ticks: 1 }]],
    ...over,
  };
}

/** 16x12 open room; exit tucked in the far corner (unwired = always active). */
export function openRoom(maxEchoes = 3, extra: EntityDefinition[] = []): LevelDefinition {
  return baseLevel({
    id: 'fixture-open-room',
    maxEchoes,
    grid: { width: 16, height: 12, tiles: room(16, 12) },
    playerSpawn: { col: 7, row: 6 },
    entities: [{ id: 'exit', kind: 'exitPortal', col: 14, row: 10, config: {} }, ...extra],
  });
}

/**
 * Crate room: carry the crate onto the plate to open the door to the exit. Solvable without echoes.
 *   r0 ###########
 *   r1 #.........#
 *   r2 #.S...C...#   S spawn (2,2), C crate (6,2)
 *   r3 #.........#
 *   r4 #.......P.#   P plate (8,4)
 *   r5 ####.######   door (4,5)
 *   r6 #...X.....#   exit (4,6)
 *   r7 ###########
 */
export function crateRoom(maxEchoes = 2): LevelDefinition {
  return baseLevel({
    id: 'fixture-crate-room',
    maxEchoes,
    grid: {
      width: 11,
      height: 8,
      tiles: ['###########', '#.........#', '#.........#', '#.........#', '#.........#', '####.######', '#.........#', '###########'],
    },
    playerSpawn: { col: 2, row: 2, facing: 1 },
    entities: [
      { id: 'crate-1', kind: 'crate', col: 6, row: 2, config: {} },
      { id: 'plate-1', kind: 'pressurePlate', col: 8, row: 4, config: {} },
      { id: 'door-1', kind: 'door', col: 4, row: 5, config: {} },
      { id: 'exit', kind: 'exitPortal', col: 4, row: 6, config: {} },
    ],
    wires: [{ from: 'plate-1', to: 'door-1' }],
    solution: [
      [
        { op: 'moveTo', col: 5, row: 2 },
        { op: 'face', dir: 1 },
        { op: 'interact' },
        { op: 'moveTo', col: 8, row: 3 },
        { op: 'face', dir: 2 },
        { op: 'interact' },
        { op: 'moveTo', col: 4, row: 4 },
        { op: 'moveTo', col: 4, row: 6 },
      ],
    ],
  });
}

/**
 * Terrain room: a raised platform (height 1) reached by a ramp, with a ledge elsewhere.
 *   r0 ##########
 *   r1 #........#
 *   r2 #...>....#   ramp (4,2) ascending east onto platform cols 5-7 rows 1-3 (height 1)
 *   r3 #........#
 *   r4 #........#
 *   r5 ##########
 */
export function terrainRoom(): LevelDefinition {
  return baseLevel({
    id: 'fixture-terrain-room',
    grid: {
      width: 10,
      height: 6,
      tiles: ['##########', '#........#', '#...>....#', '#........#', '#........#', '##########'],
      heights: ['0000000000', '0000011100', '0000011100', '0000011100', '0000000000', '0000000000'],
    },
    playerSpawn: { col: 2, row: 2, facing: 1 },
    entities: [{ id: 'exit', kind: 'exitPortal', col: 8, row: 4, config: {} }],
  });
}

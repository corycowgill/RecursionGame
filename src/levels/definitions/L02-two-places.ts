import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 2 — TWO PLACES AT ONCE  (teaches: simultaneous echoes, chained dependencies)
 *
 * Two sealed doors in series. The Atrium Door (A) answers to a plate in the far west of the entry hall; the
 * Sanctum Door (B) answers to a plate at the end of a narrow bridge over the abyss — and that bridge is only
 * reachable THROUGH door A. One echo can hold plate A, but somebody else must already be standing on plate B
 * when you reach door B. Two echoes, acting at the same time.
 *
 *   col: 0         1
 *        01234567890123456
 *   r0   #################
 *   r1   #######...#######   sanctum
 *   r2   #######.X.#######   X exit (8,2)
 *   r3   ########.########   B sanctum door (8,3)  <- plate B
 *   r4   #__=.........=__#   atrium
 *   r5   #__=.O.....O...b#   b plate B (15,5) at the end of the east bridge
 *   r6   #__=.........=__#
 *   r7   ########.########   A atrium door (8,7)   <- plate A
 *   r8   #...............#   entry hall
 *   r9   #a..O.......O...#   a plate A (1,9)
 *   r10  #.......S.......#   S spawn (8,10)
 *   r11  #...............#
 *   r12  #################
 *
 * Known solution: Echo 1 holds plate A. Echo 2 passes door A (opened by Echo 1) and walks out onto the bridge to
 * plate B. The player follows through both doors. Unsolvable solo and with a single echo (verified in tests).
 */
export const level02TwoPlaces: LevelDefinition = {
  id: 'L02-two-places',
  order: 2,
  name: 'Two Places at Once',
  subtitle: 'Every echo acts in the same moment.',
  story: [
    'Ascendant Facility — Atrium of Doubles.',
    'Two doors. Two plates. One of them lies beyond the other.',
    'Your past selves do not take turns. They act together.',
  ],
  grid: {
    width: 17,
    height: 13,
    tiles: [
      '#################',
      '#######...#######',
      '#######...#######',
      '########.########',
      '#__=.........=__#',
      '#__=.O.....O....#',
      '#__=.........=__#',
      '########.########',
      '#...............#',
      '#...O.......O...#',
      '#...............#',
      '#...............#',
      '#################',
    ],
  },
  entities: [
    { id: 'plate-a', kind: 'pressurePlate', col: 1, row: 9, label: 'Hall Plate', config: {} },
    { id: 'plate-b', kind: 'pressurePlate', col: 15, row: 5, label: 'Bridge Plate', config: {} },
    { id: 'door-a', kind: 'door', col: 8, row: 7, facing: 0, label: 'Atrium Door', config: {} },
    { id: 'door-b', kind: 'door', col: 8, row: 3, facing: 0, label: 'Sanctum Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 8, row: 2, label: 'Exit', config: { objective: 'Pass both doors and reach the portal' } },
  ],
  wires: [
    { from: 'plate-a', to: 'door-a' },
    { from: 'plate-b', to: 'door-b' },
  ],
  playerSpawn: { col: 8, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 3,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 14,
  parEchoes: 2,
  hints: [
    { text: 'The bridge plate can only be reached through the first door.' },
    { text: 'One echo holds the hall plate. A second echo can walk through behind it.', afterSeconds: 30 },
    { text: 'Echoes replay together: Echo 1 opens the way for Echo 2, and both hold the way open for you.', afterSeconds: 60 },
  ],
  solution: [
    // Echo 1: hold the hall plate.
    [
      { op: 'moveTo', col: 1, row: 10 },
      { op: 'moveTo', col: 1, row: 9 },
      { op: 'wait', ticks: 20 },
    ],
    // Echo 2: through door A (waits for Echo 1), across the atrium and out onto the bridge plate.
    [
      { op: 'moveTo', col: 8, row: 8 },
      { op: 'moveTo', col: 8, row: 6 },
      { op: 'moveTo', col: 12, row: 6 },
      { op: 'moveTo', col: 12, row: 5 },
      { op: 'moveTo', col: 15, row: 5 },
      { op: 'wait', ticks: 20 },
    ],
    // Final run: through both doors to the portal.
    [
      { op: 'moveTo', col: 8, row: 8 },
      { op: 'moveTo', col: 8, row: 4 },
      { op: 'moveTo', col: 8, row: 2 },
    ],
  ],
  camera: {
    focus: { col: 8, row: 6 },
    yawStep: 0,
    zoom: 1.1,
    introPath: [
      { col: 8, row: 10 },
      { col: 1, row: 9 },
      { col: 8, row: 7 },
      { col: 15, row: 5 },
      { col: 8, row: 2 },
    ],
  },
  decor: [
    { type: 'observationWindow', col: 8, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 8, row: 2, facing: 2, params: { scale: 1.3 } },
    { type: 'archway', col: 8, row: 7, facing: 0 },
    { type: 'archway', col: 8, row: 3, facing: 0 },
    { type: 'conduit', col: 2, row: 9, facing: 1, params: { to: 'door-a', color: 'teal' } },
    { type: 'conduit', col: 14, row: 5, facing: 3, params: { to: 'door-b', color: 'teal' } },
    { type: 'machinery', col: 1, row: 4, facing: 1, params: { variant: 'gears' } },
    { type: 'machinery', col: 15, row: 11, facing: 3, params: { variant: 'pistons' } },
    { type: 'lamp', col: 4, row: 4, facing: 1 },
    { type: 'lamp', col: 12, row: 4, facing: 3 },
    { type: 'lamp', col: 1, row: 11, facing: 1 },
    { type: 'lamp', col: 15, row: 8, facing: 3 },
    { type: 'hologram', col: 8, row: 9, params: { text: 'SIMULTANEITY', color: 'cyan' } },
    { type: 'abyssLight', col: 1, row: 5, params: { color: 'cyan' } },
    { type: 'abyssLight', col: 15, row: 4, params: { color: 'cyan' } },
  ],
  seed: 202,
  teaches: ['multipleEchoes', 'simultaneity', 'chainedDoors'],
};

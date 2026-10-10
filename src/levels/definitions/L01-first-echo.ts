import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 1 — FIRST ECHO  (teaches: record / rewind / replay, pressure plate, door)
 *
 * A colonnaded calibration hall floats over the abyss. The sanctum door (D) to the north answers to a single
 * pressure plate (P) on a balcony at the far east edge — far too far to step off it and reach the door before it
 * seals (4 ticks to solid). Record a loop standing on the plate, rewind, and walk through while your echo holds it.
 *
 *   col: 0         1
 *        012345678901234
 *   r0   ###############
 *   r1   #####.....#####   sanctum
 *   r2   #####..X..#####   X exit portal (7,2)
 *   r3   #####.....#####
 *   r4   #######.#######   D door (7,4)  <- P
 *   r5   #__=.......=__#
 *   r6   #__=.O...O.=__#   O pillars, _ abyss behind railings (=)
 *   r7   #__=.......=.P#   P plate (13,7) on the east balcony
 *   r8   #__=.O...O....#   balcony bridge (11..13, 7..8)
 *   r9   #__=.......=__#
 *   r10  #__=...S...=__#   S spawn (7,10)
 *   r11  #__=.......=__#
 *   r12  ###############
 *
 * Known solution (machine-verified): Echo 1 walks to the plate and stays; the player walks north through the
 * open door to the portal. Solo is impossible (verified in tests).
 */
export const level01FirstEcho: LevelDefinition = {
  id: 'L01-first-echo',
  order: 1,
  name: 'First Echo',
  subtitle: 'Record. Rewind. Repeat.',
  story: [
    'Ascendant Facility — Calibration Wing.',
    'The sanctum door answers only to weight on the far plate.',
    'You are only one person. For now.',
  ],
  grid: {
    width: 15,
    height: 13,
    tiles: [
      '###############',
      '#####.....#####',
      '#####.....#####',
      '#####.....#####',
      '#######.#######',
      '#__=.......=__#',
      '#__=.O...O.=__#',
      '#__=.......=..#',
      '#__=.O...O....#',
      '#__=.......=__#',
      '#__=.......=__#',
      '#__=.......=__#',
      '###############',
    ],
  },
  entities: [
    { id: 'plate-a', kind: 'pressurePlate', col: 13, row: 7, label: 'Balcony Plate', config: {} },
    { id: 'door-a', kind: 'door', col: 7, row: 4, facing: 0, label: 'Sanctum Door', config: { openTicks: 18 } },
    { id: 'exit', kind: 'exitPortal', col: 7, row: 2, label: 'Exit', config: { objective: 'Reach the sanctum portal' } },
  ],
  wires: [{ from: 'plate-a', to: 'door-a' }],
  playerSpawn: { col: 7, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 12,
  parEchoes: 1,
  hints: [
    { text: 'Step on the plate: the door opens. Step off: it seals again.' },
    { text: 'Press R to rewind. Your echo will repeat everything you just did.', afterSeconds: 15 },
    { text: 'Let your echo hold the plate while you walk through the door.', afterSeconds: 40 },
  ],
  solution: [
    // Echo 1: cross the hall to the balcony plate and hold it.
    [
      { op: 'moveTo', col: 10, row: 10 },
      { op: 'moveTo', col: 10, row: 8 },
      { op: 'moveTo', col: 13, row: 8 },
      { op: 'moveTo', col: 13, row: 7 },
      { op: 'wait', ticks: 20 },
    ],
    // Final run: straight up the nave, through the door (waits for it), onto the portal.
    [
      { op: 'moveTo', col: 7, row: 5 },
      { op: 'moveTo', col: 7, row: 2 },
    ],
  ],
  camera: {
    focus: { col: 7, row: 6 },
    yawStep: 0,
    zoom: 1,
    introPath: [
      { col: 7, row: 10 },
      { col: 13, row: 7 },
      { col: 7, row: 4 },
      { col: 7, row: 2 },
    ],
  },
  decor: [
    { type: 'observationWindow', col: 7, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 7, row: 2, facing: 2, params: { scale: 1.4 } },
    { type: 'archway', col: 7, row: 4, facing: 0 },
    { type: 'conduit', col: 12, row: 7, facing: 3, params: { to: 'door-a', color: 'teal' } },
    { type: 'lamp', col: 4, row: 5, facing: 1 },
    { type: 'lamp', col: 10, row: 5, facing: 3 },
    { type: 'lamp', col: 4, row: 11, facing: 1 },
    { type: 'lamp', col: 10, row: 11, facing: 3 },
    { type: 'machinery', col: 1, row: 6, facing: 1, params: { variant: 'gears' } },
    { type: 'machinery', col: 13, row: 10, facing: 3, params: { variant: 'pistons' } },
    { type: 'hologram', col: 7, row: 9, params: { text: 'CALIBRATION', color: 'gold' } },
    { type: 'abyssLight', col: 1, row: 9, params: { color: 'cyan' } },
    { type: 'abyssLight', col: 13, row: 5, params: { color: 'cyan' } },
  ],
  seed: 101,
  teaches: ['echo', 'rewind', 'pressurePlate', 'door'],
};

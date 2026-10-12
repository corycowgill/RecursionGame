import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 11 — THE SUMP  (round 6; campaign order 5. Teaches: the CHECK VALVE. Passing is permanent, so plan who commits:
 * give the one who goes down every other job first.)
 *
 * The Exit Door needs the Pump Plate AND the Hall Plate held at the same moment. The Pump Plate lies at the bottom of
 * the sump, and the only way into the sump is the Sump Valve: a one-way ratchet that lets bodies (and whatever they
 * carry) through eastward and never back. The Pump Plate counts bodies only. The Hall Plate, a few steps from the Exit
 * Door, takes a body or the chamber's only crate, which sits in the Store behind the Store Door; the Store Door opens
 * only while the Store Plate (by the valve, 7 tiles from the Store) is held.
 *
 *   col: 0         1
 *        0123456789012345
 *   r0   ################
 *   r1   #c..#######....#   c crate (1,1) in the Store (1..3, 1..2)      sump (11..14, 1..6), no other way out
 *   r2   #...#######....#
 *   r3   ##T########....#   T Store Door (2,3) <- Store Plate
 *   r4   #........s#....#   s Store Plate (9,4)
 *   r5   #.........V..p.#   V Sump Valve (10,5), passes EAST only     p Pump Plate (13,5), bodies only
 *   r6   #..O...O..#....#
 *   r7   #.........######   hall (1..9, 4..9)
 *   r8   #....@....######   @ spawn (5,8)
 *   r9   #........h######   h Hall Plate (9,9), takes the crate
 *   r10  #####D##########   D Exit Door (5,10) <- Pump Plate AND Hall Plate
 *   r11  ####.X.#########   X exit (5,11)
 *   r12  ################
 *
 * Intended solution (1 echo): Echo 1 holds the Store Plate while you fetch the crate, then walks through the valve onto
 * the Pump Plate and stays there (it has no choice). You carry the crate onto the Hall Plate and walk out. Recording the
 * echo straight into the sump first leaves the Store shut: whoever commits must do its other job first.
 * The lesson beat: carrying the crate down into the sump wastes it (the Pump Plate ignores crates, and the crate can
 * never come back up).
 * Minimum 1 echo (body count): at the win someone stands on the Pump Plate, sealed in the sump, and you stand at the
 * exit, outside it. The Exit Door has no deadline and the pump holder can never leave, so there is no doorstop.
 * Standing on the Hall Plate yourself and running for the door fails: the door is 5 tiles away and shuts in 0.1 s.
 * Alone, the Store cannot be opened either: the Store Plate is 7 tiles from the Store Door.
 */
export const level11TheSump: LevelDefinition = {
  id: 'L11-the-sump',
  order: 5,
  name: 'The Sump',
  subtitle: 'Whatever goes down stays down.',
  story: [
    'Chronometry Lab — The Sump.',
    'The sump valve turns one way only. Whatever goes down stays down, so send it down last.',
    'LOG 036 · Pumped the sump dry again. Somebody was already standing at the bottom. Same coat as mine. — H.A.',
  ],
  grid: {
    width: 16,
    height: 13,
    tiles: [
      '################',
      '#...#######....#',
      '#...#######....#',
      '##.########....#',
      '#.........#....#',
      '#..............#',
      '#..O...O..#....#',
      '#.........######',
      '#.........######',
      '#.........######',
      '#####.##########',
      '####...#########',
      '################',
    ],
  },
  entities: [
    { id: 'crate-store', kind: 'crate', col: 1, row: 1, label: 'Crate', config: {} },
    { id: 'plate-store', kind: 'pressurePlate', col: 9, row: 4, label: 'Store Plate', config: {} },
    { id: 'door-store', kind: 'door', col: 2, row: 3, facing: 0, label: 'Store Door', config: {} },
    { id: 'valve-sump', kind: 'checkValve', col: 10, row: 5, facing: 1, label: 'Sump Valve - one way down', config: {} },
    { id: 'plate-pump', kind: 'pressurePlate', col: 13, row: 5, label: 'Pump Plate - bodies only', config: { acceptsCrates: false } },
    { id: 'plate-hall', kind: 'pressurePlate', col: 9, row: 9, label: 'Hall Plate', config: {} },
    { id: 'door-exit', kind: 'door', col: 5, row: 10, facing: 0, logic: 'and', label: 'Exit Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 5, row: 11, label: 'Exit', config: { objective: 'Hold the Pump Plate and the Hall Plate, then leave' } },
  ],
  wires: [
    { from: 'plate-store', to: 'door-store' },
    { from: 'plate-pump', to: 'door-exit' },
    { from: 'plate-hall', to: 'door-exit' },
  ],
  playerSpawn: { col: 5, row: 8, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 17,
  parEchoes: 1,
  hints: [
    { text: 'The Exit Door needs the Pump Plate and the Hall Plate held at the same moment. The Pump Plate counts bodies only.' },
    { text: 'The Sump Valve only turns inward: whoever goes down stays down. Give that echo its other job first. A crate carried down there never comes back up.', afterSeconds: 25 },
    { text: 'Echo 1: hold the Store Plate while you fetch the crate, then walk down onto the Pump Plate. You: crate onto the Hall Plate, then the door.', afterSeconds: 55 },
  ],
  solution: [
    // Loop 1 (Echo 1): hold the Store Plate for 5 s (you fetch the crate meanwhile), then through the valve onto the
    // Pump Plate. It can never come back, and it does not need to.
    [
      { op: 'moveTo', col: 9, row: 8 },
      { op: 'moveTo', col: 9, row: 4 },
      { op: 'wait', ticks: 300 },
      { op: 'moveTo', col: 9, row: 5 },
      { op: 'moveTo', col: 13, row: 5 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: into the Store while it is open, the crate onto the Hall Plate, then out through the Exit Door.
    [
      { op: 'moveTo', col: 5, row: 4 },
      { op: 'moveTo', col: 2, row: 4 },
      { op: 'moveTo', col: 2, row: 1, timeoutTicks: 300 },
      { op: 'face', dir: 3 },
      { op: 'interact' },
      { op: 'moveTo', col: 2, row: 4 },
      { op: 'moveTo', col: 2, row: 9 },
      { op: 'moveTo', col: 8, row: 9 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'moveTo', col: 5, row: 9 },
      { op: 'moveTo', col: 5, row: 11, timeoutTicks: 600 },
    ],
  ],
  camera: {
    focus: { col: 8, row: 6 },
    yawStep: 0,
    zoom: 1.05,
    introPath: [
      { col: 5, row: 8 },
      { col: 9, row: 4 },
      { col: 2, row: 3 },
      { col: 1, row: 1 },
      { col: 10, row: 5 },
      { col: 13, row: 5 },
      { col: 9, row: 9 },
      { col: 5, row: 10 },
      { col: 5, row: 11 },
    ],
  },
  decor: [
    { type: 'archway', col: 5, row: 10, facing: 0, params: { indicators: 2 } },
    { type: 'archway', col: 10, row: 5, facing: 1, params: { indicators: 1 } },
    { type: 'archway', col: 2, row: 3, facing: 0, params: { indicators: 1 } },
    { type: 'conduit', col: 15, row: 5, facing: 3, params: { to: 'door-exit', color: 'teal' } },
    { type: 'conduit', col: 9, row: 10, facing: 0, params: { to: 'door-exit', color: 'teal' } },
    { type: 'conduit', col: 8, row: 3, facing: 2, params: { to: 'door-store', color: 'teal' } },
    { type: 'machinery', col: 15, row: 2, facing: 3, params: { variant: 'pistons' } },
    { type: 'machinery', col: 15, row: 6, facing: 3, params: { variant: 'pistons' } },
    { type: 'machinery', col: 0, row: 7, facing: 1, params: { variant: 'gears' } },
    { type: 'machinery', col: 3, row: 0, facing: 2, params: { variant: 'winch' } },
    { type: 'lamp', col: 12, row: 1, facing: 2 },
    { type: 'lamp', col: 1, row: 4, facing: 1 },
    { type: 'lamp', col: 1, row: 9, facing: 1 },
    { type: 'hologram', col: 6, row: 5, params: { text: 'ONE WAY DOWN', color: 'teal' } },
    { type: 'abyssLight', col: 13, row: 3, params: { color: 'cyan' } },
  ],
  seed: 1111,
  teaches: ['checkValve', 'commit'],
};

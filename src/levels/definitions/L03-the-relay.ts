import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 3 — THE RELAY  (VERTICAL SLICE: three cooperating loops, movable crate, pressure plates, timed door, exit)
 * Teaches: carrying crates, timed switches, timing a press for another self.
 *
 * The Chrono Door (T) opens only while ALL THREE of its conditions hold at once:
 *   - the Crate Plate (c, NW corner) is weighed down,
 *   - the Watch Plate (w, NE corner) is weighed down,
 *   - the timed switch (S) has been pressed within the last 4 seconds.
 * The switch stands on a balcony across the abyss, visible from the door, but the only way there is the long
 * service corridor: ~9 s from the switch back to the door or to either plate. Whoever presses it can neither hold
 * a plate nor make the door in time, and the crate can stand in for exactly one body.
 *
 *   Loop 1 (Echo 1): carry the crate onto the Crate Plate, then stand on the Watch Plate.
 *   Loop 2 (Echo 2): walk the corridor to the switch and press it once Echo 1 is in place.
 *   Loop 3 (you)   : wait at the Chrono Door, walk through during the window, reach the portal.
 *
 *   col: 0         1
 *        01234567890123456789
 *   r0   ####################
 *   r1   #####.....##########   sanctum
 *   r2   #####..X..##########   X exit (7,2)
 *   r3   #######.############   T chrono door (7,3)
 *   r4   ###.........=____###   great hall (3..11, 4..10); abyss (13..16)
 *   r5   ###c.O...O.w=____.S#   c crate plate (3,5)  w watch plate (11,5)  S timed switch (18,5)
 *   r6   ###.........=____..#   switch balcony (17..18, 5..12)
 *   r7   ###.........=____..#
 *   r8   ###..O...O..=____..#
 *   r9   ###.C..@....=____..#   C crate (4,9)  @ spawn (7,9)
 *   r10  ###.........=____..#
 *   r11  ###########.#####..#   hall exit (11,11)
 *   r12  ###########........#   service corridor
 *   r13  ####################
 *
 * Minimum echoes is 2 (verified in tests): P-holder + switch-presser + you = 3 bodies at the opening moment, and
 * the crate covers the remaining plate. maxEchoes = 2, so the crate is essential.
 */
export const level03TheRelay: LevelDefinition = {
  id: 'L03-the-relay',
  order: 3,
  name: 'The Relay',
  subtitle: 'Hand the moment forward.',
  story: [
    'Ascendant Facility — Chrono Vault.',
    'The vault door listens for three things at once: two weights, and a heartbeat from the far balcony.',
    'You cannot be in three places. But you can be in three moments.',
  ],
  grid: {
    width: 20,
    height: 14,
    tiles: [
      '####################',
      '#####.....##########',
      '#####.....##########',
      '#######.############',
      '###.........=____###',
      '###..O...O..=____..#',
      '###.........=____..#',
      '###.........=____..#',
      '###..O...O..=____..#',
      '###.........=____..#',
      '###.........=____..#',
      '###########.#####..#',
      '###########........#',
      '####################',
    ],
  },
  entities: [
    { id: 'crate-a', kind: 'crate', col: 4, row: 9, label: 'Crate', config: {} },
    { id: 'plate-crate', kind: 'pressurePlate', col: 3, row: 5, label: 'Crate Plate', config: {} },
    { id: 'plate-watch', kind: 'pressurePlate', col: 11, row: 5, label: 'Watch Plate', config: {} },
    {
      id: 'switch-far',
      kind: 'timedSwitch',
      col: 18,
      row: 5,
      facing: 2,
      label: 'Balcony Switch',
      config: { durationTicks: 240, retrigger: true },
    },
    { id: 'door-chrono', kind: 'door', col: 7, row: 3, facing: 0, label: 'Chrono Door', config: { openTicks: 15 } },
    { id: 'exit', kind: 'exitPortal', col: 7, row: 2, label: 'Exit', config: { objective: 'Open the Chrono Door and reach the portal' } },
  ],
  wires: [
    { from: 'plate-crate', to: 'door-chrono' },
    { from: 'plate-watch', to: 'door-chrono' },
    { from: 'switch-far', to: 'door-chrono' },
  ],
  playerSpawn: { col: 7, row: 9, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 14,
  parEchoes: 2,
  hints: [
    { text: 'The Chrono Door needs both plates held AND the balcony switch pressed — all at the same moment.' },
    { text: 'Press {interact} facing the crate to lift it, and {interact} again to set it down on the cell in front of you.', afterSeconds: 30 },
    { text: 'The switch is too far: whoever presses it cannot get back in time. Let an echo press it for you.', afterSeconds: 55 },
    { text: 'Loop 1: crate onto one plate, then stand on the other. Loop 2: press the switch. Then go.', afterSeconds: 85 },
  ],
  solution: [
    // Loop 1 (Echo 1): crate -> Crate Plate, then hold the Watch Plate.
    [
      { op: 'moveTo', col: 5, row: 9 },
      { op: 'face', dir: 3 },
      { op: 'interact' },
      { op: 'moveTo', col: 3, row: 9 },
      { op: 'moveTo', col: 3, row: 6 },
      { op: 'face', dir: 0 },
      { op: 'interact' },
      { op: 'moveTo', col: 11, row: 6 },
      { op: 'moveTo', col: 11, row: 5 },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 2 (Echo 2): the long corridor to the balcony switch; press it once Echo 1 holds the Watch Plate.
    [
      { op: 'moveTo', col: 11, row: 10 },
      { op: 'moveTo', col: 11, row: 12 },
      { op: 'moveTo', col: 18, row: 12 },
      { op: 'moveTo', col: 18, row: 6 },
      { op: 'face', dir: 0 },
      { op: 'waitUntil', tick: 540 },
      { op: 'interact' },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: wait at the Chrono Door, walk through while it is open, step onto the portal.
    [
      { op: 'moveTo', col: 7, row: 4 },
      { op: 'moveTo', col: 7, row: 2 },
    ],
  ],
  camera: {
    focus: { col: 10, row: 7 },
    yawStep: 0,
    zoom: 1.2,
    introPath: [
      { col: 7, row: 9 },
      { col: 4, row: 9 },
      { col: 3, row: 5 },
      { col: 11, row: 5 },
      { col: 18, row: 5 },
      { col: 7, row: 3 },
      { col: 7, row: 2 },
    ],
  },
  decor: [
    { type: 'observationWindow', col: 7, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 7, row: 2, facing: 2, params: { scale: 1.5, clockwork: true } },
    { type: 'archway', col: 7, row: 3, facing: 0, params: { indicators: 3 } },
    { type: 'conduit', col: 4, row: 5, facing: 1, params: { to: 'door-chrono', color: 'teal' } },
    { type: 'conduit', col: 10, row: 5, facing: 3, params: { to: 'door-chrono', color: 'teal' } },
    { type: 'conduit', col: 17, row: 5, facing: 3, params: { to: 'door-chrono', color: 'gold', span: 'abyss' } },
    { type: 'machinery', col: 19, row: 8, facing: 3, params: { variant: 'clockwork' } },
    { type: 'machinery', col: 3, row: 11, facing: 0, params: { variant: 'gears' } },
    { type: 'lamp', col: 3, row: 7, facing: 1 },
    { type: 'lamp', col: 11, row: 7, facing: 3 },
    { type: 'lamp', col: 12, row: 12, facing: 0 },
    { type: 'lamp', col: 16, row: 12, facing: 0 },
    { type: 'lamp', col: 17, row: 9, facing: 1 },
    { type: 'hologram', col: 7, row: 7, params: { text: 'RELAY', color: 'gold' } },
    { type: 'abyssLight', col: 14, row: 6, params: { color: 'cyan' } },
    { type: 'abyssLight', col: 15, row: 10, params: { color: 'violet' } },
  ],
  seed: 303,
  teaches: ['crate', 'carry', 'timedSwitch', 'timing', 'threeLoops'],
};

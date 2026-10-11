import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 4 — THE LIFT  (teaches: elevators, vertical separation, boarding together, the lift "moment")
 *
 * The chamber is split into two storeys. The exit sanctum opens off the UPPER GALLERY (height 2), and its door
 * answers only to the Gallery Plate at the far east end of that gallery. The only way up is the Freight Lift in
 * the south-west corner — and the lift rises only while somebody stands on the Call Plate, alone in the far
 * south-east of the LOWER HALL. Whoever calls the lift can never ride it; whoever rides it must already be aboard
 * when the call comes. And once it rises, it stays up for as long as the call is held.
 *
 *   col: 0         1
 *        012345678901234567
 *   r0   ##################
 *   r1   ########.X.#######   sanctum (h2)          X exit (9,1)
 *   r2   #########D########   D sanctum door (9,2)  <- Gallery Plate
 *   r3   #...............g#   upper gallery (h2)    g Gallery Plate (16,3)
 *   r4   #....O......O....#
 *   r5   #=L==============#   gallery railing (h2)  L Freight Lift shaft (2,5): h0 <-> h2, rises while Call Plate held
 *   r6   #................#   lower hall (h0)
 *   r7   #................#
 *   r8   #.....O.....O....#
 *   r9   #................#
 *   r10  #...@............#   @ spawn (4,10)
 *   r11  #..............c.#   c Call Plate (15,11)
 *   r12  #................#
 *   r13  ##################
 *
 * Known solution (2 echoes): Echo 1 walks to the Call Plate and holds it. Echo 2 boards the lift first, rides up
 * when Echo 1 arrives, and holds the Gallery Plate. You board together with Echo 2, ride up, and walk into the
 * open sanctum. One echo is not enough: the caller cannot ride, and the gallery plate needs a body of its own.
 */
export const level04TheLift: LevelDefinition = {
  id: 'L04-the-lift',
  order: 4,
  name: 'The Lift',
  subtitle: 'Somebody has to stay behind.',
  story: [
    'Ascendant Facility — Freight Stack, Lower Hall.',
    'The lift answers a call from the far end of the hall, and climbs only while the call is held.',
    'Whoever presses the call will watch the others rise without them. Be aboard before you call yourself.',
  ],
  grid: {
    width: 18,
    height: 14,
    tiles: [
      '##################',
      '########...#######',
      '#########.########',
      '#................#',
      '#....O......O....#',
      '#=_==============#',
      '#................#',
      '#................#',
      '#.....O.....O....#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '##################',
    ],
    heights: [
      '222222222222222222',
      '222222222222222222',
      '222222222222222222',
      '222222222222222222',
      '222222222222222222',
      '222222222222222222',
      '000000000000000000',
      '000000000000000000',
      '000000000000000000',
      '000000000000000000',
      '000000000000000000',
      '000000000000000000',
      '000000000000000000',
      '000000000000000000',
    ],
  },
  entities: [
    { id: 'lift', kind: 'elevator', col: 2, row: 5, level: 0, label: 'Freight Lift', config: { levels: [0, 2], mode: 'signal', ticksPerLevel: 50 } },
    { id: 'plate-call', kind: 'pressurePlate', col: 15, row: 11, label: 'Call Plate', config: { acceptsCrates: true } },
    { id: 'plate-gallery', kind: 'pressurePlate', col: 16, row: 3, label: 'Gallery Plate', config: {} },
    { id: 'door-sanctum', kind: 'door', col: 9, row: 2, facing: 0, label: 'Sanctum Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 9, row: 1, label: 'Exit', config: { objective: 'Ride the lift and reach the sanctum' } },
  ],
  wires: [
    { from: 'plate-call', to: 'lift' },
    { from: 'plate-gallery', to: 'door-sanctum' },
  ],
  playerSpawn: { col: 4, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 3,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 20,
  parEchoes: 2,
  hints: [
    { text: 'The lift climbs only while the Call Plate is held — and drops again when it is released.' },
    { text: 'Whoever stands on the Call Plate can never ride. Someone has to be aboard before the call comes.', afterSeconds: 35 },
    { text: 'Echo 1 holds the Call Plate. Echo 2 rides up and holds the Gallery Plate. Ride up beside Echo 2.', afterSeconds: 65 },
  ],
  solution: [
    // Loop 1 (Echo 1): the caller — walk the length of the hall and hold the Call Plate.
    [{ op: 'moveTo', col: 15, row: 10 }, { op: 'moveTo', col: 15, row: 11 }, { op: 'wait', ticks: 30 }],
    // Loop 2 (Echo 2): board the lift before the call arrives, ride up, hold the Gallery Plate.
    [
      { op: 'moveTo', col: 2, row: 7 },
      { op: 'moveTo', col: 2, row: 5 },
      { op: 'waitUntil', tick: 360 },
      { op: 'moveTo', col: 2, row: 3 },
      { op: 'moveTo', col: 16, row: 3 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: board with Echo 2, ride up, walk into the open sanctum.
    [
      { op: 'moveTo', col: 2, row: 7 },
      { op: 'moveTo', col: 2, row: 5 },
      { op: 'waitUntil', tick: 360 },
      { op: 'moveTo', col: 2, row: 3 },
      { op: 'moveTo', col: 9, row: 3 },
      { op: 'moveTo', col: 9, row: 1 },
    ],
  ],
  camera: {
    focus: { col: 9, row: 7 },
    yawStep: 0,
    zoom: 1.15,
    introPath: [
      { col: 4, row: 10 },
      { col: 15, row: 11 },
      { col: 2, row: 5, level: 1 },
      { col: 16, row: 3, level: 2 },
      { col: 9, row: 2, level: 2 },
      { col: 9, row: 1, level: 2 },
    ],
  },
  decor: [
    { type: 'observationWindow', col: 9, row: 0, level: 2, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 9, row: 1, level: 2, facing: 2, params: { scale: 1.2, clockwork: true } },
    { type: 'archway', col: 9, row: 2, level: 2, facing: 0, params: { indicators: 1 } },
    { type: 'machinery', col: 1, row: 6, facing: 1, params: { variant: 'winch' } },
    { type: 'machinery', col: 1, row: 4, level: 2, facing: 1, params: { variant: 'gears' } },
    { type: 'conduit', col: 17, row: 11, facing: 3, params: { to: 'lift', color: 'teal' } },
    { type: 'conduit', col: 17, row: 3, level: 2, facing: 3, params: { to: 'door-sanctum', color: 'teal' } },
    { type: 'lamp', col: 1, row: 9, facing: 1 },
    { type: 'lamp', col: 16, row: 7, facing: 3 },
    { type: 'lamp', col: 1, row: 3, level: 2, facing: 1 },
    { type: 'lamp', col: 16, row: 4, level: 2, facing: 3 },
    { type: 'hologram', col: 9, row: 9, params: { text: 'LIFT', color: 'gold' } },
    { type: 'banner', col: 6, row: 3, level: 2, facing: 2, params: { color: 'gold' } },
    { type: 'banner', col: 12, row: 3, level: 2, facing: 2, params: { color: 'gold' } },
  ],
  seed: 404,
  teaches: ['elevator', 'verticalSeparation', 'boardTogether'],
};

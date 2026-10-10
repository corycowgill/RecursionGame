import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 8 — RECURSIVE MACHINE  (teaches: the nested loop — one recording, two bodies, five seconds apart)
 *
 * The Recursion Engine at the heart of this chamber re-loops every recording: when you commit a loop, your echo
 * replays it from the start AND a recursive copy of that echo replays the very same inputs 5 s later
 * (LevelDefinition.recursion). The copy waits on the spawn dais until its turn. One echo, two bodies — but the
 * second one always walks five seconds behind the first, through a world the first one has already changed.
 *
 * The Core Door needs the Shaft Plate (at the top of the machine shaft, behind the Machine Door) AND the Threshold
 * Plate (right in front of the Machine Door) held at the same time. The Machine Door opens only while the Feed Plate
 * in the east of the hall is held, and the Feed Plate is too far from the door to hold it and get through. You
 * have one echo.
 *
 *   col: 0         1
 *        01234567890123456789
 *   r0   ####################
 *   r1   #...#####s##########   core sanctum (1..3, 1..3)   s Shaft Plate (9,1) at the top of the shaft
 *   r2   #.X.#####.##########   X exit (2,2)
 *   r3   #...#####.##########
 *   r4   ##C######M##########   C Core Door (2,4) <- Shaft AND Threshold    M Machine Door (9,4) <- Feed Plate
 *   r5   #........t.........#   t Threshold Plate (9,5)
 *   r6   #..............O...#
 *   r7   #...O..............#
 *   r8   #..................#
 *   r9   #...............f..#   f Feed Plate (16,9)
 *   r10  #....@.............#   @ spawn dais (5,10) — recursive copies wait here for their turn
 *   r11  #..................#
 *   r12  ####################
 *
 * Known solution (1 echo + its recursive copy): record ONE loop: walk to the Feed Plate and stand on it for more
 * than 5 s, then walk to the Machine Door and keep pushing north into it. When recorded the door is shut and you go
 * nowhere. On replay the copy arrives on the Feed Plate while the echo is still standing there, so the door stays
 * open when the echo leaves: the echo walks through and up the shaft onto the Shaft Plate. Five seconds later the
 * copy leaves the Feed Plate, the door shuts in front of it, and it ends up pushing against the door — standing on
 * the Threshold Plate. Both plates held: the Core Door opens for you. Without the copy there are only two bodies
 * for three jobs.
 */
export const level08RecursiveMachine: LevelDefinition = {
  id: 'L08-recursive-machine',
  order: 8,
  name: 'Recursive Machine',
  subtitle: 'A loop inside the loop.',
  story: [
    'Ascendant Facility — The Recursion Engine.',
    'The engine folds every recording back on itself. Your echo will have an echo of its own, five seconds behind.',
    'Same steps. Same presses. A different world, because the first of you already walked through it.',
  ],
  grid: {
    width: 20,
    height: 13,
    tiles: [
      '####################',
      '#...#####.##########',
      '#...#####.##########',
      '#...#####.##########',
      '##.######.##########',
      '#..................#',
      '#..............O...#',
      '#...O..............#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '####################',
    ],
  },
  entities: [
    { id: 'plate-feed', kind: 'pressurePlate', col: 16, row: 9, label: 'Feed Plate', config: {} },
    { id: 'door-machine', kind: 'door', col: 9, row: 4, facing: 0, label: 'Machine Door', config: {} },
    { id: 'plate-shaft', kind: 'pressurePlate', col: 9, row: 1, label: 'Shaft Plate', config: {} },
    { id: 'plate-threshold', kind: 'pressurePlate', col: 9, row: 5, label: 'Threshold Plate', config: {} },
    { id: 'door-core', kind: 'door', col: 2, row: 4, facing: 0, label: 'Core Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 2, row: 2, label: 'Exit', config: { objective: 'Hold the Shaft and Threshold plates at once' } },
  ],
  wires: [
    { from: 'plate-feed', to: 'door-machine' },
    { from: 'plate-shaft', to: 'door-core' },
    { from: 'plate-threshold', to: 'door-core' },
  ],
  playerSpawn: { col: 5, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 1,
  recursion: { delayTicks: 300, copies: 1 },
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 22,
  parEchoes: 1,
  hints: [
    { text: 'Every echo here has a recursive copy that repeats it exactly, 5 s later. One echo is two bodies.' },
    { text: 'Stand on the Feed Plate long enough and your copy arrives before you leave. The door never closes on you.', afterSeconds: 45 },
    {
      text: 'Hold the Feed Plate for 6 s, then push north into the Machine Door and keep pushing. The copy will be stopped at the threshold.',
      afterSeconds: 100,
    },
  ],
  solution: [
    // Loop 1 (Echo 1 + recursive copy): feed for > 5 s, then push into the Machine Door and keep pushing north.
    [
      { op: 'moveTo', col: 16, row: 9 },
      { op: 'wait', ticks: 330 },
      { op: 'moveTo', col: 9, row: 5 },
      { op: 'move', dx: 0, dz: -1, ticks: 360 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: wait by the Core Door; walk in when both plates are held.
    [
      { op: 'moveTo', col: 2, row: 5 },
      { op: 'moveTo', col: 2, row: 2, timeoutTicks: 1500 },
    ],
  ],
  camera: {
    focus: { col: 9, row: 6 },
    yawStep: 0,
    zoom: 1.15,
    introPath: [
      { col: 5, row: 10 },
      { col: 16, row: 9 },
      { col: 9, row: 5 },
      { col: 9, row: 4 },
      { col: 9, row: 1 },
      { col: 2, row: 4 },
      { col: 2, row: 2 },
    ],
  },
  decor: [
    { type: 'ring', col: 5, row: 10, facing: 0, params: { scale: 1.6, clockwork: true, color: 'violet' } },
    { type: 'ring', col: 9, row: 2, facing: 2, params: { scale: 1.0, clockwork: true } },
    { type: 'observationWindow', col: 2, row: 0, facing: 2, params: { width: 3 } },
    { type: 'archway', col: 9, row: 4, facing: 0, params: { indicators: 1 } },
    { type: 'archway', col: 2, row: 4, facing: 0, params: { indicators: 2 } },
    { type: 'conduit', col: 16, row: 12, facing: 0, params: { to: 'door-machine', color: 'teal' } },
    { type: 'conduit', col: 8, row: 4, facing: 2, params: { to: 'door-core', color: 'violet' } },
    { type: 'machinery', col: 18, row: 6, facing: 3, params: { variant: 'recursionEngine' } },
    { type: 'machinery', col: 1, row: 8, facing: 1, params: { variant: 'clockwork' } },
    { type: 'lamp', col: 18, row: 11, facing: 3 },
    { type: 'lamp', col: 1, row: 11, facing: 1 },
    { type: 'lamp', col: 10, row: 5, facing: 0 },
    { type: 'hologram', col: 5, row: 8, params: { text: 'LOOP ⊂ LOOP', color: 'violet' } },
  ],
  seed: 808,
  teaches: ['recursion', 'nestedLoop', 'selfRelay'],
};

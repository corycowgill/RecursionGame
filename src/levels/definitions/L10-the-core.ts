import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 10 — THE CORE  (finale: every component, three echoes, one moment)
 *
 * The exit crowns the Core, a monumental dais two storeys above the Great Hall. Everything in the chamber is wired
 * to wake it:
 *   1. THE COURIER carries the energy cell into the Reliquary — an alcove behind a temporal gate that only echoes
 *      may cross — and seats it in the socket. (Recording it, you push into the shimmer and your press fails. Your
 *      echo walks through and the press lands: the failure from Level 7, put to work.)
 *   2. The socket fires the Core Laser down the sealed optics gallery into the Core Receiver. The receiver raises the
 *      Core Lift — and starts the Ferry over the west abyss. Both stay powered for good.
 *   3. THE FERRYMAN is aboard the ferry when it wakes, crosses to the Relic Island, takes the crate, rides back, sets
 *      it on the Crown Plate, then walks to the West Timer.
 *   4. THE TIMEKEEPER waits at the East Timer. The Crown Door opens only while the Crown Plate is weighted AND both
 *      timers are lit (2.5 s each, 16 tiles apart): the Ferryman and the Timekeeper press them together.
 *   5. YOU are standing on the Core Lift when the cell goes in. You rise with the Core, and walk through the crown.
 *
 *   col: 0         1         2
 *        01234567890123456789012345
 *   r0   ##########################
 *   r1   #########...##############   crown (h2)            X exit (10,1)
 *   r2   ##########D####R........L#   D Crown Door (10,2)    R Core Receiver (15,2) <-beam- L Core Laser (24,2)
 *   r3   #______.......############   Core dais (h2, 7..13 x 3..5) beside the Great Abyss (1..6)
 *   r4   #______.......#######K####   K Reliquary socket (21,4)
 *   r5   #______.......#######.####   Reliquary (21,5)
 *   r6   #______===^===#######G####   ^ Core Lift (10,6) h0<->h2      G echo-only temporal gate (21,6) <- NOT socket
 *   r7   #______..................#   Great Hall (h0, 7..24 x 7..15)
 *   r8   #______..................#
 *   r9   #______..p...............#   p Crown Plate (9,9)
 *   r10  #..____.......@...c......#   Relic Island (1..2, 10..12)   @ spawn (14,10)   c energy cell (18,10)
 *   r11  #bF____......O.....O.....#   b crate (1,11)   F Ferry (6,11) <-> (3,11)
 *   r12  #..____..................#
 *   r13  #______..................#
 *   r14  #______..................#
 *   r15  #______.w...............e#   w West Timer (8,15)   e East Timer (24,15)
 *   r16  ##########################
 *
 * Minimum echoes is 3: at the finish both timers need a hand each (they are 6.7 s apart and lit for 2.5 s), the crate
 * must already be on the Crown Plate, and the Courier is sealed in the Reliquary: the gate closes for good once the
 * socket is powered (inverted wire). Round 5, puzzle analyst: before that seal the solver found a 2-echo route — the
 * Courier's blind recording simply walked back out through the open echo gate and took the East Timer itself.
 */
export const level10TheCore: LevelDefinition = {
  id: 'L10-the-core',
  order: 18,
  name: 'The Core',
  subtitle: 'Everything you have been, at once.',
  story: [
    'Ascendant Facility — The Core.',
    'Every machine you have learned answers to it. Courier, ferryman, timekeeper and you: one moment.',
    'LOG 000 · For whoever wakes next: your name is Ansel. So was mine. Wake the Core, and let us go home.',
  ],
  grid: {
    width: 26,
    height: 17,
    tiles: [
      '##########################',
      '#########...##############',
      '##########.####..........#',
      '#______.......############',
      '#______.......#######.####',
      '#______.......#######.####',
      '#______===_===#######.####',
      '#______..................#',
      '#______..................#',
      '#______..................#',
      '#..____..................#',
      '#..____......O.....O.....#',
      '#..____..................#',
      '#______..................#',
      '#______..................#',
      '#______..................#',
      '##########################',
    ],
    heights: [
      '22222222222222000000000000',
      '22222222222222000000000000',
      '22222222222222000000000000',
      '22222222222222000000000000',
      '22222222222222000000000000',
      '22222222222222000000000000',
      '22222222222222000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
      '00000000000000000000000000',
    ],
  },
  entities: [
    { id: 'cell-core', kind: 'energyCell', col: 18, row: 10, label: 'Core Cell', config: {} },
    { id: 'gate-reliquary', kind: 'temporalGate', col: 21, row: 6, facing: 0, label: 'Reliquary Gate', config: { allows: 'echoes' } },
    { id: 'socket-reliquary', kind: 'energySocket', col: 21, row: 4, label: 'Reliquary Socket', config: { allowExtract: false } },
    { id: 'laser-core', kind: 'laserEmitter', col: 24, row: 2, facing: 3, label: 'Core Laser', config: { rangeTiles: 12 } },
    { id: 'receiver-core', kind: 'laserReceiver', col: 15, row: 2, label: 'Core Receiver', config: {} },
    { id: 'lift-core', kind: 'elevator', col: 10, row: 6, level: 0, label: 'Core Lift', config: { levels: [0, 2], mode: 'signal', ticksPerLevel: 60 } },
    {
      id: 'ferry',
      kind: 'movingPlatform',
      col: 6,
      row: 11,
      label: 'Ferry',
      config: { path: [{ col: 6, row: 11 }, { col: 3, row: 11 }], speed: 25, pauseTicks: 120, mode: 'pingpong', requiresSignal: true },
    },
    { id: 'crate-relic', kind: 'crate', col: 1, row: 11, label: 'Relic Crate', config: {} },
    { id: 'plate-crown', kind: 'pressurePlate', col: 9, row: 9, label: 'Crown Plate', config: {} },
    { id: 'timer-west', kind: 'timedSwitch', col: 8, row: 15, facing: 0, label: 'West Timer', config: { durationTicks: 150, retrigger: true } },
    { id: 'timer-east', kind: 'timedSwitch', col: 24, row: 15, facing: 0, label: 'East Timer', config: { durationTicks: 150, retrigger: true } },
    { id: 'door-crown', kind: 'door', col: 10, row: 2, facing: 0, label: 'Crown Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 10, row: 1, label: 'Exit', config: { objective: 'Wake the Core and pass the Crown Door' } },
  ],
  wires: [
    { from: 'socket-reliquary', to: 'laser-core' },
    { from: 'socket-reliquary', to: 'gate-reliquary', invert: true },
    { from: 'receiver-core', to: 'lift-core' },
    { from: 'receiver-core', to: 'ferry' },
    { from: 'plate-crown', to: 'door-crown' },
    { from: 'timer-west', to: 'door-crown' },
    { from: 'timer-east', to: 'door-crown' },
  ],
  playerSpawn: { col: 14, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 3,
  loopDurationTicks: 60 * 90,
  parTimeSeconds: 26,
  parEchoes: 3,
  hints: [
    { text: 'Only echoes can cross the Reliquary Gate. Carry the cell into the shimmer and press {interact} — your echo will finish the job.' },
    { text: 'The cell wakes the Core Lift and the Ferry together. Whoever needs to ride either must already be aboard.', afterSeconds: 100 },
    { text: 'The Crown Door needs the crate on the Crown Plate and both timers lit at once: two hands, sixteen tiles apart.', afterSeconds: 200 },
    {
      text: 'Echo 1: cell into the gate. Echo 2: ride the ferry, bring the crate to the Crown Plate, press the West Timer. Echo 3: press the East Timer with Echo 2. You: ride the lift.',
      afterSeconds: 300,
    },
  ],
  solution: [
    // Loop 1 (Echo 1, the Courier): take the cell, push into the echo-only gate, press E at the socket beyond.
    // Recorded: the press fails (the gate is solid for the live player). Replayed: the echo crosses and inserts.
    [
      { op: 'moveTo', col: 17, row: 10 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'moveTo', col: 21, row: 8 },
      { op: 'moveTo', col: 21, row: 7 },
      { op: 'move', dx: 0, dz: -1, ticks: 90 },
      { op: 'interact' },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 2 (Echo 2, the Ferryman): aboard before the Core wakes; island, crate, back; Crown Plate; West Timer.
    [
      { op: 'moveTo', col: 7, row: 10 },
      { op: 'moveTo', col: 7, row: 11 },
      { op: 'moveTo', col: 6, row: 11 },
      { op: 'waitUntil', tick: 590 },
      { op: 'moveTo', col: 2, row: 11 },
      { op: 'face', dir: 3 },
      { op: 'interact' },
      { op: 'moveTo', col: 3, row: 11 },
      { op: 'waitUntil', tick: 800 },
      { op: 'moveTo', col: 7, row: 11 },
      { op: 'moveTo', col: 9, row: 10 },
      { op: 'face', dir: 0 },
      { op: 'interact' },
      { op: 'moveTo', col: 8, row: 14 },
      { op: 'face', dir: 2 },
      { op: 'waitUntil', tick: 1020 },
      { op: 'interact' },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 3 (Echo 3, the Timekeeper): East Timer, pressed together with the Ferryman's West Timer.
    [{ op: 'moveTo', col: 24, row: 14 }, { op: 'face', dir: 2 }, { op: 'waitUntil', tick: 1020 }, { op: 'interact' }, { op: 'wait', ticks: 30 }],
    // Final run: stand on the Core Lift before the cell goes in, rise with the Core, walk through the crown.
    [
      { op: 'moveTo', col: 10, row: 7 },
      { op: 'moveTo', col: 10, row: 6 },
      { op: 'waitUntil', tick: 440 },
      { op: 'moveTo', col: 10, row: 3 },
      { op: 'moveTo', col: 10, row: 1, timeoutTicks: 1200 },
    ],
  ],
  camera: {
    focus: { col: 13, row: 9 },
    yawStep: 0,
    zoom: 1.45,
    introPath: [
      { col: 14, row: 10 },
      { col: 18, row: 10 },
      { col: 21, row: 6 },
      { col: 21, row: 4 },
      { col: 24, row: 2 },
      { col: 15, row: 2 },
      { col: 3, row: 11 },
      { col: 1, row: 11 },
      { col: 9, row: 9 },
      { col: 8, row: 15 },
      { col: 24, row: 15 },
      { col: 10, row: 6, level: 1 },
      { col: 10, row: 2, level: 2 },
      { col: 10, row: 1, level: 2 },
    ],
  },
  decor: [
    { type: 'ring', col: 10, row: 4, level: 2, facing: 2, params: { scale: 2.6, clockwork: true, color: 'gold' } },
    { type: 'ring', col: 10, row: 1, level: 2, facing: 2, params: { scale: 1.4, clockwork: true, color: 'violet' } },
    { type: 'observationWindow', col: 10, row: 0, level: 2, facing: 2, params: { width: 3 } },
    { type: 'archway', col: 10, row: 2, level: 2, facing: 0, params: { indicators: 3 } },
    { type: 'archway', col: 21, row: 6, facing: 0, params: { indicators: 1 } },
    { type: 'banner', col: 7, row: 3, level: 2, facing: 1, params: { color: 'gold' } },
    { type: 'banner', col: 13, row: 3, level: 2, facing: 3, params: { color: 'gold' } },
    { type: 'machinery', col: 8, row: 4, level: 2, facing: 1, params: { variant: 'coreDynamo' } },
    { type: 'machinery', col: 12, row: 4, level: 2, facing: 3, params: { variant: 'coreDynamo' } },
    { type: 'machinery', col: 22, row: 10, facing: 3, params: { variant: 'clockwork' } },
    { type: 'machinery', col: 16, row: 14, facing: 0, params: { variant: 'gears' } },
    { type: 'conduit', col: 20, row: 4, facing: 0, params: { to: 'laser-core', color: 'teal' } },
    { type: 'conduit', col: 14, row: 2, facing: 3, params: { to: 'lift-core', color: 'cyan' } },
    { type: 'conduit', col: 7, row: 16, facing: 0, params: { to: 'ferry', color: 'cyan', span: 'abyss' } },
    { type: 'conduit', col: 9, row: 15, facing: 0, params: { to: 'door-crown', color: 'gold' } },
    { type: 'conduit', col: 23, row: 15, facing: 0, params: { to: 'door-crown', color: 'gold' } },
    { type: 'abyssLight', col: 4, row: 9, params: { color: 'cyan' } },
    { type: 'abyssLight', col: 5, row: 13, params: { color: 'violet' } },
    { type: 'abyssLight', col: 3, row: 5, params: { color: 'gold' } },
    { type: 'ring', col: 3, row: 14, facing: 0, params: { scale: 2.0, clockwork: true } },
    { type: 'lamp', col: 24, row: 8, facing: 3 },
    { type: 'lamp', col: 7, row: 13, facing: 1 },
    { type: 'lamp', col: 16, row: 7, facing: 2 },
    { type: 'lamp', col: 7, row: 5, level: 2, facing: 1 },
    { type: 'lamp', col: 13, row: 5, level: 2, facing: 3 },
    { type: 'hologram', col: 15, row: 13, params: { text: 'CORE', color: 'gold' } },
  ],
  seed: 1010,
  teaches: ['finale', 'temporalGate', 'energySocket', 'allComponents'],
};

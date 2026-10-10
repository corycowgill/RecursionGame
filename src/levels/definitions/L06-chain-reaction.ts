import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 6 — CHAIN REACTION  (teaches: laser relays, signal chains, a three-echo dependency chain)
 *
 * Every step here only becomes possible because of the step before it:
 *   Echo 1 holds the Hall Plate        -> the Lab Door opens          (anyone may now enter the lab)
 *   Echo 2 presses the Relay Switch    -> Laser A fires into Receiver A, which powers Laser B, which fires into
 *                                         Receiver B: the Vault Door and the Core Door both feel it (3 s)
 *   Echo 3 slips into the vault        -> holds the Vault Plate, the Core Door's second condition
 *   You walk through the Core Door while the relay is lit and the vault plate is held.
 * Lasers are stopped by bodies: the relay lives in the lab's west wing, out of everyone's way — keep it that way.
 *
 *   col: 0         1         2
 *        0123456789012345678901
 *   r0   ######################
 *   r1   #########.X.##########   core sanctum          X exit (10,1)
 *   r2   ##########C###########   C Core Door (10,2)    <- Receiver B AND Vault Plate
 *   r3   #Rb....r.....O...#..v#   R Receiver A (1,3)  b Laser B (2,3) ->east  r Receiver B (7,3)  v Vault Plate (20,3)
 *   r4   #...s............#...#   s Relay Switch (4,4)
 *   r5   #................V...#   V Vault Door (17,5)   <- Receiver B
 *   r6   #................#...#
 *   r7   #................#...#
 *   r8   #a......O........#####   a Laser A (1,8) ^north (fired by the Relay Switch)
 *   r9   ##########L###########   L Lab Door (10,9)     <- Hall Plate
 *   r10  #...O...........O....#
 *   r11  #...........@........#   @ spawn (12,11)
 *   r12  #...................h#   h Hall Plate (20,12)
 *   r13  ######################
 *
 * Minimum echoes is 3 by a body count: when you pass the Lab Door someone must be on the Hall Plate, and that body
 * can never reach the lab afterwards; at the finish someone must hold the Vault Plate and someone must have pressed
 * the Relay Switch within the last 2 s — and the switch is more than 2 s from the Core Door.
 */
export const level06ChainReaction: LevelDefinition = {
  id: 'L06-chain-reaction',
  order: 6,
  name: 'Chain Reaction',
  subtitle: 'Each of you is the reason for the next.',
  story: [
    'Ascendant Facility — Optics Laboratory.',
    'The relay was built to be run by a crew of four. The crew is gone. You are still here, four times over.',
    'Light carries the signal. Bodies stop light. Mind where you stand.',
  ],
  grid: {
    width: 22,
    height: 14,
    tiles: [
      '######################',
      '#########...##########',
      '##########.###########',
      '#............O...#...#',
      '#................#...#',
      '#....................#',
      '#................#...#',
      '#................#...#',
      '#.......O........#####',
      '##########.###########',
      '#...O...........O....#',
      '#....................#',
      '#....................#',
      '######################',
    ],
  },
  entities: [
    { id: 'plate-hall', kind: 'pressurePlate', col: 20, row: 12, label: 'Hall Plate', config: {} },
    { id: 'door-lab', kind: 'door', col: 10, row: 9, facing: 0, label: 'Lab Door', config: {} },
    { id: 'switch-relay', kind: 'timedSwitch', col: 4, row: 4, facing: 2, label: 'Relay Switch', config: { durationTicks: 120, retrigger: true } },
    { id: 'laser-a', kind: 'laserEmitter', col: 1, row: 8, facing: 0, label: 'Laser A', config: { rangeTiles: 12 } },
    { id: 'receiver-a', kind: 'laserReceiver', col: 1, row: 3, label: 'Receiver A', config: {} },
    { id: 'laser-b', kind: 'laserEmitter', col: 2, row: 3, facing: 1, label: 'Laser B', config: { rangeTiles: 12 } },
    { id: 'receiver-b', kind: 'laserReceiver', col: 7, row: 3, label: 'Receiver B', config: {} },
    { id: 'door-vault', kind: 'door', col: 17, row: 5, facing: 1, label: 'Vault Door', config: { openTicks: 12 } },
    { id: 'plate-vault', kind: 'pressurePlate', col: 20, row: 3, label: 'Vault Plate', config: {} },
    { id: 'door-core', kind: 'door', col: 10, row: 2, facing: 0, label: 'Core Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 10, row: 1, label: 'Exit', config: { objective: 'Light the relay and pass the Core Door' } },
  ],
  wires: [
    { from: 'plate-hall', to: 'door-lab' },
    { from: 'switch-relay', to: 'laser-a' },
    { from: 'receiver-a', to: 'laser-b' },
    { from: 'receiver-b', to: 'door-vault' },
    { from: 'receiver-b', to: 'door-core' },
    { from: 'plate-vault', to: 'door-core' },
  ],
  playerSpawn: { col: 12, row: 11, facing: 0 },
  exitId: 'exit',
  maxEchoes: 3,
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 20,
  parEchoes: 3,
  hints: [
    { text: 'Follow the light: the Relay Switch fires Laser A, Receiver A fires Laser B, Receiver B opens the doors.' },
    { text: 'Whoever holds the Hall Plate can never follow you into the lab. Neither can whoever presses the switch reach the Core Door in time.', afterSeconds: 40 },
    { text: 'Echo 1: Hall Plate. Echo 2: press the Relay Switch twice — once for Echo 3 to enter the vault, once for you.', afterSeconds: 90 },
  ],
  solution: [
    // Loop 1 (Echo 1): hold the Hall Plate for everyone who follows.
    [{ op: 'moveTo', col: 20, row: 11 }, { op: 'moveTo', col: 20, row: 12 }, { op: 'wait', ticks: 30 }],
    // Loop 2 (Echo 2): into the lab, fire the relay at ~8 s (for Echo 3) and again at ~11.5 s (for you).
    [
      { op: 'moveTo', col: 10, row: 10 },
      { op: 'moveTo', col: 10, row: 8, timeoutTicks: 600 },
      { op: 'moveTo', col: 4, row: 5 },
      { op: 'face', dir: 0 },
      { op: 'waitUntil', tick: 480 },
      { op: 'interact' },
      { op: 'waitUntil', tick: 690 },
      { op: 'interact' },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 3 (Echo 3): wait at the Vault Door, slip through while the relay is lit, hold the Vault Plate.
    [
      { op: 'moveTo', col: 10, row: 10 },
      { op: 'moveTo', col: 10, row: 8, timeoutTicks: 600 },
      { op: 'moveTo', col: 16, row: 5 },
      { op: 'moveTo', col: 18, row: 5, timeoutTicks: 600 },
      { op: 'moveTo', col: 20, row: 4 },
      { op: 'moveTo', col: 20, row: 3 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: through the lab, wait at the Core Door, walk in when the relay fires the second time.
    [
      { op: 'moveTo', col: 10, row: 10 },
      { op: 'moveTo', col: 10, row: 8, timeoutTicks: 600 },
      { op: 'moveTo', col: 10, row: 3 },
      { op: 'moveTo', col: 10, row: 1, timeoutTicks: 900 },
    ],
  ],
  camera: {
    focus: { col: 10, row: 7 },
    yawStep: 0,
    zoom: 1.25,
    introPath: [
      { col: 12, row: 11 },
      { col: 20, row: 12 },
      { col: 10, row: 9 },
      { col: 4, row: 4 },
      { col: 1, row: 8 },
      { col: 7, row: 3 },
      { col: 20, row: 3 },
      { col: 10, row: 1 },
    ],
  },
  decor: [
    { type: 'observationWindow', col: 10, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 10, row: 1, facing: 2, params: { scale: 1.3, clockwork: true } },
    { type: 'archway', col: 10, row: 2, facing: 0, params: { indicators: 2 } },
    { type: 'archway', col: 10, row: 9, facing: 0, params: { indicators: 1 } },
    { type: 'conduit', col: 21, row: 12, facing: 3, params: { to: 'door-lab', color: 'teal' } },
    { type: 'conduit', col: 8, row: 2, facing: 2, params: { to: 'door-core', color: 'cyan' } },
    { type: 'conduit', col: 21, row: 3, facing: 3, params: { to: 'door-core', color: 'teal' } },
    { type: 'machinery', col: 5, row: 7, facing: 0, params: { variant: 'optics' } },
    { type: 'machinery', col: 15, row: 7, facing: 0, params: { variant: 'gears' } },
    { type: 'machinery', col: 19, row: 7, facing: 3, params: { variant: 'clockwork' } },
    { type: 'lamp', col: 1, row: 11, facing: 1 },
    { type: 'lamp', col: 16, row: 3, facing: 2 },
    { type: 'lamp', col: 16, row: 8, facing: 0 },
    { type: 'hologram', col: 12, row: 6, params: { text: 'RELAY 3', color: 'cyan' } },
  ],
  seed: 606,
  teaches: ['laser', 'signalChain', 'dependencyChain'],
};

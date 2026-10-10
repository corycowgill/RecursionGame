import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 5 — PERFECT TIMING  (teaches: moving platforms, timed windows, scheduling two echoes against a ride)
 *
 * The exit sanctum stands on an island across the abyss. The only crossing is the Ferry, a moving platform that
 * runs ONLY while the Drive Switch is on (4 s) and freezes wherever it is when the switch runs out. The island door
 * answers to the Gate Switch at the far south-west of the hall and stays open for just 2.5 s. Both switches lock
 * for a cooldown after they run out, so neither can be held on by hammering E: every window is a single, precious
 * moment, and the moments have to line up with you on the ferry.
 *
 *   col: 0         1         2
 *        0123456789012345678901
 *   r0   ######################
 *   r1   #################.X.##   sanctum                X exit (18,1)
 *   r2   ##################D###   D island door (18,2)   <- Gate Switch
 *   r3   #.....d.....______...#   d Drive Switch (6,3)   abyss (12..17)   island (18..20)
 *   r4   #...........______...#
 *   r5   #...O...O...______...#
 *   r6   #...........______...#
 *   r7   #...........F_____...#   F Ferry (12,7) <-> (17,7), runs only while the Drive Switch is on
 *   r8   #...........______...#
 *   r9   #.....@.....______...#   @ spawn (6,9)
 *   r10  #...O...O...______...#
 *   r11  #g..........______####   g Gate Switch (1,11)
 *   r12  ######################
 *
 * Known solution (2 echoes): Echo 1 presses the Drive Switch at a chosen moment (~5 s). Echo 2 presses the Gate
 * Switch so the door is open when the ferry lands. You board the ferry before it leaves, ride across, and walk
 * through the island door. Pressing the Drive Switch yourself leaves you 4 tiles from a ferry that is already
 * gone; pressing the Gate Switch yourself leaves you on the wrong side of the abyss.
 */
export const level05PerfectTiming: LevelDefinition = {
  id: 'L05-perfect-timing',
  order: 5,
  name: 'Perfect Timing',
  subtitle: 'Two moments, one crossing.',
  story: [
    'Ascendant Facility — The Ferry Deck.',
    'The ferry runs on a four-second charge. The island door breathes open for less.',
    'Neither switch can be held. Each gives you one moment — make them meet while you are aboard.',
  ],
  grid: {
    width: 22,
    height: 13,
    tiles: [
      '######################',
      '#################...##',
      '##################.###',
      '#...........______...#',
      '#...........______...#',
      '#...O...O...______...#',
      '#...........______...#',
      '#...........______...#',
      '#...........______...#',
      '#...........______...#',
      '#...O...O...______...#',
      '#...........______####',
      '######################',
    ],
  },
  entities: [
    {
      id: 'ferry',
      kind: 'movingPlatform',
      col: 12,
      row: 7,
      label: 'Ferry',
      config: { path: [{ col: 12, row: 7 }, { col: 17, row: 7 }], speed: 25, pauseTicks: 30, mode: 'pingpong', requiresSignal: true },
    },
    {
      id: 'switch-drive',
      kind: 'timedSwitch',
      col: 6,
      row: 3,
      facing: 2,
      label: 'Drive Switch',
      config: { durationTicks: 240, retrigger: false, cooldownTicks: 240 },
    },
    {
      id: 'switch-gate',
      kind: 'timedSwitch',
      col: 1,
      row: 11,
      facing: 1,
      label: 'Gate Switch',
      config: { durationTicks: 150, retrigger: false, cooldownTicks: 150 },
    },
    { id: 'door-island', kind: 'door', col: 18, row: 2, facing: 0, label: 'Island Door', config: { openTicks: 15 } },
    { id: 'exit', kind: 'exitPortal', col: 18, row: 1, label: 'Exit', config: { objective: 'Cross on the ferry and pass the island door' } },
  ],
  wires: [
    { from: 'switch-drive', to: 'ferry' },
    { from: 'switch-gate', to: 'door-island' },
  ],
  playerSpawn: { col: 6, row: 9, facing: 0 },
  exitId: 'exit',
  maxEchoes: 3,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 16,
  parEchoes: 2,
  hints: [
    { text: 'The ferry only moves while the Drive Switch is lit, and it freezes the moment the switch runs out.' },
    { text: 'You cannot press the Drive Switch and still catch the ferry. Let an echo press it while you are aboard.', afterSeconds: 30 },
    { text: 'Watch when the ferry lands, then record an echo that presses the Gate Switch just as it lands.', afterSeconds: 60 },
  ],
  solution: [
    // Loop 1 (Echo 1): the driver — press the Drive Switch at ~5 s.
    [{ op: 'moveTo', col: 6, row: 4 }, { op: 'face', dir: 0 }, { op: 'waitUntil', tick: 300 }, { op: 'interact' }, { op: 'wait', ticks: 30 }],
    // Loop 2 (Echo 2): the gatekeeper — press the Gate Switch as the ferry lands (~9.3 s).
    [{ op: 'moveTo', col: 2, row: 11 }, { op: 'face', dir: 3 }, { op: 'waitUntil', tick: 560 }, { op: 'interact' }, { op: 'wait', ticks: 30 }],
    // Final run: board the ferry, ride it across, step off and walk through the island door.
    [
      { op: 'moveTo', col: 11, row: 7 },
      { op: 'moveTo', col: 12, row: 7 },
      { op: 'waitUntil', tick: 520 },
      { op: 'moveTo', col: 18, row: 7 },
      { op: 'moveTo', col: 18, row: 3 },
      { op: 'moveTo', col: 18, row: 1 },
    ],
  ],
  camera: {
    focus: { col: 11, row: 7 },
    yawStep: 0,
    zoom: 1.2,
    introPath: [
      { col: 6, row: 9 },
      { col: 6, row: 3 },
      { col: 12, row: 7 },
      { col: 17, row: 7 },
      { col: 1, row: 11 },
      { col: 18, row: 2 },
      { col: 18, row: 1 },
    ],
  },
  decor: [
    { type: 'observationWindow', col: 18, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 18, row: 1, facing: 2, params: { scale: 1.2, clockwork: true } },
    { type: 'archway', col: 18, row: 2, facing: 0, params: { indicators: 1 } },
    { type: 'conduit', col: 7, row: 2, facing: 2, params: { to: 'ferry', color: 'gold' } },
    { type: 'conduit', col: 0, row: 10, facing: 1, params: { to: 'door-island', color: 'gold', span: 'abyss' } },
    { type: 'machinery', col: 11, row: 3, facing: 2, params: { variant: 'clockwork' } },
    { type: 'machinery', col: 20, row: 10, facing: 3, params: { variant: 'gears' } },
    { type: 'abyssLight', col: 14, row: 5, params: { color: 'cyan' } },
    { type: 'abyssLight', col: 15, row: 10, params: { color: 'violet' } },
    { type: 'lamp', col: 1, row: 5, facing: 1 },
    { type: 'lamp', col: 11, row: 10, facing: 3 },
    { type: 'lamp', col: 20, row: 4, facing: 3 },
    { type: 'hologram', col: 6, row: 7, params: { text: 'SYNC', color: 'gold' } },
  ],
  seed: 505,
  teaches: ['movingPlatform', 'timedWindow', 'cooldown', 'sync'],
};

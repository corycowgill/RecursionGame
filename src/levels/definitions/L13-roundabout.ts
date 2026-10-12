import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 13 — ROUNDABOUT  (round 6; campaign order 9. Reinforces RELAY + VALVE: timing across one-way geometry.)
 *
 * A ring corridor runs clockwise round the Crown: four check valves make it one-way, and the only way in, the Entry
 * Valve from the west hall, is one-way too. The Crown Door needs the North Timer (through a 5 s Echo Line) AND the
 * South Timer, at the same moment. Both timers are 2.5 s consoles that cannot be held on (no retrigger, cooldown).
 *
 *   - The clockwise walk North -> South is 26 tiles (10.8 s), longer than the line's 5 s plus the 2.5 s window, and
 *     there is no counter-clockwise route. One body can never line up both pulses: the South press must come 3.5-6.5 s
 *     after the North press. Two timer hands are needed.
 *   - Neither hand can be you: the Crown Door is 5 s clockwise from the South Timer (its window is 2.5 s) and 15.8 s
 *     from the North Timer (the delayed window closes 7.5 s after the press).
 *   - The Entry Valve drops you into the ring just PAST the Crown Door, behind a valve: the door is right there and you
 *     cannot go back to it. You must run a whole lap (19 s), so the hands have to be scheduled for when you arrive.
 *
 *   col: 0         1         2
 *        012345678901234567890123
 *   r0   ########################
 *   r1   #############n##########   n North Timer (13,1), pressed from (13,2)
 *   r2   #######.....R...>....##   ring top (row 2), valve > (17,2) passes EAST     R Crown Line (13,3), 5 s
 *   r3   #.....#.#############.##
 *   r4   #.....#.#...........#.##   west hall (1..5, 3..9)        the Crown (9..19, 4..10)
 *   r5   #.....E>#...........#.##   E Entry Valve (6,5) passes EAST, into the ring at (7,5)
 *   r6   #..@..#^#...........#.##   @ spawn (3,6)   ^ valve (7,6) passes NORTH: the Crown Door is behind you
 *   r7   #.....#.C.....X.....v.##   C Crown Door (8,7) <- Crown Line AND South Timer    X exit (14,7)   v valve (21,7) SOUTH
 *   r8   #.....#.#...........#.##
 *   r9   #.....#.#...........#.##
 *   r10  #######.#...........#.##
 *   r11  #######.#############.##
 *   r12  #######..<..s........##   ring bottom (row 12), valve < (10,12) passes WEST
 *   r13  #############s##########   s South Timer (13,13), pressed from (13,12)
 *   r14  ########################
 *
 * Intended solution (2 echoes): Echo 1 runs to the North Timer and presses it at 17.5 s. Echo 2 runs clockwise to the
 * South Timer and presses it at 22.6 s, 5 s later, as the delayed North pulse arrives. You run the lap and wait at the
 * Crown Door (from 20.8 s), and walk in on the overlap.
 * Minimum 2 echoes: two distinct hands (valve-directed distance N -> S = 10.8 s > 7.5 s) and neither is you.
 */
export const level13Roundabout: LevelDefinition = {
  id: 'L13-roundabout',
  order: 9,
  name: 'Roundabout',
  subtitle: 'Every road here runs one way, and so does every second.',
  story: [
    'Machine Hall — The Roundabout.',
    'The ring turns one way, and so does the line. Whoever rings north rings five seconds into the future.',
    'LOG 058 · Ran the ring to catch my own signal. Lapped myself twice. We waved. Neither of us stopped. — H.A.',
  ],
  grid: {
    width: 24,
    height: 15,
    tiles: [
      '########################',
      '#############.##########',
      '#######...............##',
      '#.....#.#############.##',
      '#.....#.#...........#.##',
      '#.......#...........#.##',
      '#.....#.#...........#.##',
      '#.....#.............#.##',
      '#.....#.#...........#.##',
      '#.....#.#...........#.##',
      '#######.#...........#.##',
      '#######.#############.##',
      '#######...............##',
      '#############.##########',
      '########################',
    ],
  },
  entities: [
    { id: 'valve-entry', kind: 'checkValve', col: 6, row: 5, facing: 1, label: 'Entry Valve - one way in', config: {} },
    { id: 'valve-west', kind: 'checkValve', col: 7, row: 6, facing: 0, label: 'West Valve', config: {} },
    { id: 'valve-north', kind: 'checkValve', col: 17, row: 2, facing: 1, label: 'North Valve', config: {} },
    { id: 'valve-east', kind: 'checkValve', col: 21, row: 7, facing: 2, label: 'East Valve', config: {} },
    { id: 'valve-south', kind: 'checkValve', col: 10, row: 12, facing: 3, label: 'South Valve', config: {} },
    {
      id: 'timer-north',
      kind: 'timedSwitch',
      col: 13,
      row: 1,
      facing: 2,
      label: 'North Timer',
      config: { durationTicks: 150, retrigger: false, cooldownTicks: 90 },
    },
    {
      id: 'timer-south',
      kind: 'timedSwitch',
      col: 13,
      row: 13,
      facing: 0,
      label: 'South Timer',
      config: { durationTicks: 150, retrigger: false, cooldownTicks: 90 },
    },
    { id: 'relay-crown', kind: 'chronoRelay', col: 13, row: 3, facing: 0, label: 'Crown Line - 5 s', config: { delayTicks: 300 } },
    { id: 'door-crown', kind: 'door', col: 8, row: 7, facing: 1, logic: 'and', label: 'Crown Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 14, row: 7, label: 'Exit', config: { objective: 'Line up the North and South pulses at the Crown Door' } },
  ],
  wires: [
    { from: 'timer-north', to: 'relay-crown' },
    { from: 'relay-crown', to: 'door-crown' },
    { from: 'timer-south', to: 'door-crown' },
  ],
  playerSpawn: { col: 3, row: 6, facing: 1 },
  exitId: 'exit',
  maxEchoes: 3,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 33,
  parEchoes: 2,
  hints: [
    { text: 'The Crown Door needs the North Timer, 5 seconds late through the Crown Line, and the South Timer, both at once. The ring only turns clockwise.' },
    { text: 'North to South is a long way round: no single runner can line the two pulses up. And the door is too far from either timer for you to press one.', afterSeconds: 60 },
    { text: 'You enter just past the Crown Door and must run a full lap. Time the hands to your arrival: South pressed 5 seconds after North.', afterSeconds: 125 },
    { text: 'Echo 1 presses North at about 17 s. Echo 2 presses South at about 22 s. Run the lap and wait at the Crown Door.', afterSeconds: 185 },
  ],
  solution: [
    // Loop 1 (Echo 1, North hand): into the ring, a few steps to the North Timer, press at 17.5 s.
    [
      { op: 'moveTo', col: 5, row: 5 },
      { op: 'moveTo', col: 7, row: 5 },
      { op: 'moveTo', col: 7, row: 2 },
      { op: 'moveTo', col: 13, row: 2 },
      { op: 'face', dir: 0 },
      { op: 'waitUntil', tick: 1050 },
      { op: 'interact' },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 2 (Echo 2, South hand): clockwise round the east side to the South Timer, press 5 s after the North press.
    [
      { op: 'moveTo', col: 5, row: 5 },
      { op: 'moveTo', col: 7, row: 5 },
      { op: 'moveTo', col: 7, row: 2 },
      { op: 'moveTo', col: 21, row: 2 },
      { op: 'moveTo', col: 21, row: 12 },
      { op: 'moveTo', col: 13, row: 12 },
      { op: 'face', dir: 2 },
      { op: 'waitUntil', tick: 1355 },
      { op: 'interact' },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: the full lap to the Crown Door; walk in on the overlap.
    [
      { op: 'moveTo', col: 5, row: 5 },
      { op: 'moveTo', col: 7, row: 5 },
      { op: 'moveTo', col: 7, row: 2 },
      { op: 'moveTo', col: 21, row: 2 },
      { op: 'moveTo', col: 21, row: 12 },
      { op: 'moveTo', col: 7, row: 12 },
      { op: 'moveTo', col: 7, row: 7 },
      { op: 'moveTo', col: 14, row: 7, timeoutTicks: 1500 },
    ],
  ],
  camera: {
    focus: { col: 12, row: 7 },
    yawStep: 0,
    zoom: 1.3,
    introPath: [
      { col: 3, row: 6 },
      { col: 6, row: 5 },
      { col: 7, row: 6 },
      { col: 13, row: 1 },
      { col: 17, row: 2 },
      { col: 21, row: 7 },
      { col: 13, row: 13 },
      { col: 10, row: 12 },
      { col: 8, row: 7 },
      { col: 14, row: 7 },
    ],
  },
  decor: [
    { type: 'ring', col: 14, row: 7, facing: 2, params: { scale: 1.6, clockwork: true, color: 'teal' } },
    { type: 'archway', col: 8, row: 7, facing: 1, params: { indicators: 2 } },
    { type: 'archway', col: 6, row: 5, facing: 1, params: { indicators: 1 } },
    { type: 'conduit', col: 12, row: 1, facing: 2, params: { to: 'relay-crown', color: 'teal' } },
    { type: 'conduit', col: 12, row: 13, facing: 0, params: { to: 'door-crown', color: 'teal' } },
    { type: 'machinery', col: 0, row: 5, facing: 1, params: { variant: 'clockwork' } },
    { type: 'machinery', col: 22, row: 4, facing: 3, params: { variant: 'gears' } },
    { type: 'machinery', col: 22, row: 10, facing: 3, params: { variant: 'pistons' } },
    { type: 'lamp', col: 1, row: 3, facing: 1 },
    { type: 'lamp', col: 5, row: 9, facing: 3 },
    { type: 'lamp', col: 18, row: 1, facing: 2 },
    { type: 'lamp', col: 9, row: 13, facing: 0 },
    { type: 'hologram', col: 3, row: 8, params: { text: 'CLOCKWISE ONLY', color: 'teal' } },
    { type: 'hologram', col: 11, row: 9, params: { text: 'N +5 s = S', color: 'gold' } },
  ],
  seed: 1313,
  teaches: ['checkValve', 'chronoRelay', 'oneWayRing', 'twoHands'],
};

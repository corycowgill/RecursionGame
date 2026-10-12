import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 17 — UPSTREAM  (round 6, campaign order 16; combines the REVERSIBLE VALVE, ATTUNED KEYS, a ride LIFT and the
 * NESTED LOOP: one recording ends on both sides of a one-way valve)
 *
 * The Recursion Engine is running again: every echo has a copy that replays it 5 s later. The Freight Lift (ride mode:
 * stand on it and it climbs, then it comes back down by itself) is the only way up to the Head Gallery. The only way
 * down is the Chute: the Chute Valve (southward), a fixed non-return flap below it, then two ramps to the hall. The
 * Brake Plate in the far south-east of the hall is cyan: it counts only echoes, and while it is held the Chute Valve
 * turns northward. (The flap keeps the chute from ever being climbed, so a braked chute is simply shut.)
 *
 * The Exit Door needs three plates at once: the Head Plate in the pocket right above the valve, the Foot Plate in the
 * far west of the hall, and the Brake Plate. Your first echo rides up, steps onto the Head Plate, goes down the chute
 * and walks to the Foot Plate. Its copy follows five seconds behind, the same steps, but by then your second echo is on
 * the Brake Plate: the valve has turned, the copy walks into its closed face and stays on the Head Plate (its later
 * steps push west and south, into the pocket's wall and the valve). Same inputs, changed world: this time the change is
 * a direction.
 *
 *   col: 0         1         2
 *        0123456789012345678901234
 *   r0   #########################
 *   r1   #########......##########   Head Gallery (h2): lift landing (9,1..2), walk east to the Head pocket
 *   r2   #########.####h##########   h Head Plate (14,2), a 1-wide pocket above the valve
 *   r3   #########_####V##########   _ Freight Lift (9,3) h0 <-> h2 (ride, returns)   V Chute Valve (14,3), south; Brake turns it
 *   r4   #########.####v##########   lift approach (9,4..6, h0)   v non-return flap (14,4), fixed south
 *   r5   #########.####^##########   chute ramps (14,5) h1->h2, (14,6) h0->h1
 *   r6   #########.####^##########
 *   r7   #.......................#   hall (h0)
 *   r8   #f......................#   f Foot Plate (1,8)
 *   r9   #.......................#
 *   r10  #.......................#
 *   r11  #....O......@......O....#   @ spawn (12,11)
 *   r12  #.......................#
 *   r13  #.......................#
 *   r14  #.......................#
 *   r15  #......................b#   b Brake Plate (23,15), cyan: echoes only
 *   r16  ############E############   E Exit Door (12,16) <- Head AND Foot AND Brake
 *   r17  ###########.X.###########   X exit (12,17)
 *   r18  #########################
 *
 * Minimum echoes is 2. Body count: at the finish the Head, Foot and Brake plates are held while you stand at the exit:
 * four jobs, and one echo gives three bodies (echo, copy, you). With two echoes there are five bodies, but an echo and
 * its copy replay the same inputs 5 s apart, so at any moment the copy is where its echo was 5 s earlier. The three
 * plates are pairwise at least 7.5 s apart (fastest walks: Head-Foot 7.7 s, Head-Brake 7.5 s, Foot-Brake 10.5 s; going up
 * also costs the lift ride), so * one pair can hold two plates only if the world stops the copy on its way: the valve turned by the Brake (the lesson),
 * or the lift being away, and a copy that misses the lift is stuck in the lift approach, which holds no plate. The Exit
 * Door only opens with all three plates down, so there is no doorstop.
 */
export const level17Upstream: LevelDefinition = {
  id: 'L17-upstream',
  order: 16,
  name: 'Upstream',
  subtitle: 'The same steps, the other side.',
  story: [
    'Paradox Wing — The Upstream Chute.',
    'The chute only lets you down, unless an echo holds the brake. Your copy walks your steps five seconds late.',
    'LOG 095 · I went down the chute and stayed up top, both at once. I no longer ask which one is the copy. — H.A.',
  ],
  grid: {
    width: 25,
    height: 19,
    tiles: [
      '#########################',
      '#########......##########',
      '#########.####.##########',
      '#########_####.##########',
      '#########.####.##########',
      '#########.####^##########',
      '#########.####^##########',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#....O.............O....#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '############.############',
      '###########...###########',
      '#########################',
    ],
    heights: [
      '2222222222222222222222222',
      '2222222222222222222222222',
      '2222222222222222222222222',
      '2222222222222222222222222',
      '0000000000000020000000000',
      '0000000000000010000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
    ],
  },
  entities: [
    {
      id: 'lift',
      kind: 'elevator',
      col: 9,
      row: 3,
      level: 0,
      label: 'Freight Lift',
      config: { levels: [0, 2], mode: 'ride', rideDelayTicks: 30, ticksPerLevel: 45, returnDelayTicks: 30 },
    },
    { id: 'plate-head', kind: 'pressurePlate', col: 14, row: 2, label: 'Head Plate', config: {} },
    { id: 'valve-chute', kind: 'checkValve', col: 14, row: 3, facing: 2, label: 'Chute Valve', config: { reverseWhenPowered: true } },
    { id: 'valve-flap', kind: 'checkValve', col: 14, row: 4, facing: 2, label: 'Non-return Flap', config: {} },
    { id: 'plate-foot', kind: 'pressurePlate', col: 1, row: 8, label: 'Foot Plate', config: {} },
    { id: 'plate-brake', kind: 'pressurePlate', col: 23, row: 15, label: 'Brake Plate', config: { accepts: 'echoes' } },
    { id: 'door-exit', kind: 'door', col: 12, row: 16, facing: 0, label: 'Exit Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 12, row: 17, label: 'Exit', config: { objective: 'Hold the Head, Foot and Brake plates at once' } },
  ],
  wires: [
    { from: 'plate-brake', to: 'valve-chute' },
    { from: 'plate-head', to: 'door-exit' },
    { from: 'plate-foot', to: 'door-exit' },
    { from: 'plate-brake', to: 'door-exit' },
  ],
  playerSpawn: { col: 12, row: 11, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  recursion: { delayTicks: 300, copies: 1 },
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 24,
  parEchoes: 2,
  hints: [
    { text: 'Every echo here has a copy 5 s behind it. The Exit Door needs the Head, Foot and Brake plates at once: two echoes, four bodies, three plates.' },
    {
      text: 'The Brake Plate only counts echoes, and it turns the Chute Valve around. A copy that reaches a turned valve stays on the Head Plate, right above it.',
      afterSeconds: 85,
    },
    {
      text: 'Echo 1: ride the lift, cross the Head Plate, go down the chute and on to the Foot Plate. Echo 2: step onto the Brake Plate after Echo 1 is through the valve, before its copy gets there.',
      afterSeconds: 170,
    },
  ],
  solution: [
    // Loop 1 (Echo 1 + copy): lift up, onto the Head Plate, down the chute, west to the Foot Plate. The echo passes
    // the valve; its copy, 5 s later, meets the valve turned by Echo 2 and stays on the Head Plate (its later inputs
    // push west and south: the pocket wall and the valve).
    [
      { op: 'moveTo', col: 9, row: 7 },
      { op: 'moveTo', col: 9, row: 4 },
      { op: 'moveTo', col: 9, row: 3 },
      { op: 'wait', ticks: 125 },
      { op: 'moveTo', col: 9, row: 1 },
      { op: 'moveTo', col: 14, row: 1 },
      { op: 'moveTo', col: 14, row: 7, timeoutTicks: 300 },
      { op: 'moveTo', col: 1, row: 7 },
      { op: 'moveTo', col: 1, row: 8 },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 2 (Echo 2 + copy): wait beside the Brake Plate; step on after Echo 1 has passed the valve (~9.5 s) and
    // before its copy arrives (~14.5 s). The copy joins it on the plate 5 s later.
    [
      { op: 'moveTo', col: 22, row: 15 },
      { op: 'waitUntil', tick: 720 },
      { op: 'moveTo', col: 23, row: 15 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: wait at the Exit Door.
    [
      { op: 'moveTo', col: 12, row: 15 },
      { op: 'moveTo', col: 12, row: 17, timeoutTicks: 1500 },
    ],
  ],
  camera: {
    focus: { col: 12, row: 9 },
    yawStep: 0,
    zoom: 1.35,
    introPath: [
      { col: 12, row: 11 },
      { col: 9, row: 3 },
      { col: 9, row: 1, level: 2 },
      { col: 14, row: 2, level: 2 },
      { col: 14, row: 3, level: 2 },
      { col: 14, row: 6 },
      { col: 1, row: 8 },
      { col: 23, row: 15 },
      { col: 12, row: 16 },
      { col: 12, row: 17 },
    ],
  },
  decor: [
    { type: 'archway', col: 12, row: 16, facing: 0, params: { indicators: 3 } },
    { type: 'observationWindow', col: 11, row: 0, level: 2, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 12, row: 17, facing: 0, params: { scale: 1.0, clockwork: true, color: 'violet' } },
    { type: 'ring', col: 12, row: 13, facing: 0, params: { scale: 2.2, clockwork: true } },
    { type: 'conduit', col: 23, row: 14, facing: 0, params: { to: 'valve-chute', color: 'cyan', span: 'hall' } },
    { type: 'conduit', col: 22, row: 16, facing: 0, params: { to: 'door-exit', color: 'cyan' } },
    { type: 'conduit', col: 15, row: 2, level: 2, facing: 3, params: { to: 'door-exit', color: 'gold' } },
    { type: 'conduit', col: 0, row: 8, facing: 1, params: { to: 'door-exit', color: 'gold' } },
    { type: 'machinery', col: 12, row: 1, level: 2, facing: 2, params: { variant: 'coreDynamo' } },
    { type: 'machinery', col: 3, row: 7, facing: 2, params: { variant: 'gears' } },
    { type: 'machinery', col: 20, row: 7, facing: 2, params: { variant: 'clockwork' } },
    { type: 'banner', col: 13, row: 7, facing: 2, params: { color: 'cyan' } },
    { type: 'banner', col: 15, row: 7, facing: 2, params: { color: 'cyan' } },
    { type: 'lamp', col: 1, row: 10, facing: 1 },
    { type: 'lamp', col: 23, row: 10, facing: 3 },
    { type: 'lamp', col: 10, row: 1, level: 2, facing: 2 },
    { type: 'hologram', col: 12, row: 9, params: { text: 'SAME STEPS · OTHER SIDE', color: 'violet' } },
  ],
  seed: 1717,
  teaches: ['reversibleValve', 'nestedLoop', 'attunedDevices'],
};

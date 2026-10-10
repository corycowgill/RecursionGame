import type { InputScript, LevelDefinition, ScriptStep } from '../../engine/contracts';

/** Push north and press E once a second, `times` times (a "broken" sequence until the door ahead opens). */
function pushAndPress(times: number): ScriptStep[] {
  const out: ScriptStep[] = [];
  for (let i = 0; i < times; i++) out.push({ op: 'move', dx: 0, dz: -1, ticks: 40 }, { op: 'interact' }, { op: 'wait', ticks: 19 });
  return out;
}

/**
 * LEVEL 7 — BROKEN SEQUENCE  (teaches: echoes replay INPUTS, not results; recording a sequence that cannot work
 * yet; divergence as a tool)
 *
 * The Archive Switch hangs behind the Archive Door. The door answers to the Reading Plate in the west room; the west
 * room's door answers to the Hall Plate in the far east of the hall. The Archive Switch opens the exit — and it is
 * so far from the exit that whoever presses it cannot get there before it runs out.
 *
 * So the switch must be pressed by an echo, and that echo must first hold the Hall Plate so the Reading Plate's
 * echo can get in. When you record it, the Archive Door is shut: you walk up to it, push, and press E at a closed
 * door, again and again. Nothing happens. The sequence is broken — on purpose. Then you record the second echo,
 * who walks into the west room and stands on the Reading Plate. The Archive Door opens, your first echo keeps
 * pushing exactly as recorded, walks through, and its next press lands on the switch it never touched. The
 * timeline marks it as a divergence; this time, the paradox is the plan.
 *
 *   col: 0         1         2
 *        0123456789012345678901
 *   r0   ######################
 *   r1   #r.....######.S.######   r Reading Plate (1,1)   S Archive Switch (14,1)
 *   r2   #......######...######   west room (1..6, 1..5) archive (13..15, 1..2)
 *   r3   #......#######A#######   A Archive Door (14,3)   <- Reading Plate
 *   r4   #......#######.#######
 *   r5   #......#######.#######
 *   r6   ####W#########.#######   W West Door (4,6)       <- Hall Plate
 *   r7   #....................#   hall (1..20, 7..12)
 *   r8   #....................#
 *   r9   #......O..........O..#
 *   r10  #..........@.........#   @ spawn (11,10)
 *   r11  #....................#
 *   r12  #...................h#   h Hall Plate (20,12)
 *   r13  ##E###################   E Exit Door (2,13)      <- Archive Switch
 *   r14  #.X.##################   X exit (2,14)
 *   r15  ######################
 *
 * Known solution (2 echoes): Echo 1 holds the Hall Plate until Echo 2 is through the West Door, walks to the
 * Archive Door and pushes into it, pressing E every second (recorded: nothing, it is shut). Echo 2 enters the
 * west room and holds the Reading Plate. On replay the Archive Door opens in front of Echo 1, it walks in, and its
 * presses now hit the Archive Switch (divergence: none -> use) and keep it lit. You wait at the Exit Door.
 * Alternate (also valid): record Echo 2 first "blind" (push into the West Door, then walk to the Reading Plate),
 * then record Echo 1 live. Either way one recording must be made against a closed door.
 */
export const level07BrokenSequence: LevelDefinition = {
  id: 'L07-broken-sequence',
  order: 7,
  name: 'Broken Sequence',
  subtitle: 'Record what cannot work — yet.',
  story: [
    'Ascendant Facility — The Archive.',
    'Your echoes do not remember what happened. They remember what you did: every step, every press.',
    'Change the world around them, and the same steps can carry them somewhere you have never been.',
  ],
  grid: {
    width: 22,
    height: 16,
    tiles: [
      '######################',
      '#......######...######',
      '#......######...######',
      '#......#######.#######',
      '#......#######.#######',
      '#......#######.#######',
      '####.#########.#######',
      '#....................#',
      '#....................#',
      '#......O..........O..#',
      '#....................#',
      '#....................#',
      '#....................#',
      '##.###################',
      '#...##################',
      '######################',
    ],
  },
  entities: [
    { id: 'plate-hall', kind: 'pressurePlate', col: 20, row: 12, label: 'Hall Plate', config: {} },
    { id: 'door-west', kind: 'door', col: 4, row: 6, facing: 0, label: 'West Door', config: {} },
    { id: 'plate-reading', kind: 'pressurePlate', col: 1, row: 1, label: 'Reading Plate', config: {} },
    { id: 'door-archive', kind: 'door', col: 14, row: 3, facing: 0, label: 'Archive Door', config: {} },
    { id: 'switch-archive', kind: 'timedSwitch', col: 14, row: 1, facing: 2, label: 'Archive Switch', config: { durationTicks: 150, retrigger: true } },
    { id: 'door-exit', kind: 'door', col: 2, row: 13, facing: 0, label: 'Exit Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 2, row: 14, label: 'Exit', config: { objective: 'Have an echo light the Archive Switch' } },
  ],
  wires: [
    { from: 'plate-hall', to: 'door-west' },
    { from: 'plate-reading', to: 'door-archive' },
    { from: 'switch-archive', to: 'door-exit' },
  ],
  playerSpawn: { col: 11, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 14,
  parEchoes: 2,
  hints: [
    { text: 'The Archive Switch is too far from the exit to press yourself. An echo has to keep it lit.' },
    { text: 'Echoes repeat your inputs, not your results. If a door is shut when you record, an echo pushing into it walks on once it opens.', afterSeconds: 45 },
    {
      text: 'Echo 1: hold the Hall Plate briefly, then push into the Archive Door pressing E every second. Echo 2: hold the Reading Plate.',
      afterSeconds: 100,
    },
  ],
  solution: [
    // Loop 1 (Echo 1): hold the Hall Plate until ~5.5 s, then push into the shut Archive Door pressing E each second.
    [
      { op: 'moveTo', col: 20, row: 11 },
      { op: 'moveTo', col: 20, row: 12 },
      { op: 'waitUntil', tick: 330 },
      { op: 'moveTo', col: 14, row: 7 },
      { op: 'moveTo', col: 14, row: 4 },
      ...pushAndPress(12),
    ] satisfies InputScript,
    // Loop 2 (Echo 2): through the West Door while Echo 1 holds the Hall Plate; hold the Reading Plate.
    [
      { op: 'moveTo', col: 4, row: 7 },
      { op: 'moveTo', col: 4, row: 5, timeoutTicks: 600 },
      { op: 'moveTo', col: 1, row: 2 },
      { op: 'moveTo', col: 1, row: 1 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: wait at the Exit Door; walk out once Echo 1 lights the Archive Switch.
    [
      { op: 'moveTo', col: 2, row: 12 },
      { op: 'moveTo', col: 2, row: 14, timeoutTicks: 1500 },
    ],
  ],
  camera: {
    focus: { col: 10, row: 8 },
    yawStep: 0,
    zoom: 1.25,
    introPath: [
      { col: 11, row: 10 },
      { col: 20, row: 12 },
      { col: 4, row: 6 },
      { col: 1, row: 1 },
      { col: 14, row: 3 },
      { col: 14, row: 1 },
      { col: 2, row: 13 },
      { col: 2, row: 14 },
    ],
  },
  decor: [
    { type: 'observationWindow', col: 14, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 2, row: 14, facing: 0, params: { scale: 1.1, clockwork: true } },
    { type: 'archway', col: 14, row: 3, facing: 0, params: { indicators: 1 } },
    { type: 'archway', col: 4, row: 6, facing: 0, params: { indicators: 1 } },
    { type: 'archway', col: 2, row: 13, facing: 0, params: { indicators: 1 } },
    { type: 'conduit', col: 21, row: 12, facing: 3, params: { to: 'door-west', color: 'teal' } },
    { type: 'conduit', col: 2, row: 0, facing: 2, params: { to: 'door-archive', color: 'teal' } },
    { type: 'conduit', col: 15, row: 1, facing: 2, params: { to: 'door-exit', color: 'gold', span: 'hall' } },
    { type: 'machinery', col: 6, row: 3, facing: 3, params: { variant: 'archive' } },
    { type: 'machinery', col: 1, row: 4, facing: 1, params: { variant: 'archive' } },
    { type: 'machinery', col: 20, row: 7, facing: 3, params: { variant: 'gears' } },
    { type: 'lamp', col: 1, row: 8, facing: 1 },
    { type: 'lamp', col: 20, row: 9, facing: 3 },
    { type: 'lamp', col: 13, row: 2, facing: 1 },
    { type: 'hologram', col: 11, row: 8, params: { text: 'INPUTS ≠ RESULTS', color: 'violet' } },
  ],
  seed: 707,
  teaches: ['divergence', 'inputsNotResults', 'blindRecording'],
};

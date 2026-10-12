import type { LevelDefinition } from '../../engine/contracts';

/**
 * SANDBOX: ATTUNED KEYS (round 6, not in the campaign) — gold / cyan devices and Paradox Glass in isolation.
 *  - The Echo Console (cyan) only answers an echo: pressing it live fails, the same press replayed by your echo works
 *    (an intended "fail -> use" divergence, shown violet on the timeline).
 *  - The Glass Seal (gold, glass) only counts the living player and shatters for the rest of the pass if an echo steps
 *    on it. It sits on the straight line to the console, so the echo's recording must walk around it.
 * The door needs both: the seal (latched) and the console's 10 s timer.
 *
 *   col: 0123456789012
 *   r0   #############
 *   r1   #...........#
 *   r2   #S...G...C..#     S spawn (1,2)  G Glass Seal (5,2)  C Echo Console (9,2)
 *   r3   #...........#
 *   r4   ######D######     D door (6,4)
 *   r5   #.....X.....#     X exit (6,5)
 *   r6   #############
 */
export const sandboxAttuned: LevelDefinition = {
  id: 'S03-sandbox-attuned',
  order: 0,
  name: 'Attuned Keys',
  subtitle: 'Sandbox: Gold, Cyan and Glass',
  story: ['Some locks know who you are, and when.', 'Glass remembers every footstep. Mind where your past self walks.'],
  grid: {
    width: 13,
    height: 7,
    tiles: ['#############', '#...........#', '#...........#', '#...........#', '######.######', '#...........#', '#############'],
  },
  entities: [
    { id: 'seal', kind: 'pressurePlate', col: 5, row: 2, label: 'Glass Seal', config: { accepts: 'player', shatterOn: 'echoes', latch: true } },
    { id: 'console', kind: 'timedSwitch', col: 9, row: 2, facing: 3, label: 'Echo Console', config: { durationTicks: 600, accepts: 'echoes' } },
    { id: 'door', kind: 'door', col: 6, row: 4, facing: 0, label: 'Keyed Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 6, row: 5, label: 'Exit', config: {} },
  ],
  wires: [
    { from: 'seal', to: 'door' },
    { from: 'console', to: 'door' },
  ],
  playerSpawn: { col: 1, row: 2, facing: 1 },
  exitId: 'exit',
  maxEchoes: 1,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 16,
  parEchoes: 1,
  hints: [
    { text: 'The Echo Console only answers an echo. Only an echo can use this - {echo} and let your past self press it.' },
    { text: 'The Glass Seal shatters under an echo. Record your walk to the console around it, not across it.', afterSeconds: 20 },
  ],
  solution: [
    [
      { op: 'moveTo', col: 4, row: 1 },
      { op: 'moveTo', col: 8, row: 1 },
      { op: 'moveTo', col: 8, row: 2 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'wait', ticks: 10 },
    ],
    [
      { op: 'moveTo', col: 5, row: 2 },
      { op: 'moveTo', col: 6, row: 3 },
      { op: 'moveTo', col: 6, row: 5, timeoutTicks: 600 },
    ],
  ],
  camera: { focus: { col: 6, row: 3 }, yawStep: 0, zoom: 0.95 },
  seed: 1,
  teaches: ['attunedDevices', 'paradoxGlass', 'echo'],
};

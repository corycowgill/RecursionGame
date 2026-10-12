import type { LevelDefinition } from '../../engine/contracts';

/**
 * SANDBOX: SUMP VALVE (round 6, not in the campaign) — the Check Valve in isolation.
 * The latch plate in the sump opens the exit door for good, but the sump is behind a one-way valve: whoever goes in
 * stays in. Alone you would latch the plate and be stuck; send an echo in instead.
 *
 *   col: 0123456789012
 *   r0   #############
 *   r1   #.....#.....#
 *   r2   #S....V..P..#     S spawn (1,2)  V valve (6,2), inward (east) only  P latch plate (9,2)
 *   r3   #.....#.....#
 *   r4   ###.#########     D door (3,4) fed by the plate
 *   r5   #..X........#     X exit (3,5)
 *   r6   #############
 */
export const sandboxValve: LevelDefinition = {
  id: 'S02-sandbox-valve',
  order: 0,
  name: 'Sump Valve',
  subtitle: 'Sandbox: Check Valve',
  story: ['The sump valve only turns one way.', 'Somebody has to go in. It does not have to be you.'],
  grid: {
    width: 13,
    height: 7,
    tiles: ['#############', '#.....#.....#', '#...........#', '#.....#.....#', '###.#########', '#...........#', '#############'],
  },
  entities: [
    { id: 'valve', kind: 'checkValve', col: 6, row: 2, facing: 1, label: 'Sump Valve - inward only', config: {} },
    { id: 'plate', kind: 'pressurePlate', col: 9, row: 2, label: 'Sump Plate', config: { latch: true } },
    { id: 'door', kind: 'door', col: 3, row: 4, facing: 0, label: 'Exit Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 3, row: 5, label: 'Exit', config: {} },
  ],
  wires: [{ from: 'plate', to: 'door' }],
  playerSpawn: { col: 1, row: 2, facing: 1 },
  exitId: 'exit',
  maxEchoes: 1,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 14,
  parEchoes: 1,
  hints: [
    { text: 'The valve only turns inward: whoever enters the sump stays there.' },
    { text: 'Walk into the sump onto the plate, then press {echo}. Your echo latches the plate and you take the door.', afterSeconds: 20 },
  ],
  solution: [
    [
      { op: 'moveTo', col: 9, row: 2 },
      { op: 'wait', ticks: 10 },
    ],
    [
      { op: 'moveTo', col: 3, row: 3 },
      { op: 'moveTo', col: 3, row: 5, timeoutTicks: 600 },
    ],
  ],
  camera: { focus: { col: 6, row: 3 }, yawStep: 0, zoom: 0.95 },
  seed: 1,
  teaches: ['checkValve', 'echo'],
};

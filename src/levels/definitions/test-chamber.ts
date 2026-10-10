import type { LevelDefinition } from '../../engine/contracts';

/**
 * TEST CHAMBER — engine reference level (not part of the campaign).
 * One pressure plate holds one door open. Alone, the player cannot be on the plate and through the door at
 * once: record an echo standing on the plate, rewind, then walk through the door and up the ramp to the exit
 * dais while the echo holds the plate.
 *
 *   col: 0123456789A
 *   r0   ###########
 *   r1   #.S.......#     S = spawn (2,1)
 *   r2   #.O.....O.#
 *   r3   #.......P.#     P = plate (8,3)
 *   r4   #####D#####     D = door (5,4)
 *   r5   #.........#
 *   r6   #...=v=...#     v = ramp up to the south (5,6)
 *   r7   #...=X=...#     X = exit portal on a raised dais (5,7), height 1
 *   r8   #...===...#
 *   r9   ###########
 */
export const testChamber: LevelDefinition = {
  id: 'T00-test-chamber',
  order: 0,
  name: 'Test Chamber',
  subtitle: 'Calibration Protocol',
  story: ['Calibration sequence initiated.', 'The door answers only to weight. You are only one person — for now.'],
  grid: {
    width: 11,
    height: 10,
    tiles: [
      '###########',
      '#.........#',
      '#.O.....O.#',
      '#.........#',
      '#####.#####',
      '#.........#',
      '#...=v=...#',
      '#...=.=...#',
      '#...===...#',
      '###########',
    ],
    heights: [
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00001110000',
      '00001110000',
      '00000000000',
    ],
  },
  entities: [
    { id: 'plate-a', kind: 'pressurePlate', col: 8, row: 3, label: 'Plate A', config: {} },
    { id: 'door-a', kind: 'door', col: 5, row: 4, facing: 0, label: 'Door A', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 5, row: 7, label: 'Exit', config: {} },
  ],
  wires: [{ from: 'plate-a', to: 'door-a' }],
  playerSpawn: { col: 2, row: 1, facing: 2 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 20,
  parEchoes: 1,
  hints: [
    { text: 'Stand on the plate, then press R to rewind. Your echo will repeat what you did.' },
    { text: 'While your echo holds the plate, walk through the door.', afterSeconds: 30 },
  ],
  solution: [
    // Loop 1 (becomes Echo 1): walk onto the plate and stay.
    [
      { op: 'moveTo', col: 8, row: 3 },
      { op: 'wait', ticks: 10 },
    ],
    // Final run: through the door (wait for it to open), up the ramp onto the exit dais.
    [
      { op: 'moveTo', col: 5, row: 3 },
      { op: 'moveTo', col: 5, row: 5 },
      { op: 'moveTo', col: 5, row: 7 },
    ],
  ],
  camera: { focus: { col: 5, row: 4 }, yawStep: 0, zoom: 1 },
  decor: [
    { type: 'conduit', col: 1, row: 3, facing: 1 },
    { type: 'observationWindow', col: 5, row: 0, facing: 2 },
    { type: 'ring', col: 5, row: 9, facing: 0, params: { scale: 1.5 } },
  ],
  seed: 1,
  teaches: ['pressurePlate', 'door', 'echo'],
};

import type { LevelDefinition } from '../../engine/contracts';

/**
 * SANDBOX: ECHO LINE (round 6, not in the campaign) — the Chrono Relay in isolation.
 * The plate drives the door through a 6 s Echo Line: the door opens 6 s after you step on the plate and stays open for
 * exactly as long as you stood there. Stand long enough to buy a window, then be at the door when the signal arrives.
 * "The conduit remembers the last 6 seconds."
 *
 *   col: 0123456789A
 *   r0   ###########
 *   r1   #S..P.....#     S spawn (1,1)  P plate (4,1)
 *   r2   #.........R     R relay on the east wall (10,2), 360 ticks
 *   r3   #####D#####     D door (5,3), fed by the relay only
 *   r4   #....X....#     X exit (5,4)
 *   r5   ###########
 */
export const sandboxRelay: LevelDefinition = {
  id: 'S01-sandbox-relay',
  order: 0,
  name: 'Echo Line',
  subtitle: 'Sandbox: Chrono Relay',
  story: ['The conduit remembers the last six seconds.', 'Whatever you tell it now, it says again later.'],
  grid: {
    width: 11,
    height: 6,
    tiles: ['###########', '#.........#', '#.........#', '#####.#####', '#.........#', '###########'],
  },
  entities: [
    { id: 'plate', kind: 'pressurePlate', col: 4, row: 1, label: 'Line Plate', config: {} },
    { id: 'relay', kind: 'chronoRelay', col: 10, row: 2, facing: 3, label: 'Echo Line - 6 s', config: { delayTicks: 360 } },
    { id: 'door', kind: 'door', col: 5, row: 3, facing: 0, label: 'Line Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 5, row: 4, label: 'Exit', config: {} },
  ],
  wires: [
    { from: 'plate', to: 'relay' },
    { from: 'relay', to: 'door' },
  ],
  playerSpawn: { col: 1, row: 1, facing: 1 },
  exitId: 'exit',
  maxEchoes: 1,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 16,
  parEchoes: 0,
  hints: [
    { text: 'The door listens to the plate through the conduit. The conduit remembers the last 6 seconds.' },
    { text: 'Stand on the plate for a few seconds, then wait at the door: it opens 6 s later, for as long as you stood.', afterSeconds: 20 },
  ],
  solution: [
    [
      { op: 'moveTo', col: 4, row: 1 },
      { op: 'wait', ticks: 180 },
      { op: 'moveTo', col: 5, row: 2 },
      { op: 'moveTo', col: 5, row: 4, timeoutTicks: 600 },
    ],
  ],
  camera: { focus: { col: 5, row: 2 }, yawStep: 0, zoom: 0.9 },
  decor: [{ type: 'conduit', col: 10, row: 1, facing: 3 }],
  seed: 1,
  teaches: ['chronoRelay'],
};

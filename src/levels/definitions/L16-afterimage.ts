import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 16 — AFTERIMAGE  (round 6; campaign order 15, after L09. Combines the CHRONO RELAY, the INVERTED WIRE (L09) and
 * the CHECK VALVE: memory. "Held 6 seconds ago AND empty now.")
 *
 * The same kind of room as the Paradox Spire, with a different answer. One plate, one line:
 *   Vault Door = Hall Line (the Hall Plate, 6 s late) AND NOT Hall Plate (empty now) AND Reading Plate.
 *   Spire Door = Vault Plate AND Reading Plate AND Hall Line.
 * Behind the Vault Door a one-way Vault Valve seals whoever goes in, and the vault winds 14 tiles to the Vault Plate.
 *
 *   An echo that stands on the Hall Plate keeps the vault shut (the inverted wire). An echo that never stood there gets
 *   nothing down the line. The plate has to be held and then left: for 6 s after you step off, the line still
 *   remembers you while the plate is empty. The Hall Plate is a 2.5 s walk from the Vault Door and an 8.8 s walk from
 *   the Reading Plate, so the echo that rings the Hall Plate is the one that walks through the opening its own
 *   afterimage makes. Its afterimage has faded long before it reaches the Vault Plate (8.3 s), so the Spire Door needs a
 *   second ring: yours, 2 s from the Spire Door. In L09 the older echo had to be deleted and re-recorded; here every
 *   recording is made live, oldest first.
 *
 *   col: 0         1         2
 *        0123456789012345678901
 *   r0   ######################
 *   r1   #.....r##...#v.......#   r Reading Plate (6,1)   sanctum (9..11, 1..4)   v Vault Plate (13,1): the vault's far end
 *   r2   #......##.X.########.#   X exit (10,2)           vault: (17,3) -> (20,3) -> (20,1) -> (13,1)
 *   r3   #......##...#####....#
 *   r4   #......##...#####^####   ^ Vault Valve (17,4), passes NORTH (into the vault) only
 *   r5   #......###S######V####   S Spire Door (10,5) <- Vault AND Reading AND Line   V Vault Door (17,5) <- Line AND NOT Hall AND Reading
 *   r6   #.########.######.####   reading room (1..6, 1..5), open to the hall at (1,6)
 *   r7   #....................L   L Hall Line (21,7): the Hall Plate, 6 s late
 *   r8   #............h.......#   h Hall Plate (13,8)
 *   r9   #...O................#
 *   r10  #.........@.....O....#   @ spawn (10,10)
 *   r11  #....................#
 *   r12  #....................#
 *   r13  ######################
 *
 * Intended solution (2 echoes): Echo 1 walks to the Reading Plate and stays. Echo 2 stands on the Hall Plate for 4 s,
 * steps off and walks to the Vault Door, which opens as it arrives (the line still remembers it, the plate is empty and
 * Echo 1 reads), through the valve and along the vault onto the Vault Plate. You ring the Hall Plate once Echo 2 is in,
 * step off, wait at the Spire Door and walk through when your own afterimage arrives.
 * Minimum 2 echoes (body count): at the win the Vault Plate is held by someone sealed in the vault, the Reading Plate by
 * someone in the reading room, and you stand at the exit. Edge argument: the Hall Plate must have been held about 6 s
 * before the vault opened and be empty when it does, so no body can simply stand on it, and the reader cannot have
 * done it (8.8 s away).
 */
export const level16Afterimage: LevelDefinition = {
  id: 'L16-afterimage',
  order: 15,
  name: 'Afterimage',
  subtitle: 'The plate remembers you after you leave.',
  story: [
    'Paradox Wing — The Afterimage.',
    'The line remembers who stood on the plate. The vault opens for someone who was here and is gone.',
    'LOG 092 · The plate feels me six seconds after I leave. The vault believes it. Some days, so do I. — H.A.',
  ],
  grid: {
    width: 22,
    height: 14,
    tiles: [
      '######################',
      '#......##...#........#',
      '#......##...########.#',
      '#......##...#####....#',
      '#......##...#####.####',
      '#......###.######.####',
      '#.########.######.####',
      '#....................#',
      '#....................#',
      '#...O................#',
      '#...............O....#',
      '#....................#',
      '#....................#',
      '######################',
    ],
  },
  entities: [
    { id: 'plate-hall', kind: 'pressurePlate', col: 13, row: 8, label: 'Hall Plate', config: {} },
    { id: 'relay-hall', kind: 'chronoRelay', col: 21, row: 7, facing: 3, label: 'Hall Line - 6 s', config: { delayTicks: 360 } },
    { id: 'plate-reading', kind: 'pressurePlate', col: 6, row: 1, label: 'Reading Plate', config: {} },
    { id: 'door-vault', kind: 'door', col: 17, row: 5, facing: 0, logic: 'and', label: 'Vault Door', config: {} },
    { id: 'valve-vault', kind: 'checkValve', col: 17, row: 4, facing: 0, label: 'Vault Valve - one way in', config: {} },
    { id: 'plate-vault', kind: 'pressurePlate', col: 13, row: 1, label: 'Vault Plate', config: {} },
    { id: 'door-spire', kind: 'door', col: 10, row: 5, facing: 0, logic: 'and', label: 'Spire Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 10, row: 2, label: 'Exit', config: { objective: 'Open the vault with an afterimage, then leave on your own' } },
  ],
  wires: [
    { from: 'plate-hall', to: 'relay-hall' },
    { from: 'relay-hall', to: 'door-vault' },
    { from: 'plate-hall', to: 'door-vault', invert: true },
    { from: 'plate-reading', to: 'door-vault' },
    { from: 'plate-vault', to: 'door-spire' },
    { from: 'plate-reading', to: 'door-spire' },
    { from: 'relay-hall', to: 'door-spire' },
  ],
  playerSpawn: { col: 10, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 26,
  parEchoes: 2,
  hints: [
    { text: 'The Vault Door needs three things at once: the Hall Line (the Hall Plate, 6 seconds late), the Hall Plate EMPTY now, and the Reading Plate.' },
    { text: 'An echo that stays on the Hall Plate keeps the vault shut. Step off, and the line still remembers you for 6 seconds.', afterSeconds: 45 },
    { text: 'The echo that rings the Hall Plate should be the one that walks into the vault. The Spire Door wants the line too: ring it again yourself on the way out.', afterSeconds: 90 },
    { text: 'Echo 1 holds the Reading Plate. Echo 2 stands on the Hall Plate for a few seconds, then walks into the vault onto the Vault Plate. You: ring the Hall Plate, then wait at the Spire Door.', afterSeconds: 140 },
  ],
  solution: [
    // Loop 1 (Echo 1): the Reading Plate, for good.
    [
      { op: 'moveTo', col: 1, row: 7 },
      { op: 'moveTo', col: 1, row: 5 },
      { op: 'moveTo', col: 6, row: 1 },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 2 (Echo 2): ring the Hall Plate for 4 s, leave it, walk into the vault its own afterimage opens, and along
    // the vault to the Vault Plate.
    [
      { op: 'moveTo', col: 13, row: 8 },
      { op: 'wait', ticks: 240 },
      { op: 'moveTo', col: 17, row: 7 },
      { op: 'moveTo', col: 17, row: 3, timeoutTicks: 600 },
      { op: 'moveTo', col: 20, row: 3 },
      { op: 'moveTo', col: 20, row: 1 },
      { op: 'moveTo', col: 13, row: 1 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: ring the Hall Plate once Echo 2 is through the Vault Door, step off, and leave on your own afterimage.
    [
      { op: 'moveTo', col: 12, row: 9 },
      { op: 'waitUntil', tick: 600 },
      { op: 'moveTo', col: 13, row: 8 },
      { op: 'wait', ticks: 60 },
      { op: 'moveTo', col: 10, row: 7 },
      { op: 'moveTo', col: 10, row: 2, timeoutTicks: 1500 },
    ],
  ],
  camera: {
    focus: { col: 10, row: 6 },
    yawStep: 0,
    zoom: 1.25,
    introPath: [
      { col: 10, row: 10 },
      { col: 13, row: 8 },
      { col: 21, row: 7 },
      { col: 6, row: 1 },
      { col: 17, row: 5 },
      { col: 17, row: 4 },
      { col: 13, row: 1 },
      { col: 10, row: 5 },
      { col: 10, row: 2 },
    ],
  },
  decor: [
    { type: 'ring', col: 10, row: 2, facing: 2, params: { scale: 1.6, clockwork: true, color: 'violet' } },
    { type: 'observationWindow', col: 10, row: 0, facing: 2, params: { width: 3 } },
    { type: 'archway', col: 10, row: 5, facing: 0, params: { indicators: 3 } },
    { type: 'archway', col: 17, row: 5, facing: 0, params: { indicators: 3 } },
    { type: 'conduit', col: 13, row: 13, facing: 0, params: { to: 'relay-hall', color: 'teal' } },
    { type: 'conduit', col: 14, row: 13, facing: 0, params: { to: 'door-vault', color: 'coral', inverted: true } },
    { type: 'conduit', col: 6, row: 0, facing: 2, params: { to: 'door-vault', color: 'teal' } },
    { type: 'conduit', col: 13, row: 0, facing: 2, params: { to: 'door-spire', color: 'violet' } },
    { type: 'machinery', col: 7, row: 3, facing: 3, params: { variant: 'archive' } },
    { type: 'machinery', col: 21, row: 2, facing: 3, params: { variant: 'vault' } },
    { type: 'lamp', col: 1, row: 9, facing: 1 },
    { type: 'lamp', col: 20, row: 8, facing: 3 },
    { type: 'lamp', col: 16, row: 1, facing: 2 },
    { type: 'hologram', col: 10, row: 8, params: { text: 'THEN, NOT NOW', color: 'violet' } },
  ],
  seed: 1616,
  teaches: ['chronoRelay', 'invertedWire', 'checkValve', 'memory'],
};

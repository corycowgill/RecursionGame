import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 9 — THE PARADOX CHAMBER  (teaches: mutual dependencies; deleting and re-recording an earlier loop so that
 * it can react to a later one)
 *
 * The Hall Plate opens the West Door — and, through an inverted wire, SEALS the Vault Door. The Vault Door opens
 * only while the Reading Plate (in the west room) is held AND the Hall Plate is empty. The Vault Plate, deep in the
 * vault, opens the Paradox Spire where the exit waits.
 *
 *   Echo X must hold the Hall Plate so Echo Y can enter the west room ... and then LEAVE it, so the vault unseals,
 *   and walk into the vault itself. Echo Y must hold the Reading Plate so the vault opens for X.
 *
 * X helps Y, and Y helps X. The obvious first attempt — Echo 1 holds the Hall Plate forever, Echo 2 walks to the
 * Reading Plate — leaves the vault sealed for ever: your oldest echo is in the way of your newest. The way out of the
 * paradox is to DELETE Echo 1 and record it again: the new recording is now the youngest, so it can watch Echo 2
 * slip through the West Door, step off the Hall Plate at exactly the right moment, and follow the opening vault.
 *
 *   col: 0         1         2
 *        0123456789012345678901
 *   r0   ######################
 *   r1   #r.....##...###.....v#   r Reading Plate (1,1)   sanctum (9..11)   v Vault Plate (20,1)
 *   r2   #......##.X.###......#   X exit (10,2)           vault (15..20, 1..4)
 *   r3   #......##...###......#
 *   r4   #......##...###......#
 *   r5   #......###S#####V#####   S Spire Door (10,5) <- Vault Plate     V Vault Door (16,5) <- Reading AND NOT Hall
 *   r6   ####W#####.#####.#####   W West Door (4,6)   <- Hall Plate
 *   r7   #....................#   hall (1..20, 7..12)
 *   r8   #...O............O...#
 *   r9   #....................#
 *   r10  #.........@..........#   @ spawn (10,10)
 *   r11  #....................#
 *   r12  #...................h#   h Hall Plate (20,12)
 *   r13  ######################
 *
 * Intended solution (shown in tests): Echo 1 = hold the Hall Plate. Echo 2 = through the West Door onto the Reading
 * Plate. The vault stays sealed (paradox). Delete Echo 1; record again: hold the Hall Plate until Echo 2 is through,
 * step off, walk into the vault onto the Vault Plate. Then walk into the spire.
 * Stored solution (equivalent loop set, no deletion needed): Echo 1 is recorded "blind" — it leaves the Hall Plate
 * at 6 s and pushes into the sealed Vault Door, then east, a sequence that only works once Echo 2 exists.
 * Minimum 2 echoes: the Vault Plate must be held while you stand in the spire, the Reading Plate while the vault
 * opens, and the Hall Plate while somebody enters the west room — by somebody who is not in the west room.
 */
export const level09ParadoxChamber: LevelDefinition = {
  id: 'L09-paradox-chamber',
  order: 9,
  name: 'The Paradox Chamber',
  subtitle: 'Your first echo is in the way of your last.',
  story: [
    'Ascendant Facility — The Paradox Spire.',
    'Two keys that must turn in the right order. Each one waits on the other.',
    'When the past blocks the future, rewrite the past. It will not mind.',
  ],
  grid: {
    width: 22,
    height: 14,
    tiles: [
      '######################',
      '#......##...###......#',
      '#......##...###......#',
      '#......##...###......#',
      '#......##...###......#',
      '#......###.#####.#####',
      '####.#####.#####.#####',
      '#....................#',
      '#...O............O...#',
      '#....................#',
      '#....................#',
      '#....................#',
      '#....................#',
      '######################',
    ],
  },
  entities: [
    { id: 'plate-hall', kind: 'pressurePlate', col: 20, row: 12, label: 'Hall Plate', config: {} },
    { id: 'door-west', kind: 'door', col: 4, row: 6, facing: 0, label: 'West Door', config: {} },
    { id: 'plate-reading', kind: 'pressurePlate', col: 1, row: 1, label: 'Reading Plate', config: {} },
    { id: 'door-vault', kind: 'door', col: 16, row: 5, facing: 0, logic: 'and', label: 'Vault Door', config: {} },
    { id: 'plate-vault', kind: 'pressurePlate', col: 20, row: 1, label: 'Vault Plate', config: {} },
    { id: 'door-spire', kind: 'door', col: 10, row: 5, facing: 0, label: 'Spire Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 10, row: 2, label: 'Exit', config: { objective: 'Unseal the vault and hold the Vault Plate' } },
  ],
  wires: [
    { from: 'plate-hall', to: 'door-west' },
    { from: 'plate-reading', to: 'door-vault' },
    { from: 'plate-hall', to: 'door-vault', invert: true },
    { from: 'plate-vault', to: 'door-spire' },
  ],
  playerSpawn: { col: 10, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 18,
  parEchoes: 2,
  hints: [
    { text: 'Look at the Vault Door wiring: it needs the Reading Plate held AND the Hall Plate EMPTY.' },
    { text: 'Your Hall Plate echo has to step off once your Reading Plate echo is inside — but it was recorded first.', afterSeconds: 50 },
    {
      text: 'Delete Echo 1 and record it again. As the youngest loop it can watch Echo 2 go through, then leave the plate and follow into the vault.',
      afterSeconds: 110,
    },
  ],
  solution: [
    // Loop 1 (Echo 1, recorded "blind"): hold the Hall Plate until 6 s, then push into the sealed Vault Door and on
    // to the Vault Plate. Equivalent to the delete-and-re-record route (see campaign tests).
    [
      { op: 'moveTo', col: 20, row: 11 },
      { op: 'moveTo', col: 20, row: 12 },
      { op: 'waitUntil', tick: 360 },
      { op: 'moveTo', col: 16, row: 7 },
      { op: 'moveTo', col: 16, row: 6 },
      { op: 'move', dx: 0, dz: -1, ticks: 140 },
      { op: 'move', dx: 1, dz: 0, ticks: 200 },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 2 (Echo 2): through the West Door while Echo 1 holds the Hall Plate; hold the Reading Plate.
    [
      { op: 'moveTo', col: 4, row: 7 },
      { op: 'moveTo', col: 4, row: 5, timeoutTicks: 900 },
      { op: 'moveTo', col: 1, row: 2 },
      { op: 'moveTo', col: 1, row: 1 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: wait below the Spire Door; walk up when the Vault Plate is held.
    [
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
      { col: 20, row: 12 },
      { col: 4, row: 6 },
      { col: 1, row: 1 },
      { col: 16, row: 5 },
      { col: 20, row: 1 },
      { col: 10, row: 5 },
      { col: 10, row: 2 },
    ],
  },
  decor: [
    { type: 'ring', col: 10, row: 2, facing: 2, params: { scale: 1.6, clockwork: true, color: 'violet' } },
    { type: 'observationWindow', col: 10, row: 0, facing: 2, params: { width: 3 } },
    { type: 'archway', col: 10, row: 5, facing: 0, params: { indicators: 1 } },
    { type: 'archway', col: 16, row: 5, facing: 0, params: { indicators: 2 } },
    { type: 'archway', col: 4, row: 6, facing: 0, params: { indicators: 1 } },
    { type: 'conduit', col: 21, row: 12, facing: 3, params: { to: 'door-west', color: 'teal' } },
    { type: 'conduit', col: 21, row: 11, facing: 3, params: { to: 'door-vault', color: 'coral', inverted: true } },
    { type: 'conduit', col: 2, row: 0, facing: 2, params: { to: 'door-vault', color: 'teal' } },
    { type: 'conduit', col: 21, row: 1, facing: 3, params: { to: 'door-spire', color: 'violet' } },
    { type: 'machinery', col: 6, row: 3, facing: 3, params: { variant: 'archive' } },
    { type: 'machinery', col: 15, row: 3, facing: 1, params: { variant: 'vault' } },
    { type: 'lamp', col: 1, row: 9, facing: 1 },
    { type: 'lamp', col: 20, row: 8, facing: 3 },
    { type: 'hologram', col: 10, row: 8, params: { text: 'X ⇄ Y', color: 'violet' } },
  ],
  seed: 909,
  teaches: ['mutualDependency', 'deleteLoop', 'reRecord', 'invertedWire'],
};

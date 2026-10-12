import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 14 — GOLD AND CYAN  (round 6, campaign order 11; teaches: ATTUNED KEYS — a gold device answers only the
 * living player, a cyan device answers only an echo; an intended fail -> use divergence)
 *
 * The Attuned Archive keys its locks to who is asking. The Gold Seal in front of the Archive Door counts only you, as
 * you are now: an echo standing on it weighs nothing. Behind the door, the Echo Console answers only an echo: pressed
 * live it refuses you ('attuned'), and the very same press, replayed by your echo, is accepted. The console lights the
 * Reading Room Door for 5 s, and the exit is about 3 s from the seal.
 *
 * So the obvious attempt teaches the rule: stand on the seal, slip into the archive before the door shuts, press the
 * console — refused. Commit that recording. In the next run you hold the seal (your echo cannot), your echo walks past
 * you into the archive and repeats the press, and this time it lands. You leave the seal once your echo is through and
 * run for the door while the console burns.
 *
 *   col: 0         1
 *        0123456789012345
 *   r0   ################
 *   r1   ####.C.#########   C Echo Console (5,1), cyan, faces south: answers echoes only (5 s)
 *   r2   ####...#########   the Archive (4..6 x 1..3): a dead end the echo is sealed in
 *   r3   ####...#########
 *   r4   #####A##########   A Archive Door (5,4) <- Gold Seal
 *   r5   #....g.........#   g Gold Seal (5,5), gold: counts the living player only
 *   r6   #..............#
 *   r7   #..O.......O...#
 *   r8   #...........@..#   @ spawn (12,8)
 *   r9   #..............#
 *   r10  ########R#######   R Reading Room Door (8,10) <- Echo Console
 *   r11  #######.X.######   X exit (8,11)
 *   r12  ################
 *
 * Minimum echoes is 1, by the keys alone: the exit needs the console, the console needs an echo's press, and the
 * echo can only reach it while the living player holds the seal (an echo weighs nothing on gold, and nothing else
 * opens the Archive Door). Zero echoes can never light a cyan console. There is no crate, so nothing else weighs the
 * seal.
 */
export const level14GoldAndCyan: LevelDefinition = {
  id: 'L14-gold-and-cyan',
  order: 11,
  name: 'Gold and Cyan',
  subtitle: 'Some locks know who is asking.',
  story: [
    'Paradox Wing — The Attuned Archive.',
    'The seal answers the living. The console answers echoes. Gold for now, cyan for then.',
    'LOG 063 · The Archive keys itself to whoever asks. It opens for my past and refuses me. — H.A.',
  ],
  grid: {
    width: 16,
    height: 13,
    tiles: [
      '################',
      '####...#########',
      '####...#########',
      '####...#########',
      '#####.##########',
      '#..............#',
      '#..............#',
      '#..O.......O...#',
      '#..............#',
      '#..............#',
      '########.#######',
      '#######...######',
      '################',
    ],
  },
  entities: [
    { id: 'seal-gold', kind: 'pressurePlate', col: 5, row: 5, label: 'Gold Seal', config: { accepts: 'player' } },
    { id: 'door-archive', kind: 'door', col: 5, row: 4, facing: 0, label: 'Archive Door', config: {} },
    {
      id: 'console-echo',
      kind: 'timedSwitch',
      col: 5,
      row: 1,
      facing: 2,
      label: 'Echo Console',
      config: { durationTicks: 300, retrigger: true, accepts: 'echoes' },
    },
    { id: 'door-reading', kind: 'door', col: 8, row: 10, facing: 0, label: 'Reading Room Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 8, row: 11, label: 'Exit', config: { objective: 'Have an echo light the Echo Console' } },
  ],
  wires: [
    { from: 'seal-gold', to: 'door-archive' },
    { from: 'console-echo', to: 'door-reading' },
  ],
  playerSpawn: { col: 12, row: 8, facing: 3 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 11,
  parEchoes: 1,
  hints: [
    { text: 'Gold answers only you, as you are now. Cyan answers only your echoes. The Gold Seal ignores an echo; the Echo Console refuses you.' },
    {
      text: 'Press the Echo Console yourself and let it refuse you, then {echo}. Your echo replays the same press, and this time it is accepted.',
      afterSeconds: 50,
    },
    {
      text: 'Echo 1: step on the Gold Seal, slip into the Archive and press {interact} at the console. You: hold the Gold Seal until your echo is through, then run for the Reading Room Door.',
      afterSeconds: 100,
    },
  ],
  solution: [
    // Loop 1 (Echo 1): the honest attempt. Seal, into the Archive before the door shuts (a door never closes on a
    // body), press the console. Recorded: fail 'attuned'. Replayed by the echo: use (the intended divergence).
    [
      { op: 'moveTo', col: 5, row: 5 },
      { op: 'moveTo', col: 5, row: 2, timeoutTicks: 300 },
      { op: 'face', dir: 0 },
      { op: 'interact' },
      { op: 'wait', ticks: 20 },
    ],
    // Final run: hold the Gold Seal while the echo walks through, then run for the exit inside the 5 s window.
    [
      { op: 'moveTo', col: 5, row: 5 },
      { op: 'waitUntil', tick: 240 },
      { op: 'moveTo', col: 8, row: 8 },
      { op: 'moveTo', col: 8, row: 11, timeoutTicks: 600 },
    ],
  ],
  camera: {
    focus: { col: 7, row: 6 },
    yawStep: 0,
    zoom: 1.0,
    introPath: [
      { col: 12, row: 8 },
      { col: 5, row: 5 },
      { col: 5, row: 4 },
      { col: 5, row: 1 },
      { col: 8, row: 10 },
      { col: 8, row: 11 },
    ],
  },
  decor: [
    { type: 'archway', col: 5, row: 4, facing: 0, params: { indicators: 1 } },
    { type: 'archway', col: 8, row: 10, facing: 0, params: { indicators: 1 } },
    { type: 'observationWindow', col: 5, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 8, row: 11, facing: 0, params: { scale: 1.0, clockwork: true, color: 'violet' } },
    { type: 'conduit', col: 4, row: 5, facing: 0, params: { to: 'door-archive', color: 'gold' } },
    { type: 'conduit', col: 6, row: 1, facing: 3, params: { to: 'door-reading', color: 'cyan', span: 'hall' } },
    { type: 'machinery', col: 4, row: 2, facing: 1, params: { variant: 'archive' } },
    { type: 'machinery', col: 6, row: 3, facing: 3, params: { variant: 'archive' } },
    { type: 'machinery', col: 1, row: 9, facing: 1, params: { variant: 'archive' } },
    { type: 'machinery', col: 14, row: 5, facing: 3, params: { variant: 'archive' } },
    { type: 'banner', col: 3, row: 5, facing: 2, params: { color: 'gold' } },
    { type: 'banner', col: 7, row: 5, facing: 2, params: { color: 'cyan' } },
    { type: 'lamp', col: 1, row: 6, facing: 1 },
    { type: 'lamp', col: 14, row: 8, facing: 3 },
    { type: 'lamp', col: 6, row: 2, facing: 3 },
    { type: 'hologram', col: 9, row: 6, params: { text: 'GOLD · NOW   CYAN · THEN', color: 'violet' } },
  ],
  seed: 1414,
  teaches: ['attunedDevices', 'goldForNow', 'cyanForThen'],
};

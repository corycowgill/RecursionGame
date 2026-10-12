import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 15 — GLASS GALLERY  (round 6, campaign order 13; reinforces ATTUNED KEYS, teaches PARADOX GLASS: route your
 * past selves, not just their timing)
 *
 * The Crown Door needs three things at once: the Glass Seal in front of it held by YOU (gold glass: it counts only the
 * living player, and it SHATTERS for the rest of the pass the moment an echo stands on it), the West Timer and the East
 * Timer (2.5 s each, eighteen tiles apart). The Glass Seal sits on the only junction between the hall and the gallery,
 * so the short way to either timer crosses it. Whatever you do while recording is fine (the glass knows you), but the
 * echo replaying that walk breaks it: a visible shatter, named after the echo. The echoes must take the service
 * corridors around the outside (+4 s), and the twin-timer schedule moves with them.
 *
 * Keys again: the East Timer's alcove is behind the Cyan Door, wired from the Echo Plate in front of the West Timer.
 * Standing there live does nothing; your West echo standing there opens the East alcove for your second echo.
 *
 *   col: 0         1         2
 *        012345678901234567890123456
 *   r0   ###########################
 *   r1   #.....######.X.#####......#   X exit (13,1)          west / east service corridors (rows 1, cols 1 / 25)
 *   r2   #.###.#######C######.####.#   C Crown Door (13,2) <- Glass Seal AND West Timer AND East Timer
 *   r3   #.#Wp........g......jDeE#.#   W West Timer (3,3)  p Echo Plate (4,3, cyan)  g Glass Seal (13,3, gold glass)
 *   r4   #.###########.###########.#   D Cyan Door (21,3) <- Echo Plate   e alcove (22,3)  E East Timer (23,3)
 *   r5   #.===========.===========.#   j = (20,3), where the east service corridor joins the gallery
 *        (r5 '=' railings: solid like walls, but low, so the gallery and the seal stay visible from the hall camera)
 *   r6   #.###########.###########.#   the short corridor (col 13) leads from the hall straight onto the glass
 *   r7   #.........................#
 *   r8   #.........................#
 *   r9   #....O..............O.....#
 *   r10  #............@............#   @ spawn (13,10)
 *   r11  #.........................#
 *   r12  ###########################
 *
 * Minimum echoes is 2 (body count + keys): when the Crown Door opens, you are on the Glass Seal (only you count, and
 * no echo may ever touch it), and both timers were pressed within the last 2.5 s. Each timer's stand cell is 9 tiles
 * (3.75 s) from the seal, longer than a timer's 2.5 s window, and the two are 18 tiles apart, so neither you nor one echo
 * can light a timer and still be in place: two echo hands. The Crown Door never closes on a body, but it only opens
 * while you hold the seal, so there is no doorstop to set up beforehand.
 */
export const level15GlassGallery: LevelDefinition = {
  id: 'L15-glass-gallery',
  order: 13,
  name: 'Glass Gallery',
  subtitle: 'Route your past selves, not just their timing.',
  story: [
    'Paradox Wing — The Glass Gallery.',
    'The seal is glass, and it answers only the living. Glass remembers who walked on it.',
    'LOG 080 · My echoes broke the gallery seal again. They walk where I walked, so now I walk the long way. — H.A.',
  ],
  grid: {
    width: 27,
    height: 13,
    tiles: [
      '###########################',
      '#.....######...#####......#',
      '#.###.#######.######.####.#',
      '#.#.....................#.#',
      '#.###########.###########.#',
      '#.===========.===========.#',
      '#.###########.###########.#',
      '#.........................#',
      '#.........................#',
      '#....O..............O.....#',
      '#.........................#',
      '#.........................#',
      '###########################',
    ],
  },
  entities: [
    {
      id: 'seal-glass',
      kind: 'pressurePlate',
      col: 13,
      row: 3,
      label: 'Glass Seal',
      config: { accepts: 'player', shatterOn: 'echoes' },
    },
    { id: 'timer-west', kind: 'timedSwitch', col: 3, row: 3, facing: 1, label: 'West Timer', config: { durationTicks: 150, retrigger: true } },
    { id: 'plate-echo', kind: 'pressurePlate', col: 4, row: 3, label: 'Echo Plate', config: { accepts: 'echoes' } },
    { id: 'door-cyan', kind: 'door', col: 21, row: 3, facing: 1, label: 'Cyan Door', config: { openTicks: 12 } },
    { id: 'timer-east', kind: 'timedSwitch', col: 23, row: 3, facing: 3, label: 'East Timer', config: { durationTicks: 150, retrigger: true } },
    { id: 'door-crown', kind: 'door', col: 13, row: 2, facing: 0, label: 'Crown Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 13, row: 1, label: 'Exit', config: { objective: 'Hold the Glass Seal while both timers burn' } },
  ],
  wires: [
    { from: 'plate-echo', to: 'door-cyan' },
    { from: 'seal-glass', to: 'door-crown' },
    { from: 'timer-west', to: 'door-crown' },
    { from: 'timer-east', to: 'door-crown' },
  ],
  playerSpawn: { col: 13, row: 10, facing: 0 },
  exitId: 'exit',
  maxEchoes: 2,
  loopDurationTicks: 60 * 75,
  parTimeSeconds: 19,
  parEchoes: 2,
  hints: [
    { text: 'The Crown Door needs you on the Glass Seal and both timers lit. The seal is glass: if an echo ever stands on it, it shatters.' },
    {
      text: 'Your echoes walk exactly where you walked. Record their trips around the service corridors, never across the seal.',
      afterSeconds: 65,
    },
    {
      text: 'Echo 1: the west corridor, onto the Echo Plate, press the West Timer. Echo 2: the east corridor, through the Cyan Door, press the East Timer with Echo 1. You: wait on the seal.',
      afterSeconds: 125,
    },
  ],
  solution: [
    // Loop 1 (Echo 1): west service corridor (never the glass), onto the Echo Plate, West Timer at 13 s.
    [
      { op: 'moveTo', col: 1, row: 7 },
      { op: 'moveTo', col: 1, row: 1 },
      { op: 'moveTo', col: 5, row: 1 },
      { op: 'moveTo', col: 5, row: 3 },
      { op: 'moveTo', col: 4, row: 3 },
      { op: 'face', dir: 3 },
      { op: 'waitUntil', tick: 780 },
      { op: 'interact' },
      { op: 'wait', ticks: 20 },
    ],
    // Loop 2 (Echo 2): east service corridor, through the Cyan Door (open while Echo 1 stands on the Echo Plate),
    // East Timer together with Echo 1.
    [
      { op: 'moveTo', col: 25, row: 7 },
      { op: 'moveTo', col: 25, row: 1 },
      { op: 'moveTo', col: 20, row: 1 },
      { op: 'moveTo', col: 20, row: 3 },
      { op: 'moveTo', col: 22, row: 3, timeoutTicks: 400 },
      { op: 'face', dir: 1 },
      { op: 'waitUntil', tick: 780 },
      { op: 'interact' },
      { op: 'wait', ticks: 20 },
    ],
    // Final run: the short corridor straight onto the Glass Seal; step into the Crown Door when it opens.
    [
      { op: 'moveTo', col: 13, row: 3 },
      { op: 'moveTo', col: 13, row: 1, timeoutTicks: 1200 },
    ],
  ],
  camera: {
    focus: { col: 13, row: 6 },
    yawStep: 0,
    zoom: 1.3,
    introPath: [
      { col: 13, row: 10 },
      { col: 13, row: 3 },
      { col: 13, row: 2 },
      { col: 4, row: 3 },
      { col: 3, row: 3 },
      { col: 1, row: 1 },
      { col: 21, row: 3 },
      { col: 23, row: 3 },
      { col: 25, row: 1 },
      { col: 13, row: 1 },
    ],
  },
  decor: [
    { type: 'archway', col: 13, row: 2, facing: 0, params: { indicators: 3 } },
    { type: 'archway', col: 21, row: 3, facing: 1, params: { indicators: 1 } },
    { type: 'observationWindow', col: 13, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 13, row: 1, facing: 2, params: { scale: 1.1, clockwork: true, color: 'violet' } },
    { type: 'conduit', col: 3, row: 2, facing: 2, params: { to: 'door-crown', color: 'gold' } },
    { type: 'conduit', col: 23, row: 2, facing: 2, params: { to: 'door-crown', color: 'gold' } },
    { type: 'conduit', col: 4, row: 4, facing: 0, params: { to: 'door-cyan', color: 'cyan', span: 'gallery' } },
    { type: 'machinery', col: 8, row: 4, facing: 0, params: { variant: 'gears' } },
    { type: 'machinery', col: 18, row: 4, facing: 0, params: { variant: 'gears' } },
    { type: 'banner', col: 12, row: 4, facing: 2, params: { color: 'gold' } },
    { type: 'banner', col: 14, row: 4, facing: 2, params: { color: 'gold' } },
    { type: 'lamp', col: 1, row: 9, facing: 1 },
    { type: 'lamp', col: 25, row: 9, facing: 3 },
    { type: 'lamp', col: 3, row: 1, facing: 2 },
    { type: 'lamp', col: 23, row: 1, facing: 2 },
    { type: 'hologram', col: 13, row: 8, params: { text: 'GLASS REMEMBERS', color: 'violet' } },
  ],
  seed: 1515,
  teaches: ['paradoxGlass', 'attunedDevices', 'routing'],
};

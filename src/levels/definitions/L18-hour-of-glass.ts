import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 18 — HOUR OF GLASS  (round 6, campaign order 17, the penultimate exam: CHRONO RELAY + CHECK VALVE + ATTUNED
 * KEYS + PARADOX GLASS, with the old crate, laser and timer)
 *
 * The Crown Door needs four things at the same moment:
 *   1. the HOUR RELAY: the Echo Console's 3 s pulse, delivered 8 s after it was pressed. The console is cyan (echoes
 *      only) and sits in the Lens Room, deep in the Sump: through the Sump Valve (eastward only: whoever goes in stays
 *      in), then the Lens Door, which opens only while the Hour Laser's beam is blocked. A body in the beam cannot
 *      also reach the console, so the Courier carries the crate in and sets it in the beam.
 *   2. the ECHO PLATE in the west room (cyan: only an echo weighs anything on it);
 *   3. the CROWN TIMER in the far south-east of the hall (2.5 s, no retrigger, cooldown);
 *   4. the GLASS SEAL in front of the door: gold glass, it counts only you, and an echo that ever stands on it shatters
 *      it for the rest of the pass. The crate's shortest way to the Sump crosses it. The Courier must carry it the long
 *      way round, down the west stair, across the hall and up the east stair.
 * The console has no retrigger and a cooldown, so its pulse cannot be held on: the Courier's press decides the moment,
 * eight seconds ahead, and the Timekeeper and you plan around it.
 *
 *   col: 0         1         2
 *        01234567890123456789012345
 *   r0   ##########################
 *   r1   #...p.#####.X.#####L.R####   p Echo Plate (4,1, cyan)   X exit (12,1)   L Hour Laser (19,1) -> R receiver (21,1)
 *   r2   #c....######C####h#...####   c crate (1,2)   C Crown Door (12,2)   h Hour Relay (17,2, in the wall: 8 s)
 *   r3   #...........g.....VsssDaE#   g Glass Seal (12,3)   V Sump Valve (18,3), eastward   s Sump (19..21 x 1..3)
 *   r4   ##.#########.###.#########   D Lens Door (22,3) <- laser AND NOT receiver   a alcove (23,3)   E Echo Console (24,3, cyan)
 *   r5   ##.=========.===.========#   west stair (2,4..5)   short stair (12,4..5)   east stair (16,4..5)
 *        (r5 '=' railings: solid like walls, but low, so the gallery, the seal and the Sump stay visible)
 *   r6   #........................#
 *   r7   #........................#
 *   r8   #........................#
 *   r9   #.....O.....@......O.....#   @ spawn (12,9)
 *   r10  #........................#
 *   r11  #........................#
 *   r12  #.......................T#   T Crown Timer (24,12)
 *   r13  ##########################
 *
 * Minimum echoes is 3 (keys + valve + body count). At the moment the Crown Door opens: you are on the Glass Seal (only
 * the living player counts); an echo stands on the Echo Plate (only echoes count); the Crown Timer was pressed within
 * the last 2.5 s, by a body 7 s from the seal and 10 s from the Echo Plate; and an echo pressed the Echo Console 8 s
 * earlier (only echoes can), from inside the Sump, which nobody leaves (the valve). So the Courier, the plate holder and
 * the Timekeeper are three different echoes. The Courier needs the crate: the beam cell is 2 tiles from the Lens Door,
 * which shuts within 6 ticks of the beam reaching the receiver again, so a body cannot block the beam and then pass.
 */
export const level18HourOfGlass: LevelDefinition = {
  id: 'L18-hour-of-glass',
  order: 17,
  name: 'Hour of Glass',
  subtitle: 'Everything you learned, eight seconds early.',
  story: [
    'Paradox Wing — The Hour of Glass.',
    'Light, glass, the one-way sump and the long line: every lock here remembers something. Act before you need it.',
    'LOG 098 · The Core is one door away. Every lock was keyed to me. I set them for whoever comes next. — H.A.',
  ],
  grid: {
    width: 26,
    height: 14,
    tiles: [
      '##########################',
      '#.....#####...#####...####',
      '#.....######.######...####',
      '#........................#',
      '##.#########.###.#########',
      '##.=========.===.========#',
      '#........................#',
      '#........................#',
      '#........................#',
      '#.....O............O.....#',
      '#........................#',
      '#........................#',
      '#........................#',
      '##########################',
    ],
  },
  entities: [
    { id: 'crate-hour', kind: 'crate', col: 1, row: 2, label: 'Lens Crate', config: {} },
    { id: 'plate-echo', kind: 'pressurePlate', col: 4, row: 1, label: 'Echo Plate', config: { accepts: 'echoes' } },
    { id: 'seal-glass', kind: 'pressurePlate', col: 12, row: 3, label: 'Glass Seal', config: { accepts: 'player', shatterOn: 'echoes' } },
    { id: 'valve-sump', kind: 'checkValve', col: 18, row: 3, facing: 1, label: 'Sump Valve', config: {} },
    { id: 'laser-hour', kind: 'laserEmitter', col: 19, row: 1, facing: 1, label: 'Hour Laser', config: { rangeTiles: 4 } },
    { id: 'receiver-hour', kind: 'laserReceiver', col: 21, row: 1, label: 'Hour Receiver', config: {} },
    { id: 'door-lens', kind: 'door', col: 22, row: 3, facing: 1, label: 'Lens Door', config: { openTicks: 12 } },
    {
      id: 'console-echo',
      kind: 'timedSwitch',
      col: 24,
      row: 3,
      facing: 3,
      label: 'Echo Console',
      config: { durationTicks: 180, retrigger: false, cooldownTicks: 240, accepts: 'echoes' },
    },
    { id: 'relay-hour', kind: 'chronoRelay', col: 17, row: 2, label: 'Hour Relay', config: { delayTicks: 480 } },
    {
      id: 'timer-crown',
      kind: 'timedSwitch',
      col: 24,
      row: 12,
      facing: 3,
      label: 'Crown Timer',
      config: { durationTicks: 150, retrigger: false, cooldownTicks: 180 },
    },
    { id: 'door-crown', kind: 'door', col: 12, row: 2, facing: 0, label: 'Crown Door', config: { openTicks: 12 } },
    { id: 'exit', kind: 'exitPortal', col: 12, row: 1, label: 'Exit', config: { objective: 'Open the Crown Door: relay, Echo Plate, timer and seal at once' } },
  ],
  wires: [
    // The Lens Door opens while the beam is on but does not reach the receiver (the emitter input also keeps the
    // door from twitching open on tick 0, before the beam has reached the receiver).
    { from: 'laser-hour', to: 'door-lens' },
    { from: 'receiver-hour', to: 'door-lens', invert: true },
    { from: 'console-echo', to: 'relay-hour' },
    { from: 'relay-hour', to: 'door-crown' },
    { from: 'plate-echo', to: 'door-crown' },
    { from: 'timer-crown', to: 'door-crown' },
    { from: 'seal-glass', to: 'door-crown' },
  ],
  playerSpawn: { col: 12, row: 9, facing: 0 },
  exitId: 'exit',
  maxEchoes: 3,
  loopDurationTicks: 60 * 90,
  parTimeSeconds: 38,
  parEchoes: 3,
  hints: [
    {
      text: 'The Crown Door needs the Hour Relay, the Echo Plate, the Crown Timer and you on the Glass Seal, all at once. The relay delivers the Echo Console 8 s late.',
    },
    {
      text: 'Whoever enters the Sump stays there: carry the crate in and set it in the beam to open the Lens Door. Take it the long way round: the seal is glass.',
      afterSeconds: 120,
    },
    {
      text: 'Echo 1: crate down the west stair, up the east stair, into the beam, then the Echo Console. Echo 2: stand on the Echo Plate. Echo 3: press the Crown Timer 8 s after the console. You: wait on the seal.',
      afterSeconds: 235,
    },
  ],
  solution: [
    // Loop 1 (Echo 1, the Courier): the crate the long way round (never across the glass), through the Sump Valve,
    // into the beam; through the Lens Door; press the Echo Console. Recorded: fail 'attuned'. Replayed: use, and the
    // Hour Relay delivers the pulse to the Crown Door 8 s later.
    [
      { op: 'moveTo', col: 2, row: 6 },
      { op: 'moveTo', col: 2, row: 3 },
      { op: 'moveTo', col: 1, row: 3 },
      { op: 'face', dir: 0 },
      { op: 'interact' },
      { op: 'moveTo', col: 2, row: 3 },
      { op: 'moveTo', col: 2, row: 6 },
      { op: 'moveTo', col: 16, row: 6 },
      { op: 'moveTo', col: 16, row: 3 },
      { op: 'moveTo', col: 20, row: 3 },
      { op: 'moveTo', col: 20, row: 2 },
      { op: 'face', dir: 0 },
      { op: 'interact' },
      { op: 'moveTo', col: 21, row: 3 },
      { op: 'moveTo', col: 23, row: 3, timeoutTicks: 120 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'wait', ticks: 20 },
    ],
    // Loop 2 (Echo 2, the plate holder): the west stair to the Echo Plate, and stay.
    [
      { op: 'moveTo', col: 2, row: 6 },
      { op: 'moveTo', col: 2, row: 3 },
      { op: 'moveTo', col: 4, row: 1 },
      { op: 'wait', ticks: 30 },
    ],
    // Loop 3 (Echo 3, the Timekeeper): the Crown Timer, pressed as the relayed pulse reaches the Crown Door.
    [
      { op: 'moveTo', col: 23, row: 12 },
      { op: 'face', dir: 1 },
      { op: 'waitUntil', tick: 1560 },
      { op: 'interact' },
      { op: 'wait', ticks: 20 },
    ],
    // Final run: the short stair onto the Glass Seal; through the Crown Door when it opens.
    [
      { op: 'moveTo', col: 12, row: 3 },
      { op: 'moveTo', col: 12, row: 1, timeoutTicks: 2400 },
    ],
  ],
  camera: {
    focus: { col: 13, row: 6 },
    yawStep: 0,
    zoom: 1.4,
    introPath: [
      { col: 12, row: 9 },
      { col: 12, row: 3 },
      { col: 12, row: 2 },
      { col: 1, row: 2 },
      { col: 4, row: 1 },
      { col: 18, row: 3 },
      { col: 20, row: 1 },
      { col: 22, row: 3 },
      { col: 24, row: 3 },
      { col: 17, row: 2 },
      { col: 24, row: 12 },
      { col: 12, row: 1 },
    ],
  },
  decor: [
    { type: 'archway', col: 12, row: 2, facing: 0, params: { indicators: 4 } },
    { type: 'archway', col: 22, row: 3, facing: 1, params: { indicators: 1 } },
    { type: 'observationWindow', col: 12, row: 0, facing: 2, params: { width: 3 } },
    { type: 'ring', col: 12, row: 1, facing: 2, params: { scale: 1.2, clockwork: true, color: 'gold' } },
    { type: 'ring', col: 12, row: 7, facing: 0, params: { scale: 2.4, clockwork: true, color: 'violet' } },
    { type: 'conduit', col: 5, row: 1, facing: 3, params: { to: 'door-crown', color: 'cyan' } },
    { type: 'conduit', col: 24, row: 11, facing: 0, params: { to: 'door-crown', color: 'gold', span: 'hall' } },
    { type: 'conduit', col: 21, row: 2, facing: 3, params: { to: 'door-lens', color: 'teal' } },
    { type: 'machinery', col: 8, row: 6, facing: 2, params: { variant: 'clockwork' } },
    { type: 'machinery', col: 17, row: 6, facing: 2, params: { variant: 'gears' } },
    { type: 'machinery', col: 1, row: 12, facing: 1, params: { variant: 'coreDynamo' } },
    { type: 'banner', col: 11, row: 3, facing: 2, params: { color: 'gold' } },
    { type: 'banner', col: 13, row: 3, facing: 2, params: { color: 'gold' } },
    { type: 'lamp', col: 1, row: 7, facing: 1 },
    { type: 'lamp', col: 24, row: 7, facing: 3 },
    { type: 'lamp', col: 20, row: 2, facing: 2 },
    { type: 'lamp', col: 3, row: 2, facing: 1 },
    { type: 'hologram', col: 12, row: 11, params: { text: 'ACT BEFORE YOU NEED IT', color: 'violet' } },
  ],
  seed: 1818,
  teaches: ['exam', 'anticipation', 'routing'],
};

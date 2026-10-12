import type { LevelDefinition } from '../../engine/contracts';

/**
 * LEVEL 12 — LATE LIGHT  (round 6; campaign order 8. Teaches: the CHRONO RELAY, an "Echo Line" that repeats its input
 * 6 s later. Your past opens doors for your future: act before you need it.)
 *
 * Beat 1 (solo, reads the tube): the Bell Console (a 2 s timed switch) feeds the Gallery Door through a 6 s Echo Line.
 * The door is a 4.6 s walk from the console. A direct wire would shut 2 s after the press, long before you arrive;
 * through the line the door opens 6 s after the press, as you get there, and stays open for the 2 s you rang it.
 *
 * Beat 2 (body count): the Exit Door needs the Bell Line (the Bell Plate, 6 s late) AND the Lamp Plate, at once.
 * Bell Plate to Lamp Plate is 3.3 s of walking; Bell Plate to the Exit Door is 7.9 s, more than the line's 6 s.
 *   - Alone you fail: you cannot hold the Lamp Plate and walk through the door at once.
 *   - You on the Bell Plate with an echo on the Lamp fails: the delayed bell has run out before you reach the door.
 *   - The plan: Echo 1 rings the Bell Plate, walks to the Lamp Plate and stays; its own bell arrives 6 s later while
 *     it holds the lamp, and you, waiting at the Exit Door, walk through. One echo is allowed (two would let a pair of
 *     plate-holders skip the lesson).
 *
 *   col: 0         1         2
 *        012345678901234567890123
 *   r0   ########################
 *   r1   #....c##################   c Bell Console (5,1): 2 s timed switch -> Echo Line A (6 s) -> Gallery Door
 *   r2   #.....##################
 *   r3   #..@...........#########   @ spawn (3,3)   the walk to the Gallery Door (row 3, then col 12)
 *   r4   #.....######.##########A   A Echo Line A (23,4) is drawn as a tube along the corridor
 *   r5   #.....######.###########
 *   r6   ############.#######X###   X exit (20,6)
 *   r7   ############G#######D###   G Gallery Door (12,7) <- Line A     D Exit Door (20,7) <- Line B AND Lamp Plate
 *   r8   #......................B   B Echo Line B (23,8): Bell Plate, 6 s late
 *   r9   #.b.......l............#   b Bell Plate (2,9)   l Lamp Plate (10,9)
 *   r10  #......................#
 *   r11  ########################
 *
 * Intended solution (1 echo): Echo 1 rings the console, walks to the Gallery Door and passes when it opens, holds the
 * Bell Plate for 2 s, then walks to the Lamp Plate and stays. You follow it through the Gallery Door, wait at the Exit
 * Door and walk through when the delayed bell arrives.
 * Minimum 1 echo (body count): at the opening someone holds the Lamp Plate and you are in the doorway; the bell must
 * have been rung 6 s earlier by someone who could be on the Lamp Plate (3.3 s away) or in the doorway (7.9 s away)
 * by now: only the lamp holder can.
 */
export const level12LateLight: LevelDefinition = {
  id: 'L12-late-light',
  order: 8,
  name: 'Late Light',
  subtitle: 'Ring it now. It answers later.',
  story: [
    'Machine Hall — The Echo Line.',
    'The line remembers. Ring the bell now, and the doors will hear it six seconds from now.',
    'LOG 055 · The line delivers my own footsteps six seconds late. I have started walking ahead of them. — H.A.',
  ],
  grid: {
    width: 24,
    height: 12,
    tiles: [
      '########################',
      '#.....##################',
      '#.....##################',
      '#..............#########',
      '#.....######.###########',
      '#.....######.###########',
      '############.#######.###',
      '############.#######.###',
      '#......................#',
      '#......................#',
      '#......................#',
      '########################',
    ],
  },
  entities: [
    {
      id: 'switch-bell',
      kind: 'timedSwitch',
      col: 5,
      row: 1,
      facing: 2,
      label: 'Bell Console',
      config: { durationTicks: 120, retrigger: true },
    },
    { id: 'relay-gallery', kind: 'chronoRelay', col: 23, row: 4, facing: 3, label: 'Echo Line A - 6 s', config: { delayTicks: 360 } },
    { id: 'door-gallery', kind: 'door', col: 12, row: 7, facing: 0, label: 'Gallery Door', config: {} },
    { id: 'plate-bell', kind: 'pressurePlate', col: 2, row: 9, label: 'Bell Plate', config: {} },
    { id: 'relay-bell', kind: 'chronoRelay', col: 23, row: 8, facing: 3, label: 'Echo Line B - 6 s', config: { delayTicks: 360 } },
    { id: 'plate-lamp', kind: 'pressurePlate', col: 10, row: 9, label: 'Lamp Plate', config: {} },
    { id: 'door-exit', kind: 'door', col: 20, row: 7, facing: 0, logic: 'and', label: 'Exit Door', config: {} },
    { id: 'exit', kind: 'exitPortal', col: 20, row: 6, label: 'Exit', config: { objective: 'Ring the bell early, hold the lamp, and leave' } },
  ],
  wires: [
    { from: 'switch-bell', to: 'relay-gallery' },
    { from: 'relay-gallery', to: 'door-gallery' },
    { from: 'plate-bell', to: 'relay-bell' },
    { from: 'relay-bell', to: 'door-exit' },
    { from: 'plate-lamp', to: 'door-exit' },
  ],
  playerSpawn: { col: 3, row: 3, facing: 0 },
  exitId: 'exit',
  maxEchoes: 1,
  loopDurationTicks: 60 * 60,
  parTimeSeconds: 27,
  parEchoes: 1,
  hints: [
    { text: 'The glass tubes are Echo Lines: they repeat what they are told, 6 seconds later. The Exit Door needs the Bell Line and the Lamp Plate at once.' },
    { text: 'Whoever rings the Bell Plate has 6 seconds before the door hears it. The lamp is close enough; the door is not.', afterSeconds: 45 },
    { text: 'Echo 1: stand on the Bell Plate for 2 seconds, then walk to the Lamp Plate and stay. You wait at the Exit Door.', afterSeconds: 95 },
  ],
  solution: [
    // Loop 1 (Echo 1): ring the console, through the Gallery Door when the line opens it, ring the Bell Plate for 2 s,
    // then hold the Lamp Plate. Its own bell reaches the Exit Door 6 s after it stepped on.
    [
      { op: 'moveTo', col: 5, row: 2 },
      { op: 'face', dir: 0 },
      { op: 'interact' },
      { op: 'moveTo', col: 12, row: 3 },
      { op: 'moveTo', col: 12, row: 6 },
      { op: 'moveTo', col: 12, row: 8, timeoutTicks: 600 },
      { op: 'moveTo', col: 2, row: 9 },
      { op: 'wait', ticks: 120 },
      { op: 'moveTo', col: 10, row: 9 },
      { op: 'wait', ticks: 30 },
    ],
    // Final run: follow the echo through the Gallery Door, wait at the Exit Door, walk through when it opens.
    [
      { op: 'moveTo', col: 12, row: 3 },
      { op: 'moveTo', col: 12, row: 6 },
      { op: 'moveTo', col: 12, row: 8, timeoutTicks: 900 },
      { op: 'moveTo', col: 20, row: 8 },
      { op: 'moveTo', col: 20, row: 6, timeoutTicks: 1200 },
    ],
  ],
  camera: {
    focus: { col: 12, row: 6 },
    yawStep: 0,
    zoom: 1.2,
    introPath: [
      { col: 3, row: 3 },
      { col: 5, row: 1 },
      { col: 12, row: 7 },
      { col: 2, row: 9 },
      { col: 10, row: 9 },
      { col: 20, row: 7 },
      { col: 20, row: 6 },
    ],
  },
  decor: [
    { type: 'archway', col: 12, row: 7, facing: 2, params: { indicators: 1 } },
    { type: 'archway', col: 20, row: 7, facing: 2, params: { indicators: 2 } },
    { type: 'conduit', col: 2, row: 11, facing: 0, params: { to: 'relay-bell', color: 'teal' } },
    { type: 'conduit', col: 10, row: 11, facing: 0, params: { to: 'door-exit', color: 'teal' } },
    { type: 'conduit', col: 6, row: 1, facing: 3, params: { to: 'relay-gallery', color: 'teal' } },
    { type: 'machinery', col: 0, row: 9, facing: 1, params: { variant: 'clockwork' } },
    { type: 'machinery', col: 16, row: 3, facing: 3, params: { variant: 'gears' } },
    { type: 'lamp', col: 1, row: 1, facing: 2 },
    { type: 'lamp', col: 6, row: 8, facing: 2 },
    { type: 'lamp', col: 16, row: 10, facing: 0 },
    { type: 'hologram', col: 3, row: 4, params: { text: 'LINE A  6 s', color: 'teal' } },
    { type: 'hologram', col: 6, row: 9, params: { text: 'LINE B  6 s', color: 'teal' } },
    { type: 'banner', col: 20, row: 5, facing: 2 },
  ],
  seed: 1212,
  teaches: ['chronoRelay', 'anticipation'],
};

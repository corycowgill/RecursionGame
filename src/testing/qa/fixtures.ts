import type { LevelDefinition } from '../../engine/contracts';

/**
 * QA-only chamber that packs all 12 component kinds into one room so the fuzzer and the benchmark exercise
 * every behaviour (campaign levels 1-3 only use plates, doors, a timed switch and a crate). Not campaign content
 * and never shown to players; its `solution` is a placeholder and is not verified.
 *
 *   r0  ##############
 *   r1  #.......T....#   T timed switch (8,1)
 *   r2  #.P.C.....c.s#   P plate (2,2)  C crate (4,2)  c energy cell (10,2)  s socket (12,2)
 *   r3  #.S..........#   S spawn (2,3)
 *   r4  #L..........R#   L laser emitter (1,4) facing east  R receiver (12,4)
 *   r5  ######D###.###   D door (6,5), open gap (10,5)
 *   r6  #.____......X#   moving platform (2,6)->(5,6) over the void  X exit (12,6)
 *   r7  #........C.G.#   second crate (9,7)  G temporal gate (11,7)
 *   r8  #..._111######   elevator (4,8) between h0 and h1; '1' = raised floor
 *   r9  #....1p1######   p plate on the raised floor (6,9)
 *   r10 ##############
 */
export function componentGauntlet(maxEchoes = 3): LevelDefinition {
  return {
    id: 'qa-component-gauntlet',
    order: 0,
    name: 'QA Component Gauntlet',
    grid: {
      width: 14,
      height: 11,
      tiles: [
        '##############',
        '#............#',
        '#............#',
        '#............#',
        '#............#',
        '######.###.###',
        '#.____.......#',
        '#............#',
        '#..._...######',
        '#.......######',
        '##############',
      ],
      heights: [
        '00000000000000',
        '00000000000000',
        '00000000000000',
        '00000000000000',
        '00000000000000',
        '00000000000000',
        '00000000000000',
        '00000000000000',
        '00000111000000',
        '00000111000000',
        '00000000000000',
      ],
    },
    entities: [
      { id: 'cell-1', kind: 'energyCell', col: 10, row: 2, config: {} },
      { id: 'crate-1', kind: 'crate', col: 4, row: 2, config: {} },
      { id: 'crate-2', kind: 'crate', col: 9, row: 7, config: {} },
      { id: 'deck', kind: 'movingPlatform', col: 2, row: 6, level: 0, config: { path: [{ col: 2, row: 6 }, { col: 5, row: 6 }], speed: 20, pauseTicks: 45, requiresSignal: false } },
      { id: 'door-1', kind: 'door', col: 6, row: 5, logic: 'or', config: {} },
      { id: 'emitter', kind: 'laserEmitter', col: 1, row: 4, facing: 1, config: {} },
      { id: 'exit', kind: 'exitPortal', col: 12, row: 6, config: {} },
      { id: 'gate', kind: 'temporalGate', col: 11, row: 7, config: { allows: 'echoes', requiresSignal: true } },
      { id: 'lift', kind: 'elevator', col: 4, row: 8, level: 0, config: { levels: [0, 1], mode: 'ride', rideDelayTicks: 20, returnDelayTicks: 120 } },
      { id: 'plate-1', kind: 'pressurePlate', col: 2, row: 2, config: { acceptsCrates: true } },
      { id: 'plate-2', kind: 'pressurePlate', col: 6, row: 9, level: 1, config: {} },
      { id: 'receiver', kind: 'laserReceiver', col: 12, row: 4, config: {} },
      { id: 'socket-1', kind: 'energySocket', col: 12, row: 2, config: {} },
      { id: 'switch-1', kind: 'timedSwitch', col: 8, row: 1, config: { durationTicks: 120, retrigger: false } },
    ],
    wires: [
      { from: 'plate-1', to: 'door-1' },
      { from: 'switch-1', to: 'door-1' },
      { from: 'receiver', to: 'gate' },
      { from: 'plate-2', to: 'lift' },
      { from: 'socket-1', to: 'exit' },
    ],
    playerSpawn: { col: 2, row: 3, facing: 1 },
    exitId: 'exit',
    maxEchoes,
    loopDurationTicks: 1800,
    parTimeSeconds: 30,
    hints: [],
    solution: [[{ op: 'wait', ticks: 1 }]],
  };
}

/**
 * Round-6 QA chamber with every expansion mechanic, for the fuzzer: a fixed check valve, a reversible valve driven by a
 * chrono relay, an Echo Plate feeding that relay, an Echo Console, a Gold Console made of Paradox Glass and a Glass
 * Seal. Kept separate from componentGauntlet so the existing fuzz fingerprints stay byte-identical. Not solvable on
 * purpose (placeholder solution); the exit is wired so the devices matter.
 *
 *   r0  ##############
 *   r1  #S..g...E....#   g Glass Seal (4,1)  E Echo Console (8,1)
 *   r2  #............R   R chrono relay on the east wall (13,2), 90 ticks
 *   r3  #..p.....c...#   p Echo Plate (3,3)  c Gold Console of glass (9,3)
 *   r4  ####V####v####   V valve (4,4) south only   v reversible valve (9,4) north only, reversed while the relay is on
 *   r5  #............#
 *   r6  #...C....X...#   C crate (4,6)  X exit (9,6)
 *   r7  ##############
 */
export function expansionGauntlet(maxEchoes = 3): LevelDefinition {
  return {
    id: 'qa-expansion-gauntlet',
    order: 0,
    name: 'QA Expansion Gauntlet',
    grid: {
      width: 14,
      height: 8,
      tiles: ['##############', '#............#', '#............#', '#............#', '####.####.####', '#............#', '#............#', '##############'],
    },
    entities: [
      { id: 'console-echo', kind: 'timedSwitch', col: 8, row: 1, config: { durationTicks: 180, accepts: 'echoes' } },
      { id: 'console-gold', kind: 'timedSwitch', col: 9, row: 3, config: { durationTicks: 120, accepts: 'player', shatterOn: 'echoes' } },
      { id: 'crate', kind: 'crate', col: 4, row: 6, config: {} },
      { id: 'exit', kind: 'exitPortal', col: 9, row: 6, logic: 'or', config: {} },
      { id: 'plate-echo', kind: 'pressurePlate', col: 3, row: 3, config: { accepts: 'echoes' } },
      { id: 'relay', kind: 'chronoRelay', col: 13, row: 2, config: { delayTicks: 90 } },
      { id: 'seal', kind: 'pressurePlate', col: 4, row: 1, config: { accepts: 'player', shatterOn: 'echoes', latch: true } },
      { id: 'valve-fixed', kind: 'checkValve', col: 4, row: 4, facing: 2, config: {} },
      { id: 'valve-rev', kind: 'checkValve', col: 9, row: 4, facing: 0, config: { reverseWhenPowered: true } },
    ],
    wires: [
      { from: 'plate-echo', to: 'relay' },
      { from: 'relay', to: 'valve-rev' },
      { from: 'seal', to: 'exit' },
      { from: 'console-echo', to: 'exit' },
      { from: 'console-gold', to: 'exit' },
    ],
    playerSpawn: { col: 1, row: 1, facing: 1 },
    exitId: 'exit',
    maxEchoes,
    loopDurationTicks: 1800,
    parTimeSeconds: 30,
    hints: [],
    solution: [[{ op: 'wait', ticks: 1 }]],
  };
}

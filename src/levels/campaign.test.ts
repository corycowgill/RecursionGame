import { describe, expect, it } from 'vitest';
import { ENTITY_KINDS, type InputScript, type LevelDefinition, type SimEvent } from '../engine/contracts';
import { completionFromEvents, evaluateCompletion } from '../gameplay/puzzles/completion';
import { getObjectiveStatus } from '../gameplay/puzzles/objectives';
import { createGame, firstHashMismatch, playScript, replayLoops, runScripts, runSolution } from '../testing/harness/harness';
import { S, inputs } from '../testing/harness/script';
import { CAMPAIGN, LEVELS, VERTICAL_SLICE_LEVEL, emptyProgress, recordCompletion, validateLevel } from './index';
import { level01FirstEcho } from './definitions/L01-first-echo';
import { level02TwoPlaces } from './definitions/L02-two-places';
import { level03TheRelay } from './definitions/L03-the-relay';
import { level04TheLift } from './definitions/L04-the-lift';
import { level05PerfectTiming } from './definitions/L05-perfect-timing';
import { level06ChainReaction } from './definitions/L06-chain-reaction';
import { level07BrokenSequence } from './definitions/L07-broken-sequence';
import { level08RecursiveMachine } from './definitions/L08-recursive-machine';
import { level09ParadoxChamber } from './definitions/L09-paradox-chamber';
import { level10TheCore } from './definitions/L10-the-core';

const finalScript = (l: LevelDefinition): InputScript => l.solution[l.solution.length - 1]!;

/**
 * Levels whose winning pass contains INTENDED divergences (divergence used as a mechanic): the echo that diverges
 * and the (expected kind -> actual kind) of each one. Every other level must replay with zero divergences.
 */
const INTENDED_DIVERGENCES: Record<string, { actorId: string; expected: string; actual: string; entityId: string }[]> = {
  'L07-broken-sequence': [{ actorId: 'echo:1', expected: 'none', actual: 'use', entityId: 'switch-archive' }],
  'L10-the-core': [{ actorId: 'echo:1', expected: 'fail', actual: 'insert', entityId: 'socket-reliquary' }],
};

const has = (ev: readonly SimEvent[], type: string, id?: string): boolean =>
  ev.some((e) => e.type === type && (id === undefined || ('entityId' in e && e.entityId === id)));

describe('campaign list', () => {
  it('exports the levels in order with unique ids', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([
      'L01-first-echo',
      'L02-two-places',
      'L03-the-relay',
      'L04-the-lift',
      'L05-perfect-timing',
      'L06-chain-reaction',
      'L07-broken-sequence',
      'L08-recursive-machine',
      'L09-paradox-chamber',
      'L10-the-core',
    ]);
    expect(LEVELS.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(VERTICAL_SLICE_LEVEL.id).toBe('L03-the-relay');
  });

  it('the campaign uses all 12 component kinds, and the finale uses every one of them', () => {
    const used = new Set(LEVELS.flatMap((l) => l.entities.map((e) => e.kind)));
    expect([...used].sort()).toEqual([...ENTITY_KINDS].sort());
    const core = LEVELS[LEVELS.length - 1]!;
    expect(new Set(core.entities.map((e) => e.kind)).size).toBe(ENTITY_KINDS.length);
  });

  it('every level has a story, 3+ progressive hints, a par within the echo limit and teaching tags', () => {
    for (const l of LEVELS) {
      expect(l.story?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(l.hints.length).toBeGreaterThanOrEqual(3);
      const delays = l.hints.map((h) => h.afterSeconds ?? 0);
      expect([...delays].sort((a, b) => a - b)).toEqual(delays); // hints unlock progressively
      expect(l.parEchoes).toBeDefined();
      expect(l.parEchoes!).toBeLessThanOrEqual(l.maxEchoes);
      expect(l.teaches?.length ?? 0).toBeGreaterThan(0);
    }
  });

  for (const level of LEVELS) {
    it(`${level.id}: validates with no errors and no warnings`, () => {
      expect(validateLevel(level)).toEqual([]);
    });
  }
});

describe.each(LEVELS.map((l) => [l.id, l] as const))('%s', (_id, level) => {
  it('known solution completes within the echo limit', () => {
    const res = runSolution(level);
    expect(res.completed).toBe(true);
    expect(res.passes.every((p) => !p.timedOut)).toBe(true);
    expect(level.solution.length - 1).toBeLessThanOrEqual(level.maxEchoes);
    // No echo diverged from its own recording in the winning pass, except where divergence IS the mechanic.
    const final = res.passes[res.passes.length - 1]!;
    const divs = final.events.flatMap((e) =>
      e.type === 'divergence' ? [{ actorId: e.actorId, expected: e.expected.kind, actual: e.actual.kind, entityId: e.actual.entityId }] : [],
    );
    expect(divs).toEqual(INTENDED_DIVERGENCES[level.id] ?? []);
  });

  it('solution is deterministic: identical per-tick hashes across runs and in pure re-simulation', () => {
    const a = runSolution(level);
    const b = runSolution(level);
    expect(a.completedAtTick).toBe(b.completedAtTick);
    a.passes.forEach((p, i) => expect(firstHashMismatch(p.hashes, b.passes[i]!.hashes)).toBe(-1));
    const echoes = a.loops.slice(0, -1);
    const replay = replayLoops(level, echoes, a.loops[a.loops.length - 1]!.inputs);
    expect(replay.completed).toBe(true);
    expect(firstHashMismatch(a.passes[a.passes.length - 1]!.hashes, replay.hashes)).toBe(-1);
  });

  it('is NOT solvable with zero echoes (the final run alone fails)', () => {
    const solo = runScripts(level, [finalScript(level)]);
    expect(solo.completed).toBe(false);
    // Neither does any single loop of the solution played alone.
    for (const script of level.solution) expect(runScripts(level, [[...script, ...finalScript(level)]]).completed).toBe(false);
  });

  it('meets its par rating with the known solution and reports objectives', () => {
    const res = runSolution(level);
    const result = completionFromEvents(level, res.passes[res.passes.length - 1]!.events);
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(3);
    const status = getObjectiveStatus(level, res.game.getState());
    expect(status.complete).toBe(true);
    expect(status.exitActive).toBe(true);
  });
});

describe('L01 First Echo', () => {
  it('stepping on the plate and running for the door fails (it seals behind)', () => {
    const res = runScripts(level01FirstEcho, [
      [...level01FirstEcho.solution[0]!.slice(0, 4), S.moveTo(12, 8), S.moveTo(7, 8), S.moveTo(7, 2, 400)],
    ]);
    expect(res.completed).toBe(false);
  });
});

describe('L02 Two Places at Once', () => {
  const [holdA, toB, final] = level02TwoPlaces.solution as [InputScript, InputScript, InputScript];

  it('one echo is not enough: holding plate A and walking to plate B leaves door B shut', () => {
    const res = runScripts(level02TwoPlaces, [holdA, [...toB.slice(0, -1), S.moveTo(12, 5), S.moveTo(8, 4), S.moveTo(8, 2, 400)]]);
    expect(res.completed).toBe(false);
  });

  it('one echo is not enough: an echo sent toward plate B alone cannot pass door A', () => {
    const res = runScripts(level02TwoPlaces, [toB, final]);
    expect(res.completed).toBe(false);
  });

  it('the doorstop route is closed: you hold door A with your body while your one echo walks on to plate B', () => {
    // Found by the round-5 solver (src/testing/solver): before door B also needed plate A, this completed with 1 echo.
    // Echo (open loop): hold plate A for 2 s, then walk the route to plate B through door A.
    const echo = inputs().move(-1, 0, 175).move(0, -1, 25).wait(120).move(0, -1, 25).move(1, 0, 175).move(0, -1, 50).move(1, 0, 100).move(0, -1, 25).move(1, 0, 75).build();
    const game = createGame(level02TwoPlaces);
    game.setLoops([{ id: 1, durationTicks: echo.length, inputs: echo, outcomes: [] }]);
    const res = playScript(game, [S.moveTo(8, 8), S.moveTo(8, 7), S.wait(360), S.moveTo(8, 4, 900), S.moveTo(8, 2, 600)]);
    expect(res.completed).toBe(false);
    // the echo did get through the door the player was holding and reached plate B: only door B's wiring stops it
    expect(game.getState().signals['plate-b']).toBe(true);
  });
});

describe('L03 The Relay (vertical slice)', () => {
  const [relay, press, final] = level03TheRelay.solution as [InputScript, InputScript, InputScript];

  it('uses all four slice ingredients: crate carried onto a plate, a second plate, the timed door, the exit', () => {
    const res = runSolution(level03TheRelay);
    const ev = res.passes[2]!.events;
    const has = (type: string, id?: string) => ev.some((e) => e.type === type && (id === undefined || ('entityId' in e && e.entityId === id)));
    expect(has('pickup', 'crate-a')).toBe(true);
    expect(has('drop', 'crate-a')).toBe(true);
    expect(has('plateDown', 'plate-crate')).toBe(true);
    expect(has('plateDown', 'plate-watch')).toBe(true);
    expect(has('switchOn', 'switch-far')).toBe(true);
    expect(has('doorOpen', 'door-chrono')).toBe(true);
    expect(has('levelComplete')).toBe(true);
    expect(level03TheRelay.solution.length).toBe(3); // three cooperating loops
  });

  it('two loops are not enough: crate + plate echo, then the player presses the switch and runs for the door', () => {
    const res = runScripts(level03TheRelay, [relay, [...press.slice(0, -3), S.face(0), S.interact(), S.moveTo(18, 12), S.moveTo(11, 12), S.moveTo(11, 10), S.moveTo(7, 4), S.moveTo(7, 2, 300)]]);
    expect(res.completed).toBe(false);
  });

  it('two loops are not enough: one echo does crate, switch and plate in sequence', () => {
    const allInOne: InputScript = [
      ...relay.slice(0, 7), // crate onto the crate plate
      S.moveTo(3, 10),
      S.moveTo(11, 10),
      S.moveTo(11, 12),
      S.moveTo(18, 12),
      S.moveTo(18, 6),
      S.face(0),
      S.interact(),
      S.moveTo(18, 12),
      S.moveTo(11, 12),
      S.moveTo(11, 10),
      S.moveTo(11, 5),
      S.wait(30),
    ];
    const res = runScripts(level03TheRelay, [allInOne, [S.moveTo(7, 4), S.moveTo(7, 2, 1500)]]);
    expect(res.completed).toBe(false);
  });

  it('without the crate, two echoes cannot cover both plates and the switch', () => {
    const bodyOnCratePlate: InputScript = [S.moveTo(3, 9), S.moveTo(3, 5), S.wait(30)];
    const bodyOnWatchPlate: InputScript = [S.moveTo(11, 9), S.moveTo(11, 5), S.wait(30)];
    const res = runScripts(level03TheRelay, [bodyOnCratePlate, bodyOnWatchPlate, final]);
    expect(res.completed).toBe(false);
  });

  it('the Chrono Door is a timed door: it closes again once the window has passed', () => {
    const res = runScripts(level03TheRelay, [relay, press, [S.moveTo(7, 5), S.waitUntil(900)]]);
    expect(res.completed).toBe(false);
    const ev = res.passes[2]!.events.filter((e) => 'entityId' in e && e.entityId === 'door-chrono');
    const open = ev.find((e) => e.type === 'doorOpen');
    const close = ev.find((e) => e.type === 'doorClose');
    expect(open).toBeDefined();
    expect(close).toBeDefined();
    expect(close!.tick - open!.tick).toBe(240);
  });
});

describe('L04 The Lift', () => {
  const [caller, rider] = level04TheLift.solution as [InputScript, InputScript, InputScript];
  const toSanctum: InputScript = [S.moveTo(2, 3, 400), S.moveTo(9, 3, 600), S.moveTo(9, 1, 300)];

  it('one echo is not enough: the caller lifts you, but nobody holds the Gallery Plate', () => {
    const res = runScripts(level04TheLift, [caller, [S.moveTo(2, 7), S.moveTo(2, 5), S.waitUntil(360), ...toSanctum]]);
    expect(has(res.passes[1]!.events, 'elevatorArrive', 'lift')).toBe(true);
    expect(res.completed).toBe(false);
  });

  it('one echo is not enough: an echo rides up to the plate, but whoever calls the lift is left below', () => {
    const res = runScripts(level04TheLift, [rider, [S.moveTo(15, 10), S.moveTo(15, 11), S.wait(200), S.moveTo(2, 7), S.moveTo(2, 5, 300), ...toSanctum]]);
    expect(has(res.passes[1]!.events, 'doorOpen', 'door-sanctum')).toBe(true);
    expect(res.completed).toBe(false);
  });

  it('the lift sinks again when the call is released', () => {
    const res = runScripts(level04TheLift, [[S.moveTo(2, 7), S.moveTo(2, 5), S.wait(400)], [S.moveTo(15, 11), S.wait(130), S.moveTo(15, 9), S.wait(200)]]);
    const ev = res.passes[1]!.events.filter((e) => e.type === 'elevatorArrive');
    expect(ev.map((e) => e.type === 'elevatorArrive' && e.y)).toEqual([2000, 0]);
  });
});

describe('L05 Perfect Timing', () => {
  const [driver, gate] = level05PerfectTiming.solution as [InputScript, InputScript, InputScript];

  it('one echo is not enough: pressing the Drive Switch yourself, the ferry leaves without you', () => {
    const res = runScripts(level05PerfectTiming, [
      gate,
      [S.moveTo(6, 4), S.face(0), S.waitUntil(300), S.interact(), S.moveTo(11, 7), S.moveTo(12, 7, 200), S.moveTo(18, 7, 400), S.moveTo(18, 1, 300)],
    ]);
    expect(res.completed).toBe(false);
  });

  it('one echo is not enough: riding the ferry with nobody at the Gate Switch, the island door stays shut', () => {
    const final = finalScript(level05PerfectTiming).map((st) => (st.op === 'moveTo' && st.row === 1 ? S.moveTo(18, 1, 400) : st));
    const res = runScripts(level05PerfectTiming, [driver, final]);
    expect(has(res.passes[1]!.events, 'platformArrive', 'ferry')).toBe(true);
    expect(has(res.passes[1]!.events, 'doorOpen', 'door-island')).toBe(false);
    expect(res.completed).toBe(false);
  });

  it('the ferry freezes mid-abyss when the Drive Switch runs out, and the switch cannot be mashed back on', () => {
    const mash: InputScript = [S.moveTo(6, 4), S.face(0)];
    for (let i = 0; i < 400; i++) mash.push(S.interact());
    const res = runScripts(level05PerfectTiming, [mash]);
    const ev = res.passes[0]!.events;
    expect(ev.filter((e) => e.type === 'switchOn').length).toBe(1);
    expect(ev.some((e) => e.type === 'interactFailed' && e.reason === 'cooldown')).toBe(true);
    expect(ev.some((e) => e.type === 'interactFailed' && e.reason === 'busy')).toBe(true);
  });

  it('KNOWN, flagged for the product owner (round-5 solver): ONE echo can press the Drive Switch and then the Gate Switch', () => {
    // The island door has no deadline: you can wait in front of it, so a single echo has time to walk from the Drive
    // Switch to the Gate Switch (~3.8 s) after sending you across. No minimal layout tweak closes this (see
    // docs/game-design/difficulty-report.md). This test pins the current behaviour; flip it when L05 is redesigned.
    const echo: InputScript = [S.moveTo(6, 4), S.face(0), S.waitUntil(300), S.interact(), S.moveTo(2, 11), S.face(3), S.interact(), S.wait(30)];
    const ride: InputScript = [S.moveTo(11, 7), S.moveTo(12, 7), S.moveTo(18, 7), S.moveTo(18, 3), S.moveTo(18, 1, 900)];
    expect(runScripts(level05PerfectTiming, [echo, ride]).completed).toBe(true);
  });
});

describe('L06 Chain Reaction', () => {
  const [hall, relay, vault] = level06ChainReaction.solution as [InputScript, InputScript, InputScript, InputScript];
  const singlePress = relay.filter((st, i) => !(i > 5 && (st.op === 'interact' || st.op === 'waitUntil')));

  it('the relay presser cannot reach the Core Door before the light dies (so a 4th body is required)', () => {
    const res = runScripts(level06ChainReaction, [
      hall,
      singlePress,
      vault,
      [S.moveTo(10, 10), S.moveTo(10, 8, 600), S.moveTo(4, 5), S.face(0), S.waitUntil(690), S.interact(), S.moveTo(10, 3), S.moveTo(10, 1, 300)],
    ]);
    expect(has(res.passes[3]!.events, 'plateDown', 'plate-vault')).toBe(true);
    expect(res.completed).toBe(false);
  });

  it('bodies stop light: standing in Laser A breaks the whole chain', () => {
    const res = runScripts(level06ChainReaction, [hall, relay, vault, [S.moveTo(10, 10), S.moveTo(10, 8, 600), S.moveTo(1, 6), S.wait(300)]]);
    const ev = res.passes[3]!.events;
    const on = ev.find((e) => e.type === 'switchOn' && e.tick >= 690)!;
    expect(on).toBeDefined();
    expect(ev.some((e) => e.type === 'receiverLit' && e.entityId === 'receiver-b' && e.tick > on.tick)).toBe(false);
  });

  it('the chain fires in order with one tick per hop', () => {
    const ev = runSolution(level06ChainReaction).passes[3]!.events;
    const t = (type: string, id: string) => ev.find((e) => e.type === type && 'entityId' in e && e.entityId === id)!.tick;
    const s0 = t('switchOn', 'switch-relay');
    expect(t('laserOn', 'laser-a')).toBe(s0 + 1);
    expect(t('laserOn', 'laser-b')).toBe(s0 + 2);
    expect(t('doorOpen', 'door-vault')).toBe(s0 + 3);
  });

  it('the doorstop route is closed: an echo holding the Lab doorway lets the Hall Plate echo walk in, but the Core Door also wants the Hall Plate', () => {
    // Found by the round-5 solver: before plate-hall -> door-core, this completed with only 2 echoes.
    const final = level06ChainReaction.solution[3]!;
    const hallThenVault: InputScript = [S.moveTo(20, 11), S.moveTo(20, 12), S.waitUntil(300), S.move(0, -1, 25), S.move(-1, 0, 250), S.move(0, -1, 75), S.move(0, -1, 75), S.move(1, 0, 400), S.move(0, -1, 100), S.wait(30)];
    const doorstopThenRelay: InputScript = [S.moveTo(10, 10), S.moveTo(10, 9), S.waitUntil(680), S.moveTo(10, 8), S.moveTo(4, 5), S.face(0), S.waitUntil(860), S.interact(), S.waitUntil(1060), S.interact(), S.wait(30)];
    const res = runScripts(level06ChainReaction, [hallThenVault, doorstopThenRelay, final]);
    expect(res.completed).toBe(false);
    expect(res.game.getState().signals['plate-vault']).toBe(true); // the walk-in itself still works
  });
});

describe('L07 Broken Sequence', () => {
  const [presser, reader] = level07BrokenSequence.solution as [InputScript, InputScript, InputScript];

  it('recorded alone, Echo 1 presses at a shut door: every press resolves to nothing', () => {
    const res = runScripts(level07BrokenSequence, [presser]);
    const loopOutcomes = res.passes[0]!.events.filter((e) => e.type === 'switchOn');
    expect(loopOutcomes).toEqual([]);
    const game = res.game;
    game.commitLoopAndRewind();
    const planned = game.getLoops()[0]!.outcomes;
    expect(planned.length).toBe(12);
    expect(planned.every((o) => o.kind === 'none')).toBe(true);
  });

  it('once Echo 2 opens the Archive Door, the same inputs carry Echo 1 to the switch (divergence none -> use)', () => {
    const res = runSolution(level07BrokenSequence);
    const ev = res.passes[2]!.events;
    const div = ev.find((e) => e.type === 'divergence');
    expect(div && div.type === 'divergence' && div.actorId).toBe('echo:1');
    expect(ev.find((e) => e.type === 'switchOn' && e.actorId === 'echo:1')).toBeDefined();
    const tl = res.game.getTimeline();
    expect(tl.tracks[0]!.divergences.length).toBe(1);
  });

  it('the honest route fails: two plate-holders and the player pressing the switch cannot make the exit', () => {
    const holdHall: InputScript = [S.moveTo(20, 11), S.moveTo(20, 12), S.wait(30)];
    const res = runScripts(level07BrokenSequence, [
      holdHall,
      reader,
      [S.moveTo(14, 7), S.moveTo(14, 4), S.moveTo(14, 2, 700), S.face(0), S.interact(), S.moveTo(14, 7), S.moveTo(2, 12), S.moveTo(2, 14, 300)],
    ]);
    expect(has(res.passes[2]!.events, 'switchOn', 'switch-archive')).toBe(true);
    expect(res.completed).toBe(false);
  });
});

describe('L08 Recursive Machine (nested loop)', () => {
  it('one recording yields two bodies: the echo takes the Shaft Plate, its recursive copy the Threshold Plate', () => {
    const res = runSolution(level08RecursiveMachine);
    const st = res.game.getState();
    expect(st.actors.map((a) => a.id)).toEqual(['echo:1', 'echo:1.1', 'player']);
    const [echo, copy] = st.actors;
    expect([Math.floor(echo!.x / 1000), Math.floor(echo!.z / 1000)]).toEqual([9, 1]);
    expect([Math.floor(copy!.x / 1000), Math.floor(copy!.z / 1000)]).toEqual([9, 5]);
    const done = res.passes[1]!.events.find((e) => e.type === 'levelComplete');
    expect(done && done.type === 'levelComplete' && done.echoesUsed).toBe(1);
  });

  it('without the Recursion Engine the same recording fails (two bodies for three jobs)', () => {
    const { recursion: _r, ...plain } = level08RecursiveMachine;
    const res = runScripts(plain, level08RecursiveMachine.solution);
    expect(res.completed).toBe(false);
  });

  it('leaving the Feed Plate before the copy arrives shuts the door on the echo too', () => {
    const [loop] = level08RecursiveMachine.solution as [InputScript, InputScript];
    const hasty = loop.map((st) => (st.op === 'wait' && st.ticks === 330 ? S.wait(200) : st));
    const res = runScripts(level08RecursiveMachine, [hasty, finalScript(level08RecursiveMachine).map((st) => (st.op === 'moveTo' && st.row === 2 ? S.moveTo(2, 2, 600) : st))]);
    expect(has(res.passes[1]!.events, 'plateDown', 'plate-shaft')).toBe(false);
    expect(res.completed).toBe(false);
  });
});

describe('L09 The Paradox Chamber', () => {
  const holdForever: InputScript = [S.moveTo(20, 11), S.moveTo(20, 12), S.wait(30)];
  const reader = level09ParadoxChamber.solution[1]!;
  const final = finalScript(level09ParadoxChamber);
  const rerecorded: InputScript = [
    S.moveTo(20, 11),
    S.moveTo(20, 12),
    S.waitUntil(360),
    S.moveTo(16, 7),
    S.moveTo(16, 6),
    S.moveTo(16, 2, 600),
    S.moveTo(20, 2),
    S.moveTo(20, 1),
    S.wait(30),
  ];

  it('the obvious attempt is a paradox: Echo 1 on the Hall Plate keeps the vault sealed for ever', () => {
    const res = runScripts(level09ParadoxChamber, [holdForever, reader, [S.moveTo(16, 7), S.moveTo(16, 3, 600), S.moveTo(20, 1, 300), S.moveTo(10, 2, 300)]]);
    for (const p of res.passes) expect(has(p.events, 'doorOpen', 'door-vault')).toBe(false);
    expect(res.completed).toBe(false);
  });

  it('delete Echo 1 and re-record it as the youngest loop: it reacts to Echo 2 and the chamber opens', () => {
    const game = createGame(level09ParadoxChamber);
    playScript(game, holdForever);
    expect(game.commitLoopAndRewind()).toBe(true);
    const yPass = playScript(game, reader);
    expect(game.commitLoopAndRewind()).toBe(true);
    expect(has(yPass.events, 'plateDown', 'plate-reading')).toBe(true);
    expect(game.echoesRemaining).toBe(0);
    game.deleteLoop(0); // rewrite the past
    expect(game.getLoops().length).toBe(1);
    const xPass = playScript(game, rerecorded);
    expect(has(xPass.events, 'doorOpen', 'door-vault')).toBe(true);
    expect(has(xPass.events, 'plateDown', 'plate-vault')).toBe(true);
    expect(game.commitLoopAndRewind()).toBe(true);
    const win = playScript(game, final);
    expect(win.completed).toBe(true);
    expect(win.events.filter((e) => e.type === 'divergence')).toEqual([]);
    // The surviving Echo 2 replays exactly as recorded.
    expect(game.getLoops().map((l) => l.id)).toEqual([2, 3]);
  });

  it('one echo plus you is not enough: the Vault Plate and the Reading Plate both need a body', () => {
    const res = runScripts(level09ParadoxChamber, [reader, [S.moveTo(20, 12), S.wait(30), S.moveTo(16, 7), S.moveTo(16, 2, 600), S.moveTo(20, 1, 300), S.moveTo(10, 2, 300)]]);
    expect(res.completed).toBe(false);
  });
});

describe('L10 The Core (finale)', () => {
  const [courier, ferryman] = level10TheCore.solution as [InputScript, InputScript, InputScript, InputScript];

  it('the live player cannot cross the echo-only Reliquary Gate', () => {
    const res = runScripts(level10TheCore, [[S.moveTo(21, 7), S.move(0, -1, 120)]]);
    const p = res.game.getState().actors[0]!;
    expect(Math.floor(p.z / 1000)).toBe(7);
  });

  it('the Courier wakes the Core: lift and ferry start together the moment the cell goes in', () => {
    const ev = runSolution(level10TheCore).passes[3]!.events;
    const ins = ev.find((e) => e.type === 'cellInserted')!;
    expect(ins.type === 'cellInserted' && ins.actorId).toBe('echo:1');
    const lift = ev.find((e) => e.type === 'elevatorStart')!;
    const ferry = ev.find((e) => e.type === 'platformDepart')!;
    expect(lift.tick - ins.tick).toBeLessThanOrEqual(3);
    expect(ferry.tick).toBeGreaterThan(lift.tick);
    expect(has(ev, 'drop', 'crate-relic') && has(ev, 'plateDown', 'plate-crown')).toBe(true);
  });

  it('two echoes are not enough: with Courier and Ferryman, the East Timer has nobody to press it', () => {
    const final = finalScript(level10TheCore).map((st) => (st.op === 'moveTo' && st.row === 1 ? S.moveTo(10, 1, 600) : st));
    const res = runScripts(level10TheCore, [courier, ferryman, final]);
    expect(res.completed).toBe(false);
  });

  it('the Reliquary seals behind the Courier: its blind recording can no longer walk back out to the East Timer', () => {
    // Found by the round-5 solver: before the socket -> gate (inverted) wire, this completed with only 2 echoes.
    const [, , , final] = level10TheCore.solution as [InputScript, InputScript, InputScript, InputScript];
    const courierAndTimer: InputScript = [...courier.slice(0, -1), S.move(0, 1, 50), S.move(0, 1, 181), S.move(1, 0, 75), S.face(2), S.waitUntil(1020), S.interact(), S.wait(30)];
    const res = runScripts(level10TheCore, [courierAndTimer, ferryman, final]);
    expect(res.completed).toBe(false);
    const ev = res.passes[2]!.events;
    expect(has(ev, 'cellInserted', 'socket-reliquary')).toBe(true);
    expect(has(ev, 'gateClose', 'gate-reliquary')).toBe(true);
    expect(has(ev, 'switchOn', 'timer-east')).toBe(false);
  });

  it('two echoes are not enough: pressing the East Timer yourself, the Core Lift has long since risen', () => {
    const res = runScripts(level10TheCore, [
      courier,
      ferryman,
      [S.moveTo(24, 14), S.face(2), S.waitUntil(1020), S.interact(), S.moveTo(10, 7), S.moveTo(10, 6, 300), S.moveTo(10, 1, 300)],
    ]);
    expect(res.completed).toBe(false);
  });
});

describe('progression', () => {
  it('unlocks levels in order and keeps best records immutably', () => {
    const p0 = emptyProgress();
    expect(CAMPAIGN.isUnlocked(p0, 'L01-first-echo')).toBe(true);
    expect(CAMPAIGN.isUnlocked(p0, 'L02-two-places')).toBe(false);
    expect(CAMPAIGN.continueLevel(p0)?.id).toBe('L01-first-echo');

    const r1 = evaluateCompletion(level01FirstEcho, 2000, 2);
    expect(r1.stars).toBe(1);
    const p1 = recordCompletion(p0, r1);
    expect(p0.records).toEqual({});
    expect(CAMPAIGN.isUnlocked(p1, 'L02-two-places')).toBe(true);
    expect(CAMPAIGN.isUnlocked(p1, 'L03-the-relay')).toBe(false);
    expect(CAMPAIGN.next('L01-first-echo')?.id).toBe('L02-two-places');
    expect(CAMPAIGN.next('L03-the-relay')?.id).toBe('L04-the-lift');
    expect(CAMPAIGN.next('L10-the-core')).toBeNull();
    expect(CAMPAIGN.continueLevel(p1)?.id).toBe('L02-two-places');

    const p2 = recordCompletion(p1, evaluateCompletion(level01FirstEcho, 300, 1));
    expect(p2.records['L01-first-echo']).toEqual({ completions: 2, bestTicks: 300, bestEchoes: 1, bestStars: 3 });
    expect(CAMPAIGN.totalStars(p2)).toBe(3);
    expect(JSON.parse(JSON.stringify(p2))).toEqual(p2);
  });
});

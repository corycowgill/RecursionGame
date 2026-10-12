import { describe, expect, it } from 'vitest';
import type { InputScript, LevelDefinition, SimEvent } from '../engine/contracts';
import { completionFromEvents } from '../gameplay/puzzles/completion';
import { getObjectiveStatus } from '../gameplay/puzzles/objectives';
import { firstHashMismatch, replayLoops, runScripts, runSolution } from '../testing/harness/harness';
import { ROUND6_B_ANALYSIS } from '../testing/solver/levelConfigs-round6-b';
import { verifySolution, type VerifiedSolution } from '../testing/solver/verify';
import { level14GoldAndCyan } from './definitions/L14-gold-and-cyan';
import { level15GlassGallery } from './definitions/L15-glass-gallery';
import { level17Upstream } from './definitions/L17-upstream';
import { level18HourOfGlass } from './definitions/L18-hour-of-glass';
import { ROUND6_B_LEVELS } from './definitions/round6-b-levels';
import { validateLevel } from './validators/validateLevel';

/**
 * ROUND-6 CHAMBERS, LEVEL DESIGNER B (L14 Gold and Cyan, L15 Glass Gallery, L17 Upstream, L18 Hour of Glass).
 * The same battery campaign.test.ts runs for L01-L10 (validation, solution, intended divergences only, determinism,
 * the final run alone fails, every loop solo fails, par / objectives), plus each chamber's lesson and minimum-echo
 * tests. These levels are not in CAMPAIGN_LEVELS yet (the director adds them); this file keeps them verified until then.
 */

const finalScript = (l: LevelDefinition): InputScript => l.solution[l.solution.length - 1]!;

/** Intended divergences of the winning pass (the attuned Echo Console lesson). Every other divergence is a bug. */
export const ROUND6_B_INTENDED_DIVERGENCES: Record<string, { actorId: string; expected: string; actual: string; entityId: string }[]> = {
  'L14-gold-and-cyan': [{ actorId: 'echo:1', expected: 'fail', actual: 'use', entityId: 'console-echo' }],
  'L18-hour-of-glass': [{ actorId: 'echo:1', expected: 'fail', actual: 'use', entityId: 'console-echo' }],
};

const divergencesOf = (ev: readonly SimEvent[]) =>
  ev.flatMap((e) => (e.type === 'divergence' ? [{ actorId: e.actorId, expected: e.expected.kind, actual: e.actual.kind, entityId: e.actual.entityId }] : []));
const shatters = (ev: readonly SimEvent[]) => ev.filter((e) => e.type === 'entity' && e.name === 'shatter');
const lastPass = (scripts: InputScript[], level: LevelDefinition) => {
  const r = runScripts(level, scripts);
  return { r, ev: r.passes[r.passes.length - 1]!.events };
};

/** The authored solution as a solver solution, verified (for the solver teaching checks). */
function verifiedAuthored(level: LevelDefinition): VerifiedSolution {
  const res = runSolution(level, { recordHashes: false });
  const loops = res.loops;
  const echoes = loops.slice(0, -1).map((l, i) => ({ steps: [], loop: { ...l, id: i + 1 } }));
  const final = loops[loops.length - 1]!;
  return verifySolution(level, { levelId: level.id, echoes, final: { steps: [], inputs: final.inputs }, completedAtTick: res.completedAtTick ?? 0 });
}

describe('round-6 B chambers: list', () => {
  it('exports the four chambers with their planned campaign order', () => {
    expect(ROUND6_B_LEVELS.map((l) => [l.id, l.order])).toEqual([
      ['L14-gold-and-cyan', 11],
      ['L15-glass-gallery', 13],
      ['L17-upstream', 16],
      ['L18-hour-of-glass', 17],
    ]);
  });

  it('every chamber has a 3-line story with a rising LOG number, 3+ progressive hints, a par within the limit, teaching tags', () => {
    const logs: number[] = [];
    for (const l of ROUND6_B_LEVELS) {
      expect(l.story?.length).toBe(3);
      const m = /^LOG (\d{3}) · .+ — H\.A\.$/.exec(l.story![2]!);
      expect(m, l.story![2]).not.toBeNull();
      logs.push(Number(m![1]));
      expect(l.hints.length).toBeGreaterThanOrEqual(3);
      const delays = l.hints.map((h) => h.afterSeconds ?? 0);
      expect([...delays].sort((a, b) => a - b)).toEqual(delays);
      expect(l.parEchoes).toBe(l.solution.length - 1);
      expect(l.parEchoes!).toBeLessThanOrEqual(l.maxEchoes);
      expect(l.teaches?.length ?? 0).toBeGreaterThan(0);
    }
    expect(logs).toEqual([63, 80, 95, 98]);
  });
});

describe.each(ROUND6_B_LEVELS.map((l) => [l.id, l] as const))('%s', (id, level) => {
  it('validates with no errors and no warnings', () => {
    expect(validateLevel(level)).toEqual([]);
  });

  it('known solution completes within the echo limit, with only the intended divergences', () => {
    const res = runSolution(level);
    expect(res.completed).toBe(true);
    expect(res.passes.every((p) => !p.timedOut)).toBe(true);
    expect(level.solution.length - 1).toBe(level.parEchoes);
    expect(level.solution.length - 1).toBeLessThanOrEqual(level.maxEchoes);
    const final = res.passes[res.passes.length - 1]!;
    expect(divergencesOf(final.events)).toEqual(ROUND6_B_INTENDED_DIVERGENCES[id] ?? []);
  });

  it('solution is deterministic: identical per-tick hashes across runs and in pure re-simulation', () => {
    const a = runSolution(level);
    const b = runSolution(level);
    expect(a.completedAtTick).toBe(b.completedAtTick);
    a.passes.forEach((p, i) => expect(firstHashMismatch(p.hashes, b.passes[i]!.hashes)).toBe(-1));
    const replay = replayLoops(level, a.loops.slice(0, -1), a.loops[a.loops.length - 1]!.inputs);
    expect(replay.completed).toBe(true);
    expect(firstHashMismatch(a.passes[a.passes.length - 1]!.hashes, replay.hashes)).toBe(-1);
  });

  it('is NOT solvable by the final run alone, nor by any single loop played alone', () => {
    expect(runScripts(level, [finalScript(level)]).completed).toBe(false);
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

  it("the authored solution passes the solver's teaching check", () => {
    const cfg = ROUND6_B_ANALYSIS[id]!;
    const v = verifiedAuthored(level);
    expect(v.ok).toBe(true);
    expect(cfg.teaching?.(v, level) ?? null).toBeNull();
  });
});

describe('L14 Gold and Cyan (attuned keys)', () => {
  const L = level14GoldAndCyan;
  const [echo, final] = L.solution as [InputScript, InputScript];

  it('pressing the Echo Console live fails with reason attuned and changes nothing', () => {
    const { ev } = lastPass([echo], L);
    const fail = ev.find((e) => e.type === 'interactFailed');
    expect(fail && fail.type === 'interactFailed' && fail.reason).toBe('attuned');
    expect(ev.some((e) => e.type === 'switchOn')).toBe(false);
  });

  it('the winning pass has exactly one attuned divergence (recorded fail, replayed use)', () => {
    const res = runSolution(L);
    const divs = res.passes[res.passes.length - 1]!.events.filter((e) => e.type === 'divergence');
    expect(divs).toHaveLength(1);
    expect(divs[0]!.type === 'divergence' && divs[0]!.expected.reason).toBe('attuned');
  });

  it('the Gold Seal ignores an echo: if you do not hold it, the echo is shut out of the Archive', () => {
    const elsewhere: InputScript = [{ op: 'moveTo', col: 8, row: 8 }, { op: 'moveTo', col: 8, row: 11, timeoutTicks: 900 }];
    const { r, ev } = lastPass([echo, elsewhere], L);
    expect(r.completed).toBe(false);
    expect(ev.some((e) => e.type === 'switchOn')).toBe(false);
  });

  it('staying on the seal too long misses the 5 s window', () => {
    const late: InputScript = [{ op: 'moveTo', col: 5, row: 5 }, { op: 'waitUntil', tick: 520 }, { op: 'moveTo', col: 8, row: 8 }, { op: 'moveTo', col: 8, row: 11, timeoutTicks: 600 }];
    expect(runScripts(L, [echo, late]).completed).toBe(false);
    expect(runScripts(L, [echo, final]).completed).toBe(true);
  });
});

describe('L15 Glass Gallery (paradox glass)', () => {
  const L = level15GlassGallery;
  const [west, east, final] = L.solution as [InputScript, InputScript, InputScript];
  // The natural recordings: the short corridor, straight across the junction (= the Glass Seal).
  const westShort: InputScript = [
    { op: 'moveTo', col: 13, row: 3 },
    { op: 'moveTo', col: 4, row: 3 },
    { op: 'face', dir: 3 },
    { op: 'waitUntil', tick: 780 },
    { op: 'interact' },
    { op: 'wait', ticks: 20 },
  ];
  const eastShort: InputScript = [
    { op: 'moveTo', col: 13, row: 3 },
    { op: 'moveTo', col: 22, row: 3, timeoutTicks: 400 },
    { op: 'face', dir: 1 },
    { op: 'waitUntil', tick: 780 },
    { op: 'interact' },
    { op: 'wait', ticks: 20 },
  ];

  it('the short route shatters the glass on replay, named after the echo, and the Crown Door never opens', () => {
    const { r, ev } = lastPass([westShort, east, final], L);
    expect(r.completed).toBe(false);
    const s = shatters(ev);
    expect(s).toHaveLength(1);
    expect(s[0]!.type === 'entity' && s[0]!.actorId).toBe('echo:1');
    expect(ev.some((e) => e.type === 'doorOpen' && e.entityId === 'door-crown')).toBe(false);
    expect(runScripts(L, [west, eastShort, final]).completed).toBe(false);
  });

  it('the glass knows the living: walking over it while recording breaks nothing', () => {
    const { ev } = lastPass([westShort], L);
    expect(shatters(ev)).toHaveLength(0);
  });

  it('the winning pass never shatters the glass', () => {
    const res = runSolution(L);
    expect(shatters(res.passes[res.passes.length - 1]!.events)).toHaveLength(0);
  });

  it('the Echo Plate ignores you: standing on it live leaves the Cyan Door shut', () => {
    const { ev } = lastPass([[{ op: 'moveTo', col: 13, row: 3 }, { op: 'moveTo', col: 4, row: 3 }, { op: 'wait', ticks: 120 }]], L);
    expect(ev.some((e) => e.type === 'doorOpen' && e.entityId === 'door-cyan')).toBe(false);
  });

  it('one echo is not enough: you cannot press a timer and still reach the seal in its window', () => {
    // Echo 1 presses the West Timer; you press the East Timer together with it and run for the seal (9 tiles).
    const youEast: InputScript = [
      { op: 'moveTo', col: 13, row: 3 },
      { op: 'moveTo', col: 20, row: 3 },
      { op: 'moveTo', col: 22, row: 3, timeoutTicks: 400 },
      { op: 'face', dir: 1 },
      { op: 'waitUntil', tick: 780 },
      { op: 'interact' },
      { op: 'moveTo', col: 13, row: 3 },
      { op: 'moveTo', col: 13, row: 1, timeoutTicks: 300 },
    ];
    expect(runScripts(L, [west, youEast]).completed).toBe(false);
    // ... and the West Timer, pressed by you right after Echo 1 lit the East one, is no better.
    const eastAlone: InputScript = [...west.slice(0, 5), { op: 'wait', ticks: 400 }];
    const youWest: InputScript = [
      { op: 'moveTo', col: 13, row: 3 },
      { op: 'moveTo', col: 5, row: 3 },
      { op: 'face', dir: 3 },
      { op: 'waitUntil', tick: 780 },
      { op: 'interact' },
      { op: 'moveTo', col: 13, row: 3 },
      { op: 'moveTo', col: 13, row: 1, timeoutTicks: 300 },
    ];
    expect(runScripts(L, [eastAlone, youWest]).completed).toBe(false);
  });

  it('the timers must overlap: pressing them 3 s apart never opens the Crown Door', () => {
    const lateEast: InputScript = east.map((s) => (s.op === 'waitUntil' ? { op: 'waitUntil', tick: 960 } : s));
    expect(runScripts(L, [west, lateEast, final]).completed).toBe(false);
  });
});

describe('L17 Upstream (reversible valve + nested loop)', () => {
  const L = level17Upstream;
  const [courier, brake, final] = L.solution as [InputScript, InputScript, InputScript];

  it('the same recording ends on both sides of the valve: the echo on the Foot Plate, its copy on the Head Plate', () => {
    const res = runSolution(L);
    const st = res.game.getState();
    const echo = st.actors.find((a) => a.id === 'echo:1')!;
    const copy = st.actors.find((a) => a.id === 'echo:1.1')!;
    expect([Math.floor(echo.x / 1000), Math.floor(echo.z / 1000)]).toEqual([1, 8]);
    expect([Math.floor(copy.x / 1000), Math.floor(copy.z / 1000)]).toEqual([14, 2]);
    const ev = res.passes[res.passes.length - 1]!.events;
    expect(ev.some((e) => e.type === 'entity' && e.name === 'valvePass' && e.actorId === 'echo:1')).toBe(true);
    expect(ev.some((e) => e.type === 'entity' && e.name === 'valveDenied' && e.actorId === 'echo:1.1')).toBe(true);
  });

  it('without the Recursion Engine the same loops fail (two bodies short)', () => {
    const { recursion: _r, ...plain } = L;
    void _r;
    expect(runScripts(plain, L.solution).completed).toBe(false);
  });

  it('without the brake the copy follows its echo down the chute', () => {
    const res = runScripts(L, [courier, final]);
    expect(res.completed).toBe(false);
    const copy = res.game.getState().actors.find((a) => a.id === 'echo:1.1')!;
    expect(Math.floor(copy.z / 1000)).toBeGreaterThanOrEqual(7);
  });

  it('braking too early shuts out the echo itself (both end on the Head Plate)', () => {
    const early: InputScript = [{ op: 'moveTo', col: 23, row: 15 }, { op: 'wait', ticks: 30 }];
    expect(runScripts(L, [courier, early, final]).completed).toBe(false);
  });

  it('braking too late lets the copy through as well', () => {
    const late: InputScript = brake.map((s) => (s.op === 'waitUntil' ? { op: 'waitUntil', tick: 900 } : s));
    expect(runScripts(L, [courier, late, final]).completed).toBe(false);
  });

  it('the Brake Plate is cyan: you standing on it does not turn the valve', () => {
    const { ev } = lastPass([[{ op: 'moveTo', col: 23, row: 15 }, { op: 'wait', ticks: 60 }]], L);
    expect(ev.some((e) => e.type === 'entity' && e.name === 'valveFlip')).toBe(false);
  });

  it('one echo is not enough: its copy on the Head Plate still leaves the Brake and Foot plates to one body', () => {
    // Echo + copy split by... nobody (only echoes brake): both go down, the player cannot brake.
    expect(runScripts(L, [courier, [{ op: 'moveTo', col: 23, row: 15 }, ...final]]).completed).toBe(false);
  });
});

describe('L18 Hour of Glass (the exam)', () => {
  const L = level18HourOfGlass;
  const [courier, holder, keeper, final] = L.solution as [InputScript, InputScript, InputScript, InputScript];

  it('the Courier carries the crate the long way: across the Glass Seal it shatters on replay', () => {
    const across: InputScript = courier.map((s) => s);
    // Replace the long-way legs (down the west stair, across the hall, up the east stair) by the gallery.
    across.splice(5, 4, { op: 'moveTo', col: 16, row: 3 });
    const { r, ev } = lastPass([across, holder, keeper, final], L);
    expect(r.completed).toBe(false);
    expect(shatters(ev).map((e) => e.type === 'entity' && e.actorId)).toEqual(['echo:1']);
  });

  it('whoever enters the Sump stays there (the valve)', () => {
    const back: InputScript = [...courier.slice(0, -1), { op: 'moveTo', col: 21, row: 3 }, { op: 'moveTo', col: 16, row: 3, timeoutTicks: 200 }];
    const res = runScripts(L, [back]);
    const me = res.game.getState().actors.find((a) => a.kind === 'player')!;
    expect(Math.floor(me.x / 1000)).toBeGreaterThanOrEqual(19);
  });

  it('a body in the beam opens the Lens Door, but cannot then reach it before it shuts', () => {
    const body: InputScript = [
      { op: 'moveTo', col: 16, row: 6 },
      { op: 'moveTo', col: 16, row: 3 },
      { op: 'moveTo', col: 20, row: 3 },
      { op: 'moveTo', col: 20, row: 1 },
      { op: 'wait', ticks: 30 },
      { op: 'moveTo', col: 21, row: 3 },
      { op: 'moveTo', col: 23, row: 3, timeoutTicks: 120 },
    ];
    const res = runScripts(L, [body]);
    const me = res.game.getState().actors.find((a) => a.kind === 'player')!;
    expect(Math.floor(me.x / 1000)).toBeLessThan(23);
    expect(res.passes[0]!.events.some((e) => e.type === 'doorOpen' && e.entityId === 'door-lens')).toBe(true);
  });

  it('the console cannot be held on: no retrigger, then a cooldown', () => {
    const mash: InputScript = [...courier.slice(0, -1), { op: 'wait', ticks: 60 }, { op: 'interact' }, { op: 'wait', ticks: 150 }, { op: 'interact' }, { op: 'wait', ticks: 20 }];
    const res = runScripts(L, [mash, [...holder, { op: 'wait', ticks: 1400 }]]);
    const ev = res.passes[res.passes.length - 1]!.events;
    const fails = ev.filter((e) => e.type === 'interactFailed' && e.entityId === 'console-echo').map((e) => (e.type === 'interactFailed' ? e.reason : ''));
    expect(fails).toEqual(['busy', 'cooldown']);
  });

  it('the relayed pulse decides the moment: the Timekeeper pressing with the console, not 8 s later, fails', () => {
    const early: InputScript = keeper.map((s) => (s.op === 'waitUntil' ? { op: 'waitUntil', tick: 1130 } : s));
    expect(runScripts(L, [courier, holder, early, final]).completed).toBe(false);
  });

  it('two echoes are not enough: without the plate holder, or without the Timekeeper, the Crown stays shut', () => {
    expect(runScripts(L, [courier, keeper, final]).completed).toBe(false);
    expect(runScripts(L, [courier, holder, final]).completed).toBe(false);
    // You cannot press the timer and reach the seal in its 2.5 s.
    const youTimer: InputScript = [...keeper.slice(0, 4), { op: 'moveTo', col: 12, row: 6 }, { op: 'moveTo', col: 12, row: 1, timeoutTicks: 300 }];
    expect(runScripts(L, [courier, holder, youTimer]).completed).toBe(false);
  });
});

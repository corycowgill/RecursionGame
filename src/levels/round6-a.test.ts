import { describe, expect, it } from 'vitest';
import { UNITS_PER_TILE, type InputScript, type LevelDefinition, type SimEvent, type SimView } from '../engine/contracts';
import { completionFromEvents } from '../gameplay/puzzles/completion';
import { getObjectiveStatus } from '../gameplay/puzzles/objectives';
import { firstHashMismatch, replayLoops, runScripts, runSolution } from '../testing/harness/harness';
import { S } from '../testing/harness/script';
import { analysisFor } from '../testing/solver/levelConfigs';
import { verifySolution } from '../testing/solver/verify';
import { ROUND6_A_LEVELS, level11TheSump, level12LateLight, level13Roundabout, level16Afterimage } from './definitions/round6-a-levels';
import { findRawKeyReferences, unknownTokens } from '../ui/actionText';
import { validateLevel } from './validators/validateLevel';

/**
 * ROUND-6 CHAMBERS, LEVEL DESIGNER A (valve and relay track): L11 The Sump, L12 Late Light, L13 Roundabout,
 * L16 Afterimage. The same bar as campaign.test.ts holds for L01-L10 (validation, known solution, determinism, final
 * run alone fails, each loop solo fails, par / stars, objectives), plus each chamber's minimum-echo strategies, cheese
 * hunts and the solver's machine teaching check. Golden replays: src/testing/replays/replays.test.ts (integrated in round 6).
 * Written so it keeps passing unchanged once the director adds these levels to CAMPAIGN_LEVELS.
 */

const finalScript = (l: LevelDefinition): InputScript => l.solution[l.solution.length - 1]!;
const has = (ev: readonly SimEvent[], type: string, id?: string): boolean =>
  ev.some((e) => e.type === type && (id === undefined || ('entityId' in e && e.entityId === id)));
const cellOf = (a: { x: number; z: number }) => ({ col: Math.floor(a.x / UNITS_PER_TILE), row: Math.floor(a.z / UNITS_PER_TILE) });
const echoesOf = (st: SimView) => st.actors.filter((a) => a.kind === 'echo');
const playerOf = (st: SimView) => st.actors[st.actors.length - 1]!;

/** Planned campaign positions (the director owns CAMPAIGN_LEVELS; `order` already holds the planned value). */
const PLANNED = { 'L11-the-sump': 5, 'L12-late-light': 8, 'L13-roundabout': 9, 'L16-afterimage': 15 } as const;
/** Planned log numbers: rising with campaign order (L04 033 < L11 036 < L05 041; L06 052 < L12 055 < L13 058 < L07 060; L09 089 < L16 092). */
const LOGS = { 'L11-the-sump': '036', 'L12-late-light': '055', 'L13-roundabout': '058', 'L16-afterimage': '092' } as const;

describe('round-6 A chambers: list', () => {
  it('holds the four chambers with their planned campaign positions and log numbers', () => {
    expect(ROUND6_A_LEVELS.map((l) => l.id)).toEqual(['L11-the-sump', 'L12-late-light', 'L13-roundabout', 'L16-afterimage']);
    for (const l of ROUND6_A_LEVELS) {
      expect(l.order).toBe(PLANNED[l.id as keyof typeof PLANNED]);
      expect(l.story).toHaveLength(3);
      expect(l.story![2]).toMatch(new RegExp(`^LOG ${LOGS[l.id as keyof typeof LOGS]} · .+ — H\\.A\\.$`));
      expect(l.story![0]).toMatch(/^(Chronometry Lab|Machine Hall|Paradox Wing) — /);
    }
  });

  it('every chamber has 3+ progressive hints, a par within the echo limit and teaching tags', () => {
    for (const l of ROUND6_A_LEVELS) {
      expect(l.hints.length).toBeGreaterThanOrEqual(3);
      const delays = l.hints.map((h) => h.afterSeconds ?? 0);
      expect([...delays].sort((a, b) => a - b)).toEqual(delays);
      expect(l.parEchoes).toBeDefined();
      expect(l.parEchoes!).toBeLessThanOrEqual(l.maxEchoes);
      expect(l.teaches?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('authored text never hardcodes a key and uses only known action tokens (same lint as actionText.test)', () => {
    for (const l of ROUND6_A_LEVELS) {
      const texts = [l.name, l.subtitle ?? '', ...(l.story ?? []), ...l.hints.map((h) => h.text), ...l.entities.map((e) => e.label ?? '')];
      for (const t of texts) {
        expect(findRawKeyReferences(t), `${l.id}: ${t}`).toEqual([]);
        expect(unknownTokens(t), `${l.id}: ${t}`).toEqual([]);
      }
    }
  });

  it('valves and relays: L11-L13 introduce no inverted wire (first taught in L09); L16 uses one', () => {
    for (const l of [level11TheSump, level12LateLight, level13Roundabout]) expect(l.wires.some((w) => w.invert)).toBe(false);
    expect(level16Afterimage.wires.some((w) => w.invert)).toBe(true);
  });
});

describe.each(ROUND6_A_LEVELS.map((l) => [l.id, l] as const))('%s', (_id, level) => {
  it('validates with no errors and no warnings', () => {
    expect(validateLevel(level)).toEqual([]);
  });

  it('known solution completes within the echo limit, with zero divergences in the winning pass', () => {
    const res = runSolution(level);
    expect(res.completed).toBe(true);
    expect(res.passes.every((p) => !p.timedOut)).toBe(true);
    expect(level.solution.length - 1).toBeLessThanOrEqual(level.maxEchoes);
    expect(level.solution.length - 1).toBe(level.parEchoes);
    const final = res.passes[res.passes.length - 1]!;
    expect(final.events.filter((e) => e.type === 'divergence')).toEqual([]);
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

  it('is NOT solvable with zero echoes (the final run alone fails), nor by any single loop played alone', () => {
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

  it("the solver's machine teaching check passes on the known solution", () => {
    const res = runSolution(level);
    const echoes = res.loops.slice(0, -1).map((l, i) => ({ steps: [], loop: { ...l, id: i + 1 } }));
    const final = res.loops[res.loops.length - 1]!;
    const v = verifySolution(level, { levelId: level.id, echoes, final: { steps: [], inputs: final.inputs }, completedAtTick: res.completedAtTick ?? 0 });
    expect(v.ok).toBe(true);
    const teaching = analysisFor(level).teaching;
    expect(teaching).toBeDefined();
    expect(teaching!(v, level)).toBeNull();
  });
});

/* ---- L11 The Sump ------------------------------------------------------------------------------------------- */

describe('L11 The Sump (check valve)', () => {
  const L = level11TheSump;
  const [storeThenPump, final] = L.solution as [InputScript, InputScript];
  const straightDown: InputScript = [S.moveTo(9, 8), S.moveTo(9, 5), S.moveTo(13, 5), S.wait(30)];
  const fetchCrate: InputScript = [S.moveTo(5, 4), S.moveTo(2, 4), S.moveTo(2, 1, 300), S.face(3), S.interact(), S.moveTo(2, 4)];
  const inSump = (a: { x: number; z: number }) => {
    const c = cellOf(a);
    return c.col >= 11 && c.col <= 14 && c.row >= 1 && c.row <= 6;
  };

  it('the Pump Plate holder is sealed in the sump at the win (it went through the valve and stayed)', () => {
    const res = runSolution(L);
    const st = res.game.getState();
    expect(echoesOf(st).every((e) => inSump(e))).toBe(true);
    expect(res.passes[1]!.events.some((e) => e.type === 'entity' && e.name === 'valvePass' && e.entityId === 'valve-sump')).toBe(true);
  });

  it('alone: once down there you can never come back up (walk-back is impossible)', () => {
    const res = runScripts(L, [[...straightDown, S.moveTo(11, 5), S.moveTo(9, 5, 300), S.moveTo(9, 9, 300), S.moveTo(5, 11, 300)]]);
    expect(res.completed).toBe(false);
    expect(inSump(playerOf(res.game.getState()))).toBe(true);
  });

  it('an echo cannot walk back out of the sump either (its walk-back inputs replay against the valve)', () => {
    const backOut: InputScript = [...straightDown, S.moveTo(11, 5), S.moveTo(9, 5, 200), S.moveTo(9, 9, 300), S.wait(60)];
    const res = runScripts(L, [backOut, [S.moveTo(5, 9), S.moveTo(5, 11, 900)]]);
    expect(res.completed).toBe(false);
    expect(inSump(echoesOf(res.game.getState())[0]!)).toBe(true);
  });

  it('plan who commits: an echo recorded straight into the sump leaves the Store shut, and the crate out of reach', () => {
    const res = runScripts(L, [straightDown, [...fetchCrate, S.moveTo(2, 9), S.moveTo(8, 9), S.face(1), S.interact(), S.moveTo(5, 9), S.moveTo(5, 11, 600)]]);
    expect(res.completed).toBe(false);
    expect(has(res.passes[1]!.events, 'doorOpen', 'door-store')).toBe(false);
    expect(res.game.getState().entities['crate-store']!.carriedBy).toBeNull();
  });

  it('alone the Store stays shut behind you: the Store Plate is 7 tiles from the Store Door (no doorstop)', () => {
    const res = runScripts(L, [[S.moveTo(9, 8), S.moveTo(9, 4), S.wait(30), ...fetchCrate, S.wait(10)]]);
    expect(res.game.getState().entities['crate-store']!.carriedBy).toBeNull();
    expect(cellOf(playerOf(res.game.getState())).row).toBeGreaterThanOrEqual(4);
  });

  it('lesson beat: the crate carried down into the sump is wasted (the Pump Plate ignores crates)', () => {
    const storeForever: InputScript = [S.moveTo(9, 8), S.moveTo(9, 4), S.wait(30)];
    const carryDown: InputScript = [...fetchCrate, S.moveTo(9, 5), S.moveTo(12, 5), S.face(1), S.interact(), S.wait(30)];
    const res = runScripts(L, [storeForever, carryDown]);
    const st = res.game.getState();
    expect(st.entities['crate-store']!.carriedBy).toBeNull();
    expect(cellOf(st.entities['crate-store']!)).toEqual({ col: 13, row: 5 }); // on the Pump Plate ...
    expect(st.signals['plate-pump']).toBe(false); // ... which counts bodies only
    expect(inSump(playerOf(st))).toBe(true); // and you are down there with it, for good
  });

  it('standing on the Hall Plate yourself and running for the door fails (no doorstop: it shuts before you get there)', () => {
    const res = runScripts(L, [storeThenPump, [S.moveTo(9, 9), S.wait(600), S.moveTo(5, 9), S.moveTo(5, 11, 600)]]);
    expect(res.completed).toBe(false);
    expect(has(res.passes[1]!.events, 'doorOpen', 'door-exit')).toBe(true);
  });

  it('two echoes also work (limit 2), but the par is one: the crate replaces a body', () => {
    const res = runScripts(L, [straightDown, [S.moveTo(9, 9), S.wait(30)], [S.moveTo(5, 9), S.moveTo(5, 11, 900)]]);
    expect(res.completed).toBe(true);
    expect(L.parEchoes).toBe(1);
    expect(final.filter((s) => s.op === 'interact')).toHaveLength(2);
  });
});

/* ---- L12 Late Light ----------------------------------------------------------------------------------------- */

describe('L12 Late Light (chrono relay)', () => {
  const L = level12LateLight;
  const [echo] = L.solution as [InputScript, InputScript];
  const throughGallery: InputScript = [S.moveTo(12, 3), S.moveTo(12, 6), S.moveTo(12, 8, 900)];
  const ringBell: InputScript = [S.moveTo(5, 2), S.face(0), S.interact()];

  it('beat 1: through the line the Gallery Door opens 6 s after the press, for the 2 s it was rung', () => {
    const res = runScripts(L, [[...ringBell, ...throughGallery, S.wait(10)]]);
    const ev = res.passes[0]!.events;
    const on = ev.find((e) => e.type === 'switchOn' && e.entityId === 'switch-bell')!.tick;
    const open = ev.find((e) => e.type === 'doorOpen' && e.entityId === 'door-gallery')!.tick;
    expect(open - on).toBe(362); // delayTicks + 2 (the relay hop and the door hop)
    expect(res.passes[0]!.timedOut).toBe(false);
    expect(cellOf(playerOf(res.game.getState()))).toEqual({ col: 12, row: 8 });
  });

  it('beat 1: dawdling past the delayed window misses the Gallery Door', () => {
    const late: InputScript = [...ringBell, S.wait(240), S.moveTo(12, 3), S.moveTo(12, 6), S.moveTo(12, 8, 400)];
    const res = runScripts(L, [late]);
    expect(cellOf(playerOf(res.game.getState())).row).toBeLessThan(8);
  });

  it('alone you fail: ring the Bell Plate, hold the Lamp Plate, then run for the door', () => {
    const res = runScripts(L, [[...ringBell, ...throughGallery, S.moveTo(2, 9), S.wait(120), S.moveTo(10, 9), S.wait(300), S.moveTo(20, 8), S.moveTo(20, 6, 600)]]);
    expect(res.completed).toBe(false);
  });

  it('you on the Bell Plate with the echo on the Lamp Plate fails: the walk to the door is longer than the line', () => {
    const lampEcho: InputScript = [...ringBell, ...throughGallery, S.moveTo(10, 9), S.wait(30)];
    const res = runScripts(L, [lampEcho, [...throughGallery, S.moveTo(2, 9), S.wait(180), S.moveTo(20, 8), S.moveTo(20, 6, 900)]]);
    expect(res.completed).toBe(false);
    expect(has(res.passes[1]!.events, 'doorOpen', 'door-exit')).toBe(true); // it did open, but you were not there
  });

  it('the delayed bell outlives its cause: the Exit Door opens while the Bell Plate is empty', () => {
    const res = runSolution(L);
    const final = res.passes[1]!;
    const open = final.events.find((e) => e.type === 'doorOpen' && e.entityId === 'door-exit')!;
    const bellUp = final.events.filter((e) => e.type === 'plateUp' && e.entityId === 'plate-bell');
    expect(bellUp.length).toBeGreaterThan(0);
    expect(bellUp[bellUp.length - 1]!.tick).toBeLessThan(open.tick);
    expect(echo.filter((s) => s.op === 'interact')).toHaveLength(1);
  });

  it('one echo only: the trivial two-plate-holder plan is out of reach', () => {
    expect(L.maxEchoes).toBe(1);
  });
});

/* ---- L13 Roundabout ----------------------------------------------------------------------------------------- */

describe('L13 Roundabout (relay + valves)', () => {
  const L = level13Roundabout;
  const [north, south] = L.solution as [InputScript, InputScript, InputScript];
  const enter: InputScript = [S.moveTo(5, 5), S.moveTo(7, 5)];
  const lapToCrown: InputScript = [...enter, S.moveTo(7, 2), S.moveTo(21, 2), S.moveTo(21, 12), S.moveTo(7, 12), S.moveTo(7, 7)];

  it('the Crown Door is right behind the entry but out of reach: the West Valve only passes north', () => {
    const res = runScripts(L, [[...enter, S.moveTo(7, 7, 200), S.wait(10)]]);
    expect(cellOf(playerOf(res.game.getState())).row).toBeLessThanOrEqual(5);
  });

  it('no counter-clockwise route: from the North Timer you cannot walk back west and down to the South Timer', () => {
    const res = runScripts(L, [[...enter, S.moveTo(7, 2), S.moveTo(13, 2), S.moveTo(7, 2), S.moveTo(7, 12, 300), S.wait(10)]]);
    expect(cellOf(playerOf(res.game.getState())).row).toBeLessThanOrEqual(5);
  });

  it('one hand cannot line up both pulses: an echo presses North, runs clockwise and presses South', () => {
    const both: InputScript = [...enter, S.moveTo(7, 2), S.moveTo(13, 2), S.face(0), S.waitUntil(500), S.interact(), S.moveTo(21, 2), S.moveTo(21, 12), S.moveTo(13, 12), S.face(2), S.interact(), S.wait(30)];
    const res = runScripts(L, [both, [...lapToCrown, S.moveTo(14, 7, 1500)]]);
    expect(res.completed).toBe(false);
    const ev = res.passes[1]!.events;
    expect(has(ev, 'switchOn', 'timer-north')).toBe(true);
    expect(has(ev, 'switchOn', 'timer-south')).toBe(true);
  });

  it('you cannot be the South hand: the door is 5 s clockwise of the South Timer, its window 2.5 s', () => {
    const northEcho: InputScript = [...enter, S.moveTo(7, 2), S.moveTo(13, 2), S.face(0), S.waitUntil(800), S.interact(), S.wait(30)];
    const res = runScripts(L, [northEcho, [...enter, S.moveTo(7, 2), S.moveTo(21, 2), S.moveTo(21, 12), S.moveTo(13, 12), S.face(2), S.waitUntil(1105), S.interact(), S.moveTo(7, 12), S.moveTo(7, 7), S.moveTo(14, 7, 900)]]);
    expect(res.completed).toBe(false);
  });

  it('you cannot be the North hand: 15.8 s from the door, long after the delayed window closes', () => {
    const southEcho: InputScript = [...enter, S.moveTo(7, 2), S.moveTo(21, 2), S.moveTo(21, 12), S.moveTo(13, 12), S.face(2), S.waitUntil(1100), S.interact(), S.wait(30)];
    const res = runScripts(L, [southEcho, [...enter, S.moveTo(7, 2), S.moveTo(13, 2), S.face(0), S.waitUntil(800), S.interact(), S.moveTo(21, 2), S.moveTo(21, 12), S.moveTo(7, 12), S.moveTo(7, 7), S.moveTo(14, 7, 900)]]);
    expect(res.completed).toBe(false);
  });

  it('relay-bypass is impossible: mashing the North Timer never keeps it on (no retrigger, cooldown)', () => {
    const mash: InputScript = [...enter, S.moveTo(7, 2), S.moveTo(13, 2), S.face(0)];
    for (let i = 0; i < 12; i++) mash.push(S.interact(), S.wait(20));
    const res = runScripts(L, [mash]);
    const ev = res.passes[0]!.events.filter((e) => (e.type === 'switchOn' || e.type === 'switchOff') && e.entityId === 'timer-north');
    for (let i = 0; i + 1 < ev.length; i += 2) {
      expect(ev[i]!.type).toBe('switchOn');
      expect(ev[i + 1]!.tick - ev[i]!.tick).toBeLessThanOrEqual(150);
    }
  });

  it('the two hands are distinct echoes, and South must follow North by the line delay', () => {
    const res = runSolution(L);
    const ev = res.passes[2]!.events;
    const n = ev.find((e) => e.type === 'switchOn' && e.entityId === 'timer-north')!;
    const s = ev.find((e) => e.type === 'switchOn' && e.entityId === 'timer-south')!;
    expect(s.tick - n.tick).toBeGreaterThan(150);
    expect(s.tick - n.tick).toBeLessThan(450);
    expect(north).not.toEqual(south);
  });
});

/* ---- L16 Afterimage ----------------------------------------------------------------------------------------- */

describe('L16 Afterimage (relay + inverted wire + valve)', () => {
  const L = level16Afterimage;
  const [reader, vaulter, final] = L.solution as [InputScript, InputScript, InputScript];
  const intoVault: InputScript = [S.moveTo(17, 7), S.moveTo(17, 3, 900), S.moveTo(20, 3), S.moveTo(20, 1), S.moveTo(13, 1), S.wait(30)];
  const inVault = (a: { x: number; z: number }) => {
    const c = cellOf(a);
    return c.row <= 3 && c.col >= 13;
  };

  it('an echo that stays on the Hall Plate keeps the vault shut for ever (the inverted wire)', () => {
    const holdHall: InputScript = [S.moveTo(13, 8), S.wait(30)];
    const res = runScripts(L, [reader, holdHall, intoVault]);
    expect(res.completed).toBe(false);
    expect(has(res.passes[2]!.events, 'doorOpen', 'door-vault')).toBe(false);
  });

  it('a body that never stood on the Hall Plate gets nothing down the line', () => {
    const res = runScripts(L, [reader, [S.moveTo(16, 9), ...intoVault], [S.moveTo(10, 7), S.moveTo(10, 2, 1500)]]);
    expect(res.completed).toBe(false);
    expect(has(res.passes[2]!.events, 'doorOpen', 'door-vault')).toBe(false);
  });

  it('the vault opens AFTER the Hall Plate empties: held 6 s ago and empty now', () => {
    const res = runSolution(L);
    const ev = res.passes[2]!.events;
    const up = ev.find((e) => e.type === 'plateUp' && e.entityId === 'plate-hall')!;
    const open = ev.find((e) => e.type === 'doorOpen' && e.entityId === 'door-vault')!;
    expect(open.tick).toBeGreaterThan(up.tick);
    expect(open.tick - up.tick).toBeLessThanOrEqual(362);
    expect(inVault(echoesOf(res.game.getState())[1]!)).toBe(true);
  });

  it("the vaulter's own afterimage has faded before it reaches the Vault Plate: you must ring the line again to leave", () => {
    const res = runScripts(L, [reader, vaulter, [S.moveTo(10, 7), S.moveTo(10, 2, 1500)]]);
    expect(res.completed).toBe(false);
    expect(has(res.passes[2]!.events, 'doorOpen', 'door-spire')).toBe(false);
    expect(res.game.getState().signals['plate-vault']).toBe(true);
  });

  it('the reader cannot ring the Hall Plate too: it is 8.8 s from the Reading Plate, the line remembers 6', () => {
    const ringThenRead: InputScript = [S.moveTo(13, 8), S.wait(60), S.moveTo(1, 7), S.moveTo(1, 5), S.moveTo(6, 1), S.wait(30)];
    const res = runScripts(L, [ringThenRead, [S.moveTo(17, 6), ...intoVault], [S.moveTo(10, 7), S.moveTo(10, 2, 1500)]]);
    expect(res.completed).toBe(false);
    expect(has(res.passes[2]!.events, 'doorOpen', 'door-vault')).toBe(false);
  });

  it('the vault holder is sealed: an echo that turns back at the valve stays in the vault (no walk-back, no doorstop)', () => {
    const turnBack: InputScript = [...vaulter.slice(0, 4), S.moveTo(17, 5, 200), S.moveTo(17, 7, 200), S.wait(30)];
    const res = runScripts(L, [reader, turnBack, final]);
    expect(inVault(echoesOf(res.game.getState())[1]!)).toBe(true);
  });

  it('one echo is not enough: the echo reads, you ring the Hall Plate and walk into the vault (and are sealed in)', () => {
    const res = runScripts(L, [reader, [...vaulter.slice(0, -1), S.moveTo(20, 3), S.moveTo(17, 3), S.moveTo(17, 7, 300), S.moveTo(10, 7, 300), S.moveTo(10, 2, 600)]]);
    expect(res.completed).toBe(false);
    expect(inVault(playerOf(res.game.getState()))).toBe(true);
  });

  it('one echo is not enough: the echo rings and enters, you hold the Reading Plate, then the Spire Door needs it', () => {
    const res = runScripts(L, [vaulter, [...reader.slice(0, -1), S.wait(600), S.moveTo(1, 5), S.moveTo(1, 7), S.moveTo(13, 8), S.wait(60), S.moveTo(10, 7), S.moveTo(10, 2, 900)]]);
    expect(res.completed).toBe(false);
  });
});

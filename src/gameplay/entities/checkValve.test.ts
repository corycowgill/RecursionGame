import { describe, expect, it } from 'vitest';
import { PHYS, type EntityDefinition, type LevelDefinition, type SimState, type Wire } from '../../engine/contracts';
import { buildCollisionWorld, moveAxis } from '../../engine/physics/collision';
import { LevelRuntimeImpl } from '../../engine/simulation/runtime';
import { createGame, playInputs, playScript, replayLoops } from '../../testing/harness/harness';
import { S, ScriptRunner } from '../../testing/harness/script';
import { InvariantChecker } from '../../testing/qa/invariants';
import { validateLevel } from '../../levels/validators/validateLevel';
import { createDefaultRegistry } from './index';
import { checkValveBehaviour, valveSolidFor } from './checkValve';
import { ent, entityOf, mini, named, playerOf } from './testkit';

/**
 * CHECK VALVE (round 6): one-way ratchet doorway. Corridor fixture (valve V at (4,1), allowed travel east):
 *   #########
 *   #S..V...#     S spawn (1,1)
 *   #########
 * Cell 4 spans x in [4000, 5000): a body is flush against the closed downstream face at x = 5000 + ACTOR_HALF.
 */
const FLUSH_X = 5000 + PHYS.ACTOR_HALF;

function corridor(o: { valve?: Partial<EntityDefinition & { kind: 'checkValve' }>; extra?: EntityDefinition[]; wires?: Wire[]; tiles?: string[]; recursion?: { delayTicks: number } } = {}): LevelDefinition {
  return mini('valve-corridor', {
    tiles: o.tiles ?? ['#########', '#.......#', '#########'],
    entities: [ent({ id: 'valve', kind: 'checkValve', col: 4, row: 1, facing: 1, config: {}, ...(o.valve as object) }) as EntityDefinition, ...(o.extra ?? [])],
    wires: o.wires ?? [],
    spawn: { col: 1, row: 1, facing: 1 },
    exit: { col: 7, row: 1 },
    ...(o.recursion ? { recursion: o.recursion } : {}),
  });
}

/** Plays a script tick by tick, running every QA invariant (and the valve crossing rule) after each tick. */
function checkedRun(level: LevelDefinition, script: Parameters<typeof playScript>[1]): string[] {
  const checker = new InvariantChecker(level);
  const game = createGame(level);
  const runner = new ScriptRunner(script);
  const bad: string[] = [];
  for (let guard = 0; guard < level.loopDurationTicks; guard++) {
    const input = runner.next(game.getState());
    if (!input) break;
    game.step(input);
    for (const v of checker.check(game.getState(), game.getLoops())) bad.push(`${v.rule}: ${v.message}`);
    for (const v of checker.checkValveCrossings(game.getState())) bad.push(`${v.rule}: ${v.message}`);
  }
  return bad;
}

describe('check valve', () => {
  it('lets a body pass in the allowed direction (valvePass event at the centre crossing)', () => {
    const game = createGame(corridor());
    const pass = playScript(game, [S.moveTo(6, 1)]);
    expect(pass.timedOut).toBe(false);
    expect(playerOf(game.getState()).x).toBe(6500);
    const passes = named(pass.events, 'valvePass');
    expect(passes.length).toBe(1);
    expect(passes[0]!.actorId).toBe('player');
  });

  it('blocks re-entry from the downstream side: the body stops flush against the face (valveDenied once)', () => {
    const game = createGame(corridor());
    playScript(game, [S.moveTo(6, 1)]);
    const back = playScript(game, [S.moveTo(1, 1, 120)]);
    expect(back.timedOut).toBe(true);
    expect(playerOf(game.getState()).x).toBe(FLUSH_X);
    expect(named(back.events, 'valveDenied').length).toBe(1);
  });

  it('an occupant can back out the way it came (nobody is ever trapped in the cell)', () => {
    const game = createGame(corridor());
    playScript(game, [S.moveTo(4, 1)]);
    expect(playerOf(game.getState()).x).toBe(4500);
    const back = playScript(game, [S.moveTo(1, 1)]);
    expect(back.timedOut).toBe(false);
    // ... and even a body whose centre already crossed the downstream edge but still overlaps the cell
    const g2 = createGame(corridor());
    playScript(g2, [S.move(1, 0, 25 + 25 + 25 + 3)]); // centre at 1500 + 78*40 = 4620... keep walking
    playScript(g2, [S.move(1, 0, 12)]); // centre ~5100: beyond the edge, footprint still overlapping
    const x = playerOf(g2.getState()).x;
    expect(x).toBeGreaterThan(5000);
    expect(x).toBeLessThan(FLUSH_X);
    expect(playScript(g2, [S.moveTo(1, 1)]).timedOut).toBe(false);
  });

  it('a direction flip mid-crossing never traps the occupant (either way out works)', () => {
    // latch plate (2,1) -> relay (60 ticks) -> reversible valve: the flip lands while the player stands in the valve
    const extra: EntityDefinition[] = [
      ent({ id: 'plate', kind: 'pressurePlate', col: 2, row: 1, config: { latch: true } }),
      ent({ id: 'relay', kind: 'chronoRelay', col: 4, row: 0, config: { delayTicks: 60 } }),
    ];
    const wires: Wire[] = [
      { from: 'plate', to: 'relay' },
      { from: 'relay', to: 'valve' },
    ];
    const level = corridor({ valve: { config: { reverseWhenPowered: true } }, extra, wires });
    for (const exit of [6, 1]) {
      const game = createGame(level);
      const a = playScript(game, [S.moveTo(4, 1), S.wait(80)]);
      const flip = named(a.events, 'valveFlip');
      expect(flip.length).toBe(1);
      expect(entityOf(game.getState(), 'valve', 'checkValve').state.dir).toBe(3);
      const b = playScript(game, [S.moveTo(exit, 1)]);
      expect(b.timedOut, `exit towards col ${exit}`).toBe(false);
    }
    for (const exit of [6, 1]) expect(checkedRun(level, [S.moveTo(4, 1), S.wait(80), S.moveTo(exit, 1)])).toEqual([]);
  });

  it('side entry is impossible: the validator rejects a valve with an open lateral neighbour', () => {
    const level = corridor({ tiles: ['#########', '#.......#', '####.####'] });
    level.grid.tiles[2] = '####.####';
    const errs = validateLevel(level).filter((i) => i.severity === 'error').map((i) => i.message);
    expect(errs.some((m) => m.includes('valve') && m.includes('lateral'))).toBe(true);
    // ... and physically, a body arriving from the side is blocked anyway (lateral >= HALF_TILE is solid)
    const open = corridor({ tiles: ['#########', '#.......#', '#.......#', '#########'] });
    const game = createGame(open);
    playScript(game, [S.moveTo(4, 2)]);
    const up = playScript(game, [S.moveTo(4, 1, 60)]);
    expect(up.timedOut).toBe(true);
    expect(playerOf(game.getState()).z).toBe(2000 + PHYS.ACTOR_HALF);
  });

  it('a carried crate passes with its carrier, but nothing can be dropped into the valve cell', () => {
    const level = corridor({ extra: [ent({ id: 'crate', kind: 'crate', col: 2, row: 1, config: {} })] });
    level.playerSpawn = { col: 1, row: 1, facing: 1 };
    const game = createGame(level);
    const pick = playScript(game, [S.face(1), S.interact()]);
    expect(pick.events.some((e) => e.type === 'pickup')).toBe(true);
    // face the valve cell from (3,1) and try to drop: refused
    const drop = playScript(game, [S.moveTo(3, 1), S.face(1), S.interact()]);
    expect(drop.events.some((e) => e.type === 'interactFailed' && e.reason === 'occupied')).toBe(true);
    expect(game.getState().entities['crate']!.carriedBy).toBe('player');
    // carry it through and put it down downstream
    const through = playScript(game, [S.moveTo(6, 1), S.face(1), S.interact()]);
    expect(through.events.some((e) => e.type === 'drop')).toBe(true);
    expect(game.getState().entities['crate']!.x).toBe(7500);
  });

  it('lasers pass through the grille', () => {
    const level = mini('valve-laser', {
      tiles: ['#########', '#.......#', '#########', '#.......#', '#########'],
      entities: [
        ent({ id: 'valve', kind: 'checkValve', col: 4, row: 1, facing: 1, config: {} }),
        ent({ id: 'emitter', kind: 'laserEmitter', col: 1, row: 1, facing: 1, config: {} }),
        ent({ id: 'receiver', kind: 'laserReceiver', col: 7, row: 1, config: {} }),
      ],
      spawn: { col: 1, row: 3 },
      exit: { col: 7, row: 3 },
    });
    const game = createGame(level);
    playInputs(game, [], 5);
    expect(entityOf(game.getState(), 'receiver', 'laserReceiver').state.lit).toBe(true);
  });

  it('echoes and nested-loop copies obey it exactly like the player (positional, never a divergence)', () => {
    const level = corridor({ recursion: { delayTicks: 60 } });
    const game = createGame(level);
    playScript(game, [S.moveTo(6, 1), S.moveTo(1, 1, 120)]);
    expect(game.commitLoopAndRewind()).toBe(true);
    const pass = playInputs(game, [], 500);
    const st = game.getState();
    const echoes = st.actors.filter((a) => a.kind === 'echo');
    expect(echoes.length).toBe(2); // echo + its recursive copy
    for (const a of echoes) expect(a.x, a.id).toBe(FLUSH_X);
    expect(pass.events.filter((e) => e.type === 'divergence')).toEqual([]);
    expect(named(pass.events, 'valvePass').map((e) => e.actorId).sort()).toEqual(['echo:1', 'echo:1.1']);
  });

  it('carry moves use the same predicate: a rider cannot be ferried upstream into the valve', () => {
    const level = corridor();
    const rt = new LevelRuntimeImpl(level, createDefaultRegistry());
    const game = createGame(level);
    playScript(game, [S.moveTo(6, 1)]);
    const st = structuredClone(game.getState()) as unknown as SimState;
    const actor = st.actors[st.actors.length - 1]!;
    actor.x = FLUSH_X;
    const world = buildCollisionWorld(rt, st);
    expect(moveAxis(world, actor, 'x', -40, { carry: true })).toBe(0);
    expect(actor.x).toBe(FLUSH_X);
    // the other way round a carry move passes freely
    actor.x = 3500;
    expect(moveAxis(world, actor, 'x', 40, { carry: true })).toBe(40);
  });

  it('a reversible valve flips with its powered input, unwired / flag-less valves never flip', () => {
    const extra = [ent({ id: 'plate', kind: 'pressurePlate', col: 2, row: 1, config: {} })];
    const flagged = corridor({ valve: { config: { reverseWhenPowered: true } }, extra, wires: [{ from: 'plate', to: 'valve' }] });
    const g = createGame(flagged);
    const a = playScript(g, [S.moveTo(2, 1), S.wait(3)]);
    expect(named(a.events, 'valveFlip').length).toBe(1);
    expect(entityOf(g.getState(), 'valve', 'checkValve').state.dir).toBe(3);
    // the plate's signal is read one tick later (previous buffer), like every wired consumer
    const down = a.events.find((e) => e.type === 'plateDown')!.tick;
    expect(named(a.events, 'valveFlip')[0]!.tick).toBe(down + 1);
    const plain = corridor({ extra, wires: [{ from: 'plate', to: 'valve' }] });
    const g2 = createGame(plain);
    const b = playScript(g2, [S.moveTo(2, 1), S.wait(3)]);
    expect(named(b.events, 'valveFlip')).toEqual([]);
  });

  it('phaseTicks saturates, output is always false, state resets every pass', () => {
    const game = createGame(corridor());
    playInputs(game, [], 700);
    const v = entityOf(game.getState(), 'valve', 'checkValve');
    expect(v.state.phaseTicks).toBe(600);
    expect(game.getState().signals['valve']).toBe(false);
    game.resetLoop();
    expect(entityOf(game.getState(), 'valve', 'checkValve').state).toEqual({ dir: 1, phaseTicks: 0 });
  });

  it('predicate unit check: along / lateral thresholds', () => {
    const def = ent({ id: 'v', kind: 'checkValve', col: 4, row: 1, facing: 1, config: {} });
    const e = { id: 'v', kind: 'checkValve' as const, x: 4500, y: 0, z: 1500, carriedBy: null, state: checkValveBehaviour.reset(def, { runtime: null as never }) };
    expect(valveSolidFor(e, { x: 3000, z: 1500 })).toBe(false); // upstream
    expect(valveSolidFor(e, { x: 4999, z: 1500 })).toBe(false); // centre inside, just short of the edge
    expect(valveSolidFor(e, { x: 5000, z: 1500 })).toBe(true); // centre on the downstream edge
    expect(valveSolidFor(e, { x: 4500, z: 2000 })).toBe(true); // lateral
    expect(checkValveBehaviour.isSolid?.(e, def)).toBe(true);
    expect(checkValveBehaviour.blocksLaser?.(e, def)).toBe(false);
  });

  it('deterministic: identical per-tick hashes across runs and in pure re-simulation', () => {
    const level = corridor();
    const g = createGame(level);
    const rec = playScript(g, [S.moveTo(6, 1), S.moveTo(1, 1, 60)]);
    expect(g.commitLoopAndRewind()).toBe(true);
    const a = replayLoops(level, g.getLoops(), rec.inputs);
    const b = replayLoops(level, g.getLoops(), rec.inputs);
    expect(a.hashes).toEqual(b.hashes);
  });
});

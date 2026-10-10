import { describe, expect, it } from 'vitest';
import type { EntityDefinition, LevelDefinition, SimView } from '../../engine/contracts';
import { createGame, playScript, runScripts } from '../../testing/harness/harness';
import { S } from '../../testing/harness/script';
import { level03TheRelay } from '../../levels/definitions/L03-the-relay';
import { predictInteraction } from '../interactions/targeting';
import { consumerStatus, getObjectiveStatus } from '../puzzles/objectives';
import { evaluateCompletion } from '../puzzles/completion';
import { actorAnimState, allActorAnimStates } from './animation';

function room(entities: EntityDefinition[], tiles?: string[]): LevelDefinition {
  const t = tiles ?? ['#########', '#.......#', '#.......#', '#.......#', '#########'];
  return {
    id: 'player-room',
    order: 0,
    name: 'player-room',
    grid: { width: t[0]!.length, height: t.length, tiles: t },
    entities: [...entities, { id: 'exit', kind: 'exitPortal', col: 7, row: 3, config: {} }],
    wires: [],
    playerSpawn: { col: 1, row: 1, facing: 1 },
    exitId: 'exit',
    maxEchoes: 2,
    loopDurationTicks: 3600,
    parTimeSeconds: 10,
    hints: [],
    solution: [[S.wait(1)]],
  };
}
const me = (v: SimView) => v.actors[v.actors.length - 1]!;

describe('actor animation state', () => {
  it('reports walking, facing and heading while moving and idle when stopped', () => {
    const game = createGame(room([]));
    playScript(game, [S.move(0, 1, 5)]);
    let a = actorAnimState(game.getState(), me(game.getState()));
    expect(a).toMatchObject({ locomotion: 'walk', moving: true, speed: 40, facing: 2, heading: 4, carrying: null });
    playScript(game, [S.wait(2)]);
    a = actorAnimState(game.getState(), me(game.getState()));
    expect(a).toMatchObject({ locomotion: 'idle', moving: false, speed: 0 });
  });

  it('reports carrying, the interaction pose window and failed attempts', () => {
    const game = createGame(room([{ id: 'crate', kind: 'crate', col: 2, row: 1, config: {} }]));
    playScript(game, [S.interact()]);
    let a = actorAnimState(game.getState(), me(game.getState()));
    expect(a).toMatchObject({ carrying: 'crate', carryKind: 'crate', interacting: true, interactKind: 'pickup', ticksSinceInteract: 0 });
    playScript(game, [S.wait(20)]);
    expect(actorAnimState(game.getState(), me(game.getState())).interacting).toBe(false);
    // Face the wall and try to drop: fails.
    playScript(game, [S.face(0), S.interact()]);
    a = actorAnimState(game.getState(), me(game.getState()));
    expect(a).toMatchObject({ interactFailed: true, interactKind: 'fail', carrying: 'crate' });
  });

  it('covers every actor (echoes first) and flags finished echoes', () => {
    const res = runScripts(room([]), [[S.move(1, 0, 10)], [S.wait(30)]]);
    const all = allActorAnimStates(res.game.getState());
    expect(all.map((a) => a.kind)).toEqual(['echo', 'player']);
    expect(all[0]!.finished).toBe(true);
    expect(all[0]!.echoIndex).toBe(0);
  });

  it("reports 'ride' while carried by a moving platform", () => {
    const lvl = room(
      [{ id: 'deck', kind: 'movingPlatform', col: 2, row: 1, level: 0, config: { path: [{ col: 2, row: 1 }, { col: 5, row: 1 }], pauseTicks: 40 } }],
      ['#########', '#.____..#', '#.......#', '#.......#', '#########'],
    );
    const game = createGame(lvl);
    playScript(game, [S.moveTo(2, 1), S.waitUntil(80)]);
    expect(actorAnimState(game.getState(), me(game.getState())).locomotion).toBe('ride');
  });
});

describe('interaction targeting (prediction matches the engine)', () => {
  const lvl = room([
    { id: 'crate', kind: 'crate', col: 2, row: 1, config: {} },
    { id: 'cell', kind: 'energyCell', col: 1, row: 3, config: {} },
    { id: 'socket', kind: 'energySocket', col: 4, row: 3, config: {} },
    { id: 'sw', kind: 'timedSwitch', col: 4, row: 1, config: { durationTicks: 60 } },
  ]);

  it('predicts pickup, drop, blocked, use, insert, extract and none, and each prediction comes true', () => {
    const game = createGame(lvl);
    const expectNext = (action: string, label?: string) => {
      const p = predictInteraction(lvl, game.getState());
      expect(p.action).toBe(action);
      if (label) expect(p.label).toBe(label);
      return p;
    };
    const press = () => playScript(game, [S.interact()]).events.find((e) => e.type === 'interact' || e.type === 'pickup' || e.type === 'drop' || e.type === 'interactFailed');

    expectNext('pickup', 'Pick up crate');
    expect(press()).toMatchObject({ type: 'pickup', entityId: 'crate' });
    playScript(game, [S.face(0)]);
    expectNext('blocked');
    expect(press()).toMatchObject({ type: 'interactFailed' });
    playScript(game, [S.face(2)]);
    expectNext('drop', 'Place crate');
    expect(press()).toMatchObject({ type: 'drop', entityId: 'crate' });

    playScript(game, [S.moveTo(3, 1), S.face(1)]);
    expectNext('use', 'Activate switch');
    expect(press()).toMatchObject({ type: 'interact', entityId: 'sw', kind: 'use' });

    playScript(game, [S.moveTo(2, 3), S.face(3)]);
    expectNext('pickup', 'Pick up energy cell');
    press();
    playScript(game, [S.moveTo(3, 3), S.face(1)]);
    expectNext('insert', 'Insert energy cell');
    expect(press()).toMatchObject({ type: 'interact', entityId: 'socket', kind: 'insert' });
    expectNext('extract', 'Take energy cell');
    expect(press()).toMatchObject({ type: 'interact', entityId: 'socket', kind: 'extract' });

    playScript(game, [S.interact(), S.face(2)]); // re-insert, face the wall
    expectNext('none');
  });
});

describe('objectives and completion', () => {
  it('reports which conditions of the Chrono Door are satisfied mid-solution', () => {
    const game = createGame(level03TheRelay);
    playScript(game, level03TheRelay.solution[0]!);
    const door = consumerStatus(level03TheRelay, game.getState(), 'door-chrono');
    expect(door.conditions.map((c) => [c.entityId, c.satisfied])).toEqual([
      ['plate-crate', true],
      ['plate-watch', true],
      ['switch-far', false],
    ]);
    expect(door.satisfiedCount).toBe(2);
    expect(door.powered).toBe(false);
    const status = getObjectiveStatus(level03TheRelay, game.getState());
    expect(status.exit.conditions).toEqual([]);
    expect(status.objective).toBe('Open the Chrono Door and reach the portal');
  });

  it('rates completions with stars from par time and par echoes', () => {
    expect(evaluateCompletion(level03TheRelay, 600, 2).stars).toBe(3);
    expect(evaluateCompletion(level03TheRelay, 60 * 60, 2).stars).toBe(2);
    expect(evaluateCompletion(level03TheRelay, 600, 3).stars).toBe(1);
    expect(evaluateCompletion(level03TheRelay, 585, 2).seconds).toBe(9.75);
  });
});

import { describe, expect, it } from 'vitest';
import { PHYS } from '../contracts';
import { testChamber } from '../../levels/definitions/test-chamber';
import { crateRoom, terrainRoom } from '../../testing/harness/fixtures';
import { createGame, playInputs, playScript } from '../../testing/harness/harness';
import { inputs } from '../../testing/harness/script';
import { cellKey, cellSurfaceAtPoint, isFlatCell, overrideAtPoint } from './terrain';

const player = (g: ReturnType<typeof createGame>) => {
  const st = g.getState();
  return st.actors[st.actors.length - 1]!;
};

describe('movement & collision', () => {
  it('moves ACTOR_SPEED per tick on one axis and ACTOR_SPEED_DIAG per axis diagonally', () => {
    const g = createGame(crateRoom());
    const p0 = { ...player(g) };
    playInputs(g, inputs().move(0, 1, 1).build());
    expect(player(g).z - p0.z).toBe(PHYS.ACTOR_SPEED);
    playInputs(g, inputs().move(1, -1, 1).build());
    expect(player(g).x - p0.x).toBe(PHYS.ACTOR_SPEED_DIAG);
    expect(player(g).z - p0.z).toBe(PHYS.ACTOR_SPEED - PHYS.ACTOR_SPEED_DIAG);
  });

  it('stops flush against walls', () => {
    const g = createGame(crateRoom());
    playInputs(g, inputs().move(-1, 0, 200).build());
    // west wall occupies col 0 => actor centre stops at 1000 + ACTOR_HALF
    expect(player(g).x).toBe(1000 + PHYS.ACTOR_HALF);
    playInputs(g, inputs().move(0, -1, 200).build());
    expect(player(g).z).toBe(1000 + PHYS.ACTOR_HALF);
  });

  it('closed doors block, and resting crates block', () => {
    const g = createGame(testChamber);
    playScript(g, [{ op: 'moveTo', col: 5, row: 3 }, { op: 'move', dx: 0, dz: 1, ticks: 120 }]);
    // door at row 4 (z 4000..5000) is closed: stop at 4000 - ACTOR_HALF
    expect(player(g).z).toBe(4000 - PHYS.ACTOR_HALF);

    const c = createGame(crateRoom());
    playScript(c, [{ op: 'move', dx: 1, dz: 0, ticks: 200 }]);
    // crate at (6,2) centre x 6500, half 400 => stop at 6100 - ACTOR_HALF
    expect(player(c).x).toBe(6500 - PHYS.CRATE_HALF - PHYS.ACTOR_HALF);
  });

  it('ramps raise the actor smoothly; ledges cannot be climbed', () => {
    const g = createGame(terrainRoom());
    // spawn (2,2) -> walk east across the ramp at (4,2) onto the platform (height 1)
    playInputs(g, inputs().move(1, 0, 70).build());
    expect(player(g).y).toBe(1000);
    expect(player(g).x).toBeGreaterThan(5000);

    // Ledge: (6,4) is height 0, (6,3) is the platform (height 1) — walking north must stop at the edge.
    const l = createGame(terrainRoom());
    playScript(l, [{ op: 'moveTo', col: 6, row: 4 }]);
    playInputs(l, inputs().move(0, -1, 100).build());
    expect(player(l).y).toBe(0);
    expect(player(l).z).toBe(4000 + PHYS.ACTOR_HALF);

    // And from the platform the drop is also refused (no walking off ledges).
    const d = createGame(terrainRoom());
    playInputs(d, inputs().move(1, 0, 70).build());
    playScript(d, [{ op: 'moveTo', col: 6, row: 3 }]);
    playInputs(d, inputs().move(0, 1, 100).build());
    expect(player(d).y).toBe(1000);
    expect(player(d).z).toBe(4000 - PHYS.ACTOR_HALF);
  });

  it('actors pass through each other (no actor-actor collision)', () => {
    const g = createGame(crateRoom());
    playInputs(g, inputs().wait(10).build());
    g.commitLoopAndRewind();
    playInputs(g, inputs().move(1, 0, 10).build());
    const st = g.getState();
    expect(st.actors[1]!.x - st.actors[0]!.x).toBe(10 * PHYS.ACTOR_SPEED);
  });
});

describe('interactions & ownership', () => {
  it('pickup then drop places the crate cell-snapped on the faced cell', () => {
    const g = createGame(crateRoom());
    const res = playScript(g, [
      { op: 'moveTo', col: 5, row: 2 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'moveTo', col: 5, row: 3 },
      { op: 'face', dir: 2 },
      { op: 'interact' },
    ]);
    expect(res.events.filter((e) => e.type === 'pickup').length).toBe(1);
    expect(res.events.filter((e) => e.type === 'drop').length).toBe(1);
    const crate = g.getState().entities['crate-1']!;
    expect(crate.carriedBy).toBeNull();
    expect([crate.x, crate.z]).toEqual([5500, 4500]);
    expect(player(g).carrying).toBeNull();
  });

  it('dropping into a wall fails with interactFailed and keeps ownership', () => {
    const g = createGame(crateRoom());
    const res = playScript(g, [
      { op: 'moveTo', col: 5, row: 2 },
      { op: 'face', dir: 1 },
      { op: 'interact' },
      { op: 'moveTo', col: 5, row: 1 },
      { op: 'face', dir: 0 },
      { op: 'interact' },
    ]);
    const fail = res.events.find((e) => e.type === 'interactFailed');
    expect(fail).toBeDefined();
    expect(player(g).carrying).toBe('crate-1');
    expect(g.getState().entities['crate-1']!.carriedBy).toBe('player');
  });

  it('crate on a plate opens the wired door; the crate-room solution completes', () => {
    const level = crateRoom();
    const g = createGame(level);
    const res = playScript(g, level.solution[0]!);
    expect(res.events.some((e) => e.type === 'plateDown')).toBe(true);
    expect(res.events.some((e) => e.type === 'doorOpen')).toBe(true);
    expect(res.completed).toBe(true);
  });

  it('door never closes on an occupant', () => {
    const g = createGame(testChamber);
    // Hold plate with an echo for a while, then leave; player stands in the doorway when it wants to close.
    playScript(g, [{ op: 'moveTo', col: 8, row: 3 }, { op: 'wait', ticks: 150 }, { op: 'moveTo', col: 6, row: 3 }]);
    g.commitLoopAndRewind();
    const res = playScript(g, [{ op: 'moveTo', col: 5, row: 3 }, { op: 'moveTo', col: 5, row: 4 }, { op: 'wait', ticks: 200 }]);
    expect(res.events.some((e) => e.type === 'doorBlocked')).toBe(true);
    const door = g.getState().entities['door-a']!;
    expect(door.kind).toBe('door');
    if (door.kind === 'door') {
      expect(door.state.open).toBe(false);
      expect(door.state.blocked).toBe(true);
      expect(door.state.progress).toBeGreaterThanOrEqual(800);
    }
  });
});

describe('registry extensibility', () => {
  it('a new kind can be registered without engine edits; isSolidFor filters per actor', async () => {
    const { createDefaultRegistry } = await import('../../gameplay/entities');
    const { openRoom } = await import('../../testing/harness/fixtures');
    const registry = createDefaultRegistry();
    registry.register<'temporalGate'>({
      kind: 'temporalGate',
      reset: () => ({ open: false, phaseTicks: 0 }),
      isSolid: () => true,
      isSolidFor: (_e, def, actor) => !(def.config.allows === 'echoes' && actor.kind === 'echo'),
    });
    // gate directly east of spawn (7,6) at (9,6)
    const level = openRoom(2, [{ id: 'gate', kind: 'temporalGate', col: 9, row: 6, config: { allows: 'echoes' } }]);
    const g = createGame(level, { registry });
    playInputs(g, inputs().move(1, 0, 120).build());
    g.commitLoopAndRewind();
    playInputs(g, inputs().move(1, 0, 120).build());
    const st = g.getState();
    expect(st.actors[0]!.x).toBe(7500 + 120 * PHYS.ACTOR_SPEED); // echo passed through the gate
    expect(st.actors[1]!.x).toBe(9000 - PHYS.ACTOR_HALF); // player blocked
  });
});

describe('clipped surface overrides (round 2, QA-1)', () => {
  it('a clipped override covers only its extent; the rest of the cell keeps the tile surface; first covering wins', () => {
    const rt = { tileAt: () => ({ kind: 'void', h: 0 }) } as unknown as Parameters<typeof cellSurfaceAtPoint>[0];
    const clip = { minX: 2300, maxX: 3300, minZ: 1000, maxZ: 2000 };
    const ov = new Map([[cellKey(2, 1), [{ y: 0, clip }, { y: 500, clip: null }]], [cellKey(3, 1), [{ y: 0, clip }]]]);
    expect(cellSurfaceAtPoint(rt, ov, 2, 1, 2400, 1500)).toBe(0);
    expect(cellSurfaceAtPoint(rt, ov, 2, 1, 2200, 1500)).toBe(500); // second override covers the rest of the cell
    expect(cellSurfaceAtPoint(rt, ov, 3, 1, 3299, 1500)).toBe(0);
    expect(cellSurfaceAtPoint(rt, ov, 3, 1, 3300, 1500)).toBeNull(); // half-open edge -> void tile
    expect(cellSurfaceAtPoint(rt, ov, 3, 1, 9000, 1500)).toBeNull(); // point clamped into the cell (x=3999)
    expect(cellSurfaceAtPoint(rt, ov, 3, 1, 0, 1500)).toBe(0); // clamped to x=3000, inside the clip
    expect(overrideAtPoint(ov, 4, 1, 4500, 1500)).toBeNull();
    expect(isFlatCell(rt, ov, 2, 1)).toBe(true); // centre 2500 covered
    expect(isFlatCell(rt, ov, 3, 1)).toBe(false); // centre 3500 not covered
  });
});

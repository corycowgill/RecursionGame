import { describe, expect, it } from 'vitest';
import { testChamber } from '../../levels/definitions/test-chamber';
import { parseGrid, T } from './grid';

describe('render grid parsing', () => {
  const g = parseGrid(testChamber);

  it('mirrors the authored tiles and heights', () => {
    expect(g.width).toBe(11);
    expect(g.height).toBe(10);
    expect(g.tileAt(0, 0).kind).toBe('wall');
    expect(g.tileAt(2, 2).kind).toBe('pillar');
    expect(g.tileAt(5, 6)).toEqual({ kind: 'ramp', h: 0, dir: 2 });
    expect(g.tileAt(5, 7)).toEqual({ kind: 'floor', h: 1 });
    expect(g.tileAt(4, 8).kind).toBe('railing');
  });

  it('treats out-of-bounds as void and exposes walkability', () => {
    expect(g.tileAt(-1, 3).kind).toBe('void');
    expect(g.tileAt(99, 99).kind).toBe('void');
    expect(g.isWalkable(5, 4)).toBe(true); // door cell is floor
    expect(g.isWalkable(5, 6)).toBe(true); // ramp
    expect(g.isWalkable(2, 2)).toBe(false); // pillar
    expect(g.isWall(0, 4)).toBe(true);
  });

  it('converts cells to world metres (1 tile = 2 m)', () => {
    expect(T).toBe(2);
    expect(g.cellCenter(5, 7)).toEqual({ x: 11, y: 2, z: 15 });
    expect(g.bounds).toMatchObject({ minX: 0, maxX: 22, minZ: 0, maxZ: 20, maxLevel: 1 });
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { characterGeometries } from './characterModel';

const tris = (g: Record<string, THREE.BufferGeometry>): number =>
  Object.values(g).reduce((n, x) => n + (x.index ? x.index.count : x.getAttribute('position').count) / 3, 0);

describe('character LOD (mobile preset)', () => {
  it('LOD 1 keeps every bone (same draw calls) with far fewer triangles, and does not disturb LOD 0', () => {
    const full = characterGeometries(0);
    const fullTris = tris(full);
    const lod = characterGeometries(1);
    expect(Object.keys(lod).sort()).toEqual(Object.keys(full).sort());
    expect(tris(lod)).toBeLessThan(fullTris * 0.65);
    expect(characterGeometries(0)).toBe(full); // cached, rebuilt neither way
    expect(tris(characterGeometries(0))).toBe(fullTris);
    for (const g of Object.values(lod)) {
      expect(g.getAttribute('color')).toBeTruthy();
      expect(g.getAttribute('paint')).toBeTruthy();
    }
  });
});

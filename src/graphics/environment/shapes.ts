import * as THREE from 'three';
import type { Dir4 } from '../../engine/contracts';
import { T } from './grid';

/** Shared environment constants, the wall-face frame and the procedural arch shapes (kit, decor, backdrop, entities). */

export const WALL_H = 4; // tall wall height (metres)
export const DX = [0, 1, 0, -1] as const;
export const DZ = [-1, 0, 1, 0] as const;

/** A wall face: origin at the face centre at floor level; u runs along the face, w points out of it. */
export interface Face {
  x: number;
  y: number;
  z: number;
  d: Dir4;
  /** Rotation that maps local +x to `u` and local +z to the outward normal. */
  rotY: number;
  at(u: number, v: number, w: number): { x: number; y: number; z: number };
  arr(u: number, v: number, w: number): [number, number, number];
}

export function face(cx: number, base: number, cz: number, d: Dir4): Face {
  const nx = DX[d]!;
  const nz = DZ[d]!;
  const x = cx + nx * (T / 2);
  const z = cz + nz * (T / 2);
  // local +x -> (cos θ, -sin θ) with θ = atan2(nx, nz)  =>  along = (nz, -nx)
  const ax = nz;
  const az = -nx;
  const at = (u: number, v: number, w: number) => ({ x: x + ax * u + nx * w, y: base + v, z: z + az * u + nz * w });
  return { x, y: base, z, d, rotY: Math.atan2(nx, nz), at, arr: (u, v, w) => [x + ax * u + nx * w, base + v, z + az * u + nz * w] };
}

/** Arch frame: rectangle with a round-topped opening, extruded. Origin at bottom centre, faces +z. */
export function archFrameGeometry(w: number, h: number, depth: number): THREE.ExtrudeGeometry {
  const outer = new THREE.Shape();
  const r = w / 2;
  outer.moveTo(-r - 0.22, 0);
  outer.lineTo(r + 0.22, 0);
  outer.lineTo(r + 0.22, h - r);
  outer.absarc(0, h - r, r + 0.22, 0, Math.PI, false);
  outer.lineTo(-r - 0.22, 0);
  const hole = new THREE.Path();
  hole.moveTo(-r + 0.05, 0.12);
  hole.lineTo(r - 0.05, 0.12);
  hole.lineTo(r - 0.05, h - r);
  hole.absarc(0, h - r, r - 0.05, 0, Math.PI, false);
  hole.lineTo(-r + 0.05, 0.12);
  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 24 });
}

export function archPaneGeometry(w: number, h: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, 24);
}

/**
 * Gateway arch: an inverted-U band (no sill) of thickness `t` around a round-topped opening of half-width `r`
 * springing at `spring`. Origin at the bottom centre, extruded symmetrically through `depth` along z.
 */
export function archGateGeometry(r: number, spring: number, t: number, depth: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-r - t, 0);
  s.lineTo(-r - t, spring);
  s.absarc(0, spring, r + t, Math.PI, 0, true);
  s.lineTo(r + t, 0);
  s.lineTo(r, 0);
  s.lineTo(r, spring);
  s.absarc(0, spring, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1, curveSegments: 20 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function cellHash(c: number, r: number): number {
  let h = Math.imul((c * 73856093) ^ (r * 19349663), 2654435761);
  h ^= h >>> 13;
  return Math.imul(h, 1274126177) >>> 0;
}

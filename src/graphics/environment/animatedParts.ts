import * as THREE from 'three';
import type { MaterialLibrary } from '../materials/library';
import { PALETTE } from '../materials/palette';

/**
 * AnimatedParts — the moving counterpart of the Batcher. Gears, piston rods, clock hands and clockwork rings are
 * registered as (geometry, material, base matrix, local matrix, motion) and emitted as one InstancedMesh per
 * geometry/material pair; `update(t)` recomposes the instance matrices each frame:
 *
 *   world = base · slide(t) · spin(t) · local     spin about the base z axis, slide along a base-frame axis
 *
 * So every gear in a level is one draw call, and ten backdrop rings cost four. Purely cosmetic (render time only).
 */
export interface PartMotion {
  /** Radians per second about the base frame's z axis. */
  spin?: number;
  /** Slide along `axis` (base frame): offset = amp · sin(t · speed + phase). */
  slide?: { axis: THREE.Vector3; amp: number; speed: number };
  phase?: number;
}

interface Entry {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  items: { base: THREE.Matrix4; local: THREE.Matrix4; motion: PartMotion; color: THREE.Color | null }[];
  mesh?: THREE.InstancedMesh;
}

const IDENT = new THREE.Matrix4();

export class AnimatedParts {
  private readonly entries = new Map<string, Entry>();
  private readonly ids = new WeakMap<object, number>();
  private nextId = 1;
  private readonly m = new THREE.Matrix4();
  private readonly r = new THREE.Matrix4();
  private lastT = Number.NaN;
  readonly group = new THREE.Group();

  private idOf(o: object): number {
    let id = this.ids.get(o);
    if (!id) {
      id = this.nextId++;
      this.ids.set(o, id);
    }
    return id;
  }

  get size(): number {
    return this.entries.size;
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, base: THREE.Matrix4, local: THREE.Matrix4 = IDENT, motion: PartMotion = {}, color?: THREE.Color): void {
    const key = `${this.idOf(geo)}|${this.idOf(mat)}`;
    let e = this.entries.get(key);
    if (!e) {
      e = { geo, mat, items: [] };
      this.entries.set(key, e);
    }
    e.items.push({ base: base.clone(), local: local.clone(), motion, color: color ? color.clone() : null });
  }

  /** Creates the instanced meshes (call once, after all add() calls). */
  build(name: string): THREE.Group {
    this.group.name = name;
    for (const e of this.entries.values()) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.items.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (e.items.some((i) => i.color)) {
        const white = new THREE.Color(1, 1, 1);
        e.items.forEach((it, i) => im.setColorAt(i, it.color ?? white));
      }
      im.castShadow = false;
      im.receiveShadow = false;
      // instances move every frame: never cull on a stale bounding sphere
      im.frustumCulled = false;
      e.mesh = im;
      this.group.add(im);
    }
    this.update(0);
    return this.group;
  }

  update(t: number): void {
    if (t === this.lastT) return;
    this.lastT = t;
    for (const e of this.entries.values()) {
      const im = e.mesh;
      if (!im) continue;
      e.items.forEach((it, i) => {
        const mo = it.motion;
        const ph = mo.phase ?? 0;
        this.m.copy(it.base);
        if (mo.slide) {
          const s = Math.sin(t * mo.slide.speed + ph) * mo.slide.amp;
          this.m.multiply(this.r.makeTranslation(mo.slide.axis.x * s, mo.slide.axis.y * s, mo.slide.axis.z * s));
        }
        if (mo.spin) this.m.multiply(this.r.makeRotationZ(t * mo.spin + ph));
        this.m.multiply(it.local);
        im.setMatrixAt(i, this.m);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const e of this.entries.values()) e.mesh?.dispose();
    this.entries.clear();
  }
}

/** Shared unit geometries for rings and gears (owned by whoever creates them; see `ClockworkGeometry.dispose`). */
export class ClockworkGeometry {
  readonly torus = new THREE.TorusGeometry(1, 0.045, 10, 96);
  readonly innerTorus = new THREE.TorusGeometry(1, 0.026, 8, 96);
  readonly tooth = new THREE.BoxGeometry(0.035, 0.1, 0.05);
  readonly spoke = new THREE.BoxGeometry(1.56, 0.025, 0.025);
  private readonly gears = new Map<number, THREE.ExtrudeGeometry>();

  /** Unit-radius spur gear (faces +z, thickness 0.18) with `teeth` teeth and a spoked hub. */
  gear(teeth: number): THREE.ExtrudeGeometry {
    let g = this.gears.get(teeth);
    if (!g) {
      const s = new THREE.Shape();
      const ro = 1;
      const ri = 0.84;
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const step = (Math.PI * 2) / teeth;
        const pts: [number, number][] = [
          [ri, a0],
          [ro, a0 + step * 0.18],
          [ro, a0 + step * 0.5],
          [ri, a0 + step * 0.68],
        ];
        pts.forEach(([r, a], k) => {
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0 && k === 0) s.moveTo(x, y);
          else s.lineTo(x, y);
        });
      }
      s.closePath();
      // lightening holes between the spokes + axle hole
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const h = new THREE.Path();
        h.absarc(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.18, 0, Math.PI * 2, true);
        s.holes.push(h);
      }
      const axle = new THREE.Path();
      axle.absarc(0, 0, 0.1, 0, Math.PI * 2, true);
      s.holes.push(axle);
      g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1, curveSegments: 6 });
      g.translate(0, 0, -0.09);
      this.gears.set(teeth, g);
    }
    return g;
  }

  dispose(): void {
    for (const g of [this.torus, this.innerTorus, this.tooth, this.spoke, ...this.gears.values()]) g.dispose();
    this.gears.clear();
  }
}

/**
 * Registers a rotating brass clockwork ring (toothed outer ring + counter-rotating glowing inner ring with
 * spokes) into `parts`. `base` places the ring centre; the ring lies in the base frame's xy plane (faces +z).
 */
export function addClockworkRing(
  parts: AnimatedParts,
  geo: ClockworkGeometry,
  lib: MaterialLibrary,
  base: THREE.Matrix4,
  radius: number,
  opts: { teeth?: number; speed?: number; glow?: number; color?: number; phase?: number } = {},
): void {
  const ts = opts.teeth ?? 1;
  const speed = opts.speed ?? 0.12;
  const phase = opts.phase ?? 0;
  const outer: PartMotion = { spin: speed, phase };
  const inner: PartMotion = { spin: -speed * 1.7, phase: -phase };
  const o = new THREE.Object3D();
  o.scale.setScalar(radius);
  o.updateMatrix();
  parts.add(geo.torus, lib.brass, base, o.matrix, outer);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    o.position.set(Math.cos(a) * radius * (1 + 0.06 * ts), Math.sin(a) * radius * (1 + 0.06 * ts), 0);
    o.rotation.set(0, 0, a - Math.PI / 2);
    o.scale.setScalar(radius * ts * (i % 4 === 0 ? 1.5 : 1));
    o.updateMatrix();
    parts.add(geo.tooth, lib.brass, base, o.matrix, outer);
  }
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.scale.setScalar(radius * 0.78);
  o.updateMatrix();
  parts.add(geo.innerTorus, lib.glow, base, o.matrix, inner, lib.glowColor(opts.color ?? PALETTE.cyan, opts.glow ?? 1.8));
  for (let i = 0; i < 3; i++) {
    o.rotation.set(0, 0, (i / 3) * Math.PI);
    o.scale.setScalar(radius);
    o.updateMatrix();
    parts.add(geo.spoke, lib.brass, base, o.matrix, inner);
  }
}

/** Matrix helper: position + Euler (YXZ) + uniform or vector scale. */
export function placeMatrix(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | THREE.Vector3 = 1): THREE.Matrix4 {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz, 'YXZ');
  if (typeof s === 'number') o.scale.setScalar(s);
  else o.scale.copy(s);
  o.updateMatrix();
  return o.matrix.clone();
}

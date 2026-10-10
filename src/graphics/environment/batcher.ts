import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Batcher — collects (geometry, material, transform) placements and emits one InstancedMesh per unique
 * geometry/material pair. The modular kit and backdrop place hundreds of pieces; this keeps the whole static
 * level to a few dozen draw calls. Geometries registered through `geo()` are owned and disposed with it.
 */
export class Batcher {
  private readonly entries = new Map<
    string,
    { geo: THREE.BufferGeometry; mat: THREE.Material; mats: THREE.Matrix4[]; colors: (THREE.Color | null)[]; cast: boolean; receive: boolean }
  >();
  private readonly geos = new Map<string, THREE.BufferGeometry>();
  private readonly tmp = new THREE.Object3D();
  private readonly scaleTmp = new THREE.Vector3();
  private ids = new WeakMap<object, number>();
  private nextId = 1;

  private idOf(o: object): number {
    let id = this.ids.get(o);
    if (!id) {
      id = this.nextId++;
      this.ids.set(o, id);
    }
    return id;
  }

  /** Cached geometry by key (created on first use). */
  geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geos.get(key);
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }

  box(w: number, h: number, d: number, worldUv = 0): THREE.BufferGeometry {
    return this.geo(`box:${w}:${h}:${d}:${worldUv}`, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (worldUv > 0) applyWorldUV(g, worldUv);
      return g;
    });
  }

  rbox(w: number, h: number, d: number, r: number, seg = 2, worldUv = 0): THREE.BufferGeometry {
    return this.geo(`rbox:${w}:${h}:${d}:${r}:${seg}:${worldUv}`, () => {
      const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
      if (worldUv > 0) applyWorldUV(g, worldUv);
      return g;
    });
  }

  cyl(rt: number, rb: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
    return this.geo(`cyl:${rt}:${rb}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  }

  /**
   * Unit-cube part scaled per instance. Every plain box of one material shares a single InstancedMesh
   * (one draw call), whatever its size. Three.js corrects instanced normals for non-uniform scale.
   */
  cube(
    mat: THREE.Material,
    pos: { x: number; y: number; z: number },
    sx: number,
    sy: number,
    sz: number,
    o: { rotY?: number; rotX?: number; rotZ?: number; cast?: boolean; receive?: boolean; color?: THREE.Color } = {},
  ): void {
    this.add(this.box(1, 1, 1), mat, pos, { ...o, scale: this.scaleTmp.set(sx, sy, sz) });
  }

  /** Unit-cylinder part (radius r, height h, along local y) scaled per instance; shares one mesh per material. */
  tube(
    mat: THREE.Material,
    pos: { x: number; y: number; z: number },
    r: number,
    h: number,
    o: { rotY?: number; rotX?: number; rotZ?: number; cast?: boolean; receive?: boolean; color?: THREE.Color; seg?: number } = {},
  ): void {
    this.add(this.cyl(1, 1, 1, o.seg ?? 12), mat, pos, { ...o, scale: this.scaleTmp.set(r, h, r) });
  }

  add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: { x: number; y: number; z: number },
    o: { rotY?: number; rotX?: number; rotZ?: number; scale?: THREE.Vector3 | number; cast?: boolean; receive?: boolean; color?: THREE.Color } = {},
  ): void {
    const t = this.tmp;
    t.position.set(pos.x, pos.y, pos.z);
    t.rotation.set(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0, 'YXZ');
    if (o.scale === undefined) t.scale.set(1, 1, 1);
    else if (typeof o.scale === 'number') t.scale.setScalar(o.scale);
    else t.scale.copy(o.scale);
    t.updateMatrix();
    this.addMatrix(geo, mat, t.matrix, o.cast ?? true, o.receive ?? true, o.color);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, cast = true, receive = true, color?: THREE.Color): void {
    const key = `${this.idOf(geo)}|${this.idOf(mat)}|${cast}|${receive}`;
    let e = this.entries.get(key);
    if (!e) {
      e = { geo, mat, mats: [], colors: [], cast, receive };
      this.entries.set(key, e);
    }
    e.mats.push(m.clone());
    e.colors.push(color ? color.clone() : null);
  }

  /** Emits the batched meshes into a group. Can be called once. */
  build(name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    for (const e of this.entries.values()) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.mats.length);
      e.mats.forEach((m, i) => im.setMatrixAt(i, m));
      if (e.colors.some((c) => c)) {
        const white = new THREE.Color(1, 1, 1);
        e.colors.forEach((c, i) => im.setColorAt(i, c ?? white));
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = e.cast;
      im.receiveShadow = e.receive;
      im.computeBoundingSphere();
      im.frustumCulled = true;
      g.add(im);
    }
    this.entries.clear();
    return g;
  }

  dispose(): void {
    for (const g of this.geos.values()) g.dispose();
    this.geos.clear();
    this.entries.clear();
    this.ids = new WeakMap();
  }
}

/** Planar world-scale UVs chosen per vertex by dominant normal axis (tiles textures across modules). */
export function applyWorldUV(g: THREE.BufferGeometry, metresPerRepeat: number): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  if (!pos || !nor || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z * Math.sign(nor.getX(i) || 1);
      v = y;
    } else {
      u = -x * Math.sign(nor.getZ(i) || 1);
      v = y;
    }
    uv.setXY(i, u / metresPerRepeat, v / metresPerRepeat);
  }
  uv.needsUpdate = true;
}

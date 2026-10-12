import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Dir4, EntityDefinition, EntityView, LevelDefinition, SimEvent, SimView } from '../../engine/contracts';
import type { MaterialLibrary } from '../materials/library';
import type { RenderGrid } from '../environment/grid';

/** Hooks an entity visual may use to emit one-shot render effects (never touches the simulation). */
export interface VfxSink {
  sparks(pos: THREE.Vector3, color: number, count: number, opts?: { speed?: number; up?: number; size?: number; life?: number }): void;
  ring(pos: THREE.Vector3, color: number, radius: number, opts?: { vertical?: THREE.Vector3; life?: number; width?: number }): void;
}

export interface EntityVisualContext {
  lib: MaterialLibrary;
  def: EntityDefinition;
  grid: RenderGrid;
  vfx: VfxSink;
  quality: { particles: number; lights: boolean };
  /** (round 6, optional) The whole level, for visuals that draw towards wired targets (chrono relay conduit). */
  level?: LevelDefinition;
}

export interface EntityFrame<E extends EntityView = EntityView> {
  e: E;
  /** Previous tick's view of the same entity (for interpolation), or the current one. */
  prev: E;
  alpha: number;
  dt: number;
  time: number;
  /** Interpolated world-space anchor (cell centre at base height, or the carry anchor when carried). */
  pos: THREE.Vector3;
  state: SimView;
}

export interface EntityVisual {
  readonly root: THREE.Object3D;
  /** Optional point light owned by the visual (counted against the light budget). */
  readonly light?: THREE.PointLight;
  update(f: EntityFrame): void;
  /** (round 6, optional) One-shot feedback for events naming this entity (valvePass, shatter, relayEmit ...). */
  onEvent?(ev: SimEvent, state: SimView): void;
  dispose(): void;
}

/** Model rotation for a Dir4 facing (models are authored facing +z / south). */
export function facingRotY(f: Dir4 | undefined): number {
  return Math.PI - (f ?? 0) * (Math.PI / 2);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Tracks geometries/materials created by a visual so dispose() is one call. */
export class Parts {
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  mat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  rbox(w: number, h: number, d: number, r = 0.05, seg = 2): RoundedBoxGeometry {
    return this.geo(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
  }

  box(w: number, h: number, d: number): THREE.BoxGeometry {
    return this.geo(new THREE.BoxGeometry(w, h, d));
  }

  cyl(rt: number, rb: number, h: number, seg = 24, open = false): THREE.CylinderGeometry {
    return this.geo(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  }

  torus(r: number, tube: number, seg = 32, rad = 8): THREE.TorusGeometry {
    return this.geo(new THREE.TorusGeometry(r, tube, rad, seg));
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }

  /** Marks an object as animated so mergeStatic leaves it alone. */
  dyn<O extends THREE.Object3D>(o: O): O {
    o.userData['dynamic'] = true;
    return o;
  }

  /**
   * Draw-call reduction: inside every group, leaf meshes that share a material (and are not marked dynamic)
   * are baked into one mesh. Groups themselves are preserved, so animated sub-assemblies keep working.
   */
  mergeStatic(node: THREE.Object3D): void {
    const byKey = new Map<string, THREE.Mesh[]>();
    for (const c of node.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.children.length || m.userData['dynamic'] || Array.isArray(m.material)) continue;
      const g = m.geometry;
      const key = `${(m.material as THREE.Material).uuid}|${m.castShadow}|${m.renderOrder}|${g.index ? 1 : 0}|${Object.keys(g.attributes).sort().join(',')}`;
      const list = byKey.get(key) ?? [];
      list.push(m);
      byKey.set(key, list);
    }
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      this.geos.push(merged);
      const first = list[0]!;
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.renderOrder = first.renderOrder;
      for (const m of list) node.remove(m);
      node.add(mesh);
    }
    for (const c of [...node.children]) if (c.children.length) this.mergeStatic(c);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

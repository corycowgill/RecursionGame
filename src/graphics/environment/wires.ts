import * as THREE from 'three';
import type { LevelDefinition, SimView } from '../../engine/contracts';
import { PALETTE } from '../materials/palette';
import { createWireMaterial } from '../shaders/fx';
import type { RenderGrid } from './grid';
import { T } from './grid';

/**
 * Signal wiring made visible: each Wire becomes a thin floor-inlaid light strip routed (x then z) from the
 * source entity to the consumer, following each cell's floor height. Unpowered strips idle as a faint
 * teal line; powered strips brighten and stream pulses toward the target, so players can read
 * "this plate drives that door" at a glance. Inverted wires use coral when idle-powered.
 */
interface WireVisual {
  from: string;
  invert: boolean;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  power: number;
}

export class WireNetwork {
  readonly group = new THREE.Group();
  private readonly wires: WireVisual[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(level: LevelDefinition, grid: RenderGrid) {
    this.group.name = 'wires';
    const defs = new Map(level.entities.map((e) => [e.id, e]));
    const laneUse = new Map<string, number>();
    level.wires.forEach((w) => {
      const a = defs.get(w.from);
      const b = defs.get(w.to);
      if (!a || !b) return;
      const cells: { col: number; row: number }[] = [];
      let c = a.col;
      let r = a.row;
      cells.push({ col: c, row: r });
      while (c !== b.col) {
        c += Math.sign(b.col - c);
        cells.push({ col: c, row: r });
      }
      while (r !== b.row) {
        r += Math.sign(b.row - r);
        cells.push({ col: c, row: r });
      }
      if (cells.length < 2) return;
      // lateral lane offset so parallel wires don't overlap
      const key = `${Math.min(a.col, b.col)}:${Math.min(a.row, b.row)}`;
      const lane = laneUse.get(key) ?? 0;
      laneUse.set(key, lane + 1);
      const offset = (lane - 0) * 0.16 + 0.32;
      const pts: THREE.Vector3[] = cells.map(({ col, row }) => {
        const t = grid.tileAt(col, row);
        const h = t.kind === 'void' ? (a.level ?? 0) : t.kind === 'ramp' ? t.h + 0.5 : t.h;
        return new THREE.Vector3((col + 0.5) * T, h * T + 0.012, (row + 0.5) * T);
      });
      const geo = stripGeometry(pts, 0.13, offset);
      this.geos.push(geo);
      const invert = !!w.invert;
      const mat = createWireMaterial(invert ? PALETTE.coral : PALETTE.teal, invert ? PALETTE.coral : PALETTE.teal);
      mat.uniforms['uLength']!.value = (cells.length - 1) * T;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.wires.push({ from: w.from, invert, mesh, mat, power: 0 });
    });
  }

  update(state: SimView, dt: number, time: number): void {
    for (const w of this.wires) {
      const on = state.signals[w.from] === true;
      w.power += ((on ? 1 : 0) - w.power) * (1 - Math.exp(-10 * dt));
      w.mat.uniforms['uPower']!.value = w.power;
      w.mat.uniforms['uTime']!.value = time;
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const w of this.wires) w.mat.dispose();
    this.group.removeFromParent();
  }
}

/** Flat ribbon along a polyline (uv.x = normalised length, uv.y across), offset sideways by `offset`. */
function stripGeometry(pts: THREE.Vector3[], width: number, offset: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let total = 0;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    total += pts[i]!.distanceTo(pts[i - 1]!);
    lens.push(total);
  }
  // shorten ends so the strip starts/stops just outside the entity footprints
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const dir = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const centre = p.clone().addScaledVector(side, offset);
    if (i === 0) centre.addScaledVector(dir, 0.6);
    if (i === pts.length - 1) centre.addScaledVector(dir, -0.6);
    for (const s of [-1, 1]) {
      const v = centre.clone().addScaledVector(side, (s * width) / 2);
      pos.push(v.x, v.y, v.z);
      uv.push((lens[i] ?? 0) / Math.max(1e-3, total), s < 0 ? 0 : 1);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

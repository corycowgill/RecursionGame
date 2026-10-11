import * as THREE from 'three';
import type { DecorDefinition, Dir4, LevelDefinition } from '../../engine/contracts';
import type { MaterialLibrary } from '../materials/library';
import { PALETTE } from '../materials/palette';
import { hologramTexture } from '../materials/textures';
import { AnimatedParts, ClockworkGeometry, addClockworkRing, type PartMotion } from './animatedParts';
import type { Batcher } from './batcher';
import { abyssBeamMaterial, hologramMaterial, windowPaneMaterial } from './fxMaterials';
import { T, type RenderGrid } from './grid';
import type { KitLight } from './kit';
import { DX, DZ, WALL_H, archFrameGeometry, archGateGeometry, archPaneGeometry, face, type Face } from './shapes';

/**
 * Authored decor (LevelDefinition.decor — purely visual, never read by the simulation).
 *
 *   conduit            brass pipe trunk with glowing couplers up a wall face
 *   observationWindow  arched window(s) looking out into the facility; params.width spans neighbouring faces
 *   ring               rotating clockwork ring (params.scale, params.color)
 *   lamp               brass lamp post with a warm light
 *   archway            monumental gateway around a door / gate (params.indicators = lamps on the keystone)
 *   machinery          params.variant: gears · clockwork · pistons · winch · archive · optics · vault ·
 *                      recursionEngine · coreDynamo. Mounted on the wall it is authored against, raised on a
 *                      pylon out of the abyss when authored on a void cell, or set into a glazed floor pit when
 *                      authored on an open floor cell (never obstructs walkable space).
 *   hologram           projected text panel (params.text, params.color) over a floor projector
 *   banner             hanging cloth banner on a wall, or on a freestanding brass frame when no wall is behind
 *   abyssLight         a column of coloured light rising from the depths with a bobbing lantern (params.color)
 *
 * Unknown types are ignored (forward compatible with level designers' data). Everything static is batched,
 * moving parts go through AnimatedParts, and the effect quads share instanced materials, so decor adds a fixed
 * handful of draw calls per level however much of it is authored.
 */

export interface DecorContext {
  grid: RenderGrid;
  b: Batcher;
  lib: MaterialLibrary;
  extra: THREE.Group;
  animated: { object: THREE.Object3D; update(t: number): void }[];
  lights: KitLight[];
  owned: THREE.BufferGeometry[];
  ownedMats: THREE.Material[];
  ownedTex: THREE.Texture[];
  parts: AnimatedParts;
  clock: ClockworkGeometry;
  /** True for tall (back/side) chamber walls. */
  isTallWall(col: number, row: number): boolean;
}

/** Cells/faces claimed by decor, so the kit leaves them clear (no wall module behind a window, no floor tile over a pit). */
export interface DecorPlan {
  /** `${col},${row},${dir}` wall faces covered by wall-mounted decor. */
  wallFaces: Set<string>;
  /** `${col},${row}` floor cells opened into a machinery pit. */
  pits: Set<string>;
}

const COLORS: Record<string, number> = {
  gold: PALETTE.gold,
  cyan: PALETTE.cyan,
  teal: PALETTE.teal,
  violet: PALETTE.violet,
  coral: PALETTE.coral,
  white: PALETTE.white,
};
const colorParam = (d: DecorDefinition, fallback: number): number => {
  const c = d.params?.['color'];
  return typeof c === 'string' ? (COLORS[c] ?? fallback) : fallback;
};

type Mount = { kind: 'wall'; col: number; row: number; facing: Dir4 } | { kind: 'pylon' | 'pit' | 'free'; col: number; row: number; facing: Dir4 };

/** Where a wall-hung piece goes: the authored wall cell, else the tall wall directly behind the authored floor cell. */
function wallMount(d: DecorDefinition, grid: RenderGrid, isTallWall: (c: number, r: number) => boolean): { col: number; row: number; facing: Dir4 } | null {
  const f = (d.facing ?? 2) as Dir4;
  const base = (d.level ?? Math.max(0, grid.tileAt(d.col, d.row).h)) * T;
  const tallEnough = (c: number, r: number) => isTallWall(c, r) && grid.tileAt(c, r).h * T + WALL_H > base + 2.5;
  if (tallEnough(d.col, d.row)) return { col: d.col, row: d.row, facing: f };
  const bc = d.col - DX[f]!;
  const br = d.row - DZ[f]!;
  if (!grid.isWall(d.col, d.row) && tallEnough(bc, br)) return { col: bc, row: br, facing: f };
  return null;
}

function machineryMount(d: DecorDefinition, grid: RenderGrid, isTallWall: (c: number, r: number) => boolean): Mount {
  const w = wallMount(d, grid, isTallWall);
  if (w) return { kind: 'wall', ...w };
  const f = (d.facing ?? 2) as Dir4;
  const k = grid.tileAt(d.col, d.row).kind;
  if (k === 'void') return { kind: 'pylon', col: d.col, row: d.row, facing: f };
  if (k === 'floor') return { kind: 'pit', col: d.col, row: d.row, facing: f };
  return { kind: 'free', col: d.col, row: d.row, facing: f };
}

export function planDecor(level: LevelDefinition, grid: RenderGrid, isTallWall: (c: number, r: number) => boolean): DecorPlan {
  const wallFaces = new Set<string>();
  const pits = new Set<string>();
  for (const d of level.decor ?? []) {
    if (d.type === 'conduit' || d.type === 'observationWindow' || d.type === 'banner') {
      const m = wallMount(d, grid, isTallWall);
      if (!m) continue;
      wallFaces.add(`${m.col},${m.row},${m.facing}`);
      if (d.type === 'observationWindow') for (const [c, r] of windowSpan(d, m, grid, isTallWall)) wallFaces.add(`${c},${r},${m.facing}`);
    } else if (d.type === 'machinery') {
      const m = machineryMount(d, grid, isTallWall);
      if (m.kind === 'wall') wallFaces.add(`${m.col},${m.row},${m.facing}`);
      else if (m.kind === 'pit') pits.add(`${m.col},${m.row}`);
    }
  }
  return { wallFaces, pits };
}

/** Wall cells an observation window spans (params.width, centred, only along faces that stay valid). */
function windowSpan(d: DecorDefinition, m: { col: number; row: number; facing: Dir4 }, grid: RenderGrid, isTallWall: (c: number, r: number) => boolean): [number, number][] {
  const width = typeof d.params?.['width'] === 'number' ? Math.max(1, Math.min(5, Math.round(d.params['width']))) : 1;
  const ac = m.facing % 2 === 0 ? 1 : 0;
  const ar = m.facing % 2 === 0 ? 0 : 1;
  const out: [number, number][] = [];
  const half = Math.floor(width / 2);
  for (let i = -half; i <= width - 1 - half; i++) {
    const c = m.col + ac * i;
    const r = m.row + ar * i;
    const fc = c + DX[m.facing]!;
    const fr = r + DZ[m.facing]!;
    const k = grid.tileAt(fc, fr).kind;
    if (isTallWall(c, r) && (k === 'floor' || k === 'ramp' || k === 'pillar' || k === 'railing')) out.push([c, r]);
  }
  return out;
}

export class DecorBuilder {
  private readonly beams: { m: THREE.Matrix4; color: THREE.Color }[] = [];
  private readonly cones: { m: THREE.Matrix4; color: THREE.Color }[] = [];
  private obsPane: THREE.ShaderMaterial | null = null;
  private readonly uniforms: THREE.IUniform[] = [];

  constructor(private readonly ctx: DecorContext) {}

  add(d: DecorDefinition): void {
    switch (d.type) {
      case 'conduit':
        return this.conduit(d);
      case 'observationWindow':
        return this.observationWindow(d);
      case 'ring':
        return this.ring(d);
      case 'lamp':
        return this.lamp(d);
      case 'archway':
        return this.archway(d);
      case 'machinery':
        return this.machinery(d);
      case 'hologram':
        return this.hologram(d);
      case 'banner':
        return this.banner(d);
      case 'abyssLight':
        return this.abyssLight(d);
      default:
        // Unknown decor types are ignored (forward compatible with level designers' data).
        return;
    }
  }

  /** Emits the instanced effect meshes collected while adding decor. Call once after the last add(). */
  finish(): void {
    const { extra, owned, ownedMats, animated } = this.ctx;
    const emit = (list: { m: THREE.Matrix4; color: THREE.Color }[], geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, order: number) => {
      if (list.length === 0) {
        geo.dispose();
        mat.dispose();
        return;
      }
      owned.push(geo);
      ownedMats.push(mat);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((x, i) => {
        im.setMatrixAt(i, x.m);
        im.setColorAt(i, x.color);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.renderOrder = order;
      extra.add(im);
      this.uniforms.push(mat.uniforms['uTime']!);
    };
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    beamGeo.translate(0, 0.5, 0);
    emit(this.beams, beamGeo, abyssBeamMaterial(), 4);
    const coneGeo = new THREE.CylinderGeometry(1, 0.22, 1, 24, 1, true);
    coneGeo.translate(0, 0.5, 0);
    emit(this.cones, coneGeo, abyssBeamMaterial(), 6);
    const uniforms = this.uniforms;
    if (uniforms.length)
      animated.push({
        object: extra,
        update(t) {
          for (const u of uniforms) u.value = t;
        },
      });
  }

  // ------------------------------------------------------------------ helpers

  private base(d: DecorDefinition, col = d.col, row = d.row): number {
    return (d.level ?? Math.max(0, this.ctx.grid.tileAt(col, row).h)) * T;
  }

  /** A face-like frame for free-standing pieces: origin at (x, y, z), local +z = facing, +x along. */
  private frame(x: number, y: number, z: number, f: Dir4): Face {
    const fc = face(x, y, z, f);
    // `face` offsets to the cell edge; undo it so the origin is exactly (x, y, z)
    const nx = DX[f]!;
    const nz = DZ[f]!;
    const ax = nz;
    const az = -nx;
    return {
      ...fc,
      x,
      y,
      z,
      at: (u, v, w) => ({ x: x + ax * u + nx * w, y: y + v, z: z + az * u + nz * w }),
      arr: (u, v, w) => [x + ax * u + nx * w, y + v, z + az * u + nz * w],
    };
  }

  /** Base matrix at a frame-local point (gears/rings face the frame's +w direction). */
  private mAt(f: Face, u: number, v: number, w: number, extraRot?: THREE.Matrix4): THREE.Matrix4 {
    const p = f.at(u, v, w);
    const m = new THREE.Matrix4().makeRotationY(f.rotY);
    if (extraRot) m.multiply(extraRot);
    return m.setPosition(p.x, p.y, p.z);
  }

  private gear(f: Face, u: number, v: number, w: number, r: number, teeth: number, spin: number, phase = 0, mat?: THREE.Material): void {
    const { parts, clock, lib, b } = this.ctx;
    parts.add(clock.gear(teeth), mat ?? lib.brass, this.mAt(f, u, v, w), new THREE.Matrix4().makeScale(r, r, r), { spin, phase });
    b.tube(lib.gunmetalDark, f.at(u, v, w + 0.02), r * 0.16, 0.2 * r + 0.08, { rotY: f.rotY, rotX: Math.PI / 2, cast: false, seg: 10 });
  }

  // ------------------------------------------------------------------ authored types

  private conduit(d: DecorDefinition): void {
    const { grid, b, lib } = this.ctx;
    const m = wallMount(d, grid, this.ctx.isTallWall);
    const col = m?.col ?? d.col;
    const row = m?.row ?? d.row;
    const f = face((col + 0.5) * T, this.base(d, col, row), (row + 0.5) * T, (m?.facing ?? d.facing ?? 2) as Dir4);
    const color = lib.glowColor(colorParam(d, PALETTE.cyan), 2.6);
    for (const u of [-0.32, 0, 0.32]) {
      b.tube(lib.brass, f.at(u, WALL_H / 2, 0.1), 0.07, WALL_H - 0.4, { seg: 10 });
      for (const y of [0.9, 2.1, 3.3]) {
        b.tube(lib.gunmetalDark, f.at(u, y, 0.1), 0.1, 0.12, { seg: 10 });
        b.tube(lib.glow, f.at(u, y + 0.1, 0.1), 0.085, 0.05, { seg: 10, cast: false, receive: false, color });
      }
    }
    b.cube(lib.gunmetalDark, f.at(0, 0.3, 0.1), 0.95, 0.24, 0.3, { rotY: f.rotY });
    b.cube(lib.gunmetalDark, f.at(0, WALL_H - 0.35, 0.1), 0.95, 0.2, 0.3, { rotY: f.rotY });
  }

  private observationWindow(d: DecorDefinition): void {
    const { grid, b, lib, lights, isTallWall } = this.ctx;
    const m = wallMount(d, grid, isTallWall);
    if (!m) return;
    const scale = typeof d.params?.['scale'] === 'number' ? d.params['scale'] : 1;
    const span = windowSpan(d, m, grid, isTallWall);
    if (span.length === 0) span.push([m.col, m.row]);
    const WH = 2.9;
    const frameGeo = b.geo('obsFrame', () => archFrameGeometry(1.4, 3.15, 0.2));
    const paneGeo = b.geo('obsPane', () => archPaneGeometry(1.36, WH));
    if (!this.obsPane) {
      this.obsPane = windowPaneMaterial(WH);
      this.ctx.ownedMats.push(this.obsPane);
      this.uniforms.push(this.obsPane.uniforms['uTime']!);
    }
    const base = this.base(d, m.col, m.row);
    for (const [c, r] of span) {
      const f = face((c + 0.5) * T, base, (r + 0.5) * T, m.facing);
      const s = new THREE.Vector3(scale, scale, 1);
      b.add(paneGeo, lib.gunmetalDark, f.at(0, 0.38, 0.004), { rotY: f.rotY, cast: false, scale: new THREE.Vector3(scale * 1.12, scale * 1.05, 1) });
      b.add(paneGeo, this.obsPane, f.at(0, 0.45, 0.012), { rotY: f.rotY, cast: false, receive: false, scale: s, color: new THREE.Color(1.1, 1.1, 1.1) });
      b.add(frameGeo, lib.brass, f.at(0, 0.3, 0.02), { rotY: f.rotY, scale: s });
      // mullion cross
      b.cube(lib.brass, f.at(0, 0.45 + WH * 0.45 * scale, 0.04), 0.05, WH * 0.9 * scale, 0.05, { rotY: f.rotY, cast: false });
      b.cube(lib.brass, f.at(0, 0.45 + WH * 0.55 * scale, 0.04), 1.36 * scale, 0.05, 0.05, { rotY: f.rotY, cast: false });
    }
    // continuous sill + cornice tie the arcade together
    const first = span[0]!;
    const last = span[span.length - 1]!;
    const mid = face(((first[0] + last[0]) / 2 + 0.5) * T, base, ((first[1] + last[1]) / 2 + 0.5) * T, m.facing);
    const len = span.length * T - 0.3;
    b.cube(lib.brass, mid.at(0, 0.32, 0.14), len, 0.1, 0.26, { rotY: mid.rotY });
    b.cube(lib.gunmetalDark, mid.at(0, 0.16, 0.08), len, 0.22, 0.14, { rotY: mid.rotY, cast: false });
    lights.push({ position: new THREE.Vector3(...mid.arr(0, 2, 1.2)), color: 0x6fc8ff, intensity: 5, distance: 8, priority: 2 });
  }

  private ring(d: DecorDefinition): void {
    const { grid, parts, clock, lib } = this.ctx;
    const facing = (d.facing ?? 2) as Dir4;
    const scale = typeof d.params?.['scale'] === 'number' ? d.params['scale'] : 1;
    const cx = (d.col + 0.5) * T;
    const cz = (d.row + 0.5) * T;
    const base = this.base(d);
    const color = colorParam(d, PALETTE.cyan);
    // Rings never sit between the camera and the play space: on the camera side of the chamber they hang
    // horizontally beneath the platform, otherwise they stand upright behind the wall line.
    const front = d.row >= grid.height / 2;
    let m: THREE.Matrix4;
    if (front) m = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(cx, base - 2.4, cz + 1.5);
    else m = new THREE.Matrix4().makeRotationY(facing % 2 === 0 ? 0 : Math.PI / 2).setPosition(cx + DX[facing]! * -2.5, base + WALL_H + 2.4 * scale, cz + DZ[facing]! * -2.5);
    addClockworkRing(parts, clock, lib, m, 2.2 * scale, { teeth: 0.6, speed: 0.12, color, phase: d.col * 0.7 });
  }

  private lamp(d: DecorDefinition): void {
    const { b, lib, lights } = this.ctx;
    const cx = (d.col + 0.5) * T;
    const cz = (d.row + 0.5) * T;
    const base = this.base(d);
    b.tube(lib.gunmetalDark, { x: cx, y: base + 0.1, z: cz }, 0.16, 0.2, { seg: 10 });
    b.add(b.cyl(0.05, 0.08, 2.4, 8), lib.brass, { x: cx, y: base + 1.2, z: cz });
    b.tube(lib.brass, { x: cx, y: base + 2.33, z: cz }, 0.2, 0.05, { seg: 12, cast: false });
    b.add(b.cyl(0.18, 0.12, 0.3, 12), lib.glow, { x: cx, y: base + 2.5, z: cz }, { cast: false, receive: false, color: lib.glowColor(PALETTE.warmLamp, 3) });
    b.tube(lib.brass, { x: cx, y: base + 2.67, z: cz }, 0.21, 0.05, { seg: 12, cast: false });
    lights.push({ position: new THREE.Vector3(cx, base + 2.6, cz), color: PALETTE.warmLamp, intensity: 6, distance: 7, priority: 1 });
  }

  private archway(d: DecorDefinition): void {
    const { b, lib } = this.ctx;
    const facing = (d.facing ?? 0) as Dir4;
    const cx = (d.col + 0.5) * T;
    const cz = (d.row + 0.5) * T;
    const base = this.base(d);
    const rotY = facing % 2 === 0 ? 0 : Math.PI / 2;
    // local frame: x across the opening, z through it
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const at = (lx: number, ly: number, lz: number) => ({ x: cx + lx * cos + lz * sin, y: base + ly, z: cz - lx * sin + lz * cos });
    const R = 1.3;
    const SPRING = 2.3;
    const TH = 0.32;
    const DEPTH = 0.7;
    b.add(b.geo('archGate', () => archGateGeometry(R, SPRING, TH, DEPTH)), lib.ivory, at(0, 0, 0), { rotY, color: new THREE.Color(0.8, 0.8, 0.8) });
    b.add(b.geo('archGateInner', () => archGateGeometry(R - 0.01, SPRING, 0.06, DEPTH + 0.06)), lib.brass, at(0, 0, 0), { rotY, cast: false });
    b.add(b.geo('archGateOuter', () => archGateGeometry(R + TH - 0.05, SPRING, 0.07, DEPTH + 0.06)), lib.brass, at(0, 0, 0), { rotY, cast: false });
    const gold = lib.glowColor(PALETTE.gold, 2.2);
    for (const s of [-1, 1]) {
      const lx = s * (R + TH / 2);
      b.cube(lib.gunmetalDark, at(lx, 0.26, 0), TH + 0.22, 0.52, DEPTH + 0.2);
      b.cube(lib.brass, at(lx, 0.55, 0), TH + 0.26, 0.07, DEPTH + 0.24, { cast: false });
      b.cube(lib.gunmetal, at(lx, 1.45, 0), TH - 0.1, 1.5, DEPTH + 0.04, { cast: false });
      b.cube(lib.brass, at(lx, SPRING, 0), TH + 0.16, 0.1, DEPTH + 0.14, { cast: false });
      for (const z of [-1, 1]) b.cube(lib.glow, at(lx, 1.45, z * (DEPTH / 2 + 0.025)), 0.04, 1.2, 0.012, { cast: false, receive: false, color: gold });
    }
    // keystone + indicator lamps (one per authored indicator, on both faces)
    const ky = SPRING + R + TH / 2;
    b.cube(lib.brass, at(0, ky, 0), 0.4, TH + 0.2, DEPTH + 0.12);
    b.cube(lib.gunmetalDark, at(0, ky + 0.02, 0), 0.32, 0.2, DEPTH + 0.16, { cast: false });
    const n = typeof d.params?.['indicators'] === 'number' ? Math.max(0, Math.min(3, Math.round(d.params['indicators']))) : 1;
    const cyan = lib.glowColor(PALETTE.cyan, 2.4);
    for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * 0.1;
      for (const z of [-1, 1]) b.cube(lib.glow, at(lx, ky + 0.02, z * (DEPTH / 2 + 0.085)), 0.06, 0.08, 0.01, { cast: false, receive: false, color: cyan });
    }
  }

  private machinery(d: DecorDefinition): void {
    const { grid, b, lib, lights } = this.ctx;
    const mount = machineryMount(d, grid, this.ctx.isTallWall);
    const variant = typeof d.params?.['variant'] === 'string' ? d.params['variant'] : 'gears';
    const f0 = mount.facing;
    const base = this.base(d, mount.col, mount.row);
    const cx = (mount.col + 0.5) * T;
    const cz = (mount.row + 0.5) * T;
    if (mount.kind === 'pit') {
      this.pit(d, variant, cx, base, cz, f0);
      return;
    }
    let f: Face;
    if (mount.kind === 'wall') f = face(cx, base, cz, f0);
    else {
      // pylon out of the abyss (void cell) / free-standing: a backplate column the machine hangs on
      const back = this.frame(cx, base, cz, f0);
      const yTop = mount.kind === 'pylon' ? 3.1 : 3.0;
      const yBot = mount.kind === 'pylon' ? -14 : 0;
      b.cube(lib.gunmetal, back.at(0, (yTop + yBot) / 2, -0.55), 1.3, yTop - yBot, 0.5, { rotY: back.rotY });
      for (const y of mount.kind === 'pylon' ? [-0.25, -3.2, -6.5] : [0.3]) b.cube(lib.brass, back.at(0, y, -0.55), 1.38, 0.12, 0.58, { rotY: back.rotY });
      b.cube(lib.brass, back.at(0, yTop + 0.05, -0.55), 1.42, 0.1, 0.62, { rotY: back.rotY });
      b.cube(lib.glow, back.at(0, -1.6, -0.29), 0.06, 2.4, 0.02, { rotY: back.rotY, cast: false, receive: false, color: lib.glowColor(PALETTE.gold, 1.8) });
      f = this.frame(cx - DX[f0]! * 0.3, base, cz - DZ[f0]! * 0.3, f0);
    }
    this.machine(variant, f, d);
    if (variant === 'coreDynamo' || variant === 'recursionEngine')
      lights.push({ position: new THREE.Vector3(...f.arr(0, 1.8, 1.2)), color: variant === 'coreDynamo' ? PALETTE.cyan : PALETTE.violet, intensity: 4, distance: 6, priority: 1 });
  }

  /** Wall/pylon machine: built on a face frame (u along, v up from the floor, w outward), at most ~0.7 m deep. */
  private machine(variant: string, f: Face, d: DecorDefinition): void {
    const { b, lib, parts, clock } = this.ctx;
    const rotY = f.rotY;
    const cyan = lib.glowColor(colorParam(d, PALETTE.cyan), 2.2);
    const amber = lib.glowColor(PALETTE.gold, 2.0);
    const plate = (w: number, h: number, v: number) => {
      b.cube(lib.gunmetalDark, f.at(0, v, 0.04), w, h, 0.08, { rotY });
      for (const s of [-1, 1]) b.cube(lib.brass, f.at(s * (w / 2 - 0.03), v, 0.07), 0.06, h, 0.06, { rotY, cast: false });
      b.cube(lib.brass, f.at(0, v + h / 2 - 0.03, 0.07), w, 0.06, 0.06, { rotY, cast: false });
      b.cube(lib.brass, f.at(0, v - h / 2 + 0.03, 0.07), w, 0.06, 0.06, { rotY, cast: false });
    };
    switch (variant) {
      case 'gears': {
        plate(1.7, 2.3, 1.75);
        this.gear(f, -0.28, 2.05, 0.2, 0.55, 16, 0.5);
        this.gear(f, 0.42, 1.38, 0.2, 0.36, 11, -0.5 * (0.55 / 0.36), 0.2);
        this.gear(f, 0.38, 2.62, 0.26, 0.24, 8, -0.5 * (0.55 / 0.24), 0.4, lib.gunmetal);
        this.gear(f, -0.45, 1.1, 0.26, 0.2, 8, 0.9, 0.1, lib.gunmetal);
        b.cube(lib.glow, f.at(0, 0.75, 0.085), 1.2, 0.04, 0.02, { rotY, cast: false, receive: false, color: amber });
        break;
      }
      case 'clockwork': {
        plate(1.7, 2.4, 1.8);
        const m = this.mAt(f, 0, 2.0, 0.14);
        b.add(b.cyl(0.72, 0.72, 0.06, 32), lib.ivory, f.at(0, 2.0, 0.11), { rotY, rotX: Math.PI / 2, cast: false });
        parts.add(clock.torus, lib.brass, m, new THREE.Matrix4().makeScale(0.75, 0.75, 1.6));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const big = i % 3 === 0;
          parts.add(b.box(1, 1, 1), lib.gunmetalDark, m, new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeTranslation(0, 0.6, 0)).multiply(new THREE.Matrix4().makeScale(big ? 0.05 : 0.025, big ? 0.14 : 0.08, 0.02)));
        }
        const hand = (len: number, wid: number, spin: number, mat: THREE.Material) =>
          parts.add(b.box(1, 1, 1), mat, m, new THREE.Matrix4().makeTranslation(0, len / 2 - 0.06, 0.03).multiply(new THREE.Matrix4().makeScale(wid, len, 0.025)), { spin });
        hand(0.4, 0.06, -0.08, lib.gunmetalDark);
        hand(0.6, 0.035, -0.9, lib.brass);
        b.cube(lib.glow, f.at(0, 2.0, 0.19), 0.08, 0.08, 0.02, { rotY, cast: false, receive: false, color: cyan });
        this.gear(f, -0.55, 0.95, 0.16, 0.3, 10, 0.7);
        this.gear(f, 0.5, 1.0, 0.16, 0.24, 8, -0.87, 0.3);
        break;
      }
      case 'pistons': {
        b.cube(lib.gunmetal, f.at(0, 0.3, 0.3), 1.5, 0.6, 0.55, { rotY });
        b.cube(lib.gunmetal, f.at(0, 2.75, 0.3), 1.5, 0.35, 0.55, { rotY });
        b.cube(lib.brass, f.at(0, 0.62, 0.3), 1.56, 0.06, 0.6, { rotY, cast: false });
        b.cube(lib.glow, f.at(0, 0.32, 0.58), 0.9, 0.12, 0.02, { rotY, cast: false, receive: false, color: amber });
        [-0.48, 0, 0.48].forEach((u, i) => {
          b.tube(lib.gunmetalDark, f.at(u, 1.0, 0.3), 0.16, 0.8, { seg: 12 });
          b.tube(lib.brass, f.at(u, 1.42, 0.3), 0.19, 0.06, { seg: 12, cast: false });
          const base = new THREE.Matrix4().makeTranslation(f.at(u, 1.95, 0.3).x, f.at(u, 1.95, 0.3).y, f.at(u, 1.95, 0.3).z);
          const motion: PartMotion = { slide: { axis: new THREE.Vector3(0, 1, 0), amp: 0.28, speed: 1.6 }, phase: i * 2.1 };
          parts.add(b.cyl(1, 1, 1, 12), lib.brass, base, new THREE.Matrix4().makeScale(0.075, 1.1, 0.075), motion);
          parts.add(b.box(1, 1, 1), lib.gunmetalDark, base, new THREE.Matrix4().makeTranslation(0, -0.5, 0).multiply(new THREE.Matrix4().makeScale(0.22, 0.12, 0.22)), motion);
        });
        break;
      }
      case 'winch': {
        plate(1.6, 2.0, 1.5);
        for (const s of [-1, 1]) b.cube(lib.gunmetal, f.at(s * 0.62, 1.6, 0.3), 0.12, 0.9, 0.5, { rotY });
        const drum = this.mAt(f, 0, 1.6, 0.42, new THREE.Matrix4().makeRotationY(Math.PI / 2));
        parts.add(b.cyl(1, 1, 1, 18), lib.brass, drum, new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.36, 1.05, 0.36)), { spin: 0.8 });
        for (let i = 0; i < 6; i++)
          parts.add(b.box(1, 1, 1), lib.gunmetalDark, drum, new THREE.Matrix4().makeRotationZ((i / 6) * Math.PI * 2).multiply(new THREE.Matrix4().makeTranslation(0, 0.37, 0)).multiply(new THREE.Matrix4().makeScale(0.05, 0.03, 1.07)), { spin: 0.8 });
        b.cube(lib.gunmetalDark, f.at(0.2, 0.62, 0.62), 0.03, 1.6, 0.03, { rotY, cast: false });
        this.gear(f, 0.62, 2.35, 0.2, 0.3, 10, -1.2);
        break;
      }
      case 'archive': {
        b.cube(lib.gunmetal, f.at(0, 1.6, 0.22), 1.6, 3.2, 0.44, { rotY });
        b.cube(lib.brass, f.at(0, 3.24, 0.24), 1.7, 0.08, 0.5, { rotY, cast: false });
        b.cube(lib.brass, f.at(0, 0.08, 0.24), 1.7, 0.16, 0.5, { rotY, cast: false });
        for (let row = 0; row < 5; row++)
          for (let col = 0; col < 3; col++) {
            const u = (col - 1) * 0.48;
            const v = 0.55 + row * 0.56;
            b.cube(lib.ivory, f.at(u, v, 0.45), 0.42, 0.46, 0.03, { rotY, cast: false, color: new THREE.Color(0.86, 0.85, 0.82) });
            b.cube(lib.brass, f.at(u, v + 0.12, 0.47), 0.16, 0.035, 0.02, { rotY, cast: false });
            if ((row * 3 + col + d.col) % 4 !== 0) b.cube(lib.glow, f.at(u - 0.12, v - 0.13, 0.47), 0.1, 0.03, 0.01, { rotY, cast: false, receive: false, color: (row + col) % 3 === 0 ? amber : cyan });
          }
        break;
      }
      case 'optics': {
        plate(1.5, 1.6, 1.9);
        b.cube(lib.gunmetal, f.at(0, 1.9, 0.3), 0.2, 0.5, 0.5, { rotY });
        b.tube(lib.brass, f.at(0, 2.15, 0.5), 0.17, 1.3, { rotY, rotZ: Math.PI / 2, seg: 16 });
        for (const s of [-1, 1]) {
          b.tube(lib.gunmetalDark, f.at(s * 0.62, 2.15, 0.5), 0.21, 0.1, { rotY, rotZ: Math.PI / 2, seg: 16 });
          b.tube(lib.glow, f.at(s * 0.68, 2.15, 0.5), 0.15, 0.02, { rotY, rotZ: Math.PI / 2, seg: 16, cast: false, receive: false, color: cyan });
        }
        addClockworkRing(parts, clock, lib, this.mAt(f, 0, 2.15, 0.5, new THREE.Matrix4().makeRotationY(Math.PI / 2)), 0.36, { teeth: 0.8, speed: 0.6, color: colorParam(d, PALETTE.cyan) });
        break;
      }
      case 'vault': {
        plate(2.0, 2.4, 1.8);
        b.add(b.cyl(0.92, 0.92, 0.22, 40), lib.gunmetal, f.at(0, 1.85, 0.18), { rotY, rotX: Math.PI / 2 });
        const m = this.mAt(f, 0, 1.85, 0.3);
        parts.add(clock.torus, lib.brass, m, new THREE.Matrix4().makeScale(0.92, 0.92, 2.5));
        for (let i = 0; i < 3; i++) parts.add(clock.spoke, lib.brass, m, new THREE.Matrix4().makeRotationZ((i / 3) * Math.PI).multiply(new THREE.Matrix4().makeScale(0.42, 3, 3)), { spin: 0.15 });
        parts.add(b.cyl(1, 1, 1, 16), lib.brass, m, new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.13, 0.12, 0.13)), { spin: 0.15 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          b.cube(lib.brass, f.at(Math.cos(a) * 0.78, 1.85 + Math.sin(a) * 0.78, 0.3), 0.08, 0.08, 0.06, { rotY, cast: false });
        }
        b.cube(lib.glow, f.at(0, 0.75, 0.09), 0.5, 0.05, 0.02, { rotY, cast: false, receive: false, color: lib.glowColor(PALETTE.coral, 1.8) });
        break;
      }
      case 'recursionEngine': {
        const violet = colorParam(d, PALETTE.violet);
        for (const s of [-1, 1]) {
          b.cube(lib.gunmetal, f.at(s * 0.9, 1.7, 0.35), 0.24, 3.4, 0.5, { rotY });
          for (const y of [0.4, 3.0]) b.cube(lib.brass, f.at(s * 0.9, y, 0.35), 0.3, 0.1, 0.56, { rotY, cast: false });
        }
        b.cube(lib.gunmetal, f.at(0, 3.45, 0.35), 2.1, 0.22, 0.56, { rotY });
        addClockworkRing(parts, clock, lib, this.mAt(f, 0, 1.9, 0.55), 0.78, { teeth: 0.7, speed: 0.25, color: violet, glow: 2.2 });
        addClockworkRing(parts, clock, lib, this.mAt(f, 0, 1.9, 0.55, new THREE.Matrix4().makeRotationY(1.0)), 0.56, { teeth: 0.6, speed: -0.4, color: violet, glow: 2.2 });
        addClockworkRing(parts, clock, lib, this.mAt(f, 0, 1.9, 0.55, new THREE.Matrix4().makeRotationX(1.2)), 0.36, { teeth: 0.5, speed: 0.7, color: PALETTE.cyan, glow: 2.2 });
        b.add(b.geo('engineCore', () => new THREE.OctahedronGeometry(0.16)), lib.glow, f.at(0, 1.9, 0.55), { rotY, cast: false, receive: false, color: lib.glowColor(violet, 3) });
        break;
      }
      case 'coreDynamo':
      default: {
        this.dynamo(f, 0.55, d);
        break;
      }
    }
  }

  /** Standing dynamo: gunmetal core with glowing coil bands inside a rotating brass cage. */
  private dynamo(f: Face, w: number, d: DecorDefinition): void {
    const { b, lib, parts, clock } = this.ctx;
    const cyan = lib.glowColor(colorParam(d, PALETTE.cyan), 2.4);
    b.tube(lib.gunmetalDark, f.at(0, 0.18, w), 0.62, 0.36, { seg: 20 });
    b.tube(lib.brass, f.at(0, 0.38, w), 0.6, 0.06, { seg: 20, cast: false });
    b.tube(lib.gunmetal, f.at(0, 1.6, w), 0.36, 2.4, { seg: 18 });
    for (let i = 0; i < 6; i++) b.tube(lib.glow, f.at(0, 0.8 + i * 0.32, w), 0.385, 0.07, { seg: 18, cast: false, receive: false, color: cyan });
    b.tube(lib.brass, f.at(0, 2.86, w), 0.5, 0.14, { seg: 20 });
    b.add(b.cyl(0.12, 0.42, 0.3, 16), lib.gunmetalDark, f.at(0, 3.08, w));
    const top = this.mAt(f, 0, 1.6, w, new THREE.Matrix4().makeRotationX(Math.PI / 2));
    addClockworkRing(parts, clock, lib, top, 0.62, { teeth: 0.6, speed: 0.5, color: colorParam(d, PALETTE.cyan) });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      parts.add(b.box(1, 1, 1), lib.brass, top, new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0).multiply(new THREE.Matrix4().makeScale(0.05, 0.05, 2.3)), { spin: 0.5 });
    }
  }

  /** Floor pit (machinery authored on open floor): the slab is replaced by a glazed, brass-framed pit. */
  private pit(d: DecorDefinition, variant: string, cx: number, base: number, cz: number, f0: Dir4): void {
    const { b, lib, parts, clock } = this.ctx;
    const half = T / 2 - 0.02;
    const depth = 1.1;
    // pit walls + floor
    for (const s of [-1, 1]) {
      b.cube(lib.gunmetalDark, { x: cx + s * (half - 0.05), y: base - depth / 2, z: cz }, 0.1, depth, half * 2, { cast: false });
      b.cube(lib.gunmetalDark, { x: cx, y: base - depth / 2, z: cz + s * (half - 0.05) }, half * 2, depth, 0.1, { cast: false });
    }
    b.cube(lib.gunmetal, { x: cx, y: base - depth, z: cz }, half * 2, 0.1, half * 2, { cast: false });
    // brass rim + glass cover
    for (const s of [-1, 1]) {
      b.cube(lib.brass, { x: cx + s * (half - 0.06), y: base - 0.02, z: cz }, 0.12, 0.06, half * 2, { cast: false });
      b.cube(lib.brass, { x: cx, y: base - 0.02, z: cz + s * (half - 0.06) }, half * 2, 0.06, 0.12, { cast: false });
    }
    b.cube(lib.glass, { x: cx, y: base - 0.03, z: cz }, half * 2 - 0.2, 0.02, half * 2 - 0.2, { cast: false });
    const glowCol = colorParam(d, variant === 'recursionEngine' ? PALETTE.violet : PALETTE.cyan);
    // under-glow lining
    for (const s of [-1, 1]) b.cube(lib.glow, { x: cx + s * (half - 0.11), y: base - 0.3, z: cz }, 0.02, 0.05, half * 2 - 0.25, { cast: false, receive: false, color: lib.glowColor(glowCol, 1.6) });
    const flat = (x: number, y: number, z: number) => new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, y, z);
    if (variant === 'coreDynamo' || variant === 'recursionEngine' || variant === 'optics' || variant === 'clockwork') {
      // horizontal rings spinning in the pit, glowing core
      addClockworkRing(parts, clock, lib, flat(cx, base - 0.45, cz), 0.7, { teeth: 0.6, speed: 0.4, color: glowCol, glow: 2.2 });
      addClockworkRing(parts, clock, lib, flat(cx, base - 0.7, cz), 0.48, { teeth: 0.5, speed: -0.7, color: PALETTE.gold, glow: 2 });
      b.tube(lib.gunmetal, { x: cx, y: base - 0.75, z: cz }, 0.22, 0.6, { seg: 16, cast: false });
      for (let i = 0; i < 3; i++) b.tube(lib.glow, { x: cx, y: base - 0.95 + i * 0.18, z: cz }, 0.235, 0.05, { seg: 16, cast: false, receive: false, color: lib.glowColor(glowCol, 2.6) });
    } else {
      // meshing gears lying flat
      const g = (x: number, z: number, r: number, teeth: number, spin: number, mat: THREE.Material) => parts.add(clock.gear(teeth), mat, flat(cx + x, base - 0.5, cz + z), new THREE.Matrix4().makeScale(r, r, r), { spin });
      const along = f0 % 2 === 0 ? 1 : 0;
      g(-0.32 * along, -0.32 * (1 - along), 0.5, 16, 0.5, lib.brass);
      g(0.4 * along, 0.4 * (1 - along), 0.34, 11, -0.5 * (0.5 / 0.34), lib.brass);
      g(0.38 * (1 - along) + 0.1 * along, 0.38 * along, 0.22, 8, 0.9, lib.gunmetal);
    }
  }

  private hologram(d: DecorDefinition): void {
    const { b, lib, extra, owned, ownedMats, ownedTex, clock } = this.ctx;
    const cx = (d.col + 0.5) * T;
    const cz = (d.row + 0.5) * T;
    const base = this.base(d);
    const color = colorParam(d, PALETTE.cyan);
    // flush projector disc (walkable)
    b.tube(lib.gunmetalDark, { x: cx, y: base + 0.015, z: cz }, 0.46, 0.03, { seg: 24, cast: false });
    b.add(clock.torus, lib.brass, { x: cx, y: base + 0.03, z: cz }, { rotX: Math.PI / 2, scale: new THREE.Vector3(0.44, 0.44, 0.6), cast: false });
    b.tube(lib.glow, { x: cx, y: base + 0.035, z: cz }, 0.2, 0.012, { seg: 20, cast: false, receive: false, color: lib.glowColor(color, 1.3) });
    // text panel facing the camera side (south), tilted back toward the iso camera
    const text = typeof d.params?.['text'] === 'string' ? d.params['text'] : '';
    const tex = hologramTexture(text);
    const mat = hologramMaterial(tex, color);
    const geo = new THREE.PlaneGeometry(3.4, 0.85);
    owned.push(geo);
    ownedMats.push(mat);
    ownedTex.push(tex);
    const panel = new THREE.Mesh(geo, mat);
    panel.position.set(cx, base + 2.45, cz);
    panel.rotation.x = -0.45;
    panel.renderOrder = 7;
    extra.add(panel);
    this.uniforms.push(mat.uniforms['uTime']!);
    // projection cone from the disc (narrow end) up to the panel (wide end)
    this.cones.push({
      m: new THREE.Matrix4().compose(new THREE.Vector3(cx, base + 0.05, cz), new THREE.Quaternion(), new THREE.Vector3(1.55, 2.0, 0.45)),
      color: new THREE.Color(color).multiplyScalar(0.8),
    });
  }

  private banner(d: DecorDefinition): void {
    const { grid, b, lib, isTallWall } = this.ctx;
    const geo = b.geo('banner', () => new THREE.PlaneGeometry(1.0, 2.0));
    const m = wallMount(d, grid, isTallWall);
    const facing = (d.facing ?? 2) as Dir4;
    const base = this.base(d);
    if (m) {
      const f = face((m.col + 0.5) * T, base, (m.row + 0.5) * T, m.facing);
      b.add(geo, lib.banner, f.at(0, 2.55, 0.07), { rotY: f.rotY, cast: false });
      b.cube(lib.brass, f.at(0, 3.6, 0.09), 1.3, 0.06, 0.06, { rotY: f.rotY, cast: false });
      for (const s of [-1, 1]) {
        b.cube(lib.brass, f.at(s * 0.68, 3.6, 0.09), 0.1, 0.1, 0.1, { rotY: f.rotY, cast: false });
        b.cube(lib.gunmetalDark, f.at(s * 0.55, 3.6, 0.04), 0.06, 0.12, 0.08, { rotY: f.rotY, cast: false });
      }
      return;
    }
    // freestanding brass frame at the back edge of the cell
    const cx = (d.col + 0.5) * T - DX[facing]! * (T / 2 - 0.3);
    const cz = (d.row + 0.5) * T - DZ[facing]! * (T / 2 - 0.3);
    const f = this.frame(cx, base, cz, facing);
    b.add(geo, lib.banner, f.at(0, 2.2, 0), { rotY: f.rotY, cast: true });
    for (const s of [-1, 1]) {
      b.tube(lib.brass, f.at(s * 0.62, 1.65, 0), 0.04, 3.3, { seg: 8 });
      b.cube(lib.gunmetalDark, f.at(s * 0.62, 0.08, 0), 0.24, 0.16, 0.34);
      b.cube(lib.brass, f.at(s * 0.62, 3.34, 0), 0.1, 0.1, 0.1, { cast: false });
    }
    b.cube(lib.brass, f.at(0, 3.22, 0), 1.3, 0.05, 0.05, { rotY: f.rotY, cast: false });
  }

  private abyssLight(d: DecorDefinition): void {
    const { b, lib, parts, clock, lights } = this.ctx;
    const cx = (d.col + 0.5) * T;
    const cz = (d.row + 0.5) * T;
    const base = this.base(d);
    const color = colorParam(d, PALETTE.cyan);
    // light column rising out of the depths, fading before it reaches the platform
    this.beams.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(cx, base - 34, cz), new THREE.Quaternion(), new THREE.Vector3(0.55, 33.4, 0.55)), color: new THREE.Color(color).multiplyScalar(1.4) });
    this.beams.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(cx, base - 34, cz), new THREE.Quaternion(), new THREE.Vector3(1.4, 30, 1.4)), color: new THREE.Color(color).multiplyScalar(0.45) });
    // bobbing lantern: glowing crystal in a brass cage
    const bob: PartMotion = { slide: { axis: new THREE.Vector3(0, 1, 0), amp: 0.35, speed: 0.7 }, phase: d.col + d.row };
    const at = new THREE.Matrix4().makeTranslation(cx, base - 4.5, cz);
    const crystal = b.geo('lanternCrystal', () => new THREE.OctahedronGeometry(1));
    parts.add(crystal, lib.glow, at, new THREE.Matrix4().makeScale(0.28, 0.5, 0.28), bob, lib.glowColor(color, 3.2));
    parts.add(clock.torus, lib.brass, at, new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.5, 0.5, 1.5)), bob);
    parts.add(clock.torus, lib.brass, at, new THREE.Matrix4().makeScale(0.55, 0.55, 1.3), bob);
    lights.push({ position: new THREE.Vector3(cx, base - 1.6, cz), color, intensity: 5, distance: 9, priority: 0 });
  }
}

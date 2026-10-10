import * as THREE from 'three';
import type { DecorDefinition, Dir4, LevelDefinition } from '../../engine/contracts';
import { PALETTE } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { Batcher } from './batcher';
import { parseGrid, T, type RenderGrid } from './grid';

/**
 * Modular environment kit. Builds the static chamber from the tile grid:
 *  floor tiles (beveled, panel seams, brass corners) · foundation slab + platform edges with brass lips and
 *  amber under-glow · wall modules (tall back/side walls with conduits and pilasters, glass partitions,
 *  low front parapets so the iso camera never loses the player) · pillars with gold banding · railings ·
 *  stairs for ramps · decor (conduits, observation arch windows, rings, lamps).
 * Everything static is batched into InstancedMeshes; animated decor is returned separately.
 */

export const WALL_H = 4; // tall wall height (metres)
const PARAPET_H = 0.62;
const PARTITION_H = 1.15;
const PARTITION_GLASS_H = 2.7;
const FOUNDATION_DEPTH = 3.2;

type WallClass = 'back' | 'side' | 'partition' | 'front' | 'none';

export interface KitLight {
  position: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  /** Rough importance for picking which lights survive on low quality. */
  priority: number;
}

export interface BuiltKit {
  group: THREE.Group;
  grid: RenderGrid;
  lights: KitLight[];
  /** Animated decor (rotating rings etc.), updated each frame. */
  animated: { object: THREE.Object3D; update(t: number): void }[];
  /** Wall height class per cell, used by the camera to know where occluders are. */
  wallClass(col: number, row: number): WallClass;
  dispose(): void;
}

const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];

export function buildKit(level: LevelDefinition, lib: MaterialLibrary): BuiltKit {
  const grid = parseGrid(level);
  const b = new Batcher();
  const lights: KitLight[] = [];
  const animated: BuiltKit['animated'] = [];
  const extra = new THREE.Group();
  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];

  const W = grid.width;
  const H = grid.height;

  // ---------- wall classification ----------
  const classes: WallClass[] = new Array(W * H).fill('none');
  const cls = (c: number, r: number): WallClass => (c < 0 || r < 0 || c >= W || r >= H ? 'none' : (classes[r * W + c] ?? 'none'));
  const openish = (c: number, r: number) => {
    const k = grid.tileAt(c, r).kind;
    return k === 'floor' || k === 'ramp' || k === 'railing' || k === 'pillar';
  };
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (!grid.isWall(c, r)) continue;
      const n = openish(c, r - 1);
      const s = openish(c, r + 1);
      const e = openish(c + 1, r);
      const w = openish(c - 1, r);
      let k: WallClass = 'none';
      if (n && s) k = 'partition';
      else if (s) k = 'back';
      else if (n) k = 'front';
      else if (e || w) k = 'side';
      classes[r * W + c] = k;
    }
  // corners / fillers inherit from their row neighbours first (keeps a front row uniformly low)
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (!grid.isWall(c, r) || cls(c, r) !== 'none') continue;
      const touches = [-1, 0, 1].some((dr) => [-1, 0, 1].some((dc) => openish(c + dc, r + dr)));
      if (!touches) continue;
      const rowN = [cls(c - 1, r), cls(c + 1, r)].find((k) => k !== 'none');
      const colN = [cls(c, r - 1), cls(c, r + 1)].find((k) => k !== 'none');
      let k = rowN ?? colN ?? 'side';
      if (k === 'side' && rowN === undefined && colN === undefined) k = 'side';
      classes[r * W + c] = k;
    }

  // ---------- floors + foundation ----------
  const tileGeo = b.rbox(T - 0.035, 0.26, T - 0.035, 0.04, 2);
  const foundGeo = b.box(T, 1, T, 2);
  const lipGeo = b.box(T, 0.09, 0.12);
  const glowStripGeo = b.box(T * 0.94, 0.05, 0.04);
  const edgeStripGeo = b.box(T + 0.01, 0.05, 0.04);
  const underGlowGeo = b.box(T + 0.01, 0.06, 0.05);
  const amber = lib.emissive(PALETTE.gold, 1.7);
  const amberSoft = lib.emissive(PALETTE.warmLamp, 1.0);
  const cyanStrip = lib.emissive(PALETTE.cyan, 1.35);

  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const t = grid.tileAt(c, r);
      if (t.kind === 'void') continue;
      const cx = (c + 0.5) * T;
      const cz = (r + 0.5) * T;
      const top = t.h * T;
      // foundation column (also forms raised plinths)
      const depth = top + FOUNDATION_DEPTH;
      b.add(foundGeo, lib.gunmetal, { x: cx, y: top - 0.2 - depth / 2, z: cz }, { scale: new THREE.Vector3(1, depth, 1), cast: false });
      if (t.kind === 'floor' || t.kind === 'pillar' || t.kind === 'railing') {
        const n = cellHash(c, r);
        const v = 0.9 + (n % 1000) / 1000 * 0.16;
        const warm = ((n >>> 10) % 100) / 100;
        const pick = (n >>> 16) % 20;
        const fmat = pick < 2 ? lib.floorGrate : pick < 4 ? lib.floorEmblem : lib.floorTile;
        b.add(tileGeo, fmat, { x: cx, y: top - 0.13, z: cz }, { cast: false, rotY: ((n >>> 4) % 4) * (Math.PI / 2), color: new THREE.Color(v * (1 + warm * 0.04), v, v * (1 - warm * 0.04)) });
      } else if (t.kind === 'wall' && cls(c, r) === 'none') {
        // solid mass behind the chamber walls: dark exterior deck plating (seen from the overview camera) instead
        // of a bare foundation top
        const n = cellHash(c, r);
        const v = 0.34 + ((n % 1000) / 1000) * 0.08;
        b.add(tileGeo, (n >>> 16) % 7 === 0 ? lib.floorGrate : lib.floorTile, { x: cx, y: top - 0.13, z: cz }, { cast: false, rotY: ((n >>> 4) % 4) * (Math.PI / 2), color: new THREE.Color(v * 0.94, v, v * 1.1) });
      }
      // edges toward void/lower ground: brass lip + amber strip on the exposed face
      for (let d = 0; d < 4; d++) {
        const nc = c + DX[d]!;
        const nr = r + DZ[d]!;
        const nt = grid.tileAt(nc, nr);
        const nTop = nt.kind === 'void' ? -Infinity : nt.kind === 'wall' ? Infinity : nt.h * T + (nt.kind === 'ramp' ? T : 0);
        if (t.kind === 'ramp' && (d === t.dir || d === ((t.dir ?? 0) + 2) % 4)) continue;
        if (nTop >= top - 0.01) continue;
        const ex = cx + DX[d]! * (T / 2 + 0.01);
        const ez = cz + DZ[d]! * (T / 2 + 0.01);
        const rotY = d % 2 === 0 ? 0 : Math.PI / 2;
        b.add(lipGeo, lib.brass, { x: ex, y: top - 0.06, z: ez }, { rotY, cast: false });
        b.add(edgeStripGeo, amber, { x: ex + DX[d]! * 0.02, y: top - 0.32, z: ez + DZ[d]! * 0.02 }, { rotY, cast: false, receive: false });
        if (nt.kind === 'void') {
          b.add(underGlowGeo, amberSoft, { x: ex + DX[d]! * 0.02, y: top - 1.6, z: ez + DZ[d]! * 0.02 }, { rotY, cast: false, receive: false });
        }
      }
    }

  // ---------- walls ----------
  const wallGeo = b.box(T, WALL_H, T, 2);
  const capGeo = b.rbox(T + 0.06, 0.28, T + 0.06, 0.04, 2);
  const capTrimGeo = b.box(T + 0.08, 0.06, T + 0.08);
  const capRailGeo = b.box(T + 0.06, 0.05, 0.3);
  const conduitGeo = b.box(0.07, WALL_H * 0.62, 0.05);
  const conduitHousingGeo = b.rbox(0.24, WALL_H * 0.68, 0.08, 0.03, 2);
  const pilasterGeo = b.rbox(0.38, WALL_H + 0.25, 0.34, 0.05, 2);
  const pilasterBandGeo = b.box(0.42, 0.1, 0.38);
  const pilasterGlowGeo = b.box(0.06, WALL_H * 0.55, 0.02);
  const parapetGeo = b.rbox(T, PARAPET_H, T * 0.9, 0.05, 2, 2);
  const railTopGeo = b.rbox(T + 0.02, 0.08, 0.24, 0.03, 2);
  const partitionGeo = b.rbox(T, PARTITION_H, 0.55, 0.05, 2);
  const glassGeo = b.box(T - 0.12, PARTITION_GLASS_H - PARTITION_H - 0.1, 0.05);
  const mullionGeo = b.box(0.08, PARTITION_GLASS_H - PARTITION_H, 0.1);
  const sconceGeo = b.rbox(0.26, 0.42, 0.16, 0.05, 2);
  const sconceGlowGeo = b.box(0.14, 0.3, 0.05);
  const nicheFrame = b.geo('nicheFrame', () => archFrameGeometry(1.0, 2.5, 0.08));
  const nicheBack = b.geo('nicheBack', () => {
    const g = archPaneGeometry(1.0, 2.5);
    g.translate(0, 0, 0.005);
    return g;
  });

  let lampCounter = 0;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (!grid.isWall(c, r)) continue;
      const k = cls(c, r);
      if (k === 'none') continue;
      const t = grid.tileAt(c, r);
      const cx = (c + 0.5) * T;
      const cz = (r + 0.5) * T;
      const base = t.h * T;
      const open = [0, 1, 2, 3].filter((d) => openish(c + DX[d]!, r + DZ[d]!)) as Dir4[];
      if (k === 'back' || k === 'side') {
        b.add(wallGeo, lib.wallPanel, { x: cx, y: base + WALL_H / 2, z: cz });
        b.add(capGeo, lib.gunmetal, { x: cx, y: base + WALL_H + 0.14, z: cz });
        b.add(capTrimGeo, lib.brass, { x: cx, y: base + WALL_H - 0.02, z: cz }, { cast: false });
        b.add(capRailGeo, lib.brass, { x: cx, y: base + WALL_H + 0.3, z: cz }, { cast: false, rotY: open.some((d) => d % 2 === 1) ? Math.PI / 2 : 0 });
        for (const d of open) {
          const fx = cx + DX[d]! * (T / 2);
          const fz = cz + DZ[d]! * (T / 2);
          const rotY = d % 2 === 0 ? 0 : Math.PI / 2;
          const variant = (c * 7 + r * 3) % 4;
          if (variant === 1 && k === 'back') {
            // arch niche: brass arch frame, dark recess, warm glow at its foot
            b.add(nicheFrame, lib.brass, { x: fx + DX[d]! * 0.01, y: base + 0.35, z: fz + DZ[d]! * 0.01 }, { rotY: d === 2 ? 0 : d === 0 ? Math.PI : d === 1 ? Math.PI / 2 : -Math.PI / 2 });
            b.add(nicheBack, lib.gunmetalDark, { x: fx + DX[d]! * 0.012, y: base + 0.35, z: fz + DZ[d]! * 0.012 }, { rotY: d === 2 ? 0 : d === 0 ? Math.PI : d === 1 ? Math.PI / 2 : -Math.PI / 2, cast: false });
            b.add(sconceGlowGeo, lib.emissive(PALETTE.warmLamp, 2.6), { x: fx + DX[d]! * 0.05, y: base + 2.35, z: fz + DZ[d]! * 0.05 }, { rotY, cast: false, scale: new THREE.Vector3(1.6, 0.5, 1) });
            lights.push({ position: new THREE.Vector3(fx + DX[d]! * 0.6, base + 2.2, fz + DZ[d]! * 0.6), color: PALETTE.warmLamp, intensity: 4, distance: 6, priority: 1 });
          } else if (variant % 2 === 0) {
            b.add(conduitHousingGeo, lib.gunmetalDark, { x: fx + DX[d]! * 0.03, y: base + WALL_H * 0.5, z: fz + DZ[d]! * 0.03 }, { rotY });
            b.add(conduitGeo, cyanStrip, { x: fx + DX[d]! * 0.075, y: base + WALL_H * 0.5, z: fz + DZ[d]! * 0.075 }, { rotY, cast: false, receive: false });
          } else if (lampCounter++ % 2 === 0) {
            // warm sconce
            const sx = fx + DX[d]! * 0.08;
            const sz = fz + DZ[d]! * 0.08;
            b.add(sconceGeo, lib.brass, { x: sx, y: base + 2.6, z: sz }, { rotY });
            b.add(sconceGlowGeo, lib.emissive(PALETTE.warmLamp, 3.2), { x: sx + DX[d]! * 0.07, y: base + 2.6, z: sz + DZ[d]! * 0.07 }, { rotY, cast: false });
            lights.push({
              position: new THREE.Vector3(sx + DX[d]! * 0.5, base + 2.7, sz + DZ[d]! * 0.5),
              color: PALETTE.warmLamp,
              intensity: 6,
              distance: 7,
              priority: 1,
            });
          }
          // pilaster at the module boundary (one per pair to avoid doubling)
          const along = d % 2 === 0 ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
          const nc = c + along.dx;
          const nr = r + along.dz;
          if (grid.isWall(nc, nr) && (cls(nc, nr) === 'back' || cls(nc, nr) === 'side') && openish(nc + DX[d]!, nr + DZ[d]!)) {
            const px = fx + along.dx * (T / 2) + DX[d]! * 0.12;
            const pz = fz + along.dz * (T / 2) + DZ[d]! * 0.12;
            b.add(pilasterGeo, lib.gunmetal, { x: px, y: base + (WALL_H + 0.25) / 2, z: pz }, { rotY });
            for (const y of [0.35, WALL_H - 0.4]) b.add(pilasterBandGeo, lib.brass, { x: px, y: base + y, z: pz }, { rotY });
            b.add(pilasterGlowGeo, lib.emissive(PALETTE.gold, 1.8), { x: px + DX[d]! * 0.175, y: base + WALL_H * 0.5, z: pz + DZ[d]! * 0.175 }, { rotY, cast: false });
          }
        }
      } else if (k === 'front') {
        b.add(parapetGeo, lib.gunmetal, { x: cx, y: base + PARAPET_H / 2, z: cz - T * 0.05 });
        b.add(railTopGeo, lib.brass, { x: cx, y: base + PARAPET_H + 0.02, z: cz - T * 0.4 });
        b.add(glowStripGeo, amber, { x: cx, y: base + PARAPET_H - 0.12, z: cz - T * 0.5 - 0.005 }, { cast: false });
      } else if (k === 'partition') {
        const rotY = open.includes(0) && open.includes(2) ? 0 : Math.PI / 2;
        b.add(partitionGeo, lib.gunmetal, { x: cx, y: base + PARTITION_H / 2, z: cz }, { rotY });
        b.add(railTopGeo, lib.brass, { x: cx, y: base + PARTITION_H + 0.02, z: cz }, { rotY });
        b.add(glassGeo, lib.glass, { x: cx, y: base + (PARTITION_GLASS_H + PARTITION_H) / 2, z: cz }, { rotY, cast: false });
        b.add(railTopGeo, lib.brass, { x: cx, y: base + PARTITION_GLASS_H, z: cz }, { rotY, cast: false });
        b.add(mullionGeo, lib.brass, { x: cx, y: base + (PARTITION_GLASS_H + PARTITION_H) / 2, z: cz }, { rotY, cast: false });
        for (const side of [-1, 1]) {
          const ox = rotY === 0 ? 0 : side * 0.285;
          const oz = rotY === 0 ? side * 0.285 : 0;
          b.add(glowStripGeo, amberSoft, { x: cx + ox, y: base + PARTITION_H - 0.2, z: cz + oz }, { rotY, cast: false, receive: false });
        }
      }
    }

  // ---------- pillars ----------
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const t = grid.tileAt(c, r);
      if (t.kind !== 'pillar') continue;
      addPillar(b, lib, (c + 0.5) * T, t.h * T, (r + 0.5) * T, WALL_H + 0.6);
      lights.push({ position: new THREE.Vector3((c + 0.5) * T, t.h * T + 2.2, (r + 0.5) * T + 0.9), color: PALETTE.gold, intensity: 3, distance: 4.5, priority: 0 });
    }

  // ---------- railings ----------
  const isRailLike = (c: number, r: number) => {
    const k = grid.tileAt(c, r).kind;
    return k === 'railing' || k === 'wall' || k === 'pillar';
  };
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const t = grid.tileAt(c, r);
      if (t.kind !== 'railing') continue;
      const arms = [0, 1, 2, 3].filter((d) => isRailLike(c + DX[d]!, r + DZ[d]!));
      if (arms.length === 0) arms.push(1, 3);
      addRailing(b, lib, (c + 0.5) * T, t.h * T, (r + 0.5) * T, arms);
    }

  // ---------- ramps (stairs) ----------
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const t = grid.tileAt(c, r);
      if (t.kind !== 'ramp') continue;
      addStairs(b, lib, (c + 0.5) * T, t.h * T, (r + 0.5) * T, t.dir ?? 0, ownedGeos);
    }

  // ---------- keel under the chamber (floating platform read) ----------
  {
    const cx = (W * T) / 2;
    const cz = (H * T) / 2;
    const span = Math.max(W, H) * T;
    const keel = b.geo('keel', () => new THREE.CylinderGeometry(span * 0.32, span * 0.04, span * 0.55, 4, 1));
    b.add(keel, lib.gunmetalDark, { x: cx, y: -FOUNDATION_DEPTH - span * 0.275, z: cz }, { rotY: Math.PI / 4, cast: false });
    const ringGeo = b.geo('keelRing', () => new THREE.TorusGeometry(1, 0.05, 6, 48));
    for (const [k, s] of [
      [0.12, 0.26],
      [0.28, 0.17],
    ] as const) {
      b.add(ringGeo, amber, { x: cx, y: -FOUNDATION_DEPTH - span * k, z: cz }, { rotX: Math.PI / 2, scale: span * s, cast: false });
    }
  }

  // ---------- decor ----------
  for (const d of level.decor ?? []) addDecor(d, grid, b, lib, extra, animated, lights, ownedGeos, ownedMats);

  const group = b.build('environment');
  group.add(extra);
  return {
    group,
    grid,
    lights,
    animated,
    wallClass: cls,
    dispose() {
      b.dispose();
      for (const g of ownedGeos) g.dispose();
      for (const m of ownedMats) m.dispose();
    },
  };
}

function addPillar(b: Batcher, lib: MaterialLibrary, x: number, y: number, z: number, h: number): void {
  b.add(b.rbox(1.34, 0.42, 1.34, 0.06, 2), lib.gunmetal, { x, y: y + 0.21, z });
  b.add(b.box(1.22, 0.1, 1.22), lib.brass, { x, y: y + 0.47, z });
  b.add(b.rbox(0.96, h - 1.1, 0.96, 0.06, 2), lib.gunmetal, { x, y: y + 0.52 + (h - 1.1) / 2, z });
  const panelH = h - 1.7;
  for (let d = 0; d < 4; d++) {
    const ox = DX[d]! * 0.49;
    const oz = DZ[d]! * 0.49;
    const rotY = d % 2 === 0 ? 0 : Math.PI / 2;
    b.add(b.rbox(0.62, panelH, 0.04, 0.015, 1), lib.ivory, { x: x + ox, y: y + 0.85 + panelH / 2, z: z + oz }, { rotY });
    b.add(b.box(0.07, panelH - 0.3, 0.03), lib.emissive(PALETTE.gold, 2.6), { x: x + ox * 1.05, y: y + 0.85 + panelH / 2, z: z + oz * 1.05 }, { rotY, cast: false });
  }
  for (const yy of [0.72, h - 0.72]) b.add(b.box(1.08, 0.14, 1.08), lib.brass, { x, y: y + yy, z });
  b.add(b.rbox(1.24, 0.34, 1.24, 0.05, 2), lib.gunmetalDark, { x, y: y + h - 0.45, z });
  b.add(b.rbox(1.4, 0.16, 1.4, 0.04, 2), lib.brass, { x, y: y + h - 0.22, z });
}

function addRailing(b: Batcher, lib: MaterialLibrary, x: number, y: number, z: number, arms: number[]): void {
  const postGeo = b.rbox(0.14, 1.0, 0.14, 0.03, 1);
  b.add(postGeo, lib.brass, { x, y: y + 0.5, z });
  b.add(b.rbox(0.3, 0.14, 0.3, 0.03, 1), lib.gunmetalDark, { x, y: y + 0.07, z });
  for (const d of arms) {
    const len = T / 2;
    const mx = x + (DX[d]! * len) / 2;
    const mz = z + (DZ[d]! * len) / 2;
    const rotY = d % 2 === 0 ? Math.PI / 2 : 0;
    b.add(b.box(len, 0.07, 0.09), lib.brass, { x: mx, y: y + 1.0, z: mz }, { rotY });
    b.add(b.box(len, 0.04, 0.05), lib.brass, { x: mx, y: y + 0.62, z: mz }, { rotY });
    b.add(b.rbox(len, 0.22, 0.16, 0.03, 1), lib.gunmetal, { x: mx, y: y + 0.11, z: mz }, { rotY });
    b.add(b.box(len, 0.035, 0.03), lib.emissive(PALETTE.gold, 2.4), { x: mx, y: y + 0.24, z: mz }, { rotY, cast: false });
    // glass infill
    b.add(b.box(len, 0.36, 0.025), lib.glass, { x: mx, y: y + 0.42, z: mz }, { rotY, cast: false });
  }
}

function addStairs(b: Batcher, lib: MaterialLibrary, x: number, y: number, z: number, dir: Dir4, owned: THREE.BufferGeometry[]): void {
  const steps = 7;
  const run = T / steps;
  const rise = T / steps;
  const rotY = (-dir * Math.PI) / 2;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  // local (lx, lz) -> world, ascent toward local -z
  const at = (lx: number, ly: number, lz: number) => ({ x: x + lx * cos + lz * sin, y: y + ly, z: z - lx * sin + lz * cos });
  const width = T * 0.8;
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * rise;
    const lz = T / 2 - (i + 0.5) * run;
    b.add(b.box(width, top, run), lib.gunmetal, at(0, top / 2 - 0.001, lz), { rotY });
    b.add(b.box(width, 0.04, run * 0.92), lib.floorPlain, at(0, top + 0.015, lz), { rotY, cast: false });
    b.add(b.box(width * 0.96, 0.03, 0.035), lib.emissive(PALETTE.gold, 2.2), at(0, top + 0.01, lz + run / 2 - 0.02), { rotY, cast: false });
  }
  // side stringers (extruded right triangles) with brass caps
  const strGeo = b.geo('stringer', () => {
    const s = new THREE.Shape();
    s.moveTo(-T / 2, 0);
    s.lineTo(T / 2, 0);
    s.lineTo(T / 2, T + 0.12);
    s.lineTo(T / 2 - 0.3, T + 0.12);
    s.lineTo(-T / 2, 0.22);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    g.translate(0, 0, -0.08);
    g.rotateY(Math.PI / 2); // shape x -> local -z... ascent toward -z
    owned.push(g);
    return g;
  });
  for (const side of [-1, 1]) {
    b.add(strGeo, lib.gunmetalDark, at(side * (width / 2 + 0.1), 0, 0), { rotY });
  }
  const railGeo = b.cyl(0.035, 0.035, Math.hypot(T, T) * 0.98, 8);
  for (const side of [-1, 1]) {
    const p = at(side * (width / 2 + 0.1), T / 2 + 0.95, 0);
    b.add(railGeo, lib.brass, p, { rotY, rotX: -Math.PI / 4 });
    for (const k of [-0.42, 0.42]) {
      const pp = at(side * (width / 2 + 0.1), T / 2 + k * T * 1.0 + 0.45, -k * T);
      b.add(b.cyl(0.03, 0.03, 0.95, 6), lib.brass, pp, { rotY });
    }
  }
}

function addDecor(
  d: DecorDefinition,
  grid: RenderGrid,
  b: Batcher,
  lib: MaterialLibrary,
  extra: THREE.Group,
  animated: BuiltKit['animated'],
  lights: KitLight[],
  owned: THREE.BufferGeometry[],
  ownedMats: THREE.Material[],
): void {
  const facing = d.facing ?? 2;
  // Wall-mounted decor authored on the floor cell in front of a wall is moved onto that wall.
  let col = d.col;
  let row = d.row;
  if ((d.type === 'conduit' || d.type === 'observationWindow') && !grid.isWall(col, row) && grid.isWall(col - DX[facing]!, row - DZ[facing]!)) {
    col -= DX[facing]!;
    row -= DZ[facing]!;
  }
  const lvl = d.level ?? Math.max(0, grid.tileAt(col, row).h);
  const cx = (col + 0.5) * T;
  const cz = (row + 0.5) * T;
  const base = lvl * T;
  const scale = typeof d.params?.['scale'] === 'number' ? d.params['scale'] : 1;
  const rotY = facing % 2 === 0 ? 0 : Math.PI / 2;
  // face position: on the wall face pointing toward `facing`
  const fx = cx + DX[facing]! * (T / 2 + 0.02);
  const fz = cz + DZ[facing]! * (T / 2 + 0.02);
  switch (d.type) {
    case 'conduit': {
      // trunk of pipes running up the wall face with glowing couplers
      for (const off of [-0.32, 0, 0.32]) {
        const ox = facing % 2 === 0 ? off : 0;
        const oz = facing % 2 === 0 ? 0 : off;
        b.add(b.cyl(0.07, 0.07, WALL_H - 0.4, 10), lib.brass, { x: fx + ox + DX[facing]! * 0.08, y: base + WALL_H / 2, z: fz + oz + DZ[facing]! * 0.08 });
        for (const y of [0.9, 2.1, 3.3]) {
          b.add(b.cyl(0.1, 0.1, 0.12, 10), lib.gunmetalDark, { x: fx + ox + DX[facing]! * 0.08, y: base + y, z: fz + oz + DZ[facing]! * 0.08 });
          b.add(b.cyl(0.085, 0.085, 0.05, 10), lib.emissive(PALETTE.cyan, 2.6), { x: fx + ox + DX[facing]! * 0.08, y: base + y + 0.1, z: fz + oz + DZ[facing]! * 0.08 }, { cast: false });
        }
      }
      break;
    }
    case 'observationWindow': {
      const geo = archFrameGeometry(1.75 * scale, 3.1 * scale, 0.22);
      owned.push(geo);
      const frame = new THREE.Mesh(geo, lib.brass);
      frame.position.set(fx + DX[facing]! * 0.02, base + 0.45, fz + DZ[facing]! * 0.02);
      frame.rotation.y = facing === 2 ? 0 : facing === 0 ? Math.PI : facing === 1 ? Math.PI / 2 : -Math.PI / 2;
      frame.castShadow = true;
      extra.add(frame);
      // glowing "view" into the facility: gradient pane + glass
      const paneGeo = archPaneGeometry(1.42 * scale, 2.8 * scale);
      owned.push(paneGeo);
      const paneMat = new THREE.ShaderMaterial({
        uniforms: { uTop: { value: new THREE.Color(0x0d2c4a) }, uBottom: { value: new THREE.Color(0x58c8ff) }, uH: { value: 2.8 * scale } },
        vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
        fragmentShader:
          'uniform vec3 uTop; uniform vec3 uBottom; uniform float uH; varying float vY; void main(){ float k = clamp(vY/uH,0.0,1.0); vec3 c = mix(uBottom*1.6, uTop, pow(k,0.7)); float bars = step(0.94, fract(vY*2.2)); c *= 1.0 - bars*0.6; gl_FragColor = vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      });
      ownedMats.push(paneMat);
      const pane = new THREE.Mesh(paneGeo, paneMat);
      pane.position.copy(frame.position);
      pane.rotation.copy(frame.rotation);
      pane.position.y += 0.15;
      extra.add(pane);
      lights.push({ position: new THREE.Vector3(fx + DX[facing]! * 1.2, base + 2, fz + DZ[facing]! * 1.2), color: 0x6fc8ff, intensity: 5, distance: 8, priority: 2 });
      break;
    }
    case 'ring': {
      // Rings never sit between the camera and the play space: on the camera side of the chamber they hang
      // horizontally beneath the platform, otherwise they stand upright behind the wall line.
      const ring = clockworkRing(lib, 2.2 * scale, owned, { teeth: 0.6 });
      const front = d.row >= grid.height / 2;
      if (front) {
        ring.position.set(cx, base - 2.4, cz + 1.5);
        ring.rotation.x = -Math.PI / 2;
      } else {
        ring.position.set(cx + DX[facing]! * -2.5, base + WALL_H + 2.4 * scale, cz + DZ[facing]! * -2.5);
        ring.rotation.y = rotY;
      }
      extra.add(ring);
      const inner = ring.children[1];
      animated.push({
        object: ring,
        update(t) {
          if (ring.children[0]) ring.children[0].rotation.z = t * 0.12;
          if (inner) inner.rotation.z = -t * 0.2;
        },
      });
      break;
    }
    case 'lamp': {
      b.add(b.cyl(0.05, 0.08, 2.4, 8), lib.brass, { x: cx, y: base + 1.2, z: cz });
      b.add(b.cyl(0.18, 0.12, 0.3, 12), lib.emissive(PALETTE.warmLamp, 3), { x: cx, y: base + 2.5, z: cz }, { cast: false });
      lights.push({ position: new THREE.Vector3(cx, base + 2.6, cz), color: PALETTE.warmLamp, intensity: 6, distance: 7, priority: 1 });
      break;
    }
    default:
      // Unknown decor types are ignored (forward compatible with level designers' data).
      break;
  }
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

/** Rotating brass clockwork ring with tick teeth + inner counter-rotating ring. Faces +z. */
export function clockworkRing(lib: MaterialLibrary, radius: number, owned: THREE.BufferGeometry[], opts: { teeth?: number; glow?: number } = {}): THREE.Group {
  const ts = opts.teeth ?? 1;
  const g = new THREE.Group();
  const outer = new THREE.Group();
  const torus = new THREE.TorusGeometry(radius, radius * 0.045, 10, 96);
  owned.push(torus);
  outer.add(new THREE.Mesh(torus, lib.brass));
  const toothGeo = new THREE.BoxGeometry(radius * 0.035 * ts, radius * 0.1 * ts, radius * 0.05 * ts);
  owned.push(toothGeo);
  const teeth = new THREE.InstancedMesh(toothGeo, lib.brass, 48);
  const o = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    o.position.set(Math.cos(a) * radius * (1.0 + 0.06 * ts), Math.sin(a) * radius * (1.0 + 0.06 * ts), 0);
    o.rotation.set(0, 0, a - Math.PI / 2);
    o.scale.setScalar(i % 4 === 0 ? 1.5 : 1);
    o.updateMatrix();
    teeth.setMatrixAt(i, o.matrix);
  }
  outer.add(teeth);
  g.add(outer);
  const inner = new THREE.Group();
  const t2 = new THREE.TorusGeometry(radius * 0.78, radius * 0.02, 8, 96);
  owned.push(t2);
  inner.add(new THREE.Mesh(t2, lib.emissive(PALETTE.cyan, opts.glow ?? 1.8)));
  const spokeGeo = new THREE.BoxGeometry(radius * 1.56, radius * 0.025, radius * 0.025);
  owned.push(spokeGeo);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(spokeGeo, lib.brass);
    s.rotation.z = (i / 3) * Math.PI;
    inner.add(s);
  }
  g.add(inner);
  return g;
}

function cellHash(c: number, r: number): number {
  let h = Math.imul(c * 73856093 ^ r * 19349663, 2654435761);
  h ^= h >>> 13;
  return Math.imul(h, 1274126177) >>> 0;
}

import * as THREE from 'three';
import type { Dir4, LevelDefinition } from '../../engine/contracts';
import { PALETTE } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { AnimatedParts, ClockworkGeometry, addClockworkRing } from './animatedParts';
import { Batcher } from './batcher';
import { DecorBuilder, planDecor, type DecorContext } from './decor';
import { windowPaneMaterial } from './fxMaterials';
import { parseGrid, T, type RenderGrid } from './grid';
import { DX, DZ, WALL_H, archFrameGeometry, archPaneGeometry, cellHash, face, type Face } from './shapes';

export { WALL_H, archFrameGeometry, archPaneGeometry, archGateGeometry, cellHash } from './shapes';

/**
 * Modular environment kit. Builds the static chamber from the tile grid:
 *  floor tiles (four slab variants, inset grate hatches, brass wall-edge inlays) · foundation slab + platform
 *  edges with brass lips and amber under-glow · wall modules (tall back/side walls, each face a deterministic
 *  pick from nine modules — conduit strips, observation windows, recessed panels, pipe clusters, gold-banded
 *  columns, vents, arch niches, sconces, plain — over skirting and crown trims; glass partitions; low front
 *  parapets so the iso camera never loses the player) · pillars with gold banding · railings · stairs for ramps
 *  · authored decor (see decor.ts).
 *
 * Performance: everything static goes through the Batcher (one InstancedMesh per geometry/material pair).
 * Plain boxes and cylinders share unit geometries scaled per instance (`cube`/`tube`), and every emissive trim
 * uses the single `lib.glow` material with per-instance colour, so the kit stays at a few dozen draw calls no
 * matter how much detail is placed. Moving decor goes through AnimatedParts (also instanced).
 */

const PARAPET_H = 0.62;
const PARTITION_H = 1.15;
const PARTITION_GLASS_H = 2.7;
const FOUNDATION_DEPTH = 3.2;
const NICHE_W = 1.0;
const NICHE_H = 2.5;

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


/** Wall-face modules. Order matters only for the deterministic pick (see `pickModule`). */
const MODULES = ['plain', 'conduit', 'window', 'recessed', 'pipes', 'column', 'vent', 'niche', 'sconce'] as const;
type WallModule = (typeof MODULES)[number];
const BACK_WEIGHTS: Record<WallModule, number> = { plain: 2, conduit: 3, window: 2, recessed: 3, pipes: 2, column: 2, vent: 2, niche: 2, sconce: 2 };
const SIDE_WEIGHTS: Record<WallModule, number> = { plain: 2, conduit: 3, window: 1, recessed: 3, pipes: 3, column: 2, vent: 2, niche: 0, sconce: 2 };

export function buildKit(level: LevelDefinition, lib: MaterialLibrary): BuiltKit {
  const grid = parseGrid(level);
  const b = new Batcher();
  const lights: KitLight[] = [];
  const animated: BuiltKit['animated'] = [];
  const extra = new THREE.Group();
  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const parts = new AnimatedParts();
  const clock = new ClockworkGeometry();
  const glow = (c: number, i: number) => lib.glowColor(c, i);

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
      classes[r * W + c] = rowN ?? colN ?? 'side';
    }
  const isTallWall = (c: number, r: number) => grid.isWall(c, r) && (cls(c, r) === 'back' || cls(c, r) === 'side');
  const plan = planDecor(level, grid, isTallWall);

  // ---------- floors + foundation ----------
  const tileGeo = b.rbox(T - 0.035, 0.26, T - 0.035, 0.04, 2);
  const foundGeo = b.box(T, 1, T, 2);
  const amber = glow(PALETTE.gold, 1.7);
  const amberSoft = glow(PALETTE.warmLamp, 1.0);
  const cyanStrip = glow(PALETTE.cyan, 1.35);

  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const t = grid.tileAt(c, r);
      if (t.kind === 'void') continue;
      const cx = (c + 0.5) * T;
      const cz = (r + 0.5) * T;
      const top = t.h * T;
      // foundation column (also forms raised plinths); machinery pits open the top 1.1 m of a floor cell
      const pit = t.kind === 'floor' && plan.pits.has(`${c},${r}`);
      const fTop = pit ? top - 1.15 : top - 0.2;
      const depth = fTop + FOUNDATION_DEPTH;
      b.add(foundGeo, lib.gunmetal, { x: cx, y: fTop - depth / 2, z: cz }, { scale: new THREE.Vector3(1, depth, 1), cast: false });
      if (pit) {
        // decor draws the pit; nothing else on this cell's top
      } else if (t.kind === 'floor' || t.kind === 'pillar' || t.kind === 'railing') {
        const n = cellHash(c, r);
        const v = 0.9 + ((n % 1000) / 1000) * 0.16;
        const warm = ((n >>> 10) % 100) / 100;
        const pick = (n >>> 16) % 20;
        const quarter = ((n >>> 4) % 4) * (Math.PI / 2);
        const fmat = pick < 2 ? lib.floorGrate : pick < 4 ? lib.floorEmblem : pick < 8 ? lib.floorPlate : lib.floorTile;
        b.add(tileGeo, fmat, { x: cx, y: top - 0.13, z: cz }, { cast: false, rotY: quarter, color: new THREE.Color(v * (1 + warm * 0.04), v, v * (1 - warm * 0.04)) });
        if (fmat === lib.floorGrate && t.kind === 'floor') {
          // inset service hatch: raised brass frame around the glowing grate + corner lugs
          const half = T * 0.33;
          for (const s of [-1, 1]) {
            b.cube(lib.brass, { x: cx + s * half, y: top + 0.012, z: cz }, 0.06, 0.03, half * 2 + 0.06, { cast: false });
            b.cube(lib.brass, { x: cx, y: top + 0.012, z: cz + s * half }, half * 2 + 0.06, 0.03, 0.06, { cast: false });
          }
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cube(lib.gunmetalDark, { x: cx + sx * half, y: top + 0.02, z: cz + sz * half }, 0.13, 0.04, 0.13, { cast: false });
        }
        // brass inlay along the foot of tall walls (concept: gold trim lines framing every walkway)
        if (t.kind === 'floor')
          for (let d = 0; d < 4; d++) {
            if (!isTallWall(c + DX[d]!, r + DZ[d]!)) continue;
            const ex = cx + DX[d]! * (T / 2 - 0.13);
            const ez = cz + DZ[d]! * (T / 2 - 0.13);
            b.cube(lib.brass, { x: ex, y: top + 0.004, z: ez }, d % 2 === 0 ? T - 0.04 : 0.05, 0.02, d % 2 === 0 ? 0.05 : T - 0.04, { cast: false });
          }
      } else if (t.kind === 'wall' && cls(c, r) === 'none') {
        // solid mass behind the chamber walls: dark exterior deck plating (seen from the overview camera)
        const n = cellHash(c, r);
        const v = 0.34 + ((n % 1000) / 1000) * 0.08;
        b.add(tileGeo, (n >>> 16) % 7 === 0 ? lib.floorGrate : (n >>> 16) % 3 === 0 ? lib.floorPlate : lib.floorTile, { x: cx, y: top - 0.13, z: cz }, { cast: false, rotY: ((n >>> 4) % 4) * (Math.PI / 2), color: new THREE.Color(v * 0.94, v, v * 1.1) });
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
        b.cube(lib.brass, { x: ex, y: top - 0.06, z: ez }, T, 0.09, 0.12, { rotY, cast: false });
        b.cube(lib.glow, { x: ex + DX[d]! * 0.02, y: top - 0.32, z: ez + DZ[d]! * 0.02 }, T + 0.01, 0.05, 0.04, { rotY, cast: false, receive: false, color: amber });
        if (nt.kind !== 'void' && nt.kind !== 'wall' && top - nTop >= T - 0.01) {
          // exposed plinth face down to a lower floor (concept "platform edge"): recessed dark panel between
          // brass stiles, ivory kick plate and a warm glow line
          const lo = nTop;
          const h = top - lo;
          const f = face(cx, lo, cz, d as Dir4);
          b.cube(lib.gunmetalDark, f.at(0, h / 2 + 0.1, 0.03), T - 0.42, h - 0.75, 0.06, { rotY: f.rotY, cast: false });
          for (const s of [-1, 1]) b.cube(lib.brass, f.at(s * (T / 2 - 0.08), h / 2, 0.035), 0.08, h - 0.3, 0.07, { rotY: f.rotY, cast: false });
          b.cube(lib.ivory, f.at(0, 0.2, 0.03), T - 0.42, 0.24, 0.06, { rotY: f.rotY, cast: false, color: new THREE.Color(0.7, 0.72, 0.75) });
          b.cube(lib.glow, f.at(0, 0.42, 0.065), T - 0.5, 0.035, 0.02, { rotY: f.rotY, cast: false, receive: false, color: amberSoft });
        }
        if (nt.kind === 'void') {
          b.cube(lib.glow, { x: ex + DX[d]! * 0.02, y: top - 1.6, z: ez + DZ[d]! * 0.02 }, T + 0.01, 0.06, 0.05, { rotY, cast: false, receive: false, color: amberSoft });
          // foundation ribs every other cell: gunmetal buttresses under the platform lip
          if ((c + r) % 2 === 0) b.cube(lib.gunmetalDark, { x: ex + DX[d]! * 0.08, y: top - 1.1, z: ez + DZ[d]! * 0.08 }, 0.3, 1.5, 0.16, { rotY: rotY + Math.PI / 2, cast: false });
        }
      }
    }

  // ---------- walls ----------
  const wallGeo = b.box(T, WALL_H, T, 2);
  const capGeo = b.rbox(T + 0.06, 0.28, T + 0.06, 0.04, 2);
  const conduitHousingGeo = b.rbox(0.24, WALL_H * 0.68, 0.08, 0.03, 2);
  const pilasterGeo = b.rbox(0.38, WALL_H + 0.25, 0.34, 0.05, 2);
  const columnGeo = b.rbox(0.6, WALL_H - 0.5, 0.3, 0.05, 2);
  const parapetGeo = b.rbox(T, PARAPET_H, T * 0.9, 0.05, 2, 2);
  const railTopGeo = b.rbox(T + 0.02, 0.08, 0.24, 0.03, 2);
  const partitionGeo = b.rbox(T, PARTITION_H, 0.55, 0.05, 2);
  const sconceGeo = b.rbox(0.26, 0.42, 0.16, 0.05, 2);
  const nicheFrame = b.geo('nicheFrame', () => archFrameGeometry(NICHE_W, NICHE_H, 0.08));
  const nicheBack = b.geo('nicheBack', () => {
    const g = archPaneGeometry(NICHE_W, NICHE_H);
    g.translate(0, 0, 0.005);
    return g;
  });
  const WIN_H = 1.75;
  const winFrame = b.geo('winFrame', () => archFrameGeometry(0.9, WIN_H, 0.1));
  const winPane = b.geo('winPane', () => archPaneGeometry(0.9, WIN_H));
  const paneMat = windowPaneMaterial(WIN_H);
  ownedMats.push(paneMat);

  /** Deterministic module per wall face, avoiding a repeat of the previous face along the same wall run. */
  const baseModule = (c: number, r: number, d: number, k: WallClass): WallModule => {
    const weights = k === 'back' ? BACK_WEIGHTS : SIDE_WEIGHTS;
    const total = MODULES.reduce((s, m) => s + weights[m], 0);
    let x = cellHash(c * 4 + d + 101, r * 3 + 17) % total;
    for (const m of MODULES) {
      x -= weights[m];
      if (x < 0) return m;
    }
    return 'plain';
  };
  const pickModule = (c: number, r: number, d: number, k: WallClass): WallModule => {
    const m = baseModule(c, r, d, k);
    const ac = d % 2 === 0 ? 1 : 0;
    const ar = d % 2 === 0 ? 0 : 1;
    const pc = c - ac;
    const pr = r - ar;
    if (!(isTallWall(pc, pr) && openish(pc + DX[d]!, pr + DZ[d]!))) return m;
    if (baseModule(pc, pr, d, cls(pc, pr)) !== m) return m;
    const weights = k === 'back' ? BACK_WEIGHTS : SIDE_WEIGHTS;
    const pool = MODULES.filter((x) => x !== m && weights[x] > 0);
    return pool[cellHash(c + 7, r + 13 * d) % pool.length] ?? m;
  };

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
        b.cube(lib.brass, { x: cx, y: base + WALL_H - 0.02, z: cz }, T + 0.08, 0.06, T + 0.08, { cast: false });
        const capRot = open.some((d) => d % 2 === 1) ? Math.PI / 2 : 0;
        if ((c + r) % 2 === 0) b.cube(lib.brass, { x: cx, y: base + WALL_H + 0.3, z: cz }, T + 0.06, 0.05, 0.3, { cast: false, rotY: capRot });
        else {
          // alternate caps carry a pale inspection plate with a status pip (rhythm along the dark wall tops)
          b.cube(lib.ivory, { x: cx, y: base + WALL_H + 0.29, z: cz }, T - 0.5, 0.03, 0.8, { cast: false, rotY: capRot, color: new THREE.Color(0.36, 0.38, 0.42) });
          b.cube(lib.glow, { x: cx, y: base + WALL_H + 0.31, z: cz }, 0.12, 0.02, 0.12, { cast: false, receive: false, color: (c + r) % 4 === 1 ? cyanStrip : amber });
        }
        for (const d of open) {
          const f = face(cx, base, cz, d);
          const rotY = f.rotY;
          // trims on every face: protruding kick plate with a brass line, crown moulding under the cap
          b.cube(lib.gunmetalDark, f.at(0, 0.12, 0.05), T, 0.24, 0.1, { rotY });
          b.cube(lib.brass, f.at(0, 0.255, 0.055), T, 0.03, 0.11, { rotY, cast: false });
          b.cube(lib.gunmetal, f.at(0, WALL_H - 0.2, 0.05), T, 0.14, 0.1, { rotY, cast: false });
          // faces covered by authored wall decor (windows, conduits, banners, machinery) keep only the trims
          if (!plan.wallFaces.has(`${c},${r},${d}`)) addWallModule(pickModule(c, r, d, k), f, k);
          // pilaster at the module boundary (one per pair to avoid doubling)
          const along = d % 2 === 0 ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
          const nc = c + along.dx;
          const nr = r + along.dz;
          if (isTallWall(nc, nr) && openish(nc + DX[d]!, nr + DZ[d]!)) {
            const px = f.x + along.dx * (T / 2) + DX[d]! * 0.12;
            const pz = f.z + along.dz * (T / 2) + DZ[d]! * 0.12;
            const prot = d % 2 === 0 ? 0 : Math.PI / 2;
            b.add(pilasterGeo, lib.gunmetal, { x: px, y: base + (WALL_H + 0.25) / 2, z: pz }, { rotY: prot });
            for (const y of [0.35, WALL_H - 0.4]) b.cube(lib.brass, { x: px, y: base + y, z: pz }, 0.42, 0.1, 0.38, { rotY: prot });
            b.cube(lib.glow, { x: px + DX[d]! * 0.175, y: base + WALL_H * 0.5, z: pz + DZ[d]! * 0.175 }, 0.06, WALL_H * 0.55, 0.02, { rotY: prot, cast: false, receive: false, color: glow(PALETTE.gold, 1.8) });
          }
        }
      } else if (k === 'front') {
        b.add(parapetGeo, lib.gunmetal, { x: cx, y: base + PARAPET_H / 2, z: cz - T * 0.05 });
        b.add(railTopGeo, lib.brass, { x: cx, y: base + PARAPET_H + 0.02, z: cz - T * 0.4 });
        b.cube(lib.glow, { x: cx, y: base + PARAPET_H - 0.12, z: cz - T * 0.5 - 0.005 }, T * 0.94, 0.05, 0.04, { cast: false, receive: false, color: amber });
        // small ivory inspection plates break up the parapet run
        if (cellHash(c, r) % 3 === 0) b.cube(lib.ivory, { x: cx, y: base + PARAPET_H * 0.42, z: cz - T * 0.5 + 0.08 }, 0.7, 0.22, 0.03, { cast: false });
      } else if (k === 'partition') {
        const rotY = open.includes(0) && open.includes(2) ? 0 : Math.PI / 2;
        b.add(partitionGeo, lib.gunmetal, { x: cx, y: base + PARTITION_H / 2, z: cz }, { rotY });
        b.add(railTopGeo, lib.brass, { x: cx, y: base + PARTITION_H + 0.02, z: cz }, { rotY });
        b.cube(lib.glass, { x: cx, y: base + (PARTITION_GLASS_H + PARTITION_H) / 2, z: cz }, T - 0.12, PARTITION_GLASS_H - PARTITION_H - 0.1, 0.05, { rotY, cast: false });
        b.add(railTopGeo, lib.brass, { x: cx, y: base + PARTITION_GLASS_H, z: cz }, { rotY, cast: false });
        b.cube(lib.brass, { x: cx, y: base + (PARTITION_GLASS_H + PARTITION_H) / 2, z: cz }, 0.08, PARTITION_GLASS_H - PARTITION_H, 0.1, { rotY, cast: false });
        for (const side of [-1, 1]) {
          const ox = rotY === 0 ? 0 : side * 0.285;
          const oz = rotY === 0 ? side * 0.285 : 0;
          b.cube(lib.glow, { x: cx + ox, y: base + PARTITION_H - 0.2, z: cz + oz }, T * 0.94, 0.05, 0.04, { rotY, cast: false, receive: false, color: amberSoft });
        }
      }
    }

  function addWallModule(mod: WallModule, f: Face, k: WallClass): void {
    const { rotY } = f;
    switch (mod) {
      case 'plain':
        // brass name plate + two status pips
        b.cube(lib.brass, f.at(0, 2.95, 0.02), 0.56, 0.12, 0.04, { rotY, cast: false });
        b.cube(lib.glow, f.at(-0.42, 2.95, 0.02), 0.06, 0.06, 0.03, { rotY, cast: false, receive: false, color: cyanStrip });
        b.cube(lib.glow, f.at(0.42, 2.95, 0.02), 0.06, 0.06, 0.03, { rotY, cast: false, receive: false, color: amber });
        break;
      case 'conduit':
        b.add(conduitHousingGeo, lib.gunmetalDark, f.at(0, WALL_H * 0.5, 0.03), { rotY, cast: false });
        b.cube(lib.glow, f.at(0, WALL_H * 0.5, 0.075), 0.07, WALL_H * 0.62, 0.05, { rotY, cast: false, receive: false, color: cyanStrip });
        for (const y of [WALL_H * 0.16, WALL_H * 0.84]) b.cube(lib.brass, f.at(0, y, 0.05), 0.32, 0.1, 0.12, { rotY, cast: false });
        break;
      case 'window': {
        // observation window: brass arched frame, a glowing view out into the facility, brass sill
        const y0 = 1.3;
        b.add(winPane, lib.gunmetalDark, f.at(0, y0 - 0.06, 0.004), { rotY, cast: false, scale: new THREE.Vector3(1.22, 1.08, 1) });
        b.add(winPane, paneMat, f.at(0, y0, 0.01), { rotY, cast: false, receive: false, color: new THREE.Color(1, 1, 1) });
        b.add(winFrame, lib.brass, f.at(0, y0 - 0.12, 0.012), { rotY, cast: false });
        b.cube(lib.brass, f.at(0, y0 - 0.1, 0.1), 1.45, 0.08, 0.2, { rotY, cast: false });
        break;
      }
      case 'recessed':
        b.cube(lib.gunmetalDark, f.at(0, 2.0, 0.03), 1.5, 2.6, 0.06, { rotY });
        b.cube(lib.ivory, f.at(0, 2.72, 0.07), 1.22, 1.0, 0.04, { rotY, cast: false });
        b.cube(lib.ivory, f.at(0, 1.42, 0.07), 1.22, 1.06, 0.04, { rotY, cast: false, color: new THREE.Color(0.55, 0.6, 0.66) });
        b.cube(lib.glow, f.at(0, 2.12, 0.07), 1.22, 0.035, 0.03, { rotY, cast: false, receive: false, color: amber });
        for (const sx of [-0.66, 0.66]) for (const y of [0.8, 3.2]) b.tube(lib.brass, f.at(sx, y, 0.07), 0.045, 0.04, { rotY, rotX: Math.PI / 2, cast: false, seg: 8 });
        break;
      case 'pipes': {
        const pipes = [
          [-0.52, 0.075],
          [-0.27, 0.1],
          [0.0, 0.06],
          [0.2, 0.06],
        ] as const;
        for (const [u, rr] of pipes) b.tube(u === 0.2 ? lib.gunmetal : lib.brass, f.at(u, WALL_H / 2 + 0.05, 0.16), rr, WALL_H - 0.5, { rotY });
        for (const y of [0.95, 2.9]) b.cube(lib.gunmetalDark, f.at(-0.16, y, 0.12), 0.95, 0.12, 0.14, { rotY, cast: false });
        b.tube(lib.brass, f.at(-0.27, 1.75, 0.3), 0.17, 0.04, { rotY, rotX: Math.PI / 2, cast: false, seg: 10 });
        b.cube(lib.gunmetalDark, f.at(0.58, 1.9, 0.05), 0.34, 0.46, 0.1, { rotY, cast: false });
        b.cube(lib.glow, f.at(0.58, 1.98, 0.105), 0.2, 0.16, 0.02, { rotY, cast: false, receive: false, color: amber });
        break;
      }
      case 'column':
        b.cube(lib.gunmetalDark, f.at(0, 0.2, 0.2), 0.78, 0.4, 0.42, { rotY });
        b.add(columnGeo, lib.ivory, f.at(0, 0.25 + (WALL_H - 0.5) / 2, 0.15), { rotY });
        for (const y of [0.55, 1.95, 3.35]) b.cube(lib.brass, f.at(0, y, 0.15), 0.66, 0.1, 0.36, { rotY });
        for (const y of [1.25, 2.65]) b.cube(lib.glow, f.at(0, y, 0.305), 0.06, 1.0, 0.02, { rotY, cast: false, receive: false, color: glow(PALETTE.gold, 2.4) });
        break;
      case 'vent':
        b.cube(lib.gunmetalDark, f.at(0, 1.2, 0.04), 1.32, 1.12, 0.08, { rotY });
        b.cube(lib.glow, f.at(0, 1.2, 0.082), 1.14, 0.94, 0.01, { rotY, cast: false, receive: false, color: glow(PALETTE.warmLamp, 0.55) });
        for (let i = 0; i < 7; i++) b.cube(lib.gunmetal, f.at(0, 0.8 + i * 0.135, 0.11), 1.16, 0.05, 0.11, { rotY, rotX: -0.55, cast: false });
        b.cube(lib.brass, f.at(0, 1.8, 0.09), 1.36, 0.06, 0.1, { rotY, cast: false });
        b.cube(lib.glow, f.at(0, 2.9, 0.03), 0.42, 0.05, 0.03, { rotY, cast: false, receive: false, color: cyanStrip });
        break;
      case 'niche': {
        // arch niche: brass arch frame, dark recess, warm glow at its head
        const archRot = f.d === 2 ? 0 : f.d === 0 ? Math.PI : f.d === 1 ? Math.PI / 2 : -Math.PI / 2;
        b.add(nicheFrame, lib.brass, f.at(0, 0.35, 0.01), { rotY: archRot, cast: false });
        b.add(nicheBack, lib.gunmetalDark, f.at(0, 0.35, 0.012), { rotY: archRot, cast: false });
        b.cube(lib.glow, f.at(0, 2.35, 0.05), 0.22, 0.15, 0.05, { rotY, cast: false, receive: false, color: glow(PALETTE.warmLamp, 2.6) });
        lights.push({ position: new THREE.Vector3(...f.arr(0, 2.2, 0.6)), color: PALETTE.warmLamp, intensity: 4, distance: 6, priority: 1 });
        break;
      }
      case 'sconce': {
        b.add(sconceGeo, lib.brass, f.at(0, 2.6, 0.08), { rotY, cast: false });
        b.cube(lib.glow, f.at(0, 2.6, 0.15), 0.14, 0.3, 0.05, { rotY, cast: false, receive: false, color: glow(PALETTE.warmLamp, 3.2) });
        if (lampCounter++ % 2 === 0 || k === 'back')
          lights.push({ position: new THREE.Vector3(...f.arr(0, 2.7, 0.58)), color: PALETTE.warmLamp, intensity: 6, distance: 7, priority: 1 });
        break;
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
      [0.4, 0.1],
    ] as const) {
      b.add(ringGeo, lib.glow, { x: cx, y: -FOUNDATION_DEPTH - span * k, z: cz }, { rotX: Math.PI / 2, scale: span * s, cast: false, receive: false, color: amber });
    }
    // slow gyroscope under the keel: two crossed clockwork rings
    const ky = -FOUNDATION_DEPTH - span * 0.5;
    addClockworkRing(parts, clock, lib, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(cx, ky, cz), span * 0.2, { teeth: 0.5, speed: 0.05, glow: 1.2 });
    addClockworkRing(parts, clock, lib, new THREE.Matrix4().makeRotationY(0.7).setPosition(cx, ky, cz), span * 0.15, { teeth: 0.5, speed: -0.07, glow: 1.2, color: PALETTE.gold });
  }

  // ---------- decor ----------
  const ownedTex: THREE.Texture[] = [];
  const dctx: DecorContext = { grid, b, lib, extra, animated, lights, owned: ownedGeos, ownedMats, ownedTex, parts, clock, isTallWall };
  const decor = new DecorBuilder(dctx);
  for (const d of level.decor ?? []) decor.add(d);
  decor.finish();

  const group = b.build('environment');
  group.add(extra);
  group.add(parts.build('environment-animated'));
  animated.push({ object: parts.group, update: (t) => parts.update(t) });
  animated.push({
    object: extra,
    update: (t) => {
      paneMat.uniforms['uTime']!.value = t;
    },
  });
  return {
    group,
    grid,
    lights,
    animated,
    wallClass: cls,
    dispose() {
      b.dispose();
      parts.dispose();
      clock.dispose();
      for (const g of ownedGeos) g.dispose();
      for (const m of ownedMats) m.dispose();
      for (const t of ownedTex) t.dispose();
    },
  };
}

function addPillar(b: Batcher, lib: MaterialLibrary, x: number, y: number, z: number, h: number): void {
  b.add(b.rbox(1.34, 0.42, 1.34, 0.06, 2), lib.gunmetal, { x, y: y + 0.21, z });
  b.cube(lib.brass, { x, y: y + 0.47, z }, 1.22, 0.1, 1.22);
  b.add(b.rbox(0.96, h - 1.1, 0.96, 0.06, 2), lib.gunmetal, { x, y: y + 0.52 + (h - 1.1) / 2, z });
  const panelH = h - 1.7;
  const gold = lib.glowColor(PALETTE.gold, 2.6);
  for (let d = 0; d < 4; d++) {
    const ox = DX[d]! * 0.49;
    const oz = DZ[d]! * 0.49;
    const rotY = d % 2 === 0 ? 0 : Math.PI / 2;
    b.add(b.rbox(0.62, panelH, 0.04, 0.015, 1), lib.ivory, { x: x + ox, y: y + 0.85 + panelH / 2, z: z + oz }, { rotY });
    b.cube(lib.glow, { x: x + ox * 1.05, y: y + 0.85 + panelH / 2, z: z + oz * 1.05 }, 0.07, panelH - 0.3, 0.03, { rotY, cast: false, receive: false, color: gold });
  }
  for (const yy of [0.72, h - 0.72]) b.cube(lib.brass, { x, y: y + yy, z }, 1.08, 0.14, 1.08);
  b.add(b.rbox(1.24, 0.34, 1.24, 0.05, 2), lib.gunmetalDark, { x, y: y + h - 0.45, z });
  b.add(b.rbox(1.4, 0.16, 1.4, 0.04, 2), lib.brass, { x, y: y + h - 0.22, z });
}

function addRailing(b: Batcher, lib: MaterialLibrary, x: number, y: number, z: number, arms: number[]): void {
  const postGeo = b.rbox(0.14, 1.0, 0.14, 0.03, 1);
  b.add(postGeo, lib.brass, { x, y: y + 0.5, z }, { cast: false });
  b.add(b.rbox(0.3, 0.14, 0.3, 0.03, 1), lib.gunmetalDark, { x, y: y + 0.07, z }, { cast: false });
  const gold = lib.glowColor(PALETTE.gold, 2.4);
  for (const d of arms) {
    const len = T / 2;
    const mx = x + (DX[d]! * len) / 2;
    const mz = z + (DZ[d]! * len) / 2;
    const rotY = d % 2 === 0 ? Math.PI / 2 : 0;
    b.cube(lib.brass, { x: mx, y: y + 1.0, z: mz }, len, 0.07, 0.09, { rotY });
    b.cube(lib.brass, { x: mx, y: y + 0.62, z: mz }, len, 0.04, 0.05, { rotY });
    b.add(b.rbox(len, 0.22, 0.16, 0.03, 1), lib.gunmetal, { x: mx, y: y + 0.11, z: mz }, { rotY });
    b.cube(lib.glow, { x: mx, y: y + 0.24, z: mz }, len, 0.035, 0.03, { rotY, cast: false, receive: false, color: gold });
    // glass infill
    b.cube(lib.glass, { x: mx, y: y + 0.42, z: mz }, len, 0.36, 0.025, { rotY, cast: false });
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
  const gold = lib.glowColor(PALETTE.gold, 2.2);
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * rise;
    const lz = T / 2 - (i + 0.5) * run;
    b.cube(lib.gunmetal, at(0, top / 2 - 0.001, lz), width, top, run, { rotY });
    b.cube(lib.floorPlain, at(0, top + 0.015, lz), width, 0.04, run * 0.92, { rotY, cast: false });
    b.cube(lib.glow, at(0, top + 0.01, lz + run / 2 - 0.02), width * 0.96, 0.03, 0.035, { rotY, cast: false, receive: false, color: gold });
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
  const railLen = Math.hypot(T, T) * 0.98;
  for (const side of [-1, 1]) {
    const p = at(side * (width / 2 + 0.1), T / 2 + 0.95, 0);
    b.tube(lib.brass, p, 0.035, railLen, { rotY, rotX: -Math.PI / 4, seg: 8 });
    for (const k of [-0.42, 0.42]) {
      const pp = at(side * (width / 2 + 0.1), T / 2 + k * T * 1.0 + 0.45, -k * T);
      b.tube(lib.brass, pp, 0.03, 0.95, { rotY, seg: 8 });
    }
  }
}

/**
 * Rotating brass clockwork ring with tick teeth + inner counter-rotating ring, as a standalone group (kept for
 * callers outside the environment; the kit and backdrop use the instanced `addClockworkRing`). Faces +z.
 */
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
  const spokes = new THREE.InstancedMesh(spokeGeo, lib.brass, 3);
  for (let i = 0; i < 3; i++) {
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, (i / 3) * Math.PI);
    o.scale.setScalar(1);
    o.updateMatrix();
    spokes.setMatrixAt(i, o.matrix);
  }
  inner.add(spokes);
  g.add(inner);
  return g;
}


import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Protagonist model, generated in code once and shared by every Character instance (player and all echoes).
 *
 * The suit is a dark undersuit body (smooth lathe-style surfaces with elliptical cross sections) with white /
 * ivory armour panels laid on top of it. Panels are generated on the same parametric surface as the body
 * (offset outwards, with shaped outlines per height) so they conform to the anatomy; their edge walls are
 * painted with the glowing gold seam colour, which gives the concept sheet's orange-outlined armour plates.
 *
 * Every part is baked into ONE geometry per bone, carrying two vertex attributes:
 *   color  (vec3, linear albedo)
 *   paint  (vec4: roughness, metalness, emissive strength, clearcoat)
 * so each bone is a single draw call with a single material: the PBR suit material for the player (see
 * createSuitMaterial) or the hologram shader for echoes (which derives its light/dark/accent tone from the same
 * attributes). 18 bones = 18 draw calls per character.
 */

export type BoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'device'
  | 'neck'
  | 'head'
  | 'tail0'
  | 'tail1'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'thighL'
  | 'thighR'
  | 'kneeL'
  | 'kneeR'
  | 'ankleL'
  | 'ankleR';

/** Bone rest offsets (parent space, metres; the model is ~1.75 m tall, 7 heads). */
export const RIG = {
  hipsY: 0.95,
  spine: [0, 0.07, 0],
  chest: [0, 0.17, 0],
  neck: [0, 0.255, -0.005],
  head: [0, 0.085, 0.004],
  shoulder: [0.168, 0.212, -0.008],
  elbow: [0, -0.275, 0],
  /** Palm centre in elbow space (for carry anchoring). */
  palm: [0, -0.3, 0.01],
  thigh: [0.088, -0.05, 0],
  knee: [0, -0.415, 0],
  ankle: [0, -0.375, 0],
  device: [0, 0.118, -0.2],
  tail0: [0, 0.07, -0.088],
  tail1: [0, -0.05, 0],
} as const;

interface Paint {
  color: number;
  rough: number;
  metal: number;
  emit: number;
  coat: number;
}

const P = {
  white: { color: 0xf3f0ea, rough: 0.3, metal: 0.02, emit: 0, coat: 0.75 },
  ivory: { color: 0xd6cfc0, rough: 0.42, metal: 0.04, emit: 0, coat: 0.45 },
  suit: { color: 0x1f232b, rough: 0.66, metal: 0.12, emit: 0, coat: 0.12 },
  plate: { color: 0x3a404b, rough: 0.38, metal: 0.6, emit: 0, coat: 0.3 },
  gold: { color: 0xd8922f, rough: 0.26, metal: 1, emit: 0, coat: 0 },
  seam: { color: 0xffa53a, rough: 0.4, metal: 0.2, emit: 2.4, coat: 0 },
  orange: { color: 0xff8a2a, rough: 0.42, metal: 0.1, emit: 0.35, coat: 0.3 },
  cyan: { color: 0x3bb8ff, rough: 0.25, metal: 0, emit: 2.2, coat: 0 },
  skin: { color: 0xe9b596, rough: 0.55, metal: 0, emit: 0, coat: 0 },
  lip: { color: 0xc07468, rough: 0.45, metal: 0, emit: 0, coat: 0.2 },
  skinShade: { color: 0xd99c7e, rough: 0.55, metal: 0, emit: 0, coat: 0 },
  // round 5: softer sheen (the clearcoat used to catch the rim light as a hard blue blob on the crown)
  hair: { color: 0x5b3321, rough: 0.66, metal: 0, emit: 0, coat: 0.06 },
  hairHi: { color: 0x7c4a2c, rough: 0.62, metal: 0, emit: 0, coat: 0.06 },
  brow: { color: 0x3a2014, rough: 0.6, metal: 0, emit: 0, coat: 0 },
  lash: { color: 0x1c120e, rough: 0.5, metal: 0, emit: 0, coat: 0.2 },
  eye: { color: 0x6a3c1e, rough: 0.15, metal: 0, emit: 0, coat: 1 },
  pupil: { color: 0x120a08, rough: 0.1, metal: 0, emit: 0, coat: 1 },
  catchlight: { color: 0xffffff, rough: 0.1, metal: 0, emit: 0.7, coat: 0 },
  sclera: { color: 0xf2efe9, rough: 0.2, metal: 0, emit: 0, coat: 1 },
  sole: { color: 0xf6f5f1, rough: 0.6, metal: 0, emit: 0, coat: 0.1 },
  tread: { color: 0x2a2b30, rough: 0.9, metal: 0, emit: 0, coat: 0 },
} satisfies Record<string, Paint>;

// ------------------------------------------------------------------------------------------- helpers

type RFn = (y: number, phi: number) => number;

/** Smooth radius profile through [y, r] control points (Catmull-Rom on r, ascending y). */
function curve(pts: readonly (readonly [number, number])[]): (y: number) => number {
  return (y: number) => {
    const n = pts.length;
    if (y <= pts[0]![0]) return pts[0]![1];
    if (y >= pts[n - 1]![0]) return pts[n - 1]![1];
    let i = 0;
    while (i < n - 2 && y > pts[i + 1]![0]) i++;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const r0 = (pts[i - 1] ?? p1)[1];
    const r3 = (pts[i + 2] ?? p2)[1];
    const t = (y - p1[0]) / (p2[0] - p1[0]);
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1[1] + (-r0 + p2[1]) * t + (2 * r0 - 5 * p1[1] + 4 * p2[1] - r3) * t2 + (-r0 + 3 * p1[1] - 3 * p2[1] + r3) * t3);
  };
}

/** Linear interpolation over [y, value] keys (for panel outlines). */
function keys(pts: readonly (readonly [number, number])[]): (y: number) => number {
  return (y: number) => {
    if (y <= pts[0]![0]) return pts[0]![1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (y <= b[0]) return a[1] + ((b[1] - a[1]) * (y - a[0])) / (b[0] - a[0]);
    }
    return pts[pts.length - 1]![1];
  };
}

/**
 * Tessellation multiplier while a model is being built: 1 = full detail (LOD 0), 0.4 for LOD 1 (mobile preset).
 * Only segment counts change; proportions, panels and paint stay identical.
 */
let DETAIL = 1;
/** Reduced segment count, never below `min` (silhouette) and never above the authored `n` (LOD 0 is untouched). */
const seg = (n: number, min: number): number => (DETAIL >= 1 ? n : Math.min(n, Math.max(min, Math.round(n * DETAIL))));

const bump = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (w * w));

interface SurfaceOpts {
  rows?: number;
  cols?: number;
  sx?: number;
  sz?: number;
  /** Outward offset from the base surface (panels). */
  off?: number;
  /** Forward shift of the cross-section centre per height. */
  cz?: (y: number) => number;
  /** Phi range per height (default full revolution, seam at the back). */
  phi?: (y: number) => readonly [number, number];
  /** Panel thickness: adds edge walls painted with `wall`. */
  thick?: number;
  wall?: Paint;
  /** Which edges get walls (default all four for partial panels, top/bottom for full rings). */
  walls?: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };
}

interface Piece {
  geo: THREE.BufferGeometry;
  paint: Paint;
}

/**
 * Parametric surface of revolution with elliptical sections: (phi, y) -> (sx·r·sin φ, y, sz·r·cos φ + cz).
 * Partial phi ranges make conforming armour panels; `thick` adds edge walls (seams).
 */
function surface(r: RFn, y0: number, y1: number, paint: Paint, o: SurfaceOpts = {}): Piece[] {
  const rows = seg(o.rows ?? 16, 2);
  const cols = seg(o.cols ?? 28, 3);
  const sx = o.sx ?? 1;
  const sz = o.sz ?? 1;
  const off = o.off ?? 0;
  const full = !o.phi;
  const phiFn = o.phi ?? (() => [-Math.PI, Math.PI] as const);
  const pos: number[] = [];
  const pt = (y: number, phi: number, extra: number): THREE.Vector3 => {
    const rr = Math.max(0, r(y, phi) + off + extra);
    return new THREE.Vector3(sx * rr * Math.sin(phi), y, sz * rr * Math.cos(phi) + (o.cz ? o.cz(y) : 0));
  };
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    const [a, b] = phiFn(y);
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= cols; j++) row.push(pt(y, a + ((b - a) * j) / cols, 0));
    grid.push(row);
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const A = grid[i]![j]!;
      const B = grid[i]![j + 1]!;
      const C = grid[i + 1]![j + 1]!;
      const D = grid[i + 1]![j]!;
      pos.push(A.x, A.y, A.z, B.x, B.y, B.z, D.x, D.y, D.z, B.x, B.y, B.z, C.x, C.y, C.z, D.x, D.y, D.z);
    }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  const out: Piece[] = [{ geo: g, paint }];

  if (o.thick && o.thick > 0) {
    const t = o.thick;
    const w = o.walls ?? (full ? { top: true, bottom: true } : { left: true, right: true, top: true, bottom: true });
    const wp: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, want: THREE.Vector3) => {
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
      if (n.dot(want) >= 0) wp.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      else wp.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    };
    const edgeY = (i: number, up: boolean) => {
      const y = y0 + ((y1 - y0) * i) / rows;
      const [a, b] = phiFn(y);
      for (let j = 0; j < cols; j++) {
        const p0 = a + ((b - a) * j) / cols;
        const p1 = a + ((b - a) * (j + 1)) / cols;
        quad(pt(y, p0, 0), pt(y, p1, 0), pt(y, p1, -t), pt(y, p0, -t), new THREE.Vector3(0, up ? 1 : -1, 0));
      }
    };
    const edgePhi = (right: boolean) => {
      for (let i = 0; i < rows; i++) {
        const ya = y0 + ((y1 - y0) * i) / rows;
        const yb = y0 + ((y1 - y0) * (i + 1)) / rows;
        const pa = phiFn(ya)[right ? 1 : 0];
        const pb = phiFn(yb)[right ? 1 : 0];
        const s = right ? 1 : -1;
        const want = new THREE.Vector3(Math.cos(pa) * s * sx, 0, -Math.sin(pa) * s * sz);
        quad(pt(ya, pa, 0), pt(yb, pb, 0), pt(yb, pb, -t), pt(ya, pa, -t), want);
      }
    };
    if (w.bottom) edgeY(0, false);
    if (w.top) edgeY(rows, true);
    if (!full && w.left) edgePhi(false);
    if (!full && w.right) edgePhi(true);
    if (wp.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      wg.computeVertexNormals();
      out.push({ geo: wg, paint: o.wall ?? P.seam });
    }
  }
  return out;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return M.clone().compose(new THREE.Vector3(x, y, z), Q.clone().setFromEuler(E.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

class Builder {
  private readonly parts = new Map<BoneName, THREE.BufferGeometry[]>();

  add(bone: BoneName, geo: THREE.BufferGeometry, paint: Paint, m?: THREE.Matrix4): void {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const g = new THREE.BufferGeometry();
    const p = src.getAttribute('position') as THREE.BufferAttribute;
    g.setAttribute('position', p.clone());
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    g.setAttribute('normal', (src.getAttribute('normal') as THREE.BufferAttribute).clone());
    if (src !== geo) src.dispose();
    geo.dispose();
    if (m) g.applyMatrix4(m);
    const n = p.count;
    const c = new THREE.Color(paint.color);
    const col = new Float32Array(n * 3);
    const pnt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], i * 3);
      pnt.set([paint.rough, paint.metal, paint.emit, paint.coat], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('paint', new THREE.BufferAttribute(pnt, 4));
    const list = this.parts.get(bone) ?? [];
    list.push(g);
    this.parts.set(bone, list);
  }

  pieces(bone: BoneName, list: Piece[], m?: THREE.Matrix4): void {
    for (const p of list) this.add(bone, p.geo, p.paint, m);
  }

  finish(): Record<BoneName, THREE.BufferGeometry> {
    const out = {} as Record<BoneName, THREE.BufferGeometry>;
    for (const [bone, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) throw new Error(`character: failed to merge bone ${bone}`);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      out[bone] = merged;
    }
    return out;
  }
}

const rbox = (w: number, h: number, d: number, r: number, segs = 3) =>
  new RoundedBoxGeometry(w, h, d, seg(segs, 1), Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const sphere = (r: number, ws = 16, hs = 12, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, seg(ws, 6), seg(hs, 4), 0, Math.PI * 2, ts, tl);
const cone = (r: number, h: number, segs = 7) => new THREE.ConeGeometry(r, h, seg(segs, 5), 1);
const sym = (c: number, h: number) => () => [c - h, c + h] as const;

// ------------------------------------------------------------------------------------------- model

function buildModel(): Record<BoneName, THREE.BufferGeometry> {
  const b = new Builder();

  // ================= HIPS (pelvis, belt, hip plates)
  const pelvisBase = curve([
    [-0.155, 0.0],
    [-0.145, 0.062],
    [-0.12, 0.118],
    [-0.075, 0.157],
    [-0.02, 0.168],
    [0.03, 0.156],
    [0.08, 0.14],
    [0.12, 0.134],
  ]);
  const pelvis: RFn = (y, phi) => pelvisBase(y) * (1 + 0.1 * Math.max(0, -Math.cos(phi)) * bump(y, -0.06, 0.06));
  b.pieces('hips', surface(pelvis, -0.155, 0.12, P.suit, { sz: 0.74, rows: 14 }));
  b.pieces('hips', surface(pelvis, 0.032, 0.078, P.plate, { sz: 0.74, off: 0.012, thick: 0.012, wall: P.gold, rows: 2 }));
  b.add('hips', rbox(0.075, 0.05, 0.024, 0.008), P.gold, T(0, 0.055, 0.118));
  b.add('hips', rbox(0.034, 0.02, 0.01, 0.004), P.seam, T(0, 0.055, 0.131));
  for (const s of [-1, 1]) {
    b.add('hips', rbox(0.035, 0.06, 0.07, 0.012), P.plate, T(s * 0.152, 0.03, -0.045, 0, 0, 0));
    // side tassets
    b.pieces(
      'hips',
      surface(pelvis, -0.115, 0.026, P.white, {
        sz: 0.74,
        off: 0.014,
        thick: 0.011,
        rows: 6,
        cols: 10,
        phi: (y) => {
          const h = keys([
            [-0.115, 0.26],
            [0.026, 0.46],
          ])(y);
          return [s * 1.5 - h, s * 1.5 + h] as const;
        },
      }),
    );
    // rear hip plates (the concept's short armour skirt at the back)
    b.pieces(
      'hips',
      surface(pelvis, -0.1, 0.022, P.white, {
        sz: 0.74,
        off: 0.016,
        thick: 0.011,
        rows: 6,
        cols: 10,
        phi: (y) => {
          const h = keys([
            [-0.1, 0.22],
            [0.022, 0.36],
          ])(y);
          return [s * 2.35 - h, s * 2.35 + h] as const;
        },
      }),
    );
  }
  // front V plate (continues the torso plate down to the crotch)
  b.pieces(
    'hips',
    surface(pelvis, -0.125, 0.03, P.white, {
      sz: 0.74,
      off: 0.01,
      thick: 0.01,
      rows: 8,
      cols: 10,
      walls: { left: true, right: true, bottom: true },
      phi: (y) => {
        const h = keys([
          [-0.125, 0.08],
          [0.03, 0.5],
        ])(y);
        return [-h, h] as const;
      },
    }),
  );

  // ================= SPINE (abdomen + abdominal plate)
  const abs = curve([
    [-0.08, 0.14],
    [-0.02, 0.128],
    [0.05, 0.119],
    [0.12, 0.128],
    [0.2, 0.146],
  ]);
  const absR: RFn = (y) => abs(y);
  b.pieces('spine', surface(absR, -0.08, 0.2, P.suit, { sz: 0.72, rows: 10 }));
  b.pieces(
    'spine',
    surface(absR, -0.045, 0.2, P.white, {
      sz: 0.72,
      off: 0.01,
      thick: 0.01,
      rows: 10,
      cols: 12,
      walls: { left: true, right: true },
      phi: (y) => {
        const h = keys([
          [-0.045, 0.48],
          [0.08, 0.5],
          [0.2, 0.66],
        ])(y);
        return [-h, h] as const;
      },
    }),
  );
  // flank accent lines
  for (const s of [-1, 1])
    b.pieces('spine', surface(absR, -0.03, 0.19, P.seam, { sz: 0.72, off: 0.004, rows: 6, cols: 2, phi: sym(s * 1.3, 0.035) }));

  // ================= CHEST (ribcage, plates, collar, backpack)
  const chestBase = curve([
    [-0.04, 0.146],
    [0.03, 0.152],
    [0.1, 0.163],
    [0.16, 0.168],
    [0.2, 0.162],
    [0.235, 0.14],
    [0.26, 0.105],
    [0.28, 0.07],
    [0.31, 0.058],
  ]);
  const chestR: RFn = (y, phi) => {
    const front = Math.max(0, Math.cos(phi));
    return chestBase(y) * (1 + 0.13 * front * front * front * bump(y, 0.1, 0.055));
  };
  const chestO = { sx: 1.07, sz: 0.68 };
  b.pieces('chest', surface(chestR, -0.04, 0.31, P.suit, { ...chestO, rows: 18 }));
  // white chest plate
  b.pieces(
    'chest',
    surface(chestR, -0.04, 0.245, P.white, {
      ...chestO,
      off: 0.011,
      thick: 0.011,
      rows: 16,
      cols: 16,
      walls: { left: true, right: true, top: true },
      phi: (y) => {
        const h = keys([
          [-0.04, 0.66],
          [0.06, 0.74],
          [0.14, 0.68],
          [0.2, 0.5],
          [0.245, 0.34],
        ])(y);
        return [-h, h] as const;
      },
    }),
  );
  // back plate (under the backpack)
  b.pieces(
    'chest',
    surface(chestR, 0.0, 0.25, P.white, {
      ...chestO,
      off: 0.01,
      thick: 0.01,
      rows: 10,
      cols: 14,
      phi: (y) => {
        const h = keys([
          [0.0, 0.5],
          [0.15, 0.8],
          [0.25, 0.42],
        ])(y);
        return [Math.PI - h, Math.PI + h] as const;
      },
    }),
  );
  // flank / shoulder accent lines on the dark undersuit
  for (const s of [-1, 1]) {
    b.pieces('chest', surface(chestR, -0.03, 0.2, P.seam, { ...chestO, off: 0.004, rows: 8, cols: 2, phi: sym(s * 1.3, 0.035) }));
    b.pieces('chest', surface(chestR, 0.17, 0.25, P.orange, { ...chestO, off: 0.006, thick: 0.006, rows: 4, cols: 6, phi: sym(s * 1.05, 0.2) }));
  }
  // high collar (white turtleneck) with a gold base ring, curling in at the top
  const collar = curve([
    [0.235, 0.088],
    [0.26, 0.079],
    [0.3, 0.068],
    [0.33, 0.064],
    [0.345, 0.058],
    [0.352, 0.044],
  ]);
  b.pieces('chest', surface((y) => collar(y), 0.235, 0.352, P.white, { sz: 0.92, rows: 8, cz: () => 0.008 }));
  b.pieces('chest', surface((y) => collar(y), 0.24, 0.255, P.seam, { sz: 0.92, off: 0.004, rows: 1, cz: () => 0.008 }));

  // backpack: rounded shell + circular temporal device
  b.add('chest', rbox(0.25, 0.29, 0.085, 0.036), P.white, T(0, 0.11, -0.158));
  for (const s of [-1, 1]) {
    b.add('chest', rbox(0.032, 0.25, 0.075, 0.012), P.plate, T(s * 0.13, 0.11, -0.152));
    b.add('chest', rbox(0.012, 0.18, 0.012, 0.005), P.seam, T(s * 0.147, 0.11, -0.13));
  }
  b.add('chest', rbox(0.15, 0.035, 0.06, 0.012), P.plate, T(0, -0.035, -0.15));
  const housing = new THREE.LatheGeometry(
    [
      [0.0, 0.0],
      [0.112, 0.0],
      [0.12, 0.012],
      [0.12, 0.032],
      [0.108, 0.046],
      [0.088, 0.05],
      [0.078, 0.04],
      [0.074, 0.03],
      [0.0, 0.03],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    40,
  );
  const dev = RIG.device;
  b.add('chest', housing, P.white, T(dev[0], dev[1], dev[2], -Math.PI / 2));
  b.add('chest', new THREE.CylinderGeometry(0.075, 0.075, 0.01, 32), P.plate, T(dev[0], dev[1], dev[2] - 0.033, Math.PI / 2));
  b.add('chest', new THREE.TorusGeometry(0.06, 0.009, 8, 40), P.cyan, T(dev[0], dev[1], dev[2] - 0.038));
  b.add('chest', sphere(0.042, 20, 10, 0, Math.PI / 2), P.cyan, T(dev[0], dev[1], dev[2] - 0.032, -Math.PI / 2, 0, 0, 1, 0.55, 1));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    b.add('chest', rbox(0.03, 0.022, 0.02, 0.006), P.gold, T(dev[0] + Math.cos(a) * 0.118, dev[1] + Math.sin(a) * 0.118, dev[2] - 0.026, 0, 0, a));
  }

  // ================= DEVICE (rotating ring segments on the rim)
  for (let k = 0; k < 3; k++)
    b.add('device', new THREE.TorusGeometry(0.097, 0.0075, 6, 14, 1.45), P.seam, T(0, 0, -0.05, 0, 0, (k * Math.PI * 2) / 3));

  // ================= NECK
  b.pieces('neck', surface(() => 0.045, -0.03, 0.11, P.skin, { rows: 2, cols: 16 }));

  // ================= HEAD (skull, face plane, features, hair, buns)
  b.add('head', sphere(0.1, 28, 20), P.skin, T(0, 0.118, -0.008, 0, 0, 0, 0.86, 0.98, 0.95));
  const face = curve([
    [-0.006, 0.0],
    [0.004, 0.026],
    [0.03, 0.056],
    [0.065, 0.073],
    [0.1, 0.08],
    [0.13, 0.078],
  ]);
  b.pieces(
    'head',
    surface((y) => face(y), -0.006, 0.13, P.skin, {
      sx: 0.95,
      sz: 0.9,
      rows: 12,
      cols: 24,
      cz: (y) => 0.016 - 0.006 * (y / 0.13),
    }),
  );
  // round 5 face polish: a slimmer nose ridge, a softer mouth, eyes with a brown iris, pupil, catchlight and an upper
  // lash line (they used to read as two black beads), heavier brows. All merged into the head mesh (no draw calls).
  b.add('head', sphere(0.0075, 8, 6), P.skinShade, T(0, 0.066, 0.083, -0.35, 0, 0, 0.62, 1.35, 0.62));
  b.add('head', rbox(0.026, 0.0042, 0.006, 0.002), P.lip, T(0, 0.037, 0.0785));
  b.add('head', rbox(0.016, 0.003, 0.005, 0.0014), P.skinShade, T(0, 0.031, 0.077));
  for (const s of [-1, 1]) {
    b.add('head', sphere(0.0165, 12, 8), P.sclera, T(s * 0.032, 0.088, 0.071, 0, 0, s * -0.12, 1.22, 0.8, 0.45));
    b.add('head', sphere(0.0098, 12, 8), P.eye, T(s * 0.0305, 0.0875, 0.0772, 0, 0, 0, 0.92, 1.1, 0.42));
    b.add('head', sphere(0.0052, 8, 6), P.pupil, T(s * 0.0303, 0.0875, 0.0806, 0, 0, 0, 0.9, 1.1, 0.4));
    b.add('head', sphere(0.0021, 6, 4), P.catchlight, T(s * 0.0303 + 0.0035, 0.0915, 0.0822));
    // upper lid / lash line hugging the top of the eye, flicked out at the outer corner
    b.add('head', new THREE.TorusGeometry(0.0175, 0.0024, 4, 12, 2.3), P.lash, T(s * 0.032, 0.0885, 0.0745, 0, 0, Math.PI / 2 - 1.15 + s * -0.12, 1.2, 0.8, 0.6));
    b.add('head', new THREE.CapsuleGeometry(0.0048, 0.026, 2, 6), P.brow, T(s * 0.034, 0.1075, 0.0795, 0, 0, s * (Math.PI / 2 - 0.2)));
    b.add('head', sphere(0.02, 8, 8), P.skin, T(s * 0.084, 0.088, -0.005, 0, 0, 0, 0.45, 1, 0.75));
  }
  // comm earpiece (left ear)
  b.add('head', new THREE.CylinderGeometry(0.022, 0.024, 0.016, 20), P.white, T(0.088, 0.088, -0.004, 0, 0, Math.PI / 2));
  b.add('head', new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), P.seam, T(0.097, 0.088, -0.004, 0, 0, Math.PI / 2));
  b.add('head', new THREE.CapsuleGeometry(0.004, 0.05, 2, 6), P.plate, T(0.082, 0.065, 0.03, 0.9, 0, 0.2));
  // hair: one cap tilted back (hairline high at the front, covers the nape), side-swept bangs
  b.add('head', sphere(0.111, 30, 18, 0, Math.PI * 0.68), P.hair, T(0, 0.122, -0.012, -0.8, 0, 0, 0.93, 1.0, 1.02));
  const bangs: [number, number, number, number][] = [
    // phi around the hairline, length, sideways sweep, width
    [-0.7, 0.066, 0.75, 1.0],
    [-0.46, 0.074, 0.66, 1.15],
    [-0.22, 0.072, 0.56, 1.2],
    [0.04, 0.066, 0.5, 1.2],
    [0.28, 0.06, 0.42, 1.1],
    [0.52, 0.054, 0.32, 1.0],
    [0.74, 0.05, 0.22, 0.9],
  ];
  bangs.forEach(([phi, len, sweep, wd], i) => {
    // flat locks hanging from the hairline, following the forehead, tips swept to one side (two-tone for depth)
    const r = 0.1;
    b.add(
      'head',
      cone(0.026, len, 8),
      i % 2 === 0 ? P.hair : P.hairHi,
      T(Math.sin(phi) * r * 0.9, 0.163 - len * 0.5, Math.cos(phi) * r * 0.93 - 0.004, Math.PI + 0.14, phi, sweep * 0.55, wd, 1, 0.26),
    );
  });
  for (const s of [-1, 1]) {
    b.add('head', cone(0.022, 0.15), P.hair, T(s * 0.08, 0.06, 0.035, Math.PI - 0.12, 0, s * -0.12));
    b.add('head', cone(0.02, 0.1), P.hair, T(s * 0.088, 0.05, -0.02, Math.PI - 0.05, 0, s * -0.2));
    // buns with messy spikes and gold ties
    const bx = s * 0.056;
    const by = 0.212;
    const bz = -0.035;
    b.add('head', sphere(0.044, 14, 10), P.hair, T(bx, by, bz, 0, 0, 0, 1, 0.9, 1));
    b.add('head', new THREE.TorusGeometry(0.033, 0.007, 6, 16), P.gold, T(bx * 0.92, by - 0.03, bz, Math.PI / 2 - 0.2, 0, s * 0.3));
    // a few short wisps (round 5: shorter, so the buns read as buns, not chestnuts)
    const spikes: [number, number, number][] = [
      [0.2, 0.0, 0.022],
      [0.9, 0.6, 0.019],
      [-0.5, -0.7, 0.02],
      [0.4, 2.4, 0.018],
      [-0.2, 3.6, 0.016],
    ];
    for (const [rx, ry, len] of spikes)
      b.add('head', cone(0.014, len, 5), P.hair, T(bx + Math.sin(ry) * 0.03 * s, by + 0.03, bz + Math.cos(ry) * 0.03, rx * 0.8, 0, -s * (0.35 + Math.sin(ry) * 0.4)));
  }
  // ================= TAIL (short lock at the back of the head, secondary motion)
  b.add('tail0', sphere(0.042, 14, 10), P.hair, T(0, -0.03, 0.016, 0, 0, 0, 1.3, 1.05, 0.7));
  b.add('tail1', sphere(0.034, 12, 8), P.hair, T(0, -0.02, 0.012, 0, 0, 0, 1.2, 1.1, 0.65));
  for (const x of [-0.022, 0.022]) b.add('tail1', cone(0.017, 0.05, 5), P.hair, T(x, -0.05, 0.01, Math.PI, 0, x * 8, 1, 1, 0.7));

  // ================= ARMS
  const upper = curve([
    [-0.28, 0.038],
    [-0.2, 0.042],
    [-0.1, 0.049],
    [-0.03, 0.053],
    [0.02, 0.047],
    [0.05, 0.02],
  ]);
  const fore = curve([
    [-0.255, 0.031],
    [-0.2, 0.034],
    [-0.1, 0.042],
    [-0.03, 0.041],
    [0.02, 0.036],
  ]);
  for (const s of [1, -1]) {
    const sh: BoneName = s === 1 ? 'shoulderL' : 'shoulderR';
    const el: BoneName = s === 1 ? 'elbowL' : 'elbowR';
    b.pieces(sh, surface((y) => upper(y), -0.28, 0.05, P.suit, { rows: 10, cols: 16 }));
    b.add(sh, sphere(0.058, 16, 12), P.suit, T(s * 0.006, -0.012, 0));
    // pauldron: white dome, gold cap, glowing rim
    const tilt = -s * 0.5;
    b.add(sh, sphere(0.079, 22, 10, 0, Math.PI * 0.52), P.white, T(s * 0.022, -0.006, 0, 0, 0, tilt, 1.12, 0.78, 1.15));
    b.add(sh, sphere(0.064, 18, 6, 0, Math.PI * 0.3), P.gold, T(s * 0.03, 0.006, 0, 0, 0, tilt, 1.12, 0.78, 1.15));
    b.add(sh, new THREE.TorusGeometry(0.079, 0.0055, 6, 32), P.seam, T(s * 0.0185, -0.009, 0, Math.PI / 2, 0, tilt, 1.12, 1.15, 1));
    b.add(sh, sphere(0.075, 18, 4, Math.PI * 0.52, Math.PI * 0.12), P.plate, T(s * 0.022, -0.006, 0, 0, 0, tilt, 1.14, 0.78, 1.17));
    // upper-arm outer plate
    b.pieces(sh, surface((y) => upper(y), -0.215, -0.08, P.white, { off: 0.008, thick: 0.008, rows: 6, cols: 10, phi: sym((s * Math.PI) / 2, 0.95) }));

    // forearm + gauntlet + hand
    b.pieces(el, surface((y) => fore(y), -0.26, 0.03, P.suit, { rows: 10, cols: 16 }));
    b.add(el, sphere(0.036, 12, 8), P.plate, T(0, 0, -0.014, 0, 0, 0, 1, 1, 0.8));
    const gOff = keys([
      [-0.235, 0.016],
      [-0.06, 0.009],
    ]);
    b.pieces(
      el,
      surface((y) => fore(y) + gOff(y), -0.225, -0.06, P.white, { off: 0.0, thick: 0.01, rows: 8, cols: 16, phi: sym((s * Math.PI) / 2, 2.3) }),
    );
    b.pieces(el, surface((y) => fore(y), -0.245, -0.222, P.gold, { off: 0.02, thick: 0.012, wall: P.gold, rows: 1, cols: 20 }));
    b.pieces(el, surface((y) => fore(y) + gOff(y), -0.2, -0.09, P.seam, { off: 0.004, rows: 4, cols: 2, phi: sym((s * Math.PI) / 2, 0.09) }));
    const [px, py, pz] = RIG.palm;
    b.add(el, rbox(0.032, 0.072, 0.07, 0.013), P.suit, T(px, py + 0.012, pz));
    b.add(el, rbox(0.027, 0.058, 0.064, 0.011), P.suit, T(px - s * 0.003, py - 0.05, pz + 0.012, 0.28, 0, 0));
    b.add(el, new THREE.CapsuleGeometry(0.011, 0.032, 3, 8), P.suit, T(px - s * 0.012, py + 0.008, pz + 0.04, 0.5, 0, s * 0.35));
    b.add(el, rbox(0.012, 0.04, 0.056, 0.005), P.plate, T(px + s * 0.018, py + 0.006, pz));
    b.add(el, rbox(0.006, 0.012, 0.03, 0.0025), P.orange, T(px + s * 0.0245, py + 0.006, pz));
  }

  // ================= LEGS
  const thighBase = curve([
    [-0.425, 0.046],
    [-0.36, 0.052],
    [-0.25, 0.064],
    [-0.12, 0.076],
    [-0.03, 0.083],
    [0.04, 0.078],
    [0.075, 0.055],
  ]);
  const shinBase = curve([
    [-0.385, 0.035],
    [-0.33, 0.036],
    [-0.22, 0.043],
    [-0.1, 0.051],
    [-0.03, 0.05],
    [0.035, 0.046],
  ]);
  const shin: RFn = (y, phi) => shinBase(y) * (1 + 0.16 * Math.max(0, -Math.cos(phi)) * bump(y, -0.11, 0.08));
  for (const s of [1, -1]) {
    const th: BoneName = s === 1 ? 'thighL' : 'thighR';
    const kn: BoneName = s === 1 ? 'kneeL' : 'kneeR';
    const an: BoneName = s === 1 ? 'ankleL' : 'ankleR';
    const thigh: RFn = (y, phi) => thighBase(y) * (1 + 0.06 * Math.max(0, Math.cos(phi - s * 0.4)) * bump(y, -0.12, 0.12));
    b.pieces(th, surface(thigh, -0.425, 0.075, P.suit, { sx: 0.97, rows: 14, cols: 20 }));
    b.pieces(
      th,
      surface(thigh, -0.345, -0.03, P.white, {
        sx: 0.97,
        off: 0.01,
        thick: 0.01,
        rows: 12,
        cols: 12,
        phi: (y) => {
          const h = keys([
            [-0.345, 0.62],
            [-0.03, 1.0],
          ])(y);
          return [s * 0.5 - h, s * 0.5 + h] as const;
        },
      }),
    );
    b.pieces(th, surface(thigh, -0.3, -0.09, P.ivory, { sx: 0.97, off: 0.009, thick: 0.009, rows: 8, cols: 8, phi: sym(s * 2.3, 0.42) }));
    b.pieces(th, surface(thigh, -0.32, -0.06, P.seam, { sx: 0.97, off: 0.004, rows: 6, cols: 2, phi: sym(s * 1.75, 0.04) }));

    b.pieces(kn, surface(shin, -0.385, 0.035, P.suit, { sx: 0.92, rows: 14, cols: 18 }));
    b.add(kn, sphere(0.047, 14, 10), P.suit, T(0, 0, 0));
    b.add(kn, sphere(0.052, 18, 10, 0, Math.PI * 0.5), P.white, T(0, -0.005, 0.028, Math.PI / 2, 0, 0, 0.95, 0.72, 1.2));
    b.add(kn, new THREE.TorusGeometry(0.052, 0.005, 6, 28), P.seam, T(0, -0.005, 0.029, 0, 0, 0, 0.95, 1.2, 1));
    b.add(kn, sphere(0.026, 12, 8, 0, Math.PI * 0.5), P.orange, T(0, -0.005, 0.062, Math.PI / 2, 0, 0, 0.9, 0.6, 1.1));
    b.pieces(kn, surface(shin, -0.3, -0.075, P.white, { sx: 0.92, off: 0.009, thick: 0.009, rows: 10, cols: 12, phi: sym(0, 0.9) }));
    b.pieces(kn, surface(shin, -0.27, -0.05, P.white, { sx: 0.92, off: 0.009, thick: 0.009, rows: 10, cols: 10, phi: sym(Math.PI, 0.75) }));
    b.pieces(kn, surface(shin, -0.27, -0.1, P.seam, { sx: 0.92, off: 0.0125, rows: 5, cols: 2, phi: sym(0, 0.05) }));

    // chunky sneaker boot
    const collarR = curve([
      [-0.06, 0.05],
      [-0.02, 0.047],
      [0.03, 0.043],
      [0.05, 0.039],
    ]);
    b.pieces(an, surface((y) => collarR(y), -0.06, 0.05, P.ivory, { sz: 1.08, rows: 4, cols: 18, thick: 0.012, wall: P.ivory, walls: { top: true } }));
    b.add(an, rbox(0.108, 0.082, 0.215, 0.037), P.white, T(0, -0.056, 0.036));
    b.add(an, rbox(0.1, 0.055, 0.08, 0.026), P.ivory, T(0, -0.073, 0.125, 0.06, 0, 0));
    b.add(an, rbox(0.12, 0.04, 0.262, 0.017), P.sole, T(0, -0.09, 0.036));
    b.add(an, rbox(0.114, 0.012, 0.252, 0.005), P.tread, T(0, -0.105, 0.036));
    b.add(an, rbox(0.052, 0.012, 0.095, 0.005), P.plate, T(0, -0.02, 0.07, 0.42, 0, 0));
    b.add(an, rbox(0.04, 0.05, 0.016, 0.006), P.orange, T(0, -0.04, -0.072));
    for (const side of [-1, 1]) {
      b.add(an, rbox(0.006, 0.016, 0.13, 0.003), P.orange, T(side * 0.0555, -0.06, 0.03, -0.22, 0, 0));
      b.add(an, rbox(0.006, 0.01, 0.07, 0.003), P.orange, T(side * 0.061, -0.085, 0.09, 0, 0, 0));
    }
  }

  return b.finish();
}

const shared: (Record<BoneName, THREE.BufferGeometry> | null)[] = [null, null];
/** Segment multiplier per LOD. */
const LOD_DETAIL = [1, 0.4] as const;

export type CharacterLod = 0 | 1;

/**
 * Shared, lazily-built per-bone geometries. Never dispose them (all characters reference the same ones).
 * `lod` 1 is the reduced-tessellation mesh used by the mobile preset (same bones, same draw calls, ~half the
 * triangles).
 */
export function characterGeometries(lod: CharacterLod = 0): Record<BoneName, THREE.BufferGeometry> {
  let g = shared[lod];
  if (!g) {
    DETAIL = LOD_DETAIL[lod];
    try {
      g = buildModel();
    } finally {
      DETAIL = 1;
    }
    shared[lod] = g;
  }
  return g;
}

/**
 * PBR suit material driven by the per-vertex paint attribute (roughness, metalness, emissive, clearcoat).
 * Player only; echoes use the hologram shader, which reads the same attributes.
 */
export function createSuitMaterial(lod: CharacterLod = 0): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    // LOD 1 drops the clearcoat lobe (a second specular evaluation per pixel); three.js compiles it out at 0
    clearcoat: lod === 0 ? 1 : 0,
    clearcoatRoughness: 0.32,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 paint;\nvarying vec4 vPaint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = paint;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vPaint;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vPaint.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vPaint.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vPaint.z;')
      .replace('material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * vPaint.w;');
  };
  m.customProgramCacheKey = () => 'recursion-suit-v1';
  return m;
}

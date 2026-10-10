import * as THREE from 'three';

/**
 * Procedural PBR texture generation (Canvas2D, generated once per renderer, cached, no downloads).
 *
 * Every set is painted with three parallel canvases sharing one layout:
 *   albedo  — sRGB base colour
 *   height  — greyscale, converted to a tangent-space normal map with a Sobel filter
 *   orm     — packed R = ambient occlusion, G = roughness, B = metalness (three.js channel convention)
 * plus an optional emissive mask. Layout helpers draw a shape into all canvases at once so seams, bevels
 * and trims line up perfectly between maps.
 */

export interface PBRSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  ormMap: THREE.Texture;
  emissiveMap?: THREE.Texture;
}

/** Deterministic hash noise (render side only; keeps screenshots stable). */
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fractal noise in [0,1]. */
export function fbm(x: number, y: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise((x / 1) * (p / basePeriod) , (y / 1) * (p / basePeriod), p, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

function canvas(size: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  return { c, g };
}

/** A shared-layout painter over albedo / height / orm (/ emissive) canvases. */
class Painter {
  readonly albedo;
  readonly height;
  readonly orm;
  readonly emissive;
  constructor(readonly size: number, withEmissive: boolean) {
    this.albedo = canvas(size);
    this.height = canvas(size);
    this.orm = canvas(size);
    this.emissive = withEmissive ? canvas(size) : null;
    this.emissive?.g.fillRect(0, 0, size, size);
  }

  /**
   * Fill a rect on all maps. `h` 0..255 height, `rough` 0..1, `metal` 0..1, `ao` 0..1.
   * `bevel` draws a soft height ramp at the rect edges (a beveled plate).
   */
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    o: { color: string; height: number; rough: number; metal: number; ao?: number; bevel?: number; emissive?: string },
  ): void {
    this.albedo.g.fillStyle = o.color;
    this.albedo.g.fillRect(x, y, w, h);
    const bevel = o.bevel ?? 0;
    if (bevel > 0) {
      for (let i = 0; i < bevel; i++) {
        const k = (i + 1) / bevel;
        const v = Math.round(o.height * (0.55 + 0.45 * Math.sin((k * Math.PI) / 2)));
        this.height.g.fillStyle = `rgb(${v},${v},${v})`;
        this.height.g.fillRect(x + i, y + i, w - 2 * i, h - 2 * i);
      }
    } else {
      this.height.g.fillStyle = `rgb(${o.height},${o.height},${o.height})`;
      this.height.g.fillRect(x, y, w, h);
    }
    const ao = Math.round((o.ao ?? 1) * 255);
    this.orm.g.fillStyle = `rgb(${ao},${Math.round(o.rough * 255)},${Math.round(o.metal * 255)})`;
    this.orm.g.fillRect(x, y, w, h);
    if (this.emissive) {
      this.emissive.g.fillStyle = o.emissive ?? '#000';
      this.emissive.g.fillRect(x, y, w, h);
    }
  }

  /** Line (seam / groove) on all maps. */
  line(x0: number, y0: number, x1: number, y1: number, width: number, o: { color: string; height: number; rough: number; metal: number; emissive?: string }): void {
    const draw = (g: CanvasRenderingContext2D, style: string) => {
      g.strokeStyle = style;
      g.lineWidth = width;
      g.lineCap = 'square';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    draw(this.albedo.g, o.color);
    draw(this.height.g, `rgb(${o.height},${o.height},${o.height})`);
    draw(this.orm.g, `rgb(255,${Math.round(o.rough * 255)},${Math.round(o.metal * 255)})`);
    if (this.emissive) draw(this.emissive.g, o.emissive ?? '#000');
  }

  /** Round bolt head. */
  bolt(x: number, y: number, r: number, color: string): void {
    const g = this.albedo.g;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    const grad = this.height.g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgb(255,255,255)');
    grad.addColorStop(1, 'rgb(150,150,150)');
    this.height.g.fillStyle = grad;
    this.height.g.beginPath();
    this.height.g.arc(x, y, r, 0, Math.PI * 2);
    this.height.g.fill();
    this.orm.g.fillStyle = 'rgb(255,90,240)';
    this.orm.g.beginPath();
    this.orm.g.arc(x, y, r, 0, Math.PI * 2);
    this.orm.g.fill();
  }

  /** Multiplies fbm grime/variation over albedo + roughness (wear, smudges). */
  grime(seed: number, strength: number, roughVar: number): void {
    const s = this.size;
    const a = this.albedo.g.getImageData(0, 0, s, s);
    const o = this.orm.g.getImageData(0, 0, s, s);
    const h = this.height.g.getImageData(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const n = fbm((x / s) * 4, (y / s) * 4, 4, 4, seed);
        const fine = hash2(x, y, seed + 3);
        const k = 1 - strength * (n - 0.5) * 2 - (fine - 0.5) * strength * 0.25;
        a.data[i] = Math.max(0, Math.min(255, a.data[i]! * k));
        a.data[i + 1] = Math.max(0, Math.min(255, a.data[i + 1]! * k));
        a.data[i + 2] = Math.max(0, Math.min(255, a.data[i + 2]! * k));
        o.data[i + 1] = Math.max(0, Math.min(255, o.data[i + 1]! + (n - 0.5) * 255 * roughVar + (fine - 0.5) * 18));
        h.data[i] = h.data[i + 1] = h.data[i + 2] = Math.max(0, Math.min(255, h.data[i]! + (fine - 0.5) * 3));
      }
    }
    this.albedo.g.putImageData(a, 0, 0);
    this.orm.g.putImageData(o, 0, 0);
    this.height.g.putImageData(h, 0, 0);
  }

  /** Directional streaks (brushed metal) added to roughness + height. */
  brushed(seed: number, horizontal: boolean, amount: number): void {
    const s = this.size;
    const o = this.orm.g.getImageData(0, 0, s, s);
    const h = this.height.g.getImageData(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const line = horizontal ? y : x;
        const along = horizontal ? x : y;
        const n = hash2(line, Math.floor(along / 48), seed) * 0.7 + hash2(line, 0, seed + 1) * 0.3;
        o.data[i + 1] = Math.max(0, Math.min(255, o.data[i + 1]! + (n - 0.5) * 255 * amount));
        h.data[i] = h.data[i + 1] = h.data[i + 2] = Math.max(0, Math.min(255, h.data[i]! + (n - 0.5) * 6));
      }
    }
    this.orm.g.putImageData(o, 0, 0);
    this.height.g.putImageData(h, 0, 0);
  }

  build(normalStrength: number, repeat = 1): PBRSet {
    const map = new THREE.CanvasTexture(this.albedo.c);
    map.colorSpace = THREE.SRGBColorSpace;
    const normalMap = heightToNormal(this.height.c, normalStrength);
    const ormMap = new THREE.CanvasTexture(this.orm.c);
    const set: PBRSet = { map, normalMap, ormMap };
    if (this.emissive) {
      const e = new THREE.CanvasTexture(this.emissive.c);
      e.colorSpace = THREE.SRGBColorSpace;
      set.emissiveMap = e;
    }
    for (const t of [set.map, set.normalMap, set.ormMap, set.emissiveMap]) {
      if (!t) continue;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
    }
    return set;
  }
}

/** Sobel height → tangent-space normal map (wrapping). */
export function heightToNormal(src: HTMLCanvasElement, strength: number): THREE.Texture {
  const s = src.width;
  const g = src.getContext('2d', { willReadFrequently: true })!;
  const hd = g.getImageData(0, 0, s, s).data;
  const out = canvas(s);
  const od = out.g.createImageData(s, s);
  const H = (x: number, y: number) => hd[(((y + s) % s) * s + ((x + s) % s)) * 4]! / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      od.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      od.data[i + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      od.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      od.data[i + 3] = 255;
    }
  }
  out.g.putImageData(od, 0, 0);
  return new THREE.CanvasTexture(out.c);
}

const SEAM = { color: '#15181c', height: 30, rough: 0.9, metal: 0.2 };

/**
 * Floor tile (one tile = whole texture): large warm-grey beveled slab with a shallow inset centre panel and
 * fine cross seams, slim brass corner inlays. Calm by design: the floor is the stage, not the show.
 */
export function floorTileTextures(size = 512): PBRSet {
  const p = new Painter(size, false);
  const u = size / 64;
  p.rect(0, 0, size, size, { color: '#1c1d20', height: 20, rough: 0.8, metal: 0.3, ao: 0.55 });
  // main slab
  p.rect(u * 1, u * 1, size - u * 2, size - u * 2, { color: '#7f7b73', height: 205, rough: 0.62, metal: 0.18, bevel: Math.round(u * 2.4) });
  // quartered outer field (very subtle tone shifts)
  const tones = ['#837f77', '#7b776f', '#7f7b72', '#79756d'];
  const q = [
    [3.5, 3.5],
    [32.5, 3.5],
    [3.5, 32.5],
    [32.5, 32.5],
  ] as const;
  q.forEach(([x, y], i) => p.rect(u * x, u * y, u * 28, u * 28, { color: tones[i]!, height: 200, rough: 0.6 + i * 0.02, metal: 0.18 }));
  p.line(u * 32, u * 3, u * 32, u * 61, u * 0.35, SEAM);
  p.line(u * 3, u * 32, u * 61, u * 32, u * 0.35, SEAM);
  // inset centre panel
  p.rect(u * 18, u * 18, u * 28, u * 28, { color: '#67645e', height: 172, rough: 0.45, metal: 0.45, bevel: Math.round(u * 1.6) });
  p.rect(u * 21, u * 21, u * 22, u * 22, { color: '#726f68', height: 186, rough: 0.5, metal: 0.4, bevel: Math.round(u) });
  const soft = { color: '#55524c', height: 150, rough: 0.6, metal: 0.3 };
  p.line(u * 21.5, u * 21.5, u * 42.5, u * 42.5, u * 0.3, soft);
  p.line(u * 42.5, u * 21.5, u * 21.5, u * 42.5, u * 0.3, soft);
  // slim brass corner inlays
  const brass = { color: '#b48a45', height: 220, rough: 0.3, metal: 1 };
  for (const [cx, cy, dx, dy] of [
    [3, 3, 1, 1],
    [61, 3, -1, 1],
    [3, 61, 1, -1],
    [61, 61, -1, -1],
  ] as const) {
    p.line(u * cx, u * cy, u * (cx + dx * 7), u * cy, u * 0.9, brass);
    p.line(u * cx, u * cy, u * cx, u * (cy + dy * 7), u * 0.9, brass);
    p.bolt(u * (cx + dx * 2.6), u * (cy + dy * 2.6), u * 0.9, '#7a6a4a');
  }
  p.grime(11, 0.16, 0.2);
  return p.build(2.6);
}

/** Shared base for floor variants: same slab, bevel and corner inlays as the main tile. */
function floorBase(p: Painter, u: number, size: number): void {
  p.rect(0, 0, size, size, { color: '#1c1d20', height: 20, rough: 0.8, metal: 0.3, ao: 0.55 });
  p.rect(u * 1, u * 1, size - u * 2, size - u * 2, { color: '#7f7b73', height: 205, rough: 0.6, metal: 0.18, bevel: Math.round(u * 2.4) });
  const brass = { color: '#b48a45', height: 220, rough: 0.3, metal: 1 };
  for (const [cx, cy, dx, dy] of [
    [3, 3, 1, 1],
    [61, 3, -1, 1],
    [3, 61, 1, -1],
    [61, 61, -1, -1],
  ] as const) {
    p.line(u * cx, u * cy, u * (cx + dx * 7), u * cy, u * 0.9, brass);
    p.line(u * cx, u * cy, u * cx, u * (cy + dy * 7), u * 0.9, brass);
  }
}

/** Floor variant: service grate with warm light glowing through the slots (emissive). */
export function floorGrateTextures(size = 512): PBRSet {
  const p = new Painter(size, true);
  const u = size / 64;
  floorBase(p, u, size);
  p.rect(u * 12, u * 12, u * 40, u * 40, { color: '#3a3c40', height: 150, rough: 0.5, metal: 0.7, bevel: Math.round(u * 1.2) });
  for (let i = 0; i < 9; i++) {
    const y = u * (15.5 + i * 4);
    p.rect(u * 15, y, u * 34, u * 1.7, { color: '#1a1408', height: 40, rough: 0.9, metal: 0.2, emissive: '#5a3a10' });
  }
  p.grime(31, 0.16, 0.2);
  return p.build(2.6);
}

/** Floor variant: brass ring inlay with a dark central boss (chronometer motif). */
export function floorEmblemTextures(size = 512): PBRSet {
  const p = new Painter(size, false);
  const u = size / 64;
  floorBase(p, u, size);
  const g = (c: CanvasRenderingContext2D, style: string, r: number, w: number) => {
    c.strokeStyle = style;
    c.lineWidth = w;
    c.beginPath();
    c.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    c.stroke();
  };
  g(p.albedo.g, '#b48a45', u * 17, u * 1.6);
  g(p.height.g, 'rgb(230,230,230)', u * 17, u * 1.6);
  g(p.orm.g, 'rgb(255,70,255)', u * 17, u * 1.6);
  g(p.albedo.g, '#2a2b2e', u * 13, u * 0.6);
  g(p.height.g, 'rgb(90,90,90)', u * 13, u * 0.6);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x0 = size / 2 + Math.cos(a) * u * 19;
    const y0 = size / 2 + Math.sin(a) * u * 19;
    const x1 = size / 2 + Math.cos(a) * u * (i % 3 === 0 ? 23 : 21);
    const y1 = size / 2 + Math.sin(a) * u * (i % 3 === 0 ? 23 : 21);
    p.line(x0, y0, x1, y1, u * 0.8, { color: '#b48a45', height: 225, rough: 0.3, metal: 1 });
  }
  p.rect(u * 27, u * 27, u * 10, u * 10, { color: '#3a3c40', height: 170, rough: 0.4, metal: 0.8, bevel: Math.round(u * 1.2) });
  p.grime(37, 0.16, 0.2);
  return p.build(2.6);
}

/**
 * Wall module (one tile wide x one full wall tall; the library maps it with repeat (1, 0.5) so each 2 m x 4 m
 * face shows exactly one module): gunmetal frieze under the cap, a tall painted ivory panel with a recessed
 * field, brass band, a slate-blue painted lower panel split in two, a dark seam and ribbed gunmetal skirting.
 * Canvas top = wall top.
 */
export function wallPanelTextures(size = 512): PBRSet {
  const p = new Painter(size, false);
  const u = size / 64;
  p.rect(0, 0, size, size, { color: '#22262c', height: 40, rough: 0.55, metal: 0.7, ao: 0.6 });
  // frieze + brass line
  p.rect(0, 0, size, u * 3.2, { color: '#2c3138', height: 120, rough: 0.5, metal: 0.75 });
  p.rect(0, u * 3.4, size, u * 0.8, { color: '#c39443', height: 230, rough: 0.3, metal: 1 });
  // tall ivory panel
  p.rect(u * 3.5, u * 5.5, u * 57, u * 25, { color: '#c9c3b5', height: 215, rough: 0.48, metal: 0.1, bevel: Math.round(u * 1.6) });
  p.rect(u * 8, u * 9, u * 48, u * 18, { color: '#b9b3a4', height: 192, rough: 0.52, metal: 0.1, bevel: Math.round(u * 0.9) });
  p.line(u * 32, u * 9, u * 32, u * 27, u * 0.3, SEAM);
  for (const x of [5.5, 58.5]) for (const y of [7.5, 28.5]) p.bolt(u * x, u * y, u * 0.55, '#8d8678');
  // brass band
  p.rect(0, u * 31.6, size, u * 1.3, { color: '#c39443', height: 238, rough: 0.28, metal: 1 });
  // slate lower panels
  for (const x of [3.5, 32.5]) {
    p.rect(u * x, u * 34.5, u * 28, u * 15.5, { color: '#4f5761', height: 200, rough: 0.5, metal: 0.35, bevel: Math.round(u * 1.2) });
    p.rect(u * (x + 3), u * 37.5, u * 22, u * 9.5, { color: '#454c55', height: 182, rough: 0.55, metal: 0.4, bevel: Math.round(u * 0.8) });
  }
  // seam + ribbed skirting
  p.rect(0, u * 51.5, size, u * 1, { color: '#121418', height: 30, rough: 0.9, metal: 0.2 });
  p.rect(u * 1.5, u * 53.5, u * 61, u * 9.5, { color: '#30353c', height: 190, rough: 0.42, metal: 0.75, bevel: Math.round(u * 1.0) });
  for (let i = 0; i < 9; i++) p.line(u * (5 + i * 6.75), u * 55, u * (5 + i * 6.75), u * 61.5, u * 0.55, { color: '#1d2025', height: 120, rough: 0.6, metal: 0.6 });
  p.grime(23, 0.1, 0.12);
  return p.build(2.6);
}

/** Floor variant: four raised quadrant plates around a brass cross inlay and boss (panel variation). */
export function floorPlateTextures(size = 512): PBRSet {
  const p = new Painter(size, false);
  const u = size / 64;
  floorBase(p, u, size);
  const tones = ['#85817a', '#7d7972', '#817d75', '#7a766f'];
  [
    [5, 5],
    [33.5, 5],
    [5, 33.5],
    [33.5, 33.5],
  ].forEach(([x, y], i) => {
    p.rect(u * x!, u * y!, u * 25.5, u * 25.5, { color: tones[i]!, height: 214, rough: 0.58 + i * 0.015, metal: 0.2, bevel: Math.round(u * 1.4) });
    for (let k = 0; k < 5; k++) p.line(u * (x! + 4), u * (y! + 5 + k * 4), u * (x! + 21.5), u * (y! + 5 + k * 4), u * 0.25, { color: '#6c6861', height: 196, rough: 0.62, metal: 0.2 });
  });
  const brass = { color: '#b48a45', height: 222, rough: 0.32, metal: 1 };
  p.rect(u * 31.2, u * 5, u * 1.6, u * 54, brass);
  p.rect(u * 5, u * 31.2, u * 54, u * 1.6, brass);
  p.rect(u * 28.5, u * 28.5, u * 7, u * 7, { color: '#3a3c40', height: 200, rough: 0.4, metal: 0.8, bevel: Math.round(u * 1.2) });
  p.bolt(u * 32, u * 32, u * 1.4, '#b48a45');
  p.grime(43, 0.16, 0.16);
  return p.build(2.6);
}

/** Hanging banner cloth (RGBA, V-notched hem): deep navy with gold border, bands and a chronometer emblem. */
export function bannerTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.clearRect(0, 0, 256, 512);
  const x0 = 0;
  const w = 256;
  g.save();
  g.beginPath();
  g.moveTo(x0, 0);
  g.lineTo(x0 + w, 0);
  g.lineTo(x0 + w, 440);
  g.lineTo(x0 + w / 2, 506);
  g.lineTo(x0, 440);
  g.closePath();
  g.clip();
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#16283d');
  grad.addColorStop(1, '#0d1726');
  g.fillStyle = grad;
  g.fillRect(x0, 0, w, 512);
  // vertical cloth folds
  for (let i = 0; i < 6; i++) {
    const fx = x0 + (i + 0.5) * (w / 6);
    const fg = g.createLinearGradient(fx - 20, 0, fx + 20, 0);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(0.5, i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(120,160,200,0.08)');
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fg;
    g.fillRect(fx - 20, 0, 40, 512);
  }
  g.strokeStyle = '#c99a48';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(x0 + 10, 0);
  g.lineTo(x0 + 10, 436);
  g.lineTo(x0 + w / 2, 496);
  g.lineTo(x0 + w - 10, 436);
  g.lineTo(x0 + w - 10, 0);
  g.stroke();
  g.fillStyle = '#c99a48';
  g.fillRect(x0, 34, w, 8);
  g.fillRect(x0, 380, w, 6);
  // chronometer emblem: ring, ticks, hourglass
  const cx = x0 + w / 2;
  const cy = 210;
  g.lineWidth = 9;
  g.beginPath();
  g.arc(cx, cy, 72, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, 56, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 === 0 ? 6 : 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 76, cy + Math.sin(a) * 76);
    g.lineTo(cx + Math.cos(a) * (i % 3 === 0 ? 98 : 88), cy + Math.sin(a) * (i % 3 === 0 ? 98 : 88));
    g.stroke();
  }
  g.beginPath();
  g.moveTo(cx - 26, cy - 36);
  g.lineTo(cx + 26, cy - 36);
  g.lineTo(cx - 26, cy + 36);
  g.lineTo(cx + 26, cy + 36);
  g.closePath();
  g.fill();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Holographic text panel (white glyphs + frame on black; tinted and made additive by the material). */
export function hologramTexture(text: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 4;
  // bracket frame
  for (const [x, dir] of [
    [28, 1],
    [996, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(x + dir * 40, 40);
    g.lineTo(x, 40);
    g.lineTo(x, 216);
    g.lineTo(x + dir * 40, 216);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(90, 196, 844, 3);
  g.fillRect(90, 58, 220, 3);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let px = 112;
  g.font = `600 ${px}px Orbitron, Rajdhani, "Segoe UI", system-ui, sans-serif`;
  while (px > 40 && g.measureText(text).width > 860) {
    px -= 6;
    g.font = `600 ${px}px Orbitron, Rajdhani, "Segoe UI", system-ui, sans-serif`;
  }
  g.fillText(text, 512, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Brushed brass/gold: subtle long streaks, tight rough variation. Used tiled on trims and fittings. */
export function brushedMetalTextures(size = 256): PBRSet {
  const p = new Painter(size, false);
  p.rect(0, 0, size, size, { color: '#c8963f', height: 128, rough: 0.32, metal: 1 });
  p.brushed(5, true, 0.22);
  p.grime(41, 0.05, 0.1);
  return p.build(0.6, 1);
}

/** Dark gunmetal with micro panel lines, for machinery and structural blocks (tileable). */
export function gunmetalTextures(size = 256): PBRSet {
  const p = new Painter(size, false);
  const u = size / 32;
  p.rect(0, 0, size, size, { color: '#2c3139', height: 140, rough: 0.5, metal: 0.8 });
  p.line(0, u * 16, size, u * 16, u * 0.3, SEAM);
  p.line(u * 16, 0, u * 16, size, u * 0.3, SEAM);
  for (const [x, y] of [
    [2, 2],
    [30, 2],
    [2, 30],
    [30, 30],
    [14, 14],
    [18, 18],
  ] as const)
    p.bolt(u * x, u * y, u * 0.6, '#454b54');
  p.grime(57, 0.18, 0.25);
  return p.build(2.0, 1);
}

/** Concrete / cast stone for the monumental backdrop and plinths (tileable). */
export function concreteTextures(size = 256): PBRSet {
  const p = new Painter(size, false);
  p.rect(0, 0, size, size, { color: '#5f5c57', height: 128, rough: 0.85, metal: 0 });
  p.line(0, size / 2, size, size / 2, 2, { color: '#3c3a36', height: 70, rough: 0.95, metal: 0 });
  p.grime(77, 0.25, 0.15);
  return p.build(1.4, 1);
}

/** Radial soft sprite (particles, glows, flares). */
export function radialSprite(size = 128, hardness = 0.25): THREE.Texture {
  const { c, g } = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(hardness, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Number label sprite for echo indices (crisp, glowing). */
export function labelTexture(text: string, color: string): THREE.Texture {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  // Hex badge
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = 64 + Math.cos(a) * 54;
    const y = 64 + Math.sin(a) * 54;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = 'rgba(6,20,32,0.72)';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.stroke();
  g.shadowBlur = 10;
  g.fillStyle = '#ffffff';
  g.font = '700 64px system-ui, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

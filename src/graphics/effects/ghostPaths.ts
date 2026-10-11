import * as THREE from 'three';
import { unitsToWorld } from '../../engine/contracts';
import { echoTint } from '../materials/palette';
import { labelTexture } from '../materials/textures';
import type { GhostPath } from './forecast';

/**
 * TEMPORAL PREVIEW GHOST PATHS (hold Q): a dashed trail on the floor for every echo's upcoming movement, in the
 * echo's tint, with a dot every second (bigger, labelled "2s", "4s"… every two seconds) and the echo's numbered hex
 * where it ends up. The part of a trail the preview playhead has already passed dims, and the dashes flow toward
 * the future (static with reduced motion). Read-only: built from `extractGhostPaths` output.
 */

const RIBBON_WIDTH = 0.22;
const FLOOR_LIFT = 0.07;

const RibbonShader = {
  vertexShader: /* glsl */ `
    attribute float aDist; attribute float aTick;
    varying float vDist; varying float vTick; varying float vSide;
    void main() {
      vDist = aDist; vTick = aTick; vSide = uv.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uTick; uniform float uTime; uniform float uFlow; uniform float uOpacity;
    varying float vDist; varying float vTick; varying float vSide;
    void main() {
      float dash = step(0.42, fract(vDist * 1.25 - uTime * uFlow));
      float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide * 2.0 - 1.0));
      float passed = vTick < uTick ? 0.22 : 1.0;
      float head = exp(-pow((vTick - uTick) / 18.0, 2.0)) * 0.8;
      float alpha = (dash * 0.85 + 0.12) * edge * passed * uOpacity + head * edge * uOpacity;
      gl_FragColor = vec4(uColor * (1.4 + head), clamp(alpha, 0.0, 1.0));
    }`,
};

const DotShader = {
  vertexShader: /* glsl */ `
    attribute float aTick; attribute float aBig;
    uniform float uPx;
    varying float vTick; varying float vBig;
    void main() {
      vTick = aTick; vBig = aBig;
      gl_PointSize = (aBig > 0.5 ? 18.0 : 11.0) * uPx;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uTick; uniform float uOpacity;
    varying float vTick; varying float vBig;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float d = abs(p.x) + abs(p.y);                     // diamond
      float body = 1.0 - smoothstep(0.78, 0.9, d);
      float core = 1.0 - smoothstep(0.3, 0.45, d);
      float passed = vTick < uTick ? 0.3 : 1.0;
      float a = body * passed * uOpacity;
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uColor * 1.5, vec3(1.0), core * 0.6), a);
    }`,
};

interface PathVisual {
  ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  dots: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  labels: THREE.Sprite[];
}

export type TextTextureFactory = (text: string, color: string) => THREE.Texture;

export class GhostPathLayer {
  readonly group = new THREE.Group();
  private visuals: PathVisual[] = [];
  private paths: readonly GhostPath[] | null = null;
  private readonly textures = new Map<string, THREE.Texture>();
  private pixelScale = 1;
  private flow = 1;
  private opacity = 0;

  constructor(
    private readonly makeBadge: TextTextureFactory = labelTexture,
    private readonly makeText: TextTextureFactory = secondsTexture,
  ) {
    this.group.name = 'ghost-paths';
  }

  /** Paths to draw (null/empty clears them). Geometry is rebuilt only when the array identity changes. */
  setPaths(paths: readonly GhostPath[] | null): void {
    if (paths === this.paths) return;
    this.paths = paths;
    this.clear();
    if (!paths) return;
    for (const p of paths) this.visuals.push(this.build(p));
  }

  get pathCount(): number {
    return this.visuals.length;
  }

  /** Device pixel ratio (dot size); reduced motion stops the dash flow. */
  configure(o: { pixelScale?: number; reducedMotion?: boolean }): void {
    if (o.pixelScale !== undefined) this.pixelScale = o.pixelScale;
    if (o.reducedMotion !== undefined) this.flow = o.reducedMotion ? 0 : 1;
  }

  /** `tick` = the moment the 3D view shows (preview playhead). */
  update(tick: number, time: number, dt: number): void {
    const want = this.visuals.length ? 1 : 0;
    this.opacity = want ? Math.min(1, this.opacity + dt * 4) : 0;
    for (const v of this.visuals) {
      const ru = v.ribbon.material.uniforms;
      ru['uTick']!.value = tick;
      ru['uTime']!.value = time;
      ru['uFlow']!.value = this.flow;
      ru['uOpacity']!.value = this.opacity;
      const du = v.dots.material.uniforms;
      du['uTick']!.value = tick;
      du['uPx']!.value = this.pixelScale;
      du['uOpacity']!.value = this.opacity;
      for (const l of v.labels) (l.material as THREE.SpriteMaterial).opacity = this.opacity;
    }
    this.group.visible = this.visuals.length > 0;
  }

  private texture(kind: 'badge' | 'text', text: string, color: string): THREE.Texture {
    const key = `${kind}|${text}|${color}`;
    let t = this.textures.get(key);
    if (!t) {
      t = kind === 'badge' ? this.makeBadge(text, color) : this.makeText(text, color);
      this.textures.set(key, t);
    }
    return t;
  }

  private build(path: GhostPath): PathVisual {
    const tint = new THREE.Color(echoTint(path.echoIndex));
    const css = `#${tint.getHexString()}`;
    const pts = path.points.map((p) => new THREE.Vector3(unitsToWorld(p.x), unitsToWorld(p.y) + FLOOR_LIFT, unitsToWorld(p.z)));
    // nested-loop copies sit slightly to the side so overlapping trails stay readable
    const side = (path.recursion ?? 0) * 0.12;

    const n = pts.length;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const dist = new Float32Array(n * 2);
    const ticks = new Float32Array(n * 2);
    const index: number[] = [];
    let acc = 0;
    let nx = 1;
    let nz = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i] as THREE.Vector3;
      const a = pts[Math.max(0, i - 1)] as THREE.Vector3;
      const b = pts[Math.min(n - 1, i + 1)] as THREE.Vector3;
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const len = Math.hypot(tx, tz);
      if (len > 1e-4) {
        nx = -tz / len;
        nz = tx / len;
      }
      if (i > 0) acc += p.distanceTo(pts[i - 1] as THREE.Vector3);
      const ox = nx * (RIBBON_WIDTH / 2);
      const oz = nz * (RIBBON_WIDTH / 2);
      const cx = p.x + nx * side;
      const cz = p.z + nz * side;
      pos.set([cx - ox, p.y, cz - oz, cx + ox, p.y, cz + oz], i * 6);
      uv.set([0, 0, 0, 1], i * 4);
      dist[i * 2] = dist[i * 2 + 1] = acc;
      ticks[i * 2] = ticks[i * 2 + 1] = (path.points[i] as GhostPath['points'][number]).tick;
      if (i < n - 1) {
        const k = i * 2;
        index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
    geo.setAttribute('aTick', new THREE.BufferAttribute(ticks, 1));
    geo.setIndex(index);
    const ribbonMat = new THREE.ShaderMaterial({
      ...RibbonShader,
      uniforms: { uColor: { value: tint.clone() }, uTick: { value: 0 }, uTime: { value: 0 }, uFlow: { value: this.flow }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const ribbon = new THREE.Mesh(geo, ribbonMat);
    ribbon.renderOrder = 18;
    ribbon.frustumCulled = false;

    const mp = new Float32Array(path.markers.length * 3);
    const mt = new Float32Array(path.markers.length);
    const mb = new Float32Array(path.markers.length);
    path.markers.forEach((m, i) => {
      mp.set([unitsToWorld(m.x), unitsToWorld(m.y) + FLOOR_LIFT + 0.02, unitsToWorld(m.z)], i * 3);
      mt[i] = m.tick;
      mb[i] = m.seconds % 2 === 0 ? 1 : 0;
    });
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    dg.setAttribute('aTick', new THREE.BufferAttribute(mt, 1));
    dg.setAttribute('aBig', new THREE.BufferAttribute(mb, 1));
    const dots = new THREE.Points(
      dg,
      new THREE.ShaderMaterial({
        ...DotShader,
        uniforms: { uColor: { value: tint.clone() }, uTick: { value: 0 }, uPx: { value: this.pixelScale }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
      }),
    );
    dots.renderOrder = 19;
    dots.frustumCulled = false;

    const labels: THREE.Sprite[] = [];
    const mkSprite = (tex: THREE.Texture, w: number, h: number, at: THREE.Vector3): THREE.Sprite => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      s.scale.set(w, h, 1);
      s.position.copy(at);
      s.renderOrder = 20;
      labels.push(s);
      return s;
    };
    for (const m of path.markers) {
      if (m.seconds % 2 !== 0) continue;
      mkSprite(this.texture('text', `${m.seconds}s`, css), 0.5, 0.25, new THREE.Vector3(unitsToWorld(m.x), unitsToWorld(m.y) + 0.42, unitsToWorld(m.z)));
    }
    const end = pts[n - 1] as THREE.Vector3;
    const badgeText = path.recursion ? `${path.echoIndex + 1}′` : String(path.echoIndex + 1);
    mkSprite(this.texture('badge', badgeText, css), 0.55, 0.55, end.clone().setY(end.y + 0.55));

    const v: PathVisual = { ribbon, dots, labels };
    this.group.add(ribbon, dots, ...labels);
    return v;
  }

  private clear(): void {
    for (const v of this.visuals) {
      v.ribbon.geometry.dispose();
      v.ribbon.material.dispose();
      v.dots.geometry.dispose();
      v.dots.material.dispose();
      for (const l of v.labels) (l.material as THREE.SpriteMaterial).dispose();
    }
    this.visuals = [];
    this.group.clear();
  }

  dispose(): void {
    this.clear();
    this.paths = null;
    this.group.removeFromParent();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}

/** Small glowing "2s" caption (canvas texture). */
export function secondsTexture(text: string, color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.font = '700 38px system-ui, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 10;
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(4,14,24,0.85)';
  g.strokeText(text, 64, 34);
  g.fillStyle = '#ffffff';
  g.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

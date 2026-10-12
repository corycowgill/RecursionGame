import * as THREE from 'three';
import { SIM_HZ, type ActorClass, type Dir4, type EntityView, type SimEvent, type SimView } from '../../engine/contracts';
import { PALETTE } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { damp, facingRotY, Parts, type EntityFrame, type EntityVisual, type EntityVisualContext } from './types';

/*
 * ROUND-6 EXPANSION VISUALS (art-bible style: brass + ivory + gunmetal, teal = active machinery, coral = refusal,
 * violet = advanced temporal; never colour alone: every state also has a SHAPE or MOTION cue).
 *
 *   ChronoRelayVisual  "Echo Line": a glass conduit tube from the relay to the entity it drives. Every in-flight edge of
 *                      the relay (state.pending) is drawn literally: a lit teal segment sliding along the tube at position
 *                      1 - countdown / delayTicks; it reaches the output node exactly when the target reacts. A brass dial
 *                      at the input end is engraved with the delay in seconds and its hand sweeps with the oldest packet.
 *   CheckValveVisual   arched brass frame with a three-fin turnstile; gold floor chevrons on both approaches point the
 *                      allowed way; teal strip on the upstream approach, coral bar on the downstream face. Fins turn on
 *                      valvePass, rattle + coral X on valveDenied, a violet sweep rotates the chevrons on valveFlip.
 *   AttunedDecor       overlays for gold (crown glyph, solid inlay) / cyan (hollow ring, echo chevrons, after-image)
 *                      devices and Paradox Glass (translucent, hairline cracks that brighten near a forbidden body,
 *                      coral fractures once shattered). Used by PressurePlateVisual and TimedSwitchVisual.
 */

/* ------------------------------------------------------------------------------------------------------------------ */
/* Chrono relay                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export const RELAY_MAX_SEGMENTS = 8;

/**
 * Pure helper (tested): lit intervals [a, b] in tube parameter space (0 = input end at the relay, 1 = output end) for a
 * relay state. `alpha` is the render interpolation within the current tick (countdowns fall by one per tick). Region
 * nearest the output carries the current output, each in-flight edge flips the level, and the region nearest the input
 * carries the last input value.
 */
export function relaySegments(pending: readonly number[], out: boolean, last: boolean, delayTicks: number, alpha = 1): [number, number][] {
  const d = Math.max(1, delayTicks);
  const pos = pending.map((c) => Math.min(1, Math.max(0, 1 - (c + 1 - alpha) / d)));
  const segs: [number, number][] = [];
  let level = out;
  let hi = 1;
  for (const p of pos) {
    if (level && hi > p) segs.push([p, hi]);
    level = !level;
    hi = p;
  }
  if (last && hi > 0) segs.push([0, hi]);
  // merge touching intervals (identical positions) and keep the ones nearest the output first
  return segs.slice(0, RELAY_MAX_SEGMENTS);
}

/** Planned arrival ticks of the in-flight edges (absolute), e.g. for timeline markers ("arrives 12.4 s"). */
export function relayArrivals(tick: number, pending: readonly number[]): number[] {
  return pending.map((c) => tick + c);
}

function relayCoreMaterial(): THREE.ShaderMaterial {
  const segs = Array.from({ length: RELAY_MAX_SEGMENTS }, () => new THREE.Vector2(-1, -1));
  return new THREE.ShaderMaterial({
    uniforms: {
      uSeg: { value: segs },
      uTime: { value: 0 },
      uLen: { value: 1 },
      uLit: { value: new THREE.Color(PALETTE.teal) },
      uIdle: { value: new THREE.Color(PALETTE.cyanDeep) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uSeg[${RELAY_MAX_SEGMENTS}];
      uniform float uTime; uniform float uLen; uniform vec3 uLit; uniform vec3 uIdle;
      varying vec2 vUv;
      void main() {
        float s = vUv.x;
        float lit = 0.0; float head = 0.0;
        for (int i = 0; i < ${RELAY_MAX_SEGMENTS}; i++) {
          vec2 g = uSeg[i];
          if (g.y <= g.x) continue;
          float inside = step(g.x, s) * step(s, g.y);
          lit = max(lit, inside);
          // bright leading edge (towards the output) so the motion reads even in a still frame
          head = max(head, exp(-pow((s - g.y) * uLen * 6.0, 2.0)) * step(0.0005, g.y - g.x));
        }
        float dash = 0.65 + 0.35 * step(0.5, fract(s * uLen * 2.5 - uTime * 2.0));
        vec3 col = uIdle * 0.18 + uLit * (lit * dash * 2.2 + head * 3.0);
        gl_FragColor = vec4(col, 0.25 + 0.75 * max(lit, head));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Brass dial face with the delay engraved in seconds (canvas texture; plain disc where no 2D canvas exists). */
function dialTexture(seconds: number): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#2b3038';
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9963f';
  g.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50);
    g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58);
    g.stroke();
  }
  g.fillStyle = '#ffd27a';
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const txt = Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
  g.fillText(txt, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ChronoRelayVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly coreMat: THREE.ShaderMaterial;
  private readonly hand: THREE.Mesh;
  private readonly bulbMat: THREE.MeshStandardMaterial;
  private readonly delay: number;
  private readonly tex: THREE.Texture | null;
  private chime = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib, def, grid, level } = ctx;
    const p = this.p;
    this.delay = def.kind === 'chronoRelay' ? Math.max(1, def.config.delayTicks) : 60;
    const T = 2;
    const baseY = (def.level ?? Math.max(0, grid.tileAt(def.col, def.row).h)) * T;
    const H = 0.55;
    // Route: towards the first entity the relay drives (x then z, like the floor wires); else two cells along facing.
    const wire = level?.wires.filter((w) => w.from === def.id).sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))[0];
    const target = wire ? level?.entities.find((e) => e.id === wire.to) : undefined;
    const f = (def.facing ?? 2) as Dir4;
    const tc = target ? { col: target.col, row: target.row } : { col: def.col + (f === 1 ? 2 : f === 3 ? -2 : 0), row: def.row + (f === 2 ? 2 : f === 0 ? -2 : 0) };
    const tY = target ? (target.level ?? Math.max(0, grid.tileAt(target.col, target.row).h)) * T : baseY;
    const pts: THREE.Vector3[] = [new THREE.Vector3(0, H, 0)];
    const dx = (tc.col - def.col) * T;
    const dz = (tc.row - def.row) * T;
    // stop half a cell short of the target centre so the output node sits at the device, not inside it
    const shortX = dz === 0 ? Math.sign(dx) * 0.55 : 0;
    const shortZ = dz !== 0 ? Math.sign(dz) * 0.55 : 0;
    if (dx !== 0 && dz !== 0) pts.push(new THREE.Vector3(dx, H, 0));
    pts.push(new THREE.Vector3(dx - shortX, H + (tY - baseY), dz - shortZ));
    if (pts.length === 2 && pts[0]!.distanceTo(pts[1]!) < 0.2) pts[1]!.set(0, H, 1.5);
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i + 1 < pts.length; i++) path.add(new THREE.LineCurve3(pts[i]!, pts[i + 1]!));
    const len = path.getLength();
    const seg = Math.max(8, Math.ceil(len * 10));
    // outer glass + inner signal core
    p.mesh(p.geo(new THREE.TubeGeometry(path, seg, 0.13, 12, false)), lib.glass, this.root, 0, 0, 0, false);
    this.coreMat = p.mat(relayCoreMaterial());
    this.coreMat.uniforms['uLen']!.value = len;
    const core = p.dyn(p.mesh(p.geo(new THREE.TubeGeometry(path, seg, 0.065, 8, false)), this.coreMat, this.root, 0, 0, 0, false));
    core.renderOrder = 3;
    // brass collars roughly every metre, brackets down to the floor
    const collar = p.torus(0.15, 0.025, 20, 6);
    const n = Math.max(2, Math.round(len));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const at = path.getPointAt(u);
      const tan = path.getTangentAt(u);
      const m = p.mesh(collar, lib.brass, this.root, at.x, at.y, at.z, false);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
      if (i > 0 && i < n) p.mesh(p.box(0.04, H - 0.1, 0.04), lib.gunmetalDark, this.root, at.x, (at.y - H) + (H - 0.1) / 2, at.z);
    }
    // input dial (engraved delay) facing up-and-out at the relay end
    const dial = new THREE.Group();
    dial.position.set(0, H + 0.42, 0);
    this.root.add(dial);
    p.mesh(p.box(0.08, 0.32, 0.08), lib.brass, this.root, 0, H + 0.16, 0);
    const ring = p.mesh(p.torus(0.27, 0.035, 32, 8), lib.brass, dial, 0, 0, 0);
    void ring;
    this.tex = dialTexture(this.delay / SIM_HZ);
    const faceMat = this.tex ? p.mat(new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.5, metalness: 0.3, emissive: new THREE.Color(0xffffff), emissiveMap: this.tex, emissiveIntensity: 0.45 })) : lib.gunmetal;
    const face = p.mesh(p.geo(new THREE.CircleGeometry(0.26, 32)), faceMat, dial, 0, 0, 0.01, false);
    const faceBack = p.mesh(p.geo(new THREE.CircleGeometry(0.26, 32)), faceMat, dial, 0, 0, -0.01, false);
    faceBack.rotation.y = Math.PI;
    void face;
    this.hand = p.dyn(p.mesh(p.box(0.025, 0.2, 0.012), lib.emissive(PALETTE.teal, 2.4), dial, 0, 0, 0.03, false));
    this.hand.geometry.translate(0, 0.1, 0);
    // face the dial towards the tube direction's side so the number reads from the default camera
    dial.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
    // output node at the far end
    const end = pts[pts.length - 1]!;
    p.mesh(p.cyl(0.17, 0.17, 0.12, 20), lib.brass, this.root, end.x, end.y, end.z).rotation.x = Math.PI / 2;
    this.bulbMat = p.mat(lib.emissiveUnique(PALETTE.teal, 0.4));
    p.dyn(p.mesh(p.geo(new THREE.SphereGeometry(0.12, 16, 10)), this.bulbMat, this.root, end.x, end.y + 0.02, end.z, false));
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'chronoRelay'>;
    const s = e.state;
    const segs = relaySegments(s.pending, s.out, s.last, this.delay, f.alpha);
    const u = this.coreMat.uniforms['uSeg']!.value as THREE.Vector2[];
    for (let i = 0; i < RELAY_MAX_SEGMENTS; i++) {
      const g = segs[i];
      u[i]!.set(g ? g[0] : -1, g ? g[1] : -1);
    }
    this.coreMat.uniforms['uTime']!.value = f.time;
    const oldest = s.pending.length > 0 ? 1 - (s.pending[0]! + 1 - f.alpha) / this.delay : 0;
    this.hand.rotation.z = -Math.max(0, Math.min(1, oldest)) * Math.PI * 2;
    this.chime = Math.max(0, this.chime - f.dt * 2.5);
    this.bulbMat.emissiveIntensity = (s.out ? 3.2 : 0.35) + this.chime * 3;
    this.root.position.copy(f.pos);
  }

  onEvent(ev: SimEvent): void {
    if (ev.type === 'entity' && ev.name === 'relayEmit' && ev.value === 1) this.chime = 1;
  }

  dispose(): void {
    this.tex?.dispose();
    this.p.dispose();
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Check valve                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

function chevronGeometry(p: Parts, w: number, depth: number, thick: number): THREE.BufferGeometry {
  // A "V" pointing +z built from two bars.
  const g1 = new THREE.BoxGeometry(thick, 0.02, w * 0.75);
  g1.rotateY(Math.PI / 4);
  g1.translate(-w * 0.27, 0, -depth * 0.0);
  const g2 = new THREE.BoxGeometry(thick, 0.02, w * 0.75);
  g2.rotateY(-Math.PI / 4);
  g2.translate(w * 0.27, 0, 0);
  const merged = new THREE.BufferGeometry();
  const a = g1.toNonIndexed();
  const b = g2.toNonIndexed();
  const pos = new Float32Array(a.attributes['position']!.array.length + b.attributes['position']!.array.length);
  pos.set(a.attributes['position']!.array as Float32Array, 0);
  pos.set(b.attributes['position']!.array as Float32Array, a.attributes['position']!.array.length);
  const nor = new Float32Array(pos.length);
  nor.set(a.attributes['normal']!.array as Float32Array, 0);
  nor.set(b.attributes['normal']!.array as Float32Array, a.attributes['normal']!.array.length);
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  for (const g of [g1, g2, a, b]) g.dispose();
  return p.geo(merged);
}

export class CheckValveVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly fins = new THREE.Group();
  private readonly flow = new THREE.Group();
  private readonly chevMat: THREE.MeshStandardMaterial;
  private readonly xMat: THREE.MeshStandardMaterial;
  private readonly xMark: THREE.Group;
  private readonly gold = new THREE.Color(PALETTE.gold);
  private readonly violet = new THREE.Color(PALETTE.violet);
  private dir: Dir4 | null = null;
  private angle = 0;
  private fromAngle = 0;
  private toAngle = 0;
  private sweep = 1;
  private finAngle = 0;
  private finTarget = 0;
  private denied = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    const frame = new THREE.Group();
    frame.rotation.y = facingRotY(def.facing);
    this.root.add(frame);
    // arched brass frame across the corridor (local x = lateral, local z = travel axis)
    const postH = 1.7;
    for (const s of [-1, 1]) {
      p.mesh(p.rbox(0.22, postH, 0.34, 0.04), lib.ivory, frame, s * 0.88, postH / 2, 0);
      p.mesh(p.box(0.25, 0.07, 0.37), lib.brass, frame, s * 0.88, 0.3, 0);
    }
    const arch = p.mesh(p.geo(new THREE.TorusGeometry(0.88, 0.07, 10, 32, Math.PI)), lib.brass, frame, 0, postH, 0);
    void arch;
    p.mesh(p.geo(new THREE.TorusGeometry(0.88, 0.02, 6, 32, Math.PI)), lib.emissive(PALETTE.gold, 1.4), frame, 0, postH, 0.08, false);
    // three-fin turnstile on a hub at the left post, axle along the travel axis
    const hub = new THREE.Group();
    hub.position.set(-0.7, 0.95, 0);
    frame.add(hub);
    p.mesh(p.cyl(0.11, 0.11, 0.3, 16), lib.brass, hub, 0, 0, 0).rotation.x = Math.PI / 2;
    hub.add(this.fins);
    p.dyn(this.fins);
    const finGeo = p.rbox(0.82, 0.07, 0.07, 0.025);
    finGeo.translate(0.41, 0, 0);
    for (let i = 0; i < 3; i++) {
      const fin = p.mesh(finGeo, lib.gunmetal, this.fins, 0, 0, 0);
      fin.rotation.z = (i * Math.PI * 2) / 3;
      const tip = p.mesh(p.box(0.08, 0.1, 0.1), lib.brass, this.fins, Math.cos(fin.rotation.z) * 0.82, Math.sin(fin.rotation.z) * 0.82, 0);
      void tip;
    }
    // flow group: rotated to the CURRENT allowed direction (+z local = downstream)
    this.root.add(this.flow);
    p.dyn(this.flow);
    this.chevMat = p.mat(lib.emissiveUnique(PALETTE.gold, 2.2));
    const chev = chevronGeometry(p, 0.7, 0.4, 0.09);
    for (const z of [-2.0, -1.55, -0.25, 0.25, 1.55, 2.0]) p.mesh(chev, this.chevMat, this.flow, 0, 0.03, z, false);
    // upstream approach strip (teal) and downstream face bar (coral)
    p.mesh(p.box(1.5, 0.02, 0.1), lib.emissive(PALETTE.teal, 2.2), this.flow, 0, 0.03, -0.95, false);
    p.mesh(p.box(1.5, 0.1, 0.06), lib.emissive(PALETTE.coral, 2.0), this.flow, 0, 0.6, 0.45, false);
    p.mesh(p.box(1.5, 0.05, 0.05), lib.gunmetalDark, this.flow, 0, 0.6, 0.42);
    // denial X on the downstream face
    this.xMat = p.mat(lib.emissiveUnique(PALETTE.coral, 0));
    this.xMark = new THREE.Group();
    this.xMark.position.set(0, 1.0, 0.5);
    for (const r of [Math.PI / 4, -Math.PI / 4]) p.mesh(p.box(0.08, 0.6, 0.03), this.xMat, this.xMark, 0, 0, 0, false).rotation.z = r;
    this.flow.add(this.xMark);
    p.dyn(this.xMark);
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'checkValve'>;
    const d = e.state.dir;
    const target = facingRotY(d);
    if (this.dir === null) {
      this.angle = this.toAngle = this.fromAngle = target;
      this.sweep = 1;
    } else if (d !== this.dir) {
      this.fromAngle = this.angle;
      // rotate the short way round (a reversal is a half turn)
      let delta = target - this.angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.toAngle = this.angle + delta;
      this.sweep = 0;
    }
    this.dir = d;
    if (this.sweep < 1) {
      this.sweep = Math.min(1, this.sweep + f.dt / 0.55);
      const k = this.sweep * this.sweep * (3 - 2 * this.sweep);
      this.angle = this.fromAngle + (this.toAngle - this.fromAngle) * k;
    }
    this.flow.rotation.y = this.angle;
    const sweepGlow = Math.sin(Math.PI * this.sweep);
    this.chevMat.emissive.copy(this.gold).lerp(this.violet, sweepGlow);
    // chevrons crawl forward (motion cue for the allowed direction)
    this.chevMat.emissiveIntensity = 1.6 + 0.6 * Math.sin(f.time * 4) + sweepGlow * 2;
    this.finAngle = damp(this.finAngle, this.finTarget, 14, f.dt);
    this.denied = Math.max(0, this.denied - f.dt / 0.6);
    this.fins.rotation.z = this.finAngle + (this.denied > 0 ? Math.sin(f.time * 60) * 0.06 * this.denied : 0);
    this.xMat.emissiveIntensity = this.denied * 3.2;
    this.xMark.visible = this.denied > 0.01;
    this.root.position.copy(f.pos);
  }

  onEvent(ev: SimEvent): void {
    if (ev.type !== 'entity') return;
    if (ev.name === 'valvePass') this.finTarget -= (Math.PI * 2) / 3;
    else if (ev.name === 'valveDenied') this.denied = 1;
  }

  dispose(): void {
    this.p.dispose();
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Attuned devices / Paradox Glass overlay                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface AttunedConfig {
  accepts?: ActorClass;
  shatterOn?: 'echoes' | 'player';
}

const classOf = (kind: string): 'player' | 'echoes' => (kind === 'player' ? 'player' : 'echoes');

/**
 * Overlay for an attuned and/or glass device, attached to a parent group at a given height (plate top or console head).
 * `radius` scales the glyphs. update() takes the device's cell and the world state.
 */
export class AttunedDecor {
  readonly group = new THREE.Group();
  readonly accepts: ActorClass;
  readonly glass: boolean;
  private readonly crackMat: THREE.MeshStandardMaterial | null = null;
  private readonly fractures: THREE.Group | null = null;
  private readonly after: THREE.Mesh | null = null;
  private readonly afterMat: THREE.MeshBasicMaterial | null = null;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly coral = new THREE.Color(PALETTE.coral);
  private readonly base: THREE.Color;
  private pulse = 0;

  constructor(
    p: Parts,
    lib: MaterialLibrary,
    cfg: AttunedConfig,
    radius: number,
    private readonly col: number,
    private readonly row: number,
  ) {
    this.accepts = cfg.accepts ?? 'all';
    this.glass = cfg.shatterOn !== undefined;
    p.dyn(this.group);
    const gold = this.accepts === 'player';
    const cyan = this.accepts === 'echoes';
    this.base = new THREE.Color(gold ? PALETTE.gold : cyan ? PALETTE.cyan : PALETTE.white);
    this.rimMat = p.mat(lib.emissiveUnique(this.base.getHex(), gold || cyan ? 1.8 : 0.6));
    if (gold) {
      // single gold rim + solid inlay + crown glyph
      const rim = p.geo(new THREE.RingGeometry(radius * 0.93, radius, 48));
      rim.rotateX(-Math.PI / 2);
      p.mesh(rim, this.rimMat, this.group, 0, 0.004, 0, false);
      const inlay = p.geo(new THREE.CircleGeometry(radius * 0.45, 32));
      inlay.rotateX(-Math.PI / 2);
      p.mesh(inlay, lib.emissive(PALETTE.gold, 1.5), this.group, 0, 0.006, 0, false);
      const crown = new THREE.Group();
      crown.position.y = 0.01;
      this.group.add(crown);
      p.mesh(p.box(radius * 0.6, 0.03, radius * 0.12), lib.brass, crown, 0, 0.015, radius * 0.1);
      for (const x of [-1, 0, 1]) {
        const spike = p.mesh(p.geo(new THREE.ConeGeometry(radius * 0.08, radius * (x === 0 ? 0.32 : 0.24), 4)), lib.brass, crown, x * radius * 0.24, 0.015, -radius * 0.05);
        spike.rotation.x = -Math.PI / 2;
        spike.position.z -= radius * 0.1;
      }
    } else if (cyan) {
      // hollow ring with echo chevrons and a repeating after-image
      const rim = p.geo(new THREE.RingGeometry(radius * 0.62, radius * 0.72, 48));
      rim.rotateX(-Math.PI / 2);
      p.mesh(rim, this.rimMat, this.group, 0, 0.004, 0, false);
      const chev = p.geo(new THREE.ConeGeometry(radius * 0.09, radius * 0.18, 3));
      chev.rotateX(Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const m = p.mesh(chev, this.rimMat, this.group, Math.sin(a) * radius * 0.86, 0.01, Math.cos(a) * radius * 0.86, false);
        m.rotation.y = a + Math.PI;
      }
      this.afterMat = p.mat(new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      const ag = p.geo(new THREE.RingGeometry(radius * 0.62, radius * 0.68, 48));
      ag.rotateX(-Math.PI / 2);
      this.after = p.dyn(p.mesh(ag, this.afterMat, this.group, 0, 0.008, 0, false));
    }
    if (this.glass) {
      this.crackMat = p.mat(lib.emissiveUnique(PALETTE.white, 0.3));
      const crack = p.box(radius * 0.7, 0.008, 0.012);
      for (let i = 0; i < 5; i++) {
        const m = p.mesh(crack, this.crackMat, this.group, Math.cos(i * 2.1) * radius * 0.25, 0.012, Math.sin(i * 1.7) * radius * 0.25, false);
        m.rotation.y = i * 1.27;
      }
      const fr = new THREE.Group();
      const fm = lib.emissive(PALETTE.coral, 2.6);
      const frGeo = p.box(radius * 0.9, 0.01, 0.02);
      for (let i = 0; i < 7; i++) {
        const m = p.mesh(frGeo, fm, fr, 0, 0.014, 0, false);
        m.rotation.y = (i / 7) * Math.PI;
      }
      fr.visible = false;
      this.group.add(fr);
      this.fractures = p.dyn(fr);
    }
  }

  /**
   * `broken` from the device state. Returns a 0..1 "refused" amount (a non-matching body on an attuned plate) so the
   * owner can dim its own glow and skip the depress animation.
   */
  update(state: SimView, broken: boolean, time: number, dt: number, shatterOn?: 'echoes' | 'player'): number {
    let refused = 0;
    let near = 0;
    for (const a of state.actors) {
      const c = Math.floor(a.x / 1000);
      const r = Math.floor(a.z / 1000);
      const cls = classOf(a.kind);
      if (c === this.col && r === this.row && this.accepts !== 'all' && cls !== this.accepts) refused = 1;
      if (shatterOn && cls === shatterOn && Math.abs(c - this.col) <= 1 && Math.abs(r - this.row) <= 1) near = 1;
    }
    this.pulse = refused ? (this.pulse + dt * 3) % 1 : 0;
    const pulse = refused ? 0.5 + 0.5 * Math.sin(this.pulse * Math.PI * 2) : 0;
    this.rimMat.emissive.copy(this.base).lerp(this.coral, broken ? 1 : pulse);
    this.rimMat.emissiveIntensity = broken ? 0.4 : refused ? 0.8 + pulse : 1.8;
    if (this.after && this.afterMat) {
      const k = (time / 1.6) % 1;
      this.after.scale.setScalar(1 + k * 0.55);
      this.afterMat.opacity = broken ? 0 : 0.55 * (1 - k);
    }
    if (this.crackMat) {
      this.crackMat.emissive.set(broken ? PALETTE.coral : PALETTE.white);
      this.crackMat.emissiveIntensity = broken ? 2.2 : near ? 1.4 + 0.6 * Math.sin(time * 9) : 0.25;
    }
    if (this.fractures) this.fractures.visible = broken;
    return refused;
  }
}

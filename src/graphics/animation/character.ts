import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { createHologramMaterial, type HologramUniforms } from '../shaders/hologram';

/**
 * Stylized protagonist built from shaped primitives (lathe torso, capsules, rounded boots, ponytail chain,
 * backpack temporal device) on a simple bone hierarchy, animated procedurally:
 *   idle breathing + weight shift · run cycle phase-locked to distance travelled (no foot sliding) ·
 *   carry pose (item held overhead) · interact reach gesture · ponytail secondary motion.
 *
 * Variant 'player' uses PBR suit materials with gold accents; variant 'echo' swaps every material for the
 * holographic shader (per-echo tint) so the silhouette is identical but unmistakably a recording.
 */

export type CharacterVariant = 'player' | 'echo';

type Slot = 'white' | 'dark' | 'gold' | 'skin' | 'hair' | 'glow' | 'sole';

export interface CharacterPose {
  /** Planar speed in metres per second (render-interpolated). */
  speed: number;
  /** Distance travelled this frame (metres) for phase locking. */
  distance: number;
  carrying: boolean;
  /** 0..1 progress of the interact gesture (0 = none). */
  gesture: number;
  /** Held interact (e.g. holding a switch) keeps the arm extended. */
  holding: boolean;
}

/** Characters draw after the X-ray silhouette pass (see ActorVisual). */
export const CHARACTER_RENDER_ORDER = 2;
const RUN_SPEED = 4.8; // PHYS.ACTOR_SPEED (40 u/tick) * 60 Hz -> 2.4 tiles/s -> 4.8 m/s
const STRIDE = 2.1; // metres per full gait cycle at run speed

export class Character {
  readonly root = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  readonly holograms: (THREE.ShaderMaterial & { uniforms: HologramUniforms })[] = [];
  /** Point above the head where carried items ride (in root space). */
  readonly carryAnchor = new THREE.Object3D();
  /** World-space position of the backpack device (for VFX). */
  readonly deviceAnchor = new THREE.Object3D();

  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: Record<Slot, THREE.Material>;
  private readonly hips = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly shoulder: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  private readonly elbow: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  private readonly thigh: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  private readonly knee: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  private readonly ankle: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  private readonly tail: THREE.Group[] = [];
  private readonly deviceRing = new THREE.Group();

  private phase = 0;
  private walkW = 0;
  private carryW = 0;
  private gestureW = 0;
  private tailLag = 0;
  private time = Math.random() * 10;

  constructor(lib: MaterialLibrary, readonly variant: CharacterVariant, tint: number = PALETTE.cyan) {
    if (variant === 'player') {
      const white = new THREE.MeshPhysicalMaterial({ color: 0xe9e6df, roughness: 0.38, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.35 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.62, metalness: 0.35 });
      const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac8a, roughness: 0.6, metalness: 0 });
      const hair = new THREE.MeshStandardMaterial({ color: 0x3a2318, roughness: 0.5, metalness: 0.1 });
      const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 3.2 });
      const sole = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
      this.mats = { white, dark, gold: lib.brassPolished, skin, hair, glow, sole };
      this.materials.push(white, dark, skin, hair, glow, sole);
    } else {
      const light = createHologramMaterial(tint, { fill: 0.17, rim: 1.1 });
      const dark = createHologramMaterial(tint, { fill: 0.06, rim: 0.9 });
      const accent = createHologramMaterial(new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.15).getHex(), { fill: 0.22, rim: 1.1 });
      this.holograms.push(light, dark, accent);
      this.materials.push(light, dark, accent);
      this.mats = { white: light, dark, gold: accent, skin: light, hair: dark, glow: accent, sole: dark };
    }
    this.build();
    this.mergeStatic(this.root);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.renderOrder = CHARACTER_RENDER_ORDER;
    });
  }

  /**
   * Draw-call reduction: within every bone, child meshes sharing a material are baked into one geometry
   * (bones stay separate so the procedural animation is unaffected).
   */
  private mergeStatic(node: THREE.Object3D): void {
    const byMat = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of node.children) {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.children.length === 0) {
        const list = byMat.get(m.material as THREE.Material) ?? [];
        list.push(m);
        byMat.set(m.material as THREE.Material, list);
      }
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.clone() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      this.geos.push(merged);
      for (const m of list) node.remove(m);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = this.variant === 'player';
      mesh.receiveShadow = this.variant === 'player';
      node.add(mesh);
    }
    for (const c of [...node.children]) if (!(c as THREE.Mesh).isMesh || c.children.length) this.mergeStatic(c);
  }

  private g<T extends THREE.BufferGeometry>(geo: T): T {
    this.geos.push(geo);
    return geo;
  }

  private mesh(geo: THREE.BufferGeometry, slot: Slot, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.mats[slot]);
    m.position.set(x, y, z);
    m.castShadow = this.variant === 'player';
    m.receiveShadow = this.variant === 'player';
    parent.add(m);
    return m;
  }

  private build(): void {
    const r = this.root;
    r.add(this.hips);
    this.hips.position.y = 0.93;

    // ---- pelvis ----
    const pelvis = this.mesh(this.g(new THREE.SphereGeometry(0.15, 20, 14)), 'dark', this.hips, 0, -0.02, 0);
    pelvis.scale.set(1.08, 0.75, 0.82);
    const belt = this.mesh(this.g(new THREE.TorusGeometry(0.145, 0.022, 8, 28)), 'gold', this.hips, 0, 0.05, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.05, 0.82, 1);
    this.mesh(this.g(new THREE.BoxGeometry(0.06, 0.05, 0.03)), 'glow', this.hips, 0, 0.05, 0.125);

    // ---- spine / torso ----
    this.hips.add(this.spine);
    this.spine.position.y = 0.06;
    const abdomen = this.mesh(this.g(new THREE.CylinderGeometry(0.115, 0.13, 0.2, 18)), 'dark', this.spine, 0, 0.09, 0);
    abdomen.scale.z = 0.8;
    this.spine.add(this.chest);
    this.chest.position.y = 0.18;
    const torsoProfile = [
      new THREE.Vector2(0.0, -0.02),
      new THREE.Vector2(0.12, -0.02),
      new THREE.Vector2(0.15, 0.06),
      new THREE.Vector2(0.172, 0.16),
      new THREE.Vector2(0.168, 0.24),
      new THREE.Vector2(0.12, 0.3),
      new THREE.Vector2(0.06, 0.32),
      new THREE.Vector2(0.0, 0.32),
    ];
    const torso = this.mesh(this.g(new THREE.LatheGeometry(torsoProfile, 24)), 'white', this.chest);
    torso.scale.z = 0.72;
    // dark side panels (inset strips) + gold chest piping
    for (const s of [-1, 1]) {
      const panel = this.mesh(this.g(new THREE.BoxGeometry(0.04, 0.22, 0.17)), 'dark', this.chest, s * 0.155, 0.13, 0);
      panel.rotation.z = s * 0.12;
      const pipe = this.mesh(this.g(new THREE.BoxGeometry(0.012, 0.2, 0.012)), 'gold', this.chest, s * 0.07, 0.15, 0.118);
      pipe.rotation.z = -s * 0.35;
    }
    const emblem = this.mesh(this.g(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16)), 'glow', this.chest, 0, 0.2, 0.118);
    emblem.rotation.x = Math.PI / 2;
    const collar = this.mesh(this.g(new THREE.TorusGeometry(0.07, 0.018, 8, 20)), 'gold', this.chest, 0, 0.31, 0);
    collar.rotation.x = Math.PI / 2;

    // ---- backpack temporal device ----
    const pack = new THREE.Group();
    pack.position.set(0, 0.17, -0.15);
    this.chest.add(pack);
    const packBody = this.mesh(this.g(new THREE.CapsuleGeometry(0.08, 0.14, 4, 12)), 'dark', pack);
    packBody.scale.set(1.35, 1, 0.75);
    this.mesh(this.g(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 20)), 'gold', pack, 0, 0, -0.05).rotation.x = Math.PI / 2;
    pack.add(this.deviceRing);
    this.deviceRing.position.z = -0.08;
    this.mesh(this.g(new THREE.TorusGeometry(0.058, 0.012, 8, 28)), 'glow', this.deviceRing);
    const spoke = this.mesh(this.g(new THREE.BoxGeometry(0.1, 0.01, 0.01)), 'glow', this.deviceRing);
    spoke.rotation.z = 0.6;
    this.mesh(this.g(new THREE.SphereGeometry(0.022, 10, 8)), 'glow', this.deviceRing);
    for (const s of [-1, 1]) this.mesh(this.g(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8)), 'gold', pack, s * 0.1, 0.02, 0);
    this.deviceAnchor.position.set(0, 0, -0.1);
    pack.add(this.deviceAnchor);

    // ---- neck / head ----
    this.chest.add(this.neck);
    this.neck.position.y = 0.31;
    this.mesh(this.g(new THREE.CylinderGeometry(0.045, 0.055, 0.09, 12)), 'dark', this.neck, 0, 0.03, 0);
    this.neck.add(this.head);
    this.head.position.y = 0.17;
    const skull = this.mesh(this.g(new THREE.SphereGeometry(0.105, 24, 18)), 'skin', this.head);
    skull.scale.set(0.92, 1.08, 1);
    const jaw = this.mesh(this.g(new THREE.SphereGeometry(0.07, 16, 12)), 'skin', this.head, 0, -0.05, 0.03);
    jaw.scale.set(1, 0.9, 1);
    // hair cap (back + top), side-swept fringe, high ponytail
    const cap = this.mesh(this.g(new THREE.SphereGeometry(0.115, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6)), 'hair', this.head, 0, 0.01, -0.008);
    cap.scale.set(0.95, 1.08, 1.05);
    cap.rotation.x = -0.35;
    const fringe = this.mesh(this.g(new THREE.SphereGeometry(0.06, 12, 8)), 'hair', this.head, 0.035, 0.07, 0.07);
    fringe.scale.set(1.4, 0.55, 0.7);
    fringe.rotation.z = -0.4;
    for (const s of [-1, 1]) {
      const side = this.mesh(this.g(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8)), 'hair', this.head, s * 0.093, -0.03, 0.02);
      side.rotation.z = s * 0.15;
      // eyes
      this.mesh(this.g(new THREE.SphereGeometry(0.012, 8, 6)), this.variant === 'player' ? 'sole' : 'glow', this.head, s * 0.035, 0.0, 0.094);
    }
    let parent: THREE.Object3D = this.head;
    const tie = new THREE.Group();
    tie.position.set(0, 0.09, -0.085);
    tie.rotation.x = -0.9;
    this.head.add(tie);
    this.mesh(this.g(new THREE.TorusGeometry(0.026, 0.008, 6, 14)), 'gold', tie).rotation.x = Math.PI / 2;
    parent = tie;
    const segLen = [0.1, 0.11, 0.1];
    const segR = [0.034, 0.03, 0.02];
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : -(segLen[i - 1] ?? 0.1);
      parent.add(seg);
      const m = this.mesh(this.g(new THREE.CapsuleGeometry(segR[i] ?? 0.02, segLen[i] ?? 0.1, 4, 10)), 'hair', seg, 0, -(segLen[i] ?? 0.1) / 2, 0);
      m.scale.z = 0.8;
      this.tail.push(seg);
      parent = seg;
    }

    // ---- arms ----
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1; // 0 = left (+x), 1 = right (-x)
      const sh = this.shoulder[i]!;
      sh.position.set(s * 0.19, 0.25, 0);
      this.chest.add(sh);
      const pad = this.mesh(this.g(new THREE.SphereGeometry(0.068, 16, 12)), 'white', sh, s * 0.01, 0.01, 0);
      pad.scale.set(1.05, 0.85, 1);
      const padTrim = this.mesh(this.g(new THREE.TorusGeometry(0.06, 0.009, 6, 18)), 'gold', sh, s * 0.012, -0.02, 0);
      padTrim.rotation.x = Math.PI / 2;
      this.mesh(this.g(new THREE.CapsuleGeometry(0.043, 0.2, 4, 12)), 'dark', sh, 0, -0.14, 0);
      const el = this.elbow[i]!;
      el.position.y = -0.27;
      sh.add(el);
      this.mesh(this.g(new THREE.CapsuleGeometry(0.042, 0.17, 4, 12)), 'white', el, 0, -0.12, 0);
      const cuff = this.mesh(this.g(new THREE.TorusGeometry(0.04, 0.009, 6, 16)), 'gold', el, 0, -0.2, 0);
      cuff.rotation.x = Math.PI / 2;
      const hand = this.mesh(this.g(new THREE.SphereGeometry(0.042, 12, 10)), 'dark', el, 0, -0.26, 0.005);
      hand.scale.set(0.85, 1.15, 0.8);
    }

    // ---- legs ----
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const th = this.thigh[i]!;
      th.position.set(s * 0.085, -0.04, 0);
      this.hips.add(th);
      this.mesh(this.g(new THREE.CapsuleGeometry(0.066, 0.3, 4, 14)), 'white', th, 0, -0.2, 0);
      const stripe = this.mesh(this.g(new THREE.BoxGeometry(0.02, 0.3, 0.05)), 'dark', th, s * 0.062, -0.2, 0);
      stripe.rotation.z = s * 0.03;
      const kn = this.knee[i]!;
      kn.position.y = -0.42;
      th.add(kn);
      this.mesh(this.g(new THREE.SphereGeometry(0.045, 12, 8)), 'gold', kn, 0, 0, 0.035).scale.set(1, 1.1, 0.6);
      this.mesh(this.g(new THREE.CapsuleGeometry(0.052, 0.28, 4, 12)), 'dark', kn, 0, -0.19, 0);
      const an = this.ankle[i]!;
      an.position.y = -0.4;
      kn.add(an);
      const boot = this.mesh(this.g(new THREE.CapsuleGeometry(0.055, 0.1, 4, 12)), 'white', an, 0, -0.01, 0.035);
      boot.rotation.x = Math.PI / 2;
      boot.scale.set(1, 1, 0.9);
      const sole = this.mesh(this.g(new THREE.BoxGeometry(0.1, 0.035, 0.22)), 'sole', an, 0, -0.06, 0.035);
      sole.scale.set(1, 1, 1);
      this.mesh(this.g(new THREE.BoxGeometry(0.105, 0.012, 0.05)), 'gold', an, 0, -0.035, 0.12);
    }

    this.carryAnchor.position.set(0, 2.08, 0.05);
    r.add(this.carryAnchor);
  }

  /** Advance procedural animation. */
  update(dt: number, pose: CharacterPose): void {
    this.time += dt;
    const t = this.time;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const targetWalk = Math.min(1, pose.speed / RUN_SPEED);
    this.walkW += (targetWalk - this.walkW) * k(14);
    this.carryW += ((pose.carrying ? 1 : 0) - this.carryW) * k(10);
    const gTarget = pose.holding ? 1 : pose.gesture > 0 ? Math.sin(Math.min(1, pose.gesture) * Math.PI) : 0;
    this.gestureW += (gTarget - this.gestureW) * k(18);
    this.phase += (pose.distance / STRIDE) * Math.PI * 2;
    const w = this.walkW;
    const p = this.phase;
    const sinP = Math.sin(p);
    const cosP = Math.cos(p);

    // hips: bob + sway, idle weight shift
    const breathe = Math.sin(t * 1.9);
    this.hips.position.y = 0.93 - 0.035 * w + Math.abs(cosP) * 0.055 * w + (1 - w) * breathe * 0.004;
    this.hips.position.x = (1 - w) * Math.sin(t * 0.6) * 0.012;
    this.hips.rotation.y = sinP * 0.16 * w;
    this.hips.rotation.z = (1 - w) * Math.sin(t * 0.6) * 0.02 + cosP * 0.03 * w;
    this.spine.rotation.x = 0.16 * w + 0.04 * this.gestureW - 0.06 * this.carryW;
    this.chest.rotation.y = -sinP * 0.22 * w;
    const br = 1 + breathe * 0.012 * (1 - w * 0.6);
    this.chest.scale.set(br, 1 + breathe * 0.006, br);
    this.head.rotation.y = (1 - w) * Math.sin(t * 0.37) * 0.25;
    this.head.rotation.x = -0.1 * w + (1 - w) * Math.sin(t * 0.5) * 0.04;
    this.neck.rotation.y = sinP * 0.12 * w;

    // legs
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      const swing = -sinP * sgn; // left leg forward when -sin > 0... (negative x rot = forward)
      this.thigh[i]!.rotation.x = -swing * 0.85 * w - 0.05 * w;
      const fwd = Math.max(0, cosP * sgn);
      this.knee[i]!.rotation.x = w * (0.15 + 1.25 * fwd * fwd) + (1 - w) * 0.03;
      this.ankle[i]!.rotation.x = -0.25 * w * fwd + 0.1 * w * Math.max(0, -cosP * sgn);
      this.thigh[i]!.rotation.z = sgn * (0.02 + (1 - w) * 0.025);
    }

    // arms: run swing ↔ carry overhead ↔ interact reach (right arm)
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      const runX = sinP * sgn * 0.75 * w + 0.12 * w;
      const idleX = Math.sin(t * 1.9 + i) * 0.03;
      let x = runX + idleX * (1 - w);
      let z = sgn * (0.12 + 0.05 * w);
      let el = -0.35 - 0.75 * w;
      // carry: arms up holding the item overhead
      x = x * (1 - this.carryW) + -2.75 * this.carryW;
      z = z * (1 - this.carryW) + sgn * 0.32 * this.carryW;
      el = el * (1 - this.carryW) + -0.55 * this.carryW;
      if (i === 1) {
        x = x * (1 - this.gestureW) + -1.45 * this.gestureW;
        el = el * (1 - this.gestureW) + -0.15 * this.gestureW;
        z = z * (1 - this.gestureW) + -0.08 * this.gestureW;
      }
      this.shoulder[i]!.rotation.set(x, 0, z);
      this.elbow[i]!.rotation.x = el;
    }

    // ponytail secondary motion (lags behind speed changes, bounces with the gait)
    this.tailLag += (w - this.tailLag) * k(5);
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i]!;
      seg.rotation.x = (i === 0 ? 0.25 : 0.18) - this.tailLag * (0.5 - i * 0.1) + Math.sin(p * 2 - i * 0.8) * 0.12 * w + Math.sin(t * 1.3 - i) * 0.04;
      seg.rotation.z = Math.sin(p - i * 0.7) * 0.18 * w + Math.sin(t * 0.9 - i) * 0.03;
    }

    this.deviceRing.rotation.z = t * 2.2;
    for (const h of this.holograms) {
      h.uniforms.uTime.value = t;
    }
  }

  setHologram(params: { fade?: number; glitch?: number; baseY?: number }): void {
    for (const h of this.holograms) {
      if (params.fade !== undefined) h.uniforms.uFade.value = params.fade;
      if (params.glitch !== undefined) h.uniforms.uGlitch.value = params.glitch;
      if (params.baseY !== undefined) h.uniforms.uBaseY.value = params.baseY;
    }
  }

  setTint(tint: number): void {
    const c = new THREE.Color(tint);
    const [light, dark, accent] = this.holograms;
    light?.uniforms.uTint.value.copy(c);
    dark?.uniforms.uTint.value.copy(c);
    accent?.uniforms.uTint.value.copy(c).lerp(new THREE.Color(0xffffff), 0.45);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

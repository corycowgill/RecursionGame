import * as THREE from 'three';
import { PALETTE } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { createHologramMaterial, type HologramUniforms } from '../shaders/hologram';
import { characterGeometries, createSuitMaterial, RIG, type BoneName, type CharacterLod } from './characterModel';

/**
 * Stylized protagonist (heroic proportions, ~7 heads): segmented white / ivory armour over a dark undersuit,
 * glowing gold seams, pauldrons, gauntlets, knee guards, chunky sneaker boots, a circular temporal device on the
 * back and brown hair in two buns. Geometry is generated once (characterModel.ts) and shared by every instance:
 * one merged mesh per bone, so a character costs 18 draw calls with a single material.
 *
 * Procedural animation (all render-side, never read by the simulation):
 *   locomotion phase-locked to distance travelled (no foot sliding) with hip bob / sway, pelvis rotation,
 *     counter-rotating chest and opposite arm swing;
 *   idle: breathing, weight shift between legs every few seconds, occasional glance;
 *   head look toward the target interactable (lookYaw / lookPitch, relative to the body);
 *   carry: both hands overhead, the item anchor follows the hands (lifted from waist height on pickup);
 *   interact gestures: reach (use / switch / fail), lift (pickup / extract), place (drop / insert);
 *   landing squash on height changes; hair-lock secondary motion; device ring spin.
 *
 * Variant 'player' uses the PBR suit material with gold accents; variant 'echo' uses the holographic shader
 * (per-echo tint) on the same geometry, so the silhouette is identical but unmistakably a recording.
 */

export type CharacterVariant = 'player' | 'echo';

export type GestureKind = 'reach' | 'lift' | 'place';

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
  /** Which gesture `gesture` plays (default 'reach'). */
  gestureKind?: GestureKind;
  /** Head look target relative to the body facing (radians, + = to the character's left) and pitch (+ = down). */
  lookYaw?: number;
  lookPitch?: number;
  /** Landing impulse 0..1, set on the frame a height change ends (squash). */
  landing?: number;
}

/** Characters draw after the X-ray silhouette pass (see ActorVisual). */
export const CHARACTER_RENDER_ORDER = 2;
const RUN_SPEED = 4.8; // PHYS.ACTOR_SPEED (40 u/tick) * 60 Hz -> 2.4 tiles/s -> 4.8 m/s
const STRIDE = 2.1; // metres per full gait cycle at run speed
/** Carry anchor rest height when the hands are overhead (root space, metres). */
const CARRY_Y = 2.06;

/** Small deterministic PRNG (render-side variety without Math.random, so screenshots are reproducible). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export class Character {
  readonly root = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  readonly holograms: (THREE.ShaderMaterial & { uniforms: HologramUniforms })[] = [];
  /** Where carried items ride (root space; follows the hands). */
  readonly carryAnchor = new THREE.Object3D();
  /** Backpack device centre (for VFX). */
  readonly deviceAnchor = new THREE.Object3D();
  /** Number of meshes (= draw calls) of the body. */
  readonly drawCalls: number;

  private readonly material: THREE.Material;
  private readonly body = new THREE.Group();
  private readonly bones = {} as Record<BoneName, THREE.Group>;
  private readonly palmL = new THREE.Object3D();
  private readonly palmR = new THREE.Object3D();
  private readonly rand: () => number;

  private phase = 0;
  private walkW = 0;
  private carryW = 0;
  private gestureW = 0;
  private gestureKind: GestureKind = 'reach';
  private lookYaw = 0;
  private lookPitch = 0;
  private tailLag = 0;
  private time: number;
  // idle behaviour
  private weightSide = 1;
  private weightW = 0;
  private nextShift: number;
  private glanceYaw = 0;
  private glanceTarget = 0;
  private nextGlance: number;
  private glanceUntil = 0;
  // landing spring
  private squash = 0;
  private squashV = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();

  constructor(
    _lib: MaterialLibrary,
    readonly variant: CharacterVariant,
    tint: number = PALETTE.cyan,
    seed: number = tint,
    /** Mesh level of detail (quality preset): 1 = reduced tessellation, no clearcoat. */
    readonly lod: CharacterLod = 0,
  ) {
    this.rand = mulberry32(seed * 2654435761);
    this.time = this.rand() * 10;
    this.nextShift = 2 + this.rand() * 4;
    this.nextGlance = 1.5 + this.rand() * 3;
    if (variant === 'player') {
      this.material = createSuitMaterial(lod);
    } else {
      const h = createHologramMaterial(tint, { fill: 0.13, rim: 1.45, seed: this.rand() * 10 });
      this.holograms.push(h);
      this.material = h;
    }
    this.materials.push(this.material);
    this.drawCalls = this.build();
  }

  private build(): number {
    const geos = characterGeometries(this.lod);
    const b = this.bones;
    const names = Object.keys(geos) as BoneName[];
    for (const n of names) b[n] = new THREE.Group();
    const at = (n: BoneName, parent: THREE.Object3D, p: readonly number[], sx = 1) => {
      b[n].position.set((p[0] ?? 0) * sx, p[1] ?? 0, p[2] ?? 0);
      parent.add(b[n]);
    };
    this.root.add(this.body);
    b.hips.position.y = RIG.hipsY;
    this.body.add(b.hips);
    at('spine', b.hips, RIG.spine);
    at('chest', b.spine, RIG.chest);
    at('device', b.chest, RIG.device);
    at('neck', b.chest, RIG.neck);
    at('head', b.neck, RIG.head);
    // Head look = yaw about the vertical first, then pitch about the turned head's own ear-to-ear axis. With the
    // default XYZ order a pitch was applied about the *unturned* axis, which rolled the head sideways whenever it
    // looked up/down while turned (the round-4 turntable tilt).
    b.neck.rotation.order = 'YXZ';
    b.head.rotation.order = 'YXZ';
    at('tail0', b.head, RIG.tail0);
    at('tail1', b.tail0, RIG.tail1);
    at('shoulderL', b.chest, RIG.shoulder, 1);
    at('shoulderR', b.chest, RIG.shoulder, -1);
    at('elbowL', b.shoulderL, RIG.elbow);
    at('elbowR', b.shoulderR, RIG.elbow);
    at('thighL', b.hips, RIG.thigh, 1);
    at('thighR', b.hips, RIG.thigh, -1);
    at('kneeL', b.thighL, RIG.knee);
    at('kneeR', b.thighR, RIG.knee);
    at('ankleL', b.kneeL, RIG.ankle);
    at('ankleR', b.kneeR, RIG.ankle);
    this.palmL.position.set(...RIG.palm);
    this.palmR.position.set(...RIG.palm);
    b.elbowL.add(this.palmL);
    b.elbowR.add(this.palmR);
    this.deviceAnchor.position.set(0, 0, -0.05);
    b.device.add(this.deviceAnchor);
    this.carryAnchor.position.set(0, CARRY_Y, 0.05);
    this.root.add(this.carryAnchor);

    const shadows = this.variant === 'player';
    for (const n of names) {
      const mesh = new THREE.Mesh(geos[n], this.material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.renderOrder = CHARACTER_RENDER_ORDER;
      b[n].add(mesh);
    }
    return names.length;
  }

  /** Advance procedural animation. */
  update(dt: number, pose: CharacterPose): void {
    this.time += dt;
    const t = this.time;
    const b = this.bones;

    // ---------------------------------------------------------------- blend weights
    this.walkW = damp(this.walkW, Math.min(1, pose.speed / RUN_SPEED), 12, dt);
    this.carryW = damp(this.carryW, pose.carrying ? 1 : 0, 7, dt);
    if (pose.gesture > 0 || pose.holding) this.gestureKind = pose.holding ? 'reach' : (pose.gestureKind ?? 'reach');
    const gTarget = pose.holding ? 1 : pose.gesture > 0 ? Math.sin(Math.min(1, pose.gesture) * Math.PI) : 0;
    this.gestureW = damp(this.gestureW, gTarget, 16, dt);
    this.phase += (pose.distance / STRIDE) * Math.PI * 2;
    const w = this.walkW;
    const idle = 1 - w;
    const cw = this.carryW;
    const gw = this.gestureW;
    const reach = this.gestureKind === 'reach' ? gw : 0;
    const lift = this.gestureKind === 'lift' ? gw : 0;
    const place = this.gestureKind === 'place' ? gw : 0;
    const bend = Math.max(lift, place); // crouch for pickups / drops
    const p = this.phase;
    const sinP = Math.sin(p);
    const cosP = Math.cos(p);

    // ---------------------------------------------------------------- idle behaviour
    if (t > this.nextShift) {
      this.weightSide = -this.weightSide;
      this.nextShift = t + 3.5 + this.rand() * 4;
    }
    this.weightW = damp(this.weightW, this.weightSide * idle, 1.6, dt);
    if (t > this.nextGlance) {
      this.glanceTarget = (this.rand() < 0.5 ? -1 : 1) * (0.45 + this.rand() * 0.35);
      this.glanceUntil = t + 0.9 + this.rand() * 0.8;
      this.nextGlance = t + 4 + this.rand() * 5;
    }
    if (t > this.glanceUntil) this.glanceTarget = 0;
    this.glanceYaw = damp(this.glanceYaw, this.glanceTarget * idle * (1 - gw), 5, dt);
    const breathe = Math.sin(t * 1.7);
    const ws = this.weightW; // + = weight on the left leg

    // landing squash (critically-damped-ish spring)
    if (pose.landing && pose.landing > 0) this.squashV -= pose.landing * 5.5;
    this.squashV += (-this.squash * 170 - this.squashV * 15) * dt;
    this.squash += this.squashV * dt;
    const sq = Math.max(-0.12, Math.min(0.12, this.squash)); // < 0 = compressed
    this.body.scale.set(1 - sq * 0.35, 1 + sq, 1 - sq * 0.35);
    const crouch = Math.max(0, -sq) * 1.6 + bend * 0.11;

    // ---------------------------------------------------------------- hips / spine
    // lowest at mid-stance (legs passing), highest in the flight phase
    const bob = Math.abs(sinP) * 0.05 * w - 0.03 * w;
    b.hips.position.y = RIG.hipsY + bob + idle * breathe * 0.003 - crouch;
    b.hips.position.x = ws * 0.022 + cosP * 0.02 * w;
    b.hips.rotation.y = sinP * 0.2 * w;
    b.hips.rotation.z = -ws * 0.045 + cosP * 0.045 * w;
    b.hips.rotation.x = 0;
    const lean = 0.14 * w * (1 - cw * 0.5) + reach * 0.12 + bend * 0.55 - cw * 0.08;
    b.spine.rotation.set(lean * 0.45, -b.hips.rotation.y * 0.45, ws * 0.03 - cosP * 0.02 * w);
    b.chest.rotation.set(lean * 0.55 - idle * breathe * 0.012, -sinP * 0.28 * w - b.hips.rotation.y * 0.35 + reach * 0.2, ws * 0.025 - b.hips.rotation.z * 0.6);
    const br = 1 + breathe * 0.012 * (1 - w * 0.7);
    b.chest.scale.set(br, 1 + breathe * 0.005, br);

    // ---------------------------------------------------------------- head look
    const lookYaw = Math.max(-1.1, Math.min(1.1, (pose.lookYaw ?? 0) + this.glanceYaw));
    const lookPitch = Math.max(-0.4, Math.min(0.55, pose.lookPitch ?? 0));
    this.lookYaw = damp(this.lookYaw, lookYaw, 7, dt);
    this.lookPitch = damp(this.lookPitch, lookPitch + bend * 0.25, 7, dt);
    const counter = b.chest.rotation.y + b.spine.rotation.y + b.hips.rotation.y; // keep the gaze stable while running
    b.neck.rotation.set(this.lookPitch * 0.4 - lean * 0.35, this.lookYaw * 0.4 - counter * 0.5, -b.chest.rotation.z * 0.5);
    b.head.rotation.set(
      this.lookPitch * 0.6 - lean * 0.3 + idle * Math.sin(t * 0.5) * 0.025 - 0.04 * w,
      this.lookYaw * 0.6 - counter * 0.4,
      -this.lookYaw * 0.025 + ws * 0.03,
    );

    // ---------------------------------------------------------------- legs
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1; // 0 = left (+x)
      const th = i === 0 ? b.thighL : b.thighR;
      const kn = i === 0 ? b.kneeL : b.kneeR;
      const an = i === 0 ? b.ankleL : b.ankleR;
      const swing = -sinP * sgn; // > 0 = thigh forward
      const fwd = Math.max(0, -cosP * sgn); // swing phase: thigh moving forward, foot in the air
      const back = Math.max(0, cosP * sgn); // stance phase
      // standing: the unweighted leg relaxes (knee bent, foot slightly out); crouch bends both knees
      const relaxed = Math.max(0, -ws * sgn);
      const crouchK = crouch * 2.6;
      th.rotation.x = -swing * 0.8 * w - 0.06 * w - relaxed * 0.08 - crouchK * 0.55;
      th.rotation.z = sgn * (0.035 + relaxed * 0.05) * idle + ws * 0.045 * idle;
      th.rotation.y = sgn * relaxed * 0.12 * idle;
      kn.rotation.x = w * (0.18 + 1.1 * fwd * fwd) + relaxed * 0.2 + idle * 0.03 + crouchK * 1.1;
      an.rotation.x = -0.3 * w * fwd + 0.18 * w * back - relaxed * 0.1 - crouchK * 0.55;
      an.rotation.z = -th.rotation.z;
    }

    // ---------------------------------------------------------------- arms
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      const sh = i === 0 ? b.shoulderL : b.shoulderR;
      const el = i === 0 ? b.elbowL : b.elbowR;
      // locomotion swing opposite the legs (counter-rotation), idle sway with breathing
      // (x < 0 = arm forward; each arm swings opposite its own leg)
      let x = -sinP * sgn * 0.7 * w + 0.1 * w + idle * (0.04 + Math.sin(t * 1.7 + i) * 0.025);
      let z = sgn * (0.13 + 0.04 * w - ws * sgn * 0.03 * idle);
      let y = 0;
      let e = -0.3 - 0.85 * w - idle * 0.06 - Math.max(0, sinP * sgn) * 0.35 * w;
      // carry: both arms up, hands under the item
      x = x * (1 - cw) - 2.85 * cw;
      z = z * (1 - cw) + sgn * 0.24 * cw;
      e = e * (1 - cw) - 0.55 * cw;
      // lift / place: both arms reach forward-down in front of the body
      const lp = bend * (1 - cw * 0.6);
      x = x * (1 - lp) - (lift > 0 ? 1.15 : 1.0) * lp;
      z = z * (1 - lp) + sgn * 0.08 * lp;
      e = e * (1 - lp) - 0.35 * lp;
      // reach: right arm forward to the interactable (use / hold switch)
      if (i === 1) {
        x = x * (1 - reach) - 1.42 * reach + this.lookPitch * 0.3 * reach;
        z = z * (1 - reach) - 0.05 * reach;
        y = 0.15 * reach;
        e = e * (1 - reach) - 0.12 * reach;
      }
      sh.rotation.set(x, y, z);
      el.rotation.x = e;
    }

    // ---------------------------------------------------------------- carry anchor follows the hands
    if (cw > 0.001) {
      this.root.updateMatrixWorld(true);
      this.palmL.getWorldPosition(this.tmp);
      this.palmR.getWorldPosition(this.tmp2);
      this.tmp.add(this.tmp2).multiplyScalar(0.5);
      this.inv.copy(this.root.matrixWorld).invert();
      this.tmp.applyMatrix4(this.inv);
      // the item rests on top of the hands: lift it slightly above the palms
      const a = smooth(cw * 1.4);
      this.carryAnchor.position.set(this.tmp.x * (1 - a), this.tmp.y + 0.13, this.tmp.z * (1 - a) + 0.05 * a);
    } else {
      this.carryAnchor.position.set(0, CARRY_Y, 0.05);
    }

    // ---------------------------------------------------------------- hair lock secondary motion
    this.tailLag = damp(this.tailLag, w, 4, dt);
    b.tail0.rotation.x = 0.35 + this.tailLag * 0.55 + Math.sin(p * 2) * 0.12 * w + Math.sin(t * 1.3) * 0.04 - b.head.rotation.x * 0.8;
    b.tail0.rotation.z = Math.sin(p) * 0.2 * w + Math.sin(t * 0.9) * 0.03 - b.head.rotation.z;
    b.tail1.rotation.x = 0.1 + this.tailLag * 0.3 + Math.sin(p * 2 - 0.9) * 0.15 * w + Math.sin(t * 1.3 - 0.8) * 0.05;
    b.tail1.rotation.z = Math.sin(p - 0.8) * 0.2 * w;

    b.device.rotation.z = t * 2.2;
    for (const h of this.holograms) h.uniforms.uTime.value = t;
  }

  setHologram(params: { fade?: number; glitch?: number; baseY?: number }): void {
    for (const h of this.holograms) {
      if (params.fade !== undefined) h.uniforms.uFade.value = params.fade;
      if (params.glitch !== undefined) h.uniforms.uGlitch.value = params.glitch;
      if (params.baseY !== undefined) h.uniforms.uBaseY.value = params.baseY;
    }
  }

  setTint(tint: number): void {
    for (const h of this.holograms) h.uniforms.uTint.value.set(tint);
  }

  /** Geometry is shared between all characters; only the per-character material is released. */
  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}

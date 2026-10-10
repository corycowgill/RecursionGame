import * as THREE from 'three';
import type { ActorView } from '../../engine/contracts';
import { PALETTE, echoTint } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { labelTexture } from '../materials/textures';
import { createTrailMaterial } from '../shaders/fx';
import { Character, CHARACTER_RENDER_ORDER } from './character';

/**
 * ActorVisual — one actor on screen: the animated Character plus readability layers:
 *  player: gold ground halo · echo: holographic body tinted per index, floating numbered hex badge,
 *  cyan ground halo, fading ghost ribbon trail, manifest dissolve-in and coral glitch on divergence.
 * Fed exclusively with render-interpolated positions and the read-only ActorView.
 */
/** Heroic scale: characters read clearly against 2 m tiles from the iso camera. */
export const CHARACTER_SCALE = 1.15;
const TRAIL_POINTS = 36;
const TRAIL_SAMPLE = 0.045;

export class ActorVisual {
  readonly root = new THREE.Group();
  readonly character: Character;
  readonly isPlayer: boolean;
  private readonly halo: THREE.Mesh;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private label: THREE.Sprite | null = null;
  private labelTex: THREE.Texture | null = null;
  private labelIndex = -1;
  private trail: THREE.Mesh | null = null;
  private trailPts: THREE.Vector3[] = [];
  private trailTimer = 0;
  private readonly lastPos = new THREE.Vector3();
  private hasLast = false;
  private yaw = 0;
  private gesture = 0;
  private lastInteractionTick = -1;
  private fade = 1;
  private glitch = 0;
  private speed = 0;
  private time = 0;
  private readonly owned: { dispose(): void }[] = [];

  constructor(
    lib: MaterialLibrary,
    actor: ActorView,
    opts: { trail: boolean },
  ) {
    this.isPlayer = actor.kind === 'player';
    const tint = this.isPlayer ? PALETTE.gold : echoTint(actor.echoIndex);
    this.character = new Character(lib, this.isPlayer ? 'player' : 'echo', tint);
    this.character.root.scale.setScalar(CHARACTER_SCALE);
    this.root.add(this.character.root);

    const haloGeo = new THREE.RingGeometry(0.34, 0.42, 48);
    haloGeo.rotateX(-Math.PI / 2);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint).multiplyScalar(this.isPlayer ? 1.4 : 1.8),
      transparent: true,
      opacity: this.isPlayer ? 0.55 : 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    // X-ray silhouette: drawn after the environment but before the body, only where something occludes it
    // (GreaterDepth), so actors stay readable behind walls, doors and pillars.
    const xrayMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(tint).multiplyScalar(this.isPlayer ? 1.1 : 0.8) } },
      vertexShader:
        'varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }',
      fragmentShader:
        'uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uColor * (0.12 + f * 0.9), 1.0); }',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
    });
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.95, 4, 12);
    const headGeo = new THREE.SphereGeometry(0.15, 12, 8);
    const body = new THREE.Mesh(bodyGeo, xrayMat);
    body.position.y = 0.95;
    const head = new THREE.Mesh(headGeo, xrayMat);
    head.position.y = 1.65;
    for (const m of [body, head]) {
      m.renderOrder = CHARACTER_RENDER_ORDER - 1;
      this.character.root.add(m);
    }
    this.owned.push(xrayMat, bodyGeo, headGeo);

    this.halo = new THREE.Mesh(haloGeo, this.haloMat);
    this.halo.position.y = 0.03;
    this.root.add(this.halo);
    this.owned.push(haloGeo, this.haloMat);

    if (!this.isPlayer) {
      this.setEchoIndex(actor.echoIndex);
      this.fade = 0; // manifest
      if (opts.trail) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 2 * 3), 3));
        const uv = new Float32Array(TRAIL_POINTS * 2 * 2);
        for (let i = 0; i < TRAIL_POINTS; i++) {
          uv.set([i / (TRAIL_POINTS - 1), 0, i / (TRAIL_POINTS - 1), 1], i * 4);
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const idx: number[] = [];
        for (let i = 0; i < TRAIL_POINTS - 1; i++) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        geo.setIndex(idx);
        const mat = createTrailMaterial(tint);
        this.trail = new THREE.Mesh(geo, mat);
        this.trail.frustumCulled = false;
        this.trail.renderOrder = 3;
        this.owned.push(geo, mat);
      }
    }
  }

  /** Trail lives in world space; the renderer adds it to the scene root. */
  get trailMesh(): THREE.Mesh | null {
    return this.trail;
  }

  setEchoIndex(index: number): void {
    if (this.isPlayer || index === this.labelIndex) return;
    this.labelIndex = index;
    const tint = echoTint(index);
    this.character.setTint(tint);
    this.haloMat.color.set(tint).multiplyScalar(1.8);
    (this.trail?.material as THREE.ShaderMaterial | undefined)?.uniforms['uColor']?.value.set(tint);
    this.labelTex?.dispose();
    this.labelTex = labelTexture(String(index + 1), `#${new THREE.Color(tint).getHexString()}`);
    if (!this.label) {
      const mat = new THREE.SpriteMaterial({ map: this.labelTex, depthTest: false, depthWrite: false, transparent: true });
      this.label = new THREE.Sprite(mat);
      this.label.scale.setScalar(0.5);
      this.label.position.y = 2.55;
      this.label.renderOrder = 20;
      this.root.add(this.label);
      this.owned.push(mat);
    } else {
      (this.label.material as THREE.SpriteMaterial).map = this.labelTex;
      (this.label.material as THREE.SpriteMaterial).needsUpdate = true;
    }
  }

  /** Divergence feedback: coral glitch that decays. */
  pulseGlitch(): void {
    this.glitch = 1;
  }

  /** Restart the manifest dissolve (on rewind/echo spawn). */
  remanifest(): void {
    if (!this.isPlayer) this.fade = 0;
    this.hasLast = false;
    this.trailPts = [];
  }

  update(dt: number, actor: ActorView, pos: THREE.Vector3, carryingVisual: boolean): void {
    this.time += dt;
    // movement metrics from interpolated positions (teleports on rewind are ignored)
    let dist = 0;
    if (this.hasLast) {
      dist = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
      if (dist > 1.2) dist = 0;
    }
    this.lastPos.copy(pos);
    this.hasLast = true;
    const instSpeed = dt > 0 ? dist / dt : 0;
    this.speed += (instSpeed - this.speed) * (1 - Math.exp(-12 * dt));
    if (!actor.moving && instSpeed < 0.05) this.speed *= Math.exp(-10 * dt);

    this.root.position.copy(pos);
    const targetYaw = Math.PI - (actor.heading * Math.PI) / 4;
    let dy = targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-16 * dt));
    this.character.root.rotation.y = this.yaw;

    const li = actor.lastInteraction;
    if (li && li.tick !== this.lastInteractionTick) {
      this.lastInteractionTick = li.tick;
      if (li.kind !== 'none') this.gesture = 0.0001;
    }
    if (this.gesture > 0) {
      this.gesture += dt / 0.45;
      if (this.gesture >= 1) this.gesture = 0;
    }
    this.character.update(dt, {
      speed: this.speed,
      distance: dist,
      carrying: carryingVisual,
      gesture: this.gesture,
      holding: actor.interactHeld && !carryingVisual,
    });

    if (!this.isPlayer) {
      this.fade = Math.min(1, this.fade + dt / 0.9);
      this.glitch = Math.max(0, this.glitch - dt * 0.9);
      const flicker = actor.divergedAtTick !== null ? 0.25 + 0.15 * Math.sin(this.time * 31) : 0;
      this.character.setHologram({ fade: this.fade, glitch: Math.max(this.glitch, flicker), baseY: pos.y });
      if (this.label) {
        this.label.position.y = 2.55 + Math.sin(this.time * 2.2) * 0.05;
        (this.label.material as THREE.SpriteMaterial).opacity = this.fade * (actor.finished ? 0.55 : 1);
      }
      this.haloMat.opacity = 0.75 * this.fade * (actor.finished ? 0.5 : 1);
      this.updateTrail(dt, pos);
    } else {
      this.haloMat.opacity = 0.45 + 0.12 * Math.sin(this.time * 3);
    }
    const hs = 1 + 0.05 * Math.sin(this.time * 3);
    this.halo.scale.set(hs, 1, hs);
  }

  private updateTrail(dt: number, pos: THREE.Vector3): void {
    if (!this.trail) return;
    this.trailTimer += dt;
    const head = new THREE.Vector3(pos.x, pos.y + 0.05, pos.z);
    if (this.trailPts.length === 0) for (let i = 0; i < TRAIL_POINTS; i++) this.trailPts.push(head.clone());
    if (this.trailTimer >= TRAIL_SAMPLE) {
      this.trailTimer = 0;
      this.trailPts.pop();
      this.trailPts.unshift(head.clone());
    } else {
      this.trailPts[0]!.copy(head);
    }
    const attr = this.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const p = this.trailPts[i]!;
      const q = this.trailPts[Math.min(TRAIL_POINTS - 1, i + 1)]!;
      const r = this.trailPts[Math.max(0, i - 1)]!;
      let dx = r.x - q.x;
      let dz = r.z - q.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const w = 0.28 * (1 - i / TRAIL_POINTS);
      arr.set([p.x - dz * w, p.y, p.z + dx * w, p.x + dz * w, p.y, p.z - dx * w], i * 6);
    }
    attr.needsUpdate = true;
    (this.trail.material as THREE.ShaderMaterial).uniforms['uOpacity']!.value = 0.7 * this.fade;
  }

  dispose(): void {
    this.character.dispose();
    this.labelTex?.dispose();
    for (const o of this.owned) o.dispose();
    this.trail?.removeFromParent();
  }
}

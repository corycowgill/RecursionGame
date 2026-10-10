import * as THREE from 'three';
import { unitsToWorld, type SimEvent, type SimView } from '../../engine/contracts';
import { PALETTE } from '../materials/palette';
import { createRingMaterial } from '../shaders/fx';
import type { VfxSink } from '../entities/types';
import { ParticleSystem } from './particles';

/**
 * Event-driven VFX. Consumes the SimEvent stream (read-only) and spawns one-shot effects:
 *   recordStart  gold ground rings + rising spiral         rewind      screen rewind distortion + cyan implosion
 *   echoSpawned  cyan manifest column + burst               interact    gold sparkles at the target
 *   doorOpen     gold seam sparks                           divergence  coral glitch (actor + screen)
 *   plate/cell/receiver/portal feedback rings               levelComplete  flash + fountain + big rings
 * Also exposes screen-space effect levels (rewind, glitch, flash) for the grade pass.
 */
interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  life: number;
  delay: number;
  growY: number;
}

export class VfxSystem implements VfxSink {
  readonly group = new THREE.Group();
  readonly particles: ParticleSystem;
  /** Screen effects (0..1), decayed every frame; read by the renderer's grade pass. */
  rewind = 0;
  glitch = 0;
  flash = 0;
  readonly flashColor = new THREE.Color(1, 0.85, 0.55);

  private readonly rings: Ring[] = [];
  private readonly ringGeo = new THREE.PlaneGeometry(1, 1);
  private readonly tmp = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly ringCap: number;
  private readonly baseParticleScale: number;
  private particleScale: number;
  /** Callback the renderer uses to pulse echo glitch visuals on divergence. */
  onDivergence: ((actorId: string) => void) | null = null;
  onRemanifest: (() => void) | null = null;
  /** Camera-shake impulse (0..1) for the renderer's camera rig (scaled / disabled there by reduced motion). */
  onShake: ((amount: number) => void) | null = null;

  constructor(sprite: THREE.Texture, quality: { particles: number }) {
    this.baseParticleScale = quality.particles;
    this.particleScale = quality.particles;
    this.particles = new ParticleSystem(Math.round(1400 * quality.particles) + 64, sprite);
    this.group.add(this.particles.points);
    this.ringCap = 24;
  }

  /** Comfort multiplier on top of the quality preset's particle budget (reduced motion halves bursts). */
  setIntensity(k: number): void {
    this.particleScale = this.baseParticleScale * Math.max(0, k);
  }

  sparks(pos: THREE.Vector3, color: number, count: number, o: { speed?: number; up?: number; size?: number; life?: number; spread?: number } = {}): void {
    const n = Math.max(1, Math.round(count * this.particleScale));
    const sp = o.speed ?? 2.5;
    this.c.set(color).multiplyScalar(2.2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.35 + Math.random() * 0.65);
      const spread = o.spread ?? 0;
      this.particles.emit(
        pos.x + (Math.random() - 0.5) * spread,
        pos.y + (Math.random() - 0.5) * spread,
        pos.z + (Math.random() - 0.5) * spread,
        Math.cos(a) * v,
        (o.up ?? 2) * (0.4 + Math.random() * 0.8),
        Math.sin(a) * v,
        this.c,
        (o.size ?? 0.08) * (0.6 + Math.random() * 0.8),
        (o.life ?? 0.7) * (0.6 + Math.random() * 0.6),
        -5,
        2,
      );
    }
  }

  ring(pos: THREE.Vector3, color: number, radius: number, o: { vertical?: THREE.Vector3; life?: number; width?: number; delay?: number; growY?: number; intensity?: number } = {}): void {
    let r = this.rings.find((x) => x.t >= x.life);
    if (!r) {
      if (this.rings.length >= this.ringCap) r = this.rings.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
      else {
        const mat = createRingMaterial(color);
        const mesh = new THREE.Mesh(this.ringGeo, mat);
        mesh.renderOrder = 7;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        r = { mesh, mat, t: 0, life: 1, delay: 0, growY: 0 };
        this.rings.push(r);
      }
    }
    r.mat.uniforms['uColor']!.value.set(color);
    r.mat.uniforms['uWidth']!.value = o.width ?? 0.06;
    r.mat.uniforms['uIntensity']!.value = o.intensity ?? 2.4;
    r.mesh.position.copy(pos);
    r.mesh.scale.set(radius * 2, radius * 2, 1);
    if (o.vertical) r.mesh.lookAt(this.tmp.copy(pos).add(o.vertical));
    else r.mesh.rotation.set(-Math.PI / 2, 0, 0);
    r.t = 0;
    r.life = o.life ?? 0.8;
    r.delay = o.delay ?? 0;
    r.growY = o.growY ?? 0;
    r.mesh.visible = false;
  }

  private actorPos(state: SimView, id: string, out: THREE.Vector3): boolean {
    const a = state.actors.find((x) => x.id === id);
    if (!a) return false;
    out.set(unitsToWorld(a.x), unitsToWorld(a.y), unitsToWorld(a.z));
    return true;
  }

  private entityPos(state: SimView, id: string, out: THREE.Vector3): boolean {
    const e = state.entities[id];
    if (!e) return false;
    out.set(unitsToWorld(e.x), unitsToWorld(e.y), unitsToWorld(e.z));
    return true;
  }

  private player(state: SimView, out: THREE.Vector3): boolean {
    const p = state.actors.find((a) => a.kind === 'player');
    if (!p) return false;
    out.set(unitsToWorld(p.x), unitsToWorld(p.y), unitsToWorld(p.z));
    return true;
  }

  handle(events: readonly SimEvent[], state: SimView): void {
    const p = new THREE.Vector3();
    for (const ev of events) {
      switch (ev.type) {
        case 'recordStart':
          if (this.player(state, p)) {
            for (let i = 0; i < 3; i++) this.ring(p.clone().setY(p.y + 0.05 + i * 0.5), PALETTE.gold, 0.9 + i * 0.25, { life: 1.1, delay: i * 0.12, growY: 0.6 });
            this.spiral(p, PALETTE.gold, 36);
          }
          break;
        case 'rewind':
        case 'chamberRestart':
          this.rewind = ev.type === 'rewind' ? 1 : 0.75;
          this.onShake?.(0.18);
          this.onRemanifest?.();
          for (const a of state.actors) {
            p.set(unitsToWorld(a.x), unitsToWorld(a.y) + 0.9, unitsToWorld(a.z));
            this.implode(p, a.kind === 'player' ? PALETTE.gold : PALETTE.cyan, 28);
          }
          break;
        case 'echoSpawned':
          if (this.actorPos(state, ev.actorId, p)) {
            this.ring(p.clone().setY(p.y + 0.04), PALETTE.cyan, 1.3, { life: 1.0, width: 0.08 });
            for (let i = 0; i < 4; i++) this.ring(p.clone().setY(p.y + 0.3 + i * 0.45), PALETTE.cyan, 0.55, { life: 0.9, delay: 0.1 + i * 0.08, intensity: 1.8 });
            this.sparks(p.clone().setY(p.y + 0.9), PALETTE.cyan, 40, { speed: 3, up: 2.5, size: 0.09, life: 0.9, spread: 0.5 });
          }
          break;
        case 'pickup':
        case 'drop':
        case 'interact':
          if (this.entityPos(state, ev.entityId, p)) {
            p.y += ev.type === 'interact' ? 1.0 : 0.6;
            this.sparks(p, PALETTE.goldHot, 16, { speed: 1.8, up: 2.2, size: 0.07, life: 0.6, spread: 0.4 });
          }
          break;
        case 'interactFailed':
          if (this.actorPos(state, ev.actorId, p)) {
            p.y += 1.1;
            this.sparks(p, PALETTE.coral, 14, { speed: 1.5, up: 1.5, size: 0.07, life: 0.5 });
          }
          break;
        case 'divergence':
          this.glitch = Math.max(this.glitch, 0.7);
          this.onShake?.(0.32);
          this.onDivergence?.(ev.actorId);
          if (this.actorPos(state, ev.actorId, p)) {
            p.y += 1;
            this.sparks(p, PALETTE.coral, 34, { speed: 2.6, up: 1.2, size: 0.08, life: 0.7, spread: 0.8 });
            this.ring(p.clone().setY(p.y - 0.95), PALETTE.coral, 1.1, { life: 0.7 });
          }
          break;
        case 'doorOpen':
          if (this.entityPos(state, ev.entityId, p)) {
            for (let i = 0; i < 4; i++) this.sparks(p.clone().setY(p.y + 0.4 + i * 0.6), PALETTE.goldHot, 4, { speed: 1.2, up: 0.6, size: 0.06, life: 0.6 });
          }
          break;
        case 'plateDown':
          if (this.entityPos(state, ev.entityId, p)) this.sparks(p.clone().setY(p.y + 0.2), PALETTE.teal, 10, { speed: 1.6, up: 1.4, size: 0.06, life: 0.5 });
          break;
        case 'cellInserted':
        case 'receiverLit':
        case 'switchOn':
          if (this.entityPos(state, ev.entityId, p)) {
            const col = ev.type === 'switchOn' ? PALETTE.gold : PALETTE.teal;
            this.ring(p.clone().setY(p.y + 0.15), col, 1.0, { life: 0.8 });
            this.sparks(p.clone().setY(p.y + 1.0), col, 20, { speed: 2, up: 2, size: 0.07, life: 0.6 });
          }
          break;
        case 'portalActivated':
          if (this.entityPos(state, ev.entityId, p)) {
            this.ring(p.clone().setY(p.y + 0.15), PALETTE.cyan, 2.0, { life: 1.4, width: 0.05 });
            this.sparks(p.clone().setY(p.y + 1.4), PALETTE.cyan, 30, { speed: 2.4, up: 2, size: 0.08, life: 0.9, spread: 0.6 });
          }
          break;
        case 'levelComplete': {
          this.flash = 0.75;
          this.flashColor.set(1, 0.86, 0.6);
          this.onShake?.(0.4);
          const exit = Object.values(state.entities).find((e) => e.kind === 'exitPortal');
          if (exit) {
            p.set(unitsToWorld(exit.x), unitsToWorld(exit.y), unitsToWorld(exit.z));
            for (let i = 0; i < 3; i++) this.ring(p.clone().setY(p.y + 0.1), i % 2 ? PALETTE.gold : PALETTE.cyan, 2.5 + i, { life: 1.6, delay: i * 0.18, width: 0.05 });
            this.fountain(p, 120);
          }
          break;
        }
        case 'echoLimitReached':
          this.glitch = Math.max(this.glitch, 0.35);
          break;
        default:
          break;
      }
    }
  }

  private spiral(p: THREE.Vector3, color: number, n: number): void {
    this.c.set(color).multiplyScalar(2.4);
    const count = Math.round(n * this.particleScale);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 6;
      const r = 0.7;
      this.particles.emit(p.x + Math.cos(a) * r, p.y + 0.05 + (i / count) * 0.4, p.z + Math.sin(a) * r, -Math.sin(a) * 1.2, 2.2 + Math.random(), Math.cos(a) * 1.2, this.c, 0.08, 0.9, 0, 1.2);
    }
  }

  private implode(p: THREE.Vector3, color: number, n: number): void {
    this.c.set(color).multiplyScalar(2.2);
    const count = Math.round(n * this.particleScale);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.5) * 2;
      const r = 1.4;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      this.particles.emit(p.x + x, p.y + e, p.z + z, -x * 2.6, -e * 2.6, -z * 2.6, this.c, 0.08, 0.45, 0, 0.5);
    }
  }

  private fountain(p: THREE.Vector3, n: number): void {
    const count = Math.round(n * this.particleScale);
    for (let i = 0; i < count; i++) {
      this.c.set(i % 3 === 0 ? PALETTE.cyan : PALETTE.goldHot).multiplyScalar(2.4);
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 2.5;
      this.particles.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * v, 4 + Math.random() * 4, Math.sin(a) * v, this.c, 0.1, 1.6 + Math.random(), -6, 0.6);
    }
  }

  update(dt: number): void {
    this.particles.update(dt);
    for (const r of this.rings) {
      if (r.t >= r.life) {
        r.mesh.visible = false;
        continue;
      }
      if (r.delay > 0) {
        r.delay -= dt;
        r.mesh.visible = false;
        continue;
      }
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      r.mesh.visible = k < 1;
      r.mat.uniforms['uProgress']!.value = k;
      if (r.growY) r.mesh.position.y += r.growY * dt;
    }
    this.rewind = Math.max(0, this.rewind - dt / 1.1);
    this.glitch = Math.max(0, this.glitch - dt / 0.6);
    this.flash = Math.max(0, this.flash - dt / 1.2);
  }

  clear(): void {
    for (const r of this.rings) {
      r.t = r.life;
      r.mesh.visible = false;
    }
  }

  dispose(): void {
    this.particles.dispose();
    this.ringGeo.dispose();
    for (const r of this.rings) r.mat.dispose();
  }
}

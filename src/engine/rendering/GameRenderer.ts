import * as THREE from 'three';
import { unitsToWorld, type ActorView, type EntityView, type LevelDefinition, type SimEvent, type SimView } from '../contracts';
import { ActorVisual } from '../../graphics/animation/actorVisual';
import { createAmbientMotes } from '../../graphics/effects/particles';
import { VfxSystem } from '../../graphics/effects/vfx';
import { buildBackdrop, type Backdrop } from '../../graphics/environment/backdrop';
import { buildKit, type BuiltKit } from '../../graphics/environment/kit';
import { WireNetwork } from '../../graphics/environment/wires';
import { CARRIABLE_VISUAL_KINDS, createEntityVisual, MovingPlatformVisual, type EntityVisual } from '../../graphics/entities';
import { MaterialLibrary } from '../../graphics/materials/library';
import { PALETTE } from '../../graphics/materials/palette';
import { CameraRig, type CameraMode } from './CameraRig';
import { createEnvironmentTexture } from './environmentMap';
import { PostFX } from './PostFX';
import { QUALITY_PRESETS, type QualityLevel, type QualitySettings } from './quality';

/**
 * GameRenderer — the public rendering facade the app wires in.
 *
 * Contract: it consumes ONLY the read-only SimView (current + previous tick) and the SimEvent stream, and
 * interpolates between ticks with `alpha` (FixedStepper.alpha). It never writes game state and nothing it
 * computes feeds back into the simulation.
 */
export interface GameRenderer {
  readonly domElement: HTMLCanvasElement;
  readonly camera: THREE.PerspectiveCamera;
  /** Builds the chamber for a level (disposes the previous one). Pass the tick-0 state to place actors at once. */
  setLevel(level: LevelDefinition, initialState?: SimView): void;
  /** Draws one frame. `events` = everything drained since the last frame (may be empty). */
  render(state: SimView, prevState: SimView, alpha: number, events?: readonly SimEvent[], dtSeconds?: number): void;
  resize(width?: number, height?: number): void;
  setQuality(level: QualityLevel): void;
  getQuality(): QualityLevel;
  setCameraMode(mode: CameraMode): void;
  getCameraMode(): CameraMode;
  /** Plays the level-intro fly-in (also triggered automatically by setLevel unless disabled). */
  playIntro(): void;
  /** Camera yaw in 45° steps for `InputSampler.yawStep` (W = screen-up). */
  getCameraYawStep(): number;
  /** Per-frame renderer statistics (draw calls, triangles, active particles). */
  stats(): { drawCalls: number; triangles: number; particles: number; geometries: number; textures: number };
  dispose(): void;
}

export interface GameRendererOptions {
  quality?: QualityLevel;
  /** Play the intro fly-in on setLevel (default true). */
  introOnLevelLoad?: boolean;
  /** Keep the drawing buffer (screenshots / tests). default false */
  preserveDrawingBuffer?: boolean;
}

export type { CameraMode, QualityLevel };

export function createGameRenderer(container: HTMLElement, opts: GameRendererOptions = {}): GameRenderer {
  return new GameRendererImpl(container, opts);
}

class GameRendererImpl implements GameRenderer {
  readonly domElement: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly post: PostFX;
  private readonly lib: MaterialLibrary;
  private readonly envTex: THREE.Texture;
  private quality: QualityLevel;
  private q: QualitySettings;

  private readonly levelRoot = new THREE.Group();
  private readonly actorRoot = new THREE.Group();
  private readonly fxRoot = new THREE.Group();
  private readonly key: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly pointLights: THREE.PointLight[] = [];
  private vfx: VfxSystem;
  private kit: BuiltKit | null = null;
  private backdrop: Backdrop | null = null;
  private wires: WireNetwork | null = null;
  private motes: (THREE.Points & { material: THREE.ShaderMaterial })[] = [];
  private level: LevelDefinition | null = null;
  private readonly entityVisuals = new Map<string, EntityVisual>();
  private readonly actorVisuals = new Map<string, ActorVisual>();
  private readonly centre = new THREE.Vector3();
  private span = 20;
  private time = 0;
  private lastNow = 0;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly focusVel = new THREE.Vector3();
  private readonly lastFocus = new THREE.Vector3();
  private hasFocus = false;
  private readonly introOnLoad: boolean;
  private onResize = () => this.resize();
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    opts: GameRendererOptions,
  ) {
    this.quality = opts.quality ?? 'high';
    this.q = QUALITY_PRESETS[this.quality];
    this.introOnLoad = opts.introOnLevelLoad ?? true;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.domElement = this.renderer.domElement;
    this.domElement.style.display = 'block';
    this.domElement.style.width = '100%';
    this.domElement.style.height = '100%';
    container.appendChild(this.domElement);

    this.lib = new MaterialLibrary();
    this.envTex = createEnvironmentTexture(this.renderer);
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.6;
    this.scene.background = new THREE.Color(PALETTE.sky);

    this.rig = new CameraRig(1);
    this.rig.attachWheel(container);
    this.post = new PostFX(this.renderer, this.scene, this.rig.camera);

    this.hemi = new THREE.HemisphereLight(0x8ab4d8, 0x4a3420, 0.55);
    this.key = new THREE.DirectionalLight(0xffcf9a, 3.6);
    this.key.castShadow = true;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 3;
    this.rim = new THREE.DirectionalLight(0x5fb6ff, 1.1);
    this.scene.add(this.hemi, this.key, this.key.target, this.rim, this.rim.target);
    this.scene.add(this.levelRoot, this.actorRoot, this.fxRoot);

    this.vfx = new VfxSystem(this.lib.sprite, this.q);
    this.wireVfx();
    this.fxRoot.add(this.vfx.group);

    this.applyQuality();
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  private wireVfx(): void {
    this.vfx.onDivergence = (id) => this.actorVisuals.get(id)?.pulseGlitch();
    this.vfx.onRemanifest = () => {
      for (const v of this.actorVisuals.values()) v.remanifest();
    };
  }

  // ------------------------------------------------------------------ level lifecycle

  setLevel(level: LevelDefinition, initialState?: SimView): void {
    this.clearLevel();
    this.level = level;
    const kit = buildKit(level, this.lib);
    this.kit = kit;
    this.levelRoot.add(kit.group);
    const b = kit.grid.bounds;
    this.centre.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const radius = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2;

    this.backdrop = buildBackdrop(this.lib, this.centre, this.span, { shafts: this.q.shafts, seed: hashString(level.id) });
    this.levelRoot.add(this.backdrop.group);
    this.wires = new WireNetwork(level, kit.grid);
    this.levelRoot.add(this.wires.group);
    this.buildMotes();

    // entity visuals
    for (const def of level.entities) {
      const v = createEntityVisual({ lib: this.lib, def, grid: kit.grid, vfx: this.vfx, quality: { particles: this.q.particles, lights: this.q.pointLights > 0 } });
      if (!v) continue;
      this.entityVisuals.set(def.id, v);
      this.levelRoot.add(v.root);
      if (v instanceof MovingPlatformVisual) this.levelRoot.add(v.pathMarkers);
      // place immediately (before the first state arrives)
      v.root.position.set((def.col + 0.5) * 2, (def.level ?? Math.max(0, kit.grid.tileAt(def.col, def.row).h)) * 2, (def.row + 0.5) * 2);
    }

    this.layoutLights();
    this.fitShadowCamera();
    this.scene.fog = new THREE.FogExp2(0x24506e, 0.0085);

    const rigCentre = this.centre.clone().setY(b.maxLevel > 0 ? 0.8 : 0);
    if (level.camera?.focus) rigCentre.set((level.camera.focus.col + 0.5) * 2, rigCentre.y, (level.camera.focus.row + 0.5) * 2);
    this.rig.setLevel(rigCentre, radius, { yawStep: level.camera?.yawStep ?? 0, zoom: level.camera?.zoom ?? 1 });
    if (this.introOnLoad) this.rig.playIntro();
    else this.rig.mode = 'follow';
    this.hasFocus = false;
    if (initialState) this.syncActors(initialState, initialState, 1, 0);
  }

  private clearLevel(): void {
    for (const v of this.entityVisuals.values()) {
      v.root.removeFromParent();
      v.dispose();
    }
    this.entityVisuals.clear();
    for (const v of this.actorVisuals.values()) {
      v.root.removeFromParent();
      v.dispose();
    }
    this.actorVisuals.clear();
    this.wires?.dispose();
    this.wires = null;
    if (this.kit) {
      this.kit.group.removeFromParent();
      this.kit.dispose();
      this.kit = null;
    }
    if (this.backdrop) {
      this.backdrop.group.removeFromParent();
      this.backdrop.dispose();
      this.backdrop = null;
    }
    for (const m of this.motes) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
    this.motes = [];
    for (const l of this.pointLights) {
      l.removeFromParent();
      l.dispose();
    }
    this.pointLights.length = 0;
    this.vfx.clear();
    this.levelRoot.clear();
  }

  private buildMotes(): void {
    const b = this.kit?.grid.bounds;
    if (!b) return;
    const box = new THREE.Box3(new THREE.Vector3(b.minX - 6, -2, b.minZ - 6), new THREE.Vector3(b.maxX + 6, 9, b.maxZ + 6));
    const dust = createAmbientMotes(this.lib.sprite, this.q.motes, box, 0xffd7a0, { size: 0.05, rise: 0.08, sway: 0.6, seed: 3 });
    const energy = createAmbientMotes(this.lib.spriteHard, Math.round(this.q.motes * 0.25), box, PALETTE.cyan, { size: 0.06, rise: 0.45, sway: 0.25, seed: 9 });
    const far = new THREE.Box3(new THREE.Vector3(b.minX - 60, -40, b.minZ - 80), new THREE.Vector3(b.maxX + 60, 30, b.minZ - 10));
    const embers = createAmbientMotes(this.lib.sprite, Math.round(this.q.motes * 0.5), far, 0x7fd0ff, { size: 0.35, rise: 0.6, sway: 1.5, seed: 21 });
    this.motes.push(dust, energy, embers);
    for (const m of this.motes) this.fxRoot.add(m);
  }

  private layoutLights(): void {
    for (const l of this.pointLights) {
      l.removeFromParent();
      l.dispose();
    }
    this.pointLights.length = 0;
    const budget = this.q.pointLights;
    const entityLights = [...this.entityVisuals.values()].filter((v) => v.light).length;
    const kitLights = [...(this.kit?.lights ?? [])].sort((a, b) => b.priority - a.priority);
    // spread: greedily pick lights far from those already chosen
    const chosen: typeof kitLights = [];
    for (const l of kitLights) {
      if (chosen.length >= Math.max(0, budget - entityLights)) break;
      if (chosen.every((c) => c.position.distanceTo(l.position) > 3.5)) chosen.push(l);
    }
    for (const l of chosen) {
      const pl = new THREE.PointLight(l.color, l.intensity, l.distance, 1.7);
      pl.position.copy(l.position);
      this.levelRoot.add(pl);
      this.pointLights.push(pl);
    }
    for (const v of this.entityVisuals.values()) if (v.light) v.light.visible = budget > 0;
  }

  private fitShadowCamera(): void {
    const b = this.kit?.grid.bounds;
    if (!b) return;
    const c = this.centre;
    const r = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 3;
    this.key.position.set(c.x - r * 0.75, 24 + r * 0.6, c.z + r * 0.45);
    this.key.target.position.set(c.x, 0, c.z);
    const cam = this.key.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 120;
    cam.updateProjectionMatrix();
    this.rim.position.set(c.x + r, 14, c.z - r * 1.4);
    this.rim.target.position.set(c.x, 0, c.z);
  }

  // ------------------------------------------------------------------ per-frame

  render(state: SimView, prevState: SimView, alpha: number, events: readonly SimEvent[] = [], dtSeconds?: number): void {
    if (this.disposed) return;
    const now = performance.now();
    let dt = dtSeconds ?? (this.lastNow ? (now - this.lastNow) / 1000 : 1 / 60);
    this.lastNow = now;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    const a = Math.min(1, Math.max(0, alpha));

    if (events.length) this.vfx.handle(events, state);
    this.syncActors(state, prevState, a, dt);
    this.syncEntities(state, prevState, a, dt);
    this.wires?.update(state, dt, this.time);
    this.kit?.animated.forEach((x) => x.update(this.time));
    this.backdrop?.update(this.time);
    for (const m of this.motes) m.material.uniforms['uTime']!.value = this.time;
    this.vfx.update(dt);

    // camera follows the player (render-interpolated)
    const player = this.actorVisuals.get('player');
    let focus: THREE.Vector3 | null = null;
    if (player) {
      focus = this.tmpA.copy(player.root.position);
      if (this.hasFocus && dt > 0) {
        const v = this.tmpB.subVectors(focus, this.lastFocus).divideScalar(dt);
        if (v.length() < 20) this.focusVel.lerp(v, 1 - Math.exp(-8 * dt));
      }
      this.lastFocus.copy(focus);
      this.hasFocus = true;
    }
    this.rig.update(dt, focus, this.focusVel);

    // grade uniforms
    const u = this.post.grade.uniforms;
    u['uTime']!.value = this.time;
    u['uRewind']!.value = easeOut(this.vfx.rewind);
    u['uGlitch']!.value = this.vfx.glitch;
    u['uFlash']!.value = this.vfx.flash * this.vfx.flash;
    (u['uFlashColor']!.value as THREE.Color).copy(this.vfx.flashColor);

    this.renderer.info.reset();
    this.post.render(dt);
  }

  private actorPos(cur: ActorView, prev: ActorView | undefined, a: number, out: THREE.Vector3): THREE.Vector3 {
    const p = prev && Math.abs(prev.x - cur.x) + Math.abs(prev.z - cur.z) < 2000 ? prev : cur;
    return out.set(unitsToWorld(p.x + (cur.x - p.x) * a), unitsToWorld(p.y + (cur.y - p.y) * a), unitsToWorld(p.z + (cur.z - p.z) * a));
  }

  private syncActors(state: SimView, prev: SimView, a: number, dt: number): void {
    const seen = new Set<string>();
    for (const actor of state.actors) {
      seen.add(actor.id);
      let v = this.actorVisuals.get(actor.id);
      if (!v) {
        v = new ActorVisual(this.lib, actor, { trail: this.q.trails });
        this.actorVisuals.set(actor.id, v);
        this.actorRoot.add(v.root);
        if (v.trailMesh) this.fxRoot.add(v.trailMesh);
      }
      v.setEchoIndex(actor.echoIndex);
      const pa = prev.actors.find((x) => x.id === actor.id);
      const pos = this.actorPos(actor, pa, a, this.tmpB);
      v.update(dt, actor, pos, actor.carrying !== null);
    }
    for (const [id, v] of this.actorVisuals) {
      if (seen.has(id)) continue;
      v.root.removeFromParent();
      v.dispose();
      this.actorVisuals.delete(id);
    }
  }

  private syncEntities(state: SimView, prev: SimView, a: number, dt: number): void {
    const pos = new THREE.Vector3();
    for (const [id, v] of this.entityVisuals) {
      const e = state.entities[id] as EntityView | undefined;
      if (!e) continue;
      const pe = (prev.entities[id] as EntityView | undefined) ?? e;
      if (e.carriedBy && CARRIABLE_VISUAL_KINDS.has(e.kind)) {
        const carrier = this.actorVisuals.get(e.carriedBy);
        if (carrier) {
          carrier.character.carryAnchor.getWorldPosition(pos);
          pos.y -= e.kind === 'crate' ? 0.15 : 0.1;
        } else pos.set(unitsToWorld(e.x), unitsToWorld(e.y), unitsToWorld(e.z));
      } else {
        const jump = Math.abs(pe.x - e.x) + Math.abs(pe.z - e.z) > 1500 || pe.carriedBy !== e.carriedBy;
        const p = jump ? e : pe;
        pos.set(unitsToWorld(p.x + (e.x - p.x) * a), unitsToWorld(p.y + (e.y - p.y) * a), unitsToWorld(p.z + (e.z - p.z) * a));
      }
      v.update({ e, prev: pe, alpha: a, dt, time: this.time, pos, state });
    }
  }

  // ------------------------------------------------------------------ settings

  resize(width?: number, height?: number): void {
    const w = width ?? (this.container.clientWidth || window.innerWidth);
    const h = height ?? (this.container.clientHeight || window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
    this.vfx.particles.setViewportHeight(h * pr, this.rig.camera.fov);
    for (const m of this.motes) m.material.uniforms['uScale']!.value = (h * pr) / (2 * Math.tan((this.rig.camera.fov * Math.PI) / 360));
  }

  private applyQuality(): void {
    const q = this.q;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = q.shadowType;
    this.key.castShadow = q.shadows;
    this.key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
    this.post.apply(q);
  }

  setQuality(level: QualityLevel): void {
    if (level === this.quality) return;
    this.quality = level;
    this.q = QUALITY_PRESETS[level];
    this.applyQuality();
    // particle budget + motes + lights depend on the preset
    this.vfx.group.removeFromParent();
    this.vfx.dispose();
    this.vfx = new VfxSystem(this.lib.sprite, this.q);
    this.wireVfx();
    this.fxRoot.add(this.vfx.group);
    if (this.level) {
      for (const m of this.motes) {
        m.removeFromParent();
        m.geometry.dispose();
        m.material.dispose();
      }
      this.motes = [];
      this.buildMotes();
      this.layoutLights();
    }
    this.resize();
    // material programs depend on shadow settings
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
  }

  getQuality(): QualityLevel {
    return this.quality;
  }

  setCameraMode(mode: CameraMode): void {
    if (mode === 'intro') this.rig.playIntro();
    else this.rig.mode = mode;
  }

  getCameraMode(): CameraMode {
    return this.rig.mode;
  }

  playIntro(): void {
    this.rig.playIntro();
  }

  getCameraYawStep(): number {
    return this.rig.yawStep;
  }

  stats() {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      particles: this.vfx.particles.activeCount,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.clearLevel();
    this.vfx.dispose();
    this.post.dispose();
    this.lib.dispose();
    this.envTex.dispose();
    this.rig.dispose();
    this.renderer.dispose();
    this.domElement.remove();
  }
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

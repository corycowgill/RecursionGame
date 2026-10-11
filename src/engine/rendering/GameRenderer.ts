import * as THREE from 'three';
import { unitsToWorld, type ActorState, type ActorView, type EntityView, type LevelDefinition, type SimEvent, type SimView, type Timeline } from '../contracts';
import { ActorVisual } from '../../graphics/animation/actorVisual';
import { selectLookTarget } from '../../graphics/animation/lookTarget';
import { ContactShadows } from '../../graphics/effects/contactShadows';
import { EchoIntentLayer } from '../../graphics/effects/echoIntents';
import type { GhostPath, WalkOn } from '../../graphics/effects/forecast';
import { GhostPathLayer } from '../../graphics/effects/ghostPaths';
import { createAmbientMotes } from '../../graphics/effects/particles';
import { VfxSystem } from '../../graphics/effects/vfx';
import { buildBackdrop, type Backdrop } from '../../graphics/environment/backdrop';
import { buildKit, type BuiltKit } from '../../graphics/environment/kit';
import { DEFAULT_MOOD, moodFor, type ChamberMood } from '../../graphics/environment/moods';
import { WireNetwork } from '../../graphics/environment/wires';
import { CARRIABLE_VISUAL_KINDS, createEntityVisual, MovingPlatformVisual, type EntityVisual } from '../../graphics/entities';
import { MaterialLibrary } from '../../graphics/materials/library';
import { PALETTE, type EchoPaletteName } from '../../graphics/materials/palette';
import { CameraRig, type CameraMode } from './CameraRig';
import { comfortParams, type ComfortParams, type ComfortSettings } from './comfort';
import { deviceProfile, targetFpsFor } from './device';
import { createEnvironmentTexture } from './environmentMap';
import { PostFX } from './PostFX';
import { estimateTextureMemory, type TextureMemory } from './memory';
import { QUALITY_PRESETS, type QualityLevel, type QualitySettings } from './quality';
import { ResolutionController } from './resolution';

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
  /**
   * Screen framing (eased): `lift` raises the subject by a fraction of the viewport height so UI docked at the
   * bottom never covers it, `shift` moves it right by a fraction of the width, `zoom` scales the follow distance.
   */
  setFraming(f: { lift?: number; shift?: number; zoom?: number }): void;
  /**
   * Timeline for the in-world echo intent badges (which echo will use which object, and when). Pass the current
   * TemporalGame.getTimeline() each frame, or null to hide them (menus, attract mode).
   */
  setTimeline(timeline: Timeline | null): void;
  /**
   * Walk-on plan for the badges over pressure plates / ride-lifts (which echo steps on it, and when), from the echo
   * forecast (`scheduleWalkOns`). null hides them.
   */
  setWalkOns(walkOns: readonly WalkOn[] | null): void;
  /** Temporal-preview ghost paths (`extractGhostPaths`): dashed trails of each echo's upcoming movement. null clears. */
  setGhostPaths(paths: readonly GhostPath[] | null): void;
  /**
   * Echo colour palette (Settings → Echo colours, round 4): echo holograms, halos, trails, number badges, intent
   * badges and ghost paths use the same colours as the UI timeline tracks. 'highContrast' = colour-blind-safe set.
   */
  setEchoPalette(palette: EchoPaletteName): void;
  /**
   * Player comfort settings: camera sensitivity (wheel zoom rate, follow/pan speed) and reduced motion (no camera
   * shake, short intro without orbit swing, damped screen distortion and flashes, fewer particles, no ambient bob).
   */
  setComfort(c: Partial<ComfortSettings>): void;
  /** Plays the level-intro fly-in (also triggered automatically by setLevel unless disabled). */
  playIntro(): void;
  /** Camera yaw in 45° steps for `InputSampler.yawStep` (W = screen-up). */
  getCameraYawStep(): number;
  /** Per-frame renderer statistics (draw calls, triangles, active particles, render scale). */
  stats(): RendererStats;
  /** Estimated GPU memory held by textures and render targets (bytes; debug / perf reports). */
  textureMemory(): TextureMemory;
  /**
   * Dynamic resolution guard on/off (default on, except under automation: `navigator.webdriver`). Turning it off
   * restores the preset's full pixel ratio.
   */
  setDynamicResolution(enabled: boolean): void;
  /** True between `webglcontextlost` and `webglcontextrestored` (iOS drops contexts of backgrounded pages). */
  isContextLost(): boolean;
  dispose(): void;
}

export interface RendererStats {
  drawCalls: number;
  triangles: number;
  particles: number;
  geometries: number;
  textures: number;
  /** Dynamic-resolution scale (fraction of the preset's pixel-ratio cap). */
  renderScale: number;
  /** Effective canvas pixel ratio. */
  pixelRatio: number;
  contextLost: boolean;
}

export interface GameRendererOptions {
  quality?: QualityLevel;
  /** Dynamic resolution guard (default: on, off under `navigator.webdriver` so test screenshots stay stable). */
  dynamicResolution?: boolean;
  /** Frame rate the guard holds (default: 30 on phones/tablets, 60 on desktop). */
  targetFps?: number;
  /** Play the intro fly-in on setLevel (default true). */
  introOnLevelLoad?: boolean;
  /** Keep the drawing buffer (screenshots / tests). default false */
  preserveDrawingBuffer?: boolean;
}

export type { CameraMode, QualityLevel, TextureMemory };

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
  private quality: QualityLevel;
  private q: QualitySettings;

  private readonly levelRoot = new THREE.Group();
  private readonly actorRoot = new THREE.Group();
  private readonly fxRoot = new THREE.Group();
  private readonly intents = new EchoIntentLayer();
  private readonly ghosts = new GhostPathLayer();
  private comfort: ComfortParams = comfortParams();
  private echoPalette: EchoPaletteName = 'default';
  private timeline: Timeline | null = null;
  private readonly lookTmp = new THREE.Vector3();
  private readonly defById = new Map<string, LevelDefinition['entities'][number]>();
  private levelId = '';
  /** Round 5: the chamber's lighting mood / accent / material variant (graphics-side table, from the level id). */
  private mood: ChamberMood = DEFAULT_MOOD;
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
  private contactShadows: ContactShadows | null = null;
  private dynres: ResolutionController;
  private dynresEnabled: boolean;
  private readonly targetFps: number;
  private renderScale = 1;
  private lastFrameAt = 0;
  private contextLost = false;
  private envTexture: THREE.Texture;
  /**
   * Shader warm-up (round 5): an off-scene echo visual and ghost-path layer kept alive so their programs stay in
   * three's program cache; compiled against the chamber's lights on every level load (see `prewarm`).
   */
  private warmEcho: ActorVisual | null = null;
  private warmKey = '';
  private warmGhosts: GhostPathLayer | null = null;
  private warmGeneration = 0;
  /** Resolves when the last level load's shader warm-up finished (tests / perf tooling). */
  private warmPromise: Promise<void> = Promise.resolve();
  private readonly onContextLost = (e: Event): void => {
    e.preventDefault(); // allow the browser to restore it
    this.contextLost = true;
  };
  private readonly onContextRestored = (): void => this.restoreContext();

  constructor(
    private readonly container: HTMLElement,
    opts: GameRendererOptions,
  ) {
    this.quality = opts.quality ?? 'high';
    this.q = QUALITY_PRESETS[this.quality];
    this.introOnLoad = opts.introOnLevelLoad ?? true;
    if (!this.q) {
      this.quality = 'high';
      this.q = QUALITY_PRESETS.high;
    }
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.domElement = this.renderer.domElement;
    this.domElement.style.display = 'block';
    this.domElement.style.width = '100%';
    this.domElement.style.height = '100%';
    container.appendChild(this.domElement);

    this.lib = new MaterialLibrary({ textureScale: this.q.textureScale });
    this.envTexture = createEnvironmentTexture(this.renderer, this.q.envMapSize);
    this.scene.environment = this.envTexture;
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
    this.scene.add(this.levelRoot, this.actorRoot, this.fxRoot, this.intents.group, this.ghosts.group);

    this.vfx = new VfxSystem(this.lib.sprite, this.q);
    this.wireVfx();
    this.fxRoot.add(this.vfx.group);

    const webdriver = typeof navigator !== 'undefined' && navigator.webdriver === true;
    this.dynresEnabled = opts.dynamicResolution ?? !webdriver;
    this.targetFps = opts.targetFps ?? targetFpsFor(deviceProfile());
    this.dynres = this.makeResolutionController();
    // three.js registers its own handlers first (it re-initialises GL state on restore); ours rebuild what lived
    // only on the GPU (the PMREM environment) and pause rendering in between.
    this.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    this.applyQuality();
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  private makeResolutionController(): ResolutionController {
    return new ResolutionController({ targetFps: this.targetFps, minScale: this.q.minRenderScale, maxScale: 1 });
  }

  /** Re-create GPU-only resources after a context restore (textures/geometry re-upload lazily by themselves). */
  private restoreContext(): void {
    if (this.disposed) return;
    this.contextLost = false;
    // the PMREM environment was rendered on the GPU: its pixels are gone, regenerate it
    const old = this.envTexture;
    this.envTexture = createEnvironmentTexture(this.renderer, this.q.envMapSize);
    this.scene.environment = this.envTexture;
    old.dispose();
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
    this.lastFrameAt = 0;
    this.dynres.resetWindow();
    this.resize();
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  private wireVfx(): void {
    this.vfx.setIntensity(this.comfort.particles);
    this.vfx.onShake = (amount) => this.rig.addShake(amount);
    this.vfx.onDivergence = (id) => this.actorVisuals.get(id)?.pulseGlitch();
    this.vfx.onRemanifest = () => {
      for (const v of this.actorVisuals.values()) v.remanifest();
    };
  }

  // ------------------------------------------------------------------ level lifecycle

  setLevel(level: LevelDefinition, initialState?: SimView): void {
    this.clearLevel();
    this.level = level;
    this.levelId = level.id;
    this.mood = moodFor(level);
    this.applyMood();
    this.defById.clear();
    for (const d of level.entities) this.defById.set(d.id, d);
    const kit = buildKit(level, this.lib);
    this.kit = kit;
    this.levelRoot.add(kit.group);
    const b = kit.grid.bounds;
    this.centre.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const radius = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2;

    this.buildBackdropLayer();
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
    this.scene.fog = new THREE.FogExp2(this.mood.fog.color, this.mood.fog.density);

    const rigCentre = this.centre.clone().setY(b.maxLevel > 0 ? 0.8 : 0);
    if (level.camera?.focus) rigCentre.set((level.camera.focus.col + 0.5) * 2, rigCentre.y, (level.camera.focus.row + 0.5) * 2);
    this.rig.setLevel(rigCentre, radius, { yawStep: level.camera?.yawStep ?? 0, zoom: level.camera?.zoom ?? 1 });
    if (this.introOnLoad) this.rig.playIntro();
    else this.rig.mode = 'follow';
    this.hasFocus = false;
    if (initialState) this.syncActors(initialState, initialState, 1, 0);
    this.prewarm();
  }

  /**
   * Precompiles every shader program the chamber can need before it is first drawn (round 5): the level itself
   * (kit, entities, pooled VFX rings, intent badges, which already sit in the scene, visible or not) and, through
   * off-scene stand-ins, what only appears later: echo holograms (body, x-ray, halo, number badge, trail) and the
   * temporal-preview ghost paths. Programs depend on the chamber's light count, so this runs on every level load.
   * Uses compileAsync (KHR_parallel_shader_compile where available), so on a real GPU it overlaps the intro fly-in
   * instead of stalling the frame in which the first echo spawns.
   */
  private prewarm(): void {
    if (this.disposed || this.contextLost) return;
    const gen = ++this.warmGeneration;
    const key = `${this.q.characterLod}|${this.q.trails}`;
    if (!this.warmEcho || this.warmKey !== key) {
      this.warmEcho?.dispose();
      this.warmEcho = new ActorVisual(this.lib, warmupEcho(), { trail: this.q.trails, lod: this.q.characterLod, palette: this.echoPalette });
      this.warmKey = key;
    }
    if (!this.warmGhosts) {
      this.warmGhosts = new GhostPathLayer();
      this.warmGhosts.setPaths([
        {
          actorId: 'echo:warm',
          echoIndex: 0,
          points: [
            { tick: 0, x: 0, y: 0, z: 0 },
            { tick: 60, x: 2000, y: 0, z: 0 },
          ],
          markers: [{ tick: 60, x: 2000, y: 0, z: 0, seconds: 1 }],
        },
      ]);
    }
    const stage = new THREE.Group();
    stage.add(this.warmEcho.root, this.warmGhosts.group);
    if (this.warmEcho.trailMesh) stage.add(this.warmEcho.trailMesh);
    const camera = this.rig.camera;
    // With KHR_parallel_shader_compile the driver compiles in the background (overlapping the intro); without it
    // (e.g. SwiftShader, some mobile GPUs) compileAsync would only poll, so compile synchronously here: the cost
    // moves into the level load instead of the frame in which the first echo appears.
    const parallel = this.renderer.extensions.has('KHR_parallel_shader_compile');
    const compile = (root: THREE.Object3D, target: THREE.Scene): Promise<unknown> => {
      if (parallel) return this.renderer.compileAsync(root, camera, target);
      const mats = this.renderer.compile(root, camera, target);
      // the driver may defer the link until first use: query the program now (what the first draw would do)
      for (const m of mats) {
        const prog = (this.renderer.properties.get(m) as { currentProgram?: { getUniforms(): unknown; getAttributes(): unknown } }).currentProgram;
        prog?.getUniforms();
        prog?.getAttributes();
      }
      return Promise.resolve();
    };
    // Programs depend on the render target: the scene is drawn into the composer's half-float target (linear output, no
    // tone mapping in the material; OutputPass does that), so compile against the same kind of target, or every
    // program would be built for the canvas and compiled a second time on first draw.
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.post.composer.readBuffer);
    try {
      this.warmPromise = Promise.all([compile(this.scene, this.scene), compile(stage, this.scene)])
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          if (gen === this.warmGeneration) stage.clear();
        });
    } catch {
      // compile is an optimisation only: never let it break a level load
      stage.clear();
      this.warmPromise = Promise.resolve();
    }
    this.renderer.setRenderTarget(prevTarget);
  }

  /** Resolves once the current chamber's shader warm-up has finished (debug / perf tooling). */
  whenWarm(): Promise<void> {
    return this.warmPromise;
  }

  private buildBackdropLayer(): void {
    if (this.backdrop) {
      this.backdrop.group.removeFromParent();
      this.backdrop.dispose();
    }
    this.backdrop = buildBackdrop(this.lib, this.centre, this.span, { shafts: this.q.shafts, seed: hashString(this.levelId), detail: this.q.backdrop, mood: this.mood });
    this.levelRoot.add(this.backdrop.group);
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
    const pr = this.mood.practical;
    const tint = new THREE.Color(pr.tint);
    for (const l of chosen) {
      // warm practicals (sconces, niches, lamp posts) take the chamber mood's lamp tint; coloured decor lights keep theirs
      const practical = l.color === PALETTE.warmLamp || l.color === PALETTE.gold;
      const pl = new THREE.PointLight(practical ? new THREE.Color(l.color).lerp(tint, pr.mix) : l.color, l.intensity * (practical ? pr.scale : 1), l.distance, 1.7);
      pl.position.copy(l.position);
      this.levelRoot.add(pl);
      this.pointLights.push(pl);
    }
    for (const v of this.entityVisuals.values()) if (v.light) v.light.visible = budget > 0;
  }

  /**
   * Applies the chamber mood (round 5): key / rim / fill, exposure, environment strength, background, display grade and
   * the shared material variant. Fog and the backdrop read `this.mood` when they are (re)built. Only light colours,
   * intensities and uniforms change, so no program recompiles (light counts stay the same).
   */
  private applyMood(): void {
    const m = this.mood;
    this.key.color.set(m.key.color);
    this.key.intensity = m.key.intensity;
    this.rim.color.set(m.rim.color);
    this.rim.intensity = m.rim.intensity;
    this.hemi.color.set(m.hemi.sky);
    this.hemi.groundColor.set(m.hemi.ground);
    this.hemi.intensity = m.hemi.intensity;
    this.renderer.toneMappingExposure = m.exposure;
    this.scene.environmentIntensity = m.env;
    (this.scene.background as THREE.Color).set(m.background);
    const u = this.post.grade.uniforms;
    (u['uWarm']!.value as THREE.Color).setRGB(...m.grade.warm, THREE.LinearSRGBColorSpace);
    (u['uCool']!.value as THREE.Color).setRGB(...m.grade.cool, THREE.LinearSRGBColorSpace);
    u['uSplit']!.value = m.grade.split;
    u['uSaturation']!.value = m.grade.saturation;
    u['uContrast']!.value = m.grade.contrast;
    u['uVignette']!.value = m.grade.vignette;
    this.lib.applyMood(m.material, { wear: this.q.materialWear });
  }

  /** The active chamber mood (debug / tests / preview tooling). */
  getMood(): ChamberMood {
    return this.mood;
  }

  private fitShadowCamera(): void {
    const b = this.kit?.grid.bounds;
    if (!b) return;
    const c = this.centre;
    const r = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 3;
    const from = this.mood.keyFrom;
    let ext = r;
    if (from) {
      // round 5: the mood sets the sun direction (low dawn sun, overhead lab light, side-lit furnace hall, …)
      const v = this.tmpA.set(from[0], from[1], from[2]).normalize();
      const d = 30 + r;
      this.key.position.set(c.x + v.x * d, v.y * d, c.z + v.z * d);
      this.rim.position.set(c.x - v.x * (r + 14), 14, c.z - v.z * (r + 14));
      // a lower sun throws longer shadows: widen the shadow frustum so walls still shadow the floor
      ext = r * (v.y < 0.8 ? 1.2 : 1);
    } else {
      this.key.position.set(c.x - r * 0.75, 24 + r * 0.6, c.z + r * 0.45);
      this.rim.position.set(c.x + r, 14, c.z - r * 1.4);
    }
    this.key.target.position.set(c.x, 0, c.z);
    const cam = this.key.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 140;
    cam.updateProjectionMatrix();
    this.rim.target.position.set(c.x, 0, c.z);
  }

  // ------------------------------------------------------------------ per-frame

  render(state: SimView, prevState: SimView, alpha: number, events: readonly SimEvent[] = [], dtSeconds?: number): void {
    if (this.disposed) return;
    const now = performance.now();
    if (this.contextLost) {
      // nothing can be drawn until the browser restores the context; keep the clocks from jumping afterwards
      this.lastNow = now;
      this.lastFrameAt = 0;
      return;
    }
    this.guardResolution(now, dtSeconds);
    let dt = dtSeconds ?? (this.lastNow ? (now - this.lastNow) / 1000 : 1 / 60);
    this.lastNow = now;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    const a = Math.min(1, Math.max(0, alpha));

    if (events.length) this.vfx.handle(events, state);
    this.syncActors(state, prevState, a, dt);
    this.syncEntities(state, prevState, a, dt);
    this.updateContactShadows(state);
    this.wires?.update(state, dt, this.time);
    this.kit?.animated.forEach((x) => x.update(this.time));
    this.backdrop?.update(this.time);
    // reduced motion: ambient motes drift at a third of the speed
    for (const m of this.motes) m.material.uniforms['uTime']!.value = this.time * (this.comfort.ambientMotion ? 1 : 0.35);
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
    this.intents.update(state, this.levelId, this.rig.camera, this.time);
    this.ghosts.update(state.tick, this.time, dt);

    // grade uniforms
    const u = this.post.grade.uniforms;
    u['uTime']!.value = this.time;
    u['uRewind']!.value = easeOut(this.vfx.rewind) * this.comfort.distortion;
    u['uGlitch']!.value = this.vfx.glitch * this.comfort.distortion;
    u['uFlash']!.value = this.vfx.flash * this.vfx.flash * this.comfort.flash;
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
        v = new ActorVisual(this.lib, actor, { trail: this.q.trails, lod: this.q.characterLod, palette: this.echoPalette });
        this.actorVisuals.set(actor.id, v);
        this.actorRoot.add(v.root);
        if (v.trailMesh) this.fxRoot.add(v.trailMesh);
      }
      v.setEchoIndex(actor.echoIndex);
      const pa = prev.actors.find((x) => x.id === actor.id);
      const pos = this.actorPos(actor, pa, a, this.tmpB);
      // head look: the interactable actually targeted, else (idle) the next echo-intent target nearby
      const look = selectLookTarget(state, actor, this.timeline?.levelId === this.levelId ? this.timeline : null, (id) => this.defById.get(id));
      v.setLookTarget(look ? this.lookTmp.set(look.x, look.y, look.z) : null);
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
        // Every actor in the view has a visual (syncActors runs first), so a missing carrier means the app filtered
        // it out: an echo hidden on the timeline. What it carries is hidden with it (see hiddenCarry docs) rather
        // than drawn at the item's simulated position, which would float a crate where nobody is visible.
        v.root.visible = !!carrier;
        if (!carrier) continue;
        carrier.character.carryAnchor.getWorldPosition(pos);
        pos.y -= e.kind === 'crate' ? 0.15 : 0.1;
      } else {
        v.root.visible = true;
        const jump = Math.abs(pe.x - e.x) + Math.abs(pe.z - e.z) > 1500 || pe.carriedBy !== e.carriedBy;
        const p = jump ? e : pe;
        pos.set(unitsToWorld(p.x + (e.x - p.x) * a), unitsToWorld(p.y + (e.y - p.y) * a), unitsToWorld(p.z + (e.z - p.z) * a));
      }
      v.update({ e, prev: pe, alpha: a, dt, time: this.time, pos, state });
    }
  }

  // ------------------------------------------------------------------ settings

  /** Dynamic resolution: one sample per rendered frame; re-applies the pixel ratio when the scale steps. */
  private guardResolution(now: number, appDt?: number): void {
    const prevAt = this.lastFrameAt;
    this.lastFrameAt = now;
    if (!this.dynresEnabled || prevAt === 0) return;
    const interval = now - prevAt;
    // The app skipped renders on purpose (e.g. menu sub-screen redrawing every 500 ms): its own frame dt is much
    // shorter than the gap between our render calls, so this gap says nothing about GPU cost.
    if (appDt !== undefined && interval > appDt * 1000 * 8 + 20) return;
    if (this.dynres.update(interval)) {
      this.renderScale = this.dynres.scale;
      this.resize();
    }
  }

  private updateContactShadows(state: SimView): void {
    const cs = this.contactShadows;
    if (!cs) return;
    cs.begin();
    for (const v of this.actorVisuals.values()) if (v.root.visible) cs.add(v.root.position, 0.5);
    for (const [id, v] of this.entityVisuals) {
      const e = state.entities[id] as EntityView | undefined;
      if (!e || e.carriedBy || !v.root.visible || !CARRIABLE_VISUAL_KINDS.has(e.kind)) continue;
      cs.add(v.root.position, e.kind === 'crate' ? 0.9 : 0.4);
    }
    cs.end();
  }

  resize(width?: number, height?: number): void {
    const w = width ?? (this.container.clientWidth || window.innerWidth);
    const h = height ?? (this.container.clientHeight || window.innerHeight);
    const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * this.renderScale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
    this.vfx.particles.setViewportHeight(h * pr, this.rig.camera.fov);
    this.ghosts.configure({ pixelScale: pr });
    for (const m of this.motes) m.material.uniforms['uScale']!.value = (h * pr) / (2 * Math.tan((this.rig.camera.fov * Math.PI) / 360));
  }

  private applyQuality(): void {
    const q = this.q;
    if (q.contactShadows && !this.contactShadows) {
      this.contactShadows = new ContactShadows();
      this.fxRoot.add(this.contactShadows.mesh);
    } else if (!q.contactShadows && this.contactShadows) {
      this.contactShadows.dispose();
      this.contactShadows = null;
    }
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = q.shadowType;
    this.key.castShadow = q.shadows;
    this.key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
    this.post.apply(q);
  }

  setQuality(level: QualityLevel): void {
    if (level === this.quality || !QUALITY_PRESETS[level]) return;
    const before = this.q;
    this.quality = level;
    this.q = QUALITY_PRESETS[level];
    this.applyQuality();
    this.lib.applyMood(this.mood.material, { wear: this.q.materialWear });
    // a new preset starts at full scale with its own floor
    this.dynres = this.makeResolutionController();
    this.renderScale = 1;
    if (before.envMapSize !== this.q.envMapSize) {
      const old = this.envTexture;
      this.envTexture = createEnvironmentTexture(this.renderer, this.q.envMapSize);
      this.scene.environment = this.envTexture;
      old.dispose();
    }
    if (this.level && (before.backdrop !== this.q.backdrop || before.shafts !== this.q.shafts)) this.buildBackdropLayer();
    if (before.characterLod !== this.q.characterLod || before.trails !== this.q.trails) {
      // actors are rebuilt with the new mesh LOD / trail setting on the next frame
      for (const v of this.actorVisuals.values()) {
        v.root.removeFromParent();
        v.dispose();
      }
      this.actorVisuals.clear();
    }
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
    // shadow / LOD settings changed the programs: warm the new ones up front
    if (this.level) this.prewarm();
  }

  getQuality(): QualityLevel {
    return this.quality;
  }

  setCameraMode(mode: CameraMode): void {
    if (mode === 'intro') this.rig.playIntro();
    else this.rig.mode = mode;
  }

  setTimeline(timeline: Timeline | null): void {
    this.timeline = timeline;
    this.intents.setTimeline(timeline);
  }

  setWalkOns(walkOns: readonly WalkOn[] | null): void {
    this.intents.setWalkOns(walkOns);
  }

  setGhostPaths(paths: readonly GhostPath[] | null): void {
    this.ghosts.setPaths(paths && paths.length ? paths : null);
  }

  setEchoPalette(palette: EchoPaletteName): void {
    const p: EchoPaletteName = palette === 'highContrast' ? 'highContrast' : 'default';
    if (p === this.echoPalette) return;
    this.echoPalette = p;
    for (const v of this.actorVisuals.values()) v.setPalette(p);
    this.intents.setPalette(p);
    this.ghosts.setPalette(p);
  }

  setComfort(c: Partial<ComfortSettings>): void {
    const p = comfortParams(c);
    this.comfort = p;
    this.rig.zoomRate = p.zoomRate;
    this.rig.setSmoothing(p.followSmoothing);
    this.rig.leadScale = p.lead;
    this.rig.shakeScale = p.shake;
    if (p.shake === 0) this.rig.clearShake();
    this.rig.introSwing = p.introSwing;
    this.rig.setIntroDuration(p.introDuration);
    this.vfx.setIntensity(p.particles);
    this.intents.setReducedMotion(!p.ambientMotion);
    this.ghosts.configure({ reducedMotion: !p.ambientMotion });
  }

  /** Current comfort parameters (debug / tests). */
  getComfort(): ComfortParams {
    return this.comfort;
  }

  setFraming(f: { lift?: number; shift?: number; zoom?: number }): void {
    this.rig.viewLift = Math.min(0.3, Math.max(0, f.lift ?? 0));
    this.rig.viewShift = Math.min(0.3, Math.max(-0.3, f.shift ?? 0));
    this.rig.framingZoom = Math.min(2, Math.max(0.5, f.zoom ?? 1));
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

  stats(): RendererStats {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      particles: this.vfx.particles.activeCount,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      renderScale: this.renderScale,
      pixelRatio: this.renderer.getPixelRatio(),
      contextLost: this.contextLost,
    };
  }

  textureMemory(): TextureMemory {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return estimateTextureMemory(this.scene, {
      shadowMaps: this.q.shadows ? [this.key.shadow.mapSize.x] : [],
      composer: this.post.renderTargetBytes(size.x, size.y),
    });
  }

  setDynamicResolution(enabled: boolean): void {
    this.dynresEnabled = enabled;
    this.lastFrameAt = 0;
    if (!enabled && this.renderScale !== 1) {
      this.dynres.reset();
      this.renderScale = 1;
      this.resize();
    }
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.clearLevel();
    this.warmEcho?.dispose();
    this.warmEcho = null;
    this.warmGhosts?.dispose();
    this.warmGhosts = null;
    this.contactShadows?.dispose();
    this.contactShadows = null;
    this.vfx.dispose();
    this.intents.dispose();
    this.ghosts.dispose();
    this.post.dispose();
    this.lib.dispose();
    this.envTexture.dispose();
    this.rig.dispose();
    this.renderer.dispose();
    this.domElement.remove();
  }
}

/** Idle stand-in echo for the shader warm-up (never added to the scene, never simulated). */
function warmupEcho(): ActorState {
  return {
    id: 'echo:warm' as ActorState['id'],
    kind: 'echo',
    echoIndex: 0,
    loopId: 0,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 2,
    heading: 4,
    moving: false,
    carrying: null,
    strideUnits: 0,
    foot: 0,
    finished: false,
    divergedAtTick: null,
    divergenceCount: 0,
    lastInteraction: null,
    interactHeld: false,
  };
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

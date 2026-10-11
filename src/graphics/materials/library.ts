import * as THREE from 'three';
import type { MaterialMood } from '../environment/moods';
import { PALETTE } from './palette';
import {
  bannerTexture,
  brushedMetalTextures,
  concreteTextures,
  floorEmblemTextures,
  floorGrateTextures,
  floorPlateTextures,
  floorTileTextures,
  gunmetalTextures,
  radialSprite,
  wallPanelTextures,
  type PBRSet,
} from './textures';
import { applyWear, createWearUniforms, type WearUniforms } from './wear';

/**
 * MaterialLibrary — the shared PBR material set for one renderer. Everything here is created once and reused
 * by every module (environment kit, entities, characters, backdrop) so draw calls batch well and level
 * changes do not leak GPU memory. Call dispose() only when the renderer itself is destroyed.
 */
export class MaterialLibrary {
  readonly floorTile: THREE.MeshStandardMaterial;
  readonly floorGrate: THREE.MeshStandardMaterial;
  readonly floorEmblem: THREE.MeshStandardMaterial;
  readonly floorPlate: THREE.MeshStandardMaterial;
  readonly floorPlain: THREE.MeshStandardMaterial;
  readonly wallPanel: THREE.MeshStandardMaterial;
  readonly ivory: THREE.MeshStandardMaterial;
  readonly gunmetal: THREE.MeshStandardMaterial;
  readonly gunmetalDark: THREE.MeshStandardMaterial;
  readonly brass: THREE.MeshStandardMaterial;
  readonly brassPolished: THREE.MeshPhysicalMaterial;
  readonly concrete: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly backdropStone: THREE.MeshStandardMaterial;
  /**
   * Unlit glow whose colour comes from per-instance colour (palette colour x intensity, see `glowColor`). Every
   * batched emissive trim shares this one material, so all of them collapse into one draw call per geometry.
   */
  readonly glow: THREE.MeshBasicMaterial;
  /** Banner cloth (alpha-tested, double-sided). */
  readonly banner: THREE.MeshStandardMaterial;
  readonly sprite: THREE.Texture;
  readonly spriteHard: THREE.Texture;

  /** Shared wear-mask uniforms (round 5, see wear.ts); written by applyMood. */
  readonly wear: WearUniforms = createWearUniforms();
  private readonly baseColors = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private readonly baseRough = new Map<THREE.MeshStandardMaterial, number>();

  private readonly sets: PBRSet[] = [];
  private readonly emissives = new Map<string, THREE.MeshStandardMaterial>();
  private readonly owned: THREE.Material[] = [];
  private readonly extraTextures: THREE.Texture[] = [];

  /**
   * `textureScale` (quality preset, e.g. 0.5 on mobile) scales every procedural texture's resolution: 512² sets
   * become 256², which quarters their GPU memory (iOS Safari is strict about total texture memory).
   */
  constructor(opts: { textureScale?: number } = {}) {
    const k = Math.min(1, Math.max(0.125, opts.textureScale ?? 1));
    const px = (n: number) => Math.max(32, Math.round((n * k) / 32) * 32);
    const floor = this.track(floorTileTextures(px(512)));
    const wall = this.track(wallPanelTextures(px(512)));
    const brushed = this.track(brushedMetalTextures(px(256)));
    const gun = this.track(gunmetalTextures(px(256)));
    const conc = this.track(concreteTextures(px(256)));

    this.floorTile = this.own(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: floor.map,
        normalMap: floor.normalMap,
        roughnessMap: floor.ormMap,
        metalnessMap: floor.ormMap,
        aoMap: floor.ormMap,
        aoMapIntensity: 0.8,
        roughness: 1,
        metalness: 1,
        envMapIntensity: 0.75,
      }),
    );
    const grate = this.track(floorGrateTextures(px(512)));
    const emblem = this.track(floorEmblemTextures(px(512)));
    const floorVariant = (set: PBRSet, emissive: boolean) =>
      this.own(
        new THREE.MeshStandardMaterial({
          map: set.map,
          normalMap: set.normalMap,
          roughnessMap: set.ormMap,
          metalnessMap: set.ormMap,
          aoMap: set.ormMap,
          aoMapIntensity: 0.8,
          roughness: 1,
          metalness: 1,
          envMapIntensity: 0.75,
          emissive: new THREE.Color(emissive ? 0xffffff : 0x000000),
          emissiveMap: set.emissiveMap ?? null,
          emissiveIntensity: emissive ? 2.2 : 0,
        }),
      );
    this.floorGrate = floorVariant(grate, true);
    this.floorEmblem = floorVariant(emblem, false);
    this.floorPlate = floorVariant(this.track(floorPlateTextures(px(512))), false);
    this.floorPlain = this.own(
      new THREE.MeshStandardMaterial({ color: 0x4b525b, normalMap: gun.normalMap, roughnessMap: gun.ormMap, roughness: 1, metalness: 0.6 }),
    );
    this.wallPanel = this.own(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wall.map,
        normalMap: wall.normalMap,
        roughnessMap: wall.ormMap,
        metalnessMap: wall.ormMap,
        aoMap: wall.ormMap,
        roughness: 1,
        metalness: 1,
        envMapIntensity: 0.8,
      }),
    );
    // world UVs run -0.5..0.5 across a 2 m face and -1..1 up a 4 m wall: one module per face, no mid-face seam
    for (const t of [wall.map, wall.normalMap, wall.ormMap]) {
      t.repeat.set(1, 0.5);
      t.offset.set(0.5, 0.5);
    }
    this.ivory = this.own(
      new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.42, metalness: 0.18, envMapIntensity: 0.8 }),
    );
    this.gunmetal = this.own(
      new THREE.MeshStandardMaterial({
        color: 0x9ba4b0,
        map: gun.map,
        normalMap: gun.normalMap,
        roughnessMap: gun.ormMap,
        metalnessMap: gun.ormMap,
        roughness: 1,
        metalness: 1,
        envMapIntensity: 1.1,
      }),
    );
    this.gunmetalDark = this.own(
      new THREE.MeshStandardMaterial({ color: PALETTE.gunmetalDeep, roughness: 0.55, metalness: 0.7, normalMap: gun.normalMap }),
    );
    this.brass = this.own(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: brushed.map,
        normalMap: brushed.normalMap,
        roughnessMap: brushed.ormMap,
        metalnessMap: brushed.ormMap,
        roughness: 1,
        metalness: 1,
        envMapIntensity: 1.15,
      }),
    );
    this.brassPolished = this.own(
      new THREE.MeshPhysicalMaterial({ color: 0xd2933f, roughness: 0.24, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.4 }),
    );
    this.concrete = this.own(
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: conc.map, normalMap: conc.normalMap, roughnessMap: conc.ormMap, roughness: 1, metalness: 0 }),
    );
    this.glass = this.own(
      new THREE.MeshPhysicalMaterial({
        color: 0xbfe8ff,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.28,
        clearcoat: 1,
        envMapIntensity: 1.6,
        depthWrite: false,
      }),
    );
    this.rubber = this.own(new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.85, metalness: 0 }));
    this.backdropStone = this.own(
      new THREE.MeshStandardMaterial({ color: 0x2a3644, map: conc.map, roughness: 0.8, metalness: 0.2, fog: true }),
    );
    this.glow = this.own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const bannerMap = bannerTexture();
    this.extraTextures.push(bannerMap);
    this.banner = this.own(
      new THREE.MeshStandardMaterial({ map: bannerMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.6 }),
    );
    // round 5: chamber material variants. Wear hooks are installed once; applyMood only writes colours/uniforms.
    for (const m of [this.floorTile, this.floorGrate, this.floorEmblem, this.floorPlate, this.floorPlain]) applyWear(m, 'floor', this.wear);
    for (const m of [this.wallPanel, this.ivory, this.gunmetal, this.gunmetalDark]) applyWear(m, 'wall', this.wear);
    for (const m of [this.brass, this.brassPolished]) applyWear(m, 'metal', this.wear);
    for (const m of [this.floorTile, this.floorGrate, this.floorEmblem, this.floorPlate, this.floorPlain, this.wallPanel, this.ivory, this.gunmetal, this.brass, this.brassPolished]) {
      this.baseColors.set(m, m.color.clone());
      this.baseRough.set(m, m.roughness);
    }
    this.sprite = radialSprite(128, 0.18);
    this.spriteHard = radialSprite(64, 0.55);
  }

  /**
   * Per-chamber material variant (round 5, `ChamberMood.material`): tints brass / gunmetal / panels / floors, sets the
   * brass polish, and drives the shared wear masks (patina, grime, chrome). Only uniform values change, so no shader
   * recompiles and no extra draw calls. `wear: false` (low / mobile presets) keeps the tints but skips the noise.
   * The library is shared by every level, so the renderer calls this on every level load.
   */
  applyMood(m: MaterialMood, opts: { wear?: boolean } = {}): void {
    const tint = (mat: THREE.MeshStandardMaterial, hex: number) => mat.color.copy(this.baseColors.get(mat)!).multiply(new THREE.Color(hex));
    for (const f of [this.floorTile, this.floorGrate, this.floorEmblem, this.floorPlate, this.floorPlain]) tint(f, m.floorTint);
    tint(this.wallPanel, m.panelTint);
    tint(this.ivory, m.panelTint);
    this.gunmetal.color.set(m.gunmetalTint);
    tint(this.brass, m.brassTint);
    tint(this.brassPolished, m.brassTint);
    this.brass.roughness = this.baseRough.get(this.brass)! * m.brassRough;
    this.brassPolished.roughness = Math.min(1, this.baseRough.get(this.brassPolished)! * m.brassRough);
    const w = this.wear;
    w.uPatina.value = m.patina;
    w.uPatinaColor.value.set(m.patinaColor);
    w.uGrime.value = m.grime;
    w.uChrome.value = m.chrome;
    // chrome is a colour/roughness shift, not a noise mask: it stays on without wear detail
    w.uWearOn.value = (opts.wear ?? true) && m.patina + m.grime + m.chrome > 0 ? 1 : 0;
    if (!w.uWearOn.value && m.chrome > 0) {
      // cheap path: approximate the chrome shift with the base colour only
      this.brass.color.lerp(new THREE.Color(0xd8dde4), m.chrome * 0.6);
      this.brassPolished.color.lerp(new THREE.Color(0xd8dde4), m.chrome * 0.6);
    }
  }

  private track(set: PBRSet): PBRSet {
    this.sets.push(set);
    return set;
  }

  private own<T extends THREE.Material>(m: T): T {
    this.owned.push(m);
    return m;
  }

  /**
   * Shared emissive material. `intensity` > ~1.2 crosses the bloom threshold, so keep "readable but calm"
   * elements below that and reserve bloom for focal light (portals, beams, active cores).
   */
  emissive(color: number, intensity = 2, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${intensity}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}`;
    let m = this.emissives.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: new THREE.Color(color),
        emissiveIntensity: intensity,
        roughness: 0.4,
        metalness: 0,
        transparent: opts.transparent ?? false,
        opacity: opts.opacity ?? 1,
        depthWrite: !(opts.transparent ?? false),
      });
      this.emissives.set(key, m);
    }
    return m;
  }

  /** Linear instance colour for `glow`: palette colour times intensity (same response as `emissive()`). */
  glowColor(color: number, intensity = 2): THREE.Color {
    return new THREE.Color(color).multiplyScalar(intensity);
  }

  /** A private (animatable) emissive material; caller owns and disposes it. */
  emissiveUnique(color: number, intensity = 2): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4, metalness: 0 });
  }

  dispose(): void {
    for (const s of this.sets) {
      s.map.dispose();
      s.normalMap.dispose();
      s.ormMap.dispose();
      s.emissiveMap?.dispose();
    }
    for (const t of this.extraTextures) t.dispose();
    for (const m of this.owned) m.dispose();
    for (const m of this.emissives.values()) m.dispose();
    this.sprite.dispose();
    this.spriteHard.dispose();
  }
}

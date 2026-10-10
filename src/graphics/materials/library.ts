import * as THREE from 'three';
import { PALETTE } from './palette';
import {
  brushedMetalTextures,
  concreteTextures,
  floorEmblemTextures,
  floorGrateTextures,
  floorTileTextures,
  gunmetalTextures,
  radialSprite,
  wallPanelTextures,
  type PBRSet,
} from './textures';

/**
 * MaterialLibrary — the shared PBR material set for one renderer. Everything here is created once and reused
 * by every module (environment kit, entities, characters, backdrop) so draw calls batch well and level
 * changes do not leak GPU memory. Call dispose() only when the renderer itself is destroyed.
 */
export class MaterialLibrary {
  readonly floorTile: THREE.MeshStandardMaterial;
  readonly floorGrate: THREE.MeshStandardMaterial;
  readonly floorEmblem: THREE.MeshStandardMaterial;
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
  readonly sprite: THREE.Texture;
  readonly spriteHard: THREE.Texture;

  private readonly sets: PBRSet[] = [];
  private readonly emissives = new Map<string, THREE.MeshStandardMaterial>();
  private readonly owned: THREE.Material[] = [];

  constructor() {
    const floor = this.track(floorTileTextures(512));
    const wall = this.track(wallPanelTextures(512));
    const brushed = this.track(brushedMetalTextures(256));
    const gun = this.track(gunmetalTextures(256));
    const conc = this.track(concreteTextures(256));

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
    const grate = this.track(floorGrateTextures(512));
    const emblem = this.track(floorEmblemTextures(512));
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
    this.ivory = this.own(
      new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.42, metalness: 0.18, envMapIntensity: 0.8 }),
    );
    this.gunmetal = this.own(
      new THREE.MeshStandardMaterial({
        color: 0x8a919b,
        map: gun.map,
        normalMap: gun.normalMap,
        roughnessMap: gun.ormMap,
        metalnessMap: gun.ormMap,
        roughness: 1,
        metalness: 1,
        envMapIntensity: 1,
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
        envMapIntensity: 1.25,
      }),
    );
    this.brassPolished = this.own(
      new THREE.MeshPhysicalMaterial({ color: PALETTE.brass, roughness: 0.22, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.4 }),
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
    this.sprite = radialSprite(128, 0.18);
    this.spriteHard = radialSprite(64, 0.55);
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
    for (const m of this.owned) m.dispose();
    for (const m of this.emissives.values()) m.dispose();
    this.sprite.dispose();
    this.spriteHard.dispose();
  }
}

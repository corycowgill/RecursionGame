import * as THREE from 'three';

/**
 * Renderer quality presets. `mobile` is tuned for phones/tablets (iPhone Safari, Add to Home Screen): a capped
 * pixel ratio, no shadow map (baked blob contact shadows instead), half-res bloom, FXAA, fewer particles and
 * backdrop layers, half-resolution procedural textures and the reduced-detail character mesh.
 * Presentation only: nothing here is ever read by the simulation.
 */
export type QualityLevel = 'low' | 'mobile' | 'medium' | 'high';

export interface QualitySettings {
  /** Max device pixel ratio used for the canvas (the dynamic-resolution guard scales below this). */
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowType: THREE.ShadowMapType;
  /** Cheap blob contact shadows under actors and carriables (used where the shadow map is off). */
  contactShadows: boolean;
  bloom: boolean;
  bloomStrength: number;
  bloomResolutionScale: number;
  antialias: 'smaa' | 'fxaa' | 'none';
  /** Particle budget multiplier. */
  particles: number;
  /** Max dynamic point lights (kit sconces + entity lights). */
  pointLights: number;
  /** Ambient mote counts. */
  motes: number;
  shafts: boolean;
  trails: boolean;
  /** Backdrop detail: 'reduced' drops the second cloud layer, two haze curtains, bridges, flyers and half the towers. */
  backdrop: 'full' | 'reduced';
  /** Character mesh level of detail (0 = full, 1 = ~half the triangles, no clearcoat). */
  characterLod: 0 | 1;
  /**
   * Procedural texture resolution multiplier. Fixed when the renderer is created (textures are generated once per
   * renderer), so it applies to the initial / auto-selected preset only.
   */
  textureScale: number;
  /** PMREM environment cube face size (256 = 768x1024 half-float atlas, ~6 MB; 128 = ~1.5 MB). */
  envMapSize: number;
  /** Lowest render scale (fraction of `pixelRatio`) the dynamic-resolution guard may step down to. */
  minRenderScale: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    pixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    shadowType: THREE.PCFShadowMap,
    contactShadows: false,
    bloom: false,
    bloomStrength: 0,
    bloomResolutionScale: 0.5,
    antialias: 'fxaa',
    particles: 0.35,
    pointLights: 2,
    motes: 120,
    shafts: false,
    trails: false,
    backdrop: 'full',
    characterLod: 0,
    textureScale: 1,
    envMapSize: 256,
    minRenderScale: 0.6,
  },
  mobile: {
    pixelRatio: 1.5,
    shadows: false,
    shadowMapSize: 512,
    shadowType: THREE.PCFShadowMap,
    contactShadows: true,
    bloom: true,
    bloomStrength: 0.4,
    // half-res bloom input (UnrealBloomPass halves it again internally before its 5-level mip blur)
    bloomResolutionScale: 0.5,
    antialias: 'fxaa',
    particles: 0.3,
    pointLights: 2,
    motes: 80,
    shafts: false,
    trails: false,
    backdrop: 'reduced',
    characterLod: 1,
    textureScale: 0.5,
    envMapSize: 128,
    minRenderScale: 0.5,
  },
  medium: {
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowType: THREE.PCFShadowMap,
    contactShadows: false,
    bloom: true,
    bloomStrength: 0.42,
    bloomResolutionScale: 0.5,
    antialias: 'fxaa',
    particles: 0.7,
    pointLights: 5,
    motes: 400,
    shafts: true,
    trails: true,
    backdrop: 'full',
    characterLod: 0,
    textureScale: 1,
    envMapSize: 256,
    minRenderScale: 0.6,
  },
  high: {
    pixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowType: THREE.PCFShadowMap,
    contactShadows: false,
    bloom: true,
    bloomStrength: 0.48,
    bloomResolutionScale: 0.5,
    antialias: 'smaa',
    particles: 1,
    pointLights: 8,
    motes: 900,
    shafts: true,
    trails: true,
    backdrop: 'full',
    characterLod: 0,
    textureScale: 1,
    envMapSize: 256,
    minRenderScale: 0.6,
  },
};

import * as THREE from 'three';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  /** Max device pixel ratio used for the canvas. */
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowType: THREE.ShadowMapType;
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
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    pixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    shadowType: THREE.PCFShadowMap,
    bloom: false,
    bloomStrength: 0,
    bloomResolutionScale: 0.5,
    antialias: 'fxaa',
    particles: 0.35,
    pointLights: 2,
    motes: 120,
    shafts: false,
    trails: false,
  },
  medium: {
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowType: THREE.PCFShadowMap,
    bloom: true,
    bloomStrength: 0.42,
    bloomResolutionScale: 0.5,
    antialias: 'fxaa',
    particles: 0.7,
    pointLights: 5,
    motes: 400,
    shafts: true,
    trails: true,
  },
  high: {
    pixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowType: THREE.PCFShadowMap,
    bloom: true,
    bloomStrength: 0.48,
    bloomResolutionScale: 0.5,
    antialias: 'smaa',
    particles: 1,
    pointLights: 8,
    motes: 900,
    shafts: true,
    trails: true,
  },
};

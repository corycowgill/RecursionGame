import * as THREE from 'three';

/**
 * WEAR MASKS (round 5): per-chamber patina / grime / chrome on the shared kit materials, with no new textures,
 * draw calls or per-level programs.
 *
 * One `onBeforeCompile` hook per material kind injects a few lines into the stock MeshStandardMaterial shader:
 *  - a world-space mask from cheap value noise (2 octaves) plus vertical drip streaks on walls and scuffs on floors,
 *    so batched / instanced modules never repeat the same blotch;
 *  - `uPatina` (metal kinds only): verdigris tint in the mask, less metallic and rougher (old wings);
 *  - `uGrime`: darker, rougher blotches and drips (machine hall);
 *  - `uChrome` (metal kinds only): desaturates brass toward white gold / chrome and smooths it (the core).
 * The uniforms are shared objects owned by the MaterialLibrary, so a level change is a few uniform writes. Every
 * mood value 0 is an exact no-op (the stock shading), and the `uWearOn` uniform skips the noise entirely.
 * Programs are keyed by kind (`customProgramCacheKey`), so they are compiled once per renderer, not per level.
 */
export type WearKind = 'metal' | 'wall' | 'floor';

export interface WearUniforms {
  [k: string]: THREE.IUniform;
  uWearOn: { value: number };
  uPatina: { value: number };
  uPatinaColor: { value: THREE.Color };
  uGrime: { value: number };
  uChrome: { value: number };
}

export function createWearUniforms(): WearUniforms {
  return {
    uWearOn: { value: 0 },
    uPatina: { value: 0 },
    uPatinaColor: { value: new THREE.Color(0x6f9a8c) },
    uGrime: { value: 0 },
    uChrome: { value: 0 },
  };
}

const KIND_ID: Record<WearKind, number> = { metal: 0, wall: 1, floor: 2 };

const VERT_HEAD = /* glsl */ `
varying vec3 vWearPos;
varying vec3 vWearN;
`;

const VERT_BODY = /* glsl */ `
{
  vec4 wearP = vec4(transformed, 1.0);
  vec3 wearN = objectNormal;
  #ifdef USE_BATCHING
    wearP = batchingMatrix * wearP;
    wearN = mat3(batchingMatrix) * wearN;
  #endif
  #ifdef USE_INSTANCING
    wearP = instanceMatrix * wearP;
    wearN = mat3(instanceMatrix) * wearN;
  #endif
  vWearPos = (modelMatrix * wearP).xyz;
  vWearN = normalize(mat3(modelMatrix) * wearN);
}
`;

const FRAG_HEAD = (kind: WearKind) => /* glsl */ `
#define WEAR_KIND ${KIND_ID[kind]}
uniform float uWearOn;
uniform float uPatina;
uniform vec3 uPatinaColor;
uniform float uGrime;
uniform float uChrome;
varying vec3 vWearPos;
varying vec3 vWearN;
float wearHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wearNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wearHash(i), wearHash(i + vec3(1, 0, 0)), f.x), mix(wearHash(i + vec3(0, 1, 0)), wearHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wearHash(i + vec3(0, 0, 1)), wearHash(i + vec3(1, 0, 1)), f.x), mix(wearHash(i + vec3(0, 1, 1)), wearHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wearMask = 0.0;
float wearDrip = 0.0;
`;

/** Computes the masks and tints diffuseColor (after map_fragment). */
const FRAG_ALBEDO = /* glsl */ `
if (uWearOn > 0.5) {
  vec3 wp = vWearPos;
  float n = wearNoise(wp * 0.55) * 0.65 + wearNoise(wp * 1.9 + 7.3) * 0.35;
  wearMask = smoothstep(0.48, 0.76, n);
  float up = abs(vWearN.y);
  // vertical drips on walls: noise stretched along y, strongest under ledges (high on the wall) fading downward
  float streak = wearNoise(vec3(wp.x * 4.1 + wp.z * 4.1, wp.y * 0.35, 3.1));
  wearDrip = smoothstep(0.6, 0.85, streak) * (1.0 - up);
  #if WEAR_KIND == 2
    // floors: scuffs along walking lanes, large soft blotches
    wearMask = max(wearMask * 0.8, smoothstep(0.6, 0.9, wearNoise(vec3(wp.x * 0.35, 0.0, wp.z * 0.35))) * 0.55);
    wearDrip = 0.0;
  #endif
  float grime = clamp(wearMask * 0.75 + wearDrip * 0.6, 0.0, 1.0) * uGrime;
  diffuseColor.rgb *= 1.0 - grime * 0.42;
  #if WEAR_KIND == 0
    float lumW = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    // chrome / white gold: desaturate toward a cool bright grey
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumW) * vec3(1.02, 1.04, 1.08) * 1.3, uChrome * 0.85);
    // verdigris in the mask (and a hint in drips)
    float pat = clamp(wearMask + wearDrip * 0.5, 0.0, 1.0) * uPatina;
    diffuseColor.rgb = mix(diffuseColor.rgb, uPatinaColor * (0.55 + lumW * 0.6), pat * 0.85);
  #endif
}
`;

const FRAG_ROUGH = /* glsl */ `
if (uWearOn > 0.5) {
  roughnessFactor = clamp(roughnessFactor + (wearMask * 0.75 + wearDrip * 0.5) * uGrime * 0.35, 0.04, 1.0);
  #if WEAR_KIND == 0
    roughnessFactor = clamp(roughnessFactor + clamp(wearMask + wearDrip * 0.5, 0.0, 1.0) * uPatina * 0.45 - uChrome * 0.18, 0.04, 1.0);
  #endif
}
`;

const FRAG_METAL = /* glsl */ `
#if WEAR_KIND == 0
if (uWearOn > 0.5) metalnessFactor *= 1.0 - clamp(wearMask + wearDrip * 0.5, 0.0, 1.0) * uPatina * 0.8;
#endif
`;

/** Installs the wear hook on a stock MeshStandard / MeshPhysical material (idempotent per material). */
export function applyWear(mat: THREE.MeshStandardMaterial, kind: WearKind, uniforms: WearUniforms): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD(kind)}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_ALBEDO}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${FRAG_METAL}`);
  };
  const base = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${base()}|wear-${kind}`;
  mat.needsUpdate = true;
}

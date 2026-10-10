import * as THREE from 'three';

/**
 * Holographic echo material.
 *
 *  - per-echo tint (uTint), fresnel rim, fine horizontal scanlines, an upward "data sweep" band;
 *  - tone from the character's vertex paint (color + paint attributes, see characterModel.ts): dark undersuit
 *    reads as a faint fill, white armour as a brighter fill, gold accents / emissive seams as near-white lines, so
 *    the echo keeps the suit's panel layout and silhouette instead of becoming a uniform blob;
 *  - flicker: brief, per-echo (uSeed) intensity dips;
 *  - subtle vertical dissolve: a dithered band of dropped fragments drifting up the body, plus a noisy
 *    manifest-in edge from the feet up driven by uFade (0..1);
 *  - uGlitch (0..1) shifts toward coral and jitters bands (divergence).
 *
 * It renders in the opaque queue with depth writes (premultiplied glow: adds its colour and slightly veils what is
 * behind it), so a body part only shows its nearest
 * surface: overlapping limbs no longer stack into a bright mess and the outline stays crisp. Geometry without
 * the paint attributes falls back to a uniform mid tone (WebGL default attribute values).
 */
export interface HologramUniforms {
  [key: string]: THREE.IUniform;
  uTint: { value: THREE.Color };
  uTime: { value: number };
  uFill: { value: number };
  uRim: { value: number };
  uFade: { value: number };
  uGlitch: { value: number };
  uBaseY: { value: number };
  uSeed: { value: number };
}

const vert = /* glsl */ `
  attribute vec3 color;
  attribute vec4 paint;
  uniform float uTime;
  uniform float uGlitch;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  varying float vTone;
  varying float vAccent;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float band = step(0.93, fract(sin(floor(wp.y * 14.0) * 91.7 + floor(uTime * 18.0)) * 4375.85));
    wp.x += band * uGlitch * 0.06;
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    vTone = sqrt(clamp(lum, 0.0, 1.0));
    vAccent = clamp(max(paint.z * 0.45, paint.y * 0.9 * step(0.2, lum)), 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const frag = /* glsl */ `
  uniform vec3 uTint;
  uniform float uTime;
  uniform float uFill;
  uniform float uRim;
  uniform float uFade;
  uniform float uGlitch;
  uniform float uBaseY;
  uniform float uSeed;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  varying float vTone;
  varying float vAccent;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 n = normalize(vN);
    float ndv = abs(dot(n, normalize(vV)));
    float fres = pow(1.0 - ndv, 2.4);
    float h = vW.y - uBaseY;
    vec2 cell = floor(vec2(vW.x + vW.z, vW.y) * 260.0);
    float noise = hash(cell);
    // manifest-in: noisy dissolve from the feet up
    float edge = uFade * 2.4 - h * 0.6 - noise * 0.12;
    if (edge < 0.0) discard;
    // subtle vertical dissolve band drifting upward (dithered, never more than ~35% of fragments)
    float bandY = fract(uTime * 0.11 + uSeed * 0.37) * 2.8 - 0.3;
    float dband = exp(-pow((h - bandY) / 0.07, 2.0));
    if (noise < dband * 0.2) discard;
    float edgeGlow = 1.0 - smoothstep(0.0, 0.16, edge);
    // flicker: rare short dips, phase-shifted per echo
    float ft = uTime * 7.0 + uSeed * 13.0;
    float flick = 1.0 - 0.35 * step(0.92, hash(vec2(floor(ft), uSeed))) - 0.05 * sin(uTime * 41.0 + uSeed);
    float scan = 0.78 + 0.22 * sin(h * 170.0 - uTime * 6.0);
    float sweep = smoothstep(0.0, 0.08, 0.08 - abs(fract(h * 0.45 - uTime * 0.35 + uSeed * 0.21) - 0.5));
    vec3 tint = mix(uTint, vec3(1.0, 0.36, 0.3), uGlitch * 0.8);
    float fill = uFill * (0.35 + 1.25 * vTone) * scan;
    float rim = fres * uRim * (0.75 + 0.5 * vTone);
    float a = fill + rim + sweep * 0.3 + dband * 0.12;
    vec3 accentCol = mix(tint, vec3(1.0), 0.22);
    vec3 col = tint * a + accentCol * vAccent * (0.45 + 0.35 * scan) + tint * edgeGlow * 2.5 + accentCol * fres * fres * 0.25;
    col *= flick;
    // premultiplied: add the glow and dim what is behind by 'veil' so the tint stays saturated on bright floors
    float veil = clamp(0.34 + 0.2 * vTone + fres * 0.25, 0.0, 0.7) * min(1.0, uFade * 2.0);
    gl_FragColor = vec4(col, veil);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createHologramMaterial(
  tint: number,
  opts: { fill?: number; rim?: number; seed?: number } = {},
): THREE.ShaderMaterial & { uniforms: HologramUniforms } {
  const uniforms: HologramUniforms = {
    uTint: { value: new THREE.Color(tint) },
    uTime: { value: 0 },
    uFill: { value: opts.fill ?? 0.16 },
    uRim: { value: opts.rim ?? 1.25 },
    uFade: { value: 1 },
    uGlitch: { value: 0 },
    uBaseY: { value: 0 },
    uSeed: { value: opts.seed ?? 0 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    // opaque queue + depth write: only the nearest surface of the body shows (premultiplied glow, still see-through)
    transparent: false,
    depthWrite: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.FrontSide,
  });
  return m as THREE.ShaderMaterial & { uniforms: HologramUniforms };
}

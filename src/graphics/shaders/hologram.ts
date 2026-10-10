import * as THREE from 'three';

/**
 * Holographic echo material: fresnel rim, horizontal scanlines sweeping upward, faint body fill, a moving
 * "data band" and per-echo tint. `glitch` (0..1) shifts toward coral and jitters bands (divergence);
 * `fade` (0..1) drives the manifest-in effect (dissolve from the feet up).
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
}

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uGlitch;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float band = step(0.93, fract(sin(floor(wp.y * 14.0) * 91.7 + floor(uTime * 18.0)) * 4375.85));
    wp.x += band * uGlitch * 0.06;
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
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
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    float ndv = abs(dot(n, normalize(vV)));
    float fres = pow(1.0 - ndv, 2.2);
    float h = vW.y - uBaseY;
    float scan = 0.55 + 0.45 * sin(h * 160.0 - uTime * 6.0);
    float sweep = smoothstep(0.0, 0.08, 0.08 - abs(fract(h * 0.45 - uTime * 0.35) - 0.5) + 0.0);
    float top = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    // dissolve from the feet up while manifesting
    float edge = uFade * 2.2 - h * 0.6;
    if (edge < 0.0) discard;
    float edgeGlow = 1.0 - smoothstep(0.0, 0.18, edge);
    vec3 tint = mix(uTint, vec3(1.0, 0.36, 0.3), uGlitch * 0.8);
    float a = uFill * (0.6 + 0.4 * scan) + fres * uRim + sweep * 0.35 + top * 0.05;
    vec3 col = tint * a * 0.95 + tint * edgeGlow * 2.5 + mix(tint, vec3(1.0), 0.5) * fres * fres * 0.25;
    gl_FragColor = vec4(col, clamp(a + edgeGlow, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createHologramMaterial(tint: number, opts: { fill?: number; rim?: number } = {}): THREE.ShaderMaterial & { uniforms: HologramUniforms } {
  const uniforms: HologramUniforms = {
    uTint: { value: new THREE.Color(tint) },
    uTime: { value: 0 },
    uFill: { value: opts.fill ?? 0.16 },
    uRim: { value: opts.rim ?? 1.25 },
    uFade: { value: 1 },
    uGlitch: { value: 0 },
    uBaseY: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  return m as THREE.ShaderMaterial & { uniforms: HologramUniforms };
}

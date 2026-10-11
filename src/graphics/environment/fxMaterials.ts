import * as THREE from 'three';

/**
 * Instancing-aware effect materials for the environment (kit decor + backdrop). Each one is meant to be drawn
 * as a single InstancedMesh, with per-instance colour (`setColorAt`) carrying the tint, so every light shaft,
 * abyss beam, haze curtain or window pane in a level costs one draw call per material.
 */

const NOISE = /* glsl */ `
  float eHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float eNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(eHash(i), eHash(i + vec2(1.0, 0.0)), u.x), mix(eHash(i + vec2(0.0, 1.0)), eHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float eFbm(vec2 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { s += eNoise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
`;

const OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/** Vertex shader shared by the instanced effects: world position, normal, view vector, uv, instance colour. */
const INSTANCED_VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying vec3 vL;
  void main() {
    vUv = uv;
    vL = position;
    vec4 lp = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      lp = instanceMatrix * lp;
      n = mat3(instanceMatrix) * n;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    vec4 wp = modelMatrix * lp;
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    vV = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const HEAD = /* glsl */ `varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying vec3 vL;`;

function additive(uniforms: Record<string, THREE.IUniform>, frag: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: INSTANCED_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Volumetric-looking light shaft on an open cone (uv.y = 0 at the far end, 1 at the source). Tint per instance.
 * `fadeEnds` softens both ends; dust drifts slowly with uTime.
 */
export function shaftMaterial(strength = 0.14): THREE.ShaderMaterial {
  return additive(
    { uTime: { value: 0 }, uStrength: { value: strength } },
    /* glsl */ `
    uniform float uTime; uniform float uStrength;
    ${HEAD}
    ${NOISE}
    void main() {
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
      float vert = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
      float dust = 0.65 + 0.35 * eFbm(vec2(vUv.x * 10.0, vUv.y * 3.0 - uTime * 0.05));
      float a = facing * vert * dust * uStrength;
      gl_FragColor = vec4(vTint * a, a);
      ${OUT}
    }`,
  );
}

/**
 * Abyss beam: a column of light rising from the depths (uv.y 0 = bottom, 1 = top). Brightest low down, fading
 * toward the platform, with slow upward-drifting motes. Tint per instance.
 */
export function abyssBeamMaterial(): THREE.ShaderMaterial {
  return additive(
    { uTime: { value: 0 } },
    /* glsl */ `
    uniform float uTime;
    ${HEAD}
    ${NOISE}
    void main() {
      float facing = 0.35 + 0.65 * pow(abs(dot(normalize(vN), normalize(vV))), 0.8);
      float vert = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
      float flow = 0.55 + 0.45 * eFbm(vec2(vUv.x * 8.0, vUv.y * 6.0 - uTime * 0.35));
      float a = facing * vert * flow * 0.8;
      gl_FragColor = vec4(vTint * a, a);
      ${OUT}
    }`,
  );
}

/**
 * Depth haze curtain on an open cylinder band (uv.y up): fog-coloured, densest at the bottom, thinning upward,
 * with slow noise so layers do not read as flat walls. Normal blending; tint per instance (fog colour).
 */
export function hazeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.55 } },
    vertexShader: INSTANCED_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOpacity;
      ${HEAD}
      ${NOISE}
      void main() {
        float h = vUv.y;
        float n = eFbm(vec2(vUv.x * 18.0 + uTime * 0.004, h * 2.5 - uTime * 0.003));
        float a = pow(1.0 - h, 1.8) * (0.55 + 0.45 * n) * uOpacity;
        a *= smoothstep(0.0, 0.04, h);
        gl_FragColor = vec4(vTint, a);
        ${OUT}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Wall observation window pane (arched ShapeGeometry, local y = 0..uH): a glowing view into the facility —
 * bright haze low, deep blue high, faint distant tower silhouettes and mullion bars. Tint per instance.
 */
export function windowPaneMaterial(height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uH: { value: height }, uTime: { value: 0 } },
    vertexShader: INSTANCED_VERT,
    fragmentShader: /* glsl */ `
      uniform float uH; uniform float uTime;
      ${HEAD}
      ${NOISE}
      void main() {
        float k = clamp(vL.y / uH, 0.0, 1.0);
        vec3 low = vec3(0.42, 0.78, 1.0) * 1.25;
        vec3 high = vec3(0.03, 0.12, 0.24);
        vec3 c = mix(low, high, pow(k, 0.65));
        // distant spires: noise skyline in local x
        float sky = 0.25 + 0.35 * eNoise(vec2(vL.x * 6.0 + vW.x * 0.37 + vW.z * 0.21, 1.0));
        float tower = step(k, sky) * (1.0 - step(0.98, fract(vL.x * 9.0 + 0.3)));
        c = mix(c, vec3(0.05, 0.12, 0.2), tower * 0.75);
        float bars = step(0.95, fract(vL.y * 2.4)) + step(0.96, fract(vL.x * 2.2 + 0.5));
        c *= 1.0 - clamp(bars, 0.0, 1.0) * 0.65;
        gl_FragColor = vec4(c * vTint, 1.0);
        ${OUT}
      }`,
  });
}

/** Holographic text panel: additive tinted texture with scanlines, a soft edge and gentle flicker. */
export function hologramMaterial(map: THREE.Texture, color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: INSTANCED_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uTime;
      ${HEAD}
      void main() {
        vec2 uv = vUv;
        uv.x += sin(uv.y * 40.0 + uTime * 6.0) * 0.0015;
        float t = texture2D(uMap, uv).r;
        float scan = 0.72 + 0.28 * sin(vUv.y * 180.0 - uTime * 4.0);
        float flicker = 0.9 + 0.1 * sin(uTime * 13.0) * sin(uTime * 3.7);
        float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        float a = (t * scan + 0.05) * flicker * edge;
        gl_FragColor = vec4(uColor * a * 2.4, a);
        ${OUT}
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

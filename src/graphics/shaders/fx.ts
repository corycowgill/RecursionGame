import * as THREE from 'three';

/**
 * Small additive effect shaders: portal swirl, laser beam, signal wire, expanding ring, light shaft,
 * ground ribbon trail, sky dome and the cloud sea. All are cheap single-pass materials meant to bloom.
 */

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
`;

const OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const UV_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

function additive(uniforms: Record<string, THREE.IUniform>, fragmentShader: string, vertexShader = UV_VERT, side: THREE.Side = THREE.DoubleSide): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side,
  });
}

/** Swirling vortex on a unit disc (CircleGeometry uv). */
export function createPortalMaterial(a: number, b: number): THREE.ShaderMaterial {
  return additive(
    {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(a) },
      uColorB: { value: new THREE.Color(b) },
      uPower: { value: 1 },
    },
    /* glsl */ `
    uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB; uniform float uPower;
    varying vec2 vUv;
    ${NOISE}
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float ang = atan(p.y, p.x);
      float sw = ang + r * 5.5 - uTime * 1.6;
      float arms = 0.5 + 0.5 * sin(sw * 3.0);
      float n = fbm(vec2(sw * 1.2, r * 4.0 - uTime * 0.8));
      float core = exp(-r * r * 14.0) * 0.55;
      float rim = smoothstep(0.72, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
      float body = (arms * 0.55 + n * 0.7) * (1.0 - r * 0.55);
      vec3 col = mix(uColorB, uColorA, clamp(arms * n * 1.6, 0.0, 1.0)) * body * 1.5;
      col += uColorA * rim * 2.2 + vec3(0.9, 0.97, 1.0) * core * 2.4;
      col *= uPower;
      float alpha = clamp(body + rim + core, 0.0, 1.0) * uPower * (1.0 - smoothstep(0.96, 1.0, r));
      gl_FragColor = vec4(col, alpha);
      ${OUT}
    }`,
  );
}

/** Laser beam on a CylinderGeometry (axis Y, height 1 scaled to beam length). Bright core, soft halo, flow. */
export function createBeamMaterial(color: number): THREE.ShaderMaterial {
  return additive(
    { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uLength: { value: 1 }, uPower: { value: 1 } },
    /* glsl */ `
    uniform float uTime; uniform vec3 uColor; uniform float uLength; uniform float uPower;
    varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
    void main() {
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float core = pow(facing, 6.0);
      float halo = pow(facing, 1.5);
      float flow = 0.75 + 0.25 * sin(vUv2.y * uLength * 6.0 - uTime * 30.0);
      vec3 col = uColor * halo * 1.4 * flow + vec3(1.0) * core * 2.2;
      gl_FragColor = vec4(col * uPower, halo * uPower);
      ${OUT}
    }`,
    /* glsl */ `
    varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
    void main() {
      vUv2 = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = cameraPosition - wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
    THREE.FrontSide,
  );
}

/** Signal wire strip on the floor: uv.x runs along length in metres (set via uLength), pulses flow to target. */
export function createWireMaterial(offColor: number, onColor: number): THREE.ShaderMaterial {
  return additive(
    {
      uTime: { value: 0 },
      uOff: { value: new THREE.Color(offColor) },
      uOn: { value: new THREE.Color(onColor) },
      uPower: { value: 0 },
      uLength: { value: 1 },
    },
    /* glsl */ `
    uniform float uTime; uniform vec3 uOff; uniform vec3 uOn; uniform float uPower; uniform float uLength;
    varying vec2 vUv;
    void main() {
      float along = vUv.x * uLength;
      float across = abs(vUv.y - 0.5) * 2.0;
      float line = 1.0 - smoothstep(0.25, 1.0, across);
      float dash = smoothstep(0.0, 0.15, fract(along * 0.9 - uTime * 1.8)) * (1.0 - smoothstep(0.35, 0.6, fract(along * 0.9 - uTime * 1.8)));
      vec3 col = mix(uOff * 0.35, uOn * (0.9 + dash * 2.2), uPower);
      gl_FragColor = vec4(col * line, line * (0.35 + 0.65 * uPower));
      ${OUT}
    }`,
  );
}

/** Expanding ring for VFX on a PlaneGeometry (uv centred). */
export function createRingMaterial(color: number): THREE.ShaderMaterial {
  return additive(
    { uColor: { value: new THREE.Color(color) }, uProgress: { value: 0 }, uWidth: { value: 0.08 }, uIntensity: { value: 2 } },
    /* glsl */ `
    uniform vec3 uColor; uniform float uProgress; uniform float uWidth; uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      float r = length(vUv * 2.0 - 1.0);
      float radius = 0.15 + uProgress * 0.82;
      float d = abs(r - radius);
      float ring = exp(-d * d / (uWidth * uWidth * 0.5));
      float inner = smoothstep(radius, 0.0, r) * 0.18;
      float fade = (1.0 - uProgress) * (1.0 - uProgress);
      vec3 col = uColor * (ring * uIntensity + inner) * fade;
      gl_FragColor = vec4(col, (ring + inner) * fade);
      ${OUT}
    }`,
  );
}

/** Volumetric-looking light shaft on an open cylinder/cone (uv.y up, uv.x around). */
export function createShaftMaterial(color: number, strength = 0.16): THREE.ShaderMaterial {
  return additive(
    { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: strength } },
    /* glsl */ `
    uniform vec3 uColor; uniform float uTime; uniform float uStrength;
    varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
    ${NOISE}
    void main() {
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
      float vert = smoothstep(0.0, 0.25, vUv2.y) * smoothstep(1.0, 0.55, vUv2.y);
      float dust = 0.7 + 0.3 * fbm(vec2(vUv2.x * 12.0, vUv2.y * 3.0 - uTime * 0.05));
      float a = facing * vert * dust * uStrength;
      gl_FragColor = vec4(uColor * a, a);
      ${OUT}
    }`,
    /* glsl */ `
    varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
    void main() {
      vUv2 = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = cameraPosition - wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  );
}

/** Ground ribbon trail: uv.x = age (0 new → 1 old), uv.y across. */
export function createTrailMaterial(color: number): THREE.ShaderMaterial {
  return additive(
    { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
    /* glsl */ `
    uniform vec3 uColor; uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
      float a = pow(1.0 - vUv.x, 1.6) * smoothstep(0.0, 0.6, across) * uOpacity;
      gl_FragColor = vec4(uColor * a * 1.2, a);
      ${OUT}
    }`,
  );
}

/** Sky dome: deep navy zenith, luminous teal haze at the horizon, a warm glow toward the sun azimuth. */
export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(0x050c18) },
      uHorizon: { value: new THREE.Color(0x2a5f80) },
      uBelow: { value: new THREE.Color(0x0b2236) },
      uWarm: { value: new THREE.Color(0xffa45a) },
      uWarmDir: { value: new THREE.Vector3(-0.6, 0.12, -0.8).normalize() },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uBelow; uniform vec3 uWarm; uniform vec3 uWarmDir; uniform float uTime;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float up = d.y;
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, up));
        col = mix(col, uBelow, smoothstep(0.0, -0.35, up));
        float haze = exp(-abs(up) * 7.0);
        col += uHorizon * haze * 0.35;
        float w = max(dot(d, uWarmDir), 0.0);
        col += uWarm * pow(w, 6.0) * 0.6 * (1.0 - smoothstep(0.1, 0.6, up));
        float clouds = fbm(vec2(atan(d.z, d.x) * 3.0 + uTime * 0.004, up * 9.0));
        col += vec3(0.25, 0.45, 0.6) * clouds * haze * 0.35;
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
}

/** Cloud sea far below the chamber: scrolling fbm mist, fading radially. */
export function createCloudMaterial(color: number, highlight: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uHi: { value: new THREE.Color(highlight) }, uOpacity: { value: 0.85 } },
    vertexShader: UV_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform vec3 uHi; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 p = vW.xz * 0.02;
        float n = fbm(p + vec2(uTime * 0.01, uTime * 0.006));
        float n2 = fbm(p * 2.3 - vec2(uTime * 0.013, 0.0));
        float m = smoothstep(0.35, 0.85, n * 0.7 + n2 * 0.5);
        float r = length(vUv * 2.0 - 1.0);
        float fade = 1.0 - smoothstep(0.55, 1.0, r);
        vec3 col = mix(uColor, uHi, m);
        gl_FragColor = vec4(col, (0.35 + m * 0.65) * fade * uOpacity);
        ${OUT}
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/** Arch light curtain (exit portal): uv derived from local position / size; upward energy flow + edge glow. */
export function createCurtainMaterial(color: number, width: number, height: number): THREE.ShaderMaterial {
  return additive(
    {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: new THREE.Vector2(width, height) },
      uPower: { value: 1 },
    },
    /* glsl */ `
    uniform float uTime; uniform vec3 uColor; uniform vec2 uSize; uniform float uPower;
    varying vec3 vL;
    ${NOISE}
    void main() {
      vec2 uv = vec2(vL.x / uSize.x + 0.5, vL.y / uSize.y);
      float edgeX = 1.0 - abs(uv.x - 0.5) * 2.0;
      float flow = fbm(vec2(uv.x * 5.0, uv.y * 3.0 - uTime * 0.9));
      float streaks = pow(0.5 + 0.5 * sin(uv.x * 40.0 + flow * 6.0), 6.0);
      float base = smoothstep(0.0, 0.25, uv.y) * 0.4 + 0.6;
      float edge = pow(1.0 - edgeX, 3.0);
      float a = (0.25 + flow * 0.55 + streaks * 0.3) * base + edge * 0.8;
      float floorGlow = exp(-uv.y * 6.0) * 0.9;
      vec3 col = uColor * a * 1.1 + mix(uColor, vec3(1.0), 0.35) * (floorGlow + streaks * 0.2) * 0.6;
      gl_FragColor = vec4(col * uPower, clamp(a + floorGlow, 0.0, 1.0) * uPower);
      ${OUT}
    }`,
    /* glsl */ `
    varying vec3 vL;
    void main() {
      vL = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  );
}

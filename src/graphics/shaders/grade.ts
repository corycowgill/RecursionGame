import * as THREE from 'three';

/**
 * Final display-space grade (runs after OutputPass, i.e. after ACES + sRGB):
 *  - lift/gamma/gain style contrast, saturation, warm-highlight / cool-shadow split toning
 *  - vignette
 *  - temporal effects: rewind (radial chromatic smear, cyan tint, scanlines, barrel warp),
 *    glitch (coral block displacement, divergence), flash (level complete / echo manifest)
 *  - very light film grain to break up banding in the fog gradients
 */
export const GradeShader = {
  name: 'RecursionGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.5 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.1 },
    uWarm: { value: new THREE.Color(1.0, 0.86, 0.68) },
    uCool: { value: new THREE.Color(0.62, 0.82, 1.0) },
    uSplit: { value: 0.18 },
    uRewind: { value: 0 },
    uGlitch: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1.0, 0.85, 0.55) },
    uGrain: { value: 0.025 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime; uniform vec2 uResolution;
    uniform float uVignette; uniform float uSaturation; uniform float uContrast;
    uniform vec3 uWarm; uniform vec3 uCool; uniform float uSplit;
    uniform float uRewind; uniform float uGlitch; uniform float uFlash; uniform vec3 uFlashColor; uniform float uGrain;
    varying vec2 vUv;
    float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      // rewind: barrel warp + swirl
      float rw = uRewind;
      float r2 = dot(c, c);
      uv = 0.5 + c * (1.0 - rw * 0.08 * (1.0 - r2 * 2.0));
      float ang = rw * 0.25 * (1.0 - smoothstep(0.0, 0.5, sqrt(r2)));
      uv = 0.5 + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (uv - 0.5);
      // glitch: horizontal block displacement
      if (uGlitch > 0.001) {
        float row = floor(uv.y * 38.0);
        float n = h1(vec2(row, floor(uTime * 24.0)));
        uv.x += (n > 0.86 ? (n - 0.93) * 0.18 : 0.0) * uGlitch;
      }
      vec2 dir = (uv - 0.5);
      float ca = 0.0025 + rw * 0.018 + uGlitch * 0.01;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;
      // radial smear for rewind
      if (rw > 0.001) {
        vec3 acc = vec3(0.0);
        for (int i = 1; i <= 6; i++) {
          float k = float(i) / 6.0;
          acc += texture2D(tDiffuse, uv - dir * k * 0.05 * rw).rgb;
        }
        col = mix(col, acc / 6.0, rw * 0.7);
        float scan = 0.5 + 0.5 * sin(uv.y * uResolution.y * 1.2 + uTime * 40.0);
        col = mix(col, col * vec3(0.55, 0.95, 1.25) + vec3(0.0, 0.05, 0.09), rw * 0.75);
        col *= 1.0 - rw * 0.18 * scan;
      }
      if (uGlitch > 0.001) col = mix(col, col * vec3(1.35, 0.6, 0.55), uGlitch * 0.35);
      // contrast + saturation
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      // split toning: cool shadows, warm highlights
      vec3 tone = mix(uCool, uWarm, smoothstep(0.15, 0.75, l));
      col = mix(col, col * tone * 1.12, uSplit);
      // vignette
      float v = smoothstep(0.85, 0.2, length(c * vec2(1.0, 0.85)) * 1.25);
      col *= mix(1.0 - uVignette, 1.0, v);
      // flash
      col += uFlashColor * uFlash * (0.6 + 0.4 * (1.0 - sqrt(r2) * 1.4));
      col += (h1(vUv * uResolution + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

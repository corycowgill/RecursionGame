import * as THREE from 'three';

/**
 * Pooled CPU particle system rendered as one additive Points draw call. Used for sparks, bursts, motes.
 * Capacity is fixed by the quality preset; when full, the oldest particle slot is recycled.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly base: Float32Array; // base size
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private active = 0;

  constructor(readonly capacity: number, sprite: THREE.Texture) {
    const n = Math.max(1, capacity);
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.base = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sprite }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor * a, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  setViewportHeight(px: number, fovDeg: number): void {
    this.mat.uniforms['uScale']!.value = px / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    sizeM: number,
    life: number,
    gravity = -4,
    drag = 1.5,
  ): void {
    if (this.capacity <= 0) return;
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.base[i] = sizeM;
    this.size[i] = sizeM;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
  }

  update(dt: number): void {
    let active = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) {
        if (this.alpha[i]! !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      active++;
      const l = (this.life[i] = this.life[i]! - dt);
      const k = Math.max(0, l / this.maxLife[i]!);
      const d = Math.exp(-this.drag[i]! * dt);
      const j = i * 3;
      this.vel[j] = this.vel[j]! * d;
      this.vel[j + 1] = this.vel[j + 1]! * d + this.gravity[i]! * dt;
      this.vel[j + 2] = this.vel[j + 2]! * d;
      this.pos[j] = this.pos[j]! + this.vel[j]! * dt;
      this.pos[j + 1] = this.pos[j + 1]! + this.vel[j + 1]! * dt;
      this.pos[j + 2] = this.pos[j + 2]! + this.vel[j + 2]! * dt;
      this.alpha[i] = Math.min(1, k * 1.6) * (k > 0 ? 1 : 0);
      this.size[i] = this.base[i]! * (0.4 + 0.6 * k);
    }
    this.active = active;
    for (const name of ['position', 'color', 'size', 'alpha']) {
      const a = this.geo.getAttribute(name) as THREE.BufferAttribute;
      a.needsUpdate = true;
    }
  }

  get activeCount(): number {
    return this.active;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * Ambient motes animated entirely on the GPU: warm dust drifting in the chamber volume and cyan energy
 * specks rising past it. Zero CPU cost per frame beyond one uniform.
 */
export function createAmbientMotes(
  sprite: THREE.Texture,
  count: number,
  box: THREE.Box3,
  color: number,
  opts: { size: number; rise: number; sway: number; seed: number },
): THREE.Points & { material: THREE.ShaderMaterial } {
  const n = Math.max(1, count);
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n);
  let s = opts.seed >>> 0;
  const r = () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
  const size = new THREE.Vector3();
  box.getSize(size);
  for (let i = 0; i < n; i++) {
    pos.set([box.min.x + r() * size.x, box.min.y + r() * size.y, box.min.z + r() * size.z], i * 3);
    rnd[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: sprite },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: opts.size },
      uRise: { value: opts.rise },
      uSway: { value: opts.sway },
      uMinY: { value: box.min.y },
      uHeight: { value: size.y },
      uScale: { value: 600 },
    },
    vertexShader: /* glsl */ `
      attribute float rnd;
      uniform float uTime; uniform float uSize; uniform float uRise; uniform float uSway; uniform float uMinY; uniform float uHeight; uniform float uScale;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.6 + rnd * 0.8);
        p.y = uMinY + mod(p.y - uMinY + t * uRise, uHeight);
        p.x += sin(t * 0.7 + rnd * 40.0) * uSway;
        p.z += cos(t * 0.5 + rnd * 23.0) * uSway;
        float edge = smoothstep(0.0, 0.15, (p.y - uMinY) / uHeight) * smoothstep(1.0, 0.8, (p.y - uMinY) / uHeight);
        vA = edge * (0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * (1.0 + rnd * 2.0) + rnd * 60.0)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.5 + rnd) * uScale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor;
      varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat) as THREE.Points & { material: THREE.ShaderMaterial };
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

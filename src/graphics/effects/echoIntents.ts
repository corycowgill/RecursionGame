import * as THREE from 'three';
import { unitsToWorld, type SimView, type Timeline } from '../../engine/contracts';
import { echoTint } from '../materials/palette';
import { labelTexture } from '../materials/textures';

/**
 * In-world echo intent indicators (pillar 4: "always clear which echo does what, when").
 *
 * For every echo, the next recorded interaction (switch press, pickup, socket, lift call…) within LOOKAHEAD ticks
 * gets a floating badge above the target object: the echo's numbered hex in its tint, ringed by a countdown arc
 * that closes as the moment approaches and flares when it lands. Purely a read-only view of
 * `TemporalGame.getTimeline()` planned markers and the rendered SimView tick — it never touches the simulation.
 */

const LOOKAHEAD = 240; // 4 s
const AFTERGLOW = 24; // ticks the badge lingers (flared) after the action fires
const POOL = 12;

const RingShader = {
  uniforms: { uColor: { value: new THREE.Color() }, uProgress: { value: 0 }, uFlare: { value: 0 }, uOpacity: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uProgress; uniform float uFlare; uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float a = atan(p.x, p.y) / 6.2831853 + 0.5;           // 0 at 12 o'clock, clockwise
      float band = smoothstep(0.80, 0.84, r) * (1.0 - smoothstep(0.93, 0.97, r));
      float track = band * 0.22;
      float arc = band * step(1.0 - uProgress, 1.0 - a);
      float ticks = band * step(0.92, fract(a * 12.0)) * 0.35;
      float glow = exp(-pow((r - 0.88) * 9.0, 2.0)) * (0.25 + uFlare * 0.9);
      float alpha = clamp(track + arc + ticks + glow * (0.4 + uProgress * 0.6), 0.0, 1.0) * uOpacity;
      vec3 col = uColor * (arc > 0.0 ? 1.6 + uFlare : 0.9) + vec3(uFlare * 0.6);
      gl_FragColor = vec4(col, alpha);
    }`,
};

interface Badge {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  label: THREE.Sprite;
  index: number;
}

export class EchoIntentLayer {
  readonly group = new THREE.Group();
  private readonly badges: Badge[] = [];
  private readonly labels = new Map<number, THREE.Texture>();
  private readonly ringGeo = new THREE.PlaneGeometry(1, 1);
  private timeline: Timeline | null = null;
  private enabled = true;

  constructor(private readonly makeLabel: (text: string, color: string) => THREE.Texture = labelTexture) {
    this.group.name = 'echo-intents';
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.ShaderMaterial({
        ...RingShader,
        uniforms: THREE.UniformsUtils.clone(RingShader.uniforms),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(this.ringGeo, mat);
      ring.renderOrder = 21;
      ring.scale.setScalar(0.92);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
      label.scale.setScalar(0.5);
      label.renderOrder = 22;
      const group = new THREE.Group();
      group.add(ring, label);
      group.visible = false;
      this.group.add(group);
      this.badges.push({ group, ring, label, index: -1 });
    }
  }

  setTimeline(t: Timeline | null): void {
    this.timeline = t;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) for (const b of this.badges) b.group.visible = false;
  }

  /** `view` is what the 3D view shows (live, scrubbed or previewed), so badges track that moment. */
  update(view: SimView, levelId: string, camera: THREE.Camera, time: number): void {
    let used = 0;
    const tl = this.timeline;
    if (this.enabled && tl && tl.levelId === levelId) {
      const shown = new Set(view.actors.map((a) => a.id));
      const perEntity = new Map<string, number>();
      const now = view.tick;
      for (const track of tl.tracks) {
        if (track.kind !== 'echo' || !shown.has(track.actorId) || used >= POOL) continue;
        // next planned interaction with an object (or one that just fired: afterglow)
        const m = track.planned.find((x) => x.entityId && x.tick + AFTERGLOW >= now && x.tick - now <= LOOKAHEAD);
        if (!m || !m.entityId) continue;
        const e = view.entities[m.entityId];
        if (!e) continue;
        const stack = perEntity.get(m.entityId) ?? 0;
        perEntity.set(m.entityId, stack + 1);
        const b = this.badges[used++]!;
        this.setIndex(b, track.echoIndex);
        const dtTicks = m.tick - now;
        const progress = dtTicks <= 0 ? 1 : 1 - dtTicks / LOOKAHEAD;
        const flare = dtTicks <= 0 ? 1 - -dtTicks / AFTERGLOW : 0;
        const u = b.ring.material.uniforms;
        u['uProgress']!.value = progress;
        u['uFlare']!.value = flare;
        // fade in at the edge of the window, fade out through the afterglow
        u['uOpacity']!.value = Math.min(1, (LOOKAHEAD - dtTicks) / 30) * (dtTicks < 0 ? Math.max(0, flare) : 1);
        (b.label.material as THREE.SpriteMaterial).opacity = u['uOpacity']!.value as number;
        const bob = Math.sin(time * 2.2 + track.echoIndex) * 0.05;
        b.group.position.set(unitsToWorld(e.x), unitsToWorld(e.y) + 2.15 + stack * 0.75 + bob, unitsToWorld(e.z));
        b.ring.quaternion.copy(camera.quaternion);
        const s = 0.92 + flare * 0.35 + (dtTicks > 0 && dtTicks < 30 ? Math.sin(time * 18) * 0.03 : 0);
        b.ring.scale.setScalar(s);
        b.group.visible = true;
      }
    }
    for (let i = used; i < this.badges.length; i++) this.badges[i]!.group.visible = false;
  }

  private setIndex(b: Badge, index: number): void {
    if (b.index === index) return;
    b.index = index;
    const tint = new THREE.Color(echoTint(index));
    (b.ring.material.uniforms['uColor']!.value as THREE.Color).copy(tint);
    let tex = this.labels.get(index);
    if (!tex) {
      tex = this.makeLabel(String(index + 1), `#${tint.getHexString()}`);
      this.labels.set(index, tex);
    }
    const mat = b.label.material as THREE.SpriteMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.ringGeo.dispose();
    for (const b of this.badges) {
      b.ring.material.dispose();
      (b.label.material as THREE.SpriteMaterial).dispose();
    }
    for (const t of this.labels.values()) t.dispose();
    this.labels.clear();
  }
}

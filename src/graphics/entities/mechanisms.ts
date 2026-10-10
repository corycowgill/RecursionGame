import * as THREE from 'three';
import { unitsToWorld, type EntityView } from '../../engine/contracts';
import { PALETTE } from '../materials/palette';
import { createRingMaterial } from '../shaders/fx';
import { damp, facingRotY, lerp, Parts, type EntityFrame, type EntityVisual, type EntityVisualContext } from './types';

/* Pressure plate · door · timed switch · elevator · moving platform */

export class PressurePlateVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly pad: THREE.Mesh;
  private readonly ringMat: THREE.MeshStandardMaterial;
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly pulse: THREE.Mesh;
  private readonly pulseMat: THREE.ShaderMaterial;
  private press = 0;
  private pulseT = 1;
  private wasPressed = false;

  constructor(ctx: EntityVisualContext) {
    const { lib } = ctx;
    const p = this.p;
    p.mesh(p.rbox(1.62, 0.12, 1.62, 0.04), lib.gunmetalDark, this.root, 0, 0.06, 0);
    // brass frame
    for (const [x, z, w, d] of [
      [0, 0.76, 1.62, 0.1],
      [0, -0.76, 1.62, 0.1],
      [0.76, 0, 0.1, 1.42],
      [-0.76, 0, 0.1, 1.42],
    ] as const)
      p.mesh(p.rbox(w, 0.08, d, 0.025), lib.brass, this.root, x, 0.13, z);
    // chevrons at the corners
    const chev = lib.emissive(PALETTE.gold, 1.6);
    for (const [x, z] of [
      [0.62, 0.62],
      [-0.62, 0.62],
      [0.62, -0.62],
      [-0.62, -0.62],
    ] as const) {
      const m = p.mesh(p.box(0.16, 0.02, 0.04), chev, this.root, x, 0.175, z, false);
      m.rotation.y = Math.atan2(x, z) + Math.PI / 4;
    }
    this.pad = p.mesh(p.rbox(1.18, 0.12, 1.18, 0.05), lib.gunmetal, this.root, 0, 0.16, 0);
    this.ringMat = p.mat(lib.emissiveUnique(PALETTE.cyan, 1.4));
    this.coreMat = p.mat(lib.emissiveUnique(PALETTE.cyan, 1.0));
    const ring1 = p.geo(new THREE.RingGeometry(0.4, 0.46, 48));
    ring1.rotateX(-Math.PI / 2);
    const ring2 = p.geo(new THREE.RingGeometry(0.22, 0.25, 40));
    ring2.rotateX(-Math.PI / 2);
    const core = p.geo(new THREE.CircleGeometry(0.1, 24));
    core.rotateX(-Math.PI / 2);
    p.mesh(ring1, this.ringMat, this.pad, 0, 0.062, 0, false);
    p.mesh(ring2, this.ringMat, this.pad, 0, 0.062, 0, false);
    p.mesh(core, this.coreMat, this.pad, 0, 0.062, 0, false);
    this.pulseMat = p.mat(createRingMaterial(PALETTE.teal));
    const pg = p.geo(new THREE.PlaneGeometry(2.6, 2.6));
    pg.rotateX(-Math.PI / 2);
    this.pulse = p.dyn(p.mesh(pg, this.pulseMat, this.root, 0, 0.2, 0, false));
    this.pulse.visible = false;
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'pressurePlate'>;
    const pressed = e.state.pressed;
    if (pressed && !this.wasPressed) this.pulseT = 0;
    this.wasPressed = pressed;
    this.press = damp(this.press, pressed ? 1 : 0, 22, f.dt);
    this.pad.position.y = 0.16 - this.press * 0.06;
    const idle = 0.9 + 0.35 * Math.sin(f.time * 2.4);
    this.ringMat.emissive.set(PALETTE.cyan).lerp(new THREE.Color(PALETTE.teal), this.press);
    this.ringMat.emissiveIntensity = lerp(idle, 4.2, this.press);
    this.coreMat.emissive.copy(this.ringMat.emissive);
    this.coreMat.emissiveIntensity = lerp(0.6, 5, this.press);
    this.pulseT = Math.min(1, this.pulseT + f.dt / 0.7);
    this.pulse.visible = this.pulseT < 1;
    this.pulseMat.uniforms['uProgress']!.value = this.pulseT;
    this.root.position.copy(f.pos);
  }

  dispose(): void {
    this.p.dispose();
  }
}

export class DoorVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly left = new THREE.Group();
  private readonly right = new THREE.Group();
  private readonly seamMat: THREE.MeshStandardMaterial;
  private readonly lampMat: THREE.MeshStandardMaterial;
  private progress = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    const inner = new THREE.Group();
    inner.rotation.y = facingRotY(def.facing);
    this.root.add(inner);
    const H = 2.35;
    // frame: jambs + lintel with brass trim and glow slots
    for (const s of [-1, 1]) {
      p.mesh(p.rbox(0.34, H + 0.22, 0.72, 0.05), lib.ivory, inner, s * 1.02, (H + 0.22) / 2, 0);
      p.mesh(p.box(0.36, 0.08, 0.74), lib.brass, inner, s * 1.02, 0.35, 0);
      p.mesh(p.box(0.05, H - 0.6, 0.02), lib.emissive(PALETTE.cyan, 2.2), inner, s * 0.86, H / 2, 0.37, false);
      p.mesh(p.box(0.05, H - 0.6, 0.02), lib.emissive(PALETTE.cyan, 2.2), inner, s * 0.86, H / 2, -0.37, false);
    }
    p.mesh(p.rbox(2.44, 0.24, 0.6, 0.05), lib.gunmetal, inner, 0, H + 0.12, 0);
    p.mesh(p.box(2.46, 0.06, 0.64), lib.brass, inner, 0, H + 0.01, 0);
    p.mesh(p.box(2.46, 0.05, 0.64), lib.brass, inner, 0, H + 0.25, 0);
    this.lampMat = p.mat(lib.emissiveUnique(PALETTE.coral, 2.5));
    for (const z of [0.31, -0.31]) p.mesh(p.rbox(0.42, 0.1, 0.04, 0.02), this.lampMat, inner, 0, H + 0.12, z, false);
    // sliding leaves
    this.seamMat = p.mat(lib.emissiveUnique(PALETTE.gold, 2.6));
    const leafGeo = p.rbox(0.86, H - 0.08, 0.24, 0.04);
    const insetGeo = p.rbox(0.5, H * 0.62, 0.03, 0.015);
    const bandGeo = p.box(0.86, 0.06, 0.26);
    const seamGeo = p.box(0.035, H - 0.3, 0.27);
    for (const [g, s] of [
      [this.left, -1],
      [this.right, 1],
    ] as const) {
      inner.add(g);
      p.mesh(leafGeo, lib.ivory, g, s * 0.43, H / 2, 0);
      for (const z of [0.125, -0.125]) {
        p.mesh(insetGeo, lib.gunmetal, g, s * 0.47, H * 0.52, z);
      }
      for (const y of [0.28, H - 0.28]) p.mesh(bandGeo, lib.brass, g, s * 0.43, y, 0);
      p.mesh(seamGeo, this.seamMat, g, s * 0.02, H / 2, 0, false);
      // circular lock half-ring
      const half = p.geo(new THREE.TorusGeometry(0.22, 0.025, 8, 24, Math.PI));
      for (const z of [0.13, -0.13]) {
        const m = p.mesh(half, this.seamMat, g, 0, H * 0.52, z, false);
        m.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    }
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'door'>;
    const prev = f.prev as EntityView<'door'>;
    const target = lerp(prev.state.progress, e.state.progress, f.alpha) / 1000;
    this.progress = damp(this.progress, target, 30, f.dt);
    const k = this.progress;
    const ease = k * k * (3 - 2 * k);
    this.left.position.x = -ease * 0.92;
    this.right.position.x = ease * 0.92;
    const open = e.state.open;
    this.lampMat.emissive.set(e.state.blocked ? PALETTE.gold : open ? PALETTE.teal : PALETTE.coral);
    this.lampMat.emissiveIntensity = 2.4 + (e.state.blocked ? Math.sin(f.time * 12) * 1.2 : 0);
    this.seamMat.emissiveIntensity = 1.8 + (1 - Math.abs(ease - 0.5) * 2) * 3.5 + Math.sin(f.time * 3) * 0.3;
    this.root.position.copy(f.pos);
  }

  dispose(): void {
    this.p.dispose();
  }
}

export class TimedSwitchVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly segs: THREE.Mesh[] = [];
  private readonly segOn: THREE.MeshStandardMaterial;
  private readonly segOff: THREE.MeshStandardMaterial;
  private readonly buttonMat: THREE.MeshStandardMaterial;
  private readonly button: THREE.Mesh;
  private readonly duration: number;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    this.duration = def.kind === 'timedSwitch' ? Math.max(1, def.config.durationTicks) : 300;
    const inner = new THREE.Group();
    inner.rotation.y = facingRotY(def.facing);
    this.root.add(inner);
    p.mesh(p.cyl(0.42, 0.5, 0.16, 32), lib.gunmetalDark, inner, 0, 0.08, 0);
    p.mesh(p.torus(0.44, 0.03, 40), lib.brass, inner, 0, 0.16, 0).rotation.x = Math.PI / 2;
    p.mesh(p.rbox(0.26, 0.95, 0.26, 0.05), lib.gunmetal, inner, 0, 0.62, 0);
    p.mesh(p.box(0.05, 0.7, 0.02), lib.emissive(PALETTE.gold, 2.4), inner, 0, 0.62, 0.135, false);
    // head housing
    p.mesh(p.rbox(0.62, 0.3, 0.62, 0.08), lib.ivory, inner, 0, 1.22, 0);
    p.mesh(p.cyl(0.33, 0.33, 0.06, 32), lib.brass, inner, 0, 1.39, 0);
    this.buttonMat = p.mat(lib.emissiveUnique(PALETTE.gold, 1.5));
    this.button = p.dyn(p.mesh(p.geo(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), this.buttonMat, inner, 0, 1.4, 0, false));
    // countdown segments around the head
    this.segOn = lib.emissive(PALETTE.gold, 3.2);
    this.segOff = lib.emissive(0x3a2a12, 0.5);
    const segGeo = p.box(0.07, 0.04, 0.03);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = p.dyn(p.mesh(segGeo, this.segOff, inner, Math.sin(a) * 0.27, 1.43, Math.cos(a) * 0.27, false));
      m.rotation.y = a;
      this.segs.push(m);
    }
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'timedSwitch'>;
    const lit = e.state.on ? Math.ceil((e.state.remainingTicks / this.duration) * 12) : 0;
    this.segs.forEach((m, i) => (m.material = i < lit ? this.segOn : this.segOff));
    this.buttonMat.emissive.set(e.state.on ? PALETTE.teal : PALETTE.gold);
    this.buttonMat.emissiveIntensity = e.state.on ? 3.5 + Math.sin(f.time * 10) * 0.6 : 1.1 + Math.sin(f.time * 2.5) * 0.4;
    this.button.position.y = e.state.on ? 1.37 : 1.4;
    this.root.position.copy(f.pos);
  }

  dispose(): void {
    this.p.dispose();
  }
}

export class ElevatorVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly platform = new THREE.Group();
  private readonly piston: THREE.Mesh;
  private readonly stripMat: THREE.MeshStandardMaterial;
  private readonly baseY: number;
  private y = Number.NaN;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    const levels = def.kind === 'elevator' ? def.config.levels : [0, 1];
    const minL = Math.min(...levels);
    const maxL = Math.max(...levels);
    this.baseY = minL * 2 - 3.2;
    // guide rails at corners (static, in root space relative to y=0 world; root sits at world y 0)
    const railH = (maxL - minL) * 2 + 3.6;
    for (const [x, z] of [
      [0.92, 0.92],
      [-0.92, 0.92],
      [0.92, -0.92],
      [-0.92, -0.92],
    ] as const) {
      p.mesh(p.rbox(0.12, railH, 0.12, 0.03), lib.gunmetalDark, this.root, x, this.baseY + railH / 2, z);
      for (const l of levels) p.mesh(p.box(0.16, 0.05, 0.16), lib.emissive(PALETTE.teal, 2.2), this.root, x, l * 2 - 0.1, z, false);
    }
    this.piston = p.dyn(p.mesh(p.cyl(0.28, 0.28, 1, 24), lib.brassPolished, this.root, 0, 0, 0));
    // platform
    this.root.add(this.platform);
    p.mesh(p.rbox(1.9, 0.3, 1.9, 0.05), lib.gunmetal, this.platform, 0, -0.15, 0);
    const top = p.rbox(1.6, 0.04, 1.6, 0.015);
    p.mesh(top, lib.floorEmblem, this.platform, 0, 0.01, 0);
    for (const [x, z] of [[0.62, 0], [-0.62, 0], [0, 0.62], [0, -0.62]] as const) {
      const ch = p.mesh(p.box(0.22, 0.02, 0.05), lib.emissive(PALETTE.teal, 2.4), this.platform, x, 0.04, z, false);
      ch.rotation.y = x === 0 ? 0 : Math.PI / 2;
    }
    this.stripMat = p.mat(lib.emissiveUnique(PALETTE.teal, 2));
    for (let d = 0; d < 4; d++) {
      const g = p.mesh(p.box(1.86, 0.05, 0.05), this.stripMat, this.platform, 0, -0.08, 0.95, false);
      const pivot = new THREE.Group();
      pivot.rotation.y = (d * Math.PI) / 2;
      pivot.add(g);
      this.platform.add(pivot);
      const lip = p.mesh(p.box(1.92, 0.07, 0.08), lib.brass, pivot, 0, 0.0, 0.93);
      lip.castShadow = false;
    }
    p.mesh(p.cyl(0.5, 0.36, 0.3, 24), lib.gunmetalDark, this.platform, 0, -0.45, 0);
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'elevator'>;
    const prev = f.prev as EntityView<'elevator'>;
    const target = unitsToWorld(lerp(prev.state.y, e.state.y, f.alpha));
    this.y = Number.isNaN(this.y) ? target : damp(this.y, target, 40, f.dt);
    this.root.position.set(f.pos.x, 0, f.pos.z);
    this.platform.position.y = this.y;
    const len = Math.max(0.1, this.y - 0.6 - this.baseY);
    this.piston.scale.y = len;
    this.piston.position.y = this.baseY + len / 2;
    this.stripMat.emissiveIntensity = e.state.moving ? 3.5 + Math.sin(f.time * 14) * 0.8 : 1.6;
  }

  dispose(): void {
    this.p.dispose();
  }
}

export class MovingPlatformVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly body = new THREE.Group();
  private readonly jets: THREE.Mesh[] = [];
  private readonly jetMat: THREE.MeshStandardMaterial;
  private readonly pathGroup = new THREE.Group();

  constructor(ctx: EntityVisualContext) {
    const { lib, def, grid } = ctx;
    const p = this.p;
    this.root.add(this.body);
    p.mesh(p.rbox(1.9, 0.26, 1.9, 0.06), lib.gunmetal, this.body, 0, -0.13, 0);
    p.mesh(p.rbox(1.62, 0.04, 1.62, 0.015), lib.floorTile, this.body, 0, 0.01, 0);
    p.mesh(p.rbox(1.96, 0.08, 1.96, 0.03), lib.brass, this.body, 0, -0.26, 0);
    p.mesh(p.rbox(1.3, 0.24, 1.3, 0.08), lib.gunmetalDark, this.body, 0, -0.42, 0);
    this.jetMat = p.mat(lib.emissiveUnique(PALETTE.warmLamp, 3));
    const jetGeo = p.geo(new THREE.ConeGeometry(0.14, 0.55, 16, 1, true));
    jetGeo.translate(0, -0.27, 0);
    jetGeo.rotateX(Math.PI);
    const nozzle = p.cyl(0.13, 0.17, 0.16, 16);
    for (const [x, z] of [
      [0.58, 0.58],
      [-0.58, 0.58],
      [0.58, -0.58],
      [-0.58, -0.58],
    ] as const) {
      p.mesh(nozzle, lib.brassPolished, this.body, x, -0.38, z);
      const j = p.dyn(p.mesh(jetGeo, this.jetMat, this.body, x, -0.46, z, false));
      j.scale.y = -1;
      this.jets.push(j);
    }
    // path markers: dotted lights along waypoints (static, world space)
    if (def.kind === 'movingPlatform') {
      const dot = p.cyl(0.07, 0.07, 0.03, 12);
      const mat = lib.emissive(PALETTE.warmLamp, 1.5);
      const pts = def.config.path;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if (i === pts.length - 1 && def.config.mode !== 'loop') break;
        const steps = Math.max(1, Math.round(Math.hypot(b.col - a.col, b.row - a.row) * 3));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const col = lerp(a.col, b.col, t);
          const row = lerp(a.row, b.row, t);
          const lvl = def.level ?? Math.max(0, grid.tileAt(a.col, a.row).h);
          p.mesh(dot, mat, this.pathGroup, (col + 0.5) * 2, lvl * 2 - 0.9, (row + 0.5) * 2, false);
        }
      }
    }
  }

  /** Path markers are world-anchored; the renderer adds them to the level root. */
  get pathMarkers(): THREE.Object3D {
    return this.pathGroup;
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'movingPlatform'>;
    this.root.position.copy(f.pos);
    const moving = e.state.dx !== 0 || e.state.dz !== 0;
    this.body.position.y = Math.sin(f.time * 1.7) * 0.025;
    this.body.rotation.z = -e.state.dx * 0.002;
    this.body.rotation.x = e.state.dz * 0.002;
    this.jetMat.emissiveIntensity = (moving ? 4 : 2.2) + Math.sin(f.time * 40) * 0.5;
    for (const j of this.jets) j.scale.y = -(moving ? 1.25 : 0.8) - Math.sin(f.time * 33 + j.id) * 0.08;
  }

  dispose(): void {
    this.pathGroup.removeFromParent();
    this.p.dispose();
  }
}

import * as THREE from 'three';
import { unitsToWorld, type EntityView } from '../../engine/contracts';
import { archFrameGeometry, archPaneGeometry } from '../environment/kit';
import { PALETTE } from '../materials/palette';
import { createBeamMaterial, createCurtainMaterial, createPortalMaterial, createRingMaterial } from '../shaders/fx';
import { damp, facingRotY, Parts, type EntityFrame, type EntityVisual, type EntityVisualContext } from './types';

/* Laser emitter · laser receiver · temporal gate · exit portal */

const BEAM_Y = 1.0;
const BARREL = 0.55;
export const LASER_COLOR = 0xff4636;

export class LaserEmitterVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly inner = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly beamMat: THREE.ShaderMaterial;
  private readonly haloMat: THREE.ShaderMaterial;
  private readonly lensMat: THREE.MeshStandardMaterial;
  private readonly impact: THREE.Sprite;
  private sparkTimer = 0;
  private length = 0;

  constructor(private readonly ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    this.inner.rotation.y = facingRotY(def.facing);
    this.root.add(this.inner);
    const i = this.inner;
    p.mesh(p.cyl(0.4, 0.48, 0.18, 32), lib.gunmetalDark, i, 0, 0.09, 0);
    p.mesh(p.torus(0.42, 0.03, 40), lib.brass, i, 0, 0.18, 0).rotation.x = Math.PI / 2;
    p.mesh(p.cyl(0.11, 0.15, 0.62, 16), lib.gunmetal, i, 0, 0.5, 0);
    // yoke
    for (const s of [-1, 1]) p.mesh(p.rbox(0.06, 0.4, 0.2, 0.02), lib.brass, i, s * 0.2, 0.95, 0);
    p.mesh(p.cyl(0.04, 0.04, 0.46, 12), lib.brassPolished, i, 0, BEAM_Y, 0).rotation.z = Math.PI / 2;
    // barrel housing
    const housing = p.mesh(p.rbox(0.3, 0.3, 0.62, 0.07), lib.ivory, i, 0, BEAM_Y, 0.08);
    housing.castShadow = true;
    const barrel = p.mesh(p.cyl(0.09, 0.11, 0.3, 20), lib.gunmetalDark, i, 0, BEAM_Y, 0.45);
    barrel.rotation.x = Math.PI / 2;
    for (const z of [0.38, 0.5]) p.mesh(p.torus(0.105, 0.015, 20), lib.brass, i, 0, BEAM_Y, z);
    this.lensMat = p.mat(lib.emissiveUnique(LASER_COLOR, 3));
    const lens = p.mesh(p.cyl(0.065, 0.065, 0.02, 20), this.lensMat, i, 0, BEAM_Y, BARREL + 0.06, false);
    lens.rotation.x = Math.PI / 2;
    p.mesh(p.box(0.04, 0.02, 0.4), lib.emissive(PALETTE.gold, 2), i, 0, BEAM_Y + 0.16, 0.08, false);
    // beam
    this.beamMat = p.mat(createBeamMaterial(LASER_COLOR));
    this.haloMat = p.mat(createBeamMaterial(LASER_COLOR));
    this.haloMat.uniforms['uPower']!.value = 0.35;
    const beamGeo = p.geo(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true));
    beamGeo.translate(0, 0.5, 0);
    beamGeo.rotateX(Math.PI / 2);
    this.beam = p.dyn(p.mesh(beamGeo, this.beamMat, i, 0, BEAM_Y, BARREL, false));
    this.halo = p.dyn(p.mesh(beamGeo, this.haloMat, i, 0, BEAM_Y, BARREL, false));
    this.beam.renderOrder = 4;
    this.halo.renderOrder = 4;
    const spriteMat = p.mat(
      new THREE.SpriteMaterial({ map: lib.sprite, color: new THREE.Color(LASER_COLOR).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.impact = new THREE.Sprite(spriteMat);
    this.impact.scale.setScalar(0.7);
    i.add(this.impact);
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'laserEmitter'>;
    const on = e.state.on && e.state.beamLength > 0;
    const target = on ? Math.max(0.01, unitsToWorld(e.state.beamLength) - BARREL) : 0;
    this.length = on ? (this.length <= 0.01 ? target : damp(this.length, target, 40, f.dt)) : 0;
    const vis = on && this.length > 0.02;
    this.beam.visible = this.halo.visible = this.impact.visible = vis;
    this.beam.scale.set(0.035, 0.035, this.length);
    this.halo.scale.set(0.12, 0.12, this.length);
    this.beamMat.uniforms['uTime']!.value = f.time;
    this.beamMat.uniforms['uLength']!.value = this.length;
    this.haloMat.uniforms['uTime']!.value = f.time;
    this.haloMat.uniforms['uLength']!.value = this.length;
    this.beamMat.uniforms['uPower']!.value = 0.9 + Math.sin(f.time * 50) * 0.1;
    this.impact.position.set(0, BEAM_Y, BARREL + this.length);
    this.impact.scale.setScalar(0.55 + Math.sin(f.time * 37) * 0.12);
    this.lensMat.emissiveIntensity = on ? 5 : 0.4;
    this.root.position.copy(f.pos);
    if (vis) {
      this.sparkTimer += f.dt;
      if (this.sparkTimer > 0.07) {
        this.sparkTimer = 0;
        const wp = new THREE.Vector3();
        this.impact.getWorldPosition(wp);
        this.ctx.vfx.sparks(wp, LASER_COLOR, 2, { speed: 2.2, up: 1.5, size: 0.06, life: 0.4 });
      }
    }
  }

  dispose(): void {
    this.p.dispose();
  }
}

export class LaserReceiverVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly lensMat: THREE.MeshStandardMaterial;
  private readonly spinner = new THREE.Group();
  private lit = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    const i = new THREE.Group();
    i.rotation.y = facingRotY(def.facing);
    this.root.add(i);
    p.mesh(p.cyl(0.36, 0.44, 0.16, 32), lib.gunmetalDark, i, 0, 0.08, 0);
    p.mesh(p.cyl(0.1, 0.14, 0.62, 16), lib.gunmetal, i, 0, 0.45, 0);
    // eye housing: ivory sphere shell with brass ring + lens facing +z
    const shell = p.mesh(p.geo(new THREE.SphereGeometry(0.3, 32, 20)), lib.ivory, i, 0, BEAM_Y, -0.05);
    shell.scale.z = 0.8;
    const ring = p.mesh(p.torus(0.24, 0.045, 40), lib.brassPolished, i, 0, BEAM_Y, 0.17);
    ring.castShadow = true;
    this.lensMat = p.mat(lib.emissiveUnique(0x401010, 1));
    p.mesh(p.cyl(0.19, 0.19, 0.04, 32), this.lensMat, i, 0, BEAM_Y, 0.16, false).rotation.x = Math.PI / 2;
    p.mesh(p.cyl(0.07, 0.07, 0.05, 20), lib.gunmetalDark, i, 0, BEAM_Y, 0.175).rotation.x = Math.PI / 2;
    i.add(this.spinner);
    this.spinner.position.set(0, BEAM_Y, 0.2);
    const arc = p.geo(new THREE.TorusGeometry(0.32, 0.012, 6, 24, Math.PI * 0.5));
    for (let k = 0; k < 3; k++) {
      const m = p.mesh(arc, this.lensMat, this.spinner, 0, 0, 0, false);
      m.rotation.z = (k / 3) * Math.PI * 2;
    }
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'laserReceiver'>;
    this.lit = damp(this.lit, e.state.lit ? 1 : 0, 10, f.dt);
    this.lensMat.emissive.set(0x501614).lerp(new THREE.Color(PALETTE.teal), this.lit);
    this.lensMat.emissiveIntensity = 1 + this.lit * 4;
    this.spinner.rotation.z = f.time * (0.4 + this.lit * 3);
    this.spinner.scale.setScalar(0.85 + this.lit * 0.15);
    this.root.position.copy(f.pos);
  }

  dispose(): void {
    this.p.dispose();
  }
}

function gateColors(allows: string): [number, number] {
  if (allows === 'player') return [PALETTE.gold, 0xff7a2a];
  if (allows === 'echoes') return [PALETTE.cyan, 0x2a4dff];
  return [PALETTE.violet, 0x3fd8ff];
}

export class TemporalGateVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly portalMat: THREE.ShaderMaterial;
  private readonly glowMat: THREE.MeshStandardMaterial;
  private readonly rings = new THREE.Group();
  private readonly lampMat: THREE.MeshStandardMaterial;
  private readonly baseGlow: THREE.Color;
  private readonly gold = new THREE.Color(PALETTE.gold);
  private power = 0;
  private blockedK = 0;
  /** Rotation the arcs lost while strained (so an un-held gate spins exactly as before round 4). */
  private lag = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    const allows = def.kind === 'temporalGate' ? def.config.allows : 'all';
    const [a, b] = gateColors(allows);
    const i = new THREE.Group();
    i.rotation.y = facingRotY(def.facing);
    this.root.add(i);
    const cy = 1.25;
    // pylons
    for (const s of [-1, 1]) {
      p.mesh(p.rbox(0.36, 0.5, 0.7, 0.06), lib.gunmetalDark, i, s * 1.0, 0.25, 0);
      p.mesh(p.box(0.38, 0.06, 0.72), lib.brass, i, s * 1.0, 0.52, 0);
    }
    // main ring: gunmetal torus, brass inner torus, emissive band
    p.mesh(p.torus(1.0, 0.13, 64, 12), lib.gunmetal, i, 0, cy, 0);
    p.mesh(p.torus(0.86, 0.04, 64), lib.brassPolished, i, 0, cy, 0);
    this.glowMat = p.mat(lib.emissiveUnique(a, 2.5));
    this.baseGlow = new THREE.Color(a);
    p.mesh(p.torus(1.0, 0.03, 64), this.glowMat, i, 0, cy, 0.13, false);
    p.mesh(p.torus(1.0, 0.03, 64), this.glowMat, i, 0, cy, -0.13, false);
    // status lamps on the crown of the ring (same language as the door lintel lamps: teal open, coral closed,
    // pulsing gold while an occupant holds it open — round 4)
    this.lampMat = p.mat(lib.emissiveUnique(PALETTE.teal, 2.4));
    for (const z of [0.155, -0.155]) p.mesh(p.rbox(0.34, 0.08, 0.04, 0.02), this.lampMat, i, 0, cy + 1.31, z, false);
    p.mesh(p.rbox(0.42, 0.12, 0.27, 0.03), lib.gunmetal, i, 0, cy + 1.31, 0);
    // clock ticks
    const tick = p.box(0.05, 0.16, 0.3);
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const m = p.mesh(tick, lib.brass, i, Math.cos(ang) * 1.14, cy + Math.sin(ang) * 1.14, 0);
      m.rotation.z = ang - Math.PI / 2;
    }
    this.portalMat = p.mat(createPortalMaterial(a, b));
    p.mesh(p.geo(new THREE.CircleGeometry(0.86, 64)), this.portalMat, i, 0, cy, 0, false).renderOrder = 4;
    i.add(this.rings);
    this.rings.position.y = cy;
    const arc = p.geo(new THREE.TorusGeometry(1.25, 0.012, 6, 32, Math.PI * 0.7));
    for (let k = 0; k < 2; k++) {
      const m = p.mesh(arc, this.glowMat, this.rings, 0, 0, 0, false);
      m.rotation.z = k * Math.PI;
    }
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'temporalGate'>;
    this.power = damp(this.power, e.state.open ? 1 : 0.22, 6, f.dt);
    this.portalMat.uniforms['uTime']!.value = f.time;
    this.portalMat.uniforms['uPower']!.value = this.power;
    // Held open by an occupant (state.held, QA-2): like the door's blocked lamp — pulsing gold — and the field's glow
    // band warms toward gold with the same pulse, while the arcs slow to a strained crawl.
    const blocked = e.state.held === true;
    this.blockedK = damp(this.blockedK, blocked ? 1 : 0, blocked ? 18 : 8, f.dt);
    const pulse = Math.sin(f.time * 12);
    this.lampMat.emissive.set(blocked ? PALETTE.gold : e.state.open ? PALETTE.teal : PALETTE.coral);
    this.lampMat.emissiveIntensity = 2.4 + (blocked ? pulse * 1.2 : 0);
    this.glowMat.emissive.copy(this.baseGlow).lerp(this.gold, this.blockedK * (0.55 + 0.25 * pulse));
    this.glowMat.emissiveIntensity = 1 + this.power * 2.5 + this.blockedK * pulse * 0.8;
    this.lag += f.dt * 0.6 * 0.8 * this.blockedK;
    this.rings.rotation.z = f.time * 0.6 - this.lag;
    this.root.position.copy(f.pos);
  }

  dispose(): void {
    this.p.dispose();
  }
}

export class ExitPortalVisual implements EntityVisual {
  readonly root = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly p = new Parts();
  private readonly curtainMat: THREE.ShaderMaterial;
  private readonly floorRing: THREE.ShaderMaterial;
  private readonly accentMat: THREE.MeshStandardMaterial;
  private readonly halo = new THREE.Group();
  private power = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    const i = new THREE.Group();
    i.rotation.y = facingRotY(def.facing) + Math.PI; // arch opens toward the default camera
    this.root.add(i);
    // dais
    p.mesh(p.cyl(0.92, 0.98, 0.12, 48), lib.gunmetalDark, this.root, 0, 0.06, 0);
    p.mesh(p.torus(0.92, 0.035, 64), lib.brassPolished, this.root, 0, 0.12, 0).rotation.x = Math.PI / 2;
    this.accentMat = p.mat(lib.emissiveUnique(PALETTE.cyan, 2));
    p.mesh(p.torus(0.7, 0.018, 64), this.accentMat, this.root, 0, 0.13, 0, false).rotation.x = Math.PI / 2;
    // arch
    const W = 1.35;
    const H = 2.75;
    const frameGeo = p.geo(archFrameGeometry(W, H, 0.3));
    frameGeo.translate(0, 0, -0.15);
    const frame = p.mesh(frameGeo, lib.brass, i, 0, 0.12, 0);
    frame.castShadow = true;
    const back = p.geo(archFrameGeometry(W + 0.22, H + 0.12, 0.08));
    back.translate(0, 0, -0.04);
    p.mesh(back, lib.gunmetal, i, 0, 0.06, -0.16);
    // glowing inner trims
    for (const s of [-1, 1]) p.mesh(p.box(0.04, H - W / 2 - 0.2, 0.32), this.accentMat, i, s * (W / 2 - 0.08), 0.2 + (H - W / 2) / 2, 0, false);
    // curtain
    const paneGeo = p.geo(archPaneGeometry(W - 0.12, H - 0.18));
    this.curtainMat = p.mat(createCurtainMaterial(PALETTE.cyan, W - 0.12, H - 0.18));
    const pane = p.mesh(paneGeo, this.curtainMat, i, 0, 0.2, 0, false);
    pane.renderOrder = 4;
    // keystone emblem
    p.mesh(p.rbox(0.28, 0.32, 0.36, 0.05), lib.gunmetal, i, 0, H + 0.2, 0);
    const gem = p.mesh(p.geo(new THREE.OctahedronGeometry(0.1)), this.accentMat, i, 0, H + 0.2, 0.2, false);
    gem.scale.set(1, 1.4, 0.6);
    // floor ring pulse + floating halo arcs
    this.floorRing = p.mat(createRingMaterial(PALETTE.cyan));
    this.floorRing.uniforms['uWidth']!.value = 0.05;
    const fg = p.geo(new THREE.PlaneGeometry(2.6, 2.6));
    fg.rotateX(-Math.PI / 2);
    p.mesh(fg, this.floorRing, this.root, 0, 0.14, 0, false);
    this.root.add(this.halo);
    this.halo.position.y = 1.6;
    const arc = p.geo(new THREE.TorusGeometry(1.15, 0.015, 6, 40, Math.PI * 0.45));
    for (let k = 0; k < 3; k++) {
      const m = p.mesh(arc, this.accentMat, this.halo, 0, 0, 0, false);
      m.rotation.set(Math.PI / 2, 0, (k / 3) * Math.PI * 2);
    }
    this.light = new THREE.PointLight(PALETTE.cyan, 0, 9, 1.6);
    this.light.position.set(0, 1.4, 0.4);
    this.root.add(this.light);
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'exitPortal'>;
    this.power = damp(this.power, e.state.active ? 1 : 0.12, 3, f.dt);
    this.curtainMat.uniforms['uTime']!.value = f.time;
    this.curtainMat.uniforms['uPower']!.value = this.power;
    this.accentMat.emissive.set(e.state.active ? PALETTE.cyan : PALETTE.gold);
    this.accentMat.emissiveIntensity = 0.8 + this.power * 2.6;
    this.floorRing.uniforms['uProgress']!.value = (f.time * 0.6) % 1;
    this.floorRing.uniforms['uIntensity']!.value = 2.5 * this.power;
    this.halo.rotation.y = f.time * 0.5;
    this.halo.position.y = 1.6 + Math.sin(f.time * 1.3) * 0.08;
    this.halo.visible = this.power > 0.3;
    this.light.intensity = 9 * this.power;
    this.root.position.copy(f.pos);
  }

  dispose(): void {
    this.p.dispose();
  }
}

import * as THREE from 'three';
import type { EntityView } from '../../engine/contracts';
import { PALETTE } from '../materials/palette';
import { damp, Parts, type EntityFrame, type EntityVisual, type EntityVisualContext } from './types';

/* Crate · energy cell · energy socket (receptacle) */

const CRATE = 1.2;

export class CrateVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly body = new THREE.Group();
  private readonly coreMat: THREE.MeshStandardMaterial;
  private carry = 0;
  private settle = 1;
  private wasCarried = false;

  constructor(ctx: EntityVisualContext) {
    const { lib } = ctx;
    const p = this.p;
    const s = CRATE;
    this.root.add(this.body);
    p.mesh(p.rbox(s * 0.94, s * 0.94, s * 0.94, 0.06), lib.ivory, this.body, 0, s / 2, 0);
    // dark frame edges
    const edgeGeo = p.rbox(0.12, s, 0.12, 0.03);
    const h = s / 2 - 0.04;
    for (const [x, z] of [
      [h, h],
      [-h, h],
      [h, -h],
      [-h, -h],
    ] as const)
      p.mesh(edgeGeo, lib.gunmetal, this.body, x, s / 2, z);
    const edgeH = p.rbox(s, 0.12, 0.12, 0.03);
    for (const y of [0.04, s - 0.04])
      for (const z of [h, -h]) {
        p.mesh(edgeH, lib.gunmetal, this.body, 0, y, z);
        p.mesh(edgeH, lib.gunmetal, this.body, z, y, 0).rotation.y = Math.PI / 2;
      }
    // brass corner brackets
    const cap = p.rbox(0.2, 0.2, 0.2, 0.04);
    for (const x of [h, -h]) for (const y of [0.05, s - 0.05]) for (const z of [h, -h]) p.mesh(cap, lib.brass, this.body, x, y, z);
    // core lens on four faces + handles on two
    this.coreMat = p.mat(lib.emissiveUnique(PALETTE.cyan, 2.2));
    const lensRing = p.torus(0.17, 0.035, 28);
    const lens = p.cyl(0.13, 0.13, 0.03, 24);
    const handle = p.geo(new THREE.TorusGeometry(0.16, 0.025, 8, 16, Math.PI));
    for (let d = 0; d < 4; d++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (d * Math.PI) / 2;
      pivot.position.y = s / 2;
      this.body.add(pivot);
      p.mesh(lensRing, lib.gunmetalDark, pivot, 0, 0, s * 0.47);
      const l = p.mesh(lens, this.coreMat, pivot, 0, 0, s * 0.47, false);
      l.rotation.x = Math.PI / 2;
      if (d % 2 === 1) {
        const hm = p.mesh(handle, lib.gunmetalDark, pivot, 0, s * 0.3, s * 0.48);
        hm.rotation.z = 0;
      }
    }
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'crate'>;
    const carried = e.carriedBy !== null;
    if (this.wasCarried && !carried) this.settle = 0;
    this.wasCarried = carried;
    this.carry = damp(this.carry, carried ? 1 : 0, 14, f.dt);
    this.settle = Math.min(1, this.settle + f.dt / 0.35);
    const squash = Math.sin(this.settle * Math.PI) * 0.08 * (1 - this.settle);
    this.body.scale.set(1 + squash, 1 - squash * 1.5, 1 + squash);
    const sc = 1 - this.carry * 0.25;
    this.root.scale.setScalar(sc);
    this.root.position.copy(f.pos);
    this.root.rotation.y = carried ? Math.sin(f.time * 2) * 0.05 : 0;
    this.coreMat.emissiveIntensity = (carried ? 3.4 : 2) + Math.sin(f.time * 2.2) * 0.4;
  }

  dispose(): void {
    this.p.dispose();
  }
}

/** Hue per energy-cell tag (default cyan-teal). */
function tagColor(tag: string | undefined): number {
  if (!tag) return PALETTE.teal;
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return [PALETTE.teal, PALETTE.violet, PALETTE.gold, PALETTE.cyan][h % 4] ?? PALETTE.teal;
}

export class EnergyCellVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly body = new THREE.Group();
  private readonly coreMat: THREE.MeshStandardMaterial;
  private seat = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib, def } = ctx;
    const p = this.p;
    const color = tagColor(def.kind === 'energyCell' ? def.config.tag : undefined);
    this.root.add(this.body);
    this.coreMat = p.mat(lib.emissiveUnique(color, 4));
    p.mesh(p.cyl(0.075, 0.075, 0.5, 16), this.coreMat, this.body, 0, 0.36, 0, false);
    p.mesh(p.cyl(0.16, 0.16, 0.5, 24, true), lib.glass, this.body, 0, 0.36, 0, false);
    for (const y of [0.08, 0.64]) {
      p.mesh(p.cyl(0.19, 0.19, 0.1, 24), lib.brassPolished, this.body, 0, y, 0);
      p.mesh(p.torus(0.19, 0.018, 28), lib.gunmetalDark, this.body, 0, y + (y < 0.3 ? 0.06 : -0.06), 0).rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      p.mesh(p.box(0.03, 0.5, 0.03), lib.brass, this.body, Math.cos(a) * 0.17, 0.36, Math.sin(a) * 0.17);
    }
    p.mesh(p.cyl(0.05, 0.08, 0.06, 16), lib.brass, this.body, 0, 0.72, 0);
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'energyCell'>;
    const seated = e.state.socketId !== null;
    const carried = e.carriedBy !== null;
    this.seat = damp(this.seat, seated ? 1 : 0, 12, f.dt);
    this.root.position.copy(f.pos);
    // seated cells rise into the receptacle cup; free cells hover and spin
    const hover = carried || seated ? 0 : 0.18 + Math.sin(f.time * 2) * 0.05;
    this.body.position.y = hover + this.seat * 0.82;
    this.body.rotation.y = seated ? f.time * 1.5 : carried ? 0 : f.time * 0.8;
    this.coreMat.emissiveIntensity = (seated ? 6 : 3.5) + Math.sin(f.time * 6) * 0.6;
  }

  dispose(): void {
    this.p.dispose();
  }
}

export class EnergySocketVisual implements EntityVisual {
  readonly root = new THREE.Group();
  private readonly p = new Parts();
  private readonly ringMat: THREE.MeshStandardMaterial;
  private readonly spinner = new THREE.Group();
  private power = 0;

  constructor(ctx: EntityVisualContext) {
    const { lib } = ctx;
    const p = this.p;
    p.mesh(p.cyl(0.62, 0.7, 0.16, 40), lib.gunmetalDark, this.root, 0, 0.08, 0);
    p.mesh(p.torus(0.62, 0.035, 48), lib.brass, this.root, 0, 0.17, 0).rotation.x = Math.PI / 2;
    p.mesh(p.cyl(0.18, 0.26, 0.62, 24), lib.gunmetal, this.root, 0, 0.47, 0);
    p.mesh(p.cyl(0.3, 0.22, 0.12, 32), lib.brassPolished, this.root, 0, 0.82, 0);
    // cup: brass collar with prongs
    p.mesh(p.torus(0.26, 0.04, 40), lib.brass, this.root, 0, 0.9, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = p.mesh(p.rbox(0.06, 0.32, 0.1, 0.02), lib.gunmetal, this.root, Math.cos(a) * 0.27, 1.02, Math.sin(a) * 0.27);
      m.rotation.y = -a;
    }
    this.ringMat = p.mat(lib.emissiveUnique(PALETTE.coral, 1.2));
    p.mesh(p.torus(0.5, 0.02, 48), this.ringMat, this.root, 0, 0.19, 0, false).rotation.x = Math.PI / 2;
    this.root.add(this.spinner);
    this.spinner.position.y = 1.18;
    const arc = p.geo(new THREE.TorusGeometry(0.36, 0.015, 6, 24, Math.PI * 0.6));
    for (let i = 0; i < 3; i++) {
      const m = p.mesh(arc, this.ringMat, this.spinner, 0, 0, 0, false);
      m.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI * 2);
    }
  }

  update(f: EntityFrame): void {
    const e = f.e as EntityView<'energySocket'>;
    this.power = damp(this.power, e.state.powered ? 1 : 0, 6, f.dt);
    this.ringMat.emissive.set(PALETTE.coral).lerp(new THREE.Color(PALETTE.teal), this.power);
    this.ringMat.emissiveIntensity = 1.0 + this.power * 3 + Math.sin(f.time * 3) * 0.2;
    this.spinner.rotation.y = f.time * (0.3 + this.power * 2);
    this.spinner.visible = this.power > 0.05;
    this.spinner.scale.setScalar(0.6 + this.power * 0.4);
    this.root.position.copy(f.pos);
  }

  dispose(): void {
    this.p.dispose();
  }
}

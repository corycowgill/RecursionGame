import * as THREE from 'three';
import { PALETTE } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { createCloudMaterial, createShaftMaterial, createSkyMaterial } from '../shaders/fx';
import { archFrameGeometry, clockworkRing } from './kit';

/**
 * Monumental backdrop: the chamber floats inside a vast temporal facility.
 *  sky dome (teal haze horizon) · cloud sea far below · rings of distant towers with lit windows and spires ·
 *  colossal arcades behind the chamber · slowly rotating clockwork rings · walkway bridges ·
 *  volumetric-looking light shafts. Everything is fogged so depth layers read as atmospheric perspective.
 * Built once per level around the chamber centre; animated parts update via update(t).
 */
export interface Backdrop {
  group: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  const r = rng(99);
  for (let y = 6; y < 256; y += 10) {
    for (let x = 6; x < 128; x += 14) {
      const v = r();
      if (v < 0.42) continue;
      g.fillStyle = v > 0.9 ? '#ffb56a' : v > 0.7 ? '#58c8ff' : '#1d5a80';
      g.fillRect(x, y, 6, 5);
    }
  }
  // vertical light seams
  g.fillStyle = '#3fb8ff';
  g.fillRect(62, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildBackdrop(lib: MaterialLibrary, centre: THREE.Vector3, span: number, opts: { shafts: boolean; seed?: number }): Backdrop {
  const group = new THREE.Group();
  group.name = 'backdrop';
  const disposables: { dispose(): void }[] = [];
  const updaters: ((t: number) => void)[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const r = rng(opts.seed ?? 7);

  // Sky
  const skyMat = own(createSkyMaterial());
  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(900, 48, 24)), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.position.copy(centre);
  group.add(sky);
  updaters.push((t) => (skyMat.uniforms['uTime']!.value = t));

  // Cloud sea
  const cloudMat = own(createCloudMaterial(0x0f3550, 0x5aa6cf));
  const clouds = new THREE.Mesh(own(new THREE.PlaneGeometry(1400, 1400)), cloudMat);
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.set(centre.x, -55, centre.z);
  clouds.renderOrder = -5;
  group.add(clouds);
  const clouds2 = new THREE.Mesh(clouds.geometry, own(createCloudMaterial(0x16466a, 0x9fd6f0)));
  (clouds2.material as THREE.ShaderMaterial).uniforms['uOpacity']!.value = 0.45;
  clouds2.rotation.x = -Math.PI / 2;
  clouds2.position.set(centre.x, -32, centre.z);
  clouds2.renderOrder = -4;
  group.add(clouds2);
  updaters.push((t) => {
    cloudMat.uniforms['uTime']!.value = t;
    (clouds2.material as THREE.ShaderMaterial).uniforms['uTime']!.value = t * 1.6 + 40;
  });

  // Towers (instanced): body + tier + spire + glowing crown ring
  const winTex = own(windowTexture());
  const towerMat = own(
    new THREE.MeshStandardMaterial({ color: 0x1b2836, roughness: 0.7, metalness: 0.4, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 }),
  );
  const towerTrim = own(new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.9, emissive: 0x3a2008, emissiveIntensity: 0.6 }));
  const bodyGeo = own(new THREE.CylinderGeometry(0.42, 0.62, 1, 6, 1));
  bodyGeo.translate(0, 0.5, 0);
  const spireGeo = own(new THREE.ConeGeometry(0.7, 1, 4, 1));
  spireGeo.translate(0, 0.5, 0);
  spireGeo.rotateY(Math.PI / 4);
  const crownGeo = own(new THREE.TorusGeometry(0.75, 0.05, 6, 24));
  crownGeo.rotateX(Math.PI / 2);
  const N = 70;
  const bodies = new THREE.InstancedMesh(bodyGeo, towerMat, N * 2);
  const spires = new THREE.InstancedMesh(spireGeo, towerTrim, N);
  const crowns = new THREE.InstancedMesh(crownGeo, lib.emissive(PALETTE.cyan, 2.0), N);
  const o = new THREE.Object3D();
  let bi = 0;
  for (let i = 0; i < N; i++) {
    // denser behind (north = -z) and to the sides, never directly between camera (south) and chamber
    let a = r() * Math.PI * 2;
    const back = Math.sin(a) < 0.1; // -z hemisphere relative to centre (sin<0 -> z<0)
    if (!back && r() < 0.65) a = -a;
    const dist = span * 1.6 + 30 + r() * 190;
    const x = centre.x + Math.cos(a) * dist;
    const z = centre.z + Math.sin(a) * dist;
    const w = 4 + r() * 7;
    const h = 45 + r() * 110 + (dist > 140 ? 50 : 0);
    const baseY = -60;
    o.position.set(x, baseY, z);
    o.rotation.set(0, r() * Math.PI, 0);
    o.scale.set(w, h, w * (0.7 + r() * 0.6));
    o.updateMatrix();
    bodies.setMatrixAt(bi++, o.matrix);
    // set-back tier
    const tierH = h * (0.25 + r() * 0.25);
    o.position.set(x, baseY + h, z);
    o.scale.set(w * 0.62, tierH, w * 0.62);
    o.updateMatrix();
    bodies.setMatrixAt(bi++, o.matrix);
    o.position.set(x, baseY + h + tierH, z);
    o.scale.set(w * 0.5, w * (1.5 + r() * 3), w * 0.5);
    o.updateMatrix();
    spires.setMatrixAt(i, o.matrix);
    o.position.set(x, baseY + h + tierH * 0.6, z);
    o.scale.set(w * 0.62, 1, w * 0.62);
    o.updateMatrix();
    crowns.setMatrixAt(i, o.matrix);
  }
  for (const m of [bodies, spires, crowns]) {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  }

  // Colossal arcade behind the chamber
  const archGeo = own(archFrameGeometry(14, 34, 3));
  const arcadeMat = own(new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.6, metalness: 0.5 }));
  const archGlowGeo = own(new THREE.BoxGeometry(0.35, 22, 0.35));
  const archGlow = lib.emissive(PALETTE.cyan, 1.6);
  const arches = new THREE.InstancedMesh(archGeo, arcadeMat, 7);
  const archLights = new THREE.InstancedMesh(archGlowGeo, archGlow, 14);
  for (let i = 0; i < 7; i++) {
    const x = centre.x + (i - 3) * 19;
    const z = centre.z - span * 0.9 - 26 - Math.abs(i - 3) * 4;
    o.position.set(x, -14, z);
    o.rotation.set(0, (i - 3) * 0.06, 0);
    o.scale.setScalar(1);
    o.updateMatrix();
    arches.setMatrixAt(i, o.matrix);
    for (const s of [-1, 1]) {
      o.position.set(x + s * 7.6, -14 + 11, z + 3.2);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      archLights.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), o.matrix);
    }
  }
  arches.instanceMatrix.needsUpdate = true;
  archLights.instanceMatrix.needsUpdate = true;
  arches.computeBoundingSphere();
  archLights.computeBoundingSphere();
  group.add(arches, archLights);

  // Walkway bridges between towers (thin slabs with amber underlights)
  const bridgeGeo = own(new THREE.BoxGeometry(1, 0.8, 3));
  const bridges = new THREE.InstancedMesh(bridgeGeo, arcadeMat, 10);
  const bridgeLightGeo = own(new THREE.BoxGeometry(1, 0.12, 0.25));
  const bridgeLights = new THREE.InstancedMesh(bridgeLightGeo, lib.emissive(PALETTE.warmLamp, 2.4), 10);
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI * (0.15 + r() * 0.7);
    const dist = span + 40 + r() * 80;
    const len = 30 + r() * 60;
    o.position.set(centre.x + Math.cos(a) * dist, -6 + r() * 30, centre.z + Math.sin(a) * dist);
    o.rotation.set(0, a + Math.PI / 2 + (r() - 0.5) * 0.6, 0);
    o.scale.set(len, 1, 1);
    o.updateMatrix();
    bridges.setMatrixAt(i, o.matrix);
    o.position.y -= 0.5;
    o.updateMatrix();
    bridgeLights.setMatrixAt(i, o.matrix);
  }
  bridges.instanceMatrix.needsUpdate = true;
  bridgeLights.instanceMatrix.needsUpdate = true;
  bridges.computeBoundingSphere();
  bridgeLights.computeBoundingSphere();
  group.add(bridges, bridgeLights);

  // Giant clockwork rings
  const ringGeos: THREE.BufferGeometry[] = [];
  const rings: { g: THREE.Group; speed: number }[] = [];
  const ringSpecs = [
    { r: 22, pos: new THREE.Vector3(centre.x - 6, centre.y + 12, centre.z - span * 0.75 - 24), rotY: 0.12, speed: 0.03 },
    { r: 13, pos: new THREE.Vector3(centre.x + span * 0.9 + 18, centre.y + 6, centre.z - span * 0.4 - 12), rotY: -0.9, speed: -0.05 },
    { r: 36, pos: new THREE.Vector3(centre.x - span - 40, centre.y + 20, centre.z - span - 50), rotY: 0.7, speed: 0.018 },
  ];
  for (const sp of ringSpecs) {
    const g = clockworkRing(lib, sp.r, ringGeos, { teeth: 0.8, glow: 1.5 });
    g.position.copy(sp.pos);
    g.rotation.y = sp.rotY;
    group.add(g);
    rings.push({ g, speed: sp.speed });
  }
  // Horizontal halo ring encircling the chamber below the floor
  const halo = clockworkRing(lib, span * 0.62 + 4, ringGeos, { teeth: 0.3, glow: 0.9 });
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(centre.x, -9, centre.z);
  group.add(halo);
  rings.push({ g: halo, speed: 0.02 });
  for (const g of ringGeos) disposables.push(g);
  updaters.push((t) => {
    for (const rr of rings) {
      const outer = rr.g.children[0];
      const inner = rr.g.children[1];
      if (outer) outer.rotation.z = t * rr.speed;
      if (inner) inner.rotation.z = -t * rr.speed * 1.7;
    }
  });

  // Light shafts
  if (opts.shafts) {
    const shaftGeo = own(new THREE.CylinderGeometry(1, 3.2, 1, 24, 1, true));
    shaftGeo.translate(0, -0.5, 0);
    const specs = [
      { c: PALETTE.warmLight, s: 0.14, p: new THREE.Vector3(centre.x - span * 0.25, centre.y + 40, centre.z - span * 0.2), tilt: 0.35, rot: 0.6, len: 60, w: 2.6 },
      { c: PALETTE.warmLight, s: 0.1, p: new THREE.Vector3(centre.x + span * 0.2, centre.y + 40, centre.z - span * 0.45), tilt: 0.3, rot: 0.9, len: 58, w: 2.0 },
      { c: 0x7cc8ff, s: 0.11, p: new THREE.Vector3(centre.x + span * 0.7, centre.y + 50, centre.z - span * 0.9), tilt: 0.25, rot: -0.4, len: 90, w: 4.0 },
      { c: 0x7cc8ff, s: 0.09, p: new THREE.Vector3(centre.x - span * 0.9, centre.y + 50, centre.z - span * 0.6), tilt: 0.22, rot: 0.2, len: 90, w: 5.0 },
    ];
    for (const sp of specs) {
      const m = own(createShaftMaterial(sp.c, sp.s));
      const mesh = new THREE.Mesh(shaftGeo, m);
      mesh.position.copy(sp.p);
      mesh.rotation.set(sp.tilt, sp.rot, 0, 'YXZ');
      mesh.scale.set(sp.w, sp.len, sp.w);
      mesh.renderOrder = 5;
      group.add(mesh);
      updaters.push((t) => (m.uniforms['uTime']!.value = t));
    }
  }

  return {
    group,
    update(t) {
      for (const u of updaters) u(t);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

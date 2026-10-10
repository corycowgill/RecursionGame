import * as THREE from 'three';
import { PALETTE } from '../materials/palette';
import type { MaterialLibrary } from '../materials/library';
import { createCloudMaterial, createSkyMaterial } from '../shaders/fx';
import { AnimatedParts, ClockworkGeometry, addClockworkRing } from './animatedParts';
import { hazeMaterial, shaftMaterial } from './fxMaterials';
import { archFrameGeometry, archGateGeometry } from './shapes';

/**
 * Monumental backdrop: the chamber floats inside a vast temporal facility (concept: exterior + interior shots).
 *  sky dome (teal haze horizon) · cloud sea far below · three depth bands of towers with lit windows, set-back
 *  tiers, crown rings and needle spires · a far field of gothic spires on the horizon · two tiers of colossal
 *  arcades behind the chamber plus flanking flying arches · nine slowly rotating clockwork rings (upright
 *  gyroscopes, a halo under the chamber, a giant gate ring on the skyline) · walkway bridges · light shafts ·
 *  depth-haze curtains between the layers so distance reads as atmospheric perspective.
 * Built once per level around the chamber centre; animated parts update via update(t). Everything is
 * instanced: the whole backdrop is a fixed ~20 draw calls however many pieces it places.
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
  const N = 96;
  const FAR = 70; // far horizon spires (needles only, very tall, fogged to silhouettes)
  const bodies = new THREE.InstancedMesh(bodyGeo, towerMat, N * 2 + FAR);
  const spires = new THREE.InstancedMesh(spireGeo, towerTrim, N + FAR);
  const crowns = new THREE.InstancedMesh(crownGeo, lib.emissive(PALETTE.cyan, 2.0), N + 24);
  const o = new THREE.Object3D();
  let bi = 0;
  for (let i = 0; i < N; i++) {
    // denser behind (north = -z) and to the sides, never directly between camera (south) and chamber
    let a = r() * Math.PI * 2;
    const back = Math.sin(a) < 0.1; // -z hemisphere relative to centre (sin<0 -> z<0)
    if (!back && r() < 0.65) a = -a;
    // three depth bands: near (reads as architecture), mid, far (silhouettes in the haze)
    const band = i % 3;
    const dist = span * 1.6 + 30 + (band === 0 ? r() * 50 : band === 1 ? 60 + r() * 80 : 150 + r() * 110);
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
  // far horizon: needle spires on slim shafts behind the chamber, a few with glowing crowns (concept exterior)
  for (let i = 0; i < FAR; i++) {
    const a = -Math.PI * (0.02 + r() * 0.96);
    const dist = 330 + r() * 180;
    const x = centre.x + Math.cos(a) * dist;
    const z = centre.z + Math.sin(a) * dist;
    const w = 2 + r() * 5;
    const h = 90 + r() * 160;
    o.position.set(x, -60, z);
    o.rotation.set(0, r() * Math.PI, 0);
    o.scale.set(w, h, w);
    o.updateMatrix();
    bodies.setMatrixAt(bi++, o.matrix);
    o.position.set(x, -60 + h, z);
    o.scale.set(w * 0.7, w * (5 + r() * 9), w * 0.7);
    o.updateMatrix();
    spires.setMatrixAt(N + i, o.matrix);
    if (i < 24) {
      o.position.set(x, -60 + h * (0.6 + r() * 0.3), z);
      o.scale.set(w * 0.9, 1, w * 0.9);
      o.updateMatrix();
      crowns.setMatrixAt(N + i, o.matrix);
    }
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
  const NA = 7 + 9 + 8;
  const arches = new THREE.InstancedMesh(archGeo, arcadeMat, NA);
  const archLights = new THREE.InstancedMesh(archGlowGeo, archGlow, NA * 2);
  let ai = 0;
  const placeArch = (x: number, y: number, z: number, rotY: number, sc: number, lights: boolean) => {
    o.position.set(x, y, z);
    o.rotation.set(0, rotY, 0);
    o.scale.setScalar(sc);
    o.updateMatrix();
    arches.setMatrixAt(ai, o.matrix);
    for (const s of [-1, 1]) {
      const lx = s * 7.6 * sc;
      o.position.set(x + Math.cos(rotY) * lx + Math.sin(rotY) * 3.2 * sc, y + 11 * sc, z - Math.sin(rotY) * lx + Math.cos(rotY) * 3.2 * sc);
      o.rotation.set(0, rotY, 0);
      o.scale.set(sc, lights ? sc : 0.0001, sc);
      o.updateMatrix();
      archLights.setMatrixAt(ai * 2 + (s > 0 ? 1 : 0), o.matrix);
    }
    ai++;
  };
  // tier 1: the colonnade right behind the chamber
  for (let i = 0; i < 7; i++) placeArch(centre.x + (i - 3) * 19, -14, centre.z - span * 0.9 - 26 - Math.abs(i - 3) * 4, (i - 3) * 0.06, 1, true);
  // tier 2: a taller, deeper arcade rising above it (bigger, further, fogged)
  for (let i = 0; i < 9; i++) placeArch(centre.x + (i - 4) * 34, -40, centre.z - span * 1.3 - 95 - Math.abs(i - 4) * 9, (i - 4) * 0.08, 1.75, i % 2 === 0);
  // flanking arcades turning toward the camera on both sides (the chamber sits inside a vast hall)
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1;
    const k = i % 4;
    placeArch(centre.x + s * (span * 0.9 + 60 + k * 6), -24, centre.z - span * 0.4 - 10 + k * 24, s * (Math.PI / 2 - 0.25), 1.3, k % 2 === 1);
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

  // Flying arches: slim gateway spans leaping between the arcade piers and the tower field
  const flyGeo = own(archGateGeometry(9, 4, 1.4, 2.2));
  const flyers = new THREE.InstancedMesh(flyGeo, towerTrim, 6);
  for (let i = 0; i < 6; i++) {
    const s = i % 2 === 0 ? -1 : 1;
    o.position.set(centre.x + s * (30 + i * 14 + span * 0.5), -6 + i * 5, centre.z - span - 60 - i * 22);
    o.rotation.set(0, s * 0.35, 0);
    o.scale.setScalar(1 + i * 0.25);
    o.updateMatrix();
    flyers.setMatrixAt(i, o.matrix);
  }
  flyers.instanceMatrix.needsUpdate = true;
  flyers.computeBoundingSphere();
  group.add(flyers);

  // Clockwork rings — all instanced together (4 draw calls total)
  const parts = new AnimatedParts();
  const clock = new ClockworkGeometry();
  disposables.push(parts, clock);
  const at = (x: number, y: number, z: number, rx: number, ry: number) =>
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')).setPosition(x, y, z);
  const ringSpecs: { m: THREE.Matrix4; r: number; speed: number; teeth: number; glow: number; color?: number }[] = [
    { m: at(centre.x - 6, centre.y + 12, centre.z - span * 0.75 - 24, 0, 0.12), r: 22, speed: 0.03, teeth: 0.8, glow: 1.5 },
    // gyroscope partner crossing the first ring
    { m: at(centre.x - 6, centre.y + 12, centre.z - span * 0.75 - 24, 0, 1.25), r: 18, speed: -0.04, teeth: 0.6, glow: 1.3, color: PALETTE.gold },
    { m: at(centre.x + span * 0.9 + 18, centre.y + 6, centre.z - span * 0.4 - 12, 0, -0.9), r: 13, speed: -0.05, teeth: 0.8, glow: 1.5 },
    { m: at(centre.x - span - 40, centre.y + 20, centre.z - span - 50, 0, 0.7), r: 36, speed: 0.018, teeth: 0.8, glow: 1.5 },
    { m: at(centre.x - span - 40, centre.y + 20, centre.z - span - 50, 0.5, 0.7), r: 29, speed: -0.025, teeth: 0.6, glow: 1.2, color: PALETTE.violet },
    // the great gate ring on the skyline (concept exterior), half sunk into the cloud sea
    { m: at(centre.x + 40, centre.y - 10, centre.z - span * 1.6 - 190, 0, -0.15), r: 70, speed: 0.008, teeth: 0.7, glow: 1.4 },
    { m: at(centre.x + 40, centre.y - 10, centre.z - span * 1.6 - 190, 0, -0.15), r: 52, speed: -0.012, teeth: 0.5, glow: 1.0, color: PALETTE.gold },
    // horizontal halos encircling the chamber below the floor
    { m: at(centre.x, -9, centre.z, -Math.PI / 2, 0), r: span * 0.62 + 4, speed: 0.02, teeth: 0.3, glow: 0.9 },
    { m: at(centre.x, -20, centre.z, -Math.PI / 2, 0), r: span * 0.85 + 8, speed: -0.012, teeth: 0.3, glow: 0.8, color: PALETTE.gold },
  ];
  for (const sp of ringSpecs) addClockworkRing(parts, clock, lib, sp.m, sp.r, { teeth: sp.teeth, speed: sp.speed, glow: sp.glow, ...(sp.color !== undefined ? { color: sp.color } : {}) });
  group.add(parts.build('backdrop-rings'));
  updaters.push((t) => parts.update(t));

  // Depth haze: concentric fog curtains between the layers (one instanced draw call)
  const hazeGeo = own(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true));
  hazeGeo.translate(0, 0.5, 0);
  const hazeMat = own(hazeMaterial());
  const hazeSpecs = [
    { r: span * 1.6 + 70, y: -50, h: 70, c: 0x1f4a68, k: 1.0 },
    { r: span * 1.6 + 150, y: -60, h: 110, c: 0x2a5f80, k: 1.0 },
    { r: 300, y: -60, h: 150, c: 0x2f6a8c, k: 1.0 },
  ];
  const haze = new THREE.InstancedMesh(hazeGeo, hazeMat, hazeSpecs.length);
  hazeSpecs.forEach((h, i) => {
    o.position.set(centre.x, h.y, centre.z);
    o.rotation.set(0, 0, 0);
    o.scale.set(h.r, h.h, h.r);
    o.updateMatrix();
    haze.setMatrixAt(i, o.matrix);
    haze.setColorAt(i, new THREE.Color(h.c).multiplyScalar(h.k));
  });
  haze.instanceMatrix.needsUpdate = true;
  haze.computeBoundingSphere();
  haze.renderOrder = -3;
  haze.frustumCulled = false;
  group.add(haze);
  updaters.push((t) => (hazeMat.uniforms['uTime']!.value = t));

  // Light shafts (one instanced draw call; warm through the vault, cool from the sky)
  if (opts.shafts) {
    const shaftGeo = own(new THREE.CylinderGeometry(1, 3.2, 1, 24, 1, true));
    shaftGeo.translate(0, -0.5, 0);
    const specs = [
      { c: PALETTE.warmLight, s: 1.0, p: new THREE.Vector3(centre.x - span * 0.25, centre.y + 40, centre.z - span * 0.2), tilt: 0.35, rot: 0.6, len: 60, w: 2.6 },
      { c: PALETTE.warmLight, s: 0.75, p: new THREE.Vector3(centre.x + span * 0.2, centre.y + 40, centre.z - span * 0.45), tilt: 0.3, rot: 0.9, len: 58, w: 2.0 },
      { c: 0x7cc8ff, s: 0.8, p: new THREE.Vector3(centre.x + span * 0.7, centre.y + 50, centre.z - span * 0.9), tilt: 0.25, rot: -0.4, len: 90, w: 4.0 },
      { c: 0x7cc8ff, s: 0.65, p: new THREE.Vector3(centre.x - span * 0.9, centre.y + 50, centre.z - span * 0.6), tilt: 0.22, rot: 0.2, len: 90, w: 5.0 },
      // great shafts falling through the far arcade
      { c: 0x9fd8ff, s: 0.7, p: new THREE.Vector3(centre.x - 30, centre.y + 90, centre.z - span * 1.3 - 90), tilt: 0.3, rot: 0.5, len: 160, w: 9.0 },
      { c: PALETTE.warmLight, s: 0.55, p: new THREE.Vector3(centre.x + 55, centre.y + 90, centre.z - span * 1.3 - 110), tilt: 0.28, rot: 0.75, len: 170, w: 8.0 },
      { c: 0x9fd8ff, s: 0.5, p: new THREE.Vector3(centre.x + 110, centre.y + 80, centre.z - span - 60), tilt: 0.25, rot: -0.3, len: 150, w: 7.0 },
    ];
    const m = own(shaftMaterial(0.14));
    const shafts = new THREE.InstancedMesh(shaftGeo, m, specs.length);
    specs.forEach((sp, i) => {
      o.position.copy(sp.p);
      o.rotation.set(sp.tilt, sp.rot, 0, 'YXZ');
      o.scale.set(sp.w, sp.len, sp.w);
      o.updateMatrix();
      shafts.setMatrixAt(i, o.matrix);
      shafts.setColorAt(i, new THREE.Color(sp.c).multiplyScalar(sp.s));
    });
    shafts.instanceMatrix.needsUpdate = true;
    shafts.computeBoundingSphere();
    shafts.renderOrder = 5;
    group.add(shafts);
    updaters.push((t) => (m.uniforms['uTime']!.value = t));
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

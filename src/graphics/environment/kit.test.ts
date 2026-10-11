import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DecorDefinition, LevelDefinition } from '../../engine/contracts';
import { CAMPAIGN_LEVELS } from '../../levels/definitions';
import { MaterialLibrary } from '../materials/library';
import { buildBackdrop } from './backdrop';
import { buildKit } from './kit';

/**
 * Environment kit: builds for every chamber, renders every authored decor type, stays deterministic and within
 * its draw-call budget. Runs in node: the material library's canvas textures get an inert 2D context.
 */

function fakeCanvas(): unknown {
  const ctx = new Proxy(
    {},
    {
      get: (_t, k) => {
        if (k === 'getImageData' || k === 'createImageData')
          return (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h });
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set: () => true,
    },
  );
  return { width: 1, height: 1, style: {}, getContext: () => ctx };
}

const g = globalThis as { document?: unknown };
const hadDocument = 'document' in g;
let lib: MaterialLibrary;

beforeAll(() => {
  if (!hadDocument) g.document = { createElement: () => fakeCanvas() };
  lib = new MaterialLibrary();
});
afterAll(() => {
  if (!hadDocument) delete g.document;
});

function stats(root: THREE.Object3D) {
  let drawCalls = 0;
  let instances = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    drawCalls++;
    instances += (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
  });
  return { drawCalls, instances };
}

function matrices(root: THREE.Object3D): number[] {
  const out: number[] = [];
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh) return;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      out.push(...m.elements.map((x) => Math.round(x * 1e4)));
    }
  });
  return out;
}

const withDecor = (level: LevelDefinition, decor: DecorDefinition[]): LevelDefinition => ({ ...level, decor });

describe('environment kit', () => {
  it('builds every campaign chamber within the static draw-call budget', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const kit = buildKit(level, lib);
      const s = stats(kit.group);
      // one InstancedMesh per geometry/material pair: detail must not scale draw calls
      expect(s.drawCalls, level.id).toBeLessThanOrEqual(80);
      expect(s.instances, level.id).toBeGreaterThan(500);
      kit.dispose();
    }
  });

  it('keeps the backdrop to a fixed handful of instanced draw calls', () => {
    const b = buildBackdrop(lib, new THREE.Vector3(20, 0, 15), 40, { shafts: true, seed: 3 });
    expect(stats(b.group).drawCalls).toBeLessThanOrEqual(20);
    b.update(12.5);
    b.dispose();
  });

  it('renders every decor type the campaign authors (nothing silently ignored)', () => {
    const authored = new Map<string, { level: LevelDefinition; decor: DecorDefinition }>();
    for (const level of CAMPAIGN_LEVELS) for (const d of level.decor ?? []) if (!authored.has(d.type)) authored.set(d.type, { level, decor: d });
    expect([...authored.keys()].sort()).toEqual(['abyssLight', 'archway', 'banner', 'conduit', 'hologram', 'lamp', 'machinery', 'observationWindow', 'ring']);
    for (const [type, { level, decor }] of authored) {
      const bare = buildKit(withDecor(level, []), lib);
      const one = buildKit(withDecor(level, [decor]), lib);
      expect(stats(one.group).instances, type).toBeGreaterThan(stats(bare.group).instances);
      bare.dispose();
      one.dispose();
    }
  });

  it('renders every machinery variant in each mount (wall, abyss pylon, floor pit)', () => {
    const variants = ['gears', 'clockwork', 'pistons', 'winch', 'archive', 'optics', 'vault', 'recursionEngine', 'coreDynamo'];
    const level = CAMPAIGN_LEVELS[0]!;
    const bare = stats(buildKit(withDecor(level, []), lib).group).instances;
    // L01: (1,6) is an abyss cell beside the west wall, (5,3) open floor, (6,1) floor against the north wall
    for (const variant of variants)
      for (const [col, row, facing] of [
        [1, 6, 1],
        [5, 3, 2],
        [6, 1, 2],
      ] as const) {
        const kit = buildKit(withDecor(level, [{ type: 'machinery', col, row, facing, params: { variant } }]), lib);
        expect(stats(kit.group).instances, `${variant}@${col},${row}`).toBeGreaterThan(bare);
        kit.animated.forEach((a) => a.update(3.7));
        kit.dispose();
      }
  });

  it('is deterministic: identical placements on every build', () => {
    const level = CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1]!;
    const a = buildKit(level, lib);
    const b = buildKit(level, lib);
    expect(matrices(a.group)).toEqual(matrices(b.group));
    a.dispose();
    b.dispose();
  });
});

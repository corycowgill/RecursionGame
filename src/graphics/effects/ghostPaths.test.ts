import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GhostPath } from './forecast';
import { GhostPathLayer } from './ghostPaths';

const path = (echoIndex: number, n: number): GhostPath => ({
  actorId: `echo:${echoIndex + 1}`,
  echoIndex,
  points: Array.from({ length: n }, (_, i) => ({ tick: 100 + i * 6, x: 500 + i * 240, y: 0, z: 1500 })),
  markers: [1, 2, 3, 4].map((s) => ({ tick: 100 + s * 60, x: 500 + s * 2400, y: 0, z: 1500, seconds: s })),
});

describe('GhostPathLayer (Q-preview trails)', () => {
  const tex = () => new THREE.Texture();

  it('builds a ribbon, tick dots, even-second captions and an echo badge per path; clears on null', () => {
    const made: string[] = [];
    const layer = new GhostPathLayer(
      (t) => (made.push(`badge:${t}`), tex()),
      (t) => (made.push(`text:${t}`), tex()),
    );
    const paths = [path(0, 30), path(1, 10)];
    layer.setPaths(paths);
    expect(layer.pathCount).toBe(2);
    const meshes = layer.group.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    // 2 vertices per point, 2 triangles per segment
    expect(meshes[0]!.geometry.getAttribute('position').count).toBe(60);
    expect(meshes[0]!.geometry.getIndex()!.count).toBe(29 * 6);
    const ribbonX = meshes[0]!.geometry.getAttribute('position').getX(0);
    expect(ribbonX).toBeCloseTo(1, 1); // 500 units = 1 m
    expect(layer.group.children.filter((c) => c instanceof THREE.Points)).toHaveLength(2);
    expect(made).toEqual(expect.arrayContaining(['badge:1', 'badge:2', 'text:2s', 'text:4s']));
    expect(made).not.toContain('text:1s');
    layer.update(150, 1, 1);
    expect(layer.group.visible).toBe(true);
    // same array: no rebuild
    const before = layer.group.children[0];
    layer.setPaths(paths);
    expect(layer.group.children[0]).toBe(before);
    layer.setPaths(null);
    layer.update(150, 1, 1);
    expect(layer.pathCount).toBe(0);
    expect(layer.group.children).toHaveLength(0);
    expect(layer.group.visible).toBe(false);
    layer.dispose();
  });

  it('reduced motion freezes the dash flow', () => {
    const layer = new GhostPathLayer(tex, tex);
    layer.configure({ reducedMotion: true });
    layer.setPaths([path(0, 5)]);
    layer.update(100, 3, 0.1);
    const mesh = layer.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(mesh.material.uniforms['uFlow']!.value).toBe(0);
    layer.dispose();
  });
});

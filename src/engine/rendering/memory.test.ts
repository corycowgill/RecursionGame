import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { estimateTextureMemory, textureBytes } from './memory';

describe('texture memory estimate', () => {
  it('counts texel size, mips and float formats', () => {
    const t = new THREE.DataTexture(new Uint8Array(256 * 256 * 4), 256, 256);
    expect(textureBytes(t).bytes).toBe(256 * 256 * 4); // DataTexture: no mipmaps by default
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    expect(textureBytes(t).bytes).toBe(Math.round(256 * 256 * 4 * (4 / 3)));
    const h = new THREE.DataTexture(new Uint16Array(64 * 64 * 4), 64, 64, THREE.RGBAFormat, THREE.HalfFloatType);
    expect(textureBytes(h).bytes).toBe(64 * 64 * 8);
  });

  it('counts a texture shared by several materials once and adds render targets', () => {
    const t = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128);
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry();
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, normalMap: t })));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t })));
    scene.add(new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uTex: { value: t } } })));
    const m = estimateTextureMemory(scene, { shadowMaps: [512], composer: 1000 });
    expect(m.count).toBe(1);
    expect(m.textures).toBe(128 * 128 * 4);
    expect(m.renderTargets).toBe(512 * 512 * 4 + 1000);
    expect(m.total).toBe(m.textures + m.renderTargets);
    expect(m.largest.width).toBe(128);
  });
});

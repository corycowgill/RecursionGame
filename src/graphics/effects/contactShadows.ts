import * as THREE from 'three';

/**
 * Blob contact shadows: soft dark discs under actors and loose carriables, used by quality presets without a
 * shadow map (mobile). One instanced draw call for every blob, a 64² radial texture, no shadow pass.
 * Positions come from the already render-interpolated visuals, so this never reads or writes game state.
 */
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly tex: THREE.Texture;
  private count = 0;
  private readonly o = new THREE.Object3D();

  constructor(readonly capacity = 48) {
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.rotateX(-Math.PI / 2);
    this.tex = blobTexture(64);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: this.tex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: false,
      // above the floor decals, below characters / transparent effects
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, capacity);
    this.mesh.name = 'contact-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
  }

  /** Adds a blob at `pos` (world, the object's feet/base), `radius` metres; `strength` 0..1 scales its size. */
  add(pos: THREE.Vector3, radius: number, strength = 1): void {
    if (this.count >= this.capacity || strength <= 0.01) return;
    const r = radius * (0.6 + 0.4 * strength);
    this.o.position.set(pos.x, pos.y + 0.035, pos.z);
    this.o.scale.set(r * 2, 1, r * 2);
    this.o.updateMatrix();
    this.mesh.setMatrixAt(this.count++, this.o.matrix);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

/** Radial falloff in the green channel (alphaMap reads green): dense core, soft edge. */
function blobTexture(size: number): THREE.Texture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - d * d, 1.6);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(a * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

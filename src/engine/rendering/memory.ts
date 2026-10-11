import * as THREE from 'three';

/**
 * GPU texture-memory estimate for perf reports and the iOS memory budget. WebGL exposes no real numbers, so this
 * walks the scene's materials, counts each distinct texture once (width x height x bytes per texel, +1/3 for a
 * mip chain) and adds the renderer's own targets (shadow maps, post-processing chain) passed in by the caller.
 */
export interface TextureMemory {
  /** Material / environment textures (procedural maps, sprites, labels, PMREM). */
  textures: number;
  /** Shadow maps + post-processing render targets. */
  renderTargets: number;
  total: number;
  /** Distinct textures counted. */
  count: number;
  /** Largest single texture (bytes) and its size, to spot oversized canvas textures. */
  largest: { bytes: number; width: number; height: number; name: string };
}

const TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'displacementMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'specularMap',
  'transmissionMap',
  'thicknessMap',
  'sheenColorMap',
  'iridescenceMap',
] as const;

export function textureBytes(t: THREE.Texture): { bytes: number; width: number; height: number } {
  const img = (t.image ?? t.source?.data) as { width?: number; height?: number; videoWidth?: number } | null | undefined;
  const width = img?.width ?? img?.videoWidth ?? 0;
  const height = img?.height ?? 0;
  let bpp = 4;
  if (t.type === THREE.HalfFloatType) bpp = 8;
  else if (t.type === THREE.FloatType) bpp = 16;
  if (t.format === THREE.RedFormat) bpp /= 4;
  else if (t.format === THREE.RGFormat) bpp /= 2;
  const faces = (t as THREE.CubeTexture).isCubeTexture ? 6 : 1;
  const mips = t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1;
  return { bytes: Math.round(width * height * bpp * faces * mips), width, height };
}

/** Distinct textures referenced by materials in `root` (plus scene.environment / background textures). */
export function collectTextures(root: THREE.Object3D): Set<THREE.Texture> {
  const out = new Set<THREE.Texture>();
  const addTex = (v: unknown): void => {
    if (v && (v as THREE.Texture).isTexture) out.add(v as THREE.Texture);
  };
  const addMat = (m: THREE.Material): void => {
    const rec = m as unknown as Record<string, unknown>;
    for (const k of TEXTURE_KEYS) addTex(rec[k]);
    const uniforms = (m as THREE.ShaderMaterial).uniforms;
    if (uniforms) for (const u of Object.values(uniforms)) addTex(u?.value);
  };
  if ((root as THREE.Scene).isScene) {
    addTex((root as THREE.Scene).environment);
    addTex((root as THREE.Scene).background);
  }
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach(addMat);
    else if (m) addMat(m);
  });
  return out;
}

export function estimateTextureMemory(root: THREE.Object3D, extra: { shadowMaps?: readonly number[]; composer?: number } = {}): TextureMemory {
  let textures = 0;
  const largest = { bytes: 0, width: 0, height: 0, name: '' };
  const set = collectTextures(root);
  for (const t of set) {
    const b = textureBytes(t);
    textures += b.bytes;
    if (b.bytes > largest.bytes) Object.assign(largest, { ...b, name: t.name || t.constructor.name });
  }
  // depth-only shadow maps are stored as RGBA8-equivalent here (conservative; three packs depth into RGBA)
  const shadow = (extra.shadowMaps ?? []).reduce((n, s) => n + s * s * 4, 0);
  const renderTargets = shadow + (extra.composer ?? 0);
  return { textures, renderTargets, total: textures + renderTargets, count: set.size, largest };
}

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GradeShader } from '../../graphics/shaders/grade';
import type { QualitySettings } from './quality';

/**
 * Post chain (HDR half-float until OutputPass):
 *   RenderPass → UnrealBloom (high threshold: only emissives > ~1.0 linear bloom, so it reads as selective)
 *   → OutputPass (ACES Filmic + sRGB) → Grade (vignette, split-tone, temporal FX) → SMAA | FXAA
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private readonly output: OutputPass;
  private aa: SMAAPass | FXAAPass | null = null;
  private aaKind: QualitySettings['antialias'] = 'none';
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.0);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
  }

  apply(q: QualitySettings): void {
    this.bloom.enabled = q.bloom;
    this.bloom.strength = q.bloomStrength;
    if (q.antialias !== this.aaKind) {
      if (this.aa) {
        this.composer.removePass(this.aa);
        this.aa.dispose();
        this.aa = null;
      }
      if (q.antialias === 'smaa') this.aa = new SMAAPass();
      else if (q.antialias === 'fxaa') this.aa = new FXAAPass();
      if (this.aa) this.composer.addPass(this.aa);
      this.aaKind = q.antialias;
      this.setSize(this.width, this.height, this.pixelRatio);
    }
    this.bloomScale = q.bloomResolutionScale;
    this.setSize(this.width, this.height, this.pixelRatio);
  }

  private bloomScale = 0.5;

  setSize(w: number, h: number, pixelRatio: number): void {
    this.width = w;
    this.height = h;
    this.pixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    const bw = Math.max(1, Math.round(w * pixelRatio * this.bloomScale));
    const bh = Math.max(1, Math.round(h * pixelRatio * this.bloomScale));
    this.bloom.setSize(bw, bh);
    (this.grade.uniforms['uResolution']!.value as THREE.Vector2).set(w * pixelRatio, h * pixelRatio);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.aa?.dispose();
    this.bloom.dispose();
    this.output.dispose();
    this.grade.dispose();
    this.composer.dispose();
    void this.renderer;
  }
}

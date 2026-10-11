import * as THREE from 'three';
import type { ActorState } from '../engine/contracts';
import { createEnvironmentTexture } from '../engine/rendering/environmentMap';
import { PostFX } from '../engine/rendering/PostFX';
import { QUALITY_PRESETS, type QualityLevel } from '../engine/rendering/quality';
import { ActorVisual, CHARACTER_SCALE } from './animation/actorVisual';
import { MaterialLibrary } from './materials/library';
import { PALETTE, echoTint, playerTint, type EchoPaletteName } from './materials/palette';

/**
 * CHARACTER TURNTABLE (graphics-preview.html?turntable=1) — a studio view of one character from the FRONT
 * THREE-QUARTER angle, for character review and the final front-facing screenshot. The game camera only ever sees
 * characters from behind/above, so this is the one place the face and chest read.
 *
 *  ?turntable=1                 player, front three-quarter (35° to the character's left), idle
 *  ?actor=player|echo           which character (echo = hologram, Echo 1 badge)
 *  ?angle=<deg>                 camera azimuth from straight-on front (default 35; 0 = full front, 90 = profile)
 *  ?spin=1                      rotate continuously (turntable) instead of holding the angle
 *  ?look=camera|forward         head looks at the camera (default) or straight ahead
 *  ?palette=highContrast        echo palette (Settings → Echo colours)
 *  ?quality=…  ?t=<frames>      deterministic screenshot mode: render <frames> fixed 1/60 s frames, then
 *                               window.__PREVIEW__.ready = true (Playwright waits on it)
 *
 * Purely render-side: a fake idle ActorState drives the real ActorVisual / Character (same code as the game).
 */
export interface TurntableOptions {
  actor: 'player' | 'echo';
  angleDeg: number;
  spin: boolean;
  lookAtCamera: boolean;
  palette: EchoPaletteName;
  quality: QualityLevel;
  /** Fixed-step frame count for screenshots (null = live). */
  frames: number | null;
}

export function turntableOptions(params: URLSearchParams): TurntableOptions {
  const q = params.get('quality') as QualityLevel | null;
  const angle = Number(params.get('angle') ?? 35);
  return {
    actor: params.get('actor') === 'echo' ? 'echo' : 'player',
    angleDeg: Number.isFinite(angle) ? angle : 35,
    spin: params.get('spin') === '1',
    lookAtCamera: params.get('look') !== 'forward',
    palette: params.get('palette') === 'highContrast' ? 'highContrast' : 'default',
    quality: q && QUALITY_PRESETS[q] ? q : 'high',
    frames: params.has('t') ? Math.max(1, Number(params.get('t')) || 1) : null,
  };
}

/**
 * Camera position for a front three-quarter view. The character faces +z (heading 4 = south), so azimuth 0 is
 * straight in front; positive angles swing the camera toward +x (the character's left side).
 */
export function turntableCamera(angleDeg: number, distance = 5.8, height = 1.55): THREE.Vector3 {
  const a = (angleDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * distance, height, Math.cos(a) * distance);
}

function idleActor(kind: 'player' | 'echo'): ActorState {
  return {
    id: kind === 'player' ? 'player' : ('echo:1' as ActorState['id']),
    kind,
    echoIndex: kind === 'player' ? -1 : 0,
    loopId: kind === 'player' ? null : 1,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 2, // south (+z): toward the camera
    heading: 4,
    moving: false,
    carrying: null,
    strideUnits: 0,
    foot: 0,
    finished: false,
    divergedAtTick: null,
    divergenceCount: 0,
    lastInteraction: null,
    interactHeld: false,
  };
}

export function startTurntable(root: HTMLElement, opts: TurntableOptions, preview: { ready: boolean }): { dispose(): void } {
  const q = QUALITY_PRESETS[opts.quality];
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.FogExp2(0x0f2236, 0.09);
  const env = createEnvironmentTexture(renderer, q.envMapSize);
  scene.environment = env;
  scene.environmentIntensity = 0.65;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const target = new THREE.Vector3(0, 0.98 * CHARACTER_SCALE, 0);

  // studio lighting in the game's language: warm key from the front-left, cool rim behind, warm/cool hemisphere
  const hemi = new THREE.HemisphereLight(0x8ab4d8, 0x4a3420, 0.6);
  const key = new THREE.DirectionalLight(0xffcf9a, 3.4);
  key.position.set(3.5, 6, 5);
  key.castShadow = q.shadows;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
  const rim = new THREE.DirectionalLight(0x5fb6ff, 2.2);
  rim.position.set(-4, 4, -5);
  const fill = new THREE.DirectionalLight(0xbfd8ff, 0.6);
  fill.position.set(-5, 2, 4);
  scene.add(hemi, key, key.target, rim, fill);

  // pedestal: gunmetal drum with an emblem top and a brass rim
  const lib = new MaterialLibrary({ textureScale: q.textureScale });
  const owned: { dispose(): void }[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => (owned.push(g), g);
  const drum = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 64)), lib.gunmetalDark);
  drum.position.y = -0.15;
  const top = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.1, 1.1, 0.02, 64)), lib.floorEmblem);
  top.position.y = 0.0;
  const rimRing = new THREE.Mesh(geo(new THREE.TorusGeometry(1.18, 0.035, 10, 96)), lib.brassPolished);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 0.0;
  const glow = new THREE.Mesh(geo(new THREE.TorusGeometry(1.3, 0.012, 6, 96)), lib.emissive(opts.actor === 'player' ? playerTint(opts.palette) : echoTint(0, opts.palette), 2.2));
  glow.rotation.x = Math.PI / 2;
  glow.position.y = -0.02;
  const floor = new THREE.Mesh(geo(new THREE.CircleGeometry(30, 64)), lib.gunmetalDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.3;
  for (const m of [drum, top, rimRing, floor]) {
    m.receiveShadow = true;
    m.castShadow = m !== floor;
  }
  scene.add(drum, top, rimRing, glow, floor);

  const actor = idleActor(opts.actor);
  const visual = new ActorVisual(lib, actor, { trail: false, lod: q.characterLod, palette: opts.palette });
  visual.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  scene.add(visual.root);
  // skip the echo manifest dissolve and settle the idle pose before the first frame
  visual.update(1, actor, new THREE.Vector3(), false);

  const post = new PostFX(renderer, scene, camera);
  post.apply(q);
  const resize = (): void => {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    post.setSize(w, h, pr);
  };
  resize();
  window.addEventListener('resize', resize);

  const pos = new THREE.Vector3();
  let time = 0;
  const frame = (dt: number): void => {
    time += dt;
    const angle = opts.spin ? opts.angleDeg + time * 30 : opts.angleDeg;
    camera.position.copy(turntableCamera(angle));
    camera.lookAt(target);
    visual.setLookTarget(opts.lookAtCamera ? camera.position : null);
    visual.update(dt, actor, pos, false);
    post.grade.uniforms['uTime']!.value = time;
    post.render(dt);
  };

  let raf = 0;
  if (opts.frames !== null) {
    let n = 0;
    const total = opts.frames;
    const step = (): void => {
      frame(1 / 60);
      if (++n < total) raf = requestAnimationFrame(step);
      else preview.ready = true;
    };
    raf = requestAnimationFrame(step);
  } else {
    let last = performance.now();
    const step = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      frame(dt);
      preview.ready = true;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  return {
    dispose(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      visual.dispose();
      for (const o of owned) o.dispose();
      post.dispose();
      env.dispose();
      lib.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

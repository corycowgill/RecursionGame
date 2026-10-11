import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from './CameraRig';
import { comfortParams } from './comfort';

describe('comfortParams (settings → renderer motion knobs)', () => {
  it('defaults to full motion at sensitivity 1', () => {
    const p = comfortParams();
    expect(p).toMatchObject({ zoomRate: 1, followSmoothing: 1, lead: 1, shake: 1, introSwing: 1, distortion: 1, flash: 1, particles: 1, ambientMotion: true });
    expect(p.introDuration).toBeCloseTo(3.4);
  });

  it('camera sensitivity scales zoom rate and follow speed, clamped to the settings range', () => {
    expect(comfortParams({ cameraSensitivity: 2 }).zoomRate).toBe(2);
    expect(comfortParams({ cameraSensitivity: 2 }).followSmoothing).toBeLessThan(1);
    expect(comfortParams({ cameraSensitivity: 0.25 }).followSmoothing).toBeCloseTo(2);
    expect(comfortParams({ cameraSensitivity: 9 }).zoomRate).toBe(2);
    expect(comfortParams({ cameraSensitivity: Number.NaN }).zoomRate).toBe(1);
  });

  it('reduced motion removes shake and the intro orbit, damps distortion, flashes and particles', () => {
    const p = comfortParams({ reducedMotion: true });
    expect(p.shake).toBe(0);
    expect(p.introSwing).toBe(0);
    expect(p.introDuration).toBeLessThan(1.5);
    expect(p.distortion).toBeLessThan(0.5);
    expect(p.flash).toBeLessThan(1);
    expect(p.particles).toBeLessThan(1);
    expect(p.ambientMotion).toBe(false);
  });
});

describe('CameraRig comfort hooks', () => {
  const run = (rig: CameraRig, frames: number) => {
    for (let i = 0; i < frames; i++) rig.update(1 / 60, new THREE.Vector3(0, 0, 0), null);
  };

  it('shake displaces the camera and decays; zero shake scale ignores impulses', () => {
    const rig = new CameraRig(16 / 9);
    rig.setLevel(new THREE.Vector3(), 10, {});
    run(rig, 120);
    const rest = rig.camera.position.clone();
    rig.addShake(1);
    run(rig, 3);
    expect(rig.camera.position.distanceTo(rest)).toBeGreaterThan(1e-3);
    run(rig, 120);
    expect(rig.shakeLevel).toBe(0);
    expect(rig.camera.position.distanceTo(rest)).toBeLessThan(1e-3);

    rig.shakeScale = 0;
    rig.addShake(1);
    expect(rig.shakeLevel).toBe(0);
  });

  it('reduced-motion intro is short and does not orbit', () => {
    const rig = new CameraRig(16 / 9);
    rig.setLevel(new THREE.Vector3(), 10, {});
    rig.introSwing = 0;
    rig.setIntroDuration(1.1);
    rig.playIntro();
    const dir = new THREE.Vector3();
    rig.update(1 / 60, new THREE.Vector3(), null);
    rig.camera.getWorldDirection(dir);
    const yaw0 = Math.atan2(dir.x, dir.z);
    run(rig, 30);
    rig.camera.getWorldDirection(dir);
    expect(Math.abs(Math.atan2(dir.x, dir.z) - yaw0)).toBeLessThan(1e-3);
    run(rig, 40);
    expect(rig.mode).toBe('follow');
  });

  it('wheel zoom rate follows the sensitivity', () => {
    const el = { addEventListener: (_: string, f: (e: WheelEvent) => void) => (handler = f), removeEventListener: () => undefined } as unknown as HTMLElement;
    let handler: ((e: WheelEvent) => void) | null = null;
    const rig = new CameraRig(1);
    rig.attachWheel(el);
    handler!({ deltaY: 100 } as WheelEvent);
    const slow = rig.zoom;
    rig.zoom = 1;
    rig.zoomRate = 2;
    handler!({ deltaY: 100 } as WheelEvent);
    expect(Math.log(rig.zoom)).toBeCloseTo(2 * Math.log(slow), 5);
  });
});

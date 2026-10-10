import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { rotateStep } from '../input/InputSampler';
import { CameraRig, Damped } from './CameraRig';

describe('Damped (critically damped spring)', () => {
  it('converges without overshoot', () => {
    const d = new Damped(0, 0.3);
    let max = 0;
    for (let i = 0; i < 240; i++) max = Math.max(max, d.step(10, 1 / 60));
    expect(d.value).toBeCloseTo(10, 3);
    expect(max).toBeLessThanOrEqual(10 + 1e-6);
  });

  it('is frame-rate independent within tolerance', () => {
    const a = new Damped(0, 0.3);
    const b = new Damped(0, 0.3);
    for (let i = 0; i < 60; i++) a.step(5, 1 / 60);
    for (let i = 0; i < 30; i++) b.step(5, 1 / 30);
    expect(Math.abs(a.value - b.value)).toBeLessThan(0.05);
  });
});

describe('CameraRig', () => {
  /** Screen-up direction projected on the ground plane (unit x/z). */
  const screenUp = (rig: CameraRig) => {
    const dir = new THREE.Vector3();
    rig.camera.getWorldDirection(dir);
    dir.y = 0;
    return dir.normalize();
  };

  it('matches the input yaw convention: W (screen-up) maps to the world direction rotateStep produces', () => {
    for (const step of [0, 1, 2, 6]) {
      const rig = new CameraRig(16 / 9);
      rig.yawBias = 0;
      rig.setLevel(new THREE.Vector3(10, 0, 10), 12, { yawStep: step });
      rig.mode = 'overview';
      rig.update(1 / 60, null, null);
      const up = screenUp(rig);
      const [mx, mz] = rotateStep(0, -1, step);
      const expected = new THREE.Vector3(mx, 0, mz).normalize();
      expect(up.dot(expected)).toBeGreaterThan(0.99);
    }
  });

  it('follows a moving focus smoothly and the intro hands over to follow mode', () => {
    const rig = new CameraRig(16 / 9);
    rig.setLevel(new THREE.Vector3(0, 0, 0), 10, {});
    rig.playIntro();
    const focus = new THREE.Vector3(4, 0, 2);
    for (let i = 0; i < 60 * 5; i++) rig.update(1 / 60, focus, null);
    expect(rig.mode).toBe('follow');
    const target = new THREE.Vector3();
    rig.camera.getWorldDirection(target);
    expect(Number.isFinite(rig.camera.position.x)).toBe(true);
    expect(rig.camera.position.y).toBeGreaterThan(5);
  });
});

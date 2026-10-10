import { describe, expect, it } from 'vitest';
import { InputSampler, rotateStep } from './InputSampler';

describe('InputSampler', () => {
  it('latches presses between ticks: exactly one interactPressed per press', () => {
    const s = new InputSampler();
    s.setInteract(true);
    s.setInteract(false); // pressed and released between ticks
    const a = s.sample(0);
    expect(a.interactPressed).toBe(true);
    expect(a.interactHeld).toBe(true);
    const b = s.sample(1);
    expect(b.interactPressed).toBe(false);
    expect(b.interactHeld).toBe(false);
    s.setInteract(true);
    expect(s.sample(2).interactPressed).toBe(true);
    expect(s.sample(3)).toMatchObject({ interactPressed: false, interactHeld: true });
  });

  it('maps WASD to world axes and cancels opposite keys', () => {
    const s = new InputSampler();
    s.setDirection('up', true);
    expect(s.sample(0)).toMatchObject({ moveX: 0, moveY: -1 });
    s.setDirection('down', true);
    expect(s.sample(1)).toMatchObject({ moveX: 0, moveY: 0 });
    s.releaseAll();
    s.setDirection('right', true);
    s.yawStep = 2; // camera rotated 90° clockwise
    expect(s.sample(2)).toMatchObject({ moveX: 0, moveY: 1 });
  });

  it('rotateStep rotates by 45° steps', () => {
    expect(rotateStep(0, -1, 1)).toEqual([1, -1]);
    expect(rotateStep(0, -1, -1)).toEqual([-1, -1]);
    expect(rotateStep(1, 0, 8)).toEqual([1, 0]);
    expect(rotateStep(0, 0, 3)).toEqual([0, 0]);
  });
});

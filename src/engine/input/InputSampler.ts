import type { PlayerInput } from '../contracts';

/** Which device a held state comes from (keyboard and gamepad are tracked separately, then combined). */
export type InputSource = 'key' | 'pad' | 'touch';

/**
 * InputSampler — converts asynchronous key / controller state into one PlayerInput per simulation tick.
 * Presses are LATCHED: a key or button pressed and released between two ticks still produces exactly one
 * interactPressed/actionPressed on the next sampled tick. Pure logic (no DOM) so it is unit-testable.
 *
 * Sources: the keyboard sets held directions (setDirection) and the gamepad sets an already-quantized screen
 * direction (setPadMove). A non-zero keyboard direction wins; otherwise the pad's is used. Interact is held while
 * either source holds it, and each source's press latches independently. Both go through the same camera-yaw
 * rotation, so every device yields the same PlayerInput (moveX/moveY in {-1,0,1}).
 * Touch (round 3, additive): the on-screen joystick sets a quantized screen direction (setTouchMove) used when neither
 * the keyboard nor the pad is steering; the on-screen Interact button latches like a key (setInteract(…, 'touch')).
 */
export class InputSampler {
  private dirs = { left: false, right: false, up: false, down: false };
  private padMove: [-1 | 0 | 1, -1 | 0 | 1] = [0, 0];
  private interactDown = false;
  private padInteractDown = false;
  private touchMove: [-1 | 0 | 1, -1 | 0 | 1] = [0, 0];
  private touchInteractDown = false;
  private interactLatched = false;
  private actionLatched = false;
  /** Camera yaw in 45° steps; rotates WASD into world axes so "W" is screen-up. */
  yawStep = 0;

  setDirection(dir: 'left' | 'right' | 'up' | 'down', down: boolean): void {
    this.dirs[dir] = down;
  }

  /** Gamepad direction in SCREEN axes (y < 0 = up), already quantized to -1/0/1. */
  setPadMove(x: number, y: number): void {
    const q = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);
    this.padMove = [q(x), q(y)];
  }

  /** On-screen joystick direction in SCREEN axes (y < 0 = up), already quantized to -1/0/1. */
  setTouchMove(x: number, y: number): void {
    const q = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);
    this.touchMove = [q(x), q(y)];
  }

  setInteract(down: boolean, source: InputSource = 'key'): void {
    if (source === 'touch') {
      if (down && !this.touchInteractDown) this.interactLatched = true;
      this.touchInteractDown = down;
      return;
    }
    if (source === 'pad') {
      if (down && !this.padInteractDown) this.interactLatched = true;
      this.padInteractDown = down;
      return;
    }
    if (down && !this.interactDown) this.interactLatched = true;
    this.interactDown = down;
  }

  pressAction(): void {
    this.actionLatched = true;
  }

  /** Clears all held state (e.g. on window blur) so no key gets stuck. */
  releaseAll(): void {
    this.dirs = { left: false, right: false, up: false, down: false };
    this.interactDown = false;
    this.padMove = [0, 0];
    this.padInteractDown = false;
    this.touchMove = [0, 0];
    this.touchInteractDown = false;
  }

  /** Produces the input for `tick` and consumes latched presses. */
  sample(tick: number): PlayerInput {
    let sx = (this.dirs.right ? 1 : 0) - (this.dirs.left ? 1 : 0);
    let sy = (this.dirs.down ? 1 : 0) - (this.dirs.up ? 1 : 0);
    if (sx === 0 && sy === 0) [sx, sy] = this.padMove;
    if (sx === 0 && sy === 0) [sx, sy] = this.touchMove;
    const held = this.interactDown || this.padInteractDown || this.touchInteractDown;
    const [mx, my] = rotateStep(sx, sy, this.yawStep);
    const input: PlayerInput = {
      tick,
      moveX: mx,
      moveY: my,
      interactPressed: this.interactLatched,
      interactHeld: held || this.interactLatched,
      actionPressed: this.actionLatched,
    };
    this.interactLatched = false;
    this.actionLatched = false;
    return input;
  }
}

const RING: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** Rotates a quantized direction by `step` * 45° clockwise (as seen from above). Integer-only. */
export function rotateStep(x: number, y: number, step: number): [-1 | 0 | 1, -1 | 0 | 1] {
  if (x === 0 && y === 0) return [0, 0];
  const idx = RING.findIndex(([rx, ry]) => rx === x && ry === y);
  const s = ((step % 8) + 8) % 8;
  const r = RING[(idx + s) % 8] ?? [0, 0];
  return [r[0] as -1 | 0 | 1, r[1] as -1 | 0 | 1];
}

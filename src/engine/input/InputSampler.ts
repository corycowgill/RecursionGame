import type { PlayerInput } from '../contracts';

/**
 * InputSampler — converts asynchronous key state into one PlayerInput per simulation tick.
 * Presses are LATCHED: a key pressed and released between two ticks still produces exactly one
 * interactPressed/actionPressed on the next sampled tick. Pure logic (no DOM) so it is unit-testable.
 */
export class InputSampler {
  private dirs = { left: false, right: false, up: false, down: false };
  private interactDown = false;
  private interactLatched = false;
  private actionLatched = false;
  /** Camera yaw in 45° steps; rotates WASD into world axes so "W" is screen-up. */
  yawStep = 0;

  setDirection(dir: 'left' | 'right' | 'up' | 'down', down: boolean): void {
    this.dirs[dir] = down;
  }

  setInteract(down: boolean): void {
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
  }

  /** Produces the input for `tick` and consumes latched presses. */
  sample(tick: number): PlayerInput {
    const sx = (this.dirs.right ? 1 : 0) - (this.dirs.left ? 1 : 0);
    const sy = (this.dirs.down ? 1 : 0) - (this.dirs.up ? 1 : 0);
    const [mx, my] = rotateStep(sx, sy, this.yawStep);
    const input: PlayerInput = {
      tick,
      moveX: mx,
      moveY: my,
      interactPressed: this.interactLatched,
      interactHeld: this.interactDown || this.interactLatched,
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

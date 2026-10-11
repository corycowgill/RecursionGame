import { quantizeStick, type Quantized } from '../../engine/input/gamepadMapping';

/**
 * FLOATING VIRTUAL JOYSTICK — pure maths (no DOM, unit-tested).
 *
 * The base appears where the thumb lands; dragging away from it deflects the knob up to `radius` CSS px. If the
 * thumb keeps going past the rim the base is dragged along behind it, so reversing direction is instant (no dead
 * travel back to the original touch point). The deflection goes through the SAME radial deadzone + 8-direction
 * quantization as a gamepad stick (`quantizeStick`), so touch produces exactly the -1/0/1 screen direction a
 * keyboard or controller produces; the InputSampler then rotates it by the camera yaw like every other device.
 */

/** Knob travel in CSS px (deflection 1.0 at the rim). */
export const JOYSTICK_RADIUS = 52;
/** Deadzone as a fraction of the radius (a little smaller than a pad's: thumbs on glass are precise but drift). */
export const JOYSTICK_DEADZONE = 0.28;

export interface JoystickState {
  /** Base centre (client px). */
  ox: number;
  oy: number;
  /** Knob offset from the base, clamped to the radius (px). */
  kx: number;
  ky: number;
  /** Normalised deflection, length <= 1, screen axes (y down). */
  nx: number;
  ny: number;
  /** Quantized screen direction fed to the sampler. */
  dir: [Quantized, Quantized];
}

export function createJoystick(x: number, y: number): JoystickState {
  return { ox: x, oy: y, kx: 0, ky: 0, nx: 0, ny: 0, dir: [0, 0] };
}

/**
 * Moves the thumb to (x, y). Returns a new state; the base follows the thumb once it passes the rim. The previous
 * direction provides hysteresis so a thumb resting on the deadzone edge does not flicker.
 */
export function moveJoystick(s: JoystickState, x: number, y: number, radius = JOYSTICK_RADIUS, deadzone = JOYSTICK_DEADZONE): JoystickState {
  let ox = s.ox;
  let oy = s.oy;
  let dx = x - ox;
  let dy = y - oy;
  const len = Math.hypot(dx, dy);
  if (len > radius && len > 0) {
    // Drag the base along so the knob sits exactly on the rim.
    const pull = (len - radius) / len;
    ox += dx * pull;
    oy += dy * pull;
    dx = x - ox;
    dy = y - oy;
  }
  const nx = radius > 0 ? dx / radius : 0;
  const ny = radius > 0 ? dy / radius : 0;
  const wasActive = s.dir[0] !== 0 || s.dir[1] !== 0;
  return { ox, oy, kx: dx, ky: dy, nx, ny, dir: quantizeStick(nx, ny, deadzone, wasActive) };
}

/** Screen direction for a raw drag vector (convenience for tests and one-shot use). */
export function joystickDirection(dx: number, dy: number, radius = JOYSTICK_RADIUS, deadzone = JOYSTICK_DEADZONE): [Quantized, Quantized] {
  return moveJoystick(createJoystick(0, 0), dx, dy, radius, deadzone).dir;
}

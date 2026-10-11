import type { Quantized } from '../../engine/input/gamepadMapping';
import { createJoystick, moveJoystick, type JoystickState } from './joystick';

/**
 * TOUCH GESTURES — pure pointer bookkeeping for every touch that does not start on an on-screen button
 * (unit-tested; the DOM layer just forwards Pointer Events here).
 *
 *   - one finger on the left part of the screen → floating joystick (multi-touch: buttons on the right keep working)
 *   - two fingers together (the second within a moment of the first, before the stick has moved) → pinch zoom
 *   - two fingers tapped and lifted quickly without moving → puzzle overview toggle
 *   - a lone finger elsewhere does nothing (no accidental camera moves)
 */

export type GestureEvent =
  | { type: 'stickStart'; stick: JoystickState }
  | { type: 'stickMove'; stick: JoystickState; changed: boolean }
  | { type: 'stickEnd' }
  | { type: 'zoom'; deltaY: number }
  | { type: 'twoFingerTap' };

export interface GestureOptions {
  /** Fraction of the layer width (from the left) where a touch starts the joystick. */
  stickZone: number;
  /** A second finger within this many ms of the first (stick not yet deflected) makes a two-finger gesture. */
  pairWindowMs: number;
  /** Two-finger tap: both fingers up within this many ms, each moving less than `tapSlop` px. */
  tapMs: number;
  tapSlop: number;
  /** Pinch distance change (px) before zooming starts, so a two-finger tap never nudges the camera. */
  pinchSlop: number;
  /** Wheel-equivalent units per unit of ln(scale): the camera zooms by exp(deltaY * 0.0012), so 1/0.0012 is 1:1. */
  zoomGain: number;
}

export const DEFAULT_GESTURES: GestureOptions = { stickZone: 0.5, pairWindowMs: 240, tapMs: 340, tapSlop: 18, pinchSlop: 10, zoomGain: 1 / 0.0012 };

type Role = 'stick' | 'camera' | 'pinch' | 'inert';

interface Touch {
  id: number;
  role: Role;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
}

export class GestureTracker {
  private readonly touches = new Map<number, Touch>();
  private stick: JoystickState | null = null;
  private stickId: number | null = null;
  private pinch: { a: number; b: number; d0: number; last: number; t0: number; zooming: boolean; maxMove: number; up: number } | null = null;
  readonly opts: GestureOptions;

  constructor(opts: Partial<GestureOptions> = {}) {
    this.opts = { ...DEFAULT_GESTURES, ...opts };
  }

  get stickActive(): boolean {
    return this.stickId !== null;
  }

  get activeCount(): number {
    return this.touches.size;
  }

  /** A finger landed on free space. `width` = layer width (the joystick zone is its left part). */
  down(id: number, x: number, y: number, t: number, width: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    const live = [...this.touches.values()].filter((c) => c.role !== 'inert');
    const touch: Touch = { id, role: 'camera', x, y, sx: x, sy: y, t };
    if (live.length === 0) {
      if (x < width * this.opts.stickZone) {
        touch.role = 'stick';
        this.stickId = id;
        this.stick = createJoystick(x, y);
        out.push({ type: 'stickStart', stick: this.stick });
      }
    } else if (live.length === 1 && !this.pinch) {
      const first = live[0] as Touch;
      const stickEstablished = first.role === 'stick' && (t - first.t > this.opts.pairWindowMs || (this.stick !== null && (this.stick.dir[0] !== 0 || this.stick.dir[1] !== 0)));
      if (stickEstablished) touch.role = 'inert';
      else {
        if (first.role === 'stick') {
          this.endStick();
          out.push({ type: 'stickEnd' });
        }
        first.role = 'pinch';
        touch.role = 'pinch';
        const d = Math.hypot(x - first.x, y - first.y);
        this.pinch = { a: first.id, b: id, d0: d, last: d, t0: Math.min(first.t, t), zooming: false, maxMove: Math.hypot(first.x - first.sx, first.y - first.sy), up: 0 };
      }
    } else touch.role = 'inert';
    this.touches.set(id, touch);
    return out;
  }

  move(id: number, x: number, y: number): GestureEvent[] {
    const c = this.touches.get(id);
    if (!c) return [];
    c.x = x;
    c.y = y;
    if (c.role === 'stick' && this.stick) {
      const prev = this.stick.dir;
      this.stick = moveJoystick(this.stick, x, y);
      const changed = prev[0] !== this.stick.dir[0] || prev[1] !== this.stick.dir[1];
      return [{ type: 'stickMove', stick: this.stick, changed }];
    }
    if (c.role === 'pinch' && this.pinch) {
      const p = this.pinch;
      p.maxMove = Math.max(p.maxMove, Math.hypot(x - c.sx, y - c.sy));
      const a = this.touches.get(p.a);
      const b = this.touches.get(p.b);
      if (!a || !b || p.up > 0) return [];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      if (!p.zooming && Math.abs(d - p.d0) < this.opts.pinchSlop) return [];
      p.zooming = true;
      const deltaY = -Math.log(d / Math.max(1, p.last)) * this.opts.zoomGain;
      p.last = d;
      return deltaY !== 0 ? [{ type: 'zoom', deltaY }] : [];
    }
    return [];
  }

  up(id: number, t: number): GestureEvent[] {
    const c = this.touches.get(id);
    if (!c) return [];
    this.touches.delete(id);
    if (c.role === 'stick') {
      this.endStick();
      return [{ type: 'stickEnd' }];
    }
    if (c.role === 'pinch' && this.pinch) {
      const p = this.pinch;
      p.up++;
      if (p.up < 2) {
        // The other finger stays down but no longer does anything until it lifts.
        return [];
      }
      this.pinch = null;
      if (!p.zooming && p.maxMove < this.opts.tapSlop && t - p.t0 <= this.opts.tapMs) return [{ type: 'twoFingerTap' }];
    }
    return [];
  }

  /** Pointer cancelled (system gesture, controls hidden): same as lifting, but never counts as a tap. */
  cancel(id: number): GestureEvent[] {
    const c = this.touches.get(id);
    if (!c) return [];
    if (c.role === 'pinch' && this.pinch) this.pinch.zooming = true; // poison the tap
    return this.up(id, Number.POSITIVE_INFINITY);
  }

  /** Drops every tracked touch (controls hidden, page backgrounded). */
  reset(): GestureEvent[] {
    const hadStick = this.stickId !== null;
    this.touches.clear();
    this.pinch = null;
    this.endStick();
    return hadStick ? [{ type: 'stickEnd' }] : [];
  }

  /** Current joystick direction (screen axes), [0,0] when idle. */
  get direction(): [Quantized, Quantized] {
    return this.stick ? this.stick.dir : [0, 0];
  }

  private endStick(): void {
    this.stickId = null;
    this.stick = null;
  }
}

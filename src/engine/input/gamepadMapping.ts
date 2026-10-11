/**
 * GAMEPAD MAPPING — pure, DOM-free logic for controller input (unit-tested, never imported by simulation code).
 *
 * Everything here works on the W3C "standard" Gamepad mapping (Xbox, PlayStation, Switch Pro over USB/Bluetooth in
 * Chromium, Firefox and Safari, including Safari on iOS). The output of the stick logic is always quantized to
 * {-1, 0, 1} on each axis, so a controller produces exactly the same PlayerInput a keyboard can produce: recordings
 * stay exact and deterministic whatever the device.
 */

/** Standard-mapping button indices. */
export const PAD = {
  A: 0, // bottom face button (Xbox A, PlayStation Cross, Switch B)
  B: 1, // right face button (Xbox B, PlayStation Circle, Switch A)
  X: 2, // left face button (Xbox X, PlayStation Square, Switch Y)
  Y: 3, // top face button (Xbox Y, PlayStation Triangle, Switch X)
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8, // View / Share / Create / Minus
  MENU: 9, // Menu / Options / Plus
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  HOME: 16,
} as const;

/** Number of buttons the standard mapping defines (17) plus the touchpad click some pads report as 17. */
export const PAD_BUTTON_COUNT = 18;

/** Default radial deadzone for the sticks (fraction of full deflection). */
export const STICK_DEADZONE = 0.35;
/** Analog triggers count as pressed above this value. */
export const TRIGGER_THRESHOLD = 0.5;

export type Quantized = -1 | 0 | 1;

/**
 * Radial deadzone + 8-direction quantization. Inside the deadzone (by vector length, not per axis, so diagonals
 * are not favoured) the result is [0, 0]; outside, the angle is snapped to the nearest of 8 directions (45° sectors
 * centred on the axes and diagonals). `wasActive` adds hysteresis so a stick resting on the deadzone edge does not
 * flicker between moving and idle. Screen convention: y < 0 is up.
 */
export function quantizeStick(x: number, y: number, deadzone = STICK_DEADZONE, wasActive = false): [Quantized, Quantized] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0];
  const mag = Math.hypot(x, y);
  const threshold = wasActive ? deadzone * 0.8 : deadzone;
  if (mag < threshold || mag === 0) return [0, 0];
  const sector = ((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8; // 0 = east, 2 = south (y down)
  return SECTORS[sector] as [Quantized, Quantized];
}

const SECTORS: readonly (readonly [Quantized, Quantized])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** D-pad buttons to a quantized direction (opposites cancel). */
export function dpadDirection(up: boolean, down: boolean, left: boolean, right: boolean): [Quantized, Quantized] {
  return [((right ? 1 : 0) - (left ? 1 : 0)) as Quantized, ((down ? 1 : 0) - (up ? 1 : 0)) as Quantized];
}

/** Dominant 4-way direction (menus): the larger axis wins, ties prefer vertical. Null inside the threshold. */
export function dominantDirection(x: number, y: number, threshold = 0.5): 'up' | 'down' | 'left' | 'right' | null {
  if (Math.hypot(x, y) < threshold) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

// ---------------------------------------------------------------------------------------------------------- holds

/** Hold-to-confirm timer (hold X ~0.6 s to restart the chamber). Fires exactly once per hold. */
export class HoldTracker {
  private heldMs = 0;
  private fired = false;
  constructor(readonly durationMs = 600) {}

  /** Advances by `dtMs` with the button state; returns true on the frame the hold completes. */
  update(down: boolean, dtMs: number): boolean {
    if (!down) {
      this.heldMs = 0;
      this.fired = false;
      return false;
    }
    if (this.fired) return false;
    this.heldMs += Math.max(0, Math.min(dtMs, 250));
    if (this.heldMs >= this.durationMs) {
      this.fired = true;
      return true;
    }
    return false;
  }

  /** 0..1 fill for the on-screen indicator (0 once fired, so the ring disappears after the restart). */
  get progress(): number {
    return this.fired ? 0 : Math.min(1, this.heldMs / this.durationMs);
  }

  reset(): void {
    this.heldMs = 0;
    this.fired = false;
  }
}

/**
 * Auto-repeat for held directions in menus and the timeline: fires on press, then after `delayMs`, then every
 * `intervalMs`, speeding up to `fastMs` once held for `accelAfterMs` (hold to accelerate).
 */
export class RepeatTimer {
  private heldMs = 0;
  private nextAt = 0;
  constructor(
    readonly delayMs = 380,
    readonly intervalMs = 130,
    readonly fastMs = 55,
    readonly accelAfterMs = 1200,
  ) {}

  /** Returns true when a (repeat) step should fire this frame. */
  update(down: boolean, dtMs: number): boolean {
    if (!down) {
      this.heldMs = 0;
      this.nextAt = 0;
      return false;
    }
    const first = this.heldMs === 0 && this.nextAt === 0;
    this.heldMs += Math.max(0, Math.min(dtMs, 250));
    if (first) {
      this.nextAt = this.delayMs;
      return true;
    }
    if (this.heldMs >= this.nextAt) {
      this.nextAt = this.heldMs + (this.heldMs >= this.accelAfterMs ? this.fastMs : this.intervalMs);
      return true;
    }
    return false;
  }

  get held(): number {
    return this.heldMs;
  }
}

// ---------------------------------------------------------------------------------------------- controller styles

/** Glyph family for button prompts. */
export type PadStyle = 'xbox' | 'playstation' | 'nintendo';

/** Guesses the glyph family from Gamepad.id (vendor ids and product names across Chrome, Firefox and Safari). */
export function padStyleFromId(id: string): PadStyle {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  if (/054c|playstation|dualshock|dualsense|ps[345]\b|wireless controller/.test(s)) return 'playstation';
  if (/057e|nintendo|switch|pro controller|joy-?con/.test(s)) return 'nintendo';
  return 'xbox';
}

const LABELS: Record<PadStyle, Record<number, string>> = {
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'LS', 11: 'RS', 12: '↑', 13: '↓', 14: '←', 15: '→', 16: 'Home', 17: 'Pad' },
  playstation: { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Share', 9: 'Options', 10: 'L3', 11: 'R3', 12: '↑', 13: '↓', 14: '←', 15: '→', 16: 'PS', 17: 'Pad' },
  nintendo: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 10: 'LS', 11: 'RS', 12: '↑', 13: '↓', 14: '←', 15: '→', 16: 'Home', 17: 'Pad' },
};

/** Human label of a standard-mapping button for a controller family. */
export function padButtonLabel(index: number, style: PadStyle = 'xbox'): string {
  return LABELS[style][index] ?? `B${index}`;
}

/** Spoken/accessible name ("Cross", "A button"). */
export function padButtonName(index: number, style: PadStyle = 'xbox'): string {
  if (style === 'playstation') {
    const n: Record<number, string> = { 0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle' };
    if (n[index]) return n[index];
  }
  return padButtonLabel(index, style);
}

/** Face button colour role (for the round prompt caps): 'a' bottom, 'b' right, 'x' left, 'y' top, or null. */
export function faceRole(index: number): 'a' | 'b' | 'x' | 'y' | null {
  return index === 0 ? 'a' : index === 1 ? 'b' : index === 2 ? 'x' : index === 3 ? 'y' : null;
}

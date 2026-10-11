import type { GameCommand } from '../contracts';
import { defaultPadBindings, type PadBindings } from './gamepadBindings';
import {
  HoldTracker,
  PAD,
  PAD_BUTTON_COUNT,
  RepeatTimer,
  STICK_DEADZONE,
  TRIGGER_THRESHOLD,
  dominantDirection,
  dpadDirection,
  padStyleFromId,
  quantizeStick,
  type PadStyle,
} from './gamepadMapping';
import type { InputSampler } from './InputSampler';

/**
 * Browser gamepad binding (Gamepad API, standard mapping; DOM-only, never imported by simulation code).
 *
 *   gameplay mode   left stick / D-pad  move (radial deadzone, 8 directions, -1/0/1)   A/Cross  interact
 *                   B/Circle  context action     Y/Triangle  new echo (rewind)         hold X/Square 0.6 s  restart
 *                   View/Share  timeline         Menu/Options  pause                   LB/RB  cycle echo selection
 *                   LT/L2 (hold)  temporal preview                                     right stick  camera zoom
 *   ui mode         stick / D-pad navigate (auto-repeat, accelerating)   A confirm   B back   Menu pause/resume
 *
 * Movement and interact feed the SAME InputSampler as the keyboard (latched presses, sampled once per tick), so a
 * controller produces exactly the PlayerInput stream a keyboard could. Meta buttons become GameCommands; UI-only
 * actions (echo cycling, zoom, navigation, hold progress, hot-plug) are reported as PadEvents.
 *
 * The Gamepad API has no button events: `poll(dtMs)` must be called once per animation frame.
 */

export type PadMode = 'gameplay' | 'ui' | 'off';
export type NavDir = 'up' | 'down' | 'left' | 'right';
/** Positional face/shoulder names used for menu semantics (fixed, independent of the remappable bindings). */
export type PadButtonName = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'view' | 'menu' | 'ls' | 'rs' | 'home';

export type PadEvent =
  /** A controller was plugged in / paired, or removed. */
  | { type: 'connected'; index: number; id: string; style: PadStyle }
  | { type: 'disconnected'; index: number; id: string; style: PadStyle; remaining: number }
  /** Any deliberate input on a pad (glyph switching to the last-used device). */
  | { type: 'activity'; style: PadStyle }
  /** UI navigation step (press or auto-repeat); `heldMs` lets the timeline accelerate scrubbing. */
  | { type: 'nav'; dir: NavDir; repeat: boolean; heldMs: number }
  /** A button press in ui mode (`index` = raw standard index, for remapping capture). */
  | { type: 'button'; button: PadButtonName | null; index: number }
  /** LB/RB (or their remaps) in gameplay: select the previous / next echo. */
  | { type: 'cycleEcho'; dir: -1 | 1 }
  /** Right stick: camera zoom; `amount` is a wheel-like delta for this frame (positive = out). */
  | { type: 'zoom'; amount: number }
  /** Hold-to-restart fill, 0..1 (0 = idle). Sent when it changes. */
  | { type: 'restartHold'; progress: number };

const NAMES: Record<number, PadButtonName> = {
  0: 'a',
  1: 'b',
  2: 'x',
  3: 'y',
  4: 'lb',
  5: 'rb',
  6: 'lt',
  7: 'rt',
  8: 'view',
  9: 'menu',
  10: 'ls',
  11: 'rs',
  16: 'home',
};

/** Minimal shape of a Gamepad we read (so tests and mocks need not build real Gamepad objects). */
export interface PadLike {
  readonly index: number;
  readonly id: string;
  readonly connected: boolean;
  readonly mapping?: string;
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
}

/** Merged state of every connected pad for one frame. */
interface Frame {
  down: boolean[];
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

const ZOOM_RATE = 900; // wheel-delta units per second at full right-stick deflection

export class GamepadInput {
  bindings: PadBindings = defaultPadBindings();
  /** Last pad that produced input (prompt glyphs). */
  style: PadStyle = 'xbox';
  private modeValue: PadMode = 'off';
  private readonly commandListeners = new Set<(cmd: GameCommand) => void>();
  private readonly eventListeners = new Set<(e: PadEvent) => void>();
  private prev: boolean[] = new Array<boolean>(PAD_BUTTON_COUNT).fill(false);
  /** Buttons held across a mode change must be released before they count again (no confirm → interact bleed). */
  private suppressed = new Set<number>();
  private readonly known = new Map<number, { id: string; style: PadStyle }>();
  private moveActive = false;
  private padInteract = false;
  private previewHeld = false;
  private readonly restartHold = new HoldTracker(600);
  private lastHoldProgress = 0;
  private readonly repeat: Record<NavDir, RepeatTimer> = { up: new RepeatTimer(), down: new RepeatTimer(), left: new RepeatTimer(), right: new RepeatTimer() };
  private target: Window | null = null;
  /** Override for tests; defaults to navigator.getGamepads. */
  getPads: () => readonly (PadLike | null)[] = defaultGetPads;

  constructor(readonly sampler: InputSampler) {}

  get mode(): PadMode {
    return this.modeValue;
  }

  /** Switches routing. Any held state is released and currently held buttons must be let go before they act. */
  setMode(mode: PadMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.releaseHeld();
    for (let i = 0; i < this.prev.length; i++) if (this.prev[i]) this.suppressed.add(i);
  }

  /** Number of connected pads (as of the last poll). */
  get connectedCount(): number {
    return this.known.size;
  }

  attach(target: Window = window): void {
    if (this.target) return;
    this.target = target;
    // Polling detects hot-plug too; the events just make it immediate (Safari only reports a pad after a press).
    target.addEventListener('gamepadconnected', this.onPlug);
    target.addEventListener('gamepaddisconnected', this.onPlug);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('gamepadconnected', this.onPlug);
    this.target.removeEventListener('gamepaddisconnected', this.onPlug);
    this.target = null;
  }

  onCommand(fn: (cmd: GameCommand) => void): () => void {
    this.commandListeners.add(fn);
    return () => this.commandListeners.delete(fn);
  }

  onEvent(fn: (e: PadEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  /** Reads every connected pad and routes this frame's input. Call once per animation frame. */
  poll(dtMs: number): void {
    const frame = this.read();
    if (!frame) return;
    const { down } = frame;
    const pressed = (i: number): boolean => !!down[i] && !this.prev[i] && !this.suppressed.has(i);
    const held = (i: number | null): boolean => i !== null && !!down[i] && !this.suppressed.has(i);
    for (const i of [...this.suppressed]) if (!down[i]) this.suppressed.delete(i);

    let any = false;
    for (let i = 0; i < down.length; i++) if (down[i] && !this.prev[i]) any = true;
    if (Math.hypot(frame.lx, frame.ly) > STICK_DEADZONE || Math.hypot(frame.rx, frame.ry) > STICK_DEADZONE) any = true;
    if (any) this.emitEvent({ type: 'activity', style: this.style });

    // Menu / Start always pauses (or backs out of a menu): reserved, never remapped.
    if (pressed(PAD.MENU)) this.emitCommand({ type: 'pause' });

    if (this.modeValue === 'gameplay') this.gameplay(frame, pressed, held, dtMs);
    else if (this.modeValue === 'ui') this.ui(frame, pressed, dtMs);
    this.prev = down;
  }

  /** Releases everything this pad holds in the sampler / preview (blur, menus opening, disconnect). */
  releaseHeld(): void {
    if (this.moveActive) this.sampler.setPadMove(0, 0);
    this.moveActive = false;
    if (this.padInteract) this.sampler.setInteract(false, 'pad');
    this.padInteract = false;
    if (this.previewHeld) {
      this.previewHeld = false;
      this.emitCommand({ type: 'temporalPreview', held: false });
    }
    this.restartHold.reset();
    this.setHoldProgress(0);
    for (const r of Object.values(this.repeat)) r.update(false, 0);
  }

  // ------------------------------------------------------------------ internals

  private gameplay(f: Frame, pressed: (i: number) => boolean, held: (i: number | null) => boolean, dtMs: number): void {
    // Movement: D-pad wins over the stick; both quantize to -1/0/1 before reaching the sampler.
    const [dx, dy] = dpadDirection(held(PAD.UP), held(PAD.DOWN), held(PAD.LEFT), held(PAD.RIGHT));
    const [sx, sy] = dx !== 0 || dy !== 0 ? [dx, dy] : quantizeStick(f.lx, f.ly, STICK_DEADZONE, this.moveActive);
    const moving = sx !== 0 || sy !== 0;
    if (moving || this.moveActive) this.sampler.setPadMove(sx, sy);
    this.moveActive = moving;

    const b = this.bindings;
    const interact = held(b.interact);
    if (interact !== this.padInteract) {
      this.padInteract = interact;
      this.sampler.setInteract(interact, 'pad');
    }
    if (b.action !== null && pressed(b.action)) this.sampler.pressAction();
    if (b.rewind !== null && pressed(b.rewind)) this.emitCommand({ type: 'rewind' });
    if (b.timeline !== null && pressed(b.timeline)) this.emitCommand({ type: 'toggleTimeline' });
    if (b.echoPrev !== null && pressed(b.echoPrev)) this.emitEvent({ type: 'cycleEcho', dir: -1 });
    if (b.echoNext !== null && pressed(b.echoNext)) this.emitEvent({ type: 'cycleEcho', dir: 1 });

    const preview = held(b.preview);
    if (preview !== this.previewHeld) {
      this.previewHeld = preview;
      this.emitCommand({ type: 'temporalPreview', held: preview });
    }

    if (this.restartHold.update(held(b.restart), dtMs)) this.emitCommand({ type: 'restart' });
    this.setHoldProgress(this.restartHold.progress);

    // Right stick vertical: camera zoom (wheel-equivalent delta, so camera sensitivity applies as for the mouse).
    if (Math.abs(f.ry) > STICK_DEADZONE) {
      const k = (Math.abs(f.ry) - STICK_DEADZONE) / (1 - STICK_DEADZONE);
      this.emitEvent({ type: 'zoom', amount: Math.sign(f.ry) * k * ZOOM_RATE * (Math.min(dtMs, 100) / 1000) });
    }
  }

  private ui(f: Frame, pressed: (i: number) => boolean, dtMs: number): void {
    const stick = dominantDirection(f.lx, f.ly);
    const d = f.down;
    const dirDown: Record<NavDir, boolean> = {
      up: !!d[PAD.UP] || stick === 'up',
      down: !!d[PAD.DOWN] || stick === 'down',
      left: !!d[PAD.LEFT] || stick === 'left',
      right: !!d[PAD.RIGHT] || stick === 'right',
    };
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const r = this.repeat[dir];
      const first = r.held === 0;
      if (r.update(dirDown[dir], dtMs)) this.emitEvent({ type: 'nav', dir, repeat: !first, heldMs: r.held });
    }
    for (let i = 0; i < f.down.length; i++) {
      if (i === PAD.MENU || (i >= PAD.UP && i <= PAD.RIGHT)) continue;
      if (pressed(i)) {
        if (i === this.bindings.timeline) this.emitCommand({ type: 'toggleTimeline' });
        this.emitEvent({ type: 'button', button: NAMES[i] ?? null, index: i });
      }
    }
  }

  private read(): Frame | null {
    let pads: readonly (PadLike | null)[];
    try {
      pads = this.getPads();
    } catch {
      return null;
    }
    const down = new Array<boolean>(PAD_BUTTON_COUNT).fill(false);
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let ry = 0;
    const seen = new Set<number>();
    let best = -1;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      seen.add(p.index);
      const isNew = !this.known.has(p.index);
      if (isNew) {
        const style = padStyleFromId(p.id);
        this.known.set(p.index, { id: p.id, style });
        this.style = style;
        this.emitEvent({ type: 'connected', index: p.index, id: p.id, style });
      }
      let active = false;
      for (let i = 0; i < Math.min(p.buttons.length, PAD_BUTTON_COUNT); i++) {
        const btn = p.buttons[i];
        if (!btn) continue;
        const isTrigger = i === PAD.LT || i === PAD.RT;
        // Analog triggers use a threshold; a digital trigger (value stays 0) counts when pressed.
        const on = isTrigger ? btn.value > TRIGGER_THRESHOLD || (btn.pressed && !(btn.value > 0)) : btn.pressed;
        if (on) {
          down[i] = true;
          active = true;
          // A button already held when the pad appears (e.g. the press that skipped the studio ident, or the one
          // that woke a Bluetooth pad) must be released before it acts.
          if (isNew) this.suppressed.add(i);
        }
      }
      const ax = (i: number): number => {
        const v = p.axes[i];
        return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
      };
      // Merge sticks: the pad with the largest deflection wins (two pads never fight).
      const mag = Math.hypot(ax(0), ax(1)) + Math.hypot(ax(2), ax(3));
      if (mag > STICK_DEADZONE) active = true;
      if (mag > best) {
        best = mag;
        lx = ax(0);
        ly = ax(1);
        rx = ax(2);
        ry = ax(3);
      }
      if (active) this.style = this.known.get(p.index)?.style ?? this.style;
    }
    for (const [index, info] of [...this.known]) {
      if (seen.has(index)) continue;
      this.known.delete(index);
      this.releaseHeld();
      this.prev = new Array<boolean>(PAD_BUTTON_COUNT).fill(false);
      this.emitEvent({ type: 'disconnected', index, id: info.id, style: info.style, remaining: this.known.size });
    }
    if (seen.size === 0) {
      this.prev = down;
      return null;
    }
    return { down, lx, ly, rx, ry };
  }

  private setHoldProgress(p: number): void {
    const q = Math.round(p * 50) / 50;
    if (q === this.lastHoldProgress) return;
    this.lastHoldProgress = q;
    this.emitEvent({ type: 'restartHold', progress: q });
  }

  private emitCommand(cmd: GameCommand): void {
    for (const fn of this.commandListeners) fn(cmd);
  }

  private emitEvent(e: PadEvent): void {
    for (const fn of this.eventListeners) fn(e);
  }

  private readonly onPlug = (): void => {
    this.read();
  };
}

function defaultGetPads(): readonly (PadLike | null)[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  return navigator.getGamepads() as unknown as readonly (PadLike | null)[];
}

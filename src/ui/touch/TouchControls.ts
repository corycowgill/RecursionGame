import type { GameCommand } from '../../engine/contracts';
import type { Quantized } from '../../engine/input/gamepadMapping';
import { esc, h } from '../dom';
import { icon } from '../icons';
import { ringsSVG } from '../rings';
import { readTouchEnv, isTouchDevice, touchFirst, type TouchEnv } from './env';
import { GestureTracker, type GestureEvent } from './gestures';
import { INTERACT_ICON } from './icons';
import { JOYSTICK_RADIUS } from './joystick';
import { touchVisibility, type TouchVisibility, type TouchVisibilityInput } from './visibility';

/**
 * Where on-screen touch input goes. The app connects it to the SAME InputSampler and GameCommand handler as the
 * keyboard and the gamepad (see src/app/touch.ts), so a touch player records exactly the PlayerInput stream a
 * keyboard player would (moveX/moveY in {-1,0,1}, latched interact presses).
 */
export interface TouchSink {
  /** Joystick direction in SCREEN axes (y < 0 = up), quantized; [0,0] when released. */
  move(x: Quantized, y: Quantized): void;
  interact(down: boolean): void;
  command(cmd: GameCommand): void;
  /** Pinch zoom, in mouse-wheel deltaY units (positive = zoom out). */
  zoom(deltaY: number): void;
  /** Puzzle overview camera on/off (two-finger tap toggles it; it ends when the controls hide, e.g. on pause). */
  overview(on: boolean): void;
  /** The device turned to portrait / back to landscape (the app pauses a running chamber). */
  orientation?(portrait: boolean): void;
}

export interface TouchStateSource {
  device(): 'keyboard' | 'gamepad' | 'touch';
  hud(): boolean;
  screen(): string | null;
  timelineExpanded(): boolean;
}

type BtnId = 'interact' | 'echo' | 'timeline' | 'preview';

/** Short haptic tick where supported (Android Chrome). iOS Safari has no Vibration API: a silent no-op. */
export function haptic(ms = 12): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch {
    /* ignored */
  }
}

/**
 * ON-SCREEN TOUCH CONTROLS (phones / tablets): floating joystick on the left, Interact / New echo / Timeline /
 * Preview (hold) on the right, pause in the top corner, pinch zoom, two-finger tap overview, plus the portrait
 * "rotate your device" overlay. Pointer Events with multi-touch: each finger is tracked by pointerId, so the
 * joystick and a button work at the same time, and buttons act on pointerdown (presses are latched by the
 * sampler, never dropped).
 */
export class TouchControls {
  readonly el: HTMLElement;
  readonly rotateEl: HTMLElement;
  readonly env: TouchEnv;
  readonly touchCapable: boolean;
  /** Touch is the natural first device (show the controls before the first touch). */
  readonly touchFirst: boolean;
  private sink: TouchSink | null = null;
  private readonly zone: HTMLElement;
  private readonly joy: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly overviewChip: HTMLElement;
  private readonly promptTag: HTMLElement;
  private readonly btns: Record<BtnId, HTMLButtonElement>;
  private readonly gestures = new GestureTracker();
  private readonly btnPointers = new Map<number, BtnId>();
  private vis: TouchVisibility = { touchMode: false, controls: false, pause: false, rotate: false };
  private portrait = false;
  private overviewOn = false;
  /** The overview was on when the controls hid: restore the follow camera when they come back. */
  private overviewReset = false;
  private lastDir: [Quantized, Quantized] = [0, 0];
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly state: TouchStateSource,
    private readonly onDevice: () => void,
    env: TouchEnv = readTouchEnv(),
  ) {
    this.env = env;
    this.touchCapable = isTouchDevice(env);
    this.touchFirst = touchFirst(env);

    this.zone = h('div', { class: 'rx-tzone', 'aria-hidden': 'true', 'data-testid': 'touch-zone' });
    this.knob = h('div', { class: 'knob' });
    this.joy = h('div', { class: 'rx-joy', 'aria-hidden': 'true', hidden: true }, h('div', { class: 'base', html: dirTicks() }), this.knob);
    this.ghost = h('div', { class: 'rx-joy ghost', 'aria-hidden': 'true' }, h('div', { class: 'base', html: dirTicks() }), h('div', { class: 'knob' }), h('span', { class: 'tip' }, 'Move'));
    const mk = (id: BtnId, ic: string, label: string, aria: string): HTMLButtonElement =>
      h('button', { class: `rx-tbtn b-${id}`, type: 'button', 'aria-label': aria, 'data-testid': `touch-${id}` }, h('span', { class: 'ic', html: ic }), h('span', { class: 'tx' }, label));
    this.btns = {
      interact: mk('interact', INTERACT_ICON, 'Interact', 'Interact'),
      echo: mk('echo', icon('record'), 'New echo', 'End the loop and create an echo'),
      timeline: mk('timeline', icon('clock'), 'Timeline', 'Open the timeline'),
      preview: mk('preview', icon('eye'), 'Preview', 'Hold to preview your echoes'),
    };
    this.promptTag = h('span', { class: 'rx-tprompt', hidden: true });
    this.btns.interact.append(this.promptTag);
    const cluster = h('div', { class: 'rx-tbtns' }, this.btns.preview, this.btns.timeline, this.btns.echo, this.btns.interact);
    this.pauseBtn = h('button', { class: 'rx-tpause', type: 'button', 'aria-label': 'Pause', 'data-testid': 'touch-pause', html: icon('pause') });
    this.overviewChip = h('div', { class: 'rx-tchip', hidden: true, html: `${icon('zoom')}<span>Overview · two-finger tap to return</span>` });
    this.el = h('div', { class: 'rx-touch', 'data-testid': 'touch-controls', hidden: true }, this.zone, this.ghost, this.joy, cluster, this.pauseBtn, this.overviewChip);

    this.rotateEl = h(
      'div',
      { class: 'rx-rotate', role: 'alertdialog', 'aria-label': 'Rotate your device to landscape', 'data-testid': 'rotate-overlay', hidden: true },
      h('div', { class: 'rx-rings', html: ringsSVG('rot') }),
      h('div', { class: 'phone', 'aria-hidden': 'true', html: '<i class="notch"></i><i class="arrow"></i>' }),
      h('div', { class: 'rx-eyebrow' }, 'Recursion'),
      h('h2', {}, 'Rotate your device'),
      h('p', {}, 'The chamber is built for landscape. Turn your phone sideways to continue. Time is paused.'),
    );

    this.bindZone();
    this.bindButtons();
    this.bindGlobal();
  }

  setSink(sink: TouchSink | null): void {
    this.sink = sink;
    if (sink && this.portrait) sink.orientation?.(true);
  }

  get visibility(): TouchVisibility {
    return this.vis;
  }

  get isPortrait(): boolean {
    return this.portrait;
  }

  /** Recomputes what shows (cheap; called on UI state changes and once per HUD frame). */
  refresh(): void {
    const input: TouchVisibilityInput = {
      touchCapable: this.touchCapable,
      device: this.state.device(),
      hud: this.state.hud(),
      screen: this.state.screen(),
      timelineExpanded: this.state.timelineExpanded(),
      portrait: this.portrait,
    };
    const v = touchVisibility(input);
    const prev = this.vis;
    this.vis = v;
    if (prev.controls && !v.controls) this.releaseAll();
    if (prev.controls !== v.controls || prev.pause !== v.pause || prev.touchMode !== v.touchMode) {
      this.el.hidden = !(v.controls || v.pause);
      this.el.classList.toggle('play', v.controls);
      this.zone.hidden = !v.controls;
    }
    if (prev.rotate !== v.rotate) this.rotateEl.hidden = !v.rotate;
    if (!v.controls && this.overviewOn) {
      this.setOverviewChip(false);
      this.overviewReset = true;
    }
    if (v.controls && !prev.controls && this.overviewReset) {
      this.overviewReset = false;
      this.sink?.overview(false);
    }
  }

  /** Two-finger tap: toggles the puzzle overview camera while the controls are up. */
  toggleOverview(): void {
    if (!this.vis.controls) return;
    this.setOverviewChip(!this.overviewOn);
    this.sink?.overview(this.overviewOn);
  }

  get overviewActive(): boolean {
    return this.overviewOn;
  }

  /** Interaction available: the Interact button lights up with the action name (null = nothing in reach). */
  setPrompt(label: string | null, blocked = false): void {
    const on = !!label;
    this.btns.interact.classList.toggle('ready', on && !blocked);
    this.btns.interact.classList.toggle('blocked', on && blocked);
    const txt = label ?? '';
    if (this.promptTag.textContent !== txt) this.promptTag.textContent = txt;
    this.promptTag.hidden = !on;
  }

  /** Puzzle overview state (two-finger tap), shown as a chip so the player knows how to get back. */
  setOverviewChip(on: boolean): void {
    this.overviewOn = on;
    this.overviewChip.hidden = !on;
  }

  dispose(): void {
    this.releaseAll();
    for (const off of this.cleanup) off();
    this.cleanup.length = 0;
    this.el.remove();
    this.rotateEl.remove();
  }

  // ------------------------------------------------------------------ internals

  private emitMove(dir: [Quantized, Quantized]): void {
    if (dir[0] === this.lastDir[0] && dir[1] === this.lastDir[1]) return;
    this.lastDir = dir;
    this.sink?.move(dir[0], dir[1]);
  }

  /** Lifts every finger: joystick centred, held buttons released (controls hidden, blur, page hidden). */
  private releaseAll(): void {
    this.handleGestures(this.gestures.reset());
    this.emitMove([0, 0]);
    for (const [, id] of this.btnPointers) this.releaseButton(id);
    this.btnPointers.clear();
  }

  private handleGestures(events: GestureEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'stickStart':
          this.ghost.hidden = true;
          this.joy.hidden = false;
          this.joy.style.transform = `translate(${e.stick.ox}px, ${e.stick.oy}px)`;
          this.knob.style.transform = 'translate(-50%, -50%)';
          break;
        case 'stickMove':
          this.joy.style.transform = `translate(${e.stick.ox.toFixed(1)}px, ${e.stick.oy.toFixed(1)}px)`;
          this.knob.style.transform = `translate(calc(-50% + ${e.stick.kx.toFixed(1)}px), calc(-50% + ${e.stick.ky.toFixed(1)}px))`;
          this.joy.classList.toggle('on', e.stick.dir[0] !== 0 || e.stick.dir[1] !== 0);
          if (e.changed) {
            if (e.stick.dir[0] !== 0 || e.stick.dir[1] !== 0) {
              if (this.lastDir[0] === 0 && this.lastDir[1] === 0) haptic(8);
            }
            this.emitMove(e.stick.dir);
          }
          break;
        case 'stickEnd':
          this.joy.hidden = true;
          this.joy.classList.remove('on');
          this.ghost.hidden = false;
          this.emitMove([0, 0]);
          break;
        case 'zoom':
          this.sink?.zoom(e.deltaY);
          break;
        case 'twoFingerTap':
          haptic(15);
          this.toggleOverview();
          break;
        default:
          break;
      }
    }
  }

  private local(e: PointerEvent): { x: number; y: number; w: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width || window.innerWidth || 1 };
  }

  private bindZone(): void {
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      try {
        z.setPointerCapture(e.pointerId);
      } catch {
        /* tests */
      }
      const p = this.local(e);
      this.handleGestures(this.gestures.down(e.pointerId, p.x, p.y, e.timeStamp, p.w));
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      const p = this.local(e);
      this.handleGestures(this.gestures.move(e.pointerId, p.x, p.y));
    });
    const up = (e: PointerEvent): void => this.handleGestures(this.gestures.up(e.pointerId, e.timeStamp));
    z.addEventListener('pointerup', up);
    z.addEventListener('pointercancel', (e) => this.handleGestures(this.gestures.cancel(e.pointerId)));
    z.addEventListener('lostpointercapture', (e) => this.handleGestures(this.gestures.cancel(e.pointerId)));
    z.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pressButton(id: BtnId): void {
    const s = this.sink;
    this.btns[id].classList.add('down');
    haptic(id === 'interact' ? 10 : 14);
    switch (id) {
      case 'interact':
        s?.interact(true);
        break;
      case 'echo':
        s?.command({ type: 'rewind' });
        break;
      case 'timeline':
        s?.command({ type: 'toggleTimeline' });
        break;
      case 'preview':
        s?.command({ type: 'temporalPreview', held: true });
        break;
      default:
        break;
    }
  }

  private releaseButton(id: BtnId): void {
    this.btns[id].classList.remove('down');
    if (id === 'interact') this.sink?.interact(false);
    else if (id === 'preview') this.sink?.command({ type: 'temporalPreview', held: false });
  }

  private bindButtons(): void {
    for (const id of Object.keys(this.btns) as BtnId[]) {
      const b = this.btns[id];
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.btnPointers.has(e.pointerId)) return;
        // One finger per button: a second finger on a held button is ignored.
        if ([...this.btnPointers.values()].includes(id)) return;
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          /* tests */
        }
        this.btnPointers.set(e.pointerId, id);
        this.pressButton(id);
      });
      const up = (e: PointerEvent): void => {
        const held = this.btnPointers.get(e.pointerId);
        if (held !== id) return;
        this.btnPointers.delete(e.pointerId);
        this.releaseButton(id);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      // Keyboard / screen-reader activation (no pointer): a tap-equivalent.
      b.addEventListener('click', (e) => {
        if (e.detail !== 0) return; // pointer-generated click: already handled on pointerdown
        this.pressButton(id);
        this.releaseButton(id);
      });
    }
    this.pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.pauseBtn.addEventListener('click', () => {
      haptic(12);
      this.sink?.command({ type: 'pause' });
    });
  }

  private bindGlobal(): void {
    if (typeof window === 'undefined') return;
    // Any touch makes touch the active device (shows the controls); keyboard / controller hide them again (the app
    // switches the device on those, see src/app/gamepad.ts).
    const onPointer = (e: PointerEvent): void => {
      if (this.touchCapable && e.pointerType === 'touch' && this.state.device() !== 'touch') this.onDevice();
    };
    window.addEventListener('pointerdown', onPointer, { capture: true });
    const onOrient = (): void => this.checkOrientation();
    window.addEventListener('resize', onOrient);
    window.addEventListener('orientationchange', onOrient);
    const onBlur = (): void => this.releaseAll();
    window.addEventListener('blur', onBlur);
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') this.releaseAll();
    };
    document.addEventListener('visibilitychange', onVis);
    this.cleanup.push(() => {
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('resize', onOrient);
      window.removeEventListener('orientationchange', onOrient);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
    });
    // Initial orientation only (the owner calls refresh() once its state is ready).
    this.portrait = this.readPortrait();
  }

  private readPortrait(): boolean {
    const w = window.innerWidth || 0;
    const h2 = window.innerHeight || 0;
    return this.touchCapable && h2 > w && w > 0;
  }

  private checkOrientation(): void {
    const portrait = this.readPortrait();
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    this.refresh();
    this.sink?.orientation?.(portrait);
  }
}

/** Eight direction ticks around the joystick base (the stick snaps to these). */
function dirTicks(): string {
  const r = JOYSTICK_RADIUS;
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x = Math.cos(a) * (r + 6);
    const y = Math.sin(a) * (r + 6);
    return `<i style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(i * 45 + 90).toFixed(0)}deg)"></i>`;
  }).join('');
  return `<span class="ring"></span>${ticks}`;
}

/** iOS Safari "Add to Home Screen" hint for the main menu (dismissible). */
export function homeScreenHint(onDismiss: () => void): HTMLElement {
  const share =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>';
  const close = h('button', { class: 'rx-iconbtn', type: 'button', 'aria-label': 'Dismiss', 'data-testid': 'a2hs-dismiss', html: icon('close') });
  const el = h(
    'aside',
    { class: 'rx-panel cyan rx-a2hs', role: 'note', 'data-testid': 'a2hs-hint' },
    h('div', { class: 'rx-hair' }),
    h('div', { class: 'txt', html: `<b>Play full screen</b><span>Tap ${share} then <em>${esc('Add to Home Screen')}</em></span>` }),
    close,
  );
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    el.remove();
    onDismiss();
  });
  return el;
}

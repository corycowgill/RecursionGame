import type { GameCommand } from '../engine/contracts';
import type { PadBindings } from '../engine/input/gamepadBindings';
import { GamepadInput, type PadEvent, type PadMode } from '../engine/input/GamepadInput';
import type { InputSampler } from '../engine/input/InputSampler';
import { KEYBOARD, PAD_STYLE_NAMES, type UIHandle } from '../ui';

/**
 * Gamepad wiring (round 3). Kept out of bootstrap so the app only adds a handful of lines:
 *   - the pad feeds the SAME InputSampler as the keyboard (movement / interact / action, latched per tick),
 *   - its meta buttons go through the same GameCommand handler as the keyboard,
 *   - menus and the expanded timeline receive navigation through `ui.padInput`,
 *   - hot-plug toasts; a disconnect during play pauses the game,
 *   - the last-used device (keyboard / controller family) drives every button prompt.
 */
export interface GamepadWiringDeps {
  sampler: InputSampler;
  ui: UIHandle;
  /** Element the camera's wheel zoom listens on (right stick zoom dispatches wheel-equivalent deltas there). */
  zoomTarget: HTMLElement;
  bindings: PadBindings;
  onCommand(cmd: GameCommand): void;
  /** True while keyboard gameplay keys are live (playing, no pause / menu). */
  gameplayActive(): boolean;
  /** True while the chamber is being played (pause on disconnect). */
  playing(): boolean;
  pause(): void;
  echoCount(): number;
}

export interface GamepadWiring {
  readonly input: GamepadInput;
  poll(dtMs: number): void;
  setBindings(b: PadBindings): void;
  dispose(): void;
}

export function wireGamepad(d: GamepadWiringDeps): GamepadWiring {
  const pad = new GamepadInput(d.sampler);
  pad.bindings = d.bindings;
  const offCommand = pad.onCommand((cmd) => d.onCommand(cmd));

  const onEvent = (e: PadEvent): void => {
    const ui = d.ui;
    switch (e.type) {
      case 'connected':
        ui.setInputDevice({ kind: 'gamepad', style: e.style });
        ui.toast(`${PAD_STYLE_NAMES[e.style]} controller connected`, 'success', 2600);
        break;
      case 'disconnected':
        ui.toast(e.remaining > 0 ? 'Controller disconnected' : 'Controller disconnected · game paused', 'warn', 3200);
        if (d.playing()) d.pause();
        if (e.remaining === 0 && ui.inputDevice.kind === 'gamepad') ui.setInputDevice(KEYBOARD);
        break;
      case 'activity':
        ui.setInputDevice({ kind: 'gamepad', style: e.style });
        break;
      case 'nav':
      case 'button':
        ui.padInput(e);
        break;
      case 'cycleEcho': {
        const n = d.echoCount();
        if (n === 0) break;
        const cur = ui.selectedEcho;
        const next = e.dir > 0 ? (cur === null ? 0 : cur + 1 >= n ? null : cur + 1) : cur === null ? n - 1 : cur === 0 ? null : cur - 1;
        ui.selectEcho(next);
        break;
      }
      case 'zoom':
        d.zoomTarget.dispatchEvent(new WheelEvent('wheel', { deltaY: e.amount, bubbles: false }));
        break;
      case 'restartHold':
        ui.setRestartHold(e.progress);
        break;
      default:
        break;
    }
  };
  const offEvent = pad.onEvent(onEvent);
  pad.attach(window);

  // Keyboard or mouse use switches the prompts back to key caps (touch is left to the touch layer).
  const toKeyboard = (): void => {
    if (d.ui.inputDevice.kind !== 'keyboard') d.ui.setInputDevice(KEYBOARD);
  };
  const onPointer = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') toKeyboard();
  };
  window.addEventListener('keydown', toKeyboard, { capture: true });
  window.addEventListener('pointerdown', onPointer, { capture: true });

  return {
    input: pad,
    poll(dtMs) {
      const ui = d.ui;
      const mode: PadMode = d.gameplayActive() && !ui.timelineExpanded ? 'gameplay' : ui.screen !== null || ui.timelineExpanded ? 'ui' : 'off';
      pad.setMode(mode);
      pad.poll(dtMs);
    },
    setBindings(b) {
      pad.bindings = b;
    },
    dispose() {
      offCommand();
      offEvent();
      pad.releaseHeld();
      pad.detach();
      window.removeEventListener('keydown', toKeyboard, { capture: true });
      window.removeEventListener('pointerdown', onPointer, { capture: true });
    },
  };
}

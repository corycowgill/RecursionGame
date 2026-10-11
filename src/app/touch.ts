import type { GameCommand } from '../engine/contracts';
import type { InputSampler } from '../engine/input/InputSampler';
import type { UIHandle } from '../ui';

/**
 * Touch wiring (round 3, iPhone / Android / iPad). Kept out of bootstrap so the app only adds a few lines:
 *   - the on-screen joystick, Interact and Action buttons feed the SAME InputSampler as the keyboard and the gamepad
 *     (quantized -1/0/1 screen direction, rotated by the camera yaw in the sampler; latched interact presses),
 *   - New echo / Timeline / Preview / Pause go through the same GameCommand handler as the keys,
 *   - pinch zoom is sent as wheel deltas to the element the camera already listens on (camera sensitivity applies),
 *   - two-finger tap toggles the puzzle overview camera; turning to portrait pauses a running chamber,
 *   - iOS: audio unlocks on the first touchend, Safari's pinch page-zoom gestures are cancelled; elsewhere the first
 *     touch asks for fullscreen + landscape lock where the Fullscreen API exists (not on iPhone: Add to Home Screen).
 */
export interface TouchWiringDeps {
  sampler: InputSampler;
  ui: UIHandle;
  zoomTarget: HTMLElement;
  onCommand(cmd: GameCommand): void;
  /** True while gameplay input is live (playing, no pause / menu). */
  gameplayActive(): boolean;
  /** True while a chamber is being played (pause on portrait). */
  playing(): boolean;
  pause(): void;
  setOverview(on: boolean): void;
  unlockAudio(): void;
}

export interface TouchWiring {
  dispose(): void;
}

export function wireTouch(d: TouchWiringDeps): TouchWiring {
  const t = d.ui.touch;
  t.setSink({
    move: (x, y) => d.sampler.setTouchMove(x, y),
    interact: (down) => d.sampler.setInteract(down && d.gameplayActive(), 'touch'),
    // Round 4: the on-screen Action button latches the Space context action like the key / pad button.
    action: () => {
      if (d.gameplayActive()) d.sampler.pressAction();
    },
    command: (cmd) => {
      d.onCommand(cmd);
      // Releasing the temporal preview returns the camera to follow; keep the overview if the player had it on.
      if (cmd.type === 'temporalPreview' && !cmd.held && t.overviewActive) d.setOverview(true);
    },
    zoom: (deltaY) => d.zoomTarget.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: false })),
    overview: (on) => d.setOverview(on),
    orientation: (portrait) => {
      if (portrait && d.playing()) d.pause();
    },
  });

  const cleanup: (() => void)[] = [];
  const on = (target: Document | Window, type: string, fn: EventListener, opts?: AddEventListenerOptions): void => {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  };

  // iOS needs a touchend (not just pointerdown) to start Web Audio.
  on(window, 'touchend', () => d.unlockAudio(), { capture: true, passive: true });
  // Safari's proprietary pinch gestures zoom the page even with touch-action: none on some versions.
  const stop = (e: Event): void => e.preventDefault();
  on(document, 'gesturestart', stop);
  on(document, 'gesturechange', stop);
  // Fullscreen (Android / iPad / desktop touch). iPhone Safari has no element fullscreen: the home-screen web app is.
  let askedFullscreen = false;
  on(
    window,
    'touchend',
    () => {
      if (askedFullscreen || !t.touchCapable) return;
      askedFullscreen = true;
      const nav = navigator as Navigator & { standalone?: boolean };
      if (nav.webdriver || nav.standalone || !document.fullscreenEnabled || document.fullscreenElement) return;
      const el = document.documentElement;
      if (typeof el.requestFullscreen !== 'function') return;
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => undefined);
    },
    { capture: true, passive: true },
  );

  return {
    dispose() {
      t.setSink(null);
      for (const off of cleanup) off();
      cleanup.length = 0;
    },
  };
}

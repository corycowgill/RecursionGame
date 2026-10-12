import { h } from '../dom';
import { deviceHintHTML, padHintHTML } from '../glyphs';
import type { Screen } from './MainMenu';
import { injectNarrativeStyles, parseLogLine, storyLineHTML } from './narrative';

/** One frame of the ending overlay (the app computes it; see src/app/ending.ts `endingFrame`). */
export interface EndingOverlayFrame {
  /** Opacity 0..1 per line. */
  lines: readonly number[];
  /** White fade 0..1. */
  white: number;
}

export interface EndingScreen extends Screen {
  render(frame: EndingOverlayFrame): void;
  /** Gamepad: any button skips (createUI routes pad buttons to `padButton` first). */
  padButton(index: number): boolean;
  /** Pad input is fully captured while the ending plays (no focus navigation). */
  readonly padCapturing: boolean;
  /** Esc / Back skips (createUI's back() delegates here). */
  back(): boolean;
}

/**
 * ENDING OVERLAY (round 5): transparent screen over the 3D view (the camera pull-back and the converging echoes are
 * drawn by the renderer underneath). Shows the ending lines and the fade to white. ANY fresh input skips: a key
 * press (auto-repeat ignored), a click or tap anywhere, or any controller button. Timing is owned by the app.
 */
export function createEnding(lines: readonly string[], act: { onSkip(): void }): EndingScreen {
  injectNarrativeStyles();
  const lineEls = lines.map((l) => h('p', { class: `line${parseLogLine(l) ? ' log' : ''}`, html: storyLineHTML(l) }));
  const white = h('div', { class: 'white', 'data-testid': 'ending-white' });
  const skip = h('div', {
    class: 'skip',
    html: `${deviceHintHTML('Any key to skip', `${padHintHTML(0)} Any button to skip`)}<span class="rx-touch-only">Tap to skip</span>`,
  });
  const el = h(
    'div',
    { class: 'rx-screen rx-ending', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ending', 'data-testid': 'ending', tabindex: '-1' },
    h('div', { class: 'lines', 'aria-live': 'polite' }, ...lineEls),
    skip,
    white,
  );
  const doSkip = (): void => act.onSkip();
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    e.preventDefault();
    doSkip();
  };
  const onPointer = (e: PointerEvent): void => {
    e.preventDefault();
    doSkip();
  };
  const win = el.ownerDocument.defaultView;
  win?.addEventListener('keydown', onKey);
  el.addEventListener('pointerdown', onPointer);
  return {
    el,
    padCapturing: true,
    render(f) {
      lineEls.forEach((p, i) => {
        const a = f.lines[i] ?? 0;
        p.style.opacity = a.toFixed(3);
        p.style.transform = `translateY(${((1 - a) * 0.4).toFixed(3)}em)`;
      });
      white.style.opacity = f.white.toFixed(3);
      skip.style.opacity = String(Math.max(0, 1 - f.white * 2));
    },
    padButton() {
      doSkip();
      return true;
    },
    back() {
      doSkip();
      return true;
    },
    dispose() {
      win?.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerdown', onPointer);
    },
  };
}

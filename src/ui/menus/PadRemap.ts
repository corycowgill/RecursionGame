import { PAD_ACTIONS, PAD_ACTION_LABELS, assignPadButton, defaultPadBindings, isBindablePadButton, type PadAction, type PadBindings } from '../../engine/input/gamepadBindings';
import { PAD, padButtonName, type PadStyle } from '../../engine/input/gamepadMapping';
import { h } from '../dom';
import { PAD_STYLE_NAMES, padCapHTML } from '../glyphs';
import { icon } from '../icons';

export interface PadRemapOptions {
  bindings: PadBindings;
  /** Glyph family of the last-used controller (labels follow it), or null when none was used yet. */
  style(): PadStyle | null;
  /** Number of connected controllers (status line). */
  connected?(): number;
  onChange(b: PadBindings): void;
}

export interface PadRemap {
  readonly el: HTMLElement;
  /** Feeds a raw controller button press. Returns true when it was consumed by a pending rebind. */
  padButton(index: number): boolean;
  /** True while waiting for a button. */
  readonly capturing: boolean;
  dispose(): void;
}

const CAPTURE_MS = 6000;

/**
 * Settings → Controls → Gamepad: one row per remappable action. Pick a row (click, Enter or A) and press the new
 * controller button; Menu/Start, Esc or a 6 s timeout cancel. The left stick, D-pad and Menu/Start are fixed.
 */
export function createPadRemap(opts: PadRemapOptions, sound: (c: 'confirm' | 'error' | 'toggle' | 'back') => void): PadRemap {
  let binds = opts.bindings;
  let capture: PadAction | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let notice = '';
  const el = h('div', { class: 'rx-padremap', 'data-testid': 'pad-remap' });

  const style = (): PadStyle => opts.style() ?? 'xbox';
  const focusRow = (a: PadAction): void => (el.querySelector(`.rx-bind[data-pad-action="${a}"]`) as HTMLElement | null)?.focus({ preventScroll: true });

  const stop = (msg: string): void => {
    const a = capture;
    capture = null;
    if (timer) clearTimeout(timer);
    timer = null;
    notice = msg;
    render();
    if (a) focusRow(a);
  };

  function render(): void {
    const st = style();
    const grid = h('div', { class: 'rx-binds' });
    grid.append(h('h4', {}, 'Gamepad'));
    for (const a of PAD_ACTIONS) {
      const b = binds[a];
      const capturing = capture === a;
      const btn = h('button', {
        class: `rx-bind${b === null ? ' empty' : ''}${capturing ? ' capturing' : ''}`,
        type: 'button',
        'data-pad-action': a,
        'aria-label': `${PAD_ACTION_LABELS[a]}, controller button: ${b === null ? 'unbound' : padButtonName(b, st)}. Activate, then press a controller button.`,
        html: capturing ? 'Press a button…' : b === null ? 'Unbound' : padCapHTML(b, st),
      });
      btn.addEventListener('click', () => {
        if (capture === a) return;
        capture = a;
        notice = 'Press a controller button (Menu / Esc cancels)';
        sound('confirm');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => stop('Rebinding timed out'), CAPTURE_MS);
        render();
        focusRow(a);
      });
      grid.append(h('div', { class: 'rx-field-label' }, PAD_ACTION_LABELS[a]), btn);
    }
    const fixed = h('div', {
      class: 'rx-field-label rx-muted',
      style: 'grid-column:1/-1;margin-top:.6em',
      html: `<small>Fixed: left stick / D-pad move and navigate · ${padCapHTML(PAD.MENU, st)} pause · in menus ${padCapHTML(PAD.A, st)} confirm, ${padCapHTML(PAD.B, st)} back · right stick zooms</small>`,
    });
    grid.append(fixed);
    const n = opts.connected?.() ?? 0;
    const status = h('span', { class: 'rx-muted rx-pad-status', role: 'status', 'aria-live': 'polite' }, notice || (n > 0 ? `${n} controller${n === 1 ? '' : 's'} connected · ${PAD_STYLE_NAMES[st]} glyphs` : 'No controller detected — press any button on a connected pad'));
    const reset = h('button', { class: 'rx-btn small', type: 'button', 'data-testid': 'pad-reset', html: `${icon('restart')}<span>Restore default buttons</span>` });
    reset.addEventListener('click', () => {
      binds = defaultPadBindings();
      capture = null;
      notice = 'Default buttons restored';
      opts.onChange(binds);
      sound('confirm');
      render();
      (el.querySelector('[data-testid="pad-reset"]') as HTMLElement | null)?.focus({ preventScroll: true });
    });
    el.replaceChildren(grid, h('div', { class: 'rx-dialog-foot', style: 'justify-content:space-between;align-items:center' }, status, reset));
  }

  // Esc cancels a pending controller rebind (capture phase, before the global Esc → back handler).
  const onKey = (e: KeyboardEvent): void => {
    if (!capture || e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    stop('Rebinding cancelled');
  };
  window.addEventListener('keydown', onKey, true);

  render();
  return {
    el,
    get capturing() {
      return capture !== null;
    },
    padButton(index) {
      if (!capture) return false;
      if (index === PAD.MENU) {
        sound('back');
        stop('Rebinding cancelled');
        return true;
      }
      if (!isBindablePadButton(index)) {
        sound('error');
        notice = `${padButtonName(index, style())} is reserved`;
        render();
        return true;
      }
      const a = capture;
      const res = assignPadButton(binds, a, index);
      binds = res.binds;
      opts.onChange(binds);
      sound(res.displaced ? 'error' : 'confirm');
      const name = padButtonName(index, style());
      stop(res.displaced ? `${name} moved from “${PAD_ACTION_LABELS[res.displaced]}”` : `${PAD_ACTION_LABELS[a]}: ${name}`);
      return true;
    },
    dispose() {
      if (timer) clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
    },
  };
}

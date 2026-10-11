/**
 * HOLD TO CONFIRM for a destructive menu button on touch (pause menu "Restart chamber"): a finger must hold for
 * `ms` while a coral fill sweeps across the button; lifting early cancels. Mouse, keyboard and controller
 * activation (a plain `click`) keep working instantly, so desktop flows and tests are unchanged.
 *
 * Usage: wrap the button's click handler with `gate.consume()` — it returns true for the synthetic click that
 * follows a touch (handled here), so the caller ignores it.
 */
export interface HoldGate {
  /** True if this click was produced by a touch (already handled or cancelled): ignore it. */
  consume(): boolean;
  dispose(): void;
}

export const HOLD_CONFIRM_MS = 750;

export function holdToConfirm(btn: HTMLElement, onConfirm: () => void, ms = HOLD_CONFIRM_MS): HoldGate {
  let raf = 0;
  let start = 0;
  let pointer: number | null = null;
  /** The click a touch generates arrives after pointerup (possibly much later on a slow frame): swallow it once. */
  let swallowUntil = 0;
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const setP = (p: number): void => {
    btn.style.setProperty('--hold', `${(p * 100).toFixed(1)}%`);
  };
  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pointer = null;
    btn.classList.remove('rx-holding');
    setP(0);
  };
  const tick = (): void => {
    const p = Math.min(1, (now() - start) / ms);
    setP(p);
    if (p >= 1) {
      stop();
      try {
        navigator.vibrate?.(30);
      } catch {
        /* no haptics (iOS) */
      }
      onConfirm();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
      swallowUntil = 0; // a mouse click right after a touch is a real click
      return;
    }
    e.preventDefault();
    pointer = e.pointerId;
    swallowUntil = now() + 5000;
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (tests) */
    }
    start = now();
    btn.classList.add('rx-holding');
    raf = requestAnimationFrame(tick);
  };
  const onUp = (e: PointerEvent): void => {
    if (pointer === null || e.pointerId !== pointer) return;
    stop();
  };
  btn.addEventListener('pointerdown', onDown);
  btn.addEventListener('pointerup', onUp);
  btn.addEventListener('pointercancel', onUp);
  btn.addEventListener('lostpointercapture', onUp);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    consume() {
      if (pointer !== null) return true;
      if (now() < swallowUntil) {
        swallowUntil = 0;
        return true;
      }
      return false;
    },
    dispose() {
      stop();
      btn.removeEventListener('pointerdown', onDown);
      btn.removeEventListener('pointerup', onUp);
      btn.removeEventListener('pointercancel', onUp);
      btn.removeEventListener('lostpointercapture', onUp);
    },
  };
}

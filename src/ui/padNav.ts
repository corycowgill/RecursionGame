import { GLYPH_CSS } from './glyphs';

/**
 * GAMEPAD FOCUS NAVIGATION — spatial D-pad / stick navigation over whatever screen is on top, so every menu works
 * without a mouse or keyboard. Focus moves to the nearest focusable control in the pressed direction (geometry,
 * not DOM order, so grids, tab rows and two-column layouts all behave). A visible focus ring is shown while the
 * gamepad is the active device (`.rx-pad` on the UI root).
 *
 * No synthetic keyboard events are dispatched: they would reach the keyboard input layer and the key-rebinding
 * capture. Range sliders are adjusted directly (and fire `input` like a real drag).
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Visible, enabled focus targets inside `scope`. */
export function focusables(scope: HTMLElement): HTMLElement[] {
  const all = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'));
  const laidOut = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  // No layout at all (headless DOM in unit tests): keep DOM order instead of dropping everything.
  return laidOut.length ? laidOut : all;
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
  cx: number;
  cy: number;
}

const box = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
};

/** Gap between two 1-D ranges (0 when they overlap). */
const gap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));

/** Best candidate in `dir` from `from` (pure geometry; exported for tests). */
export function pickInDirection(from: Box, candidates: { el: HTMLElement; box: Box }[], dir: Dir): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const b = c.box;
    let primary: number;
    let ortho: number;
    switch (dir) {
      case 'down':
        if (b.cy <= from.cy + 1) continue;
        primary = Math.max(0, b.t - from.b);
        ortho = gap(from.l, from.r, b.l, b.r);
        break;
      case 'up':
        if (b.cy >= from.cy - 1) continue;
        primary = Math.max(0, from.t - b.b);
        ortho = gap(from.l, from.r, b.l, b.r);
        break;
      case 'right':
        if (b.cx <= from.cx + 1) continue;
        primary = Math.max(0, b.l - from.r);
        ortho = gap(from.t, from.b, b.t, b.b);
        break;
      default:
        if (b.cx >= from.cx - 1) continue;
        primary = Math.max(0, from.l - b.r);
        ortho = gap(from.t, from.b, b.t, b.b);
        break;
    }
    const score = primary + ortho * 3 + Math.hypot(b.cx - from.cx, b.cy - from.cy) * 0.02;
    if (score < bestScore) {
      bestScore = score;
      best = c.el;
    }
  }
  return best;
}

/** Moves focus within `scope`. Returns true if something was focused or adjusted. */
export function navigate(scope: HTMLElement, dir: Dir): boolean {
  const doc = scope.ownerDocument;
  const active = doc.activeElement as HTMLElement | null;
  const items = focusables(scope);
  if (!items.length) return false;
  if (!active || !scope.contains(active) || !items.includes(active)) {
    const first = items.find((el) => el.hasAttribute('autofocus') || el.getAttribute('aria-selected') === 'true') ?? items[0];
    first?.focus();
    return !!first;
  }
  if ((dir === 'left' || dir === 'right') && active instanceof HTMLInputElement && active.type === 'range') {
    return stepRange(active, dir === 'right' ? 1 : -1);
  }
  const from = box(active);
  if (from.r - from.l <= 0) {
    // No geometry: fall back to DOM order (down/right = next, up/left = previous).
    const i = items.indexOf(active);
    const n = items[dir === 'down' || dir === 'right' ? i + 1 : i - 1];
    n?.focus();
    return !!n;
  }
  const next = pickInDirection(
    from,
    items.filter((el) => el !== active).map((el) => ({ el, box: box(el) })),
    dir,
  );
  if (!next) return false;
  next.focus();
  next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}

/** Nudges a range input by one step and fires `input` / `change` like a user drag. */
export function stepRange(input: HTMLInputElement, sign: 1 | -1): boolean {
  const step = Number(input.step) || 1;
  const min = input.min === '' ? 0 : Number(input.min);
  const max = input.max === '' ? 100 : Number(input.max);
  const v = Math.min(max, Math.max(min, Number(input.value) + sign * step));
  const rounded = Math.round(v / step) * step;
  const next = String(Math.round(Math.min(max, Math.max(min, rounded)) * 1000) / 1000);
  if (next === input.value) return false;
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Confirm (A / Cross): activates the focused control in `scope`, or focuses the first one. */
export function activate(scope: HTMLElement): boolean {
  const active = scope.ownerDocument.activeElement as HTMLElement | null;
  if (!active || !scope.contains(active) || active === scope) {
    const first = focusables(scope)[0];
    first?.focus();
    return !!first;
  }
  if (active instanceof HTMLInputElement && active.type === 'range') return false;
  active.click();
  return true;
}

const PAD_CSS = `
.rx-root.rx-pad :focus { outline: 2px solid var(--rx-gold-hi, #ffd27a); outline-offset: 3px; box-shadow: 0 0 0 5px rgba(255,181,74,.16), 0 0 26px rgba(255,181,74,.28); }
.rx-root.rx-pad .rx-btn:focus { color: #fff; border-color: var(--rx-gold-dim); background: linear-gradient(90deg, rgba(255,181,74,.18), rgba(14,30,54,.55) 55%); }
.rx-root.rx-pad .rx-btn:focus::before { transform: scaleY(1); }
.rx-root.rx-pad .rx-btn:focus .rx-chev { opacity: 1; transform: translateX(3px); color: var(--rx-gold); }
.rx-root.rx-pad .rx-level:focus { transform: translateY(-2px); }
.rx-root.rx-pad .rx-controls { flex-wrap: wrap; justify-content: flex-end; row-gap: .5em; max-width: calc(100% - 3.2em); box-sizing: border-box; }
.rx-root.rx-pad .rx-controls > span { white-space: nowrap; }
.rx-root .rx-pad-only { display: none !important; }
.rx-root.rx-pad .rx-pad-only { display: inline-flex !important; }
.rx-root.rx-pad .rx-kb-only { display: none !important; }
.rx-hold { position: absolute; left: 50%; top: 58%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: .5em; pointer-events: none; opacity: 0; transition: opacity .12s; }
.rx-hold.on { opacity: 1; }
.rx-hold .ring { width: 4.2em; height: 4.2em; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--rx-coral, #ff6b5e) calc(var(--p, 0) * 1turn), rgba(6,12,22,.62) 0); -webkit-mask: radial-gradient(circle closest-side, transparent 72%, #000 75%); mask: radial-gradient(circle closest-side, transparent 72%, #000 75%); filter: drop-shadow(0 0 10px rgba(255,107,94,.5)); }
.rx-hold .cap { position: absolute; top: 2.1em; transform: translateY(-50%); }
.rx-hold .lbl { font-family: var(--rx-display); font-size: .62em; letter-spacing: .28em; text-transform: uppercase; color: #ffd9d4; text-shadow: 0 0 8px rgba(0,0,0,.8); }
.rx-tl-padlegend { gap: .9em; align-items: center; font-size: .78em; color: var(--rx-muted, #8ea6bf); letter-spacing: .06em; padding: .3em .2em 0; flex-wrap: wrap; }
.rx-tl-padlegend > span { display: inline-flex; align-items: center; gap: .4em; }
.rx-tl:not(.expanded) .rx-tl-padlegend { display: none !important; }
.rx-padremap { margin-top: 1.4em; }
.rx-padremap .rx-binds { grid-template-columns: minmax(0, 1fr) auto; }
.rx-padremap .rx-bind .rx-key { font-size: .9em; }
.rx-padremap .rx-pad-status { font-size: .9em; }
${GLYPH_CSS}`;

/** Injects the gamepad focus-ring / glyph / hold-indicator styles (once per document). */
export function injectPadStyles(doc: Document = document): void {
  if (doc.getElementById('rx-pad-styles')) return;
  const style = doc.createElement('style');
  style.id = 'rx-pad-styles';
  style.textContent = PAD_CSS;
  doc.head.appendChild(style);
}

import { defaultPadBindings, type PadBindings } from '../engine/input/gamepadBindings';
import { PAD, faceRole, padButtonLabel, padButtonName, type PadStyle } from '../engine/input/gamepadMapping';
import { movementLabel, primaryLabel, type BindableAction, type KeyBindings } from '../persistence/keybinds';
import { esc } from './dom';
import { icon } from './icons';
import { INTERACT_ICON } from './touch/icons';

/**
 * BUTTON-PROMPT GLYPHS — every control hint (HUD, tutorial prompts, interaction prompt, timeline) is drawn for the
 * device the player used last: keyboard key caps, Xbox-style A/B/X/Y, PlayStation shapes or Switch letters.
 */

export type InputDevice = { kind: 'keyboard' } | { kind: 'gamepad'; style: PadStyle } | { kind: 'touch' };

export interface GlyphContext {
  device: InputDevice;
  keybinds: KeyBindings;
  padbinds: PadBindings;
}

export type PromptAction = BindableAction | 'move' | 'echoCycle';

export const KEYBOARD: InputDevice = Object.freeze({ kind: 'keyboard' });
/** On-screen touch controls (round 3, mobile): prompts name the on-screen button instead of a key. */
export const TOUCH: InputDevice = Object.freeze({ kind: 'touch' });

export function sameDevice(a: InputDevice, b: InputDevice): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'gamepad' || a.style === (b as { style: PadStyle }).style;
}

/** On-screen button names and icons, for touch prompts. */
const TOUCH_GLYPHS: Partial<Record<PromptAction, { label: string; svg: () => string }>> = {
  interact: { label: 'Interact', svg: () => INTERACT_ICON },
  action: { label: 'Interact', svg: () => INTERACT_ICON },
  rewind: { label: 'New echo', svg: () => icon('record') },
  restart: { label: 'Hold restart', svg: () => icon('restart') },
  timeline: { label: 'Timeline', svg: () => icon('clock') },
  preview: { label: 'Preview', svg: () => icon('eye') },
  pause: { label: 'Pause', svg: () => icon('pause') },
  echoCycle: { label: 'Timeline', svg: () => icon('echoSelect') },
};

function touchCapHTML(action: PromptAction, extraClass = ''): string {
  const cls = `rx-key rx-touchkey${extraClass ? ` ${extraClass}` : ''}`;
  if (action === 'move' || /^move/.test(action)) return `<span class="${cls} t-move" aria-label="Joystick"><i class="stick" aria-hidden="true"></i>Joystick</span>`;
  const g = TOUCH_GLYPHS[action] ?? (/^echo[1-5]$/.test(action) ? TOUCH_GLYPHS.echoCycle : undefined);
  if (!g) return `<span class="${cls}">${esc(action)}</span>`;
  return `<span class="${cls} t-${esc(action)}" aria-label="${esc(g.label)} button">${g.svg()}${esc(g.label)}</span>`;
}

function touchCapText(action: PromptAction): string {
  if (action === 'move' || /^move/.test(action)) return 'Joystick';
  const g = TOUCH_GLYPHS[action] ?? (/^echo[1-5]$/.test(action) ? TOUCH_GLYPHS.echoCycle : undefined);
  return g ? `${g.label} button` : action;
}

export const PAD_STYLE_NAMES: Record<PadStyle, string> = { xbox: 'Xbox-style', playstation: 'PlayStation', nintendo: 'Switch Pro' };

/** Standard button index for a prompt action on a pad (null = unbound). 'move' / 'echoCycle' have their own caps. */
export function padButtonFor(padbinds: PadBindings, action: BindableAction): number | null {
  switch (action) {
    case 'interact':
    case 'action':
    case 'rewind':
    case 'restart':
    case 'timeline':
    case 'preview':
      return padbinds[action];
    case 'pause':
      return PAD.MENU;
    default:
      return null;
  }
}

/** Round (face button / stick) or pill cap for one standard button. */
export function padCapHTML(index: number | null, style: PadStyle, extraClass = ''): string {
  if (index === null) return `<span class="rx-key rx-padkey${extraClass ? ` ${extraClass}` : ''}" aria-label="unbound">—</span>`;
  const role = faceRole(index);
  const cls = ['rx-key', 'rx-padkey', `rx-pad-${style}`];
  if (role) cls.push('face', `f-${role}`);
  if (index >= PAD.UP && index <= PAD.RIGHT) cls.push('face');
  if (extraClass) cls.push(extraClass);
  return `<span class="${cls.join(' ')}" aria-label="${esc(padButtonName(index, style))}">${esc(padButtonLabel(index, style))}</span>`;
}

function stickCap(style: PadStyle, side: 'L' | 'R' = 'L'): string {
  return `<span class="rx-key rx-padkey rx-pad-${style} face stick" aria-label="${side === 'L' ? 'Left' : 'Right'} stick">${side}</span>`;
}

/** HTML key cap(s) for an action, for the current device. */
export function capHTML(ctx: GlyphContext, action: PromptAction, extraClass = ''): string {
  const d = ctx.device;
  if (d.kind === 'keyboard') {
    const label = action === 'move' ? movementLabel(ctx.keybinds) : action === 'echoCycle' ? '1–5' : primaryLabel(ctx.keybinds, action);
    return `<span class="rx-key${extraClass ? ` ${extraClass}` : ''}">${esc(label)}</span>`;
  }
  if (d.kind === 'touch') return touchCapHTML(action, extraClass);
  if (action === 'move') return stickCap(d.style);
  if (action === 'echoCycle' || /^echo[1-5]$/.test(action)) return padCapHTML(ctx.padbinds.echoPrev, d.style, extraClass) + padCapHTML(ctx.padbinds.echoNext, d.style, extraClass);
  return padCapHTML(padButtonFor(ctx.padbinds, action), d.style, extraClass);
}

/** Plain-text label of an action's control (aria text, tooltips). */
export function capText(ctx: GlyphContext, action: PromptAction): string {
  const d = ctx.device;
  if (d.kind === 'keyboard') return action === 'move' ? movementLabel(ctx.keybinds) : action === 'echoCycle' ? '1–5' : primaryLabel(ctx.keybinds, action);
  if (d.kind === 'touch') return touchCapText(action);
  if (action === 'move') return 'Left stick';
  if (action === 'echoCycle' || /^echo[1-5]$/.test(action)) return `${label(ctx.padbinds.echoPrev, d.style)} / ${label(ctx.padbinds.echoNext, d.style)}`;
  const b = padButtonFor(ctx.padbinds, action);
  return action === 'restart' ? `Hold ${label(b, d.style)}` : label(b, d.style);
}

function label(i: number | null, style: PadStyle): string {
  return i === null ? '—' : padButtonName(i, style);
}

/** Default context (keyboard, default bindings) for components created before the app supplies one. */
export function defaultGlyphs(keybinds: KeyBindings): GlyphContext {
  return { device: KEYBOARD, keybinds, padbinds: defaultPadBindings() };
}

/**
 * Static markup for one controller button in every glyph family; CSS shows only the family of the active pad
 * (`data-input` on the UI root). For screens built once (menu footer, intro card) that must still follow the device.
 */
export function padHintHTML(index: number): string {
  return (['xbox', 'playstation', 'nintendo'] as const).map((st) => padCapHTML(index, st, `rx-gl-${st}`)).join('');
}

/** Keyboard-only and gamepad-only variants of a hint (swapped by the `.rx-pad` root class). */
export function deviceHintHTML(keyboardHTML: string, padHTML: string): string {
  return `<span class="rx-kb-only">${keyboardHTML}</span><span class="rx-pad-only">${padHTML}</span>`;
}

/** Glyph CSS (injected once beside the main UI stylesheet). */
export const GLYPH_CSS = `
.rx-key.rx-padkey { font-family: var(--rx-display); letter-spacing: .04em; }
.rx-key.rx-padkey.face { min-width: 1.95em; width: 1.95em; height: 1.95em; padding: 0; border-radius: 50%; border-bottom-width: 1px; letter-spacing: 0; }
.rx-key.rx-padkey.face.stick { border-style: double; border-width: 3px; }
.rx-key.rx-padkey.f-a { color: #7ef08a; border-color: rgba(126,240,138,.6); background: radial-gradient(circle at 50% 35%, rgba(126,240,138,.22), rgba(0,0,0,.3)); }
.rx-key.rx-padkey.f-b { color: #ff7b6e; border-color: rgba(255,123,110,.6); background: radial-gradient(circle at 50% 35%, rgba(255,123,110,.22), rgba(0,0,0,.3)); }
.rx-key.rx-padkey.f-x { color: #6cb6ff; border-color: rgba(108,182,255,.6); background: radial-gradient(circle at 50% 35%, rgba(108,182,255,.22), rgba(0,0,0,.3)); }
.rx-key.rx-padkey.f-y { color: #ffd65a; border-color: rgba(255,214,90,.6); background: radial-gradient(circle at 50% 35%, rgba(255,214,90,.22), rgba(0,0,0,.3)); }
.rx-key.rx-padkey.rx-pad-playstation.face:not(.stick) { font-family: system-ui, sans-serif; font-weight: 700; }
.rx-key.rx-padkey.rx-pad-playstation.f-a { color: #8fb2ff; border-color: rgba(143,178,255,.6); background: radial-gradient(circle at 50% 35%, rgba(143,178,255,.22), rgba(0,0,0,.3)); }
.rx-key.rx-padkey.rx-pad-playstation.f-b { color: #ff6f7d; }
.rx-key.rx-padkey.rx-pad-playstation.f-x { color: #f19be6; border-color: rgba(241,155,230,.6); background: radial-gradient(circle at 50% 35%, rgba(241,155,230,.2), rgba(0,0,0,.3)); }
.rx-key.rx-padkey.rx-pad-playstation.f-y { color: #45e0b2; border-color: rgba(69,224,178,.6); background: radial-gradient(circle at 50% 35%, rgba(69,224,178,.2), rgba(0,0,0,.3)); }
.rx-key.rx-padkey.rx-pad-nintendo.face:not(.stick) { color: #e8eef6; border-color: rgba(232,238,246,.5); background: radial-gradient(circle at 50% 35%, rgba(232,238,246,.14), rgba(0,0,0,.3)); }
.rx-key.rx-padkey + .rx-key.rx-padkey { margin-left: .25em; }
.rx-root:not([data-input="xbox"]) .rx-gl-xbox, .rx-root:not([data-input="playstation"]) .rx-gl-playstation, .rx-root:not([data-input="nintendo"]) .rx-gl-nintendo { display: none; }
.rx-pad-only { align-items: center; gap: .35em; }
.rx-menu-foot .rx-key.rx-padkey + .rx-key.rx-padkey { margin-left: .2em; }
`;

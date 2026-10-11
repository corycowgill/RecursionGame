import { PAD, PAD_BUTTON_COUNT } from './gamepadMapping';

/**
 * GAMEPAD BINDINGS — remappable controller layout, persisted in the save next to the key bindings
 * (`SaveData.padbinds`). One button per action; a button belongs to at most one action (assigning it elsewhere
 * removes it from its previous owner, reported as `displaced`).
 *
 * Fixed (not remappable) so nobody can lock themselves out: left stick + D-pad move / navigate, Menu/Start pauses,
 * and in menus the bottom face button confirms and the right face button goes back.
 */

export const PAD_ACTIONS = ['interact', 'action', 'rewind', 'restart', 'timeline', 'preview', 'echoPrev', 'echoNext'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];
export type PadBindings = Record<PadAction, number | null>;

export const PAD_ACTION_LABELS: Record<PadAction, string> = {
  interact: 'Interact',
  action: 'Context action',
  rewind: 'Rewind / create echo',
  restart: 'Restart chamber (hold)',
  timeline: 'Temporal timeline',
  preview: 'Temporal preview (hold)',
  echoPrev: 'Previous echo',
  echoNext: 'Next echo',
};

export const DEFAULT_PAD_BINDINGS: Readonly<PadBindings> = Object.freeze({
  interact: PAD.A,
  action: PAD.B,
  rewind: PAD.Y,
  restart: PAD.X,
  timeline: PAD.VIEW,
  preview: PAD.LT,
  echoPrev: PAD.LB,
  echoNext: PAD.RB,
});

/** Buttons that can never be bound: D-pad (movement / navigation), Menu (pause) and Home (owned by the OS). */
export const RESERVED_PAD_BUTTONS: readonly number[] = [PAD.UP, PAD.DOWN, PAD.LEFT, PAD.RIGHT, PAD.MENU, PAD.HOME];

export function defaultPadBindings(): PadBindings {
  return { ...DEFAULT_PAD_BINDINGS };
}

export function isBindablePadButton(b: unknown): b is number {
  return typeof b === 'number' && Number.isInteger(b) && b >= 0 && b < PAD_BUTTON_COUNT && !RESERVED_PAD_BUTTONS.includes(b);
}

/** Coerces unknown data (old or hand-edited save) into a complete, conflict-free table. First owner wins. */
export function sanitizePadBindings(raw: unknown): PadBindings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as PadBindings;
  const used = new Set<number>();
  for (const a of PAD_ACTIONS) {
    const v = a in src ? src[a] : DEFAULT_PAD_BINDINGS[a];
    if (isBindablePadButton(v) && !used.has(v)) {
      used.add(v);
      out[a] = v;
    } else out[a] = null;
  }
  return out;
}

/** Assigns `button` to `action` (returns a NEW table). A previous owner of the button is unbound and reported. */
export function assignPadButton(binds: PadBindings, action: PadAction, button: number): { binds: PadBindings; displaced: PadAction | null } {
  if (!isBindablePadButton(button)) return { binds, displaced: null };
  const next = { ...binds };
  let displaced: PadAction | null = null;
  for (const a of PAD_ACTIONS) {
    if (a !== action && next[a] === button) {
      next[a] = null;
      displaced = a;
    }
  }
  next[action] = button;
  return { binds: next, displaced };
}

/** The action bound to a button, or null. */
export function padActionFor(binds: PadBindings, button: number): PadAction | null {
  for (const a of PAD_ACTIONS) if (binds[a] === button) return a;
  return null;
}

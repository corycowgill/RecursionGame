/**
 * KEY BINDINGS — remappable keyboard layout for every player-facing action (persisted in the save).
 *
 * A binding is a KeyboardEvent.code, optionally prefixed with "Shift+" (e.g. "KeyR", "Shift+KeyR"). Each action
 * has up to MAX_BINDINGS_PER_ACTION bindings (primary + alternate). A binding belongs to at most one action:
 * assigning it elsewhere removes it from its previous owner (reported as `displaced`).
 *
 * The browser input layer resolves events with `resolveKeyAction(bindings, code, shiftKey)`.
 */

export const BINDABLE_ACTIONS = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'interact',
  'action',
  'rewind',
  'restart',
  'timeline',
  'pause',
  'preview',
  'echo1',
  'echo2',
  'echo3',
  'echo4',
  'echo5',
] as const;

export type BindableAction = (typeof BINDABLE_ACTIONS)[number];
export type KeyBindings = Record<BindableAction, string[]>;

export const MAX_BINDINGS_PER_ACTION = 2;

export const ACTION_LABELS: Record<BindableAction, string> = {
  moveUp: 'Move forward',
  moveDown: 'Move back',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  interact: 'Interact',
  action: 'Context action',
  rewind: 'Rewind / create echo',
  restart: 'Restart chamber',
  timeline: 'Temporal timeline',
  pause: 'Pause',
  preview: 'Temporal preview (hold)',
  echo1: 'Select echo 1',
  echo2: 'Select echo 2',
  echo3: 'Select echo 3',
  echo4: 'Select echo 4',
  echo5: 'Select echo 5',
};

/** Groups for the settings screen. */
export const ACTION_GROUPS: { title: string; actions: BindableAction[] }[] = [
  { title: 'Movement', actions: ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] },
  { title: 'Interaction', actions: ['interact', 'action'] },
  { title: 'Time', actions: ['rewind', 'restart', 'timeline', 'preview', 'pause'] },
  { title: 'Echo select', actions: ['echo1', 'echo2', 'echo3', 'echo4', 'echo5'] },
];

/** Escape always remains a pause / back key even if rebound (players can never lock themselves out). */
export const RESERVED_CODES: readonly string[] = ['Escape'];

export const DEFAULT_KEYBINDS: Readonly<KeyBindings> = Object.freeze({
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  interact: ['KeyE'],
  action: ['Space'],
  rewind: ['KeyR'],
  restart: ['Shift+KeyR'],
  timeline: ['Tab'],
  pause: ['Escape'],
  preview: ['KeyQ'],
  echo1: ['Digit1'],
  echo2: ['Digit2'],
  echo3: ['Digit3'],
  echo4: ['Digit4'],
  echo5: ['Digit5'],
});

export function defaultKeybinds(): KeyBindings {
  const out = {} as KeyBindings;
  for (const a of BINDABLE_ACTIONS) out[a] = [...DEFAULT_KEYBINDS[a]];
  return out;
}

const BINDING_RE = /^(Shift\+)?[A-Za-z][A-Za-z0-9]*$/;

export function isValidBinding(b: unknown): b is string {
  return typeof b === 'string' && b.length <= 32 && BINDING_RE.test(b);
}

/** Builds the binding string for a key event. Modifier keys alone are not bindable (returns null). */
export function bindingFromEvent(code: string, shiftKey: boolean): string | null {
  if (!code || /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code) || code === 'CapsLock') return null;
  const b = shiftKey ? `Shift+${code}` : code;
  return isValidBinding(b) ? b : null;
}

/**
 * Coerces unknown data (e.g. an old or hand-edited save) into a complete, conflict-free binding table. Unknown
 * actions are dropped, missing actions get defaults, invalid/duplicate bindings are removed (first owner wins in
 * BINDABLE_ACTIONS order).
 */
export function sanitizeKeybinds(raw: unknown): KeyBindings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as KeyBindings;
  const used = new Set<string>();
  for (const a of BINDABLE_ACTIONS) {
    const list = Array.isArray(src[a]) ? (src[a] as unknown[]) : [...DEFAULT_KEYBINDS[a]];
    const clean: string[] = [];
    for (const b of list) {
      if (!isValidBinding(b) || used.has(b) || clean.length >= MAX_BINDINGS_PER_ACTION) continue;
      used.add(b);
      clean.push(b);
    }
    out[a] = clean;
  }
  return out;
}

/**
 * Assigns `binding` to `action` at `slot` (0 = primary, 1 = alternate). Returns a NEW table; the input is not
 * modified. If another action owned the binding it loses it and is reported in `displaced`.
 */
export function assignBinding(
  binds: KeyBindings,
  action: BindableAction,
  slot: number,
  binding: string,
): { binds: KeyBindings; displaced: BindableAction | null } {
  if (!isValidBinding(binding)) return { binds, displaced: null };
  const next = {} as KeyBindings;
  let displaced: BindableAction | null = null;
  for (const a of BINDABLE_ACTIONS) {
    const list = binds[a].filter((b) => b !== binding);
    if (a !== action && list.length !== binds[a].length) displaced = a;
    next[a] = list;
  }
  const own = [...next[action]];
  const s = Math.max(0, Math.min(MAX_BINDINGS_PER_ACTION - 1, Math.floor(slot)));
  if (s < own.length) own[s] = binding;
  else own.push(binding);
  next[action] = own.slice(0, MAX_BINDINGS_PER_ACTION);
  return { binds: next, displaced };
}

/** Removes the binding at `slot` of `action` (returns a new table). */
export function clearBinding(binds: KeyBindings, action: BindableAction, slot: number): KeyBindings {
  const next = { ...binds, [action]: binds[action].filter((_, i) => i !== slot) } as KeyBindings;
  return next;
}

/**
 * Resolves a key press to an action. A "Shift+code" binding takes priority over a plain "code" binding, so
 * Shift+R restarts while R rewinds; with no Shift binding, plain bindings still match while Shift is held
 * (Shift+W keeps walking).
 */
export function resolveKeyAction(binds: KeyBindings, code: string, shiftKey: boolean): BindableAction | null {
  const exact = shiftKey ? `Shift+${code}` : code;
  for (const a of BINDABLE_ACTIONS) if (binds[a].includes(exact)) return a;
  if (shiftKey) for (const a of BINDABLE_ACTIONS) if (binds[a].includes(code)) return a;
  if (RESERVED_CODES.includes(code)) return 'pause';
  return null;
}

const CODE_NAMES: Record<string, string> = {
  Space: 'Space',
  Escape: 'Esc',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Bksp',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** Human label for a single code ("KeyR" -> "R", "ArrowUp" -> "↑", "Numpad4" -> "Num 4"). */
export function codeLabel(code: string): string {
  if (CODE_NAMES[code]) return CODE_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.replace(/(Left|Right)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Human label for a binding ("Shift+KeyR" -> "Shift + R"). */
export function bindingLabel(binding: string | undefined): string {
  if (!binding) return '—';
  return binding.startsWith('Shift+') ? `Shift + ${codeLabel(binding.slice(6))}` : codeLabel(binding);
}

/** Label of the primary binding of an action (for HUD control hints and prompts). */
export function primaryLabel(binds: KeyBindings, action: BindableAction): string {
  return bindingLabel(binds[action][0]);
}

/** Compact movement label: "WASD" when the defaults are in use, otherwise the four primary keys. */
export function movementLabel(binds: KeyBindings): string {
  const keys = (['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const).map((a) => primaryLabel(binds, a));
  return keys.every((k) => k.length === 1) ? keys.join('') : keys.join(' ');
}

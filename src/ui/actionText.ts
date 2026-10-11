import { BINDABLE_ACTIONS, type BindableAction } from '../persistence/keybinds';
import { esc } from './dom';
import { capHTML, capText, type GlyphContext, type PromptAction } from './glyphs';

/**
 * DEVICE-AWARE AUTHORED TEXT (round 4) — level hints, story lines and UI copy never name a key. They name an
 * ACTION with a token, and the token is drawn for the device the player used last (key cap with the player's own
 * binding, Xbox / PlayStation / Switch glyph, or the on-screen touch button) through the glyphs module:
 *
 *   {interact}  E / A / ✕ / "Interact"        {action}    Space / B / ○ / "Action"
 *   {echo}      R / Y / △ / "New echo"         {restart}   Shift+R / hold X / "Hold restart"
 *   {timeline}  Tab / View / "Timeline"        {preview}   Q / LT / "Preview"
 *   {pause}     Esc / Menu / "Pause"           {move}      WASD / left stick / "Joystick"
 *
 * `{rewind}` is an alias of `{echo}`, and the onboarding cards' older `{key:<action>}` form is accepted for any
 * bindable action. `findRawKeyReferences` is the lint used by the unit tests: authored text must not contain a
 * hardcoded key ("Press E", "R to rewind", "Space", …).
 */

export const ACTION_TOKENS: Readonly<Record<string, PromptAction>> = Object.freeze({
  interact: 'interact',
  action: 'action',
  echo: 'rewind',
  rewind: 'rewind',
  restart: 'restart',
  timeline: 'timeline',
  preview: 'preview',
  pause: 'pause',
  move: 'move',
});

const BINDABLE: ReadonlySet<string> = new Set(BINDABLE_ACTIONS);
/** `{name}` or `{key:name}` (names are lower camel case). */
const TOKEN_RE = /\{(key:)?([a-zA-Z][a-zA-Z0-9]*)\}/g;

/** Action a token names, or null for an unknown token. */
export function tokenAction(name: string, keyForm = false): PromptAction | null {
  if (keyForm) return BINDABLE.has(name) || name === 'move' ? (name as BindableAction | 'move') : null;
  return ACTION_TOKENS[name] ?? null;
}

/** Every `{…}` token in `text` that does not resolve to an action (authoring mistakes). */
export function unknownTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) if (!tokenAction(m[2] as string, !!m[1])) out.push(m[0]);
  // A brace that is not part of a well-formed token is also a mistake.
  const stripped = text.replace(TOKEN_RE, '');
  if (/[{}]/.test(stripped)) out.push(stripped.match(/[{}][^{}]{0,12}/)?.[0] ?? '{');
  return out;
}

/** True when the text uses at least one action token. */
export function hasActionTokens(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}

/** HTML for authored text: escaped, with every action token replaced by an inline glyph for the current device. */
export function actionTextHTML(text: string, g: GlyphContext): string {
  return esc(text).replace(TOKEN_RE, (whole, keyForm: string | undefined, name: string) => {
    const a = tokenAction(name, !!keyForm);
    return a ? capHTML(g, a, 'rx-inline') : esc(whole);
  });
}

/** Plain text for authored text (aria labels, announcements): tokens become the control's name. */
export function actionTextPlain(text: string, g: GlyphContext): string {
  return text.replace(TOKEN_RE, (whole, keyForm: string | undefined, name: string) => {
    const a = tokenAction(name, !!keyForm);
    return a ? capText(g, a) : whole;
  });
}

// ---------------------------------------------------------------------------------------------------------- lint

/** A single-letter key or a named key that players press. */
const KEY_NAME = String.raw`(?:[A-Z0-9]|Tab|Space(?:bar)?|Esc(?:ape)?|Enter|Return|Shift(?:\s*\+\s*[A-Z])?|Ctrl|Alt|Delete|Backspace|Arrow\w*)`;
const RAW_KEY_PATTERNS: readonly RegExp[] = [
  // "Press E", "pressing E", "hold Q", "tap Space", "hit R", "press the E key"
  new RegExp(String.raw`\b(?:[Pp]ress(?:es|ing)?|[Hh]old(?:s|ing)?|[Tt]ap(?:s|ping)?|[Hh]it(?:s|ting)?|[Uu]se)\s+(?:the\s+)?${KEY_NAME}(?![\w-])`),
  // "R to rewind", "E again", "Q key", "E button"
  /\b[A-Z]\s+(?:to|again|key|button)\b/,
  // "key R", "button E"
  /\b(?:[Kk]ey|[Bb]utton)\s+[A-Z]\b/,
  // Named keys anywhere ("Space", "Tab", "Esc", "Shift+R", "Spacebar", "Enter")
  /\b(?:Tab|Space(?:bar)?|Esc(?:ape)?|Shift|Enter|Ctrl)\b/,
  // WASD / arrow keys
  /\bWASD\b|\barrow keys?\b/i,
];

/** Hardcoded key references in authored text (empty = clean). Tokens are removed before checking. */
export function findRawKeyReferences(text: string): string[] {
  const clean = text.replace(TOKEN_RE, ' ');
  const out: string[] = [];
  for (const re of RAW_KEY_PATTERNS) {
    const m = clean.match(re);
    if (m) out.push(m[0]);
  }
  return out;
}

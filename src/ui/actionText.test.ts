// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { LevelDefinition } from '../engine/contracts';
import { defaultPadBindings } from '../engine/input/gamepadBindings';
import { PAD } from '../engine/input/gamepadMapping';
import { CAMPAIGN_LEVELS, TEST_LEVELS } from '../levels/definitions';
import { assignBinding, defaultKeybinds } from '../persistence/keybinds';
import { actionTextHTML, actionTextPlain, findRawKeyReferences, hasActionTokens, unknownTokens } from './actionText';
import { KEYBOARD, TOUCH, type GlyphContext } from './glyphs';
import { ONBOARDING } from './hud/onboarding';

/** Every player-facing string authored in a level: name, subtitle, story, hints and entity config/label text. */
function authoredText(level: LevelDefinition): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [
    { where: 'name', text: level.name },
    ...(level.subtitle ? [{ where: 'subtitle', text: level.subtitle }] : []),
    ...(level.story ?? []).map((text, i) => ({ where: `story[${i}]`, text })),
    ...level.hints.map((h, i) => ({ where: `hints[${i}]`, text: h.text })),
  ];
  const walk = (v: unknown, where: string): void => {
    if (typeof v === 'string') out.push({ where, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  for (const e of level.entities) {
    if (e.label) walk(e.label, `${e.id}.label`);
    walk(e.config, `${e.id}.config`);
  }
  return out;
}

const glyphs = (device: GlyphContext['device'], keybinds = defaultKeybinds()): GlyphContext => ({ device, keybinds, padbinds: defaultPadBindings() });

describe('authored text never hardcodes a key (device-aware hints, round 4)', () => {
  const levels = [...CAMPAIGN_LEVELS, ...TEST_LEVELS];

  it('the lint catches the hardcoded forms the old hints used', () => {
    for (const bad of [
      'Press R to rewind.',
      'Press E facing the crate, and E again to set it down.',
      'push into the door pressing E every second',
      'Carry the cell in and press E — done.',
      'Hold Q to preview.',
      'Press Shift+R to restart',
      'Tap Space to act',
      'Open the timeline with Tab',
      'Esc pauses',
      'Use WASD to move',
    ])
      expect(findRawKeyReferences(bad), bad).not.toEqual([]);
  });

  it('the lint does not flag ordinary prose or action tokens', () => {
    for (const ok of [
      'Echo 1: hold the Hall Plate briefly, then push into the Archive Door pressing {interact} every second.',
      'Press {echo} to rewind.',
      'Follow the light: the Relay Switch fires Laser A, Receiver A fires Laser B.',
      'Hold the Feed Plate for 6 s, then push north.',
      'Echo 3: press the East Timer with Echo 2. You: ride the lift.',
      'A second echo can walk through behind it.',
    ])
      expect(findRawKeyReferences(ok), ok).toEqual([]);
  });

  it('no level text (all 10 chambers + test chamber) contains a raw key reference or an unknown token', () => {
    const problems: string[] = [];
    for (const l of levels)
      for (const { where, text } of authoredText(l)) {
        for (const m of findRawKeyReferences(text)) problems.push(`${l.id} ${where}: hardcoded key "${m}" in "${text}"`);
        for (const m of unknownTokens(text)) problems.push(`${l.id} ${where}: unknown token "${m}" in "${text}"`);
      }
    expect(problems).toEqual([]);
  });

  it('tutorial (onboarding) cards use tokens too', () => {
    const problems: string[] = [];
    for (const [order, t] of Object.entries(ONBOARDING))
      for (const s of t.steps) {
        for (const m of [...findRawKeyReferences(s.title), ...findRawKeyReferences(s.text)]) problems.push(`L${order} ${s.id}: "${m}"`);
        for (const m of unknownTokens(s.text)) problems.push(`L${order} ${s.id}: unknown token ${m}`);
      }
    expect(problems).toEqual([]);
  });

  it('the hints that name a control use tokens (L01 rewind, L03 / L07 / L10 interact)', () => {
    const byOrder = (n: number): LevelDefinition => CAMPAIGN_LEVELS.find((l) => l.order === n) as LevelDefinition;
    expect(byOrder(1).hints.some((h) => h.text.includes('{echo}'))).toBe(true);
    for (const n of [3, 7, 10]) expect(byOrder(n).hints.some((h) => h.text.includes('{interact}')), `L${n}`).toBe(true);
    expect(byOrder(2).hints.some((h) => hasActionTokens(h.text))).toBe(false);
  });
});

describe('action tokens render for the active device', () => {
  const text = 'Press {interact} at the crate, {echo} to rewind, {action} for the context action.';

  it('keyboard: key caps with the player’s own bindings', () => {
    const html = actionTextHTML(text, glyphs(KEYBOARD));
    expect(html).toContain('<span class="rx-key rx-inline">E</span>');
    expect(html).toContain('<span class="rx-key rx-inline">R</span>');
    expect(html).toContain('<span class="rx-key rx-inline">Space</span>');
    expect(html).not.toContain('{');
    const remapped = assignBinding(defaultKeybinds(), 'interact', 0, 'KeyF').binds;
    expect(actionTextHTML('{interact}', glyphs(KEYBOARD, remapped))).toContain('>F<');
    expect(actionTextPlain(text, glyphs(KEYBOARD))).toBe('Press E at the crate, R to rewind, Space for the context action.');
  });

  it('controllers: Xbox letters, PlayStation shapes (following remapped pad buttons)', () => {
    const xbox = actionTextHTML(text, glyphs({ kind: 'gamepad', style: 'xbox' }));
    expect(xbox).toContain('rx-padkey');
    expect(xbox).toMatch(/aria-label="A">A</);
    expect(xbox).toMatch(/aria-label="Y">Y</);
    expect(xbox).toMatch(/aria-label="B">B</);
    const ps = actionTextPlain(text, glyphs({ kind: 'gamepad', style: 'playstation' }));
    expect(ps).toMatch(/Cross/);
    expect(ps).toMatch(/Triangle/);
    const g = glyphs({ kind: 'gamepad', style: 'xbox' });
    g.padbinds = { ...g.padbinds, rewind: PAD.RB };
    expect(actionTextPlain('{echo}', g)).toBe('RB');
  });

  it('touch: the on-screen button names (Action has its own button)', () => {
    const html = actionTextHTML(text, glyphs(TOUCH));
    expect(html).toContain('rx-touchkey');
    expect(actionTextPlain(text, glyphs(TOUCH))).toBe('Press Interact button at the crate, New echo button to rewind, Action button for the context action.');
  });

  it('escapes authored text, keeps the older {key:action} form and leaves unknown tokens visible', () => {
    expect(actionTextHTML('<b>{key:timeline}</b> {nope}', glyphs(KEYBOARD))).toBe('&lt;b&gt;<span class="rx-key rx-inline">Tab</span>&lt;/b&gt; {nope}');
    expect(unknownTokens('{nope} {interact} {key:rewind} {key:bogus} {open')).toEqual(['{nope}', '{key:bogus}', '{open']);
  });
});

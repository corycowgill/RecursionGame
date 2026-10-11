// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameCommand, LevelDefinition } from '../engine/contracts';
import { PAD } from '../engine/input/gamepadMapping';
import type { InteractionPrompt } from '../gameplay/interactions/targeting';
import { CAMPAIGN_LEVELS } from '../levels/definitions';
import { compileSolution, createGame, playScript } from '../testing/harness/harness';
import { createUI, type UIHandle } from './createUI';
import { KEYBOARD } from './glyphs';
import { ACTION_KINDS, actionButtonVisible, levelUsesAction } from './touch/actionButton';
import type { TouchEnv } from './touch/env';
import { JOYSTICK_RADIUS } from './touch/joystick';
import type { TouchSink } from './touch/TouchControls';
import type { UIFrame } from './types';

/**
 * Round 4 UX / input: device-aware hint cards, the touch Action button, the short-screen hint chip and the
 * keyboard-rebind cancel rules.
 */

const L1 = CAMPAIGN_LEVELS[0] as LevelDefinition;
const L5 = CAMPAIGN_LEVELS.find((l) => l.order === 5) as LevelDefinition;
const IPHONE: TouchEnv = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  maxTouchPoints: 5,
  coarsePointer: true,
  noHover: true,
  standalone: false,
  webdriver: false,
};

function frame(level: LevelDefinition, prompt: InteractionPrompt | null = null): UIFrame {
  const game = createGame(level);
  game.setLoops(compileSolution(level).slice(0, -1));
  playScript(game, [{ op: 'wait', ticks: 30 }]);
  return { level, state: game.getState(), timeline: game.getTimeline(), prompt, dt: 0 };
}

const switchPrompt: InteractionPrompt = { action: 'use', entityId: 'sw', entityKind: 'timedSwitch', label: 'Activate switch', cell: { col: 1, row: 1 } };
const cratePrompt: InteractionPrompt = { action: 'pickup', entityId: 'c', entityKind: 'crate', label: 'Pick up crate', cell: { col: 1, row: 1 } };

function pointer(el: Element, type: string, id: number, x = 10, y = 10): void {
  const PE = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent;
  const init = { bubbles: true, cancelable: true, pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0, isPrimary: id === 1 } as PointerEventInit;
  el.dispatchEvent(PE ? new PE(type, init) : Object.assign(new MouseEvent(type, init), { pointerId: id, pointerType: 'touch' }));
}

describe('touch Action button relevance (pure)', () => {
  it('timed switches answer the context action; crates and plates do not', () => {
    expect(ACTION_KINDS.has('timedSwitch')).toBe(true);
    expect(ACTION_KINDS.has('crate')).toBe(false);
    expect(ACTION_KINDS.has('pressurePlate')).toBe(false);
  });

  it('shows only while facing such an entity, unless the level itself uses the action', () => {
    expect(levelUsesAction(L5)).toBe(false);
    expect(actionButtonVisible({ level: L5, promptActive: false, entityKind: null })).toBe(false);
    expect(actionButtonVisible({ level: L5, promptActive: true, entityKind: 'crate' })).toBe(false);
    expect(actionButtonVisible({ level: L5, promptActive: true, entityKind: 'timedSwitch' })).toBe(true);
    expect(actionButtonVisible({ level: L5, promptActive: false, entityKind: 'timedSwitch' })).toBe(false); // blocked / no prompt
    const withAction: LevelDefinition = { ...L5, solution: [[{ op: 'action' }]] };
    expect(levelUsesAction(withAction)).toBe(true);
    expect(actionButtonVisible({ level: withAction, promptActive: false, entityKind: null })).toBe(true);
  });
});

describe('touch UI (iPhone)', () => {
  let root: HTMLElement;
  let ui: UIHandle;
  let actions: number;
  let interacts: boolean[];
  let cmds: GameCommand[];
  let mm: ReturnType<typeof vi.spyOn> | null = null;

  const shortScreen = (on: boolean): void => {
    mm?.mockRestore();
    mm = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: on && /max-height:\s*360px/.test(q), media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList);
  };

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    ui = createUI(root, {}, { touchEnv: IPHONE });
    actions = 0;
    interacts = [];
    cmds = [];
    const sink: TouchSink = {
      move: () => undefined,
      interact: (d) => interacts.push(d),
      action: () => actions++,
      command: (c) => cmds.push(c),
      zoom: () => undefined,
      overview: () => undefined,
    };
    ui.touch.setSink(sink);
  });

  afterEach(() => {
    mm?.mockRestore();
    mm = null;
    ui.dispose();
    root.remove();
  });

  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => root.querySelector(sel) as T;
  const actionBtn = (): HTMLButtonElement => q<HTMLButtonElement>('[data-testid="touch-action"]');

  it('the Action button is hidden by default, appears facing a timed switch, and a tap latches one action', () => {
    ui.showHUD(L5, { tutorial: false });
    ui.update(frame(L5));
    expect(actionBtn().classList.contains('avail')).toBe(false);
    expect(actionBtn().getAttribute('aria-hidden')).toBe('true');
    pointer(actionBtn(), 'pointerdown', 4); // ignored while hidden
    expect(actions).toBe(0);

    ui.update(frame(L5, cratePrompt));
    expect(actionBtn().classList.contains('avail')).toBe(false);
    ui.update(frame(L5, switchPrompt));
    expect(actionBtn().classList.contains('avail')).toBe(true);
    expect(actionBtn().getAttribute('aria-hidden')).toBe('false');
    pointer(actionBtn(), 'pointerdown', 5);
    pointer(actionBtn(), 'pointerup', 5);
    expect(actions).toBe(1);
    expect(interacts).toEqual([]); // separate from Interact
    expect(cmds).toEqual([]);

    ui.update(frame(L5, { ...switchPrompt, action: 'blocked', label: 'Switch cooling down' }));
    expect(actionBtn().classList.contains('avail')).toBe(false);
  });

  it('hints render touch button names, and switch to key caps / pad glyphs with the device', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    ui.showHint('Press {echo} to rewind.', 1, 3);
    const p = (): HTMLElement => q('[data-testid="hint"] p');
    expect(p().querySelector('.rx-touchkey')?.textContent).toBe('New echo');
    ui.setInputDevice(KEYBOARD);
    expect(p().querySelector('.rx-key')?.textContent).toBe('R');
    expect(p().getAttribute('aria-label')).toBe('Press R to rewind.');
    ui.setInputDevice({ kind: 'gamepad', style: 'xbox' });
    expect(p().querySelector('.rx-padkey')?.textContent).toBe('Y');
    expect(p().textContent).not.toMatch(/\{echo\}/);
  });

  it('the pause menu hint list renders action tokens for the device', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    ui.showPause({ levelName: L1.name, levelOrder: 1, echoesUsed: 0, maxEchoes: 2 });
    q<HTMLButtonElement>('[data-testid="pause-reveal-hint"]').click();
    q<HTMLButtonElement>('[data-testid="pause-reveal-hint"]').click();
    const list = q('.rx-hintlist');
    expect(list.textContent).not.toMatch(/\{|Press R/);
    expect(list.querySelector('.rx-touchkey')?.textContent).toBe('New echo');
  });

  it('short screens: a new hint arrives as a chip, expands on tap, folds back when the joystick is used', () => {
    shortScreen(true);
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    ui.showHint('Press {echo} to rewind.', 1, 3);
    const card = q('[data-testid="hint"]');
    expect(card.hidden).toBe(false);
    expect(card.classList.contains('collapsed')).toBe(true);
    expect(card.classList.contains('fresh')).toBe(true);
    expect(card.getAttribute('aria-expanded')).toBe('false');
    card.click();
    expect(card.classList.contains('collapsed')).toBe(false);
    expect(card.getAttribute('aria-expanded')).toBe('true');
    // A finger on the joystick zone folds it back to the chip.
    const zone = q('[data-testid="touch-zone"]');
    pointer(zone, 'pointerdown', 1, 100, 300);
    pointer(zone, 'pointermove', 1, 100 + JOYSTICK_RADIUS, 300);
    expect(card.classList.contains('collapsed')).toBe(true);
    pointer(zone, 'pointerup', 1);
    // A device change keeps the chip collapsed.
    ui.setInputDevice(KEYBOARD);
    expect(card.classList.contains('collapsed')).toBe(true);
  });

  it('taller screens keep the full hint card (no auto-collapse)', () => {
    shortScreen(false);
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    ui.showHint('Step on the plate.', 0, 3);
    expect(q('[data-testid="hint"]').classList.contains('collapsed')).toBe(false);
  });
});

describe('keyboard rebind cancel rules (settings)', () => {
  let root: HTMLElement;
  let ui: UIHandle;
  const onKeybindsChange = vi.fn();

  beforeEach(() => {
    onKeybindsChange.mockReset();
    document.body.innerHTML = '<div id="ui"></div>';
    root = document.getElementById('ui') as HTMLElement;
    ui = createUI(root, { onKeybindsChange });
    ui.showSettings();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.rx-tab'))
      .find((b) => b.textContent === 'Controls')!
      .click();
  });
  afterEach(() => ui.dispose());

  const row = (a: string, slot = 0): HTMLButtonElement => root.querySelector(`.rx-bind[data-action="${a}"][data-slot="${slot}"]`) as HTMLButtonElement;
  const capturing = (): Element[] => Array.from(root.querySelectorAll('.rx-bind.capturing'));

  it('clicking another row while a rebind waits cancels it instead of starting a second one', () => {
    row('interact').click();
    expect(capturing().map((e) => (e as HTMLElement).dataset['action'])).toEqual(['interact']);
    row('rewind').click();
    expect(capturing()).toEqual([]);
    expect(root.textContent).toMatch(/Rebinding cancelled/);
    expect(document.activeElement).toBe(row('rewind'));
    // The next click starts a fresh rebind normally, and a key completes it.
    row('rewind').click();
    expect(capturing().map((e) => (e as HTMLElement).dataset['action'])).toEqual(['rewind']);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't', bubbles: true, cancelable: true }));
    expect(onKeybindsChange).toHaveBeenCalledTimes(1);
    expect(ui.keybinds.rewind[0]).toBe('KeyT');
  });

  it('clicking the waiting row again cancels it too', () => {
    row('interact').click();
    row('interact').click();
    expect(capturing()).toEqual([]);
    expect(onKeybindsChange).not.toHaveBeenCalled();
  });

  it('pad A (or any controller button) while a keyboard rebind waits cancels it and is consumed', () => {
    row('interact').focus();
    row('interact').click();
    expect(capturing()).toHaveLength(1);
    row('rewind').focus(); // D-pad moved focus to another row
    expect(ui.padInput({ type: 'button', button: 'a', index: PAD.A })).toBe(true);
    expect(capturing()).toEqual([]);
    expect(document.activeElement).toBe(row('rewind'));
    expect(ui.screen).toBe('settings');
    // With nothing pending, A activates the focused row as before.
    ui.padInput({ type: 'button', button: 'a', index: PAD.A });
    expect(capturing().map((e) => (e as HTMLElement).dataset['action'])).toEqual(['rewind']);
    // B while waiting cancels the rebind rather than closing Settings.
    expect(ui.padInput({ type: 'button', button: 'b', index: PAD.B })).toBe(true);
    expect(capturing()).toEqual([]);
    expect(ui.screen).toBe('settings');
    expect(onKeybindsChange).not.toHaveBeenCalled();
  });
});

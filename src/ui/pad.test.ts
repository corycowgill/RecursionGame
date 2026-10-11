// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDefinition } from '../engine/contracts';
import { PAD } from '../engine/input/gamepadMapping';
import { predictInteraction } from '../gameplay/interactions/targeting';
import { getObjectiveStatus } from '../gameplay/puzzles/objectives';
import { CAMPAIGN_LEVELS } from '../levels/definitions';
import { defaultKeybinds } from '../persistence/keybinds';
import { compileSolution, createGame, playScript } from '../testing/harness/harness';
import { createUI, type UIHandle } from './createUI';
import { capHTML, capText, KEYBOARD } from './glyphs';
import { pickInDirection } from './padNav';
import { defaultPadBindings } from '../engine/input/gamepadBindings';
import type { UIFrame } from './types';

const L1 = CAMPAIGN_LEVELS[0] as LevelDefinition;
const L3 = (CAMPAIGN_LEVELS[2] ?? L1) as LevelDefinition;

function frameAt(level: LevelDefinition, ticks: number): UIFrame {
  const loops = compileSolution(level);
  const game = createGame(level);
  game.setLoops(loops.slice(0, -1));
  playScript(game, [{ op: 'wait', ticks }]);
  const state = game.getState();
  return { level, state, timeline: game.getTimeline(), prompt: predictInteraction(level, state), objective: getObjectiveStatus(level, state), dt: 0 };
}

let root: HTMLElement;
let ui: UIHandle;
const cb = {
  onContinue: vi.fn(),
  onPadBindsChange: vi.fn(),
  onScrub: vi.fn(),
  onScrubEnd: vi.fn(),
  onToggleEchoVisibility: vi.fn(),
  onDeleteLoop: vi.fn(),
  onTimelineToggle: vi.fn(),
  onTogglePause: vi.fn(),
  onSelectEcho: vi.fn(),
};

beforeEach(() => {
  for (const f of Object.values(cb)) f.mockReset();
  document.body.innerHTML = '<div id="ui"></div>';
  root = document.getElementById('ui') as HTMLElement;
  ui = createUI(root, cb);
});
afterEach(() => ui.dispose());

const nav = (dir: 'up' | 'down' | 'left' | 'right') => ui.padInput({ type: 'nav', dir, repeat: false, heldMs: 0 });
const btn = (button: 'a' | 'b' | 'x' | 'y' | 'rb', index: number) => ui.padInput({ type: 'button', button, index });
const menuData = { continueLevel: { id: L1.id, order: 1, name: L1.name }, levels: [], totalStars: 0, maxStars: 30 };

describe('button-prompt glyphs', () => {
  it('follow the device: keyboard caps, Xbox letters, PlayStation shapes, Switch letters', () => {
    const ctx = { device: KEYBOARD, keybinds: defaultKeybinds(), padbinds: defaultPadBindings() };
    expect(capText(ctx, 'interact')).toBe('E');
    expect(capText(ctx, 'move')).toBe('WASD');
    const xbox = { ...ctx, device: { kind: 'gamepad' as const, style: 'xbox' as const } };
    expect(capText(xbox, 'interact')).toBe('A');
    expect(capText(xbox, 'rewind')).toBe('Y');
    expect(capText(xbox, 'restart')).toBe('Hold X');
    expect(capHTML(xbox, 'interact')).toContain('f-a');
    const ps = { ...ctx, device: { kind: 'gamepad' as const, style: 'playstation' as const } };
    expect(capText(ps, 'interact')).toBe('Cross');
    expect(capHTML(ps, 'rewind')).toContain('△');
    const ns = { ...ctx, device: { kind: 'gamepad' as const, style: 'nintendo' as const } };
    expect(capText(ns, 'interact')).toBe('B'); // bottom face button on a Switch pad is labelled B
    expect(capText(xbox, 'echo2')).toBe('LB / RB');
  });

  it('HUD control hints, interaction prompt and tutorial card switch with the last-used device', () => {
    ui.showHUD(L1, { tutorial: true });
    ui.update(frameAt(L1, 1));
    const controls = root.querySelector('.rx-controls') as HTMLElement;
    expect(controls.textContent).toContain('WASD');
    expect(root.querySelector('.rx-onboard .keys')!.textContent).toBe('WASD');
    ui.setInputDevice({ kind: 'gamepad', style: 'playstation' });
    expect(ui.root.classList.contains('rx-pad')).toBe(true);
    expect(ui.root.dataset['input']).toBe('playstation');
    expect(controls.textContent).toContain('△');
    expect(controls.textContent).toContain('Hold · Restart');
    expect(root.querySelector('.rx-onboard .keys .rx-padkey.stick')).not.toBeNull();
    ui.setInputDevice(KEYBOARD);
    expect(controls.textContent).toContain('WASD');
    expect(ui.root.classList.contains('rx-pad')).toBe(false);
  });
});

describe('gamepad menu navigation', () => {
  it('D-pad moves focus through the main menu, A activates, B backs out of sub-screens', () => {
    ui.showMainMenu(menuData);
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('.rx-menu-list button'));
    items[0]!.focus();
    expect(nav('down')).toBe(true);
    expect(document.activeElement).toBe(items[1]);
    nav('up');
    expect(document.activeElement).toBe(items[0]);
    btn('a', PAD.A);
    expect(cb.onContinue).toHaveBeenCalledTimes(1);
    (root.querySelector('[data-testid="menu-settings"]') as HTMLElement).focus();
    btn('a', PAD.A);
    expect(ui.screen).toBe('settings');
    expect(btn('b', PAD.B)).toBe(true);
    expect(ui.screen).toBe('menu');
  });

  it('settings: a controller button can be remapped with the pad and is reported for persistence', () => {
    ui.showSettings();
    const controlsTab = Array.from(root.querySelectorAll<HTMLButtonElement>('.rx-tab')).find((b) => b.textContent === 'Controls')!;
    controlsTab.click();
    const row = root.querySelector<HTMLButtonElement>('[data-pad-action="rewind"]')!;
    expect(row.textContent).toBe('Y');
    row.focus();
    btn('a', PAD.A); // starts the capture
    expect(root.querySelector('[data-pad-action="rewind"]')!.textContent).toContain('Press a button');
    expect(nav('down')).toBe(true); // ignored while capturing
    btn('rb', PAD.RB);
    expect(cb.onPadBindsChange).toHaveBeenLastCalledWith(expect.objectContaining({ rewind: PAD.RB, echoNext: null }));
    expect(ui.padBindings.rewind).toBe(PAD.RB);
    expect(root.querySelector('[data-pad-action="rewind"]')!.textContent).toBe('RB');
    expect(root.querySelector('.rx-pad-status')!.textContent).toMatch(/moved from/);
  });

  it('expanded timeline: scrub with left/right, select tracks with up/down, A hides, X deletes, B returns', () => {
    const frame = frameAt(L3, 300);
    ui.showHUD(L3, { tutorial: false });
    ui.update(frame);
    ui.setTimelineExpanded(true);
    ui.update(frame);
    nav('right');
    expect(cb.onScrub).toHaveBeenLastCalledWith(315);
    ui.padInput({ type: 'nav', dir: 'right', repeat: true, heldMs: 3000 });
    expect(cb.onScrub).toHaveBeenLastCalledWith(405);
    const echoes = frame.timeline.tracks.filter((t) => t.kind === 'echo' && t.recursion === undefined).length;
    expect(echoes).toBeGreaterThan(1);
    nav('down'); // player -> echo 1
    expect(ui.selectedEcho).toBe(0);
    nav('down');
    expect(ui.selectedEcho).toBe(1);
    nav('up');
    nav('up'); // back to the player track
    expect(ui.selectedEcho).toBeNull();
    nav('down');
    btn('a', PAD.A);
    expect(cb.onToggleEchoVisibility).toHaveBeenCalledWith(0, false, expect.any(Number));
    btn('x', PAD.X);
    expect(cb.onDeleteLoop).toHaveBeenCalledWith(0);
    btn('b', PAD.B); // leaves the scrub preview
    expect(cb.onScrubEnd).toHaveBeenCalled();
    expect(ui.timelineExpanded).toBe(true);
    btn('b', PAD.B); // collapses
    expect(ui.timelineExpanded).toBe(false);
  });

  it('restart hold indicator fills and hides', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.setInputDevice({ kind: 'gamepad', style: 'xbox' });
    const hold = root.querySelector('[data-testid="restart-hold"]') as HTMLElement;
    ui.setRestartHold(0.5);
    expect(hold.classList.contains('on')).toBe(true);
    expect(hold.style.getPropertyValue('--p')).toBe('0.5');
    expect(hold.textContent).toContain('X');
    ui.setRestartHold(0);
    expect(hold.classList.contains('on')).toBe(false);
  });
});

describe('spatial focus picking', () => {
  const b = (l: number, t: number, w = 100, hgt = 40) => ({ l, t, r: l + w, b: t + hgt, cx: l + w / 2, cy: t + hgt / 2 });
  it('prefers aligned neighbours over closer diagonal ones', () => {
    const from = b(0, 0);
    const below = { el: document.createElement('button'), box: b(0, 120) };
    const diag = { el: document.createElement('button'), box: b(150, 50) };
    const right = { el: document.createElement('button'), box: b(130, 0) };
    expect(pickInDirection(from, [below, diag, right], 'down')).toBe(below.el);
    expect(pickInDirection(from, [below, diag, right], 'right')).toBe(right.el);
    expect(pickInDirection(from, [below, diag, right], 'up')).toBeNull();
  });
});

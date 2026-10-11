// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameCommand, LevelDefinition } from '../../engine/contracts';
import { InputSampler } from '../../engine/input/InputSampler';
import { CAMPAIGN_LEVELS } from '../../levels/definitions';
import { compileSolution, createGame, playScript } from '../../testing/harness/harness';
import { createUI, type UIHandle } from '../createUI';
import { capHTML, capText, KEYBOARD, TOUCH, defaultGlyphs } from '../glyphs';
import { defaultKeybinds } from '../../persistence/keybinds';
import { isIOSDevice, isTouchDevice, shouldSuggestHomeScreen, touchFirst, type TouchEnv } from './env';
import { GestureTracker, type GestureEvent } from './gestures';
import { createJoystick, joystickDirection, JOYSTICK_RADIUS, moveJoystick } from './joystick';
import type { TouchSink } from './TouchControls';
import { shouldPauseForOrientation, touchVisibility, type TouchVisibilityInput } from './visibility';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IPHONE: TouchEnv = { userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5, coarsePointer: true, noHover: true, standalone: false, webdriver: false };
const DESKTOP: TouchEnv = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141', platform: 'Linux x86_64', maxTouchPoints: 0, coarsePointer: false, noHover: false, standalone: false, webdriver: false };

describe('virtual joystick quantization', () => {
  it('stays idle inside the deadzone', () => {
    expect(joystickDirection(0, 0)).toEqual([0, 0]);
    expect(joystickDirection(JOYSTICK_RADIUS * 0.2, 0)).toEqual([0, 0]);
    expect(joystickDirection(-JOYSTICK_RADIUS * 0.15, JOYSTICK_RADIUS * 0.15)).toEqual([0, 0]);
  });

  it('snaps to the 8 directions (screen axes, y down = south)', () => {
    const r = JOYSTICK_RADIUS;
    expect(joystickDirection(r, 0)).toEqual([1, 0]);
    expect(joystickDirection(-r, 0)).toEqual([-1, 0]);
    expect(joystickDirection(0, -r)).toEqual([0, -1]);
    expect(joystickDirection(0, r)).toEqual([0, 1]);
    expect(joystickDirection(r, r)).toEqual([1, 1]);
    expect(joystickDirection(-r, -r)).toEqual([-1, -1]);
    // 20° off the axis is still the axis; 30° is still east (sector edges at 22.5°)
    const a = (deg: number): [number, number] => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
    expect(joystickDirection(...a(20))).toEqual([1, 0]);
    expect(joystickDirection(...a(30))).toEqual([1, 1]);
  });

  it('only ever outputs -1/0/1 on both axes, at every angle and distance', () => {
    for (let deg = 0; deg < 360; deg += 3) {
      for (const k of [0.1, 0.3, 0.6, 1, 2.5]) {
        const [x, y] = joystickDirection(Math.cos((deg * Math.PI) / 180) * JOYSTICK_RADIUS * k, Math.sin((deg * Math.PI) / 180) * JOYSTICK_RADIUS * k);
        expect([-1, 0, 1]).toContain(x);
        expect([-1, 0, 1]).toContain(y);
      }
    }
  });

  it('drags the base along past the rim, so reversing is instant', () => {
    let s = createJoystick(100, 100);
    s = moveJoystick(s, 100 + JOYSTICK_RADIUS * 3, 100);
    expect(s.dir).toEqual([1, 0]);
    expect(Math.hypot(s.kx, s.ky)).toBeCloseTo(JOYSTICK_RADIUS, 5);
    expect(s.ox).toBeCloseTo(100 + JOYSTICK_RADIUS * 2, 5);
    // A short move back (less than the original travel) already points west.
    s = moveJoystick(s, s.ox - JOYSTICK_RADIUS * 0.6, 100);
    expect(s.dir).toEqual([-1, 0]);
  });

  it('has hysteresis on the deadzone edge', () => {
    let s = moveJoystick(createJoystick(0, 0), JOYSTICK_RADIUS * 0.4, 0);
    expect(s.dir).toEqual([1, 0]);
    s = moveJoystick(s, JOYSTICK_RADIUS * 0.25, 0); // below the entry threshold but above the release one
    expect(s.dir).toEqual([1, 0]);
    s = moveJoystick(s, JOYSTICK_RADIUS * 0.1, 0);
    expect(s.dir).toEqual([0, 0]);
  });
});

describe('touch gestures', () => {
  const W = 852;
  const types = (ev: GestureEvent[]): string[] => ev.map((e) => e.type);

  it('one finger on the left half drives the joystick; the right half alone does nothing', () => {
    const g = new GestureTracker();
    expect(types(g.down(1, 150, 250, 0, W))).toEqual(['stickStart']);
    const mv = g.move(1, 150 + 60, 250);
    expect(mv[0]).toMatchObject({ type: 'stickMove', changed: true });
    expect(g.direction).toEqual([1, 0]);
    expect(types(g.up(1, 500))).toEqual(['stickEnd']);
    expect(g.direction).toEqual([0, 0]);
    expect(g.down(2, 700, 200, 1000, W)).toEqual([]);
    expect(g.move(2, 600, 200)).toEqual([]);
    expect(g.up(2, 1100)).toEqual([]);
  });

  it('a second finger after the stick is established is ignored (stick keeps steering)', () => {
    const g = new GestureTracker();
    g.down(1, 150, 250, 0, W);
    g.move(1, 150, 250 - 60);
    expect(g.down(2, 420, 200, 400, W)).toEqual([]);
    expect(g.move(2, 380, 200)).toEqual([]);
    expect(g.direction).toEqual([0, -1]);
  });

  it('two fingers together pinch-zoom (spread = zoom in = negative wheel delta)', () => {
    const g = new GestureTracker();
    expect(g.down(1, 500, 200, 0, W)).toEqual([]); // right half: no stick
    expect(g.down(2, 700, 200, 80, W)).toEqual([]);
    const spread = g.move(2, 760, 200);
    expect(spread).toHaveLength(1);
    expect(spread[0]?.type).toBe('zoom');
    expect((spread[0] as { deltaY: number }).deltaY).toBeLessThan(0);
    const pinch = g.move(2, 620, 200);
    expect((pinch[0] as { deltaY: number }).deltaY).toBeGreaterThan(0);
    g.up(1, 900);
    expect(g.up(2, 950)).toEqual([]); // zoomed: not a tap
  });

  it('a quick still two-finger tap toggles the overview (even when the first finger started a stick)', () => {
    const g = new GestureTracker();
    expect(types(g.down(1, 200, 200, 0, W))).toEqual(['stickStart']);
    expect(types(g.down(2, 300, 210, 60, W))).toEqual(['stickEnd']);
    g.move(1, 203, 201);
    expect(g.up(1, 180)).toEqual([]);
    expect(types(g.up(2, 200))).toEqual(['twoFingerTap']);
  });

  it('slow or cancelled two-finger touches are not taps', () => {
    const g = new GestureTracker();
    g.down(1, 600, 200, 0, W);
    g.down(2, 700, 200, 50, W);
    g.up(1, 900);
    expect(g.up(2, 950)).toEqual([]);
    g.down(3, 600, 200, 2000, W);
    g.down(4, 700, 200, 2050, W);
    g.cancel(3);
    expect(g.up(4, 2100)).toEqual([]);
  });

  it('reset releases the stick', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0, W);
    g.move(1, 160, 100);
    expect(types(g.reset())).toEqual(['stickEnd']);
    expect(g.direction).toEqual([0, 0]);
  });
});

describe('touch-control visibility', () => {
  const base: TouchVisibilityInput = { touchCapable: true, device: 'touch', hud: true, screen: null, timelineExpanded: false, portrait: false };

  it('shows the controls while a chamber is played with touch', () => {
    expect(touchVisibility(base)).toEqual({ touchMode: true, controls: true, pause: true, rotate: false });
  });

  it('hides them when a keyboard or controller was used last, and on non-touch devices', () => {
    expect(touchVisibility({ ...base, device: 'keyboard' }).controls).toBe(false);
    expect(touchVisibility({ ...base, device: 'gamepad' }).controls).toBe(false);
    expect(touchVisibility({ ...base, device: 'gamepad' }).touchMode).toBe(false);
    expect(touchVisibility({ ...base, touchCapable: false })).toEqual({ touchMode: false, controls: false, pause: false, rotate: false });
  });

  it('hides them under menus and the intro, and keeps only pause while the timeline sheet is open', () => {
    expect(touchVisibility({ ...base, screen: 'pause' }).controls).toBe(false);
    expect(touchVisibility({ ...base, screen: 'intro' }).pause).toBe(false);
    expect(touchVisibility({ ...base, hud: false, screen: 'menu' }).controls).toBe(false);
    expect(touchVisibility({ ...base, timelineExpanded: true })).toMatchObject({ controls: false, pause: true });
  });

  it('portrait shows the rotate overlay instead (touch devices only) and pauses play', () => {
    expect(touchVisibility({ ...base, portrait: true })).toEqual({ touchMode: true, controls: false, pause: false, rotate: true });
    expect(touchVisibility({ ...base, device: 'keyboard', portrait: true }).rotate).toBe(true);
    expect(touchVisibility({ ...base, touchCapable: false, portrait: true }).rotate).toBe(false);
    expect(shouldPauseForOrientation(true, true, true)).toBe(true);
    expect(shouldPauseForOrientation(true, false, true)).toBe(false);
    expect(shouldPauseForOrientation(false, true, true)).toBe(false);
  });
});

describe('touch environment', () => {
  it('detects iOS, including iPadOS presenting a Mac user agent', () => {
    expect(isIOSDevice(IPHONE)).toBe(true);
    expect(isIOSDevice({ userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOSDevice({ userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIOSDevice(DESKTOP)).toBe(false);
  });

  it('touch capability and touch-first', () => {
    expect(isTouchDevice(IPHONE)).toBe(true);
    expect(touchFirst(IPHONE)).toBe(true);
    expect(isTouchDevice(DESKTOP)).toBe(false);
    // touchscreen laptop: touch-capable only if the primary pointer is coarse; never touch-first while it can hover
    expect(touchFirst({ maxTouchPoints: 10, coarsePointer: true, noHover: false })).toBe(false);
  });

  it('suggests Add to Home Screen only in iOS Safari tabs, until dismissed', () => {
    expect(shouldSuggestHomeScreen(IPHONE, false)).toBe(true);
    expect(shouldSuggestHomeScreen(IPHONE, true)).toBe(false);
    expect(shouldSuggestHomeScreen({ ...IPHONE, standalone: true }, false)).toBe(false);
    expect(shouldSuggestHomeScreen(DESKTOP, false)).toBe(false);
  });
});

describe('InputSampler touch source', () => {
  it('produces the same PlayerInput as the keyboard (quantized, yaw-rotated, latched)', () => {
    const touch = new InputSampler();
    const keys = new InputSampler();
    touch.yawStep = keys.yawStep = 2;
    touch.setTouchMove(0, -1);
    keys.setDirection('up', true);
    expect(touch.sample(0)).toEqual(keys.sample(0));
    touch.setTouchMove(0.4, -3); // anything non-zero snaps to ±1
    expect(touch.sample(1)).toMatchObject({ moveX: 1, moveY: 1 });
    touch.setInteract(true, 'touch');
    touch.setInteract(false, 'touch'); // tapped between ticks: still one press
    expect(touch.sample(2)).toMatchObject({ interactPressed: true, interactHeld: true });
    expect(touch.sample(3)).toMatchObject({ interactPressed: false, interactHeld: false });
  });

  it('keyboard and pad directions win over the joystick; releaseAll clears touch', () => {
    const s = new InputSampler();
    s.setTouchMove(1, 0);
    s.setPadMove(-1, 0);
    expect(s.sample(0).moveX).toBe(-1);
    s.setPadMove(0, 0);
    s.setDirection('down', true);
    expect(s.sample(1)).toMatchObject({ moveX: 0, moveY: 1 });
    s.setDirection('down', false);
    expect(s.sample(2)).toMatchObject({ moveX: 1, moveY: 0 });
    s.releaseAll();
    expect(s.sample(3)).toMatchObject({ moveX: 0, moveY: 0 });
  });
});

describe('touch glyphs', () => {
  it('names the on-screen buttons in prompts', () => {
    const g = { ...defaultGlyphs(defaultKeybinds()), device: TOUCH };
    expect(capHTML(g, 'interact')).toContain('rx-touchkey');
    expect(capHTML(g, 'interact')).toContain('Interact');
    expect(capHTML(g, 'rewind')).toContain('New echo');
    expect(capHTML(g, 'move')).toContain('Joystick');
    expect(capText(g, 'timeline')).toBe('Timeline button');
    expect(capHTML({ ...g, device: KEYBOARD }, 'interact')).not.toContain('rx-touchkey');
  });
});

// ---------------------------------------------------------------------------------------------------- DOM layer

const L1 = CAMPAIGN_LEVELS[0] as LevelDefinition;

function frame(level: LevelDefinition): Parameters<UIHandle['update']>[0] {
  const game = createGame(level);
  game.setLoops(compileSolution(level).slice(0, -1));
  playScript(game, [{ op: 'wait', ticks: 30 }]);
  return { level, state: game.getState(), timeline: game.getTimeline(), dt: 0 };
}

function pointer(el: Element, type: string, id: number, x = 10, y = 10, pointerType = 'touch'): void {
  const PE = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent;
  const init = { bubbles: true, cancelable: true, pointerId: id, clientX: x, clientY: y, pointerType, button: 0, isPrimary: id === 1 } as PointerEventInit;
  const ev = PE ? new PE(type, init) : Object.assign(new MouseEvent(type, init), { pointerId: id, pointerType });
  el.dispatchEvent(ev);
}

describe('touch controls in the UI', () => {
  let root: HTMLElement;
  let ui: UIHandle;
  let sink: TouchSink & { cmds: GameCommand[]; moves: [number, number][]; interacts: boolean[]; portrait: boolean[] };
  const onRestart = vi.fn();

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    ui = createUI(root, { onRestart }, { touchEnv: IPHONE });
    const cmds: GameCommand[] = [];
    const moves: [number, number][] = [];
    const interacts: boolean[] = [];
    const portrait: boolean[] = [];
    sink = {
      cmds,
      moves,
      interacts,
      portrait,
      move: (x, y) => moves.push([x, y]),
      interact: (d) => interacts.push(d),
      command: (c) => cmds.push(c),
      zoom: () => undefined,
      overview: () => undefined,
      orientation: (p) => portrait.push(p),
    };
    ui.touch.setSink(sink);
  });

  afterEach(() => {
    ui.dispose();
    root.remove();
    onRestart.mockReset();
    localStorage.clear();
  });

  const controls = (): HTMLElement => root.querySelector('[data-testid="touch-controls"]') as HTMLElement;

  it('starts in touch mode on a phone and shows the controls only while playing', () => {
    expect(ui.inputDevice.kind).toBe('touch');
    expect(ui.root.classList.contains('rx-touch-on')).toBe(true);
    ui.showMainMenu({ levels: [], totalStars: 0, maxStars: 30 });
    expect(controls().hidden).toBe(true);
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    expect(controls().hidden).toBe(false);
    expect(controls().classList.contains('play')).toBe(true);
    expect(ui.root.classList.contains('rx-tplay')).toBe(true);
    ui.showPause({ levelName: L1.name, levelOrder: 1, echoesUsed: 0, maxEchoes: 2 });
    expect(controls().hidden).toBe(true);
    ui.hidePause();
    expect(controls().hidden).toBe(false);
  });

  it('auto-hides when a keyboard or controller is used, and comes back on the next touch', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    ui.setInputDevice(KEYBOARD);
    expect(controls().hidden).toBe(true);
    expect(ui.root.classList.contains('rx-touch-on')).toBe(false);
    ui.setInputDevice({ kind: 'gamepad', style: 'xbox' });
    expect(controls().hidden).toBe(true);
    pointer(document.body, 'pointerdown', 7);
    expect(ui.inputDevice.kind).toBe('touch');
    expect(controls().hidden).toBe(false);
  });

  it('buttons feed the sink on pointerdown, with multi-touch (joystick + Interact at once)', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    const zone = root.querySelector('[data-testid="touch-zone"]') as HTMLElement;
    const interact = root.querySelector('[data-testid="touch-interact"]') as HTMLElement;
    pointer(zone, 'pointerdown', 1, 100, 300);
    pointer(zone, 'pointermove', 1, 100 + JOYSTICK_RADIUS, 300);
    pointer(interact, 'pointerdown', 2);
    expect(sink.moves.at(-1)).toEqual([1, 0]);
    expect(sink.interacts).toEqual([true]);
    pointer(interact, 'pointerup', 2);
    expect(sink.interacts).toEqual([true, false]);
    expect(sink.moves.at(-1)).toEqual([1, 0]); // the stick is still held
    pointer(zone, 'pointerup', 1);
    expect(sink.moves.at(-1)).toEqual([0, 0]);

    pointer(root.querySelector('[data-testid="touch-echo"]') as HTMLElement, 'pointerdown', 3);
    pointer(root.querySelector('[data-testid="touch-timeline"]') as HTMLElement, 'pointerdown', 4);
    const preview = root.querySelector('[data-testid="touch-preview"]') as HTMLElement;
    pointer(preview, 'pointerdown', 5);
    pointer(preview, 'pointerup', 5);
    expect(sink.cmds).toEqual([{ type: 'rewind' }, { type: 'toggleTimeline' }, { type: 'temporalPreview', held: true }, { type: 'temporalPreview', held: false }]);
    (root.querySelector('[data-testid="touch-pause"]') as HTMLElement).click();
    expect(sink.cmds.at(-1)).toEqual({ type: 'pause' });
  });

  it('hiding the controls releases a held joystick and Interact (no stuck input)', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    const zone = root.querySelector('[data-testid="touch-zone"]') as HTMLElement;
    pointer(zone, 'pointerdown', 1, 100, 300);
    pointer(zone, 'pointermove', 1, 100, 300 - JOYSTICK_RADIUS);
    pointer(root.querySelector('[data-testid="touch-interact"]') as HTMLElement, 'pointerdown', 2);
    ui.showPause({ levelName: L1.name, levelOrder: 1, echoesUsed: 0, maxEchoes: 2 });
    expect(sink.moves.at(-1)).toEqual([0, 0]);
    expect(sink.interacts.at(-1)).toBe(false);
  });

  it('portrait shows the rotate overlay and reports it', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 393 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 852 });
    window.dispatchEvent(new Event('resize'));
    expect((root.querySelector('[data-testid="rotate-overlay"]') as HTMLElement).hidden).toBe(false);
    expect(controls().hidden).toBe(true);
    expect(sink.portrait).toEqual([true]);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: hgt });
    window.dispatchEvent(new Event('resize'));
    expect((root.querySelector('[data-testid="rotate-overlay"]') as HTMLElement).hidden).toBe(true);
    expect(sink.portrait).toEqual([true, false]);
  });

  it('the timeline strip opens as a sheet on tap in touch mode', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.update(frame(L1));
    const strip = root.querySelector('[data-testid="timeline"]') as HTMLElement;
    (strip.querySelector('.rx-tl-body') as HTMLElement).click();
    expect(ui.timelineExpanded).toBe(true);
    expect(controls().classList.contains('play')).toBe(false); // sheet open: joystick and buttons step aside
    expect(controls().hidden).toBe(false); // …but pause stays
  });

  it('pause menu restart: a click (mouse / keys / pad) restarts at once, a short touch does not', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.showPause({ levelName: L1.name, levelOrder: 1, echoesUsed: 0, maxEchoes: 2 });
    const btn = root.querySelector('[data-testid="pause-restart"]') as HTMLElement;
    expect(btn.textContent).toContain('Hold');
    btn.click();
    expect(onRestart).toHaveBeenCalledTimes(1);
    pointer(btn, 'pointerdown', 9);
    pointer(btn, 'pointerup', 9);
    btn.click(); // the click a short tap generates
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('iOS Safari shows a dismissible Add to Home Screen hint on the main menu', () => {
    ui.showMainMenu({ levels: [], totalStars: 0, maxStars: 30 });
    const hint = root.querySelector('[data-testid="a2hs-hint"]') as HTMLElement;
    expect(hint).not.toBeNull();
    (hint.querySelector('[data-testid="a2hs-dismiss"]') as HTMLElement).click();
    expect(root.querySelector('[data-testid="a2hs-hint"]')).toBeNull();
    ui.showMainMenu({ levels: [], totalStars: 0, maxStars: 30 });
    expect(root.querySelector('[data-testid="a2hs-hint"]')).toBeNull();
  });

  it('desktop: no touch layer behaviour, no hint, keyboard prompts', () => {
    const r2 = document.createElement('div');
    document.body.append(r2);
    const desk = createUI(r2, {}, { touchEnv: DESKTOP });
    expect(desk.inputDevice.kind).toBe('keyboard');
    desk.showMainMenu({ levels: [], totalStars: 0, maxStars: 30 });
    expect(r2.querySelector('[data-testid="a2hs-hint"]')).toBeNull();
    desk.showHUD(L1, { tutorial: false });
    desk.update(frame(L1));
    expect((r2.querySelector('[data-testid="touch-controls"]') as HTMLElement).hidden).toBe(true);
    pointer(document.body, 'pointerdown', 3);
    expect(desk.inputDevice.kind).toBe('keyboard');
    desk.dispose();
    r2.remove();
  });
});

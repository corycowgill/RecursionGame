import { describe, expect, it } from 'vitest';
import { SaveStore, migrateSave } from '../../persistence/save';
import { MemoryStorage } from '../../persistence/storage';
import type { GameCommand } from '../contracts';
import { assignPadButton, defaultPadBindings, isBindablePadButton, padActionFor, sanitizePadBindings } from './gamepadBindings';
import { GamepadInput, type PadEvent, type PadLike } from './GamepadInput';
import { HoldTracker, PAD, RepeatTimer, dominantDirection, padButtonLabel, padStyleFromId, quantizeStick } from './gamepadMapping';
import { InputSampler } from './InputSampler';

/** A mutable mock pad (standard mapping, 17 buttons, 4 axes). */
function mockPad(id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index = 0) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  const pad: PadLike & { buttons: { pressed: boolean; value: number }[]; axes: number[]; connected: boolean } = { index, id, connected: true, mapping: 'standard', buttons, axes };
  return {
    pad,
    press(i: number, on = true) {
      buttons[i] = { pressed: on, value: on ? 1 : 0 };
    },
  };
}

function rig(pads: (PadLike | null)[]) {
  const sampler = new InputSampler();
  const gp = new GamepadInput(sampler);
  gp.getPads = () => pads;
  const commands: GameCommand[] = [];
  const events: PadEvent[] = [];
  gp.onCommand((c) => commands.push(c));
  gp.onEvent((e) => events.push(e));
  gp.poll(0); // first sight of the pads (buttons already held at connect are ignored until released)
  events.length = 0;
  return { sampler, gp, commands, events };
}

describe('quantizeStick (radial deadzone, 8 directions)', () => {
  it('returns idle inside the radial deadzone, including small diagonals', () => {
    expect(quantizeStick(0, 0)).toEqual([0, 0]);
    expect(quantizeStick(0.2, 0.2)).toEqual([0, 0]); // |v| = 0.28 < 0.35
    expect(quantizeStick(0.3, 0)).toEqual([0, 0]);
    expect(quantizeStick(Number.NaN, 1)).toEqual([0, 0]);
  });

  it('snaps to the nearest of 8 directions and only ever emits -1/0/1', () => {
    expect(quantizeStick(1, 0)).toEqual([1, 0]);
    expect(quantizeStick(0, -1)).toEqual([0, -1]); // up (screen y < 0)
    expect(quantizeStick(-0.7, 0.7)).toEqual([-1, 1]);
    expect(quantizeStick(0.9, 0.3)).toEqual([1, 0]); // 18° -> east sector
    expect(quantizeStick(0.9, 0.45)).toEqual([1, 1]); // 26.6° -> south-east sector
    for (let a = 0; a < 360; a += 7) {
      const r = (a * Math.PI) / 180;
      const [x, y] = quantizeStick(Math.cos(r), Math.sin(r));
      expect([-1, 0, 1]).toContain(x);
      expect([-1, 0, 1]).toContain(y);
      expect(x !== 0 || y !== 0).toBe(true);
    }
  });

  it('has hysteresis at the deadzone edge', () => {
    expect(quantizeStick(0.32, 0)).toEqual([0, 0]);
    expect(quantizeStick(0.32, 0, 0.35, true)).toEqual([1, 0]);
  });

  it('dominantDirection picks the larger axis for menus', () => {
    expect(dominantDirection(0.2, 0.1)).toBeNull();
    expect(dominantDirection(0.8, -0.3)).toBe('right');
    expect(dominantDirection(-0.2, -0.9)).toBe('up');
  });
});

describe('HoldTracker / RepeatTimer', () => {
  it('fires once after the hold duration and resets on release', () => {
    const h = new HoldTracker(600);
    expect(h.update(true, 150)).toBe(false);
    expect(h.update(true, 150)).toBe(false);
    expect(h.progress).toBeCloseTo(0.5);
    expect(h.update(true, 200)).toBe(false);
    expect(h.update(true, 99)).toBe(false);
    expect(h.update(true, 1)).toBe(true);
    expect(h.update(true, 500)).toBe(false); // still held: no second restart
    expect(h.progress).toBe(0);
    h.update(false, 16);
    expect(h.update(true, 200)).toBe(false); // released early: nothing
    h.update(false, 16);
    expect(h.progress).toBe(0);
  });

  it('auto-repeats after a delay and accelerates while held', () => {
    const r = new RepeatTimer(300, 100, 50, 1000);
    let fires = 0;
    for (let t = 0; t < 2000; t += 10) if (r.update(true, 10)) fires++;
    // press + repeats every 100 ms from 300..1000 (8) + every 50 ms from 1000..2000 (~20)
    expect(fires).toBeGreaterThan(25);
    expect(r.update(false, 10)).toBe(false);
    expect(r.update(true, 10)).toBe(true);
  });
});

describe('InputSampler with keyboard + gamepad sources', () => {
  it('latches a pad press that starts and ends between two ticks', () => {
    const s = new InputSampler();
    s.setInteract(true, 'pad');
    s.setInteract(false, 'pad');
    expect(s.sample(0)).toMatchObject({ interactPressed: true, interactHeld: true });
    expect(s.sample(1)).toMatchObject({ interactPressed: false, interactHeld: false });
  });

  it('holds interact while either device holds it; each new press latches once', () => {
    const s = new InputSampler();
    s.setInteract(true, 'key');
    expect(s.sample(0).interactPressed).toBe(true);
    s.setInteract(true, 'pad');
    expect(s.sample(1)).toMatchObject({ interactPressed: true, interactHeld: true });
    s.setInteract(false, 'key');
    expect(s.sample(2)).toMatchObject({ interactPressed: false, interactHeld: true });
    s.setInteract(false, 'pad');
    expect(s.sample(3).interactHeld).toBe(false);
  });

  it('uses the pad direction when no key is held and rotates it by camera yaw like WASD', () => {
    const s = new InputSampler();
    s.setPadMove(1, -1);
    expect(s.sample(0)).toMatchObject({ moveX: 1, moveY: -1 });
    s.setDirection('left', true);
    expect(s.sample(1)).toMatchObject({ moveX: -1, moveY: 0 }); // keyboard wins
    s.setDirection('left', false);
    s.setPadMove(0, -1);
    s.yawStep = 2;
    expect(s.sample(2)).toMatchObject({ moveX: 1, moveY: 0 });
    s.setPadMove(0.4, -7); // defensively re-quantized
    s.yawStep = 0;
    expect(s.sample(3)).toMatchObject({ moveX: 1, moveY: -1 });
  });
});

describe('GamepadInput', () => {
  it('reports hot-plug and detects the controller family', () => {
    const a = mockPad();
    const pads: (PadLike | null)[] = [];
    const { gp, events } = rig(pads);
    gp.poll(16);
    expect(events).toEqual([]);
    pads.push(a.pad);
    gp.poll(16);
    expect(events[0]).toMatchObject({ type: 'connected', index: 0, style: 'xbox' });
    pads.length = 0;
    gp.poll(16);
    expect(events.at(-1)).toMatchObject({ type: 'disconnected', remaining: 0 });
    expect(padStyleFromId('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(padStyleFromId('Wireless Controller')).toBe('playstation');
    expect(padStyleFromId('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo');
    expect(padButtonLabel(PAD.A, 'playstation')).toBe('✕');
    expect(padButtonLabel(PAD.Y, 'xbox')).toBe('Y');
  });

  it('drives movement and a latched interact press through the shared sampler', () => {
    const a = mockPad();
    const { gp, sampler } = rig([a.pad]);
    gp.setMode('gameplay');
    a.pad.axes[0] = 0.9;
    a.pad.axes[1] = -0.85;
    a.press(PAD.A);
    gp.poll(16);
    a.press(PAD.A, false); // released before the next tick is sampled
    gp.poll(16);
    expect(sampler.sample(0)).toMatchObject({ moveX: 1, moveY: -1, interactPressed: true });
    expect(sampler.sample(1)).toMatchObject({ moveX: 1, moveY: -1, interactPressed: false, interactHeld: false });
    a.pad.axes[0] = 0;
    a.pad.axes[1] = 0;
    a.press(PAD.DOWN);
    gp.poll(16);
    expect(sampler.sample(2)).toMatchObject({ moveX: 0, moveY: 1 });
    a.press(PAD.DOWN, false);
    gp.poll(16);
    expect(sampler.sample(3)).toMatchObject({ moveX: 0, moveY: 0 });
  });

  it('maps meta buttons to commands; hold X restarts only after 0.6 s', () => {
    const a = mockPad();
    const { gp, commands, events } = rig([a.pad]);
    gp.setMode('gameplay');
    a.press(PAD.Y);
    gp.poll(16);
    a.press(PAD.Y, false);
    a.press(PAD.VIEW);
    a.press(PAD.MENU);
    gp.poll(16);
    a.press(PAD.VIEW, false);
    a.press(PAD.MENU, false);
    a.pad.buttons[PAD.LT] = { pressed: true, value: 0.8 };
    gp.poll(16);
    a.pad.buttons[PAD.LT] = { pressed: false, value: 0 };
    a.press(PAD.RB);
    gp.poll(16);
    expect(commands).toEqual([{ type: 'rewind' }, { type: 'pause' }, { type: 'toggleTimeline' }, { type: 'temporalPreview', held: true }, { type: 'temporalPreview', held: false }]);
    expect(events.some((e) => e.type === 'cycleEcho' && e.dir === 1)).toBe(true);

    commands.length = 0;
    a.press(PAD.X);
    for (let t = 0; t < 500; t += 50) gp.poll(50);
    expect(commands).toEqual([]);
    const fills = events.filter((e): e is Extract<PadEvent, { type: 'restartHold' }> => e.type === 'restartHold').map((e) => e.progress);
    expect(Math.max(...fills)).toBeGreaterThan(0.7);
    for (let t = 0; t < 400; t += 50) gp.poll(50);
    expect(commands).toEqual([{ type: 'restart' }]);
  });

  it('in ui mode emits navigation with auto-repeat and button presses, never gameplay input', () => {
    const a = mockPad();
    const { gp, sampler, events } = rig([a.pad]);
    gp.setMode('ui');
    a.press(PAD.DOWN);
    gp.poll(16);
    gp.poll(200);
    gp.poll(200); // past the repeat delay
    a.press(PAD.DOWN, false);
    a.press(PAD.A);
    gp.poll(16);
    const navs = events.filter((e) => e.type === 'nav');
    expect(navs.length).toBe(2);
    expect(navs[1]).toMatchObject({ dir: 'down', repeat: true });
    expect(events.at(-1)).toMatchObject({ type: 'button', button: 'a', index: 0 });
    expect(sampler.sample(0)).toMatchObject({ moveX: 0, moveY: 0, interactPressed: false });
  });

  it('a button held across a mode change does not act until released (menu confirm never becomes interact)', () => {
    const a = mockPad();
    const { gp, sampler } = rig([a.pad]);
    gp.setMode('ui');
    a.press(PAD.A);
    gp.poll(16);
    gp.setMode('gameplay');
    gp.poll(16);
    expect(sampler.sample(0)).toMatchObject({ interactPressed: false, interactHeld: false });
    a.press(PAD.A, false);
    gp.poll(16);
    a.press(PAD.A);
    gp.poll(16);
    expect(sampler.sample(1).interactPressed).toBe(true);
  });

  it('a button already held when the pad connects (e.g. the press that skipped the intro) is ignored until released', () => {
    const a = mockPad();
    const pads: (PadLike | null)[] = [];
    const { gp, events } = rig(pads);
    gp.setMode('ui');
    a.press(PAD.A);
    pads.push(a.pad);
    gp.poll(16);
    gp.poll(16);
    expect(events.filter((e) => e.type === 'button')).toEqual([]);
    a.press(PAD.A, false);
    gp.poll(16);
    a.press(PAD.A);
    gp.poll(16);
    expect(events.filter((e) => e.type === 'button')).toHaveLength(1);
  });

  it('disconnecting releases held movement and preview', () => {
    const a = mockPad();
    const pads: (PadLike | null)[] = [a.pad];
    const { gp, sampler, commands } = rig(pads);
    gp.setMode('gameplay');
    a.pad.axes[0] = 1;
    a.pad.buttons[PAD.LT] = { pressed: true, value: 1 };
    gp.poll(16);
    expect(sampler.sample(0).moveX).toBe(1);
    pads.length = 0;
    gp.poll(16);
    expect(sampler.sample(1).moveX).toBe(0);
    expect(commands.at(-1)).toEqual({ type: 'temporalPreview', held: false });
  });
});

describe('gamepad bindings', () => {
  it('defaults follow the standard layout and every button has one owner', () => {
    const d = defaultPadBindings();
    expect(d).toMatchObject({ interact: PAD.A, action: PAD.B, rewind: PAD.Y, restart: PAD.X, timeline: PAD.VIEW, preview: PAD.LT, echoPrev: PAD.LB, echoNext: PAD.RB });
    expect(padActionFor(d, PAD.Y)).toBe('rewind');
  });

  it('assigning a taken button moves it and reports the displaced action', () => {
    const { binds, displaced } = assignPadButton(defaultPadBindings(), 'rewind', PAD.A);
    expect(binds.rewind).toBe(PAD.A);
    expect(binds.interact).toBeNull();
    expect(displaced).toBe('interact');
    expect(assignPadButton(binds, 'interact', PAD.MENU).binds).toBe(binds); // reserved: unchanged
    expect(isBindablePadButton(PAD.UP)).toBe(false);
    expect(isBindablePadButton(PAD.RS)).toBe(true);
  });

  it('sanitizes saved data: invalid, reserved and duplicate buttons are dropped, missing ones default', () => {
    const s = sanitizePadBindings({ interact: 3, rewind: 3, action: PAD.MENU, timeline: 'x', bogus: 1 });
    expect(s.interact).toBe(3);
    expect(s.rewind).toBeNull();
    expect(s.action).toBeNull();
    expect(s.timeline).toBeNull();
    expect(s.restart).toBe(PAD.X);
    expect(sanitizePadBindings(null)).toEqual(defaultPadBindings());
  });
});

describe('gamepad binding persistence (SaveData.padbinds, next to the key bindings)', () => {
  it('round-trips through storage, survives a progress reset and defaults for old saves', () => {
    const storage = new MemoryStorage();
    const a = new SaveStore({ storage });
    expect(a.data.padbinds).toEqual(defaultPadBindings());
    a.setPadBindings(assignPadButton(a.data.padbinds, 'rewind', PAD.RB).binds);
    const b = new SaveStore({ storage });
    expect(b.data.padbinds.rewind).toBe(PAD.RB);
    expect(b.data.padbinds.echoNext).toBeNull();
    b.reset();
    expect(new SaveStore({ storage }).data.padbinds.rewind).toBe(PAD.RB);
    expect(migrateSave({ version: 1, keybinds: {} }).padbinds).toEqual(defaultPadBindings());
    expect(migrateSave({ version: 1, padbinds: { interact: PAD.HOME } }).padbinds.interact).toBeNull();
  });
});

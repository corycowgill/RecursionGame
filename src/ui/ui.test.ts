// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDefinition } from '../engine/contracts';
import { predictInteraction } from '../gameplay/interactions/targeting';
import { evaluateCompletion } from '../gameplay/puzzles/completion';
import { getObjectiveStatus } from '../gameplay/puzzles/objectives';
import { CAMPAIGN_LEVELS } from '../levels/definitions';
import { emptyProgress, recordCompletion } from '../levels/progression';
import { compileSolution, createGame, playScript } from '../testing/harness/harness';
import { buildLevelEntries } from './menus/LevelSelect';
import { createUI, type UIHandle } from './createUI';
import type { UICallbacks, UIFrame } from './types';

const L1 = CAMPAIGN_LEVELS[0] as LevelDefinition;
const L3 = (CAMPAIGN_LEVELS[2] ?? L1) as LevelDefinition;

function liveFrame(level: LevelDefinition, ticks: number): { frame: UIFrame; echoes: number } {
  const loops = compileSolution(level);
  const game = createGame(level);
  game.setLoops(loops.slice(0, -1));
  playScript(game, [{ op: 'wait', ticks }]);
  const state = game.getState();
  return {
    frame: { level, state, timeline: game.getTimeline(), prompt: predictInteraction(level, state), objective: getObjectiveStatus(level, state), dt: 0 },
    echoes: loops.length - 1,
  };
}

let root: HTMLElement;
let ui: UIHandle;
let cb: { [K in keyof UICallbacks]-?: ReturnType<typeof vi.fn> };

beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>';
  root = document.getElementById('ui') as HTMLElement;
  cb = {
    onContinue: vi.fn(),
    onStartLevel: vi.fn(),
    onResume: vi.fn(),
    onRestart: vi.fn(),
    onResetLoop: vi.fn(),
    onCommitEcho: vi.fn(),
    onTogglePause: vi.fn(),
    onDeleteLoop: vi.fn(),
    onScrub: vi.fn(),
    onScrubEnd: vi.fn(),
    onToggleEchoVisibility: vi.fn(),
    onSelectEcho: vi.fn(),
    onTimelineToggle: vi.fn(),
    onSettingsChange: vi.fn(),
    onKeybindsChange: vi.fn(),
    onPadBindsChange: vi.fn(),
    onIntroDone: vi.fn(),
    onNextLevel: vi.fn(),
    onReplayLevel: vi.fn(),
    onQuitToMenu: vi.fn(),
    onResetProgress: vi.fn(),
    onTutorialComplete: vi.fn(),
    onUISound: vi.fn(),
    getLevelEntries: vi.fn(() => undefined),
  };
  ui = createUI(root, cb as unknown as UICallbacks);
});

afterEach(() => ui.dispose());

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as T;
};

describe('createUI', () => {
  it('mounts once with injected styles and never blocks the canvas', () => {
    expect(document.getElementById('rx-ui-styles')).not.toBeNull();
    const ui2 = createUI(root);
    expect(document.querySelectorAll('#rx-ui-styles').length).toBe(1);
    ui2.dispose();
    expect(ui.root.style.pointerEvents).toBe('none');
    expect(ui.screen).toBeNull();
  });

  it('main menu: continue, level select (locked/unlocked/completed), back', () => {
    let progress = emptyProgress();
    progress = recordCompletion(progress, evaluateCompletion(L1, 600, 1));
    const levels = buildLevelEntries(CAMPAIGN_LEVELS, progress);
    expect(levels.map((l) => l.status)).toEqual(['completed', 'unlocked', ...levels.slice(2).map(() => 'locked')]);
    expect(levels[1]!.isNext).toBe(true);
    ui.showMainMenu({ continueLevel: { id: levels[1]!.id, order: 2, name: levels[1]!.name }, levels, totalStars: 3, maxStars: 30 });
    expect(ui.screen).toBe('menu');
    expect(ui.isBlocking()).toBe(true);
    $<HTMLButtonElement>('[data-testid="menu-continue"]').click();
    expect(cb.onContinue).toHaveBeenCalledTimes(1);

    $<HTMLButtonElement>('[data-testid="menu-levels"]').click();
    expect(ui.screen).toBe('levels');
    const cards = root.querySelectorAll<HTMLButtonElement>('.rx-level');
    expect(cards.length).toBe(CAMPAIGN_LEVELS.length);
    expect(cards[0]!.className).toContain('completed');
    expect(cards[0]!.getAttribute('aria-label')).toMatch(/Completed\. Best time 0:10\.0/);
    if (cards.length > 2) {
      expect(cards[2]!.getAttribute('aria-disabled')).toBe('true');
      cards[2]!.click();
      expect(cb.onStartLevel).not.toHaveBeenCalled();
    }
    cards[1]!.click();
    expect(cb.onStartLevel).toHaveBeenCalledWith(levels[1]!.id);
    expect(ui.back()).toBe(true);
    expect(ui.screen).toBe('menu');
    expect(ui.back()).toBe(false);
  });

  it('HUD + timeline render real engine data and update cheaply', () => {
    const { frame, echoes } = liveFrame(L3, 300);
    ui.showHUD(L3, { tutorial: false });
    ui.update(frame);
    expect($('.rx-hud-level h1').textContent).toBe(L3.name);
    expect($('.rx-echoes .count').textContent).toBe(`${echoes} / ${L3.maxEchoes}`);
    expect(root.querySelectorAll('.rx-echoes .rx-badge').length).toBe(echoes);
    expect($('.rx-clock .now').textContent).toBe('0:05.0');
    expect(root.querySelectorAll('.rx-tl-lane').length).toBe(echoes + 1);
    expect(root.querySelector('.rx-tl-lane')!.getAttribute('data-track')).toBe('player');
    const markers = root.querySelectorAll('.rx-mk');
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]!.getAttribute('aria-label')).toMatch(/Echo \d .* at \d:\d\d\.\d/);
    // identical frame -> lanes are not rebuilt
    const lane = root.querySelector('.rx-tl-lane');
    ui.update(frame);
    expect(root.querySelector('.rx-tl-lane')).toBe(lane);
    expect($('.rx-playhead').style.left).toMatch(/%$/);
  });

  it('timeline: Tab expand, delete/visibility/select, transport buttons, keyboard scrubbing', () => {
    const { frame } = liveFrame(L3, 200);
    ui.showHUD(L3, { tutorial: false });
    ui.update(frame);
    expect(root.querySelector('.rx-tl-label .acts')).toBeNull(); // compact: no per-track buttons
    ui.toggleTimeline();
    expect(ui.timelineExpanded).toBe(true);
    expect(cb.onTimelineToggle).toHaveBeenCalledWith(true);
    expect($('[data-testid="timeline"]').className).toContain('expanded');

    const del = root.querySelectorAll<HTMLButtonElement>('.rx-tl-label .rx-iconbtn.danger');
    expect(del.length).toBe(frame.timeline.tracks.length - 1);
    del[0]!.click();
    expect(cb.onDeleteLoop).toHaveBeenCalledWith(0);

    const eye = root.querySelector<HTMLButtonElement>('.rx-tl-label button[aria-label^="Hide Echo 1"]')!;
    eye.click();
    expect(cb.onToggleEchoVisibility).toHaveBeenCalledWith(0, false, frame.timeline.tracks.find((t) => t.echoIndex === 0)!.loopId);
    expect(root.querySelector('.rx-tl-lane.hidden-track')).not.toBeNull();

    ui.selectEcho(1);
    expect(ui.selectedEcho).toBe(1);
    expect(cb.onSelectEcho).toHaveBeenLastCalledWith(1);
    ui.selectEcho(7); // out of range: ignored
    expect(ui.selectedEcho).toBe(1);

    $<HTMLButtonElement>('.rx-tcb.rwd').click();
    expect(cb.onResetLoop).toHaveBeenCalled();
    $<HTMLButtonElement>('.rx-tcb.ply').click();
    expect(cb.onTogglePause).toHaveBeenCalled();
    $<HTMLButtonElement>('.rx-tcb.del').click();
    expect(cb.onDeleteLoop).toHaveBeenLastCalledWith(1); // the selected echo
    // echo budget full in L03 after 2 echoes -> RECORD disabled
    expect($<HTMLButtonElement>('.rx-tcb.rec').disabled).toBe(frame.timeline.tracks.length - 1 >= L3.maxEchoes);

    const stage = $('.rx-tl-stage');
    expect(stage.getAttribute('role')).toBe('slider');
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(cb.onScrub).toHaveBeenLastCalledWith(frame.timeline.currentTick + 60);
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    expect(cb.onScrub).toHaveBeenLastCalledWith(frame.timeline.currentTick + 66);
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cb.onScrubEnd).toHaveBeenCalledTimes(1);
  });

  it('events produce toasts and accessible announcements', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.onEvents([
      { type: 'echoLimitReached', tick: 3, maxEchoes: 2 },
      { type: 'divergence', tick: 4, actorId: 'echo:1', loopId: 1, echoIndex: 0, expected: { tick: 4, verb: 'interact', kind: 'pickup', entityId: 'c' }, actual: { tick: 4, verb: 'interact', kind: 'fail', entityId: 'c' } },
    ]);
    const text = $('[data-testid="toasts"]').textContent ?? '';
    expect(text).toContain('Echo limit reached (2)');
    expect(text).toContain('Paradox \u00b7 Echo 1 diverged');
    expect($('.rx-sr').textContent).toMatch(/Paradox/);
  });

  it('onboarding prompts follow real signals and report completion', () => {
    const { frame } = liveFrame(L1, 1);
    ui.showHUD(L1); // tutorials on by default, not yet seen
    ui.update(frame);
    const card = $('[data-testid="onboarding"]');
    expect(card.hidden).toBe(false);
    expect(card.textContent).toMatch(/Move/);
    ui.onEvents([{ type: 'plateDown', tick: 1, entityId: 'plate-a' }]); // wrong step: ignored
    expect(card.textContent).toMatch(/Move/);
    root.querySelector<HTMLButtonElement>('.rx-onboard .skip')!.click();
    expect(cb.onTutorialComplete).toHaveBeenCalledWith('L01');
    expect(card.hidden).toBe(true);
  });

  it('pause menu + back() resumes; settings emit changes and remap keys', () => {
    ui.showHUD(L1, { tutorial: false });
    ui.showPause({ levelName: L1.name, levelOrder: 1, echoesUsed: 0, maxEchoes: 2 });
    expect(ui.screen).toBe('pause');
    expect(root.querySelectorAll('.rx-hintlist li').length).toBe(L1.hints.length);
    expect(ui.back()).toBe(true);
    expect(cb.onResume).toHaveBeenCalledTimes(1);

    ui.showSettings();
    expect(ui.screen).toBe('settings');
    root.querySelector<HTMLButtonElement>('.rx-tab[id$="-audio"]')!.click();
    const vol = root.querySelector<HTMLInputElement>('input[aria-label="Master volume"]')!;
    vol.value = '35';
    vol.dispatchEvent(new Event('input'));
    expect(cb.onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ masterVolume: 35 }));

    root.querySelector<HTMLButtonElement>('.rx-tab[id$="-access"]')!.click();
    root.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Reduced motion"]')!.click();
    expect(ui.settings.reducedMotion).toBe(true);
    expect(ui.root.classList.contains('rx-reduced')).toBe(true);

    root.querySelector<HTMLButtonElement>('.rx-tab[id$="-controls"]')!.click();
    root.querySelector<HTMLButtonElement>('.rx-bind[data-action="interact"][data-slot="0"]')!.click();
    expect(root.querySelector('.rx-bind.capturing')).not.toBeNull();
    const ev = new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q', bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(cb.onKeybindsChange).toHaveBeenCalledTimes(1);
    const binds = cb.onKeybindsChange.mock.calls[0]![0] as { interact: string[]; preview: string[] };
    expect(binds.interact).toEqual(['KeyQ']);
    expect(binds.preview).toEqual([]); // displaced
    expect(ui.keybinds.interact).toEqual(['KeyQ']);
    expect(root.textContent).toMatch(/moved from/);
    expect(ui.back()).toBe(true); // closes settings
  });

  it('settings show a ?quality= URL override as the active, locked preset and name the saved one', () => {
    const r2 = document.createElement('div');
    document.body.append(r2);
    const ui2 = createUI(r2, cb as unknown as UICallbacks, { qualityOverride: 'low', settings: { ...ui.settings, quality: 'ultra' } });
    ui2.showSettings();
    const seg = r2.querySelector('.rx-seg[aria-label="Quality preset"]') as HTMLElement;
    expect(seg.classList.contains('locked')).toBe(true);
    const pressed = [...seg.querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((b) => b.textContent)).toEqual(['Low']);
    expect([...seg.querySelectorAll('button')].every((b) => b.hasAttribute('disabled'))).toBe(true);
    expect(r2.textContent).toMatch(/\?quality=low/);
    expect(r2.textContent).toMatch(/Saved preset: Ultra/);
    ui2.dispose();
    // without an override the saved preset is shown and selectable
    ui.showSettings();
    const seg1 = root.querySelector('.rx-seg[aria-label="Quality preset"]') as HTMLElement;
    expect(seg1.classList.contains('locked')).toBe(false);
    // default preset is 'auto' (renderer picks mobile/high by device) since the round-3 mobile work
    expect(seg1.querySelector('button[aria-pressed="true"]')!.textContent).toBe('Auto');
  });

  it('level intro and completion screens', () => {
    ui.showLevelIntro(L1);
    expect(ui.screen).toBe('intro');
    expect($('[data-testid="level-intro"]').textContent).toContain(L1.name);
    $<HTMLButtonElement>('[data-testid="intro-begin"]').click();
    expect(cb.onIntroDone).toHaveBeenCalled();

    const result = evaluateCompletion(L1, 600, 1);
    ui.showLevelComplete({ result, levelName: L1.name, levelOrder: 1, hasNext: true, firstClear: true });
    expect(ui.screen).toBe('complete');
    expect($('.rx-stars').getAttribute('aria-label')).toBe(`${result.stars} of 3 stars`);
    expect(root.querySelectorAll('.rx-star.on').length).toBe(result.stars);
    $<HTMLButtonElement>('[data-testid="complete-next"]').click();
    expect(cb.onNextLevel).toHaveBeenCalled();
  });

  it('level select opened from the completion card reflects fresh progress, not the cached main-menu data (QA)', () => {
    ui.showMainMenu({ continueLevel: null, levels: buildLevelEntries(CAMPAIGN_LEVELS, emptyProgress()), totalStars: 0, maxStars: 30 });
    const fresh = buildLevelEntries(CAMPAIGN_LEVELS, recordCompletion(emptyProgress(), evaluateCompletion(L1, 600, 1)));
    cb.getLevelEntries.mockImplementation(() => fresh);
    ui.showLevelComplete({ result: evaluateCompletion(L1, 600, 1), levelName: L1.name, levelOrder: 1, hasNext: true, firstClear: true });
    $<HTMLButtonElement>('[data-testid="complete-levels"]').click();
    expect(ui.screen).toBe('levels');
    const cards = root.querySelectorAll<HTMLButtonElement>('.rx-level');
    expect(cards[0]!.className).toContain('completed');
    expect(cards[1]!.getAttribute('aria-disabled')).toBeNull();
  });

  it('transition fades and runs the callback', async () => {
    vi.useFakeTimers();
    const between = vi.fn();
    const p = ui.transition(between);
    expect($('.rx-fade').classList.contains('on')).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(between).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await p;
    expect($('.rx-fade').classList.contains('on')).toBe(false);
    vi.useRealTimers();
  });
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDefinition } from '../../engine/contracts';
import { CAMPAIGN_LEVELS } from '../../levels/definitions';
import { emptyProgress, recordCompletion } from '../../levels/progression';
import { evaluateCompletion } from '../../gameplay/puzzles/completion';
import { createUI, type UIHandle } from '../createUI';
import { createCredits, CREDIT_LICENSES, CREDIT_ROLES } from './Credits';
import { createEnding } from './Ending';
import { buildLevelEntries } from './LevelSelect';
import { parseLogLine, storyLineHTML } from './narrative';

const key = (k: string, repeat = false): KeyboardEvent => new KeyboardEvent('keydown', { key: k, bubbles: true, repeat });

beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('story lines', () => {
  it('every campaign level tells its part in 2-3 short lines, with one recovered log', () => {
    for (const l of CAMPAIGN_LEVELS) {
      const story = l.story ?? [];
      expect(story.length, l.id).toBeGreaterThanOrEqual(2);
      expect(story.length, l.id).toBeLessThanOrEqual(3);
      for (const line of story) expect(line.length, `${l.id}: ${line}`).toBeLessThanOrEqual(110);
      expect(story.filter((s) => parseLogLine(s)).length, l.id).toBe(1);
    }
  });

  it('formats LOG lines apart from narration (escaped)', () => {
    expect(parseLogLine('LOG 001 · Hello')).toEqual({ id: '001', text: 'Hello' });
    expect(parseLogLine('Just narration.')).toBeNull();
    expect(storyLineHTML('LOG 7 · <b>x</b>')).toBe('<span class="rx-log-id">LOG 7</span><span class="rx-log-text">&lt;b&gt;x&lt;/b&gt;</span>');
    expect(storyLineHTML('a & b')).toBe('a &amp; b');
  });
});

describe('ending overlay: any input on any device skips', () => {
  it('keyboard (auto-repeat ignored), click / tap, any controller button and Back all skip', () => {
    const onSkip = vi.fn();
    const s = createEnding(['One.', 'LOG 000 · Two.'], { onSkip });
    document.body.append(s.el);
    expect(s.el.querySelectorAll('.line')).toHaveLength(2);
    expect(s.el.querySelector('.line.log .rx-log-id')?.textContent).toBe('LOG 000');
    window.dispatchEvent(key('w', true));
    expect(onSkip).not.toHaveBeenCalled();
    window.dispatchEvent(key('x'));
    expect(onSkip).toHaveBeenCalledTimes(1);
    s.el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onSkip).toHaveBeenCalledTimes(2);
    expect(s.padButton(3)).toBe(true);
    expect(s.padCapturing).toBe(true);
    expect(s.back()).toBe(true);
    expect(onSkip).toHaveBeenCalledTimes(4);
    s.render({ lines: [1, 0.5], white: 0.25 });
    const lines = s.el.querySelectorAll<HTMLElement>('.line');
    expect(lines[0]!.style.opacity).toBe('1.000');
    expect(lines[1]!.style.opacity).toBe('0.500');
    expect(s.el.querySelector<HTMLElement>('[data-testid="ending-white"]')!.style.opacity).toBe('0.250');
    s.dispose();
    window.dispatchEvent(key('x'));
    expect(onSkip).toHaveBeenCalledTimes(4); // listeners removed
  });
});

describe('credits', () => {
  it('opens with the studio header, then RECURSION, the agent team (directed by Cory Cowgill) and the licenses', () => {
    const s = createCredits({ onBack: vi.fn(), sound: vi.fn() });
    document.body.append(s.el);
    const text = s.el.textContent ?? '';
    expect(text.indexOf('HALLUCINATED')).toBeLessThan(text.indexOf('presents'));
    expect(text.indexOf('presents')).toBeLessThan(text.indexOf('RECURSION'));
    expect(text).toContain('Built by an AI agent team');
    expect(text).toContain('Cory Cowgill');
    for (const r of CREDIT_ROLES) expect(text).toContain(r);
    for (const l of CREDIT_LICENSES) {
      expect(text).toContain(l.name);
      expect(text).toContain(l.license);
    }
    s.dispose();
  });

  it('keyboard: arrows step through the sections to the Back button; Back leaves', () => {
    const onBack = vi.fn();
    const s = createCredits({ onBack, sound: vi.fn() });
    document.body.append(s.el);
    const sections = Array.from(s.el.querySelectorAll<HTMLElement>('section[tabindex="0"]'));
    expect(sections.length).toBeGreaterThanOrEqual(5);
    sections[0]!.focus();
    sections[0]!.dispatchEvent(key('ArrowDown'));
    expect(document.activeElement).toBe(sections[1]);
    sections[1]!.dispatchEvent(key('End'));
    const back = s.el.querySelector<HTMLButtonElement>('[data-testid="credits-back"]')!;
    expect(document.activeElement).toBe(back);
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(s.back()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
    s.dispose();
  });

  it('after the ending it rolls by itself until any user input', () => {
    const s = createCredits({ onBack: vi.fn(), sound: vi.fn(), rolling: true, fromWhite: true, backLabel: 'Main menu' });
    document.body.append(s.el);
    expect(s.el.classList.contains('from-white')).toBe(true);
    expect(s.el.querySelector('[data-testid="credits-back"]')?.textContent).toContain('Main menu');
    expect(s.autoRolling).toBe(true);
    s.el.dispatchEvent(new Event('wheel'));
    expect(s.autoRolling).toBe(false);
    s.dispose();
    const reduced = createCredits({ onBack: vi.fn(), sound: vi.fn(), rolling: true, reducedMotion: true });
    expect(reduced.autoRolling).toBe(false);
    reduced.dispose();
  });
});

describe('createUI wiring (ending, credits, replay from level select)', () => {
  let ui: UIHandle;
  const L10 = CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1] as LevelDefinition;
  const finishedProgress = () =>
    CAMPAIGN_LEVELS.reduce((p, l) => recordCompletion(p, evaluateCompletion(l, 600, l.parEchoes ?? l.maxEchoes)), emptyProgress());

  it('main menu Credits opens over the menu; Esc / pad B returns to the menu', () => {
    ui = createUI(document.getElementById('ui') as HTMLElement, {});
    ui.showMainMenu({ levels: buildLevelEntries(CAMPAIGN_LEVELS, emptyProgress()), totalStars: 0, maxStars: 30 });
    (document.querySelector('[data-testid="menu-credits"]') as HTMLButtonElement).click();
    expect(ui.screen).toBe('credits');
    expect(ui.back()).toBe(true);
    expect(ui.screen).toBe('menu');
    ui.showCredits();
    expect(ui.padInput({ type: 'button', button: 'b', index: 1 } as never)).toBe(true);
    expect(ui.screen).toBe('menu');
    ui.dispose();
  });

  it('the ending is a blocking base screen; Esc skips it; credits after it leave via onExit', () => {
    ui = createUI(document.getElementById('ui') as HTMLElement, {});
    const onSkip = vi.fn();
    const view = ui.showEnding(['a', 'b'], onSkip);
    expect(ui.screen).toBe('ending');
    expect(ui.isBlocking()).toBe(true);
    view.render({ lines: [1, 0], white: 0 });
    expect(ui.back()).toBe(true);
    expect(ui.padInput({ type: 'button', button: 'x', index: 2 } as never)).toBe(true);
    expect(onSkip).toHaveBeenCalledTimes(2);
    const onExit = vi.fn();
    ui.showCredits({ onExit, rolling: true, fromWhite: true });
    expect(ui.screen).toBe('credits');
    expect(document.querySelectorAll('[data-testid="ending"]')).toHaveLength(0);
    expect(ui.back()).toBe(true);
    expect(onExit).toHaveBeenCalledTimes(1);
    ui.dispose();
  });

  it('level select offers Ending and Credits only once the final chamber is completed', () => {
    const onPlayEnding = vi.fn();
    ui = createUI(document.getElementById('ui') as HTMLElement, { onPlayEnding });
    ui.showLevelSelect(buildLevelEntries(CAMPAIGN_LEVELS, emptyProgress()));
    expect(document.querySelector('[data-testid="levels-ending"]')).toBeNull();
    ui.showLevelSelect(buildLevelEntries(CAMPAIGN_LEVELS, finishedProgress()));
    (document.querySelector('[data-testid="levels-ending"]') as HTMLButtonElement).click();
    expect(onPlayEnding).toHaveBeenCalledTimes(1);
    (document.querySelector('[data-testid="levels-credits"]') as HTMLButtonElement).click();
    expect(ui.screen).toBe('credits');
    ui.dispose();
  });

  it('a repeat clear of the final chamber offers "Watch ending" on the results card', () => {
    const onPlayEnding = vi.fn();
    ui = createUI(document.getElementById('ui') as HTMLElement, { onPlayEnding });
    const result = evaluateCompletion(L10, 1200, 3);
    ui.showLevelComplete({ result, levelName: L10.name, levelOrder: L10.order, hasNext: false, hasEnding: true });
    (document.querySelector('[data-testid="complete-ending"]') as HTMLButtonElement).click();
    expect(onPlayEnding).toHaveBeenCalledTimes(1);
    ui.showLevelComplete({ result, levelName: L10.name, levelOrder: L10.order, hasNext: false });
    expect(document.querySelector('[data-testid="complete-ending"]')).toBeNull();
    ui.dispose();
  });
});

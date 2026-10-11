import type { LevelDefinition, LevelHint } from '../../engine/contracts';
import { arrowNav, esc, h } from '../dom';
import { deviceHintHTML, padHintHTML } from '../glyphs';
import { icon } from '../icons';
import { ringsSVG } from '../rings';
import { formatTicks } from '../timeline/model';
import type { LevelCompleteStats, PauseData } from '../types';
import { holdToConfirm, type HoldGate } from '../touch/holdButton';
import type { Screen } from './MainMenu';

type Sound = (c: 'hover' | 'confirm' | 'back') => void;

function menuButton(label: string, ic: Parameters<typeof icon>[0], onClick: () => void, sound: Sound, primary = false, testid?: string, chevron = true): HTMLButtonElement {
  const b = h('button', { class: `rx-btn${primary ? ' primary' : ''}`, type: 'button', 'data-testid': testid ?? null, html: `${icon(ic)}<span>${esc(label)}</span>${chevron ? icon('chevron', 'rx-ico rx-chev') : ''}` });
  b.addEventListener('click', () => {
    sound('confirm');
    onClick();
  });
  b.addEventListener('pointerenter', () => sound('hover'));
  return b;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------------------------------------------

export interface PauseActions {
  onResume(): void;
  onRestart(): void;
  onSettings(): void;
  onLevelSelect(): void;
  onQuit(): void;
  onRevealHint(): void;
  sound: Sound;
}

export function createPause(
  data: PauseData,
  hints: { revealed: readonly LevelHint[]; total: number; /** Authored text → HTML (device glyphs for action tokens). */ html?: (text: string) => string },
  act: PauseActions,
): Screen {
  const hintHTML = hints.html ?? esc;
  // Touch: restarting throws away every echo, so a finger must hold the button (mouse / keys / pad click instantly).
  let gate: HoldGate | null = null;
  const restart = menuButton('Restart chamber', 'restart', () => (gate?.consume() ? undefined : act.onRestart()), act.sound, false, 'pause-restart');
  restart.querySelector('span')?.append(h('span', { class: 'rx-holdtag rx-touch-only' }, 'Hold'));
  gate = holdToConfirm(restart, () => {
    act.sound('confirm');
    act.onRestart();
  });
  const list = h(
    'nav',
    { class: 'list', 'aria-label': 'Pause menu' },
    menuButton('Resume', 'play', act.onResume, act.sound, true, 'pause-resume'),
    restart,
    menuButton('Settings', 'settings', act.onSettings, act.sound),
    menuButton('Level select', 'grid', act.onLevelSelect, act.sound),
    menuButton('Main menu', 'exit', act.onQuit, act.sound, false, 'pause-quit'),
  );
  const left = h(
    'section',
    { class: 'rx-panel' },
    h('div', { class: 'rx-hair' }),
    h('div', { class: 'rx-eyebrow' }, data.levelOrder > 0 ? `Chamber ${pad2(data.levelOrder)} · ${data.levelName}` : data.levelName),
    h('h2', {}, 'Paused'),
    h('div', { class: 'rx-muted', style: 'letter-spacing:.06em' }, 'Time is suspended. Your echoes wait.'),
    list,
  );
  const hintItems = hints.revealed.map((x, i) => `<li><b>${pad2(i + 1)}</b><span>${hintHTML(x.text)}</span></li>`);
  for (let i = hints.revealed.length; i < hints.total; i++) hintItems.push(`<li class="locked"><b>${pad2(i + 1)}</b><span>Locked — unlocks with time or attempts</span></li>`);
  const reveal = h('button', { class: 'rx-btn small', type: 'button', 'data-testid': 'pause-reveal-hint', html: `${icon('hint')}<span>Reveal next hint</span>` });
  reveal.disabled = hints.revealed.length >= hints.total;
  reveal.addEventListener('click', () => act.onRevealHint());
  const right = h(
    'section',
    { class: 'rx-panel cyan' },
    h('div', { class: 'rx-hair' }),
    h('div', { class: 'rx-eyebrow cyan' }, 'Chamber status'),
    h('div', { class: 'rx-rule' }),
    h('div', {
      html:
        `<div class="rx-stat-row"><span class="rx-muted">Echoes used</span><span class="rx-num">${data.echoesUsed} / ${data.maxEchoes}</span></div>` +
        (data.attempts !== undefined ? `<div class="rx-stat-row"><span class="rx-muted">Attempts</span><span class="rx-num">${data.attempts}</span></div>` : ''),
    }),
    h('div', { class: 'rx-eyebrow cyan', style: 'margin-top:1.4em' }, 'Hints'),
    h('ul', { class: 'rx-hintlist', html: hintItems.join('') || '<li class="locked"><b>—</b><span>No hints for this chamber</span></li>' }),
    h('div', { style: 'margin-top:1em' }, reveal),
  );
  const el = h('div', { class: 'rx-screen rx-dim rx-pause', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused', 'data-testid': 'pause' }, left, right);
  const offNav = arrowNav(list);
  return {
    el,
    dispose: () => {
      offNav();
      gate?.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------

export function createCredits(act: { onBack(): void; sound: Sound }): Screen {
  const back = menuButton('Back', 'back', act.onBack, act.sound, false, 'back', false);
  const roles: [string, string][] = [
    ['Direction & temporal engine', 'Agent 1 · Agent 2'],
    ['Gameplay & level design', 'Agent 3'],
    ['Graphics & visual effects', 'Agent 4'],
    ['Interface & experience', 'Agent 5'],
    ['Audio', 'Procedural score & sound'],
    ['Typography', 'Orbitron · Rajdhani (SIL Open Font License)'],
    ['Built with', 'Three.js · TypeScript · Vite'],
  ];
  const panel = h(
    'section',
    { class: 'rx-panel rx-dialog', style: 'width:min(620px,100%);text-align:center' },
    h('div', { class: 'rx-hair' }),
    h('div', { class: 'rx-eyebrow' }, 'Recursion'),
    h('h2', { class: 'rx-display', style: 'font-size:1.5em;margin:.4em 0 1.2em;color:#fff;font-weight:500' }, 'Credits'),
    h('div', {
      html: roles
        .map(([r, n]) => `<div style="margin:.85em 0"><div class="rx-eyebrow cyan" style="font-size:.58em">${esc(r)}</div><div style="font-size:1.12em;margin-top:.3em">${esc(n)}</div></div>`)
        .join(''),
    }),
    h('div', { class: 'rx-muted', style: 'margin-top:1.4em;font-size:.95em' }, 'Every echo is you. Thank you for playing.'),
    h('div', { class: 'rx-dialog-foot', style: 'justify-content:center' }, back),
  );
  const el = h('div', { class: 'rx-screen rx-backdrop rx-center', role: 'dialog', 'aria-label': 'Credits', 'data-testid': 'credits' }, panel);
  return { el, dispose: () => {} };
}

// ---------------------------------------------------------------------------------------------------------------

export function createLevelIntro(level: LevelDefinition, act: { onBegin(): void; sound: Sound }, text: (t: string) => string = esc): Screen {
  const story = (level.story ?? []).map((line, i) => `<li style="animation-delay:${0.45 + i * 0.32}s">${text(line)}</li>`).join('');
  const begin = menuButton('Begin', 'play', act.onBegin, act.sound, true, 'intro-begin');
  const facts =
    `<span class="rx-fact">${icon('echo')}Echo limit <b>${level.maxEchoes}</b></span>` +
    `<span class="rx-fact">${icon('clock')}Loop <b>${formatTicks(level.loopDurationTicks)}</b></span>` +
    `<span class="rx-fact">${icon('star')}Par <b>${formatTicks(level.parTimeSeconds * 60)}${level.parEchoes !== undefined ? ` · ${level.parEchoes} echo${level.parEchoes === 1 ? '' : 'es'}` : ''}</b></span>`;
  const card = h('div', {
    class: 'card',
    html:
      `<div class="chamber"><span class="rx-eyebrow">${level.order > 0 ? `Chamber ${pad2(level.order)}` : 'Test chamber'}</span></div>` +
      `<h1>${esc(level.name)}</h1>` +
      (level.subtitle ? `<div class="subtitle">${text(level.subtitle)}</div>` : '') +
      (story ? `<ul class="story">${story}</ul>` : '') +
      `<div class="facts">${facts}</div>`,
  });
  const go = h('div', { class: 'go' }, begin, h('span', { class: 'rx-muted rx-display', style: 'font-size:.6em;letter-spacing:.3em', html: deviceHintHTML('<span class="rx-key cyan">Enter</span>&nbsp; to begin', `${padHintHTML(0)}&nbsp; to begin`) }));
  card.append(go);
  const el = h('div', { class: 'rx-screen rx-intro', role: 'dialog', 'aria-label': `Chamber ${level.order}: ${level.name}`, 'data-testid': 'level-intro' }, card);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && document.activeElement !== begin) {
      e.preventDefault();
      act.onBegin();
    }
  };
  el.addEventListener('keydown', onKey);
  return { el, dispose: () => el.removeEventListener('keydown', onKey) };
}

// ---------------------------------------------------------------------------------------------------------------

export function createLevelComplete(stats: LevelCompleteStats, act: { onNext(): void; onReplay(): void; onLevelSelect(): void; sound: Sound }): Screen {
  const r = stats.result;
  const star = (on: boolean, label: string, delay: number): string =>
    `<div class="rx-star${on ? ' on' : ''}">${icon('star').replace('<svg ', `<svg style="animation-delay:${delay}s" `)}<span class="l">${esc(label)}</span></div>`;
  const ok = (good: boolean): string => icon(good ? 'check' : 'close');
  const best = stats.best;
  const newBest = stats.firstClear ? 'Chamber restored' : stats.isNewBestTime ? 'New best time' : stats.isNewBestEchoes ? 'Fewer echoes' : '';
  const results =
    `<div class="rx-result"><div class="k">Time</div><div class="v">${formatTicks(r.ticks, true)}</div><div class="p ${r.withinParTime ? 'ok' : 'miss'}">${ok(r.withinParTime)}Par ${formatTicks(r.parTimeSeconds * 60)}</div></div>` +
    `<div class="rx-result"><div class="k">Echoes</div><div class="v">${r.echoesUsed}</div><div class="p ${r.withinParEchoes ? 'ok' : 'miss'}">${ok(r.withinParEchoes)}Par ${r.parEchoes}</div></div>` +
    `<div class="rx-result"><div class="k">Best</div><div class="v">${formatTicks(best ? best.ticks : r.ticks, true)}</div><div class="p">${best ? `${best.echoes} echo${best.echoes === 1 ? '' : 'es'}` : 'First clear'}</div></div>`;
  const actions = h('div', { class: 'actions' });
  if (stats.hasNext) actions.append(menuButton('Next chamber', 'next', act.onNext, act.sound, true, 'complete-next', false));
  actions.append(menuButton('Replay', 'restart', act.onReplay, act.sound, !stats.hasNext, 'complete-replay', false));
  actions.append(menuButton('Chambers', 'grid', act.onLevelSelect, act.sound, false, 'complete-levels', false));
  const panel = h(
    'section',
    { class: 'rx-panel', role: 'document' },
    h('div', { class: 'rx-rings', html: ringsSVG('done') }),
    h('div', { class: 'rx-hair' }),
    h('div', { class: 'rx-eyebrow', style: 'position:relative' }, `Chamber ${pad2(stats.levelOrder)}`),
    h('h2', {}, 'Complete'),
    h('div', { class: 'lvl' }, stats.levelName),
    h('div', {
      class: 'rx-stars',
      role: 'img',
      'aria-label': `${r.stars} of 3 stars`,
      html: star(true, 'Restored', 0.2) + star(r.stars >= 2, 'Echo par', 0.45) + star(r.stars >= 3, 'Time par', 0.7),
    }),
    h('div', { class: 'rx-results', html: results }),
    newBest ? h('div', { class: 'rx-newbest', html: `${icon('star')}<span>${esc(newBest)}</span>` }) : null,
    actions,
  );
  const el = h('div', { class: 'rx-screen rx-dim rx-complete', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Chamber complete: ${stats.levelName}`, 'data-testid': 'level-complete' }, panel);
  const offNav = arrowNav(actions, 'button', 1);
  return { el, dispose: offNav };
}

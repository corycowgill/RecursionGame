import { arrowNav, esc, h } from '../dom';
import { deviceHintHTML, padHintHTML } from '../glyphs';
import { icon } from '../icons';
import { ringsSVG } from '../rings';
import type { MainMenuData } from '../types';

export interface Screen {
  el: HTMLElement;
  dispose(): void;
}

export interface MainMenuActions {
  onContinue(): void;
  onLevelSelect(): void;
  onSettings(): void;
  onCredits(): void;
  sound(cue: 'hover' | 'confirm'): void;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Title screen: RECURSION logotype over the rotating ring motif, primary navigation and a progress summary. */
export function createMainMenu(data: MainMenuData, act: MainMenuActions): Screen {
  const items: HTMLButtonElement[] = [];
  const item = (idx: number, label: string, sub: string | null, onClick: () => void, primary = false, testid?: string): HTMLButtonElement => {
    const b = h('button', { class: `rx-btn${primary ? ' primary' : ''}`, type: 'button', 'data-testid': testid ?? null });
    b.innerHTML = `<span class="rx-btn-idx">${pad2(idx)}</span><span>${esc(label)}${sub ? `<span class="rx-btn-sub">${esc(sub)}</span>` : ''}</span>${icon('chevron', 'rx-ico rx-chev')}`;
    b.addEventListener('click', () => {
      act.sound('confirm');
      onClick();
    });
    b.addEventListener('pointerenter', () => act.sound('hover'));
    items.push(b);
    return b;
  };
  let n = 1;
  const list = h('nav', { class: 'rx-menu-list', 'aria-label': 'Main menu' });
  const cont = data.continueLevel;
  const anyProgress = data.levels.some((l) => l.status === 'completed');
  if (cont) {
    list.append(item(n++, anyProgress ? 'Continue' : 'Begin', `Chamber ${pad2(cont.order)} · ${cont.name}`, act.onContinue, true, 'menu-continue'));
  }
  list.append(item(n++, 'Level select', null, act.onLevelSelect, false, 'menu-levels'));
  list.append(item(n++, 'Settings', null, act.onSettings, false, 'menu-settings'));
  list.append(item(n++, 'Credits', null, act.onCredits, false, 'menu-credits'));

  const completed = data.levels.filter((l) => l.status === 'completed').length;
  const bestEchoTotal = data.levels.reduce((s, l) => s + (l.best?.echoes ?? 0), 0);
  const aside = h('aside', { class: 'rx-panel rx-menu-aside', 'aria-label': 'Progress' });
  aside.innerHTML =
    `<div class="rx-hair"></div><div class="rx-eyebrow cyan">Temporal record</div><div class="rx-rule"></div>` +
    `<div class="rx-stat-row"><span class="rx-muted">Chambers restored</span><span class="rx-num">${completed} / ${data.levels.length}</span></div>` +
    `<div class="rx-stat-row"><span class="rx-muted">Stars</span><span class="rx-num">${data.totalStars} / ${data.maxStars}</span></div>` +
    `<div class="rx-stat-row"><span class="rx-muted">Echoes in best runs</span><span class="rx-num">${bestEchoTotal}</span></div>` +
    (data.persistent === false ? `<div class="rx-stat-row" style="color:var(--rx-coral)"><span>Saving unavailable — progress lasts this session</span></div>` : '');

  const rings = h('div', { class: 'rx-rings', html: ringsSVG('menu') });
  const logo = h(
    'div',
    { class: 'rx-logo-block' },
    h('h1', { class: 'rx-logo', 'aria-label': 'Recursion', html: 'RECURSI<span class="o">O</span>N' }),
    h('div', { class: 'rx-tagline' }, 'A temporal puzzle adventure'),
    h('div', { class: 'rx-tags', 'aria-hidden': 'true', html: 'Record <i>•</i> Rewind <i>•</i> Repeat' }),
    list,
  );
  const foot = h('div', {
    class: 'rx-menu-foot',
    html:
      `<span>${esc(data.version ?? 'v0.1')} · Ascendant Facility</span>` +
      `<span>${deviceHintHTML(
        '<span class="rx-key cyan">↑</span> <span class="rx-key cyan">↓</span> Navigate &nbsp; <span class="rx-key cyan">Enter</span> Select',
        `${padHintHTML(12)}${padHintHTML(13)} Navigate &nbsp; ${padHintHTML(0)} Select &nbsp; ${padHintHTML(1)} Back`,
      )}</span>`,
  });
  const el = h('div', { class: 'rx-screen rx-backdrop rx-menu', role: 'dialog', 'aria-label': 'Recursion main menu', 'data-testid': 'main-menu' }, rings, logo, aside, foot);
  const off = arrowNav(list);
  return { el, dispose: off };
}

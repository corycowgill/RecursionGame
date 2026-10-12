import { arrowNav, esc, h } from '../dom';
import { deviceHintHTML, padHintHTML } from '../glyphs';
import { icon } from '../icons';
import type { Screen } from './MainMenu';
import { injectNarrativeStyles } from './narrative';

type Sound = (c: 'hover' | 'confirm' | 'back') => void;

export interface CreditsOptions {
  onBack(): void;
  sound: Sound;
  /** Auto-scroll the roll (after the ending). Any user scroll / key / pad / touch input stops it. */
  rolling?: boolean;
  /** Fade in from white (the ending fades to white). */
  fromWhite?: boolean;
  /** Label of the leave button ("Back" from the main menu, "Main menu" after the ending). */
  backLabel?: string;
  /** No auto-roll (reduced motion). */
  reducedMotion?: boolean;
}

export interface CreditsScreen extends Screen {
  /** Esc / controller B when the credits are the base screen (after the ending). */
  back(): boolean;
  /** True while the roll scrolls by itself. */
  readonly autoRolling: boolean;
}

/** Credited roles. Every role was an AI agent; the list mirrors docs/agent-progress (one report per role). */
export const CREDIT_ROLES: readonly string[] = ['Game Director', 'Temporal Systems', 'Gameplay', 'Graphics', 'UI / UX', 'Level Design', 'Audio', 'QA'];
export const CREDIT_ADDITIONAL_ROLES: readonly string[] = [
  'Character Art',
  'Environment Art',
  'Art & Rendering',
  'Puzzle Analysis',
  'Input & Gamepad',
  'Mobile & Touch',
  'Performance',
  'Narrative & Release',
];

/** Third-party software and fonts shipped in the game, with their licenses. */
export const CREDIT_LICENSES: readonly { name: string; license: string; note: string }[] = [
  { name: 'three.js', license: 'MIT License', note: '© 2010–2026 three.js authors' },
  { name: 'Orbitron', license: 'SIL Open Font License 1.1', note: '© 2018 The Orbitron Project Authors' },
  { name: 'Rajdhani', license: 'SIL Open Font License 1.1', note: '© 2014 Indian Type Foundry' },
];

const ROLL_PX_PER_S = 34;

/**
 * CREDITS (round 5): "HALLUCINATED GAMES presents" in the studio ident's style (Orbitron / Rajdhani, its green →
 * purple → gold spark gradient), then RECURSION, the team and the licenses. One scrollable roll:
 *   keyboard  ↑/↓ move between sections (scrolled into view), PageUp/PageDown/Home/End scroll, Esc leaves;
 *   gamepad   D-pad / stick moves between sections (createUI's spatial nav), A activates, B leaves;
 *   touch     drag to scroll, tap the leave button.
 * Reachable from the main menu (sub-screen) and after the ending (base screen, auto-rolling).
 */
export function createCredits(opts: CreditsOptions): CreditsScreen {
  injectNarrativeStyles();
  const sec = (title: string | null, body: string, testid?: string): HTMLElement =>
    h('section', { tabindex: '0', 'data-testid': testid ?? null, html: (title ? `<h3>${esc(title)}</h3>` : '') + body });
  const roles = (items: readonly string[]): string => `<ul class="roles">${items.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
  const dl = (items: readonly [string, string][]): string => `<dl>${items.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>`;

  const header = h('section', {
    tabindex: '0',
    'data-testid': 'credits-header',
    'aria-label': 'Hallucinated Games presents Recursion',
    html:
      `<div class="studio" aria-hidden="true">HALLUCINATED<span>GAMES</span></div>` +
      `<div class="presents" aria-hidden="true">presents</div>` +
      `<div class="title" aria-hidden="true">RECURSI<span class="o">O</span>N</div>` +
      `<div class="sub" aria-hidden="true">A temporal puzzle adventure</div>`,
  });
  header.style.marginTop = '0';

  const team = sec(
    'The team',
    `<p class="lead">Built by an AI agent team<br/>directed by <b>Cory Cowgill</b></p>` +
      roles(CREDIT_ROLES) +
      `<p class="note">Every role was performed by an AI agent (Claude, made by Anthropic), working in parallel on one codebase. Direction and product ownership: Cory Cowgill.</p>`,
    'credits-team',
  );
  const more = sec('Also on the team', roles(CREDIT_ADDITIONAL_ROLES), 'credits-more');
  const tech = sec(
    'Software & fonts',
    dl(CREDIT_LICENSES.map((l) => [l.name, `${l.license} · ${l.note}`] as [string, string])) +
      `<p class="note">Fonts are self-hosted through Fontsource. Built with TypeScript, Vite, Vitest and Playwright.<br/>All music and sound are generated procedurally at runtime.</p>`,
    'credits-licenses',
  );
  const studio = sec('Studio ident', `<p class="lead">Hallucinated Games</p>`);
  const thanks = sec(null, `<p class="lead">Thank you for playing.</p><div class="fin">Every echo was you</div>`, 'credits-thanks');

  const inner = h('div', { class: 'roll-inner' }, header, team, more, tech, studio, thanks);
  const roll = h('div', { class: 'roll', 'data-testid': 'credits-roll', tabindex: '-1' }, inner);

  const back = h('button', {
    class: 'rx-btn small',
    type: 'button',
    'data-testid': 'credits-back',
    html: `${icon('back')}<span>${esc(opts.backLabel ?? 'Back')}</span>`,
  });
  back.addEventListener('click', () => {
    opts.sound('back');
    opts.onBack();
  });
  back.addEventListener('pointerenter', () => opts.sound('hover'));
  const hint = h('div', {
    class: 'hint',
    html: deviceHintHTML(
      '<span class="rx-key cyan">↑</span><span class="rx-key cyan">↓</span> Scroll &nbsp; <span class="rx-key cyan">Esc</span> Back',
      `${padHintHTML(12)}${padHintHTML(13)} Scroll &nbsp; ${padHintHTML(1)} Back`,
    ),
  });
  const bar = h('div', { class: 'bar' }, hint, h('div', { class: 'btns' }, back));
  const el = h(
    'div',
    { class: `rx-screen rx-credits${opts.fromWhite ? ' from-white' : ''}`, role: 'dialog', 'aria-label': 'Credits', 'data-testid': 'credits' },
    roll,
    bar,
  );

  // Keyboard: ↑/↓ step through the sections and the leave button (focus scrolls them into view).
  const offNav = arrowNav(el, 'section[tabindex="0"], button:not([disabled])');
  // Auto-roll (after the ending): stops for good on any user input (keys, wheel, touch, click, or a controller moving
  // focus, which arrives as a focus change once the roll has started).
  const win = el.ownerDocument.defaultView;
  let rolling = !!opts.rolling && !opts.reducedMotion && typeof win?.requestAnimationFrame === 'function';
  let started = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let startTimer = 0;
  const stopRoll = (): void => {
    rolling = false;
    if (raf && win) win.cancelAnimationFrame(raf);
    raf = 0;
  };
  const onFocus = (e: FocusEvent): void => {
    if (started) stopRoll();
    const t = e.target as HTMLElement | null;
    if (t && t.tagName === 'SECTION' && !rolling) t.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  el.addEventListener('focusin', onFocus);
  const tick = (now: number): void => {
    if (!rolling || !win) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    acc += dt * ROLL_PX_PER_S;
    if (acc >= 1) {
      const step = Math.floor(acc);
      acc -= step;
      const before = roll.scrollTop;
      roll.scrollTop = before + step;
      if (roll.scrollTop === before && before > 0) {
        stopRoll(); // reached the end: hand focus to the leave button
        back.focus({ preventScroll: true });
        return;
      }
    }
    raf = win.requestAnimationFrame(tick);
  };
  const userStops = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  for (const ev of userStops) el.addEventListener(ev, stopRoll, { passive: true });
  if (rolling && win) {
    // Start a moment after the screen has faded in from white.
    startTimer = win.setTimeout(() => {
      started = true;
      if (rolling) raf = win.requestAnimationFrame(tick);
    }, 1200);
  } else started = true;

  return {
    el,
    get autoRolling() {
      return rolling;
    },
    back() {
      opts.sound('back');
      opts.onBack();
      return true;
    },
    dispose() {
      stopRoll();
      if (win) win.clearTimeout(startTimer);
      offNav();
      el.removeEventListener('focusin', onFocus);
      for (const ev of userStops) el.removeEventListener(ev, stopRoll);
    },
  };
}

import type { LevelDefinition } from '../../engine/contracts';
import { movementLabel, primaryLabel, type KeyBindings } from '../../persistence/keybinds';
import type { EchoPaletteId } from '../../persistence/settings';
import { esc, h } from '../dom';
import { icon, shapeBadge, shapeGlyph } from '../icons';
import { echoStyle } from '../palette';
import { formatTicks } from '../timeline/model';
import type { UIFrame } from '../types';
import type { OnboardingStep } from './onboarding';

/** Cheap DOM write: only touches the node when the value changed. */
function setText(el: HTMLElement, v: string): void {
  if (el.textContent !== v) el.textContent = v;
}
function setHTML(el: HTMLElement, v: string, cache: Map<HTMLElement, string>): void {
  if (cache.get(el) !== v) {
    cache.set(el, v);
    el.innerHTML = v;
  }
}

/**
 * HUD — level card + objective (top-left), recording / loop clock / echo budget (top-right), context prompt
 * (above the timeline), control hints (bottom-right), progressive hint card and onboarding prompts.
 */
export class Hud {
  readonly el: HTMLElement;
  private readonly chamber: HTMLElement;
  private readonly name: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objText: HTMLElement;
  private readonly objConds: HTMLElement;
  private readonly rec: HTMLElement;
  private readonly recLbl: HTMLElement;
  private readonly recLoop: HTMLElement;
  private readonly clockNow: HTMLElement;
  private readonly clockMax: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly chips: HTMLElement;
  private readonly count: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptKey: HTMLElement;
  private readonly promptLbl: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly onboard: HTMLElement;
  private readonly cache = new Map<HTMLElement, string>();
  private level: LevelDefinition | null = null;
  private controlsSig = '';

  constructor(private readonly onSkipTutorial: () => void) {
    this.chamber = h('div', { class: 'rx-eyebrow' });
    this.name = h('h1', {});
    this.sub = h('div', { class: 'sub' });
    this.objText = h('div', { class: 'txt' });
    this.objConds = h('div', { class: 'conds' });
    this.objective = h('div', { class: 'rx-objective', role: 'status', 'aria-live': 'polite' }, h('span', { html: icon('target') }), h('div', {}, this.objText, this.objConds));
    const levelPanel = h('section', { class: 'rx-panel rx-hud-level', 'aria-label': 'Chamber' }, h('div', { class: 'rx-hair' }), this.chamber, this.name, this.sub, this.objective);

    this.recLbl = h('span', { class: 'lbl' }, 'REC');
    this.recLoop = h('span', { class: 'loop' });
    this.rec = h('div', { class: 'rx-rec', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), this.recLbl, this.recLoop);
    this.clockNow = h('span', { class: 'now' });
    this.clockMax = h('span', { class: 'max' });
    this.barFill = h('i', {});
    this.bar = h('div', { class: 'rx-bar', role: 'progressbar', 'aria-label': 'Loop time used', 'aria-valuemin': 0, 'aria-valuemax': 100 }, this.barFill);
    this.chips = h('span', { class: 'chips' });
    this.count = h('span', { class: 'count' });
    const timePanel = h(
      'section',
      { class: 'rx-panel cyan rx-hud-time', 'aria-label': 'Recording', 'data-testid': 'hud-time' },
      h('div', { class: 'rx-hair' }),
      this.rec,
      h('div', { class: 'rx-clock' }, this.clockNow, this.clockMax),
      this.bar,
      h('div', { class: 'rx-echoes' }, h('span', { class: 'lbl' }, 'Echoes'), this.chips, this.count),
    );

    this.promptKey = h('span', { class: 'rx-key' }, 'E');
    this.promptLbl = h('span', { class: 'lbl' });
    this.prompt = h('div', { class: 'rx-panel rx-prompt off', role: 'status', 'aria-live': 'polite', 'data-testid': 'prompt' }, this.promptKey, this.promptLbl);
    this.controls = h('div', { class: 'rx-controls', 'aria-label': 'Controls' });
    this.hint = h('aside', { class: 'rx-panel rx-hint', hidden: true, 'aria-live': 'polite' });
    this.onboard = h('aside', { class: 'rx-panel rx-onboard', hidden: true, 'aria-live': 'polite', 'data-testid': 'onboarding' });

    this.el = h('div', { class: 'rx-hud', 'data-testid': 'hud' }, levelPanel, timePanel, this.prompt, this.controls, this.hint, this.onboard);
  }

  setLevel(level: LevelDefinition): void {
    this.level = level;
    setText(this.chamber, level.order > 0 ? `Chamber ${String(level.order).padStart(2, '0')}` : 'Test chamber');
    setText(this.name, level.name);
    setText(this.sub, level.subtitle ?? '');
    this.sub.hidden = !level.subtitle;
    this.hideHint();
    this.showOnboarding(null);
  }

  update(frame: UIFrame, binds: KeyBindings, palette: EchoPaletteId, timelineHeight: number): void {
    const { state, timeline, level } = frame;
    if (this.level !== level) this.setLevel(level);
    this.el.style.setProperty('--rx-tl-h', `${Math.round(timelineHeight)}px`);

    // Objective
    const obj = frame.objective;
    const exitDef = level.entities.find((e) => e.id === level.exitId);
    const fallback = (exitDef?.config as { objective?: string } | undefined)?.objective ?? 'Reach the exit portal';
    setText(this.objText, obj?.objective ?? fallback);
    if (obj && obj.exit.conditions.length > 0) {
      const c = obj.exit.conditions;
      const diamonds = c.map((x) => `<i class="rx-cond${x.satisfied ? ' on' : ''}" title="${esc(x.label)}${x.satisfied ? ' (active)' : ''}"></i>`).join('');
      setHTML(this.objConds, `${diamonds}<span>${obj.exit.satisfiedCount} / ${c.length} ${obj.exit.logic === 'or' ? 'any' : 'active'}</span>`, this.cache);
      this.objConds.hidden = false;
    } else this.objConds.hidden = true;
    this.objective.classList.toggle('ready', !!obj?.exitActive);

    // Recording state
    const echoes = timeline.tracks.filter((t) => t.kind === 'echo' && t.recursion === undefined).length; // nested-loop copies are free
    const preview = frame.previewTick ?? null;
    let mode = 'rec';
    let lbl = 'REC';
    if (state.status === 'complete') {
      mode = 'done';
      lbl = 'Complete';
    } else if (state.status === 'timeUp') {
      mode = 'timeup';
      lbl = 'Time up';
    } else if (preview !== null) {
      mode = 'paused';
      lbl = 'Preview';
    } else if (frame.paused) {
      mode = 'paused';
      lbl = 'Paused';
    }
    this.rec.className = `rx-rec ${mode === 'rec' ? '' : mode}`;
    setText(this.recLbl, lbl.toUpperCase());
    setText(this.recLoop, `Loop ${echoes + 1}`);
    const shownTick = preview ?? state.tick;
    setText(this.clockNow, formatTicks(shownTick));
    setText(this.clockMax, `/ ${formatTicks(timeline.maxTicks)}`);
    const frac = Math.min(1, state.tick / Math.max(1, timeline.maxTicks));
    this.barFill.style.width = `${(frac * 100).toFixed(2)}%`;
    this.bar.classList.toggle('warn', frac > 0.85);
    this.bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));

    // Echo budget chips (shape + number, never colour alone)
    let chips = '';
    for (let i = 0; i < timeline.maxEchoes; i++) {
      const st = echoStyle(i, palette);
      chips += i < echoes ? shapeBadge(st.shape, st.badge, st.color, 22) : `<span class="rx-chip-empty" title="Echo ${i + 1} available">${shapeGlyph(st.shape, '#8ea6bf', 16, false)}</span>`;
    }
    setHTML(this.chips, chips, this.cache);
    setHTML(this.count, `${echoes}<span> / ${timeline.maxEchoes}</span>`, this.cache);
    this.count.setAttribute('aria-label', `${echoes} of ${timeline.maxEchoes} echoes used`);

    // Context prompt
    const p = frame.prompt;
    const showPrompt = !!p && p.action !== 'none' && state.status === 'playing' && preview === null;
    this.prompt.classList.toggle('off', !showPrompt);
    if (p && showPrompt) {
      this.prompt.classList.toggle('blocked', p.action === 'blocked');
      setText(this.promptKey, p.action === 'blocked' ? '!' : primaryLabel(binds, 'interact'));
      setText(this.promptLbl, p.label);
    }

    // Control hints
    const sig = JSON.stringify(binds);
    if (sig !== this.controlsSig) {
      this.controlsSig = sig;
      const k = (a: Parameters<typeof primaryLabel>[1]): string => `<span class="rx-key">${esc(primaryLabel(binds, a))}</span>`;
      this.controls.innerHTML = [
        `<span><span class="rx-key">${esc(movementLabel(binds))}</span>Move</span>`,
        `<span>${k('interact')}Interact</span>`,
        `<span>${k('rewind')}New echo</span>`,
        `<span>${k('restart')}Restart</span>`,
        `<span>${k('timeline')}Timeline</span>`,
        `<span>${k('pause')}Pause</span>`,
      ].join('');
    }
  }

  // ------------------------------------------------------------------ hints

  showHint(text: string, index: number, total: number): void {
    this.hint.hidden = false;
    this.hint.classList.remove('collapsed');
    this.hint.innerHTML = '';
    const close = h('button', { class: 'rx-iconbtn', type: 'button', 'aria-label': 'Collapse hint', html: icon('close') });
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hint.classList.add('collapsed');
    });
    this.hint.append(
      h('div', { class: 'hd' }, h('span', { html: icon('hint') }), h('span', { class: 'rx-eyebrow' }, `Hint ${index + 1} / ${total}`), close),
      h('p', {}, text),
    );
    this.hint.onclick = () => this.hint.classList.remove('collapsed');
  }

  collapseHint(): void {
    this.hint.classList.add('collapsed');
  }

  hideHint(): void {
    this.hint.hidden = true;
  }

  // ------------------------------------------------------------------ onboarding

  showOnboarding(step: OnboardingStep | null, index = 0, total = 0, binds?: KeyBindings): void {
    if (!step || !binds) {
      this.onboard.hidden = true;
      return;
    }
    const text = esc(step.text).replace(/\{key:(\w+)\}/g, (_, a: string) => `<span class="rx-key">${esc(primaryLabel(binds, a as never))}</span>`);
    const keys =
      step.keys === 'move'
        ? (['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const).map((a) => primaryLabel(binds, a))
        : step.keys.map((a) => primaryLabel(binds, a));
    const dots = Array.from({ length: total }, (_, i) => `<i class="${i <= index ? 'on' : ''}"></i>`).join('');
    this.onboard.hidden = false;
    this.onboard.innerHTML =
      `<div class="rx-hair"></div><div class="rx-eyebrow">Training · ${index + 1} / ${total}</div>` +
      `<div class="title">${esc(step.title)}</div><p>${text}</p>` +
      (keys.length ? `<div class="keys">${keys.map((k) => `<span class="rx-key">${esc(k)}</span>`).join('')}</div>` : '') +
      `<div class="dots" aria-hidden="true">${dots}</div>`;
    const skip = h('button', { class: 'rx-iconbtn skip', type: 'button', 'aria-label': 'Skip tutorial', title: 'Skip tutorial', html: icon('close') });
    skip.style.pointerEvents = 'auto';
    skip.addEventListener('click', () => this.onSkipTutorial());
    this.onboard.append(skip);
  }
}

import type { LevelDefinition } from '../../engine/contracts';
import { defaultKeybinds, type KeyBindings } from '../../persistence/keybinds';
import type { EchoPaletteId } from '../../persistence/settings';
import { actionTextHTML, actionTextPlain } from '../actionText';
import { esc, h } from '../dom';
import { capHTML, defaultGlyphs, type GlyphContext } from '../glyphs';
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
  private promptSig = '';
  /** Prompt glyph context (last-used device + bindings), set by createUI. Keyboard defaults until then. */
  glyphs: GlyphContext | null = null;
  /** Current hint (authored text with action tokens), re-rendered when the device or the bindings change. */
  private hintState: { text: string; index: number; total: number } | null = null;
  /**
   * Short phone screens with the touch controls up (round 4): a new hint arrives as a small chip that expands on tap,
   * so the card never sits in the joystick zone. Set by createUI.
   */
  autoCollapseHint: () => boolean = () => false;
  private levelObserver: ResizeObserver | null = null;

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
    this.hint = h('aside', { class: 'rx-panel rx-hint', hidden: true, 'aria-live': 'polite', 'data-testid': 'hint' });
    this.onboard = h('aside', { class: 'rx-panel rx-onboard', hidden: true, 'aria-live': 'polite', 'data-testid': 'onboarding' });

    this.el = h('div', { class: 'rx-hud', 'data-testid': 'hud' }, levelPanel, timePanel, this.prompt, this.controls, this.hint, this.onboard);
    // The level card's bottom edge, for the short-screen hint chip that sits right under it (round 4).
    if (typeof ResizeObserver === 'function') {
      this.levelObserver = new ResizeObserver(() => {
        const b = levelPanel.offsetTop + levelPanel.offsetHeight;
        if (b > 0) this.el.style.setProperty('--rx-lvl-b', `${b}px`);
      });
      this.levelObserver.observe(levelPanel);
    }
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
    const g = this.ctx(binds);
    if (p && showPrompt) {
      this.prompt.classList.toggle('blocked', p.action === 'blocked');
      // Interaction prompt glyph follows the last-used device (key cap or controller button).
      const keySig = p.action === 'blocked' ? '!' : `${JSON.stringify(g.device)}|${capHTML(g, 'interact')}`;
      if (keySig !== this.promptSig) {
        this.promptSig = keySig;
        if (p.action === 'blocked') {
          this.promptKey.className = 'rx-key';
          this.promptKey.textContent = '!';
        } else {
          const cap = h('span', { html: capHTML(g, 'interact') }).firstElementChild as HTMLElement | null;
          this.promptKey.className = cap?.className ?? 'rx-key';
          this.promptKey.textContent = cap?.textContent ?? '';
        }
      }
      setText(this.promptLbl, p.label);
    }

    // Control hints (redrawn when the bindings or the last-used device change)
    const sig = JSON.stringify([binds, g.device, g.padbinds]);
    if (sig !== this.controlsSig) {
      this.controlsSig = sig;
      const k = (a: Parameters<typeof capHTML>[1]): string => capHTML(g, a);
      const pad = g.device.kind === 'gamepad';
      this.controls.innerHTML = [
        `<span>${k('move')}Move</span>`,
        `<span>${k('interact')}Interact</span>`,
        `<span>${k('rewind')}New echo</span>`,
        `<span>${k('restart')}${pad ? 'Hold · Restart' : 'Restart'}</span>`,
        `<span>${k('timeline')}Timeline</span>`,
        ...(pad ? [`<span>${k('preview')}Preview</span>`] : []),
        `<span>${k('pause')}Pause</span>`,
      ].join('');
    }
  }

  /** Cap of the restart control for the current device (hold indicator). */
  restartCap(): string {
    const g = this.glyphs;
    return g ? capHTML(g, 'restart') : '';
  }

  /** Glyph context with the given key bindings (the HUD is handed the live bindings every frame). */
  private ctx(binds: KeyBindings): GlyphContext {
    const g = this.glyphs ?? defaultGlyphs(binds);
    return g.keybinds === binds ? g : { ...g, keybinds: binds };
  }

  dispose(): void {
    this.levelObserver?.disconnect();
    this.levelObserver = null;
  }

  // ------------------------------------------------------------------ hints

  showHint(text: string, index: number, total: number): void {
    this.hintState = { text, index, total };
    this.renderHint(this.autoCollapseHint(), true);
  }

  /** Redraws the visible hint with the current device's glyphs (keeps its collapsed / expanded state). */
  refreshHint(): void {
    if (!this.hintState || this.hint.hidden) return;
    this.renderHint(this.hint.classList.contains('collapsed'), false);
  }

  private renderHint(collapsed: boolean, fresh: boolean): void {
    const st = this.hintState;
    if (!st) return;
    const g = this.glyphs ?? defaultGlyphs(defaultKeybinds());
    this.hint.hidden = false;
    this.hint.innerHTML = '';
    const close = h('button', { class: 'rx-iconbtn', type: 'button', 'aria-label': 'Collapse hint', html: icon('close') });
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapseHint();
    });
    const label = `Hint ${st.index + 1} / ${st.total}`;
    this.hint.append(
      h('div', { class: 'hd' }, h('span', { html: icon('hint') }), h('span', { class: 'rx-eyebrow' }, label), close),
      h('p', { html: actionTextHTML(st.text, g), 'aria-label': actionTextPlain(st.text, g) }),
    );
    this.setHintCollapsed(collapsed);
    this.hint.classList.toggle('fresh', fresh && collapsed);
    this.hint.onclick = () => this.setHintCollapsed(false);
  }

  private setHintCollapsed(on: boolean): void {
    this.hint.classList.toggle('collapsed', on);
    if (!on) this.hint.classList.remove('fresh');
    this.hint.setAttribute('aria-expanded', String(!on));
    if (on) this.hint.setAttribute('title', 'Tap to show the hint');
    else this.hint.removeAttribute('title');
  }

  collapseHint(): void {
    if (!this.hint.hidden) this.setHintCollapsed(true);
  }

  /** The hint card is showing expanded (not hidden, not collapsed to a chip). */
  get hintExpanded(): boolean {
    return !this.hint.hidden && !this.hint.classList.contains('collapsed');
  }

  hideHint(): void {
    this.hint.hidden = true;
    this.hintState = null;
  }

  // ------------------------------------------------------------------ onboarding

  showOnboarding(step: OnboardingStep | null, index = 0, total = 0, binds?: KeyBindings): void {
    if (!step || !binds) {
      this.onboard.hidden = true;
      return;
    }
    const g = this.ctx(binds);
    const text = actionTextHTML(step.text, g);
    const keys =
      step.keys === 'move'
        ? g.device.kind !== 'keyboard'
          ? [capHTML(g, 'move')]
          : (['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const).map((a) => capHTML(g, a))
        : step.keys.map((a) => capHTML(g, a));
    const dots = Array.from({ length: total }, (_, i) => `<i class="${i <= index ? 'on' : ''}"></i>`).join('');
    this.onboard.hidden = false;
    this.onboard.innerHTML =
      `<div class="rx-hair"></div><div class="rx-eyebrow">Training · ${index + 1} / ${total}</div>` +
      `<div class="title">${esc(step.title)}</div><p>${text}</p>` +
      (keys.length ? `<div class="keys">${keys.join('')}</div>` : '') +
      `<div class="dots" aria-hidden="true">${dots}</div>`;
    const skip = h('button', { class: 'rx-iconbtn skip', type: 'button', 'aria-label': 'Skip tutorial', title: 'Skip tutorial', html: icon('close') });
    skip.style.pointerEvents = 'auto';
    skip.addEventListener('click', () => this.onSkipTutorial());
    this.onboard.append(skip);
  }
}

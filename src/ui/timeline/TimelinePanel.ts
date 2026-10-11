import type { Timeline } from '../../engine/contracts';
import type { PadEvent } from '../../engine/input/GamepadInput';
import type { KeyBindings } from '../../persistence/keybinds';
import { primaryLabel } from '../../persistence/keybinds';
import type { EchoPaletteId } from '../../persistence/settings';
import { esc, h } from '../dom';
import { capHTML, capText, padCapHTML, type GlyphContext } from '../glyphs';
import { DIVERGENCE_ICON, icon, markerIcon, shapeBadge } from '../icons';
import type { UICallbacks } from '../types';
import {
  buildTrackModels,
  computeViewport,
  contentFrac,
  contentTransform,
  cycleEchoSelection,
  formatTicks,
  nextZoom,
  rulerTicks,
  scrubStep,
  tickAtViewFrac,
  tracksSignature,
  viewFrac,
  type TrackModel,
  type Viewport,
} from './model';

export interface TimelineUpdate {
  paused: boolean;
  /** Tick being previewed (from scrubbing or temporal preview), or null. */
  previewTick: number | null;
}

/**
 * TEMPORAL TIMELINE — the signature UI. A compact strip is always visible; Tab (or the header button) expands it
 * into the full editor with per-loop tracks, labels, visibility toggles, delete buttons and the transport bar
 * (RECORD / REWIND / PLAY-PAUSE / DELETE LOOP / TIMELINE ZOOM / ECHO SELECT).
 *
 * Rendering strategy: lanes are rebuilt only when their structure changes (tracksSignature); every frame only the
 * playhead, played spans, live player span and zoom transform are updated, so it is cheap at 60 fps.
 */
export class TimelinePanel {
  readonly el: HTMLElement;
  private readonly head: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly zoomEl: HTMLElement;
  private readonly expandKey: HTMLElement;
  private readonly expandLbl: HTMLElement;
  private readonly labels: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly content: HTMLElement;
  private readonly ruler: HTMLElement;
  private readonly lanes: HTMLElement;
  private readonly playhead: HTMLElement;
  private readonly scrubhead: HTMLElement;
  private readonly hoverLine: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly btn: Record<'rec' | 'rwd' | 'ply' | 'del' | 'zm' | 'sel', HTMLButtonElement>;

  expanded = false;
  zoom = 1;
  selected: number | null = null;
  readonly hidden = new Set<number>();
  palette: EchoPaletteId = 'default';
  binds: KeyBindings | null = null;
  /** Prompt glyphs for the last-used device (set by createUI); null = keyboard labels from `binds`. */
  private glyphCtx: GlyphContext | null = null;
  private readonly padLegend: HTMLElement;
  /**
   * Touch mode (round 3, mobile; set by createUI while touch is the last-used device): the collapsed strip is one big
   * tap target that opens the timeline sheet, and scrubbing happens by dragging in the expanded sheet.
   */
  touchMode = false;

  private timeline: Timeline | null = null;
  private tracks: TrackModel[] = [];
  private sig = '';
  private rulerSig = '';
  private vp: Viewport = { start: 0, span: 1, maxTicks: 1, zoom: 1 };
  private scrubbing = false;
  private scrubTick: number | null = null;
  private externalPreview: number | null = null;
  private paused = false;
  private playedEls = new Map<string, HTMLElement>();
  private playerSpan: HTMLElement | null = null;

  constructor(private readonly cb: UICallbacks) {
    this.timeEl = h('span', { class: 'time', 'aria-live': 'off' });
    this.previewEl = h('span', { class: 'preview', hidden: true });
    this.zoomEl = h('span', {});
    this.expandKey = h('span', { class: 'rx-key cyan' }, 'Tab');
    this.expandLbl = h('span', {}, 'Expand');
    const expandBtn = h(
      'button',
      { class: 'rx-btn ghost small', type: 'button', 'aria-label': 'Toggle expanded timeline', onclick: () => this.toggle() },
      this.expandKey,
      this.expandLbl,
    );
    this.head = h(
      'div',
      { class: 'rx-tl-head' },
      h('span', { class: 'rx-eyebrow' }, 'Temporal timeline'),
      this.timeEl,
      this.previewEl,
      h('span', { class: 'spacer' }),
      h('span', { class: 'meta' }, this.zoomEl),
      h('span', { class: 'rx-tl-touchhint rx-touch-only', html: '<span class="tap">Tap to open</span><span class="drag">Drag the tracks to scrub</span>' }),
      expandBtn,
    );
    this.labels = h('div', { class: 'rx-tl-labels' });
    this.ruler = h('div', { class: 'rx-tl-ruler', 'aria-hidden': 'true' });
    this.lanes = h('div', { class: 'rx-tl-lanes' });
    this.content = h('div', { class: 'rx-tl-content' }, this.ruler, this.lanes);
    this.playhead = h('div', { class: 'rx-playhead', 'aria-hidden': 'true' });
    this.scrubhead = h('div', { class: 'rx-scrubhead', 'aria-hidden': 'true', hidden: true });
    this.hoverLine = h('div', { class: 'rx-tl-hover', 'aria-hidden': 'true', hidden: true });
    this.stage = h(
      'div',
      {
        class: 'rx-tl-stage',
        tabindex: 0,
        role: 'slider',
        'aria-label': 'Timeline scrubber. Arrow keys preview time, Shift for fine steps, Enter or Escape returns to live.',
        'aria-valuemin': 0,
      },
      this.content,
      this.playhead,
      this.scrubhead,
      this.hoverLine,
    );
    const mk = (cls: string, ic: string, text: string, label: string, onClick: () => void): HTMLButtonElement =>
      h('button', { class: `rx-tcb ${cls}`, type: 'button', 'aria-label': label, title: label, onclick: onClick }, h('span', { class: 'ic', html: ic }), h('span', { class: 'tx' }, text));
    this.btn = {
      rec: mk('rec', icon('record'), 'Record', 'End this loop and create an echo', () => this.cb.onCommitEcho?.()),
      rwd: mk('rwd', icon('rewind'), 'Rewind', 'Discard this take and rewind to the start', () => this.cb.onResetLoop?.()),
      ply: mk('ply', icon('pause'), 'Play / Pause', 'Play or pause time', () => this.cb.onTogglePause?.()),
      del: mk('del', icon('trash'), 'Delete loop', 'Delete the selected echo loop', () => this.deleteSelected()),
      zm: mk('zm', icon('zoom'), 'Timeline zoom', 'Cycle timeline zoom', () => this.cycleZoom()),
      sel: mk('sel', icon('echoSelect'), 'Echo select', 'Select the next echo', () => this.cycleSelect()),
    };
    this.controls = h(
      'div',
      { class: 'rx-tl-controls', role: 'toolbar', 'aria-label': 'Timeline controls' },
      this.btn.rec,
      this.btn.rwd,
      this.btn.ply,
      this.btn.del,
      h('span', { class: 'sep', 'aria-hidden': 'true' }),
      this.btn.zm,
      this.btn.sel,
    );
    // Gamepad legend (shown only in the expanded timeline while a controller is the active device).
    this.padLegend = h('div', { class: 'rx-tl-padlegend rx-pad-only', 'data-testid': 'timeline-pad-legend' });
    this.el = h(
      'section',
      { class: 'rx-panel cyan rx-tl compact', role: 'region', 'aria-label': 'Temporal timeline', 'data-testid': 'timeline' },
      h('div', { class: 'rx-hair' }),
      h('div', { class: 'rx-tl-grab', 'aria-hidden': 'true', onclick: () => this.setExpanded(false) }),
      this.head,
      h('div', { class: 'rx-tl-body' }, this.labels, this.stage),
      this.controls,
      this.padLegend,
    );
    this.bindScrub();
    this.updateZoomLabel();
    // Touch: a tap anywhere on the collapsed strip opens the sheet (buttons keep their own action).
    this.el.addEventListener('click', (e) => {
      if (!this.touchMode || this.expanded) return;
      if ((e.target as Element | null)?.closest?.('button')) return;
      this.setExpanded(true);
    });
  }

  // ------------------------------------------------------------------ public API

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    if (!expanded) this.endScrub();
    this.expanded = expanded;
    this.el.classList.toggle('compact', !expanded);
    this.el.classList.toggle('expanded', expanded);
    this.expandLbl.textContent = expanded ? 'Collapse' : 'Expand';
    this.sig = ''; // labels differ per mode
    this.rulerSig = '';
    this.cb.onTimelineToggle?.(expanded);
    if (this.timeline) this.update(this.timeline, { paused: this.paused, previewTick: this.externalPreview });
  }

  toggle(): void {
    this.setExpanded(!this.expanded);
  }

  /** Select an echo by index (keys 1–5); selecting the selected one deselects. Out-of-range is ignored. */
  selectEcho(index: number | null): void {
    const count = this.echoCount();
    if (index !== null && (index < 0 || index >= count)) return;
    this.selected = index === this.selected ? null : index;
    this.cb.onSelectEcho?.(this.selected);
    this.sig = '';
    if (this.timeline) this.update(this.timeline, { paused: this.paused, previewTick: this.externalPreview });
  }

  setEchoVisible(loopId: number, visible: boolean): void {
    if (visible) this.hidden.delete(loopId);
    else this.hidden.add(loopId);
    this.sig = '';
  }

  /** Height of the panel in px (HUD positions prompts above it). */
  get height(): number {
    return this.el.offsetHeight || (this.expanded ? 260 : 96);
  }

  update(timeline: Timeline, opts: TimelineUpdate): void {
    this.timeline = timeline;
    this.paused = opts.paused;
    this.externalPreview = opts.previewTick;
    const echoCount = timeline.tracks.filter((t) => t.kind === 'echo' && t.recursion === undefined).length;
    if (this.selected !== null && this.selected >= echoCount) this.selected = null;
    // drop hidden ids of loops that no longer exist
    const ids = new Set(timeline.tracks.map((t) => t.loopId).filter((x): x is number => x !== null));
    for (const id of [...this.hidden]) if (!ids.has(id)) this.hidden.delete(id);

    const preview = this.scrubbing ? this.scrubTick : opts.previewTick;
    const focus = preview ?? timeline.currentTick;
    this.vp = computeViewport(timeline.maxTicks, this.zoom, focus);
    this.tracks = buildTrackModels(timeline, { palette: this.palette, hidden: this.hidden, selectedEcho: this.selected });

    const sig = tracksSignature(this.tracks, this.zoom, this.palette) + (this.expanded ? 'E' : 'C') + timeline.maxTicks;
    if (sig !== this.sig) {
      this.sig = sig;
      this.rebuildLanes();
    }
    const width = this.stage.clientWidth || 1000;
    const rsig = `${this.zoom}|${timeline.maxTicks}|${Math.round(width / 40)}`;
    if (rsig !== this.rulerSig) {
      this.rulerSig = rsig;
      this.rebuildRuler(width);
    }

    // per-frame updates
    const tf = contentTransform(this.vp);
    this.content.style.width = `${tf.widthPct}%`;
    this.content.style.transform = `translateX(${tf.translatePct}%)`;
    const max = timeline.maxTicks;
    for (const t of this.tracks) {
      const played = this.playedEls.get(t.key);
      if (played) {
        const frac = t.durationTicks > 0 ? Math.min(1, t.playedTicks / t.durationTicks) : 0;
        played.style.width = `${(frac * 100).toFixed(3)}%`;
      }
      if (t.kind === 'player' && this.playerSpan) this.playerSpan.style.width = `${(contentFrac(t.durationTicks, max) * 100).toFixed(3)}%`;
    }
    this.playhead.style.left = `${(viewFrac(timeline.currentTick, this.vp) * 100).toFixed(3)}%`;
    if (preview !== null && preview !== undefined) {
      this.scrubhead.hidden = false;
      this.scrubhead.style.left = `${(viewFrac(preview, this.vp) * 100).toFixed(3)}%`;
      this.previewEl.hidden = false;
      this.previewEl.textContent = `Preview ${formatTicks(preview)}`;
    } else {
      this.scrubhead.hidden = true;
      this.previewEl.hidden = true;
    }
    this.timeEl.innerHTML = `${formatTicks(timeline.currentTick)} <span>/ ${formatTicks(max)}</span>`;
    this.stage.setAttribute('aria-valuemax', String(max));
    this.stage.setAttribute('aria-valuenow', String(preview ?? timeline.currentTick));
    this.stage.setAttribute('aria-valuetext', `${preview !== null && preview !== undefined ? 'Preview' : 'Live'} ${formatTicks(preview ?? timeline.currentTick)}`);

    // transport state
    const used = echoCount;
    const full = used >= timeline.maxEchoes;
    this.btn.rec.disabled = full || timeline.status === 'complete';
    this.btn.rec.title = full ? 'Echo limit reached — delete a loop first' : `End this loop and create an echo (${this.key('rewind')})`;
    this.btn.del.disabled = used === 0;
    const plyIc = this.btn.ply.querySelector('.ic') as HTMLElement;
    const wantPlay = opts.paused ? 'play' : 'pause';
    if (plyIc.dataset['i'] !== wantPlay) {
      plyIc.dataset['i'] = wantPlay;
      plyIc.innerHTML = icon(wantPlay);
      this.btn.ply.setAttribute('aria-pressed', String(opts.paused));
    }
    const selTx = this.btn.sel.querySelector('.tx') as HTMLElement;
    const selText = this.selected === null ? 'Echo select' : `Echo ${this.selected + 1}`;
    if (selTx.textContent !== selText) selTx.textContent = selText;
    this.btn.sel.disabled = used === 0;
    const delTx = this.btn.del.querySelector('.tx') as HTMLElement;
    const delText = this.selected === null ? 'Delete loop' : `Delete echo ${this.selected + 1}`;
    if (delTx.textContent !== delText) delTx.textContent = delText;
    if (this.binds || this.glyphCtx) this.setExpandKey();
  }

  /** Last-used device glyphs: updates the header key cap, tooltips and the gamepad legend. */
  set glyphs(g: GlyphContext | null) {
    this.glyphCtx = g;
    this.setExpandKey();
    if (g && g.device.kind === 'gamepad') {
      const st = g.device.style;
      const item = (caps: string, text: string): string => `<span>${caps}<span>${esc(text)}</span></span>`;
      this.padLegend.innerHTML = [
        item(padCapHTML(14, st) + padCapHTML(15, st), 'Scrub (hold to speed up)'),
        item(padCapHTML(12, st) + padCapHTML(13, st), 'Select track'),
        item(padCapHTML(0, st), 'Hide / show echo · play / pause'),
        item(padCapHTML(2, st), 'Delete echo'),
        item(padCapHTML(5, st), 'Zoom'),
        item(padCapHTML(1, st), 'Live / close'),
      ].join('');
    }
  }

  get glyphs(): GlyphContext | null {
    return this.glyphCtx;
  }

  /**
   * Gamepad control of the expanded timeline (routed by createUI while no menu is open): left/right scrub
   * (accelerating while held), up/down select a track (player, echo 1, echo 2 …), A toggles the selected echo's visibility
   * (or play/pause on the player track), X deletes the selected echo, RB cycles the zoom, B returns to live and
   * then collapses the timeline. Returns true when consumed.
   */
  padInput(e: PadEvent): boolean {
    if (!this.expanded || !this.timeline) return false;
    const tl = this.timeline;
    if (e.type === 'nav') {
      if (e.dir === 'left' || e.dir === 'right') {
        const step = e.heldMs > 2200 ? 90 : e.heldMs > 900 ? 30 : 15;
        const cur = this.scrubTick ?? this.externalPreview ?? tl.currentTick;
        this.scrubTo(Math.max(0, Math.min(tl.maxTicks, cur + (e.dir === 'right' ? step : -step))));
        return true;
      }
      const n = this.echoCount();
      if (n === 0) return true;
      const cur = this.selected;
      // Lanes run player (top), echo 1, echo 2, … — null selection = the player track.
      const next = e.dir === 'down' ? (cur === null ? 0 : Math.min(n - 1, cur + 1)) : cur === null || cur === 0 ? null : cur - 1;
      if (next !== cur) {
        this.selected = next;
        this.cb.onSelectEcho?.(next);
        this.cb.onUISound?.('hover');
        this.sig = '';
        this.update(tl, { paused: this.paused, previewTick: this.externalPreview });
      }
      return true;
    }
    if (e.type !== 'button') return false;
    switch (e.button) {
      case 'a': {
        const idx = this.selected;
        const track = idx === null ? null : this.tracks.find((t) => t.kind === 'echo' && t.echoIndex === idx && !t.recursion);
        if (track && track.loopId !== null) {
          const visible = this.hidden.has(track.loopId);
          this.setEchoVisible(track.loopId, visible);
          this.cb.onToggleEchoVisibility?.(track.echoIndex, visible, track.loopId);
          this.cb.onUISound?.('toggle');
          this.update(tl, { paused: this.paused, previewTick: this.externalPreview });
        } else this.cb.onTogglePause?.();
        return true;
      }
      case 'x':
        if (this.selected !== null) {
          const idx = this.selected;
          this.selected = null;
          this.cb.onDeleteLoop?.(idx);
        } else this.cb.onUISound?.('error');
        return true;
      case 'rb':
        this.cycleZoom();
        return true;
      case 'b':
        if (this.scrubbing) this.endScrub();
        else this.setExpanded(false);
        return true;
      default:
        return false;
    }
  }

  flash(): void {
    this.el.classList.remove('flash');
    void this.el.offsetWidth;
    this.el.classList.add('flash');
  }

  // ------------------------------------------------------------------ internals

  private key(a: 'rewind' | 'timeline'): string {
    if (this.glyphCtx && this.glyphCtx.device.kind === 'gamepad') return capText(this.glyphCtx, a);
    return this.binds ? primaryLabel(this.binds, a) : a === 'rewind' ? 'R' : 'Tab';
  }

  private setExpandKey(): void {
    const g = this.glyphCtx;
    if (g && g.device.kind === 'gamepad') {
      const cap = h('span', { html: capHTML(g, 'timeline') }).firstElementChild as HTMLElement | null;
      this.expandKey.className = `${cap?.className ?? 'rx-key'} cyan`;
      this.expandKey.textContent = cap?.textContent ?? '';
    } else {
      this.expandKey.className = 'rx-key cyan';
      this.expandKey.textContent = this.key('timeline');
    }
  }

  private scrubTo(tick: number): void {
    this.scrubbing = true;
    this.scrubTick = tick;
    this.cb.onScrub?.(tick);
    if (this.timeline) this.update(this.timeline, { paused: this.paused, previewTick: this.externalPreview });
  }

  private endScrub(): void {
    if (!this.scrubbing) return;
    this.scrubbing = false;
    this.scrubTick = null;
    this.cb.onScrubEnd?.();
    if (this.timeline) this.update(this.timeline, { paused: this.paused, previewTick: null });
  }

  private echoCount(): number {
    return this.timeline ? this.timeline.tracks.filter((t) => t.kind === 'echo' && t.recursion === undefined).length : 0;
  }

  private deleteSelected(): void {
    const n = this.echoCount();
    if (n === 0) return;
    const idx = this.selected ?? n - 1;
    this.selected = null;
    this.cb.onDeleteLoop?.(idx);
  }

  private cycleZoom(): void {
    this.zoom = nextZoom(this.zoom);
    this.updateZoomLabel();
    this.cb.onUISound?.('toggle');
    if (this.timeline) this.update(this.timeline, { paused: this.paused, previewTick: this.externalPreview });
  }

  private updateZoomLabel(): void {
    this.zoomEl.textContent = `Zoom ×${this.zoom}`;
    const tx = this.btn?.zm.querySelector('.tx');
    if (tx) tx.textContent = this.zoom === 1 ? 'Timeline zoom' : `Zoom ×${this.zoom}`;
  }

  private cycleSelect(): void {
    const next = cycleEchoSelection(this.selected, this.echoCount());
    this.selected = next;
    this.cb.onSelectEcho?.(next);
    this.sig = '';
    if (this.timeline) this.update(this.timeline, { paused: this.paused, previewTick: this.externalPreview });
  }

  private rebuildRuler(width: number): void {
    const ticks = rulerTicks({ ...this.vp, start: 0 }, width, this.expanded ? 14 : 18, 5);
    const max = this.vp.maxTicks;
    this.ruler.innerHTML = ticks
      .map(
        (t) =>
          `<i class="t${t.major ? ' major' : ''}" style="left:${(contentFrac(t.tick, max) * 100).toFixed(3)}%">${t.label && t.tick < max ? `<span>${t.label}</span>` : ''}</i>`,
      )
      .join('');
  }

  private rebuildLanes(): void {
    const max = this.timeline?.maxTicks ?? 1;
    this.playedEls.clear();
    this.playerSpan = null;
    const labels: HTMLElement[] = [h('div', { class: 'ruler-spacer' })];
    const lanes: HTMLElement[] = [];
    for (const t of this.tracks) {
      const cls = `${t.visible ? '' : ' hidden-track'}${t.selected ? ' selected' : ''}`;
      labels.push(this.renderLabel(t, cls));
      const lane = h('div', { class: `rx-tl-lane${cls}`, style: `--c:${t.style.color};--soft:${t.style.soft}`, 'data-track': t.key });
      const spanW = contentFrac(t.durationTicks, max);
      const spanL = contentFrac(t.startTick, max);
      const span = h('div', { class: `rx-tl-span${t.recursion ? ' copy' : ''}`, style: `left:${(spanL * 100).toFixed(3)}%;width:${(spanW * 100).toFixed(3)}%` });
      const played = h('div', { class: 'played' });
      span.append(played);
      if (t.kind === 'echo') span.append(h('i', { class: 'end' }));
      this.playedEls.set(t.key, played);
      if (t.kind === 'player') this.playerSpan = span;
      lane.append(span);
      if (t.divergedAt !== null) {
        const from = contentFrac(t.divergedAt, max);
        const to = contentFrac(Math.max(t.durationTicks, t.divergedAt), max);
        lane.append(h('div', { class: 'rx-tl-div-zone', style: `left:${(from * 100).toFixed(3)}%;width:${Math.max(0.2, (to - from) * 100).toFixed(3)}%` }));
      }
      for (const m of t.markers) {
        lane.append(
          h('span', {
            class: `rx-mk ${m.state}`,
            style: `left:${(contentFrac(m.tick, max) * 100).toFixed(3)}%`,
            role: 'img',
            'aria-label': m.title,
            title: m.title,
            html: markerIcon(m.state === 'failed' ? 'fail' : m.kind),
          }),
        );
      }
      for (const d of t.divergences) {
        lane.append(h('span', { class: 'rx-dv', style: `left:${(contentFrac(d.tick, max) * 100).toFixed(3)}%`, role: 'img', 'aria-label': d.title, title: d.title, html: DIVERGENCE_ICON }));
      }
      lanes.push(lane);
    }
    this.labels.replaceChildren(...labels);
    this.lanes.replaceChildren(...lanes);
  }

  private renderLabel(t: TrackModel, cls: string): HTMLElement {
    const isEcho = t.kind === 'echo';
    const status = !isEcho
      ? 'Current'
      : t.divergedAt !== null
        ? 'Paradox'
        : t.finishedAtTick !== null
          ? 'Idle'
          : 'Replay';
    // Nested-loop copies replay the same recording later: "Echo 1 ↻2" (second body of echo 1).
    const name = isEcho ? `Echo ${t.echoIndex + 1}${t.recursion ? ` \u21bb${t.recursion + 1}` : ''}` : 'Player';
    const label = h(
      'div',
      { class: `rx-tl-label${cls}`, style: `--c:${t.style.color}` },
      h('span', { html: shapeBadge(t.style.shape, t.style.badge, t.style.color, 20) }),
      h('span', {
        class: 'name',
        style: `color:${t.style.color}`,
        html: `${esc(name)}<small style="${status === 'Paradox' ? 'color:var(--rx-coral)' : ''}">${status === 'Paradox' ? '! ' : ''}${status}</small>`,
      }),
    );
    if (isEcho && this.expanded && !t.recursion) {
      const idx = t.echoIndex;
      const loopId = t.loopId;
      const eye = h('button', {
        class: 'rx-iconbtn',
        type: 'button',
        'aria-pressed': String(!t.visible),
        'aria-label': `${t.visible ? 'Hide' : 'Show'} ${name}`,
        title: `${t.visible ? 'Hide' : 'Show'} ${name}`,
        html: icon(t.visible ? 'eye' : 'eyeOff'),
        onclick: () => {
          if (loopId === null) return;
          const visible = this.hidden.has(loopId);
          this.setEchoVisible(loopId, visible);
          this.cb.onToggleEchoVisibility?.(idx, visible, loopId);
          this.cb.onUISound?.('toggle');
          if (this.timeline) this.update(this.timeline, { paused: this.paused, previewTick: this.externalPreview });
        },
      });
      const del = h('button', {
        class: 'rx-iconbtn danger',
        type: 'button',
        'aria-label': `Delete ${name} loop`,
        title: `Delete ${name} loop`,
        html: icon('trash'),
        onclick: () => {
          if (this.selected === idx) this.selected = null;
          this.cb.onDeleteLoop?.(idx);
        },
      });
      const sel = h('button', {
        class: 'rx-iconbtn',
        type: 'button',
        'aria-pressed': String(t.selected),
        'aria-label': `Select ${name}`,
        title: `Select ${name}`,
        html: icon('target'),
        onclick: () => this.selectEcho(idx),
      });
      label.append(h('span', { class: 'acts' }, sel, eye, del));
    }
    return label;
  }

  private bindScrub(): void {
    const tickAt = (clientX: number): number => {
      const r = this.stage.getBoundingClientRect();
      const w = r.width || 1;
      return tickAtViewFrac((clientX - r.left) / w, this.vp);
    };
    const begin = (tick: number): void => this.scrubTo(tick);
    const end = (): void => this.endScrub();
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (this.touchMode && !this.expanded) return; // the collapsed strip only opens the sheet on touch
      // markers keep their tooltips but scrubbing works anywhere on the stage
      try {
        this.stage.setPointerCapture(e.pointerId);
      } catch {
        /* happy-dom / old browsers */
      }
      e.preventDefault();
      this.stage.focus({ preventScroll: true });
      begin(tickAt(e.clientX));
    });
    this.stage.addEventListener('pointermove', (e) => {
      const r = this.stage.getBoundingClientRect();
      if (this.scrubbing) {
        const t = tickAt(e.clientX);
        if (t !== this.scrubTick) begin(t);
      } else {
        this.hoverLine.hidden = false;
        this.hoverLine.style.left = `${e.clientX - r.left}px`;
      }
    });
    this.stage.addEventListener('pointerleave', () => {
      this.hoverLine.hidden = true;
    });
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
    this.stage.addEventListener('blur', end);
    this.stage.addEventListener('keydown', (e) => {
      const tl = this.timeline;
      if (!tl) return;
      const cur = this.scrubTick ?? tl.currentTick;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowLeft':
          next = cur - scrubStep(e.shiftKey);
          break;
        case 'ArrowRight':
          next = cur + scrubStep(e.shiftKey);
          break;
        case 'PageDown':
          next = cur - scrubStep(false) * 5;
          break;
        case 'PageUp':
          next = cur + scrubStep(false) * 5;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tl.maxTicks;
          break;
        case 'Enter':
        case 'Escape':
          if (this.scrubbing) {
            e.preventDefault();
            e.stopPropagation();
            end();
          }
          return;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      begin(Math.max(0, Math.min(tl.maxTicks, next)));
    });
  }
}

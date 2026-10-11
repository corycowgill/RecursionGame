import type { LevelDefinition, SimEvent } from '../engine/contracts';
import { defaultPadBindings, type PadBindings } from '../engine/input/gamepadBindings';
import type { PadEvent } from '../engine/input/GamepadInput';
import { defaultKeybinds, type KeyBindings } from '../persistence/keybinds';
import { defaultSettings, type QualityPreset, type Settings } from '../persistence/settings';
import { focusFirst, h } from './dom';
import { KEYBOARD, TOUCH, sameDevice, type GlyphContext, type InputDevice } from './glyphs';
import { activate, injectPadStyles, navigate } from './padNav';
import { HintScheduler } from './hud/hints';
import { Hud } from './hud/Hud';
import { ONBOARDING, OnboardingTracker } from './hud/onboarding';
import { Toasts, type ToastKind } from './hud/Toasts';
import { buildLevelEntries, createLevelSelect } from './menus/LevelSelect';
import { createMainMenu, type Screen } from './menus/MainMenu';
import { createCredits, createLevelComplete, createLevelIntro, createPause } from './menus/Overlays';
import { createSettings } from './menus/Settings';
import { injectStyles } from './styles';
import { TimelinePanel } from './timeline/TimelinePanel';
import { dismissHomeScreenHint, homeScreenHintDismissed, shouldSuggestHomeScreen, type TouchEnv } from './touch/env';
import { homeScreenHint, TouchControls, type TouchSink } from './touch/TouchControls';
import { injectTouchStyles } from './touch/touchStyles';
import type { TouchVisibility } from './touch/visibility';
import type { LevelCompleteStats, LevelEntry, MainMenuData, PauseData, UICallbacks, UIFrame } from './types';

export type ScreenName = 'menu' | 'levels' | 'settings' | 'credits' | 'pause' | 'intro' | 'complete';

export interface CreateUIOptions {
  settings?: Settings;
  keybinds?: KeyBindings;
  /** Tutorial ids already completed (skips onboarding). */
  seenTutorials?: readonly string[];
  /** Quality preset forced by the `?quality=` URL option (shown, and locked, in Settings). */
  qualityOverride?: QualityPreset | null;
  /** Gamepad bindings (round 3). */
  padbinds?: PadBindings;
  /** Connected controller count, for the Settings → Controls status line. */
  padsConnected?: () => number;
  /** Touch environment override (tests); defaults to the live device. */
  touchEnv?: TouchEnv;
}

/** On-screen touch controls (round 3, mobile): the app connects them to the input sampler / command handler. */
export interface TouchUI {
  readonly touchCapable: boolean;
  readonly visibility: TouchVisibility;
  readonly isPortrait: boolean;
  setSink(sink: TouchSink | null): void;
  /** Puzzle overview camera (two-finger tap) currently on. */
  readonly overviewActive: boolean;
  /** Toggles the puzzle overview (same as a two-finger tap). */
  toggleOverview(): void;
}

export interface ShowHUDOptions {
  /** Show onboarding prompts for this level if available (default: settings.tutorials && not seen). */
  tutorial?: boolean;
}

export interface UIHandle {
  readonly root: HTMLElement;
  /** Current top-most screen, or null while only the HUD is visible. */
  readonly screen: ScreenName | null;
  readonly timelineExpanded: boolean;
  readonly settings: Settings;
  readonly keybinds: KeyBindings;
  /** Selected echo index (1–5 keys / ECHO SELECT) or null. */
  readonly selectedEcho: number | null;
  showMainMenu(data: MainMenuData): void;
  showLevelSelect(entries?: LevelEntry[]): void;
  showSettings(): void;
  showCredits(): void;
  showHUD(level: LevelDefinition, opts?: ShowHUDOptions): void;
  hideHUD(): void;
  /** Per-frame HUD + timeline refresh (read-only data). */
  update(frame: UIFrame): void;
  /** Feed drained SimEvents (toasts, timeline flashes, hint attempts, onboarding). */
  onEvents(events: readonly SimEvent[]): void;
  showPause(data: PauseData): void;
  hidePause(): void;
  showLevelIntro(level: LevelDefinition): void;
  hideLevelIntro(): void;
  showLevelComplete(stats: LevelCompleteStats): void;
  hideScreens(): void;
  showHint(text: string, index?: number, total?: number): void;
  toast(text: string, kind?: ToastKind, ms?: number): void;
  toggleTimeline(): void;
  setTimelineExpanded(expanded: boolean): void;
  selectEcho(index: number | null): void;
  setSettings(s: Settings): void;
  setKeybinds(b: KeyBindings): void;
  /** Gamepad bindings currently shown/used by the prompts. */
  readonly padBindings: PadBindings;
  /** Last-used input device: switches every button prompt (HUD, tutorial, interaction, timeline) and the focus ring. */
  readonly inputDevice: InputDevice;
  setInputDevice(d: InputDevice): void;
  setPadBindings(b: PadBindings): void;
  /**
   * Gamepad input while a menu / the expanded timeline is active (navigation, confirm, back, remap capture). Returns
   * true when consumed.
   */
  padInput(e: PadEvent): boolean;
  /** Hold-to-restart fill (0..1, 0 hides the indicator). */
  setRestartHold(progress: number): void;
  /** On-screen touch controls + rotate overlay (phones / tablets). */
  readonly touch: TouchUI;
  /** Fade to black, run `between` (e.g. load a level), fade back in. */
  transition(between: () => void | Promise<void>): Promise<void>;
  /**
   * Esc handling: closes the top sub-screen (settings/levels/credits → previous), or resumes from pause. Returns
   * true if the UI consumed it; otherwise the director may open the pause menu.
   */
  back(): boolean;
  /** True while a screen that should block gameplay input is open. */
  isBlocking(): boolean;
  dispose(): void;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Creates the RECURSION DOM overlay inside `root` (#ui). Framework-free; consumes read-only game data through
 * update()/onEvents() and reports player intent through `callbacks` — it never mutates the simulation.
 */
export function createUI(root: HTMLElement, callbacks: UICallbacks = {}, opts: CreateUIOptions = {}): UIHandle {
  injectStyles(root.ownerDocument);
  injectPadStyles(root.ownerDocument);
  injectTouchStyles(root.ownerDocument);
  const cb = callbacks;
  let settings: Settings = { ...(opts.settings ?? defaultSettings()) };
  let keybinds: KeyBindings = opts.keybinds ?? defaultKeybinds();
  const seen = new Set(opts.seenTutorials ?? []);
  let padbinds: PadBindings = opts.padbinds ?? defaultPadBindings();
  let device: InputDevice = KEYBOARD;
  let lastPadStyle: 'xbox' | 'playstation' | 'nintendo' | null = null;

  const sound = (c: 'hover' | 'confirm' | 'back' | 'toggle' | 'error'): void => cb.onUISound?.(c);

  const hudLayer = h('div', { class: 'rx-hud-layer', hidden: true });
  const screenLayer = h('div', { class: 'rx-screens' });
  const toasts = new Toasts();
  const fade = h('div', { class: 'rx-fade', 'aria-hidden': 'true' });
  const live = h('div', { class: 'rx-sr', role: 'status', 'aria-live': 'polite' });
  const el = h('div', { class: 'rx-root', 'data-testid': 'ui-root' }, hudLayer, screenLayer, toasts.el, fade, live);
  el.style.pointerEvents = 'none'; // inline: beats `#ui > * { pointer-events:auto }` so the canvas stays clickable
  root.append(el);

  const timeline = new TimelinePanel({
    ...cb,
    onScrub: (t) => {
      tracker?.signal({ type: 'scrubbed' });
      cb.onScrub?.(t);
    },
    onTimelineToggle: (x) => {
      if (x) tracker?.signal({ type: 'timelineExpanded' });
      cb.onTimelineToggle?.(x);
      refreshTouch();
    },
  });
  const hud = new Hud(() => finishTutorial(true));
  // Hold-to-restart indicator (gamepad: hold X / Square).
  const holdCap = h('span', { class: 'cap' });
  const hold = h('div', { class: 'rx-hold', 'aria-hidden': 'true', 'data-testid': 'restart-hold' }, h('div', { class: 'ring' }), holdCap, h('div', { class: 'lbl' }, 'Restarting chamber'));
  hudLayer.append(hud.el, timeline.el, hold);

  // On-screen touch controls sit under the HUD layer (so the timeline strip and hint card stay tappable) and the
  // rotate overlay above everything.
  const touch = new TouchControls(
    {
      device: () => device.kind,
      hud: () => !hudLayer.hidden,
      screen: () => sub?.name ?? base?.name ?? null,
      timelineExpanded: () => timeline.expanded,
    },
    () => ui.setInputDevice(TOUCH),
    opts.touchEnv,
  );
  el.insertBefore(touch.el, hudLayer);
  el.append(touch.rotateEl);
  if (touch.touchFirst) device = TOUCH;
  el.classList.toggle('rx-touchdev', touch.touchCapable);
  let touchSig = '';
  /** Re-evaluates the touch layer and its root classes (cheap; on every UI state change and HUD frame). */
  function refreshTouch(): void {
    touch.refresh();
    const v = touch.visibility;
    const sig = `${v.touchMode}${v.controls}${v.pause}`;
    if (sig === touchSig) return;
    touchSig = sig;
    el.classList.toggle('rx-touch-on', v.touchMode);
    el.classList.toggle('rx-tplay', v.controls);
    el.classList.toggle('rx-thaspause', v.pause);
    timeline.touchMode = v.touchMode;
  }

  let level: LevelDefinition | null = null;
  let hints: HintScheduler | null = null;
  let tracker: OnboardingTracker | null = null;
  let trackerShownIndex = -1;
  let lastFrame: UIFrame | null = null;
  let menuData: MainMenuData | null = null;

  // ---- screen stack: base (menu / pause / intro / complete) + optional sub-screen (levels / settings / credits)
  let base: { name: ScreenName; screen: Screen } | null = null;
  let sub: { name: ScreenName; screen: Screen; returnFocus: Element | null } | null = null;
  let pauseData: PauseData | null = null;

  function mount(screen: Screen): void {
    screenLayer.append(screen.el);
    focusFirst(screen.el);
    refreshTouch();
  }
  function closeSub(): void {
    if (!sub) return;
    sub.screen.dispose();
    sub.screen.el.remove();
    const rf = sub.returnFocus as HTMLElement | null;
    sub = null;
    if (base) base.screen.el.hidden = false;
    if (rf && rf.isConnected) rf.focus({ preventScroll: true });
    else if (base) focusFirst(base.screen.el);
    refreshTouch();
  }
  function setBase(name: ScreenName, screen: Screen): void {
    closeSub();
    if (name !== 'intro') hudLayer.classList.remove('rx-under-intro');
    if (base) {
      base.screen.dispose();
      base.screen.el.remove();
    }
    base = { name, screen };
    mount(screen);
  }
  function openSub(name: ScreenName, screen: Screen): void {
    const returnFocus = root.ownerDocument.activeElement;
    closeSub();
    if (base) base.screen.el.hidden = true;
    sub = { name, screen, returnFocus };
    mount(screen);
  }
  function clearScreens(): void {
    closeSub();
    hudLayer.classList.remove('rx-under-intro');
    if (base) {
      base.screen.dispose();
      base.screen.el.remove();
      base = null;
    }
    refreshTouch();
  }

  function applySettings(): void {
    el.style.setProperty('--rx-scale', String(settings.uiScale));
    el.classList.toggle('rx-reduced', settings.reducedMotion);
    el.classList.toggle('rx-hc', settings.echoPalette === 'highContrast');
    timeline.palette = settings.echoPalette;
    timeline.binds = keybinds;
    applyGlyphs();
  }

  /** Pushes the last-used device + bindings to every prompt renderer. */
  function applyGlyphs(): void {
    const g: GlyphContext = { device, keybinds, padbinds };
    hud.glyphs = g;
    timeline.glyphs = g;
    el.classList.toggle('rx-pad', device.kind === 'gamepad');
    el.dataset['input'] = device.kind === 'gamepad' ? device.style : device.kind;
    refreshTouch();
  }
  applySettings();

  function finishTutorial(skipped: boolean): void {
    if (!tracker || !level) return;
    const id = ONBOARDING[level.order]?.id;
    if (skipped) tracker.skip();
    hud.showOnboarding(null);
    if (id) {
      seen.add(id);
      cb.onTutorialComplete?.(id);
    }
    tracker = null;
  }

  function refreshOnboarding(): void {
    if (!tracker) return;
    if (tracker.finished) {
      finishTutorial(false);
      return;
    }
    if (tracker.stepIndex !== trackerShownIndex) {
      trackerShownIndex = tracker.stepIndex;
      hud.showOnboarding(tracker.current, tracker.stepIndex, tracker.steps.length, keybinds);
    }
  }

  function settingsScreen(): Screen {
    return createSettings(settings, keybinds, {
      onChange: (s) => {
        settings = s;
        applySettings();
        cb.onSettingsChange?.(s);
      },
      onKeybinds: (b) => {
        keybinds = b;
        applySettings();
        if (tracker) trackerShownIndex = -1;
        cb.onKeybindsChange?.(b);
      },
      onBack: () => closeSub(),
      ...(cb.onResetProgress ? { onResetProgress: () => cb.onResetProgress?.() } : {}),
      sound,
    }, 'graphics', {
      qualityOverride: opts.qualityOverride ?? null,
      pad: {
        bindings: padbinds,
        style: () => (device.kind === 'gamepad' ? device.style : lastPadStyle),
        connected: () => opts.padsConnected?.() ?? 0,
        onChange: (b) => {
          padbinds = b;
          applyGlyphs();
          if (tracker) trackerShownIndex = -1;
          cb.onPadBindsChange?.(b);
        },
      },
    });
  }

  function announce(text: string): void {
    live.textContent = text;
  }

  const ui: UIHandle = {
    root: el,
    get screen() {
      return sub?.name ?? base?.name ?? null;
    },
    get timelineExpanded() {
      return timeline.expanded;
    },
    get settings() {
      return settings;
    },
    get keybinds() {
      return keybinds;
    },
    get selectedEcho() {
      return timeline.selected;
    },

    showMainMenu(data) {
      menuData = data;
      hudLayer.hidden = true;
      setBase(
        'menu',
        createMainMenu(data, {
          onContinue: () => (data.continueLevel ? (cb.onContinue ? cb.onContinue() : cb.onStartLevel?.(data.continueLevel.id)) : undefined),
          onLevelSelect: () => ui.showLevelSelect(),
          onSettings: () => ui.showSettings(),
          onCredits: () => ui.showCredits(),
          sound,
        }),
      );
      if (base && shouldSuggestHomeScreen(touch.env, homeScreenHintDismissed())) base.screen.el.append(homeScreenHint(dismissHomeScreenHint));
      announce('Main menu');
    },

    showLevelSelect(entries) {
      const list = entries ?? cb.getLevelEntries?.() ?? menuData?.levels ?? [];
      openSub(
        'levels',
        createLevelSelect(list, {
          onPick: (id) => cb.onStartLevel?.(id),
          onBack: () => closeSub(),
          sound,
        }),
      );
    },

    showSettings() {
      openSub('settings', settingsScreen());
    },

    showCredits() {
      openSub('credits', createCredits({ onBack: () => closeSub(), sound }));
    },

    showHUD(lvl, o = {}) {
      level = lvl;
      clearScreens();
      hudLayer.hidden = false;
      hud.setLevel(lvl);
      toasts.clear();
      hints = settings.hints ? new HintScheduler(lvl.hints) : null;
      const tid = ONBOARDING[lvl.order]?.id;
      const wantTutorial = o.tutorial ?? (settings.tutorials && !!tid && !seen.has(tid));
      tracker = wantTutorial ? new OnboardingTracker(lvl.order, true) : null;
      trackerShownIndex = -1;
      timeline.selected = null;
      timeline.hidden.clear();
      lastFrame = null;
      refreshTouch();
      announce(`Chamber ${lvl.order}: ${lvl.name}`);
    },

    hideHUD() {
      hudLayer.hidden = true;
      hud.showOnboarding(null);
      refreshTouch();
    },

    update(frame) {
      if (hudLayer.hidden) return;
      lastFrame = frame;
      const paused = !!frame.paused;
      timeline.update(frame.timeline, { paused, previewTick: frame.previewTick ?? null });
      // Timeline inspect / temporal preview: tutorial + hint cards step aside so the whole chamber reads.
      hudLayer.classList.toggle('rx-inspecting', timeline.expanded || frame.previewTick != null);
      hud.update(frame, keybinds, settings.echoPalette, timeline.height);
      refreshTouch();
      const tp = frame.prompt;
      const promptOn = !!tp && tp.action !== 'none' && frame.state.status === 'playing' && frame.previewTick == null;
      touch.setPrompt(promptOn && tp ? tp.label : null, tp?.action === 'blocked');
      const dt = frame.dt ?? 0;
      const live = !paused && frame.state.status === 'playing' && ui.screen === null;
      if (live && hints) {
        hints.advance(dt);
        const next = hints.poll();
        if (next) {
          hud.showHint(next.hint.text, next.index, next.total);
          sound('toggle');
        }
      }
      if (tracker) {
        const player = frame.state.actors.find((a) => a.kind === 'player');
        if (player?.moving) tracker.signal({ type: 'moved' });
        if (live) tracker.advance(dt);
        refreshOnboarding();
      }
    },

    onEvents(events) {
      for (let i = 0; i < events.length; i++) {
        const e = events[i] as SimEvent;
        tracker?.signal({ type: 'event', event: e });
        switch (e.type) {
          case 'echoSpawned':
            toasts.show(`Echo ${e.echoIndex + 1} recorded`, 'info');
            timeline.flash();
            announce(`Echo ${e.echoIndex + 1} recorded. Time rewound.`);
            break;
          case 'rewind':
            hints?.noteAttempt();
            if (events[i + 1]?.type !== 'echoSpawned') toasts.show('Take discarded · rewound', 'info', 2000, 'rewind');
            break;
          case 'echoLimitReached':
            toasts.show(`Echo limit reached (${e.maxEchoes})`, 'warn', 3200);
            announce('Echo limit reached. Delete a loop or restart the chamber.');
            break;
          case 'divergence':
            toasts.show(`Paradox · Echo ${e.echoIndex + 1} diverged`, 'warn', 3400);
            announce(`Paradox: echo ${e.echoIndex + 1} could not repeat its action.`);
            break;
          case 'loopTimeUp':
            toasts.show('Loop time exhausted', 'gold', 2600, 'clock');
            break;
          case 'chamberRestart':
            hints?.noteAttempt();
            toasts.show('Chamber restarted', 'info', 2000, 'restart');
            break;
          case 'loopDeleted':
            hints?.noteAttempt();
            toasts.show(`Echo ${e.echoIndex + 1} deleted`, 'info', 2000, 'trash');
            break;
          case 'portalActivated':
            if (level && e.entityId === level.exitId) toasts.show('Exit portal online', 'success', 2400);
            break;
          default:
            break;
        }
      }
      refreshOnboarding();
    },

    showPause(data) {
      pauseData = data;
      setBase(
        'pause',
        createPause(data, { revealed: hints?.revealedHints ?? [], total: level?.hints.length ?? 0 }, {
          onResume: () => cb.onResume?.(),
          onRestart: () => cb.onRestart?.(),
          onSettings: () => ui.showSettings(),
          onLevelSelect: () => ui.showLevelSelect(),
          onQuit: () => cb.onQuitToMenu?.(),
          onRevealHint: () => {
            if (!hints && level) hints = new HintScheduler(level.hints);
            const n = hints?.revealNext();
            if (n) hud.showHint(n.hint.text, n.index, n.total);
            if (pauseData) ui.showPause(pauseData); // re-render list
          },
          sound,
        }),
      );
      announce('Paused');
    },

    hidePause() {
      if (base?.name === 'pause') clearScreens();
    },

    showLevelIntro(lvl) {
      hudLayer.classList.add('rx-under-intro');
      setBase('intro', createLevelIntro(lvl, { onBegin: () => cb.onIntroDone?.(), sound }));
      announce(`Chamber ${lvl.order}: ${lvl.name}. ${lvl.subtitle ?? ''}`);
    },

    hideLevelIntro() {
      if (base?.name === 'intro') clearScreens();
    },

    showLevelComplete(stats) {
      hud.showOnboarding(null);
      if (tracker) finishTutorial(false);
      setBase(
        'complete',
        createLevelComplete(stats, {
          onNext: () => cb.onNextLevel?.(),
          onReplay: () => cb.onReplayLevel?.(),
          onLevelSelect: () => ui.showLevelSelect(),
          sound,
        }),
      );
      announce(`Chamber complete. ${stats.result.stars} of 3 stars.`);
    },

    hideScreens() {
      clearScreens();
    },

    showHint(text, index = 0, total = 1) {
      hud.showHint(text, index, total);
    },

    toast(text, kind = 'info', ms) {
      toasts.show(text, kind, ms);
    },

    toggleTimeline() {
      timeline.toggle();
    },

    setTimelineExpanded(x) {
      timeline.setExpanded(x);
    },

    selectEcho(index) {
      timeline.selectEcho(index);
      if (lastFrame) ui.update({ ...lastFrame, dt: 0 });
    },

    setSettings(s) {
      settings = { ...s };
      applySettings();
    },

    setKeybinds(b) {
      keybinds = b;
      applySettings();
      trackerShownIndex = -1;
    },

    touch,

    get padBindings() {
      return padbinds;
    },

    get inputDevice() {
      return device;
    },

    setInputDevice(d) {
      if (sameDevice(d, device)) return;
      device = d;
      if (d.kind === 'gamepad') lastPadStyle = d.style;
      applyGlyphs();
      trackerShownIndex = -1; // redraw the tutorial card with the new glyphs
      refreshOnboarding();
      if (lastFrame) hud.update(lastFrame, keybinds, settings.echoPalette, timeline.height);
    },

    setPadBindings(b) {
      padbinds = b;
      applyGlyphs();
      trackerShownIndex = -1;
    },

    padInput(e) {
      const top = sub?.screen ?? base?.screen ?? null;
      if (top) {
        const remap = top as Partial<{ padButton(i: number): boolean; padCapturing: boolean }>;
        if (e.type === 'button' && remap.padButton?.(e.index)) return true;
        if (remap.padCapturing) return true;
        if (e.type === 'nav') {
          if (navigate(top.el, e.dir)) sound('hover');
          return true;
        }
        if (e.type === 'button' && e.button === 'a') return activate(top.el);
        if (e.type === 'button' && e.button === 'b') return ui.back();
        return false;
      }
      if (timeline.expanded) return timeline.padInput(e);
      return false;
    },

    setRestartHold(p) {
      const on = p > 0.02;
      hold.classList.toggle('on', on);
      hold.style.setProperty('--p', String(Math.min(1, Math.max(0, p))));
      if (on) {
        const html = device.kind === 'gamepad' ? hud.restartCap() : '';
        if (holdCap.innerHTML !== html) holdCap.innerHTML = html;
      }
    },

    async transition(between) {
      const ms = settings.reducedMotion ? 60 : 430;
      fade.classList.add('on');
      await wait(ms);
      try {
        await between();
      } finally {
        fade.classList.remove('on');
      }
      await wait(ms);
    },

    back() {
      if (sub) {
        sound('back');
        closeSub();
        return true;
      }
      if (base?.name === 'pause') {
        cb.onResume?.();
        return true;
      }
      return false;
    },

    isBlocking() {
      return ui.screen !== null;
    },

    dispose() {
      clearScreens();
      toasts.clear();
      touch.dispose();
      el.remove();
    },
  };
  return ui;
}

export { buildLevelEntries };

import type { LevelDefinition, SimEvent } from '../engine/contracts';
import { defaultKeybinds, type KeyBindings } from '../persistence/keybinds';
import { defaultSettings, type QualityPreset, type Settings } from '../persistence/settings';
import { focusFirst, h } from './dom';
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
import type { LevelCompleteStats, LevelEntry, MainMenuData, PauseData, UICallbacks, UIFrame } from './types';

export type ScreenName = 'menu' | 'levels' | 'settings' | 'credits' | 'pause' | 'intro' | 'complete';

export interface CreateUIOptions {
  settings?: Settings;
  keybinds?: KeyBindings;
  /** Tutorial ids already completed (skips onboarding). */
  seenTutorials?: readonly string[];
  /** Quality preset forced by the `?quality=` URL option (shown, and locked, in Settings). */
  qualityOverride?: QualityPreset | null;
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
  const cb = callbacks;
  let settings: Settings = { ...(opts.settings ?? defaultSettings()) };
  let keybinds: KeyBindings = opts.keybinds ?? defaultKeybinds();
  const seen = new Set(opts.seenTutorials ?? []);

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
    },
  });
  const hud = new Hud(() => finishTutorial(true));
  hudLayer.append(hud.el, timeline.el);

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
  }

  function applySettings(): void {
    el.style.setProperty('--rx-scale', String(settings.uiScale));
    el.classList.toggle('rx-reduced', settings.reducedMotion);
    el.classList.toggle('rx-hc', settings.echoPalette === 'highContrast');
    timeline.palette = settings.echoPalette;
    timeline.binds = keybinds;
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
    }, 'graphics', { qualityOverride: opts.qualityOverride ?? null });
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
      announce(`Chamber ${lvl.order}: ${lvl.name}`);
    },

    hideHUD() {
      hudLayer.hidden = true;
      hud.showOnboarding(null);
    },

    update(frame) {
      if (hudLayer.hidden) return;
      lastFrame = frame;
      const paused = !!frame.paused;
      timeline.update(frame.timeline, { paused, previewTick: frame.previewTick ?? null });
      // Timeline inspect / temporal preview: tutorial + hint cards step aside so the whole chamber reads.
      hudLayer.classList.toggle('rx-inspecting', timeline.expanded || frame.previewTick != null);
      hud.update(frame, keybinds, settings.echoPalette, timeline.height);
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
      el.remove();
    },
  };
  return ui;
}

export { buildLevelEntries };

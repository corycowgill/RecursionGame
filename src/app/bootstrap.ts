import { createAudioSystem, type AudioSystem } from '../engine/audio';
import { IDLE_INPUT, type GameCommand, type LevelDefinition, type PlayerInput, type SimEvent, type SimView } from '../engine/contracts';
import { KeyboardInput } from '../engine/input/KeyboardInput';
import { createGameRenderer, type GameRenderer } from '../engine/rendering';
import { FixedStepper } from '../engine/simulation/stepper';
import { TemporalGame } from '../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../gameplay/entities';
import { predictInteraction } from '../gameplay/interactions/targeting';
import { completionFromEvents, type CompletionResult } from '../gameplay/puzzles/completion';
import { getObjectiveStatus } from '../gameplay/puzzles/objectives';
import { CAMPAIGN, LEVELS, TEST_LEVELS } from '../levels';
import { isCompleted } from '../levels/progression';
import { resolveKeyAction } from '../persistence/keybinds';
import { SaveStore } from '../persistence/save';
import type { Settings } from '../persistence/settings';
import { buildLevelEntries, createUI, type MainMenuData, type UIHandle } from '../ui';
import { installDebugHook, type DebugHook } from './debugHook';
import { rendererQuality, sampleRewind, solutionFor, withoutHiddenEchoes, type AppMode } from './flow';

export interface AppHandle {
  readonly game: TemporalGame;
  readonly mode: AppMode;
  loadLevel(level: LevelDefinition): void;
  dispose(): void;
}

const REWIND_MS = 620;
const REWIND_MS_REDUCED = 160;
/** Delay between the levelComplete event and the results card, so the completion VFX/stinger can land. */
const COMPLETE_CARD_MS = 1500;
/** Temporal preview (hold Q): fast-forward speed through the future of the current loop. */
const PREVIEW_SPEED = 2.5;

/**
 * APP BOOTSTRAP (director-owned). The single place where the pieces meet:
 *
 *   keyboard ─► InputSampler ─► FixedStepper(60 Hz) ─► TemporalGame.step()          (the only gameplay state)
 *                                                       │ drainEvents() once per frame
 *                     ┌─────────────────────────────────┼──────────────────┐
 *                 GameRenderer.render(view, prev, α)   UI.onEvents/update   Audio.handleEvents
 *
 * Flow: boot → main menu (live attract replay of a chamber's known solution) → level intro → playing ⇄ paused /
 * timeline-inspect / temporal-preview → level complete → next level. Renderer, UI and audio only ever read the
 * SimView and event stream; every player intent goes back through TemporalGame's public API.
 */
export function bootstrap(appRoot: HTMLElement, uiRoot: HTMLElement): AppHandle {
  const params = new URLSearchParams(location.search);
  const registry = createDefaultRegistry();
  const game = new TemporalGame(registry);
  const save = new SaveStore();
  const keyboard = new KeyboardInput();
  keyboard.resolver = (code, shift) => resolveKeyAction(save.data.keybinds, code, shift);

  const qualityOverride = params.get('quality');
  let renderer: GameRenderer;
  try {
    renderer = createGameRenderer(appRoot, {
      quality: rendererQuality(qualityOverride ?? save.data.settings.quality),
      introOnLevelLoad: false,
      preserveDrawingBuffer: params.has('capture'),
    });
  } catch (err) {
    showFatal(uiRoot, 'WebGL 2 is required to enter the chamber.', err);
    throw err;
  }

  const audio: AudioSystem = createAudioSystem({ volumes: volumesOf(save.data.settings) });
  const unlockAudio = (): void => void audio.unlock().catch(() => undefined);
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });

  // ------------------------------------------------------------------ app state (presentation only)
  let mode: AppMode = 'boot';
  let level: LevelDefinition = LEVELS[0] ?? (TEST_LEVELS[0] as LevelDefinition);
  let pauseOpen = false;
  /** Sim halted by the timeline (opening the inspector, scrubbing, PLAY/PAUSE). */
  let inspectHold = false;
  let previewTick: number | null = null;
  let previewHeld = false;
  let previewBase = 0;
  let previewClock = 0;
  let snapshotCache: { key: string; view: SimView } | null = null;
  let rewindFrames: SimView[] = [];
  let rewindClock = 0;
  let rewindDuration = REWIND_MS;
  /** Scripted inputs for the player (attract mode / debug solve). Null = keyboard. */
  let autopilot: readonly PlayerInput[] | null = null;
  let attractLevel: LevelDefinition | null = null;
  const hiddenEchoes = new Set<string>();
  let completeTimer = 0;
  let lastResult: CompletionResult | null = null;
  let transitioning = false;
  let attempts = 0;

  // ------------------------------------------------------------------ simulation clock
  const stepper = new FixedStepper(() => {
    const st = game.getState();
    if (st.status === 'timeUp') {
      if (mode === 'menu') return restartAttract();
      // Loop length exhausted: the take becomes an echo if allowed, otherwise the loop restarts.
      autopilot = null;
      commitOrReset(false);
      return;
    }
    if (st.status !== 'playing') return;
    const input = autopilot ? (autopilot[st.tick] ?? { ...IDLE_INPUT, tick: st.tick }) : keyboard.sample(st.tick);
    game.step(input);
  });

  /** Gameplay keys (interact / action presses, swallowing arrows & Tab) only while actually playing. */
  const syncInputGate = (): void => {
    keyboard.gameplayEnabled = mode === 'playing' && !pauseOpen && !ui.isBlocking();
  };

  const simRunning = (): boolean => {
    if (rewindFrames.length) return false;
    if (mode === 'menu') return true;
    return mode === 'playing' && !pauseOpen && !inspectHold && !previewHeld && !ui.isBlocking() && !transitioning;
  };

  // ------------------------------------------------------------------ UI
  const ui: UIHandle = createUI(
    uiRoot,
    {
      onContinue: () => continueGame(),
      onStartLevel: (id) => {
        const l = CAMPAIGN.get(id) ?? TEST_LEVELS.find((t) => t.id === id);
        if (l) startLevel(l);
      },
      onResume: () => setPaused(false),
      onRestart: () => {
        setPaused(false);
        restartChamber();
      },
      onResetLoop: () => {
        clearPreview();
        game.resetLoop();
      },
      onCommitEcho: () => commitOrReset(true),
      onTogglePause: () => {
        if (mode !== 'playing') return;
        inspectHold = !inspectHold;
        if (!inspectHold) previewTick = null;
      },
      onDeleteLoop: (i) => deleteLoop(i),
      onScrub: (t) => {
        if (mode !== 'playing') return;
        inspectHold = true;
        previewTick = t;
      },
      onScrubEnd: () => {
        previewTick = null;
      },
      onToggleEchoVisibility: (_i, visible, loopId) => {
        if (loopId === null) return;
        if (visible) hiddenEchoes.delete(`echo:${loopId}`);
        else hiddenEchoes.add(`echo:${loopId}`);
      },
      onTimelineToggle: (expanded) => {
        inspectHold = expanded;
        if (!expanded) previewTick = null;
        renderer.setCameraMode(expanded ? 'overview' : 'follow');
      },
      onSettingsChange: (s) => applySettings(save.updateSettings(s)),
      onKeybindsChange: (b) => {
        save.setKeybinds(b);
        keyboard.releaseAll();
      },
      onIntroDone: () => beginPlay(),
      onNextLevel: () => {
        const next = CAMPAIGN.next(level.id);
        if (next) startLevel(next);
        else goMenu();
      },
      onReplayLevel: () => startLevel(level),
      onQuitToMenu: () => goMenu(),
      onResetProgress: () => {
        save.reset();
        ui.showMainMenu(menuData());
      },
      onTutorialComplete: (id) => save.markTutorialSeen(id),
      onUISound: (cue) => audio.playUi(cue),
      getLevelEntries: () => buildLevelEntries(LEVELS, save.data.progress),
    },
    { settings: save.data.settings, keybinds: save.data.keybinds, seenTutorials: save.data.seenTutorials },
  );

  // ------------------------------------------------------------------ flow
  function menuData(): MainMenuData {
    const progress = save.data.progress;
    const cont = continueTarget();
    return {
      continueLevel: cont ? { id: cont.id, order: cont.order, name: cont.name } : null,
      levels: buildLevelEntries(LEVELS, progress),
      totalStars: CAMPAIGN.totalStars(progress),
      maxStars: LEVELS.length * 3,
      version: 'v0.1 · vertical slice',
      persistent: save.persistent,
    };
  }

  /** The chamber "Continue" resumes: the last played unfinished chamber, else the campaign's next one. */
  function continueTarget(): LevelDefinition | null {
    const progress = save.data.progress;
    const last = save.data.lastLevelId ? CAMPAIGN.get(save.data.lastLevelId) : null;
    if (last && CAMPAIGN.isUnlocked(progress, last.id) && !isCompleted(progress, last.id)) return last;
    return CAMPAIGN.continueLevel(progress);
  }

  function continueGame(): void {
    const target = continueTarget();
    if (target) startLevel(target, { restoreLoops: true });
  }

  /** Synchronously installs a level in the sim + renderer (no UI flow). */
  function loadLevel(l: LevelDefinition): void {
    level = l;
    autopilot = null;
    attractLevel = null;
    clearPreview();
    rewindFrames = [];
    hiddenEchoes.clear();
    lastResult = null;
    window.clearTimeout(completeTimer);
    if (ui.timelineExpanded) ui.setTimelineExpanded(false);
    inspectHold = false;
    game.loadLevel(l);
    renderer.setLevel(l, game.getState());
    stepper.reset();
    keyboard.releaseAll();
  }

  function startLevel(l: LevelDefinition, opts: { restoreLoops?: boolean } = {}): void {
    if (transitioning) return;
    transitioning = true;
    void ui
      .transition(() => {
        pauseOpen = false;
        audio.setPaused(false);
        loadLevel(l);
        attempts = 0;
        if (opts.restoreLoops) {
          const loops = save.getLevelLoops(l.id);
          if (loops.length) {
            try {
              game.setLoops(loops);
              ui.toast(`${loops.length} echo${loops.length === 1 ? '' : 'es'} restored`, 'info', 2600);
            } catch {
              save.setLevelLoops(l.id, []);
            }
          }
        }
        save.setLastLevel(l.id);
        mode = 'intro';
        ui.showHUD(l);
        ui.showLevelIntro(l);
        renderer.playIntro();
        audio.setMusicState('explore');
      })
      .finally(() => {
        transitioning = false;
      });
  }

  function beginPlay(): void {
    if (mode !== 'intro') return;
    ui.hideLevelIntro();
    mode = 'playing';
    syncInputGate();
    renderer.setCameraMode('follow');
    stepper.reset();
  }

  function goMenu(): void {
    if (transitioning) return;
    transitioning = true;
    void ui
      .transition(() => enterMenu())
      .finally(() => {
        transitioning = false;
      });
  }

  function enterMenu(): void {
    pauseOpen = false;
    audio.setPaused(false);
    ui.hideHUD();
    ui.showMainMenu(menuData());
    startAttract(continueTarget() ?? level);
    mode = 'menu';
    audio.setMusicState('menu');
  }

  /** Main-menu backdrop: the real simulation replaying a chamber's verified solution, the camera tracking the run. */
  function startAttract(l: LevelDefinition): void {
    loadLevel(l);
    attractLevel = l;
    restartAttract();
    renderer.setCameraMode('follow');
  }

  function restartAttract(): void {
    if (!attractLevel) return;
    try {
      const sol = solutionFor(attractLevel);
      game.setLoops(sol.echoes);
      autopilot = sol.final;
    } catch {
      game.restartChamber();
      autopilot = null;
    }
  }

  function setPaused(p: boolean): void {
    if (p === pauseOpen) return;
    pauseOpen = p;
    audio.setPaused(p);
    keyboard.releaseAll();
    if (p) {
      ui.showPause({ levelName: level.name, levelOrder: level.order, echoesUsed: game.getLoops().length, maxEchoes: level.maxEchoes, attempts });
    } else {
      ui.hidePause();
      stepper.reset();
    }
    syncInputGate();
  }

  function clearPreview(): void {
    previewTick = null;
    previewHeld = false;
    inspectHold = ui?.timelineExpanded ?? false;
    snapshotCache = null;
  }

  /** R: end the take and turn it into an echo (with rewind playback); at the echo limit, discard the take instead. */
  function commitOrReset(animate: boolean): void {
    if (mode !== 'playing') return;
    const st = game.getState();
    const fromTick = st.tick;
    const reduced = save.data.settings.reducedMotion;
    const frames = animate && fromTick > 6 ? sampleRewind((t) => game.getSnapshotAt(t), fromTick, reduced ? 6 : 28) : [];
    clearPreview();
    autopilot = null;
    if (!game.commitLoopAndRewind()) {
      if (fromTick === 0) return;
      game.resetLoop();
    }
    attempts++;
    persistLoops();
    if (frames.length) {
      rewindFrames = frames;
      rewindClock = 0;
      rewindDuration = reduced ? REWIND_MS_REDUCED : REWIND_MS;
    }
    stepper.reset();
  }

  function restartChamber(): void {
    if (mode !== 'playing') return;
    clearPreview();
    autopilot = null;
    game.restartChamber();
    attempts++;
    persistLoops();
    stepper.reset();
  }

  function deleteLoop(i: number): void {
    if (mode !== 'playing' || i < 0 || i >= game.getLoops().length) return;
    clearPreview();
    hiddenEchoes.delete(`echo:${game.getLoops()[i]?.id ?? -1}`);
    game.deleteLoop(i);
    persistLoops();
    stepper.reset();
  }

  /** Saved immediately (not on the next frame) so a reload right after R still finds the echo. */
  function persistLoops(): void {
    if (mode === 'playing') save.setLevelLoops(level.id, game.getLoops());
  }

  function onComplete(result: CompletionResult): void {
    mode = 'complete';
    lastResult = result;
    autopilot = null;
    keyboard.releaseAll();
    if (ui.timelineExpanded) ui.setTimelineExpanded(false);
    const prev = save.data.progress.records[level.id];
    const rec = save.recordResult(result);
    const done = level;
    completeTimer = window.setTimeout(() => {
      if (mode !== 'complete' || level !== done) return;
      ui.showLevelComplete({
        result,
        levelName: done.name,
        levelOrder: done.order,
        hasNext: CAMPAIGN.next(done.id) !== null,
        firstClear: rec.firstClear,
        isNewBestTime: rec.isNewBestTime && !!prev,
        isNewBestEchoes: rec.isNewBestEchoes && !!prev,
        best: { ticks: rec.record.bestTicks, echoes: rec.record.bestEchoes },
      });
    }, COMPLETE_CARD_MS);
  }

  // ------------------------------------------------------------------ commands (meta keys, never recorded)
  const onCommand = (cmd: GameCommand): void => {
    if (cmd.type === 'pause') {
      if (ui.back()) return; // closes settings/level select, or resumes from pause
      if (mode !== 'playing') return;
      if (ui.timelineExpanded) {
        ui.setTimelineExpanded(false);
        return;
      }
      setPaused(true);
      return;
    }
    if (cmd.type === 'temporalPreview') {
      if (!cmd.held) {
        if (previewHeld) {
          previewHeld = false;
          previewTick = null;
          if (!ui.timelineExpanded) renderer.setCameraMode('follow');
        }
        return;
      }
      if (mode !== 'playing' || ui.isBlocking() || rewindFrames.length) return;
      previewHeld = true;
      previewBase = game.getState().tick;
      previewClock = 0;
      previewTick = previewBase;
      renderer.setCameraMode('overview');
      return;
    }
    if (mode !== 'playing' || ui.isBlocking() || transitioning) return;
    switch (cmd.type) {
      case 'rewind':
        commitOrReset(true);
        break;
      case 'restart':
        restartChamber();
        break;
      case 'toggleTimeline':
        ui.toggleTimeline();
        break;
      case 'selectEcho':
        ui.selectEcho(cmd.index < game.getLoops().length ? cmd.index : null);
        break;
      default:
        break;
    }
  };
  const offCommand = keyboard.onCommand(onCommand);
  keyboard.attach(window);

  /** Delete / Backspace removes the selected echo (DELETE LOOP on the timeline transport). */
  const onDeleteKey = (e: KeyboardEvent): void => {
    if ((e.code !== 'Delete' && e.code !== 'Backspace') || e.repeat) return;
    if (mode !== 'playing' || ui.isBlocking()) return;
    const sel = ui.selectedEcho;
    if (sel === null) return;
    e.preventDefault();
    ui.selectEcho(null);
    deleteLoop(sel);
  };
  window.addEventListener('keydown', onDeleteKey);

  function applySettings(s: Settings): void {
    if (!qualityOverride) renderer.setQuality(rendererQuality(s.quality));
    audio.setVolumes(volumesOf(s));
  }

  // ------------------------------------------------------------------ frame loop
  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const dtMs = Math.min(250, Math.max(0, now - last));
    last = now;
    const dt = dtMs / 1000;

    syncInputGate();
    stepper.paused = !simRunning();
    stepper.advance(dtMs);

    // Drain ONCE per frame and fan the same batch out to every consumer.
    const events: SimEvent[] = game.drainEvents();
    if (events.length) {
      snapshotCache = null;
      handleAppEvents(events);
    }
    const live = game.getState();
    if (mode === 'menu') audio.handleEvents([], live);
    else {
      audio.handleEvents(events, live);
      ui.onEvents(events);
    }

    // What the 3D view shows: rewind playback > scrub / temporal preview > live state.
    let view: SimView = live;
    let prev: SimView = game.getPreviousState();
    let alpha = stepper.alpha;
    if (rewindFrames.length) {
      rewindClock += dtMs;
      const k = Math.min(1, rewindClock / rewindDuration);
      const eased = k * k * (3 - 2 * k);
      const idx = Math.min(rewindFrames.length - 1, Math.floor(eased * (rewindFrames.length - 1)));
      view = rewindFrames[idx] as SimView;
      prev = rewindFrames[Math.max(0, idx - 1)] as SimView;
      alpha = 1;
      if (k >= 1) {
        rewindFrames = [];
        stepper.reset();
      }
    } else {
      if (previewHeld) {
        previewClock += dt;
        const span = Math.max(1, level.loopDurationTicks - previewBase);
        const ahead = Math.floor(previewClock * 60 * PREVIEW_SPEED) % (span + 45); // brief hold at the end, then loop
        previewTick = Math.min(level.loopDurationTicks, previewBase + ahead);
      }
      if (previewTick !== null && mode === 'playing') {
        const key = `${previewTick}`;
        if (!snapshotCache || snapshotCache.key !== key) snapshotCache = { key, view: game.getSnapshotAt(previewTick) };
        view = snapshotCache.view;
        prev = view;
        alpha = 1;
      }
    }
    // Framing: keep the subject clear of the docked timeline (and of the title column on the main menu).
    if (mode === 'menu') renderer.setFraming({ lift: 0.04, shift: 0.17, zoom: 1.45 });
    else renderer.setFraming({ lift: ui.timelineExpanded ? 0.16 : mode === 'playing' ? 0.06 : 0 });
    const timeline = mode === 'playing' || mode === 'intro' || mode === 'complete' ? game.getTimeline() : null;
    renderer.setTimeline(mode === 'playing' && !rewindFrames.length ? timeline : null);
    renderer.render(withoutHiddenEchoes(view, hiddenEchoes), withoutHiddenEchoes(prev, hiddenEchoes), alpha, events, dt);
    keyboard.sampler.yawStep = renderer.getCameraYawStep();

    if (timeline) {
      ui.update({
        level,
        state: live,
        timeline,
        paused: pauseOpen || inspectHold,
        prompt: mode === 'playing' ? predictInteraction(level, live) : null,
        objective: getObjectiveStatus(level, live),
        previewTick: mode === 'playing' ? previewTick : null,
        dt: simRunning() ? dt : 0,
      });
    }
    document.body.dataset['mode'] = mode;
  };

  function handleAppEvents(events: readonly SimEvent[]): void {
    if (mode !== 'playing') return;
    const result = completionFromEvents(level, events);
    if (result) onComplete(result);
  }

  // ------------------------------------------------------------------ boot
  enterMenu();
  raf = requestAnimationFrame(frame);

  const handle: AppHandle = {
    game,
    get mode() {
      return mode;
    },
    loadLevel,
    dispose() {
      cancelAnimationFrame(raf);
      window.clearTimeout(completeTimer);
      offCommand();
      keyboard.detach();
      window.removeEventListener('keydown', onDeleteKey);
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
      ui.dispose();
      audio.dispose();
      renderer.dispose();
    },
  };

  // Debug / test hook for Playwright (window.__RECURSION__). Uses only the public TemporalGame API.
  const hook: DebugHook = installDebugHook({
    game,
    save,
    renderer,
    audio,
    get mode() {
      return mode;
    },
    get level() {
      return level;
    },
    get ui() {
      return ui;
    },
    get lastResult() {
      return lastResult;
    },
    startLevel: (l) => startLevel(l),
    playLevel: (l) => {
      // Bypass the intro card (tests): load, show HUD, play.
      ui.hideScreens();
      loadLevel(l);
      save.setLastLevel(l.id);
      ui.showHUD(l, { tutorial: false });
      mode = 'playing';
      syncInputGate();
      renderer.setCameraMode('follow');
      audio.setMusicState('explore');
    },
    goMenu,
    setAutopilot: (inputs) => {
      autopilot = inputs;
      stepper.reset();
    },
    commit: () => commitOrReset(true),
    restart: () => restartChamber(),
    dispose: () => handle.dispose(),
    inputDebug: () => ({ gameplayEnabled: keyboard.gameplayEnabled, simRunning: simRunning(), autopilot: autopilot !== null, blocking: ui.isBlocking(), pauseOpen, inspectHold, previewHeld, transitioning, rewinding: rewindFrames.length > 0 }),
  });
  void hook;
  return handle;
}

function volumesOf(s: Settings): { master: number; music: number; sfx: number } {
  return { master: s.masterVolume / 100, music: s.musicVolume / 100, sfx: s.sfxVolume / 100 };
}

function showFatal(root: HTMLElement, message: string, err: unknown): void {
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;color:#cfe9ff;font:500 15px/1.6 system-ui,sans-serif;' +
    'letter-spacing:.12em;text-transform:uppercase;text-align:center;background:#05080d';
  el.textContent = `${message} (${err instanceof Error ? err.message : String(err)})`;
  root.appendChild(el);
}

import { IDLE_INPUT, type LevelDefinition, type SimView, type Timeline, type TemporalLoop } from '../../engine/contracts';
import { TemporalGame } from '../../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../../gameplay/entities';
import { predictInteraction } from '../../gameplay/interactions/targeting';
import { evaluateCompletion } from '../../gameplay/puzzles/completion';
import { getObjectiveStatus } from '../../gameplay/puzzles/objectives';
import { CAMPAIGN_LEVELS } from '../../levels/definitions';
import { emptyProgress, recordCompletion } from '../../levels/progression';
import { defaultSettings } from '../../persistence/settings';
import { compileSolution } from '../../testing/harness/harness';
import { buildLevelEntries, createUI, type LevelEntry, type UIFrame } from '../index';

/**
 * UI PREVIEW (ui-preview.html) — every screen rendered with real engine data (the real TemporalGame playing a
 * level's verified solution), optionally over the real 3D renderer. Used for Playwright screenshots in
 * docs/art-direction/screenshots/ui-*.png.
 *
 *   ?screen=menu|levels|settings|hud|timeline|pause|intro|complete|credits|onboarding   (default hud)
 *   ?tab=graphics|audio|access|controls     settings tab
 *   ?t=<tick>                               simulation tick for HUD/timeline scenes
 *   ?bg=scene|none                          render the 3D chamber behind the UI (default scene)
 *   ?palette=highContrast                   colour-blind palette
 *   ?live=1                                 keep simulating (interactive check)
 */

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'hud';
const palette = params.get('palette') === 'highContrast' ? 'highContrast' : 'default';
const live = params.get('live') === '1';

const L01 = CAMPAIGN_LEVELS[0] as LevelDefinition;
const L03 = (CAMPAIGN_LEVELS[2] ?? CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1]) as LevelDefinition;
const level = screen === 'onboarding' ? L01 : L03;
const defaultTick = screen === 'timeline' ? 560 : screen === 'onboarding' ? 160 : 420;
const targetTick = params.has('t') ? Number(params.get('t')) : defaultTick;

// ---------------------------------------------------------------- real game, real loops
const game = new TemporalGame(createDefaultRegistry());
game.loadLevel(level);
const compiled = compileSolution(level);
const echoes: TemporalLoop[] = screen === 'onboarding' ? [] : compiled.slice(0, -1);
const finalInputs = (compiled[compiled.length - 1]?.inputs ?? []).slice();
const playerInputs = screen === 'onboarding' ? (compiled[0]?.inputs ?? []) : finalInputs;
game.setLoops(echoes);
function advanceTo(tick: number): void {
  while (game.getState().tick < tick && game.getState().status === 'playing') {
    const t = game.getState().tick;
    game.step(playerInputs[t] ?? { ...IDLE_INPUT, tick: t });
  }
}
advanceTo(targetTick);
game.drainEvents();

/** Timeline scene: a paradox marker is injected so the divergence styling can be reviewed (preview-only data). */
function decorateTimeline(tl: Timeline): Timeline {
  if (screen !== 'timeline') return tl;
  const tracks = tl.tracks.map((t) => {
    if (t.kind !== 'echo' || t.echoIndex !== tl.tracks.filter((x) => x.kind === 'echo').length - 1) return t;
    const m = t.planned.find((p) => p.kind !== 'none') ?? null;
    if (!m) return t;
    const tick = Math.min(tl.currentTick - 10, m.tick);
    return {
      ...t,
      divergences: [
        {
          tick,
          actorId: t.actorId,
          loopId: t.loopId ?? 0,
          echoIndex: t.echoIndex,
          expected: { tick, verb: m.verb, kind: m.kind, entityId: m.entityId },
          actual: { tick, verb: m.verb, kind: 'fail' as const, entityId: m.entityId, reason: 'carriedByOther' },
        },
      ],
    };
  });
  return { ...tl, tracks };
}

// ---------------------------------------------------------------- UI
const uiRoot = document.getElementById('ui') as HTMLElement;
const log = (name: string) => (...args: unknown[]) => console.info(`[ui] ${name}`, ...args);
let paused = screen === 'pause';
let previewTick: number | null = screen === 'timeline' ? Math.min(level.loopDurationTicks, targetTick + 260) : null;
const ui = createUI(
  uiRoot,
  {
    onStartLevel: log('startLevel'),
    onResume: () => {
      paused = false;
      ui.hidePause();
    },
    onRestart: log('restart'),
    onResetLoop: log('resetLoop'),
    onCommitEcho: log('commitEcho'),
    onTogglePause: () => (paused = !paused),
    onDeleteLoop: log('deleteLoop'),
    onScrub: (t) => (previewTick = t),
    onScrubEnd: () => (previewTick = null),
    onToggleEchoVisibility: log('visibility'),
    onSelectEcho: log('selectEcho'),
    onSettingsChange: log('settings'),
    onKeybindsChange: log('keybinds'),
    onIntroDone: () => ui.hideLevelIntro(),
    onQuitToMenu: log('quit'),
  },
  { settings: { ...defaultSettings(), echoPalette: palette, reducedMotion: params.get('motion') === 'reduced', uiScale: Number(params.get('scale') ?? 1) } },
);

// progress mock: first two chambers restored
let progress = emptyProgress();
const l1 = CAMPAIGN_LEVELS[0];
const l2 = CAMPAIGN_LEVELS[1];
if (l1) progress = recordCompletion(progress, evaluateCompletion(l1, 640, 1));
if (l2) progress = recordCompletion(progress, evaluateCompletion(l2, 1210, 3));
const FUTURE = ['The Lift', 'Perfect Timing', 'Chain Reaction', 'Broken Sequence', 'Recursive Machine', 'The Paradox Chamber', 'The Core'];
const entries: LevelEntry[] = buildLevelEntries(CAMPAIGN_LEVELS, progress);
for (let i = entries.length; i < 10; i++)
  entries.push({ id: `future-${i}`, order: i + 1, name: FUTURE[i - 3] ?? `Chamber ${i + 1}`, status: 'locked', isNext: false, maxEchoes: 3, parTimeSeconds: 30, best: null });
const totalStars = Object.values(progress.records).reduce((s, r) => s + r.bestStars, 0);
const menuData = {
  continueLevel: { id: L03.id, order: L03.order, name: L03.name },
  levels: entries,
  totalStars,
  maxStars: 30,
  version: 'v0.1',
};

function frame(dt = 1 / 60): UIFrame {
  const state = game.getState();
  return {
    level,
    state,
    timeline: decorateTimeline(game.getTimeline()),
    paused,
    prompt: predictInteraction(level, state),
    objective: getObjectiveStatus(level, state),
    previewTick,
    dt,
  };
}

switch (screen) {
  case 'menu':
    ui.showMainMenu(menuData);
    break;
  case 'levels':
    ui.showMainMenu(menuData);
    ui.showLevelSelect();
    break;
  case 'settings':
    ui.showMainMenu(menuData);
    ui.showSettings();
    {
      const tab = params.get('tab');
      if (tab) (document.querySelector(`.rx-tab[id$="-${tab}"]`) as HTMLButtonElement | null)?.click();
    }
    break;
  case 'credits':
    ui.showMainMenu(menuData);
    ui.showCredits();
    break;
  case 'intro':
    ui.showHUD(level, { tutorial: false });
    ui.update(frame(0));
    ui.showLevelIntro(level);
    break;
  case 'pause':
    ui.showHUD(level, { tutorial: false });
    ui.update(frame(0));
    ui.showPause({ levelName: level.name, levelOrder: level.order, echoesUsed: echoes.length, maxEchoes: level.maxEchoes, attempts: 4 });
    break;
  case 'complete': {
    ui.showHUD(level, { tutorial: false });
    advanceTo(level.loopDurationTicks);
    ui.update(frame(0));
    const st = game.getState();
    const result = evaluateCompletion(level, (st.completedAtTick ?? st.tick) + 1, echoes.length);
    ui.showLevelComplete({ result, levelName: level.name, levelOrder: level.order, hasNext: true, firstClear: false, isNewBestTime: true, best: { ticks: result.ticks, echoes: echoes.length } });
    break;
  }
  case 'onboarding':
    ui.showHUD(level, { tutorial: true });
    // replay the tutorial signals the player would have produced so far
    ui.update(frame(0));
    ui.onEvents([{ type: 'plateDown', tick: 100, entityId: 'plate-a' }]);
    ui.update(frame(0));
    break;
  case 'timeline':
    ui.showHUD(level, { tutorial: false });
    ui.setTimelineExpanded(true);
    ui.selectEcho(0);
    ui.update(frame(0));
    break;
  default:
    ui.showHUD(level, { tutorial: false });
    ui.update(frame(0));
    if (level.hints[1]) ui.showHint(level.hints[1].text, 1, level.hints.length);
    ui.toast('Echo 2 recorded', 'info', 60_000);
}

// ---------------------------------------------------------------- optional 3D scene behind the UI
type RendererLike = { setLevel(l: LevelDefinition, s?: SimView): void; render(s: SimView, p: SimView, a: number, e?: readonly never[], dt?: number): void };
let renderer: RendererLike | null = null;
async function startScene(): Promise<void> {
  if (params.get('bg') === 'none') return;
  try {
    const mod = await import('../../engine/rendering');
    const r = mod.createGameRenderer(document.getElementById('app') as HTMLElement, { quality: 'medium', introOnLevelLoad: false, preserveDrawingBuffer: true }) as unknown as RendererLike;
    r.setLevel(level, game.getState());
    renderer = r;
  } catch (err) {
    console.warn('[ui-preview] 3D scene unavailable, using backdrop', err);
  }
}

const flags = { ready: false, frames: 0 };
(window as unknown as { __UIPREVIEW__: typeof flags }).__UIPREVIEW__ = flags;

void startScene().then(() => {
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (live && !paused && game.getState().status === 'playing') {
      const t = game.getState().tick;
      game.step(playerInputs[t] ?? { ...IDLE_INPUT, tick: t });
      ui.onEvents(game.drainEvents());
    }
    const shown = previewTick !== null ? game.getSnapshotAt(previewTick) : game.getState();
    // Static scenes: a few 3D frames suffice (software GL is slow); live mode renders every frame.
    if (live || flags.frames < 4) renderer?.render(shown, shown, 1, [], 1 / 60);
    if (ui.screen === null || screen === 'pause' || screen === 'intro' || screen === 'complete') ui.update(frame(live ? dt : 0));
    flags.frames++;
    if (flags.frames === 40) flags.ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

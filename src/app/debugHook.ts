import type { AudioSystem } from '../engine/audio';
import { IDLE_INPUT, type LevelDefinition, type PlayerInput, type SimView } from '../engine/contracts';
import type { GameRenderer } from '../engine/rendering';
import type { TemporalGame } from '../engine/temporal/TemporalGame';
import type { CompletionResult } from '../gameplay/puzzles/completion';
import { CAMPAIGN, LEVELS, TEST_LEVELS } from '../levels';
import type { SaveStore } from '../persistence/save';
import type { UIHandle } from '../ui';
import type { AppMode } from './flow';
import { loadedSolutions, loadSolutions } from './lazySolutions';
import type { KnownSolution } from './solutions';

/** What the app exposes to the hook (all reads go through TemporalGame's public API). */
export interface DebugHookDeps {
  game: TemporalGame;
  save: SaveStore;
  renderer: GameRenderer;
  audio: AudioSystem;
  readonly mode: AppMode;
  readonly level: LevelDefinition;
  readonly ui: UIHandle;
  readonly lastResult: CompletionResult | null;
  startLevel(level: LevelDefinition): void;
  playLevel(level: LevelDefinition): void;
  goMenu(): void;
  setAutopilot(inputs: readonly PlayerInput[] | null): void;
  commit(): void;
  restart(): void;
  dispose(): void;
  inputDebug(): Record<string, boolean>;
  /** Hold the temporal preview (Q) at a tick, or release it (null). */
  setPreview(tick: number | null): void;
  forecastStats(): ForecastStats;
}

export interface ForecastStats {
  samples: number;
  version: number;
  walkOns: number;
  ghostPaths: number;
  previewTick: number | null;
}

export interface SolveResult {
  completed: boolean;
  status: string;
  tick: number;
  echoes: number;
  hash: number;
}

/**
 * window.__RECURSION__ — debug / Playwright hook. Read access plus a few deterministic drivers:
 *   levels                         ordered level ids (campaign)
 *   getState() / hash() / mode     live read-only state, world hash, app flow state
 *   loadLevel(idOrIndex)           load & play a level immediately (skips intro); 'test' ids allowed
 *   startLevel(idOrIndex)          go through the normal transition + intro card
 *   runSolution({instant})         install the level's verified echo loops and drive the final run with its inputs.
 *                                  instant (default) steps synchronously; otherwise the player is autopiloted at 60 Hz.
 *                                  The solution compiler is a lazy chunk: once loaded (it is fetched right after the
 *                                  menu paints) this returns synchronously; before that it returns a Promise
 *                                  (page.evaluate awaits it). solutionsReady() reports which; loadSolutions() preloads.
 *   stepIdle(n)                    advance n ticks with idle player input (synchronous)
 *   commit() / restart()           same as R / Shift+R
 *   preview(tick|null)             hold the temporal preview (Q) frozen at a tick (ghost paths shown), or release it
 *   forecastStats()                echo-forecast progress (samples, walk-on badges, ghost paths)
 */
export interface DebugHook {
  readonly game: TemporalGame;
  readonly levels: string[];
  readonly mode: AppMode;
  readonly levelId: string;
  readonly lastResult: CompletionResult | null;
  readonly screen: string | null;
  readonly timelineExpanded: boolean;
  getState(): SimView;
  hash(): number;
  echoes(): number;
  loadLevel(idOrIndex: string | number): string;
  startLevel(idOrIndex: string | number): string;
  goMenu(): void;
  /** `untilTick` (instant only) stops the final run at that tick, leaving the chamber mid-solve with echoes acting. */
  runSolution(opts?: { instant?: boolean; untilTick?: number }): SolveResult | Promise<SolveResult>;
  /** True once the lazy solution-compiler chunk (attract replay / runSolution) has loaded. */
  solutionsReady(): boolean;
  /** Loads the solution-compiler chunk (resolves when runSolution is synchronous). */
  loadSolutions(): Promise<void>;
  stepIdle(ticks: number): number;
  commit(): void;
  restart(): void;
  renderStats(): ReturnType<GameRenderer['stats']>;
  audioStats(): ReturnType<AudioSystem['stats']>;
  progress(): unknown;
  /** Why gameplay input / the sim clock may be gated right now. */
  inputDebug(): Record<string, boolean>;
  preview(tick: number | null): void;
  forecastStats(): ForecastStats;
  dispose(): void;
}

export function installDebugHook(d: DebugHookDeps): DebugHook {
  const find = (idOrIndex: string | number): LevelDefinition => {
    const l =
      typeof idOrIndex === 'number'
        ? LEVELS[idOrIndex]
        : (CAMPAIGN.get(idOrIndex) ?? TEST_LEVELS.find((t) => t.id === idOrIndex) ?? LEVELS.find((x) => x.name === idOrIndex));
    if (!l) throw new Error(`__RECURSION__: unknown level ${String(idOrIndex)}`);
    return l;
  };
  const result = (): SolveResult => {
    const st = d.game.getState();
    return { completed: st.status === 'complete', status: st.status, tick: st.tick, echoes: d.game.getLoops().length, hash: d.game.hash() };
  };

  /** Installs the verified echo loops and drives the final run (synchronously, or autopiloted at 60 Hz). */
  const solve = (sol: KnownSolution, opts: { instant?: boolean; untilTick?: number }): SolveResult => {
    d.game.setLoops(sol.echoes);
    if (opts.instant === false) {
      d.setAutopilot(sol.final);
      return result();
    }
    d.setAutopilot(null);
    const max = Math.min(d.level.loopDurationTicks + 1, opts.untilTick ?? Infinity);
    for (let i = 0; i < max && d.game.getState().status === 'playing'; i++) {
      const t = d.game.getState().tick;
      d.game.step(sol.final[t] ?? { ...IDLE_INPUT, tick: t });
    }
    return result();
  };

  const hook: DebugHook = {
    game: d.game,
    levels: LEVELS.map((l) => l.id),
    get mode() {
      return d.mode;
    },
    get levelId() {
      return d.level.id;
    },
    get lastResult() {
      return d.lastResult;
    },
    get screen() {
      return d.ui.screen;
    },
    get timelineExpanded() {
      return d.ui.timelineExpanded;
    },
    getState: () => d.game.getState(),
    hash: () => d.game.hash(),
    echoes: () => d.game.getLoops().length,
    loadLevel(idOrIndex) {
      const l = find(idOrIndex);
      d.playLevel(l);
      return l.id;
    },
    startLevel(idOrIndex) {
      const l = find(idOrIndex);
      d.startLevel(l);
      return l.id;
    },
    goMenu: () => d.goMenu(),
    runSolution(opts = {}) {
      if (d.mode !== 'playing') throw new Error(`__RECURSION__.runSolution: app is in '${d.mode}', not playing`);
      const ready = loadedSolutions();
      if (ready) return solve(ready.solutionFor(d.level), opts);
      const level = d.level;
      return loadSolutions().then((m) => {
        if (d.mode !== 'playing' || d.level !== level) throw new Error('__RECURSION__.runSolution: level changed while loading');
        return solve(m.solutionFor(level), opts);
      });
    },
    solutionsReady: () => loadedSolutions() !== null,
    loadSolutions: () => loadSolutions().then(() => undefined),
    stepIdle(ticks) {
      for (let i = 0; i < ticks && d.game.getState().status === 'playing'; i++) {
        const t = d.game.getState().tick;
        d.game.step({ ...IDLE_INPUT, tick: t });
      }
      return d.game.getState().tick;
    },
    commit: () => d.commit(),
    restart: () => d.restart(),
    renderStats: () => d.renderer.stats(),
    audioStats: () => d.audio.stats(),
    progress: () => d.save.data.progress,
    inputDebug: () => d.inputDebug(),
    preview: (tick) => d.setPreview(tick),
    forecastStats: () => d.forecastStats(),
    dispose: () => d.dispose(),
  };
  (window as unknown as { __RECURSION__?: DebugHook }).__RECURSION__ = hook;
  return hook;
}

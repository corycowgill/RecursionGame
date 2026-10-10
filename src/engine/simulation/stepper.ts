import { TICK_MS } from '../contracts';

/**
 * FixedStepper — render-independent 60 Hz accumulator. The app calls `advance(frameDeltaMs)` once per
 * animation frame; it invokes `tick()` zero or more times (bounded by maxStepsPerFrame to avoid spirals of
 * death after a stall) and exposes `alpha` (0..1) for render interpolation between previous and current
 * state. Float accumulation here is fine: it only decides HOW MANY ticks run, never what a tick computes,
 * and inputs are sampled per tick.
 */
export class FixedStepper {
  private accumulator = 0;
  private _alpha = 0;
  paused = false;
  /** Time scale for slow-motion presentation (does not change tick contents). */
  timeScale = 1;

  constructor(
    private readonly tick: () => void,
    private readonly maxStepsPerFrame = 5,
    private readonly stepMs = TICK_MS,
  ) {}

  /** Returns the number of ticks executed. */
  advance(frameDeltaMs: number): number {
    if (this.paused) {
      this._alpha = 1;
      return 0;
    }
    const dt = Math.max(0, Math.min(frameDeltaMs, 250)) * this.timeScale;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxStepsPerFrame) {
      this.tick();
      this.accumulator -= this.stepMs;
      steps++;
    }
    if (steps === this.maxStepsPerFrame && this.accumulator > this.stepMs) this.accumulator = this.stepMs * 0.5;
    this._alpha = this.accumulator / this.stepMs;
    return steps;
  }

  get alpha(): number {
    return this._alpha;
  }

  reset(): void {
    this.accumulator = 0;
    this._alpha = 0;
  }
}

/**
 * Dynamic resolution guard. Fed the wall-clock time between rendered frames, it steps a render scale (fraction of
 * the preset's pixel-ratio cap) down when frames are consistently slower than the target and back up when they
 * consistently meet it, with hysteresis so it does not oscillate:
 *
 *  - frames are judged over a window (default 30 frames) using the window MEDIAN, so single hitches do not count;
 *  - step DOWN when the median is above `downRatio` x the frame budget (default 1.2: under ~50 fps at a 60 target);
 *  - step UP only after `upWindows` consecutive windows at or under `upRatio` x the budget (default 1.05), i.e.
 *    the target is met with the current scale. rAF intervals are vsync-quantised, so "meeting the target" is
 *    the only headroom signal a browser gives without GPU timer queries (unavailable on iOS);
 *  - if a step up is followed by a step down within `failWindows`, that scale is remembered as too expensive and
 *    the wait before the next step up doubles (capped at `maxBackoff` x `upWindows`);
 *  - intervals over `stallMs` (default 1 s: tab switch, breakpoint) reset the current window instead of counting.
 *
 * Purely presentational: the simulation runs on its own fixed 60 Hz stepper and never sees the scale.
 */
export interface ResolutionControllerOptions {
  targetFps: number;
  minScale?: number;
  maxScale?: number;
  /** Scale change per step. */
  step?: number;
  windowFrames?: number;
  downRatio?: number;
  upRatio?: number;
  upWindows?: number;
  failWindows?: number;
  maxBackoff?: number;
  stallMs?: number;
}

export class ResolutionController {
  readonly targetFps: number;
  readonly minScale: number;
  readonly maxScale: number;
  private readonly step: number;
  private readonly windowFrames: number;
  private readonly downRatio: number;
  private readonly upRatio: number;
  private readonly upWindows: number;
  private readonly failWindows: number;
  private readonly maxBackoff: number;
  private readonly stallMs: number;
  private readonly samples: number[] = [];
  private _scale: number;
  private goodWindows = 0;
  private backoff = 1;
  /** Windows judged since the last step up (for failure detection), or -1 when the last step was not up. */
  private sinceUp = -1;
  private _changes = 0;

  constructor(opts: ResolutionControllerOptions) {
    this.targetFps = Math.max(1, opts.targetFps);
    this.minScale = opts.minScale ?? 0.5;
    this.maxScale = opts.maxScale ?? 1;
    this.step = opts.step ?? 0.1;
    this.windowFrames = opts.windowFrames ?? 30;
    this.downRatio = opts.downRatio ?? 1.2;
    this.upRatio = opts.upRatio ?? 1.05;
    this.upWindows = opts.upWindows ?? 4;
    this.failWindows = opts.failWindows ?? 3;
    this.maxBackoff = opts.maxBackoff ?? 16;
    this.stallMs = opts.stallMs ?? 1000;
    this._scale = this.maxScale;
  }

  /** Current render scale in [minScale, maxScale]. */
  get scale(): number {
    return this._scale;
  }

  /** Number of scale changes so far (debug / tests). */
  get changes(): number {
    return this._changes;
  }

  get budgetMs(): number {
    return 1000 / this.targetFps;
  }

  /** Forget the current window (call after a pause, level load, resize or quality change). */
  resetWindow(): void {
    this.samples.length = 0;
  }

  /** Back to full scale with a clean history (e.g. quality preset changed). */
  reset(): void {
    this.samples.length = 0;
    this._scale = this.maxScale;
    this.goodWindows = 0;
    this.backoff = 1;
    this.sinceUp = -1;
  }

  /** Record one frame interval. Returns true when the scale changed. */
  update(frameMs: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return false;
    if (frameMs > this.stallMs) {
      this.samples.length = 0;
      return false;
    }
    this.samples.push(frameMs);
    if (this.samples.length < this.windowFrames) return false;
    const median = medianOf(this.samples);
    this.samples.length = 0;
    const budget = this.budgetMs;
    if (this.sinceUp >= 0) this.sinceUp++;

    if (median > budget * this.downRatio) {
      this.goodWindows = 0;
      if (this.sinceUp >= 0 && this.sinceUp <= this.failWindows) this.backoff = Math.min(this.maxBackoff, this.backoff * 2);
      this.sinceUp = -1;
      return this.setScale(this._scale - this.step);
    }
    if (median <= budget * this.upRatio) {
      this.goodWindows++;
      if (this.sinceUp > this.failWindows) {
        // the last step up held: relax the backoff again
        this.backoff = Math.max(1, this.backoff / 2);
        this.sinceUp = -1;
      }
      if (this._scale < this.maxScale && this.goodWindows >= this.upWindows * this.backoff) {
        this.goodWindows = 0;
        this.sinceUp = 0;
        return this.setScale(this._scale + this.step);
      }
      return false;
    }
    // in the hysteresis band: hold
    this.goodWindows = 0;
    return false;
  }

  private setScale(s: number): boolean {
    const next = Math.round(Math.min(this.maxScale, Math.max(this.minScale, s)) * 1000) / 1000;
    if (next === this._scale) return false;
    this._scale = next;
    this._changes++;
    return true;
  }
}

function medianOf(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

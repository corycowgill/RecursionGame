import type { LevelHint } from '../../engine/contracts';

/**
 * PROGRESSIVE HINTS — hints unlock one at a time, in order, after time spent in the chamber OR after a number of
 * attempts (rewinds without progress, restarts, deleted loops). Pure and deterministic (driven by the dt the UI
 * passes in; wall-clock time never touches the simulation).
 *
 * Hint i unlocks when hint i-1 has been revealed and either
 *   elapsed >= hint.afterSeconds (default: (i+1) × defaultIntervalSec)   or
 *   attempts >= (i+1) × attemptsPerHint.
 */
export interface HintSchedulerOptions {
  defaultIntervalSec?: number;
  attemptsPerHint?: number;
}

export class HintScheduler {
  private elapsed = 0;
  private attempts = 0;
  private revealed = 0;
  private readonly interval: number;
  private readonly perAttempt: number;

  constructor(
    readonly hints: readonly LevelHint[],
    opts: HintSchedulerOptions = {},
  ) {
    this.interval = opts.defaultIntervalSec ?? 45;
    this.perAttempt = opts.attemptsPerHint ?? 3;
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }
  get attemptCount(): number {
    return this.attempts;
  }
  get revealedCount(): number {
    return this.revealed;
  }
  get revealedHints(): readonly LevelHint[] {
    return this.hints.slice(0, this.revealed);
  }

  /** Seconds threshold for hint i. */
  thresholdSeconds(i: number): number {
    return this.hints[i]?.afterSeconds ?? (i + 1) * this.interval;
  }

  /** Is the next hint ready to show? */
  get nextReady(): boolean {
    const i = this.revealed;
    if (i >= this.hints.length) return false;
    return this.elapsed >= this.thresholdSeconds(i) || this.attempts >= (i + 1) * this.perAttempt;
  }

  advance(dtSeconds: number): void {
    if (dtSeconds > 0 && Number.isFinite(dtSeconds)) this.elapsed += Math.min(dtSeconds, 1);
  }

  noteAttempt(): void {
    this.attempts++;
  }

  /** Reveals and returns the next hint if it is ready, else null. */
  poll(): { hint: LevelHint; index: number; total: number } | null {
    if (!this.nextReady) return null;
    const index = this.revealed++;
    return { hint: this.hints[index] as LevelHint, index, total: this.hints.length };
  }

  /** Forces the next hint (player asked for one from the pause menu). */
  revealNext(): { hint: LevelHint; index: number; total: number } | null {
    if (this.revealed >= this.hints.length) return null;
    const index = this.revealed++;
    return { hint: this.hints[index] as LevelHint, index, total: this.hints.length };
  }

  reset(): void {
    this.elapsed = 0;
    this.attempts = 0;
    this.revealed = 0;
  }
}

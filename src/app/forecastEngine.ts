import { IDLE_INPUT, type LevelDefinition, type PlayerInput, type TemporalLoop } from '../engine/contracts';
import { TemporalGame } from '../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../gameplay/entities';
import { FORECAST_STEP, ForecastSampler, walkOnTriggers, type ForecastSample } from '../graphics/effects/forecast';

/**
 * FORECAST ENGINE — a private, throw-away TemporalGame that reproduces the live pass and samples its future.
 *
 * The live game's preview cache is invalidated every time its tick advances, so sampling the future from it while
 * the clock runs costs a full re-simulation per sample. Instead this engine keeps its OWN game: it loads the same
 * level and loops, replays the player's recording up to the requested tick (the simulation is deterministic, so
 * this reproduces the live state bit-for-bit), and then samples `getSnapshotAt` ahead with a stable cache. It runs
 * in a Web Worker in the browser (forecast.worker.ts) or inline, time-sliced, where workers are unavailable.
 *
 * It never touches the live game: requests carry plain copies of the level, loops and recording.
 */

export interface ForecastRequest {
  id: number;
  level: LevelDefinition;
  loops: readonly TemporalLoop[];
  /** The player's recorded inputs of the current pass, at least up to `fromTick`. */
  recording: readonly PlayerInput[];
  fromTick: number;
  step?: number;
}

export interface ForecastChunk {
  id: number;
  baseTick: number;
  samples: ForecastSample[];
  done: boolean;
}

const loopsKey = (level: LevelDefinition, loops: readonly TemporalLoop[]): string =>
  `${level.id}|${loops.map((l) => `${l.id}:${l.durationTicks}`).join(',')}`;

const sameInput = (a: PlayerInput | undefined, b: PlayerInput | undefined): boolean =>
  !!a &&
  !!b &&
  a.moveX === b.moveX &&
  a.moveY === b.moveY &&
  a.interactPressed === b.interactPressed &&
  a.interactHeld === b.interactHeld &&
  a.actionPressed === b.actionPressed;

export class ForecastEngine {
  private readonly game = new TemporalGame(createDefaultRegistry(), { trackPrevious: false });
  private key = '';
  private fed: PlayerInput[] = [];
  private req: ForecastRequest | null = null;
  private sampler: ForecastSampler | null = null;
  private emitted = 0;

  get busy(): boolean {
    return this.req !== null;
  }

  start(req: ForecastRequest): void {
    this.req = req;
    this.sampler = null;
    this.emitted = 0;
    const key = loopsKey(req.level, req.loops);
    const tick = this.key ? this.game.getState().tick : -1;
    let reuse = key === this.key && tick >= 0 && tick <= req.fromTick;
    if (reuse) {
      for (let t = 0; t < tick; t++) {
        if (!sameInput(this.fed[t], req.recording[t])) {
          reuse = false;
          break;
        }
      }
    }
    if (!reuse) {
      this.game.loadLevel(req.level);
      this.game.setLoops(req.loops);
      this.game.drainEvents();
      this.fed = [];
      this.key = key;
    }
  }

  /** Advances the current job for up to `budgetMs`; returns the samples produced since the last call (or null). */
  pump(budgetMs: number, now: () => number): ForecastChunk | null {
    const req = this.req;
    if (!req) return null;
    const t0 = now();
    // 1) reproduce the live pass up to the requested tick
    while (!this.sampler) {
      const st = this.game.getState();
      if (st.tick >= req.fromTick || st.status !== 'playing') {
        const triggers = walkOnTriggers(req.level);
        this.sampler = new ForecastSampler(String(req.id), st.tick, req.level.loopDurationTicks, triggers, req.step ?? FORECAST_STEP);
        break;
      }
      const input = req.recording[st.tick] ?? { ...IDLE_INPUT, tick: st.tick };
      this.game.step(input);
      this.fed[st.tick] = input;
      if ((st.tick & 63) === 0) {
        this.game.drainEvents();
        if (now() - t0 > budgetMs) return null;
      }
    }
    this.game.drainEvents();
    // 2) sample the future (idle player), stable preview cache
    const s = this.sampler;
    if (now() - t0 < budgetMs || s.samples.length === 0) s.pump((t) => this.game.getSnapshotAt(t), Math.max(1, budgetMs - (now() - t0)), now);
    const fresh = s.samples.slice(this.emitted);
    this.emitted = s.samples.length;
    if (s.done) this.req = null;
    return { id: req.id, baseTick: s.baseTick, samples: fresh, done: s.done };
  }

  /** Runs the current job to completion (tests). */
  runToEnd(now: () => number = () => 0): ForecastSample[] {
    const out: ForecastSample[] = [];
    for (let guard = 0; guard < 100000 && this.req; guard++) {
      const c = this.pump(Infinity, now);
      if (c) out.push(...c.samples);
    }
    return out;
  }

  cancel(): void {
    this.req = null;
    this.sampler = null;
  }
}

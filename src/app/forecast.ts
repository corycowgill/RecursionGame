import type { LevelDefinition, PlayerInput, SimEvent, SimView, TemporalLoop } from '../engine/contracts';
import {
  extractGhostPaths,
  forecastDeviation,
  scheduleWalkOns,
  walkOnTriggers,
  type ForecastSample,
  type GhostPath,
  type WalkOn,
  type WalkOnTrigger,
} from '../graphics/effects/forecast';
import { ForecastEngine, type ForecastChunk, type ForecastRequest } from './forecastEngine';

/**
 * ECHO FORECAST CONTROLLER (app glue). Keeps an up-to-date forecast of where every echo will be for the rest of
 * the pass and derives the walk-on badge plan and the Q-preview ghost paths from it.
 *
 * When it re-forecasts (from the live tick):
 *   - a new pass (loop set changed, rewind, reset, level load),
 *   - something the player did may have changed the echoes' future: a divergence, or a player pickup / drop / use,
 *   - the live echoes drift from the forecast (e.g. the player parked a crate in an echo's path),
 *   - on demand (`refresh`, used when the temporal preview opens).
 * The forecast assumes the player idles from the forecast tick on — the same assumption the Q preview shows.
 *
 * Work runs in a Web Worker when available (no main-thread cost), otherwise inline with a small per-frame budget.
 * Everything here is read-only with respect to the live game.
 */

export interface ForecastBackend {
  request(req: ForecastRequest): void;
  /** Chunks that arrived since the last poll (inline backends do their work here, within `budgetMs`). */
  poll(budgetMs: number): ForecastChunk[];
  dispose(): void;
}

export class InlineForecastBackend implements ForecastBackend {
  private readonly engine = new ForecastEngine();
  constructor(private readonly now: () => number = () => performance.now()) {}
  request(req: ForecastRequest): void {
    this.engine.start(req);
  }
  poll(budgetMs: number): ForecastChunk[] {
    const c = this.engine.pump(budgetMs, this.now);
    return c ? [c] : [];
  }
  dispose(): void {
    this.engine.cancel();
  }
}

export class WorkerForecastBackend implements ForecastBackend {
  private readonly queue: ForecastChunk[] = [];
  constructor(private readonly worker: Worker) {
    worker.onmessage = (e: MessageEvent<ForecastChunk>) => this.queue.push(e.data);
  }
  request(req: ForecastRequest): void {
    this.worker.postMessage(req);
  }
  poll(): ForecastChunk[] {
    return this.queue.splice(0);
  }
  dispose(): void {
    this.worker.terminate();
  }
}

/** Worker backend in the browser, inline fallback elsewhere (tests, workers blocked). */
export function createForecastBackend(): ForecastBackend {
  try {
    if (typeof Worker !== 'undefined') return new WorkerForecastBackend(new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' }));
  } catch {
    /* fall through */
  }
  return new InlineForecastBackend();
}

export interface ForecastFrame {
  level: LevelDefinition;
  live: SimView;
  loops: readonly TemporalLoop[];
  recording: readonly PlayerInput[];
  events: readonly SimEvent[];
}

/** Live echoes this far (units) off the forecast trigger a re-forecast. */
const DEVIATION_UNITS = 300;
/** Minimum live ticks between event-driven re-forecasts. */
const MIN_REFRESH_TICKS = 20;
/** Inline backend: main-thread budget per frame (ms). */
const INLINE_BUDGET_MS = 3;

export class EchoForecastController {
  private samples: ForecastSample[] = [];
  private activeId = 0;
  private receivedActive = false;
  private nextId = 1;
  private passKey = '';
  private lastLiveTick = -1;
  private lastRequestTick = -Infinity;
  private dirty = false;
  private triggers: WalkOnTrigger[] = [];
  private levelId = '';
  /** Bumped whenever the samples change. */
  version = 0;
  private walkOnCache: { version: number; value: WalkOn[] } | null = null;
  private pathCache: { key: string; value: GhostPath[] } | null = null;

  constructor(private readonly backend: ForecastBackend = createForecastBackend()) {}

  get forecastSamples(): readonly ForecastSample[] {
    return this.samples;
  }

  /** Call once per frame (after the sim stepped and events were drained). */
  update(f: ForecastFrame): void {
    if (f.level.id !== this.levelId) {
      this.levelId = f.level.id;
      this.triggers = walkOnTriggers(f.level);
      this.clear();
    }
    const key = `${f.level.id}|${f.loops.map((l) => l.id).join(',')}`;
    const newPass = key !== this.passKey || f.live.tick < this.lastLiveTick;
    this.lastLiveTick = f.live.tick;
    if (newPass) {
      this.passKey = key;
      this.clear();
      this.request(f);
    } else {
      for (const ev of f.events) {
        if (ev.type === 'divergence') this.dirty = true;
        else if ((ev.type === 'pickup' || ev.type === 'drop' || ev.type === 'interact') && ev.actorId === 'player') this.dirty = true;
      }
      if (!this.dirty && this.receivedActive && forecastDeviation(this.samples, f.live) > DEVIATION_UNITS) this.dirty = true;
      if (this.dirty && f.live.tick - this.lastRequestTick >= MIN_REFRESH_TICKS) this.request(f);
    }
    this.absorb(this.backend.poll(INLINE_BUDGET_MS));
  }

  /** Forces a fresh forecast from the live tick (temporal preview opened). */
  refresh(f: ForecastFrame): void {
    this.request(f);
  }

  private request(f: ForecastFrame): void {
    if (!f.loops.length) {
      // no echoes: nothing to forecast
      this.activeId = this.nextId++;
      this.receivedActive = true;
      this.setSamples([]);
      this.dirty = false;
      return;
    }
    this.dirty = false;
    this.lastRequestTick = f.live.tick;
    this.activeId = this.nextId++;
    this.receivedActive = false;
    this.backend.request({
      id: this.activeId,
      level: f.level,
      loops: f.loops.map((l) => ({ ...l, inputs: l.inputs.slice(), outcomes: l.outcomes.slice() })),
      recording: f.recording.slice(0, f.live.tick),
      fromTick: f.live.tick,
    });
  }

  private absorb(chunks: readonly ForecastChunk[]): void {
    for (const c of chunks) {
      if (c.id !== this.activeId) continue; // superseded
      if (!this.receivedActive) {
        // keep showing the previous forecast until the new one starts arriving (no flicker)
        this.receivedActive = true;
        this.setSamples(c.samples.slice());
      } else if (c.samples.length) this.setSamples(this.samples.concat(c.samples));
    }
  }

  private setSamples(s: ForecastSample[]): void {
    this.samples = s;
    this.version++;
  }

  private clear(): void {
    this.setSamples([]);
    this.receivedActive = false;
    this.dirty = false;
    this.lastRequestTick = -Infinity;
  }

  /** Walk-on plan (pressure plates / ride-lifts) from the current forecast. */
  walkOns(): WalkOn[] {
    if (!this.walkOnCache || this.walkOnCache.version !== this.version) this.walkOnCache = { version: this.version, value: scheduleWalkOns(this.samples, this.triggers) };
    return this.walkOnCache.value;
  }

  /** Ghost paths from `fromTick` (preview start), without hidden echoes. Stable identity while nothing changes. */
  ghostPaths(fromTick: number, hidden: ReadonlySet<string>): GhostPath[] {
    const key = `${this.version}|${fromTick}|${[...hidden].sort().join(',')}`;
    if (!this.pathCache || this.pathCache.key !== key) this.pathCache = { key, value: extractGhostPaths(this.samples, fromTick, hidden) };
    return this.pathCache.value;
  }

  dispose(): void {
    this.backend.dispose();
  }
}

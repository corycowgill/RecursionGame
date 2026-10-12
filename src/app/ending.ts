import type { ActorState, LevelDefinition, SimView } from '../engine/contracts';
import { dir8FromMove } from '../engine/contracts';
import type { CampaignProgress } from '../levels/progression';

/**
 * THE ENDING (round 5, narrative & release). After the final chamber (L10 The Core) is completed, the app plays a
 * short in-engine ending on top of the finished chamber, then rolls the credits, then returns to the main menu:
 *
 *   levelComplete (L10) ─► [COMPLETE_CARD_MS] ─► ending: camera pulls back over the Core, the echoes walk into the
 *   player, a few lines of text, fade to white ─► credits (roll) ─► main menu
 *
 * Everything here is PRESENTATION ONLY. The simulation has already stopped (`status === 'complete'`); the ending
 * shows a derived copy of that final state (`convergeView`) the same way the rewind playback and the hidden-echo
 * filter do. Nothing is written back into the TemporalGame.
 *
 * The ending is skippable by any fresh input on any device (key, click/tap, controller button). Skipping fades to
 * white quickly and goes straight to the credits. A short grace period ignores input left over from the winning
 * run (a key or button still held when the chamber completed only produces repeats, which are ignored anyway).
 */

/** The ending's text, in order. Kept here (not in a level) so it never changes a level fingerprint. */
export const ENDING_LINES: readonly string[] = [
  'The echoes come home.',
  'There was never a crew. Only you, loop after loop, until the Core held.',
  'LOG 000 · Loop closed. Recording ends.',
];

/** Seconds. All ending timing lives in this table so the UI, camera and tests agree. */
export const ENDING_TIMING = {
  /** Camera framing zoom ramps from 1 to PULLBACK_ZOOM over this window (follow camera on the player). */
  pullback: [0, 4.5] as const,
  /** The camera hands over to the whole-chamber overview shot at this time. */
  overviewAt: 4.5,
  /** Echoes walk into the player over this window. */
  converge: [0.8, 4.6] as const,
  /** Line i starts fading in at lines[0] + i * lines[1]; each fade takes lineFade. */
  lines: [5.0, 2.3] as const,
  lineFade: 0.9,
  /** Fade to white. */
  white: [12.4, 14.2] as const,
  /** Sequence ends (credits start). */
  end: 14.6,
  /** A skip fades the rest of the way to white in this long. */
  skipFade: 0.4,
  /** Input during the first moments is ignored (leftovers from the winning run). */
  skipGrace: 0.5,
};

export const PULLBACK_ZOOM = 2;

export interface EndingFrame {
  /** Seconds since the ending started. */
  t: number;
  /** Renderer framing zoom (follow distance multiplier, 1..PULLBACK_ZOOM). */
  zoom: number;
  /** Camera in the whole-chamber overview mode (else follow). */
  overview: boolean;
  /** 0..1: how far the echoes have walked into the player (1 = merged, no longer drawn). */
  converge: number;
  /** Opacity 0..1 of each ENDING_LINES entry. */
  lines: number[];
  /** White fade 0..1. */
  white: number;
  /** The sequence is over; roll the credits. */
  done: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * The ending's state at time `t` (pure). With `reduced` motion the camera does not travel: it cuts to the overview
 * at once and the echoes converge without the long walk.
 */
export function endingFrame(t: number, opts: { reduced?: boolean; skippedAt?: number | null } = {}): EndingFrame {
  const T = ENDING_TIMING;
  const reduced = !!opts.reduced;
  const zoom = reduced ? 1 : 1 + (PULLBACK_ZOOM - 1) * smooth(span(t, T.pullback[0], T.pullback[1]));
  const overview = reduced || t >= T.overviewAt;
  const converge = smooth(span(t, T.converge[0], reduced ? T.converge[0] + 1.2 : T.converge[1]));
  const lines = ENDING_LINES.map((_, i) => smooth(span(t, T.lines[0] + i * T.lines[1], T.lines[0] + i * T.lines[1] + T.lineFade)));
  let white = smooth(span(t, T.white[0], T.white[1]));
  let done = t >= T.end;
  const s = opts.skippedAt;
  if (s !== null && s !== undefined) {
    const k = span(t, s, s + T.skipFade);
    white = Math.max(white, white + (1 - white) * k);
    done = done || t >= s + T.skipFade;
  }
  return { t, zoom, overview, converge, lines, white, done };
}

/**
 * Presentation copy of the final state with every echo (and nested-loop copy) moved `k` (0..1) of the way into the
 * player. At k >= 1 the echoes are gone: only the player remains. Never mutates `view`.
 */
export function convergeView(view: SimView, k: number): SimView {
  const player = view.actors.find((a) => a.kind === 'player');
  if (!player || k <= 0) return view;
  if (k >= 1) return { ...view, actors: view.actors.filter((a) => a.kind === 'player') } as SimView;
  const actors = view.actors.map((a) => {
    if (a.kind !== 'echo') return a;
    const dx = player.x - a.x;
    const dz = player.z - a.z;
    const moved = Math.abs(dx) + Math.abs(dz) > 200;
    const heading = moved ? (dir8FromMove(Math.abs(dx) > 200 ? dx : 0, Math.abs(dz) > 200 ? dz : 0) ?? a.heading) : a.heading;
    const out: ActorState = {
      ...(a as ActorState),
      x: Math.round(a.x + dx * k),
      y: Math.round(a.y + (player.y - a.y) * k),
      z: Math.round(a.z + dz * k),
      moving: moved && k < 0.97,
      heading,
    };
    return out;
  });
  return { ...view, actors } as SimView;
}

/** The last campaign level (the one whose completion plays the ending). */
export function isFinalChamber(levels: readonly LevelDefinition[], levelId: string): boolean {
  const last = levels[levels.length - 1];
  return !!last && last.id === levelId;
}

/** The campaign has been finished at least once: the ending and credits can be replayed from level select. */
export function campaignComplete(levels: readonly LevelDefinition[], progress: CampaignProgress): boolean {
  const last = levels[levels.length - 1];
  return !!last && (progress.records[last.id]?.completions ?? 0) > 0;
}

/**
 * After completing `levelId`: play the ending automatically? Only on the FIRST clear of the final chamber; later
 * clears show the results card with a "Watch ending" button instead (so chasing stars is not slowed down).
 */
export function autoPlayEnding(levels: readonly LevelDefinition[], levelId: string, firstClear: boolean): boolean {
  return firstClear && isFinalChamber(levels, levelId);
}

// ------------------------------------------------------------------------------------------------------------------

export type EndingStage = 'idle' | 'ending' | 'credits';

/** What the ending flow needs from the app (UI screens, menu return). Faked in tests. */
export interface EndingFlowDeps {
  /** Shows the ending overlay; the returned view receives one frame per update. `skip` is wired to every device. */
  showEnding(skip: () => void): { render(frame: EndingFrame): void };
  /** Shows the rolling credits after the ending; `exit` returns to the menu. */
  showCredits(exit: () => void): void;
  /** Leave the credits for the main menu. */
  toMenu(): void;
  reducedMotion(): boolean;
}

/**
 * Ending → credits → menu state machine. The app calls `start()` when the final chamber's ending should play, and
 * `update(dt)` once per frame while `stage === 'ending'` (the returned frame drives camera framing and the derived
 * view). Pure apart from the injected deps.
 */
export class EndingFlow {
  stage: EndingStage = 'idle';
  private t = 0;
  private skippedAt: number | null = null;
  private view: { render(frame: EndingFrame): void } | null = null;
  private last: EndingFrame | null = null;

  constructor(private readonly deps: EndingFlowDeps) {}

  get time(): number {
    return this.t;
  }

  get skipped(): boolean {
    return this.skippedAt !== null;
  }

  /** Last computed frame (null before the first update). */
  get frame(): EndingFrame | null {
    return this.last;
  }

  start(): void {
    this.stage = 'ending';
    this.t = 0;
    this.skippedAt = null;
    this.last = null;
    this.view = this.deps.showEnding(() => this.skip());
  }

  /** Any input: fade out quickly and roll the credits. Returns false when ignored (grace period, wrong stage). */
  skip(): boolean {
    if (this.stage !== 'ending' || this.skippedAt !== null) return false;
    if (this.t < ENDING_TIMING.skipGrace) return false;
    this.skippedAt = this.t;
    return true;
  }

  update(dt: number): EndingFrame | null {
    if (this.stage !== 'ending') return null;
    this.t += Math.max(0, Math.min(0.25, dt));
    const f = endingFrame(this.t, { reduced: this.deps.reducedMotion(), skippedAt: this.skippedAt });
    this.last = f;
    this.view?.render(f);
    if (f.done) {
      this.stage = 'credits';
      this.view = null;
      this.deps.showCredits(() => this.exitCredits());
    }
    return f;
  }

  /** Credits finished or dismissed: back to the main menu. */
  exitCredits(): void {
    if (this.stage !== 'credits') return;
    this.stage = 'idle';
    this.deps.toMenu();
  }

  /** Abandon the sequence without side effects (e.g. the app loads another level). */
  cancel(): void {
    this.stage = 'idle';
    this.view = null;
  }
}

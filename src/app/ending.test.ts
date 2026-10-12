import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, type LevelDefinition, type SimEvent, type SimView } from '../engine/contracts';
import { TemporalGame } from '../engine/temporal/TemporalGame';
import { createDefaultRegistry } from '../gameplay/entities';
import { completionFromEvents } from '../gameplay/puzzles/completion';
import { LEVELS } from '../levels';
import { emptyProgress, recordCompletion } from '../levels/progression';
import {
  autoPlayEnding,
  campaignComplete,
  convergeView,
  ENDING_LINES,
  ENDING_TIMING,
  EndingFlow,
  endingFrame,
  isFinalChamber,
  PULLBACK_ZOOM,
  type EndingFrame,
} from './ending';
import { solutionFor } from './solutions';

const FINAL = LEVELS[LEVELS.length - 1] as LevelDefinition;

/** Plays the final chamber's verified solution through the public game API; returns the game and every event. */
function completeFinalChamber(): { game: TemporalGame; events: SimEvent[] } {
  const game = new TemporalGame(createDefaultRegistry());
  game.loadLevel(FINAL);
  const sol = solutionFor(FINAL);
  game.setLoops(sol.echoes);
  game.drainEvents();
  const events: SimEvent[] = [];
  for (let i = 0; i <= FINAL.loopDurationTicks && game.getState().status === 'playing'; i++) {
    const t = game.getState().tick;
    events.push(...game.step(sol.final[t] ?? { ...IDLE_INPUT, tick: t }).events);
  }
  return { game, events };
}

/** EndingFlow wired to recording fakes (the app wires the real UI, renderer and menu). */
function fakeFlow(reduced = false) {
  const log: string[] = [];
  const frames: EndingFrame[] = [];
  let skip: (() => void) | null = null;
  let exit: (() => void) | null = null;
  const flow = new EndingFlow({
    showEnding: (s) => {
      log.push('ending');
      skip = s;
      return { render: (f) => frames.push(f) };
    },
    showCredits: (x) => {
      log.push('credits');
      exit = x;
    },
    toMenu: () => log.push('menu'),
    reducedMotion: () => reduced,
  });
  return { flow, log, frames, skip: () => skip?.(), exit: () => exit?.() };
}

/** Advances the flow at 60 fps until `pred` holds (or the time budget runs out). */
function runUntil(flow: EndingFlow, pred: () => boolean, seconds = 30): void {
  for (let i = 0; i < seconds * 60 && !pred(); i++) flow.update(1 / 60);
}

describe('ending: L10 complete -> ending -> credits -> menu', () => {
  it('only the final campaign chamber plays the ending, automatically on its first clear', () => {
    expect(FINAL.id).toBe('L10-the-core');
    expect(isFinalChamber(LEVELS, FINAL.id)).toBe(true);
    expect(isFinalChamber(LEVELS, LEVELS[8]!.id)).toBe(false);
    expect(autoPlayEnding(LEVELS, FINAL.id, true)).toBe(true);
    expect(autoPlayEnding(LEVELS, FINAL.id, false)).toBe(false); // repeat clear: results card + "Watch ending"
    expect(autoPlayEnding(LEVELS, LEVELS[0]!.id, true)).toBe(false);
  });

  it('completing L10 with its verified solution yields a first clear that triggers the ending and unlocks its replay', () => {
    const { game, events } = completeFinalChamber();
    expect(game.getState().status).toBe('complete');
    const result = completionFromEvents(FINAL, events);
    expect(result).not.toBeNull();
    let progress = emptyProgress();
    expect(campaignComplete(LEVELS, progress)).toBe(false);
    const firstClear = (progress.records[FINAL.id]?.completions ?? 0) === 0;
    progress = recordCompletion(progress, result!);
    expect(autoPlayEnding(LEVELS, result!.levelId, firstClear)).toBe(true);
    // saved progress is what lets level select replay the ending and credits later
    expect(campaignComplete(LEVELS, progress)).toBe(true);
  });

  it('plays the whole sequence: ending frames, then credits, then the main menu on exit', () => {
    const { flow, log, frames, exit } = fakeFlow();
    flow.start();
    expect(flow.stage).toBe('ending');
    expect(log).toEqual(['ending']);
    runUntil(flow, () => flow.stage !== 'ending');
    expect(flow.stage).toBe('credits');
    expect(log).toEqual(['ending', 'credits']);
    expect(flow.time).toBeGreaterThanOrEqual(ENDING_TIMING.end);
    // the overlay saw every line fade in and the fade to white complete
    const lastFrame = frames[frames.length - 1]!;
    expect(lastFrame.done).toBe(true);
    expect(lastFrame.white).toBeCloseTo(1, 5);
    expect(lastFrame.lines.every((a) => a > 0.999)).toBe(true);
    expect(frames.some((f) => f.lines.every((a) => a > 0.999) && f.white === 0)).toBe(true); // text readable before the white
    expect(flow.update(1 / 60)).toBeNull(); // no frames once the credits roll
    exit();
    expect(flow.stage).toBe('idle');
    expect(log).toEqual(['ending', 'credits', 'menu']);
    exit(); // a second exit is ignored
    expect(log).toEqual(['ending', 'credits', 'menu']);
  });

  it('skip works: any input after the grace period fades out quickly and rolls the credits', () => {
    const { flow, log, skip } = fakeFlow();
    flow.start();
    flow.update(0.2);
    skip(); // leftover input from the winning run: ignored
    expect(flow.skipped).toBe(false);
    runUntil(flow, () => flow.time >= ENDING_TIMING.skipGrace + 0.05);
    skip();
    expect(flow.skipped).toBe(true);
    const at = flow.time;
    expect(flow.skip()).toBe(false); // idempotent
    runUntil(flow, () => flow.stage !== 'ending');
    expect(flow.stage).toBe('credits');
    expect(flow.time - at).toBeLessThanOrEqual(ENDING_TIMING.skipFade + 1 / 30);
    expect(flow.frame!.white).toBeCloseTo(1, 5);
    expect(log).toEqual(['ending', 'credits']);
  });

  it('skip is ignored outside the ending; cancel abandons it without opening the credits', () => {
    const { flow, log } = fakeFlow();
    expect(flow.skip()).toBe(false);
    flow.start();
    flow.update(1);
    flow.cancel();
    expect(flow.stage).toBe('idle');
    runUntil(flow, () => false, 1);
    expect(log).toEqual(['ending']);
  });
});

describe('ending timeline', () => {
  it('pulls the camera back, converges the echoes, shows each line in turn, then fades to white', () => {
    const f0 = endingFrame(0);
    expect(f0).toMatchObject({ zoom: 1, overview: false, converge: 0, white: 0, done: false });
    expect(f0.lines).toEqual(ENDING_LINES.map(() => 0));
    const mid = endingFrame(2.5);
    expect(mid.zoom).toBeGreaterThan(1);
    expect(mid.zoom).toBeLessThan(PULLBACK_ZOOM);
    expect(mid.converge).toBeGreaterThan(0);
    expect(mid.converge).toBeLessThan(1);
    const wide = endingFrame(ENDING_TIMING.overviewAt + 0.1);
    expect(wide.overview).toBe(true);
    expect(wide.zoom).toBeCloseTo(PULLBACK_ZOOM, 5);
    expect(wide.converge).toBe(1);
    // lines appear in order
    const t1 = ENDING_TIMING.lines[0] + ENDING_TIMING.lines[1] + 0.2;
    const f1 = endingFrame(t1);
    expect(f1.lines[0]).toBe(1);
    expect(f1.lines[1]).toBeGreaterThan(0);
    expect(f1.lines[2]).toBe(0);
    expect(endingFrame(ENDING_TIMING.white[1]).white).toBe(1);
    expect(endingFrame(ENDING_TIMING.end).done).toBe(true);
    // monotonic white fade
    let prev = 0;
    for (let t = 0; t <= ENDING_TIMING.end; t += 0.1) {
      const w = endingFrame(t).white;
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it('reduced motion: no camera travel (straight to the overview), same text timing', () => {
    const f = endingFrame(1, { reduced: true });
    expect(f.zoom).toBe(1);
    expect(f.overview).toBe(true);
    expect(endingFrame(7, { reduced: true }).lines).toEqual(endingFrame(7).lines);
  });

  it('the ending text is short, and its log line uses the story log convention', () => {
    expect(ENDING_LINES.length).toBeGreaterThanOrEqual(2);
    expect(ENDING_LINES.length).toBeLessThanOrEqual(4);
    for (const l of ENDING_LINES) expect(l.length).toBeLessThanOrEqual(90);
    expect(ENDING_LINES.some((l) => /^LOG \w+ · /.test(l))).toBe(true);
  });
});

describe('convergeView (presentation only)', () => {
  it('walks every echo into the player on a copy of the finished L10 state, then leaves only the player', () => {
    const { game } = completeFinalChamber();
    const view = game.getState() as SimView;
    const hash = game.hash();
    const player = view.actors.find((a) => a.kind === 'player')!;
    const echoes = view.actors.filter((a) => a.kind === 'echo');
    expect(echoes.length).toBe(FINAL.solution.length - 1);
    expect(convergeView(view, 0)).toBe(view);
    const half = convergeView(view, 0.5);
    for (const e of echoes) {
      const h = half.actors.find((a) => a.id === e.id)!;
      expect(h.x).toBe(Math.round(e.x + (player.x - e.x) * 0.5));
      expect(h.z).toBe(Math.round(e.z + (player.z - e.z) * 0.5));
    }
    expect(half.actors.find((a) => a.kind === 'player')).toEqual(player);
    const merged = convergeView(view, 1);
    expect(merged.actors.map((a) => a.kind)).toEqual(['player']);
    // the live state is untouched
    expect(game.hash()).toBe(hash);
    expect(view.actors.filter((a) => a.kind === 'echo')).toHaveLength(echoes.length);
  });
});

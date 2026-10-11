import type { InputScript, LevelDefinition, ScriptStep } from '../../engine/contracts';
import { runScripts } from '../harness/harness';

/**
 * TIMING SLACK — how precisely does a player have to time the intended solution?
 *
 * For every timing parameter of the level's known solution (each `waitUntil` tick and each non-trailing `wait`
 * length, in every loop) we sweep the value while keeping everything else fixed and find the contiguous window of
 * values around the authored one for which the solution still completes (through the real TemporalGame, via
 * runScripts). The window width in ticks is the slack a human has for that moment; the level's tightest window is
 * its timing demand. Closed-loop steps (moveTo waits at doors by pushing) adapt by themselves and have no parameter.
 */

export interface TimingParam {
  loop: number;
  step: number;
  op: 'waitUntil' | 'wait';
  authored: number;
  /** Smallest / largest value (inclusive) of the contiguous working window around `authored`. */
  lo: number;
  hi: number;
  /**
   * waitUntil only: the tick at which the loop reaches this step in the authored run. Any value at or below it is
   * the same as "act on arrival", so the window that a human actually has to hit starts at max(lo, reached).
   */
  reached: number;
  /** hi - max(lo, reached) + 1, in ticks. `capped` when the sweep hit its limit (the window is at least this wide). */
  width: number;
  capped: boolean;
}

export interface SlackReport {
  levelId: string;
  params: TimingParam[];
  /** Narrowest window among the parameters (null when the solution has no timing parameter). */
  tightest: TimingParam | null;
  runs: number;
}

function withValue(scripts: readonly InputScript[], loop: number, step: number, value: number): InputScript[] {
  return scripts.map((s, i) =>
    i !== loop
      ? s
      : s.map((st, j): ScriptStep => {
          if (j !== step) return st;
          if (st.op === 'waitUntil') return { op: 'waitUntil', tick: value };
          if (st.op === 'wait') return { op: 'wait', ticks: value };
          return st;
        }),
  );
}

export interface SlackOptions {
  /** How far to sweep on each side of the authored value, in ticks. default 600 */
  range?: number;
  /** Coarse scan step before bisecting an edge. default 8 */
  coarse?: number;
}

export function timingSlack(level: LevelDefinition, opts: SlackOptions = {}): SlackReport {
  const range = opts.range ?? 600;
  const coarse = opts.coarse ?? 8;
  let runs = 0;
  const works = (scripts: InputScript[]): boolean => {
    runs++;
    try {
      const r = runScripts(level, scripts, { recordHashes: false });
      return r.completed && r.passes.every((p) => !p.timedOut);
    } catch {
      return false;
    }
  };
  const base = level.solution;
  const params: TimingParam[] = [];
  base.forEach((script, loop) => {
    script.forEach((st, step) => {
      if (st.op !== 'waitUntil' && st.op !== 'wait') return;
      if (step === script.length - 1) return; // trailing wait: never matters
      const authored = st.op === 'waitUntil' ? st.tick : st.ticks;
      const ok = (v: number): boolean => v >= 0 && works(withValue(base, loop, step, v));
      // scan outward coarsely, then bisect the edge to one tick
      const edge = (dir: -1 | 1): { v: number; capped: boolean } => {
        let good = authored;
        let probe = authored + dir * coarse;
        while (Math.abs(probe - authored) <= range && ok(probe)) {
          good = probe;
          probe += dir * coarse;
        }
        if (Math.abs(probe - authored) > range) return { v: good, capped: true };
        let bad = probe;
        while (Math.abs(bad - good) > 1) {
          const mid = Math.trunc((good + bad) / 2);
          if (ok(mid)) good = mid;
          else bad = mid;
        }
        return { v: good, capped: false };
      };
      const lo = edge(-1);
      const hi = edge(1);
      let reached = 0;
      if (st.op === 'waitUntil') {
        // smallest v whose compiled loop differs from "waitUntil 0" = first tick the step can delay anything
        const inputsOf = (v: number): string => {
          runs++;
          const r = runScripts(level, withValue(base, loop, step, v), { recordHashes: false });
          return JSON.stringify(r.loops[loop]?.inputs.map((p) => [p.moveX, p.moveY, p.interactPressed]) ?? []);
        };
        const ref = inputsOf(0);
        let a = 0;
        let b = authored;
        if (inputsOf(b) === ref) reached = authored;
        else {
          while (b - a > 1) {
            const m = Math.trunc((a + b) / 2);
            if (inputsOf(m) === ref) a = m;
            else b = m;
          }
          reached = a;
        }
      }
      const effLo = Math.max(lo.v, reached);
      params.push({
        loop,
        step,
        op: st.op,
        authored,
        lo: lo.v,
        hi: hi.v,
        reached,
        width: hi.v - effLo + 1,
        capped: hi.capped || (lo.capped && lo.v > reached),
      });
    });
  });
  const real = params.filter((p) => !p.capped || p.width < 2 * range);
  const tightest = real.reduce<TimingParam | null>((m, p) => (m === null || p.width < m.width ? p : m), null);
  return { levelId: level.id, params, tightest, runs };
}

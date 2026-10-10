import {
  DIR4_DX,
  DIR4_DZ,
  PHYS,
  cellCenter,
  signInt,
  type InputScript,
  type PlayerInput,
  type ScriptStep,
  type SimView,
} from '../../engine/contracts';

/** Arrival tolerance for moveTo (half a straight step, so the controller never oscillates). */
export const MOVE_TO_TOLERANCE = PHYS.ACTOR_SPEED / 2;
const DEFAULT_MOVE_TIMEOUT = 1200;

const idle = (tick: number): PlayerInput => ({
  tick,
  moveX: 0,
  moveY: 0,
  interactPressed: false,
  interactHeld: false,
  actionPressed: false,
});

/**
 * ScriptRunner — closed-loop executor for an InputScript. Call `next(view)` once per tick with the CURRENT
 * state; it returns the input for this tick, or null when the script is finished. moveTo steers toward the
 * cell centre using the live player position, like a human would.
 */
export class ScriptRunner {
  private index = 0;
  private stepTicks = 0;
  /** Set when a moveTo exceeded its timeout (the step is abandoned and the script continues). */
  timedOut: { step: number; op: ScriptStep } | null = null;

  constructor(private readonly script: InputScript) {}

  get done(): boolean {
    return this.index >= this.script.length;
  }

  next(view: SimView): PlayerInput | null {
    const tick = view.tick;
    const player = view.actors[view.actors.length - 1];
    while (this.index < this.script.length) {
      const step = this.script[this.index] as ScriptStep;
      const input = this.run(step, tick, view, player);
      if (input) {
        this.stepTicks++;
        return input;
      }
      this.index++;
      this.stepTicks = 0;
    }
    return null;
  }

  /** Returns the input for this tick, or null if `step` is complete (advance to next step). */
  private run(step: ScriptStep, tick: number, _view: SimView, player: SimView['actors'][number] | undefined): PlayerInput | null {
    switch (step.op) {
      case 'wait':
        return this.stepTicks < step.ticks ? idle(tick) : null;
      case 'waitUntil':
        return tick < step.tick ? idle(tick) : null;
      case 'move':
        return this.stepTicks < step.ticks ? { ...idle(tick), moveX: step.dx, moveY: step.dz } : null;
      case 'face': {
        if (this.stepTicks >= 1) return null;
        const dx = (DIR4_DX[step.dir] ?? 0) as -1 | 0 | 1;
        const dz = (DIR4_DZ[step.dir] ?? 0) as -1 | 0 | 1;
        return { ...idle(tick), moveX: dx, moveY: dz };
      }
      case 'interact':
        return this.stepTicks < 1 ? { ...idle(tick), interactPressed: true, interactHeld: true } : null;
      case 'action':
        return this.stepTicks < 1 ? { ...idle(tick), actionPressed: true } : null;
      case 'hold':
        return this.stepTicks < step.ticks
          ? { ...idle(tick), interactPressed: this.stepTicks === 0, interactHeld: true }
          : null;
      case 'moveTo': {
        if (!player) return null;
        const c = cellCenter(step.col, step.row);
        const dx = c.x - player.x;
        const dz = c.z - player.z;
        const mx = Math.abs(dx) > MOVE_TO_TOLERANCE ? signInt(dx) : 0;
        const mz = Math.abs(dz) > MOVE_TO_TOLERANCE ? signInt(dz) : 0;
        if (mx === 0 && mz === 0) return null;
        if (this.stepTicks >= (step.timeoutTicks ?? DEFAULT_MOVE_TIMEOUT)) {
          this.timedOut = { step: this.index, op: step };
          return null;
        }
        return { ...idle(tick), moveX: mx, moveY: mz };
      }
      default:
        return null;
    }
  }
}

/**
 * Open-loop input sequence builder for tests: `inputs().move(1,0,30).wait(10).interact().build()`.
 * Produces a dense PlayerInput[] (tick = index) suitable for TemporalLoop.inputs.
 */
export class InputSequenceBuilder {
  private readonly out: PlayerInput[] = [];

  private push(p: Omit<PlayerInput, 'tick'>): void {
    this.out.push({ ...p, tick: this.out.length });
  }

  move(dx: -1 | 0 | 1, dz: -1 | 0 | 1, ticks: number): this {
    for (let i = 0; i < ticks; i++)
      this.push({ moveX: dx, moveY: dz, interactPressed: false, interactHeld: false, actionPressed: false });
    return this;
  }

  wait(ticks: number): this {
    return this.move(0, 0, ticks);
  }

  interact(): this {
    this.push({ moveX: 0, moveY: 0, interactPressed: true, interactHeld: true, actionPressed: false });
    return this;
  }

  action(): this {
    this.push({ moveX: 0, moveY: 0, interactPressed: false, interactHeld: false, actionPressed: true });
    return this;
  }

  build(): PlayerInput[] {
    return this.out.map((i) => ({ ...i }));
  }
}

export function inputs(): InputSequenceBuilder {
  return new InputSequenceBuilder();
}

/** Script-step shorthands for level authors: `S.moveTo(3,4)`, `S.wait(30)`, ... */
export const S = {
  moveTo: (col: number, row: number, timeoutTicks?: number): ScriptStep =>
    timeoutTicks === undefined ? { op: 'moveTo', col, row } : { op: 'moveTo', col, row, timeoutTicks },
  move: (dx: -1 | 0 | 1, dz: -1 | 0 | 1, ticks: number): ScriptStep => ({ op: 'move', dx, dz, ticks }),
  face: (dir: 0 | 1 | 2 | 3): ScriptStep => ({ op: 'face', dir }),
  wait: (ticks: number): ScriptStep => ({ op: 'wait', ticks }),
  waitUntil: (tick: number): ScriptStep => ({ op: 'waitUntil', tick }),
  interact: (): ScriptStep => ({ op: 'interact' }),
  action: (): ScriptStep => ({ op: 'action' }),
  hold: (ticks: number): ScriptStep => ({ op: 'hold', ticks }),
} as const;

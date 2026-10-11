import { IDLE_INPUT, type LevelDefinition, type PlayerInput, type SimState, type TemporalLoop } from '../../engine/contracts';
import { deepClone } from '../../engine/simulation/clone';
import type { EntityRegistry } from '../../engine/simulation/registry';
import { replayTracks, trackFinishedAt, trackInputAt, type ReplayTrack } from '../../engine/simulation/recursion';
import { LevelRuntimeImpl } from '../../engine/simulation/runtime';
import { hashState } from '../../engine/simulation/stateHash';
import { createInitialState, stepSim, type ActorFrame } from '../../engine/simulation/step';
import { Fnv1a } from '../../engine/simulation/hash';
import { createDefaultRegistry } from '../../gameplay/entities';

/**
 * SOLVER WORLD — a thin, fast driver over the AUTHORITATIVE simulation (createInitialState + stepSim, the very code
 * TemporalGame runs). It replays a fixed set of echo loops (including nested-loop copies via replayTracks) and lets
 * the search drive the live actor one tick at a time, cloning states at macro boundaries so search branches share
 * their prefix. It skips TemporalGame's bookkeeping (timeline, snapshots, divergence expectations), none of which
 * influences the world. Every solution the solver reports is re-verified through TemporalGame (see verify.ts).
 */

let sharedRegistry: EntityRegistry | null = null;
function registry(): EntityRegistry {
  sharedRegistry ??= createDefaultRegistry();
  return sharedRegistry;
}

export function makeInput(tick: number, moveX: -1 | 0 | 1, moveY: -1 | 0 | 1, interact = false): PlayerInput {
  return { tick, moveX, moveY, interactPressed: interact, interactHeld: interact, actionPressed: false };
}

export function loopFromInputs(id: number, inputs: readonly PlayerInput[]): TemporalLoop {
  return { id, durationTicks: inputs.length, inputs: inputs.map((p, t) => ({ ...p, tick: t })), outcomes: [] };
}

export class SolverWorld {
  readonly rt: LevelRuntimeImpl;
  readonly tracks: ReplayTrack[];
  /** Tick from which every echo (and copy) has replayed all of its inputs. */
  readonly echoesEndTick: number;
  /** Tick from which no echo input moves or presses anything any more (echoes may still be "playing" idle ticks). */
  readonly echoesActiveEndTick: number;
  private readonly frames: ActorFrame[];

  constructor(
    readonly level: LevelDefinition,
    readonly echoes: readonly TemporalLoop[],
  ) {
    this.rt = new LevelRuntimeImpl(level, registry());
    this.tracks = replayTracks(level, echoes);
    this.echoesEndTick = this.tracks.reduce((m, t) => Math.max(m, t.offset + t.loop.durationTicks), 0);
    this.echoesActiveEndTick = this.tracks.reduce((m, t) => {
      let last = -1;
      for (let i = t.loop.inputs.length - 1; i >= 0; i--) {
        const p = t.loop.inputs[i]!;
        if (p.moveX !== 0 || p.moveY !== 0 || p.interactPressed || p.actionPressed || p.interactHeld) {
          last = i;
          break;
        }
      }
      return Math.max(m, t.offset + last + 1);
    }, 0);
    this.frames = this.tracks.map(() => ({ input: IDLE_INPUT, replayFinished: false }));
    this.frames.push({ input: IDLE_INPUT });
  }

  initial(): SimState {
    return createInitialState(this.rt, this.echoes);
  }

  /** Advances one tick with the live actor's input. */
  step(state: SimState, input: PlayerInput): void {
    const tick = state.tick;
    for (let i = 0; i < this.tracks.length; i++) {
      const tr = this.tracks[i]!;
      const f = this.frames[i]!;
      f.input = trackInputAt(tr, tick);
      f.replayFinished = trackFinishedAt(tr, tick);
    }
    this.frames[this.tracks.length]!.input = input;
    stepSim(this.rt, state, this.frames, null);
  }

  clone(state: SimState): SimState {
    return deepClone(state);
  }

  hash(state: SimState): number {
    return hashState(this.rt, state);
  }

  /**
   * Fingerprint of everything that can still change on its own: entity states and signals plus every actor's
   * position (tick excluded). Two equal fingerprints with all echoes finished and the live actor idle mean the
   * world is quiescent: nothing will ever change again unless the live actor acts.
   */
  motionFingerprint(state: SimState): number {
    const h = new Fnv1a();
    for (const a of state.actors) {
      h.num(a.x);
      h.num(a.y);
      h.num(a.z);
      h.value(a.carrying);
    }
    for (const id of this.rt.entityOrder) {
      const e = state.entities[id]!;
      h.num(e.x);
      h.num(e.y);
      h.num(e.z);
      h.value(e.state);
      h.value(state.signals[id] === true);
    }
    return h.digest();
  }

  player(state: SimState): SimState['actors'][number] {
    return state.actors[state.actors.length - 1]!;
  }
}

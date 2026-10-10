import {
  IDLE_INPUT,
  echoActorId,
  recursiveEchoActorId,
  type ActorId,
  type LevelDefinition,
  type PlayerInput,
  type TemporalLoop,
} from '../contracts';

/**
 * NESTED LOOPS (LevelDefinition.recursion) — the single place that expands committed loops into the echo actors
 * that replay them. Shared by the initial-state builder (actor list) and TemporalGame (per-tick frames,
 * expectations, timeline) so the two can never disagree.
 *
 * Without `level.recursion` every loop yields exactly one track (offset 0): the classic echo.
 * With it, loop i yields its echo followed by `copies` recursive copies; copy k replays the same inputs delayed by
 * k * delayTicks. Processing order is therefore:
 *   loop0, loop0.copy1, ..., loop1, loop1.copy1, ..., player
 * (older recordings still act first; a copy acts right after the echo it repeats).
 */
export interface ReplayTrack {
  actorId: ActorId;
  loop: TemporalLoop;
  /** Index of the loop in the loop list (= ActorState.echoIndex). */
  loopIndex: number;
  /** 0 = the echo itself, k >= 1 = recursive copy k. */
  depth: number;
  /** Ticks this track's replay is delayed by (depth * delayTicks). */
  offset: number;
}

/** Number of recursive copies per loop for this level (0 when the level has no Recursion Engine). */
export function recursionCopies(level: LevelDefinition): number {
  const r = level.recursion;
  if (!r || !(r.delayTicks > 0)) return 0;
  return Math.max(0, Math.floor(r.copies ?? 1));
}

export function replayTracks(level: LevelDefinition, loops: readonly TemporalLoop[]): ReplayTrack[] {
  const copies = recursionCopies(level);
  const delay = copies > 0 ? Math.floor(level.recursion?.delayTicks ?? 0) : 0;
  const out: ReplayTrack[] = [];
  loops.forEach((loop, loopIndex) => {
    out.push({ actorId: echoActorId(loop.id), loop, loopIndex, depth: 0, offset: 0 });
    for (let k = 1; k <= copies; k++) {
      out.push({ actorId: recursiveEchoActorId(loop.id, k), loop, loopIndex, depth: k, offset: k * delay });
    }
  });
  return out;
}

/** Input a track applies on absolute pass tick `tick` (idle before its offset and after its recording). */
export function trackInputAt(track: ReplayTrack, tick: number): PlayerInput {
  const local = tick - track.offset;
  if (local < 0 || local >= track.loop.durationTicks) return IDLE_INPUT;
  return track.loop.inputs[local] ?? IDLE_INPUT;
}

/** True once the track has replayed every input (tick >= offset + durationTicks). */
export function trackFinishedAt(track: ReplayTrack, tick: number): boolean {
  return tick >= track.offset + track.loop.durationTicks;
}

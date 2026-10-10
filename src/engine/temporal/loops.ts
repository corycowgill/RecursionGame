import { sanitizeInput, type PlayerInput, type RecordedInteraction, type TemporalLoop } from '../contracts';

/**
 * Compact, JSON-friendly loop encoding for persistence/replays: inputs are run-length encoded as
 * [runLength, packedBits] pairs. packed = (moveX+1) | (moveY+1)<<2 | interactPressed<<4 | interactHeld<<5 |
 * actionPressed<<6.
 */
export interface EncodedLoop {
  v: 1;
  id: number;
  durationTicks: number;
  runs: number[];
  outcomes: RecordedInteraction[];
}

export function packInput(i: PlayerInput): number {
  return (
    (i.moveX + 1) |
    ((i.moveY + 1) << 2) |
    (i.interactPressed ? 16 : 0) |
    (i.interactHeld ? 32 : 0) |
    (i.actionPressed ? 64 : 0)
  );
}

export function unpackInput(p: number, tick: number): PlayerInput {
  return {
    tick,
    moveX: ((p & 3) - 1) as -1 | 0 | 1,
    moveY: (((p >> 2) & 3) - 1) as -1 | 0 | 1,
    interactPressed: (p & 16) !== 0,
    interactHeld: (p & 32) !== 0,
    actionPressed: (p & 64) !== 0,
  };
}

export function encodeLoop(loop: TemporalLoop): EncodedLoop {
  const runs: number[] = [];
  let prev = -1;
  let count = 0;
  for (const input of loop.inputs) {
    const p = packInput(input);
    if (p === prev) count++;
    else {
      if (count > 0) runs.push(count, prev);
      prev = p;
      count = 1;
    }
  }
  if (count > 0) runs.push(count, prev);
  return { v: 1, id: loop.id, durationTicks: loop.durationTicks, runs, outcomes: loop.outcomes.map((o) => ({ ...o })) };
}

export function decodeLoop(enc: EncodedLoop): TemporalLoop {
  const inputs: PlayerInput[] = [];
  for (let i = 0; i + 1 < enc.runs.length; i += 2) {
    const n = enc.runs[i] ?? 0;
    const p = enc.runs[i + 1] ?? 0;
    for (let k = 0; k < n; k++) inputs.push(unpackInput(p, inputs.length));
  }
  if (inputs.length !== enc.durationTicks)
    throw new Error(`decodeLoop: ${inputs.length} inputs but durationTicks=${enc.durationTicks}`);
  return { id: enc.id, durationTicks: enc.durationTicks, inputs, outcomes: enc.outcomes.map((o) => ({ ...o })) };
}

/** Deep-copies and sanitizes a loop (ticks rewritten to indices). */
export function cloneLoop(loop: TemporalLoop): TemporalLoop {
  return {
    id: loop.id,
    durationTicks: loop.inputs.length,
    inputs: loop.inputs.map((inp, t) => sanitizeInput(inp, t)),
    outcomes: loop.outcomes.map((o) => ({ ...o })),
  };
}

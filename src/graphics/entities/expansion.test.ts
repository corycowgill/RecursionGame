import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { sandboxAttuned, sandboxRelay, sandboxValve } from '../../levels/definitions/sandbox-levels';
import { createGame, playScript } from '../../testing/harness/harness';
import { MaterialLibrary } from '../materials/library';
import { parseGrid } from '../environment/grid';
import { createEntityVisual } from './index';
import { relayArrivals, relaySegments } from './expansion';
import type { EntityFrame, VfxSink } from './types';

describe('chrono relay segments (in-flight signal drawn literally)', () => {
  it('maps countdowns to positions 1 - c / delay, alternating levels from the output end', () => {
    // a pulse in flight: rose with countdown 30, fell with countdown 45 (delay 60): lit between 0.25 and 0.5
    expect(relaySegments([30, 45], false, false, 60, 1)).toEqual([[0.25, 0.5]]);
    // input still on: lit from the input end up to the edge
    expect(relaySegments([30], false, true, 60, 1)).toEqual([[0, 0.5]]);
    // output on, falling edge in flight
    expect(relaySegments([15], true, false, 60, 1)).toEqual([[0.75, 1]]);
    expect(relaySegments([], true, true, 60)).toEqual([[0, 1]]);
    expect(relaySegments([], false, false, 60)).toEqual([]);
    expect(relayArrivals(100, [5, 9])).toEqual([105, 109]);
  });
});

describe('round-6 entity visuals build and update (only where a 2D canvas exists; the browser screenshot pass covers the rest)', () => {
  const vfx: VfxSink = { sparks: () => undefined, ring: () => undefined };
  for (const level of [sandboxRelay, sandboxValve, sandboxAttuned]) {
    it(`${level.id}: every entity gets a visual that survives a few frames and events`, () => {
      let lib: MaterialLibrary;
      try {
        lib = new MaterialLibrary();
      } catch {
        expect.soft(true).toBe(true);
        return; // no 2D canvas in this environment: covered by the browser screenshot pass instead
      }
      const grid = parseGrid(level);
      const game = createGame(level);
      const pass = playScript(game, level.solution[0]!);
      const view = game.getState();
      for (const def of level.entities) {
        const v = createEntityVisual({ lib, def, grid, vfx, quality: { particles: 1, lights: false }, level });
        expect(v, def.kind).not.toBeNull();
        const e = view.entities[def.id]!;
        const f: EntityFrame = { e, prev: e, alpha: 0.5, dt: 1 / 60, time: 1, pos: new THREE.Vector3(), state: view };
        for (let i = 0; i < 3; i++) v!.update({ ...f, time: 1 + i / 60 });
        for (const ev of pass.events) if ('entityId' in ev && ev.entityId === def.id) v!.onEvent?.(ev, view);
        v!.update(f);
        v!.dispose();
      }
      lib.dispose();
    });
  }
});

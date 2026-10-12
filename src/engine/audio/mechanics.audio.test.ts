import { describe, expect, it } from 'vitest';
import type { SimEvent, SimView } from '../contracts';
import { mapEvents } from './mapping';
import { RECIPES } from './sfx';

/** Round 6: the new mechanics' feedback events map to their own recipes (feedback only, never read by the sim). */
const VIEW = { tick: 0, status: 'playing', completedAtTick: null, rng: 1, actors: [], entities: {}, signals: {} } as unknown as SimView;
const ent = (name: string, extra: Partial<Extract<SimEvent, { type: 'entity' }>> = {}): SimEvent => ({ type: 'entity', tick: 1, name, entityId: 'x', ...extra });

describe('audio: round-6 mechanic cues', () => {
  it('valve, relay and glass events have dedicated recipes', () => {
    const cues = mapEvents([ent('valvePass', { actorId: 'player' }), ent('valveDenied', { actorId: 'echo:1' }), ent('valveFlip'), ent('relayArm'), ent('relayEmit', { value: 1 }), ent('shatter', { actorId: 'player' })], VIEW);
    expect(cues.map((c) => c.sound)).toEqual(['valvePass', 'valveDenied', 'valveFlip', 'relayArm', 'relayEmit', 'shatter']);
    for (const c of cues) expect(RECIPES[c.sound], c.sound).toBeDefined();
    expect(cues.find((c) => c.sound === 'relayEmit')!.params['rising']).toBe(1);
    expect(mapEvents([ent('relayEmit', { value: 0 })], VIEW)[0]!.params['rising']).toBe(0);
  });

  it("an attuned refusal plays the soft 'wrong timeline' tone instead of the failure buzz", () => {
    const att = mapEvents([{ type: 'interactFailed', tick: 1, actorId: 'player', entityId: 'sw', reason: 'attuned' }], VIEW);
    expect(att.map((c) => c.sound)).toEqual(['attunedFail']);
    const other = mapEvents([{ type: 'interactFailed', tick: 1, actorId: 'player', entityId: 'sw', reason: 'cooldown' }], VIEW);
    expect(other.map((c) => c.sound)).toEqual(['interactFailed']);
  });

  it('unknown generic entity events still fall back to the generic blip', () => {
    expect(mapEvents([ent('somethingElse')], VIEW).map((c) => c.sound)).toEqual(['entityGeneric']);
  });
});

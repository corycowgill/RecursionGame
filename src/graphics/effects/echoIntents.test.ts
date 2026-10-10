import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { unitsToWorld, type SimView, type Timeline, type TimelineTrack } from '../../engine/contracts';
import { EchoIntentLayer } from './echoIntents';

const marker = (tick: number, entityId: string | null) =>
  ({ tick, kind: 'use', verb: 'interact', entityId, entityKind: entityId ? 'timedSwitch' : null, success: true }) as const;

function track(actorId: string, echoIndex: number, ticks: number[]): TimelineTrack {
  return {
    actorId: actorId as TimelineTrack['actorId'],
    kind: 'echo',
    echoIndex,
    loopId: echoIndex + 1,
    durationTicks: 600,
    planned: ticks.map((t) => marker(t, 'sw1')),
    actual: [],
    divergences: [],
    finishedAtTick: null,
  };
}

const view = (tick: number, actors: string[]): SimView =>
  ({
    tick,
    status: 'playing',
    completedAtTick: null,
    rng: 1,
    actors: actors.map((id) => ({ id })),
    entities: { sw1: { id: 'sw1', kind: 'timedSwitch', x: 6 / unitsToWorld(1), y: 0, z: 4 / unitsToWorld(1) } },
    signals: {},
  }) as unknown as SimView;

const timeline = (tracks: TimelineTrack[]): Timeline => ({ levelId: 'L', currentTick: 0, maxTicks: 600, maxEchoes: 3, status: 'playing', tracks });

describe('EchoIntentLayer (in-world "which echo uses what, when")', () => {
  const cam = new THREE.PerspectiveCamera();
  const visible = (l: EchoIntentLayer) => l.group.children.filter((c) => c.visible);

  it('shows a badge over the target only inside the look-ahead window and briefly after the action', () => {
    const layer = new EchoIntentLayer(() => new THREE.Texture());
    layer.setTimeline(timeline([track('echo:1', 0, [400])]));
    layer.update(view(100, ['echo:1']), 'L', cam, 0);
    expect(visible(layer)).toHaveLength(0); // 300 ticks ahead: outside the 4 s window
    layer.update(view(300, ['echo:1']), 'L', cam, 0);
    const shown = visible(layer);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.position.x).toBeCloseTo(6, 3);
    expect(shown[0]!.position.z).toBeCloseTo(4, 3);
    expect(shown[0]!.position.y).toBeGreaterThan(2);
    layer.update(view(410, ['echo:1']), 'L', cam, 0);
    expect(visible(layer)).toHaveLength(1); // afterglow
    layer.update(view(460, ['echo:1']), 'L', cam, 0);
    expect(visible(layer)).toHaveLength(0);
  });

  it('ignores hidden echoes, other levels and the disabled state; stacks echoes sharing a target', () => {
    const layer = new EchoIntentLayer(() => new THREE.Texture());
    layer.setTimeline(timeline([track('echo:1', 0, [200]), track('echo:2', 1, [210])]));
    layer.update(view(150, ['echo:1', 'echo:2']), 'L', cam, 0);
    const shown = visible(layer);
    expect(shown).toHaveLength(2);
    expect(Math.abs(shown[0]!.position.y - shown[1]!.position.y)).toBeGreaterThan(0.5);
    layer.update(view(150, ['echo:2']), 'L', cam, 0);
    expect(visible(layer)).toHaveLength(1);
    layer.update(view(150, ['echo:1', 'echo:2']), 'OTHER', cam, 0);
    expect(visible(layer)).toHaveLength(0);
    layer.setEnabled(false);
    layer.update(view(150, ['echo:1', 'echo:2']), 'L', cam, 0);
    expect(visible(layer)).toHaveLength(0);
    layer.dispose();
  });
});

import { describe, expect, it } from 'vitest';
import type { Timeline, TimelineTrack } from '../../engine/contracts';
import { createGame, playScript } from '../../testing/harness/harness';
import { CAMPAIGN_LEVELS } from '../../levels/definitions';
import { compileSolution } from '../../testing/harness/harness';
import {
  buildTrackModels,
  computeViewport,
  contentFrac,
  contentTransform,
  cycleEchoSelection,
  formatClock,
  formatTicks,
  nextZoom,
  rulerStep,
  rulerTicks,
  scrubStep,
  tickAtViewFrac,
  tracksSignature,
  viewFrac,
} from './model';

const marker = (tick: number, kind: TimelineTrack['planned'][number]['kind'] = 'pickup', success = true) => ({
  tick,
  kind,
  verb: 'interact' as const,
  entityId: 'crate1',
  entityKind: 'crate' as const,
  success,
});

function fakeTimeline(): Timeline {
  return {
    levelId: 'L',
    currentTick: 300,
    maxTicks: 3600,
    maxEchoes: 3,
    status: 'playing',
    tracks: [
      {
        actorId: 'echo:4',
        kind: 'echo',
        echoIndex: 1,
        loopId: 4,
        durationTicks: 900,
        planned: [marker(100), marker(200, 'none'), marker(500, 'drop')],
        actual: [marker(100)],
        divergences: [],
        finishedAtTick: null,
      },
      {
        actorId: 'echo:2',
        kind: 'echo',
        echoIndex: 0,
        loopId: 2,
        durationTicks: 600,
        planned: [marker(50), marker(250, 'use')],
        actual: [marker(50), marker(250, 'fail', false)],
        divergences: [
          {
            tick: 250,
            actorId: 'echo:2',
            loopId: 2,
            echoIndex: 0,
            expected: { tick: 250, verb: 'interact', kind: 'use', entityId: 'sw' },
            actual: { tick: 250, verb: 'interact', kind: 'fail', entityId: 'sw', reason: 'busy' },
          },
        ],
        finishedAtTick: null,
      },
      {
        actorId: 'player',
        kind: 'player',
        echoIndex: -1,
        loopId: null,
        durationTicks: 300,
        planned: [marker(120, 'fail', false)],
        actual: [marker(120, 'fail', false)],
        divergences: [],
        finishedAtTick: null,
      },
    ],
  };
}

describe('timeline viewport math', () => {
  it('zoom 1 shows everything', () => {
    const vp = computeViewport(3600, 1, 1234);
    expect(vp).toEqual({ start: 0, span: 3600, maxTicks: 3600, zoom: 1 });
    expect(contentTransform(vp)).toEqual({ widthPct: 100, translatePct: -0 });
  });

  it('zoomed window follows the focus and clamps to the content', () => {
    const mid = computeViewport(3600, 4, 1800);
    expect(mid.span).toBe(900);
    expect(mid.start).toBeCloseTo(1800 - 900 * 0.35);
    expect(viewFrac(1800, mid)).toBeCloseTo(0.35);
    expect(computeViewport(3600, 4, 10).start).toBe(0);
    expect(computeViewport(3600, 4, 3590).start).toBe(2700);
    const tf = contentTransform(mid);
    expect(tf.widthPct).toBe(400);
    expect(tf.translatePct).toBeCloseTo(-(mid.start / 3600) * 100);
  });

  it('pointer fraction ↔ tick round-trips and clamps', () => {
    const vp = computeViewport(3600, 2, 1000);
    for (const t of [vp.start, vp.start + 123, vp.start + vp.span]) {
      expect(tickAtViewFrac(viewFrac(t, vp), vp)).toBe(Math.round(t));
    }
    expect(tickAtViewFrac(-0.5, vp)).toBe(Math.round(vp.start));
    expect(tickAtViewFrac(2, vp)).toBe(Math.round(vp.start + vp.span));
    expect(tickAtViewFrac(1, computeViewport(3600, 1, 0), 1000)).toBe(1000);
    expect(contentFrac(-5, 100)).toBe(0);
    expect(contentFrac(150, 100)).toBe(1);
  });

  it('cycles zoom levels and echo selection', () => {
    expect([1, 2, 4, 8].map(nextZoom)).toEqual([2, 4, 8, 1]);
    expect(cycleEchoSelection(null, 3)).toBe(0);
    expect(cycleEchoSelection(1, 3)).toBe(2);
    expect(cycleEchoSelection(2, 3)).toBeNull();
    expect(cycleEchoSelection(null, 0)).toBeNull();
    expect(scrubStep(false)).toBe(60);
    expect(scrubStep(true)).toBe(6);
  });
});

describe('time formatting and ruler', () => {
  it('formats ticks', () => {
    expect(formatTicks(0)).toBe('0:00.0');
    expect(formatTicks(90)).toBe('0:01.5');
    expect(formatTicks(3600)).toBe('1:00.0');
    expect(formatTicks(4530, true)).toBe('1:15.50');
    expect(formatTicks(-10)).toBe('0:00.0');
    expect(formatClock(750)).toBe('00:13');
  });

  it('picks a ruler step that keeps minor ticks apart', () => {
    const vp = computeViewport(3600, 1, 0);
    const step = rulerStep(vp, 1000, 14);
    expect((step * 60 * 1000) / 3600).toBeGreaterThanOrEqual(14);
    expect(rulerStep(computeViewport(3600, 8, 0), 1000, 14)).toBeLessThan(step);
    const ticks = rulerTicks(vp, 1000, 14, 5);
    expect(ticks[0]).toMatchObject({ tick: 0, major: true, label: '00:00' });
    expect(ticks.every((t, i) => i === 0 || t.tick > (ticks[i - 1]?.tick ?? -1))).toBe(true);
    expect(ticks[ticks.length - 1]!.tick).toBeLessThanOrEqual(3600);
    expect(ticks.filter((t) => t.major).every((t) => t.label !== null)).toBe(true);
    expect(ticks.filter((t) => !t.major).every((t) => t.label === null)).toBe(true);
  });
});

describe('track models', () => {
  it('labels nested-loop copies apart from their echo and offsets them to their start tick', () => {
    const tl = fakeTimeline();
    const copy: TimelineTrack = { ...tl.tracks.find((t) => t.actorId === 'echo:2')!, actorId: 'echo:2.1' as TimelineTrack['actorId'], recursion: 1, startTick: 200, planned: [], actual: [], divergences: [] };
    const tracks = buildTrackModels({ ...tl, currentTick: 260, tracks: [...tl.tracks, copy] });
    const c = tracks.find((t) => t.key === 'echo:2.1')!;
    expect(c.recursion).toBe(1);
    expect(c.startTick).toBe(200);
    expect(c.playedTicks).toBe(60);
    // the copy sorts right after its echo
    const keys = tracks.map((t) => t.key);
    expect(keys.indexOf('echo:2.1')).toBe(keys.indexOf('echo:2') + 1);
  });

  it('orders player first then echoes by index and derives marker states', () => {
    const tl = fakeTimeline();
    const tracks = buildTrackModels(tl, { hidden: new Set([4]), selectedEcho: 0 });
    expect(tracks.map((t) => t.key)).toEqual(['player', 'echo:2', 'echo:4']);
    const [player, e1, e2] = tracks as [(typeof tracks)[0], (typeof tracks)[0], (typeof tracks)[0]];
    expect(player.style.shape).toBe('diamond');
    expect(player.markers.map((m) => m.state)).toEqual(['failed']);
    expect(player.playedTicks).toBe(300);
    expect(e1.selected).toBe(true);
    expect(e1.style.badge).toBe('1');
    expect(e1.markers.map((m) => m.state)).toEqual(['done', 'diverged']);
    expect(e1.divergedAt).toBe(250);
    expect(e1.divergences[0]!.title).toMatch(/Paradox: Echo 1/);
    expect(e2.visible).toBe(false);
    // 'none' attempts are omitted; future planned interactions are pending
    expect(e2.markers.map((m) => [m.tick, m.state])).toEqual([
      [100, 'done'],
      [500, 'pending'],
    ]);
    expect(e2.playedTicks).toBe(300);
    expect(e2.markers[0]!.title).toBe('Echo 2 picks up crate at 0:01.7');
  });

  it('every echo has a distinct shape and number (never colour alone)', () => {
    const tl = fakeTimeline();
    for (const palette of ['default', 'highContrast'] as const) {
      const tracks = buildTrackModels(tl, { palette });
      const ids = tracks.map((t) => `${t.style.shape}|${t.style.badge}`);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('signature ignores the live player growth but changes when markers pass the playhead', () => {
    const a = fakeTimeline();
    const b = { ...a, tracks: a.tracks.map((t) => (t.kind === 'player' ? { ...t, durationTicks: 301 } : t)) };
    expect(tracksSignature(buildTrackModels(a), 1, 'default')).toBe(tracksSignature(buildTrackModels(b), 1, 'default'));
    const c = { ...a, currentTick: 600 };
    expect(tracksSignature(buildTrackModels(a), 1, 'default')).not.toBe(tracksSignature(buildTrackModels(c), 1, 'default'));
    expect(tracksSignature(buildTrackModels(a), 1, 'default')).not.toBe(tracksSignature(buildTrackModels(a), 2, 'default'));
  });

  it('builds tracks from a real engine timeline (L03 solution replay)', () => {
    const level = CAMPAIGN_LEVELS[2] ?? CAMPAIGN_LEVELS[0]!;
    const loops = compileSolution(level);
    const game = createGame(level);
    game.setLoops(loops.slice(0, -1));
    playScript(game, [{ op: 'wait', ticks: 400 }]);
    const tracks = buildTrackModels(game.getTimeline());
    expect(tracks[0]!.kind).toBe('player');
    expect(tracks.length).toBe(loops.length);
    const echoMarkers = tracks.slice(1).flatMap((t) => t.markers);
    expect(echoMarkers.length).toBeGreaterThan(0);
    expect(echoMarkers.every((m) => m.tick >= 0 && m.tick < level.loopDurationTicks)).toBe(true);
    expect(echoMarkers.some((m) => m.state === 'done')).toBe(true);
  });
});

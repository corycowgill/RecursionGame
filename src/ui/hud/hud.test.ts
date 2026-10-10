import { describe, expect, it } from 'vitest';
import { HintScheduler } from './hints';
import { OnboardingTracker } from './onboarding';

describe('HintScheduler', () => {
  const hints = [{ text: 'a' }, { text: 'b', afterSeconds: 20 }, { text: 'c', afterSeconds: 90 }];

  it('unlocks hints progressively by time, in order', () => {
    const s = new HintScheduler(hints, { defaultIntervalSec: 10 });
    expect(s.poll()).toBeNull();
    s.advance(0.5);
    for (let i = 0; i < 20; i++) s.advance(0.5); // 10.5 s
    expect(s.poll()?.hint.text).toBe('a');
    expect(s.poll()).toBeNull(); // b needs 20 s
    for (let i = 0; i < 20; i++) s.advance(0.5);
    expect(s.poll()?.index).toBe(1);
    expect(s.revealedHints.map((h) => h.text)).toEqual(['a', 'b']);
  });

  it('unlocks by attempts and clamps huge dt (tab switches)', () => {
    const s = new HintScheduler(hints, { attemptsPerHint: 2 });
    s.advance(500); // clamped to 1 s
    expect(s.elapsedSeconds).toBe(1);
    s.noteAttempt();
    expect(s.poll()).toBeNull();
    s.noteAttempt();
    expect(s.poll()?.hint.text).toBe('a');
    s.noteAttempt();
    s.noteAttempt();
    expect(s.poll()?.hint.text).toBe('b');
  });

  it('can force-reveal and reset', () => {
    const s = new HintScheduler(hints);
    expect(s.revealNext()?.hint.text).toBe('a');
    expect(s.revealNext()?.hint.text).toBe('b');
    expect(s.revealNext()?.hint.text).toBe('c');
    expect(s.revealNext()).toBeNull();
    s.reset();
    expect(s.revealedCount).toBe(0);
  });
});

describe('OnboardingTracker', () => {
  it('walks the Level 1 tutorial on real signals', () => {
    const t = new OnboardingTracker(1);
    expect(t.current?.id).toBe('move');
    expect(t.signal({ type: 'timelineExpanded' })).toBe(false);
    expect(t.signal({ type: 'moved' })).toBe(true);
    expect(t.current?.id).toBe('plate');
    t.signal({ type: 'event', event: { type: 'plateDown', tick: 5, entityId: 'p' } });
    expect(t.current?.id).toBe('rewind');
    t.advance(1000); // no timeout on this step
    expect(t.current?.id).toBe('rewind');
    t.signal({ type: 'event', event: { type: 'echoSpawned', tick: 0, actorId: 'echo:1', loopId: 1, echoIndex: 0 } });
    t.signal({ type: 'event', event: { type: 'levelComplete', tick: 9, levelId: 'L', echoesUsed: 1, ticks: 10 } });
    expect(t.finished).toBe(true);
  });

  it('times out steps that have a timeout, and is empty when disabled or for later levels', () => {
    const t = new OnboardingTracker(2);
    expect(t.current?.id).toBe('timeline');
    for (let i = 0; i < 30; i++) t.advance(1);
    expect(t.current?.id).toBe('scrub');
    expect(new OnboardingTracker(5).finished).toBe(true);
    expect(new OnboardingTracker(1, false).finished).toBe(true);
  });
});

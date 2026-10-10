import { describe, expect, it } from 'vitest';
import type { TemporalLoop } from '../engine/contracts';
import { evaluateCompletion } from '../gameplay/puzzles/completion';
import { CAMPAIGN_LEVELS } from '../levels/definitions';
import {
  DEFAULT_KEYBINDS,
  DEFAULT_SETTINGS,
  MemoryStorage,
  SAVE_KEY,
  SaveStore,
  assignBinding,
  bindingFromEvent,
  bindingLabel,
  defaultKeybinds,
  effectiveVolume,
  migrateSave,
  movementLabel,
  resolveKeyAction,
  sanitizeKeybinds,
  sanitizeSettings,
  type StorageLike,
} from './index';

const level = CAMPAIGN_LEVELS[0]!;

function loop(id: number, n: number): TemporalLoop {
  return {
    id,
    durationTicks: n,
    inputs: Array.from({ length: n }, (_, t) => ({
      tick: t,
      moveX: (t < n / 2 ? 1 : 0) as 0 | 1,
      moveY: 0 as const,
      interactPressed: t === 5,
      interactHeld: t === 5,
      actionPressed: false,
    })),
    outcomes: [{ tick: 5, verb: 'interact', kind: 'pickup', entityId: 'crate1' }],
  };
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

describe('settings', () => {
  it('sanitizes, clamps and defaults', () => {
    const s = sanitizeSettings({ quality: 'insane', masterVolume: 140, sfxVolume: -3, uiScale: 3, reducedMotion: 'yes', echoPalette: 'highContrast' });
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.masterVolume).toBe(100);
    expect(s.sfxVolume).toBe(0);
    expect(s.uiScale).toBe(1.4);
    expect(s.reducedMotion).toBe(false);
    expect(s.echoPalette).toBe('highContrast');
    expect(sanitizeSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(sanitizeSettings({ masterVolume: NaN }).masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });

  it('computes effective channel volume', () => {
    expect(effectiveVolume({ ...DEFAULT_SETTINGS, masterVolume: 50, musicVolume: 50 }, 'music')).toBeCloseTo(0.25);
  });
});

describe('keybinds', () => {
  it('resolves actions with Shift priority', () => {
    const b = defaultKeybinds();
    expect(resolveKeyAction(b, 'KeyR', false)).toBe('rewind');
    expect(resolveKeyAction(b, 'KeyR', true)).toBe('restart');
    expect(resolveKeyAction(b, 'KeyW', true)).toBe('moveUp');
    expect(resolveKeyAction(b, 'ArrowLeft', false)).toBe('moveLeft');
    expect(resolveKeyAction(b, 'Digit3', false)).toBe('echo3');
    expect(resolveKeyAction(b, 'KeyZ', false)).toBeNull();
  });

  it('keeps Escape as a reserved pause key even when rebound', () => {
    const { binds } = assignBinding(defaultKeybinds(), 'pause', 0, 'KeyP');
    expect(resolveKeyAction(binds, 'KeyP', false)).toBe('pause');
    expect(resolveKeyAction(binds, 'Escape', false)).toBe('pause');
  });

  it('assigning a used key moves it and reports the displaced action', () => {
    const before = defaultKeybinds();
    const { binds, displaced } = assignBinding(before, 'interact', 0, 'KeyQ');
    expect(displaced).toBe('preview');
    expect(binds.interact).toEqual(['KeyQ']);
    expect(binds.preview).toEqual([]);
    expect(before.interact).toEqual(['KeyE']); // immutable
    const alt = assignBinding(binds, 'interact', 1, 'KeyF').binds;
    expect(alt.interact).toEqual(['KeyQ', 'KeyF']);
    expect(resolveKeyAction(alt, 'KeyF', false)).toBe('interact');
  });

  it('sanitizes malformed tables (duplicates, junk, missing actions)', () => {
    const b = sanitizeKeybinds({ moveUp: ['KeyW', 'KeyW', 'bad key!', 7], interact: ['KeyW'], bogus: ['KeyX'] });
    expect(b.moveUp).toEqual(['KeyW']);
    expect(b.interact).toEqual([]); // KeyW already owned
    expect(b.rewind).toEqual(DEFAULT_KEYBINDS.rewind);
    expect('bogus' in b).toBe(false);
  });

  it('labels bindings for humans', () => {
    expect(bindingLabel('Shift+KeyR')).toBe('Shift + R');
    expect(bindingLabel('ArrowUp')).toBe('↑');
    expect(bindingLabel('Space')).toBe('Space');
    expect(movementLabel(defaultKeybinds())).toBe('WASD');
    expect(bindingFromEvent('ShiftLeft', true)).toBeNull();
    expect(bindingFromEvent('KeyG', true)).toBe('Shift+KeyG');
  });
});

describe('SaveStore', () => {
  it('starts from defaults and round-trips through storage', () => {
    const storage = new MemoryStorage();
    const a = new SaveStore({ storage });
    expect(a.data.version).toBe(1);
    a.updateSettings({ masterVolume: 30, reducedMotion: true });
    a.setKeybinds(assignBinding(a.data.keybinds, 'interact', 0, 'KeyF').binds);
    a.markTutorialSeen('L01');
    a.markTutorialSeen('L01');
    a.setLastLevel(level.id);
    const b = new SaveStore({ storage });
    expect(b.data.settings.masterVolume).toBe(30);
    expect(b.data.settings.reducedMotion).toBe(true);
    expect(b.data.keybinds.interact).toEqual(['KeyF']);
    expect(b.data.seenTutorials).toEqual(['L01']);
    expect(b.data.lastLevelId).toBe(level.id);
  });

  it('records best results and reports new bests', () => {
    const store = new SaveStore({ storage: new MemoryStorage() });
    const slow = evaluateCompletion(level, 1200, 1);
    const r1 = store.recordResult(slow);
    expect(r1.firstClear).toBe(true);
    const fast = evaluateCompletion(level, 900, 1);
    const r2 = store.recordResult(fast);
    expect(r2.firstClear).toBe(false);
    expect(r2.isNewBestTime).toBe(true);
    expect(r2.isNewBestEchoes).toBe(false);
    const r3 = store.recordResult(evaluateCompletion(level, 2000, 1));
    expect(r3.isNewBestTime).toBe(false);
    expect(r3.record).toMatchObject({ completions: 3, bestTicks: 900, bestEchoes: 1 });
  });

  it('persists echoes with the loop codec and clears them on completion', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore({ storage });
    const loops = [loop(1, 90), loop(2, 37)];
    store.setLevelLoops(level.id, loops);
    const raw = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(raw.loops[level.id][0].runs.length).toBeLessThan(10); // run-length encoded
    const reloaded = new SaveStore({ storage }).getLevelLoops(level.id);
    expect(reloaded).toEqual(loops);
    store.recordResult(evaluateCompletion(level, 500, 2));
    expect(store.getLevelLoops(level.id)).toEqual([]);
  });

  it('survives corrupt JSON and malformed sections without losing valid data', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    const s1 = new SaveStore({ storage });
    expect(s1.data.progress.records).toEqual({});
    expect(s1.lastError).toMatch(/Corrupt/);

    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        progress: { records: { good: { completions: 2, bestTicks: 600, bestEchoes: 1, bestStars: 3 }, bad: { completions: 'x' } } },
        settings: 'garbage',
        keybinds: { interact: ['KeyF'] },
        loops: { good: [{ v: 1, id: 1, durationTicks: 10, runs: [5, 21], outcomes: [] }] }, // 5 != 10 -> dropped
      }),
    );
    const s2 = new SaveStore({ storage });
    expect(Object.keys(s2.data.progress.records)).toEqual(['good']);
    expect(s2.data.settings).toEqual({ ...DEFAULT_SETTINGS });
    expect(s2.data.keybinds.interact).toEqual(['KeyF']);
    expect(s2.data.loops).toEqual({});
  });

  it('migrates a versionless prototype save', () => {
    const m = migrateSave({ progress: { records: { L: { completions: 1, bestTicks: 100, bestEchoes: 0, bestStars: 2 } } }, settings: { sfxVolume: 10 } });
    expect(m.version).toBe(1);
    expect(m.progress.records['L']?.bestStars).toBe(2);
    expect(m.settings.sfxVolume).toBe(10);
    expect(m.keybinds).toEqual(defaultKeybinds());
  });

  it('falls back to memory when storage throws', () => {
    const store = new SaveStore({ storage: new ThrowingStorage() });
    expect(store.persistent).toBe(false);
    store.updateSettings({ musicVolume: 5 });
    expect(store.data.settings.musicVolume).toBe(5);
    expect(store.save()).toBe(true); // now writing to memory
    expect(store.load().settings.musicVolume).toBe(5);
  });

  it('uses the in-memory fallback when no localStorage exists (node)', () => {
    const store = new SaveStore();
    expect(store.persistent).toBe(false);
    store.updateSettings({ uiScale: 1.2 });
    expect(store.data.settings.uiScale).toBe(1.2);
  });

  it('notifies subscribers and resets progress but keeps settings', () => {
    const store = new SaveStore({ storage: new MemoryStorage() });
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.updateSettings({ quality: 'low' });
    store.recordResult(evaluateCompletion(level, 500, 1));
    store.reset();
    off();
    store.updateSettings({ quality: 'ultra' });
    expect(calls).toBe(3);
    expect(store.data.progress.records).toEqual({});
    expect(store.data.settings.quality).toBe('ultra');
  });
});

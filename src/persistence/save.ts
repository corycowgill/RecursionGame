import type { TemporalLoop } from '../engine/contracts';
import { decodeLoop, encodeLoop, type EncodedLoop } from '../engine/temporal/loops';
import type { CompletionResult } from '../gameplay/puzzles/completion';
import { emptyProgress, recordCompletion, type CampaignProgress, type LevelRecord } from '../levels/progression';
import { defaultPadBindings, sanitizePadBindings, type PadBindings } from '../engine/input/gamepadBindings';
import { defaultKeybinds, sanitizeKeybinds, type KeyBindings } from './keybinds';
import { defaultSettings, sanitizeSettings, type Settings } from './settings';
import { MemoryStorage, detectLocalStorage, type StorageLike } from './storage';

/**
 * VERSIONED SAVE GAME (localStorage, key SAVE_KEY).
 *
 *   { version: 1, progress, settings, keybinds, seenTutorials[], loops{levelId: EncodedLoop[]}, lastLevelId }
 *
 * - Every read/write is wrapped in try/catch; on failure the store keeps working in memory (`persistent=false`).
 * - Loading never throws: corrupt JSON or malformed sections fall back to defaults section-by-section, so one bad
 *   field never wipes the player's progress.
 * - Older versions are migrated in `migrateSave`; a newer unknown version is read best-effort (forward compat).
 * - In-progress echoes are stored with the engine's run-length loop codec (encodeLoop/decodeLoop).
 */

export const SAVE_KEY = 'recursion.save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: typeof SAVE_VERSION;
  progress: CampaignProgress;
  settings: Settings;
  keybinds: KeyBindings;
  /** Gamepad button bindings (round 3, additive; older saves get the defaults). */
  padbinds: PadBindings;
  /** Onboarding sequences already completed (e.g. "L01"). */
  seenTutorials: string[];
  /** Committed echoes per level, so "Continue" can resume a half-solved chamber. */
  loops: Record<string, EncodedLoop[]>;
  lastLevelId: string | null;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    progress: emptyProgress(),
    settings: defaultSettings(),
    keybinds: defaultKeybinds(),
    padbinds: defaultPadBindings(),
    seenTutorials: [],
    loops: {},
    lastLevelId: null,
  };
}

function isInt(v: unknown, min = 0): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min;
}

function sanitizeRecord(raw: unknown): LevelRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isInt(r['completions'], 1) || !isInt(r['bestTicks'], 1) || !isInt(r['bestEchoes'])) return null;
  const stars = r['bestStars'];
  return {
    completions: r['completions'],
    bestTicks: r['bestTicks'],
    bestEchoes: r['bestEchoes'],
    bestStars: stars === 3 ? 3 : stars === 2 ? 2 : 1,
  };
}

function sanitizeProgress(raw: unknown): CampaignProgress {
  const out = emptyProgress();
  const recs = raw && typeof raw === 'object' ? (raw as { records?: unknown }).records : null;
  if (!recs || typeof recs !== 'object') return out;
  for (const [id, rec] of Object.entries(recs as Record<string, unknown>)) {
    const clean = sanitizeRecord(rec);
    if (clean && id.length > 0 && id.length < 128) out.records[id] = clean;
  }
  return out;
}

/**
 * Upper bound for a stored loop: 10 minutes at 60 Hz, far above any chamber's loopDurationTicks. Rejects corrupt or
 * hand-edited saves BEFORE decoding them (a 60-byte entry claiming 2e9 ticks would otherwise allocate billions of
 * inputs on load and crash the tab — QA finding).
 */
export const MAX_SAVED_LOOP_TICKS = 60 * 60 * 10;

function sanitizeEncodedLoop(raw: unknown): EncodedLoop | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (l['v'] !== 1 || !isInt(l['id']) || !isInt(l['durationTicks'], 1)) return null;
  if ((l['durationTicks'] as number) > MAX_SAVED_LOOP_TICKS) return null;
  if (!Array.isArray(l['runs']) || !l['runs'].every((n) => isInt(n))) return null;
  if (!Array.isArray(l['outcomes'])) return null;
  const enc = l as unknown as EncodedLoop;
  try {
    decodeLoop(enc); // validates run lengths against durationTicks
  } catch {
    return null;
  }
  return enc;
}

function sanitizeLoops(raw: unknown): Record<string, EncodedLoop[]> {
  const out: Record<string, EncodedLoop[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const clean = list.map(sanitizeEncodedLoop).filter((l): l is EncodedLoop => l !== null);
    if (clean.length) out[id] = clean;
  }
  return out;
}

/** Migrates any parsed save object to the current version. Never throws. */
export function migrateSave(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return defaultSave();
  const r = raw as Record<string, unknown>;
  // v0 (pre-release prototype): { progress, settings } without version/keybinds. Same field names, so the
  // section sanitizers below cover it; future versions add explicit steps here.
  return {
    version: SAVE_VERSION,
    progress: sanitizeProgress(r['progress']),
    settings: sanitizeSettings(r['settings']),
    keybinds: r['keybinds'] === undefined ? defaultKeybinds() : sanitizeKeybinds(r['keybinds']),
    padbinds: r['padbinds'] === undefined ? defaultPadBindings() : sanitizePadBindings(r['padbinds']),
    seenTutorials: Array.isArray(r['seenTutorials'])
      ? [...new Set(r['seenTutorials'].filter((s): s is string => typeof s === 'string'))]
      : [],
    loops: sanitizeLoops(r['loops']),
    lastLevelId: typeof r['lastLevelId'] === 'string' ? r['lastLevelId'] : null,
  };
}

export type SaveListener = (data: Readonly<SaveData>) => void;

export interface SaveStoreOptions {
  /** Explicit backend (tests). Default: localStorage if usable, else memory. */
  storage?: StorageLike;
  key?: string;
}

export class SaveStore {
  private storage: StorageLike;
  private readonly key: string;
  private current: SaveData;
  private readonly listeners = new Set<SaveListener>();
  /** False when running on the in-memory fallback (nothing survives a reload). */
  persistent: boolean;
  /** Last storage error (for a settings-screen notice), or null. */
  lastError: string | null = null;

  constructor(opts: SaveStoreOptions = {}) {
    this.key = opts.key ?? SAVE_KEY;
    const backend = opts.storage ?? detectLocalStorage();
    this.storage = backend ?? new MemoryStorage();
    this.persistent = backend !== null;
    this.current = this.load();
  }

  get data(): Readonly<SaveData> {
    return this.current;
  }

  /** Reads and migrates the stored save (defaults if missing or corrupt). */
  load(): SaveData {
    let text: string | null = null;
    try {
      text = this.storage.getItem(this.key);
    } catch (err) {
      this.fallBack(err);
    }
    if (text === null) return (this.current = defaultSave());
    try {
      this.current = migrateSave(JSON.parse(text));
    } catch (err) {
      this.lastError = `Corrupt save ignored: ${String(err)}`;
      this.current = defaultSave();
    }
    return this.current;
  }

  /** Writes the current save. Returns false if the write failed (the in-memory copy stays authoritative). */
  save(): boolean {
    const text = JSON.stringify(this.current);
    try {
      this.storage.setItem(this.key, text);
      return true;
    } catch (err) {
      this.fallBack(err);
      try {
        this.storage.setItem(this.key, text);
      } catch {
        /* memory storage never throws */
      }
      return false;
    }
  }

  subscribe(fn: SaveListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Applies an immutable update, persists and notifies. */
  update(fn: (d: SaveData) => SaveData): Readonly<SaveData> {
    this.current = migrateSave(fn(this.current));
    this.save();
    for (const l of this.listeners) l(this.current);
    return this.current;
  }

  updateSettings(patch: Partial<Settings>): Settings {
    return this.update((d) => ({ ...d, settings: sanitizeSettings({ ...d.settings, ...patch }) })).settings;
  }

  setKeybinds(binds: KeyBindings): KeyBindings {
    return this.update((d) => ({ ...d, keybinds: sanitizeKeybinds(binds) })).keybinds;
  }

  setPadBindings(binds: PadBindings): PadBindings {
    return this.update((d) => ({ ...d, padbinds: sanitizePadBindings(binds) })).padbinds;
  }

  /** Records a completion (keeps best results), clears saved loops for the level. Returns the new record. */
  recordResult(result: CompletionResult): { record: LevelRecord; isNewBestTime: boolean; isNewBestEchoes: boolean; firstClear: boolean } {
    const prev = this.current.progress.records[result.levelId];
    const d = this.update((s) => {
      const loops = { ...s.loops };
      delete loops[result.levelId];
      return { ...s, progress: recordCompletion(s.progress, result), loops };
    });
    const record = d.progress.records[result.levelId] as LevelRecord;
    return {
      record,
      firstClear: !prev,
      isNewBestTime: !prev || result.ticks < prev.bestTicks,
      isNewBestEchoes: !prev || result.echoesUsed < prev.bestEchoes,
    };
  }

  setLastLevel(levelId: string): void {
    this.update((d) => ({ ...d, lastLevelId: levelId }));
  }

  /** Stores the committed echoes of a level (empty list clears them). */
  setLevelLoops(levelId: string, loops: readonly TemporalLoop[]): void {
    this.update((d) => {
      const next = { ...d.loops };
      if (loops.length) next[levelId] = loops.map(encodeLoop);
      else delete next[levelId];
      return { ...d, loops: next };
    });
  }

  /** Decoded echoes for a level ([] if none or undecodable). */
  getLevelLoops(levelId: string): TemporalLoop[] {
    const list = this.current.loops[levelId];
    if (!list) return [];
    try {
      return list.map(decodeLoop);
    } catch {
      return [];
    }
  }

  markTutorialSeen(id: string): void {
    if (this.current.seenTutorials.includes(id)) return;
    this.update((d) => ({ ...d, seenTutorials: [...d.seenTutorials, id] }));
  }

  /** Wipes progress (keeps settings and keybinds unless `everything`). */
  reset(everything = false): void {
    this.update((d) => (everything ? defaultSave() : { ...defaultSave(), settings: d.settings, keybinds: d.keybinds, padbinds: d.padbinds }));
  }

  private fallBack(err: unknown): void {
    this.lastError = `Storage unavailable: ${String(err)}`;
    if (this.storage instanceof MemoryStorage) return;
    this.storage = new MemoryStorage();
    this.persistent = false;
  }
}

import type { LevelDefinition, SimView, Timeline } from '../engine/contracts';
import type { InteractionPrompt } from '../gameplay/interactions/targeting';
import type { CompletionResult } from '../gameplay/puzzles/completion';
import type { ObjectiveStatus } from '../gameplay/puzzles/objectives';
import type { KeyBindings } from '../persistence/keybinds';
import type { Settings } from '../persistence/settings';

/**
 * UI → app intents. The UI never touches the simulation; the director maps these to TemporalGame calls.
 * Every callback is optional so the UI can be previewed with mocks.
 */
export interface UICallbacks {
  /** Main menu "Continue". */
  onContinue?(): void;
  /** Level select / next / replay. */
  onStartLevel?(levelId: string): void;
  onResume?(): void;
  /** Shift+R equivalent (drop all echoes, rewind). */
  onRestart?(): void;
  /** Discard the current recording, keep echoes, rewind (timeline REWIND button). */
  onResetLoop?(): void;
  /** End the recording and create an echo (timeline RECORD button = R). */
  onCommitEcho?(): void;
  /** Timeline PLAY/PAUSE button. */
  onTogglePause?(): void;
  onDeleteLoop?(echoIndex: number): void;
  /** Scrub preview requested at a tick (director shows game.getSnapshotAt(tick)). */
  onScrub?(tick: number): void;
  /** Scrubbing ended; return to the live state. */
  onScrubEnd?(): void;
  onToggleEchoVisibility?(echoIndex: number, visible: boolean, loopId: number | null): void;
  /** Echo selection changed (null = none). */
  onSelectEcho?(echoIndex: number | null): void;
  onTimelineToggle?(expanded: boolean): void;
  onSettingsChange?(settings: Settings): void;
  onKeybindsChange?(binds: KeyBindings): void;
  /** Level intro dismissed: start simulating. */
  onIntroDone?(): void;
  onNextLevel?(): void;
  onReplayLevel?(): void;
  onQuitToMenu?(): void;
  /** Settings "Reset progress" (confirmed). */
  onResetProgress?(): void;
  /** An onboarding sequence finished or was skipped (persist with SaveStore.markTutorialSeen). */
  onTutorialComplete?(tutorialId: string): void;
  /** Any UI sound cue (hover/confirm/back) for the audio module. */
  onUISound?(cue: 'hover' | 'confirm' | 'back' | 'toggle' | 'error'): void;
  /**
   * Fresh level-select entries from current progress. Used when level select opens from the pause menu or the
   * level-complete card, so it never shows the progress cached when the main menu was last built (QA fix).
   */
  getLevelEntries?(): LevelEntry[];
}

/** Per-frame data for the HUD + timeline. All read-only; the UI keeps no gameplay state. */
export interface UIFrame {
  level: LevelDefinition;
  state: SimView;
  timeline: Timeline;
  paused?: boolean;
  /** predictInteraction(level, state) — context prompt. */
  prompt?: InteractionPrompt | null;
  /** getObjectiveStatus(level, state) — objective panel. */
  objective?: ObjectiveStatus | null;
  /** Tick being previewed (scrub/temporal preview) or null for live. */
  previewTick?: number | null;
  /** Real seconds since the last update (drives hints/onboarding timers only). */
  dt?: number;
}

export type LevelStatus = 'locked' | 'unlocked' | 'completed';

export interface LevelEntry {
  id: string;
  order: number;
  name: string;
  subtitle?: string;
  status: LevelStatus;
  /** First unlocked-but-uncompleted level (highlighted). */
  isNext: boolean;
  maxEchoes: number;
  parTimeSeconds: number;
  best?: { ticks: number; echoes: number; stars: 1 | 2 | 3 } | null;
}

export interface MainMenuData {
  /** Continue target (null hides Continue). */
  continueLevel?: { id: string; order: number; name: string } | null;
  levels: LevelEntry[];
  totalStars: number;
  maxStars: number;
  version?: string;
  /** False when saving is unavailable (shows a notice). */
  persistent?: boolean;
}

export interface LevelCompleteStats {
  result: CompletionResult;
  levelName: string;
  levelOrder: number;
  hasNext: boolean;
  isNewBestTime?: boolean;
  isNewBestEchoes?: boolean;
  firstClear?: boolean;
  best?: { ticks: number; echoes: number } | null;
}

export interface PauseData {
  levelName: string;
  levelOrder: number;
  echoesUsed: number;
  maxEchoes: number;
  attempts?: number;
}
